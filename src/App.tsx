import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Dialog, Popup } from 'tdesign-mobile-react';
import {
  ArrowDownUp,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  HardDrive,
  Download,
  Footprints,
  Globe2,
  Layers2,
  Map as MapIcon,
  MapPin,
  Plus,
  Route as RouteIcon,
  Settings2,
  ShieldCheck,
  Sparkles,
  Ticket,
  TrainFront,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { cities } from './data';
import { createNetwork, findRoute, routeGroups } from './lib/network';
import {
  downloadBackup,
  getProgress,
  mergeBackups,
  readSavedData,
  removeStationLighting,
  STORAGE_KEY,
  validateBackup,
} from './lib/storage';
import type { Journey, Route, SavedData, Station } from './types';
import MetroMap from './components/MetroMap';
import StationPicker from './components/StationPicker';

type Page = 'map' | 'journal' | 'lines';
const nav = [
  { id: 'map' as const, label: '探索地图', icon: MapIcon },
  { id: 'journal' as const, label: '我的足迹', icon: Footprints },
  { id: 'lines' as const, label: '线路收藏', icon: Layers2 },
];

function Skyline({ city }: { city: string }) {
  return (
    <svg className="skyline" viewBox="0 0 250 135" fill="none" aria-hidden="true">
      <circle cx="167" cy="42" r="31" fill="#e7ecfc" />
      <path d="M5 119H245" stroke="currentColor" strokeWidth="1.5" />
      {city === 'shanghai' ? (
        <g stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
          <path d="M25 118V82H48V118M31 89H41M31 95H41M31 101H41M58 118V74H83V118M63 81H76M63 89H76M63 97H76M143 118V51L157 43L169 51V118M149 63H163M149 72H163M149 81H163M149 90H163M185 118V20L205 10L216 118M185 29L204 20L207 49H185M194 59V108M231 118V84H244V118" />
          <path d="M104 5V35M104 51V82M99 95L91 118M109 95L118 118M104 94V117M96 66H112" />
          <circle cx="104" cy="43" r="10" fill="#f5f7ff" />
          <circle cx="104" cy="88" r="7" fill="#f5f7ff" />
          <path d="M93 44H115M97 87H111" />
        </g>
      ) : (
        <g stroke="currentColor" strokeWidth="1.5">
          <path d="M23 118V80H50V118M65 118V74H182V118M58 74L76 60H172L190 74M84 60V45H165V60M77 45L92 31H157L174 45M115 31V21H135V31M111 21H138M77 88H170M81 89V111M101 89V111M122 89V118M143 89V111M164 89V111M199 118V44L216 20L230 118M200 57H220M201 72H222" />
        </g>
      )}
      <path d="M0 129H250" stroke="currentColor" strokeDasharray="3 5" opacity=".4" />
    </svg>
  );
}

export default function App() {
  const [initial] = useState(() => readSavedData(cities));
  const showInspiration = !Object.values(initial.data.cities).some((records) => records.length > 0);
  const [saved, setSaved] = useState<SavedData>(initial.data);
  const [storageError, setStorageError] = useState(initial.error);
  const [cityId, setCityId] = useState(cities[0].id);
  const [page, setPage] = useState<Page>('map');
  const [cityOpen, setCityOpen] = useState(false),
    [settingsOpen, setSettingsOpen] = useState(false),
    [helpOpen, setHelpOpen] = useState(false),
    [lineOpen, setLineOpen] = useState(false);
  const [from, setFrom] = useState(''),
    [to, setTo] = useState(''),
    [via, setVia] = useState<string[]>([]);
  const [preference, setPreference] = useState<'balanced' | 'transfers'>('balanced');
  const [preview, setPreview] = useState<Route | null>(null),
    [routeError, setRouteError] = useState('');
  const [focusStation, setFocusStation] = useState<string | null>(null),
    [activeLine, setActiveLine] = useState<string | null>(null),
    [exploredOnly, setExploredOnly] = useState(true);
  const [toast, setToast] = useState<{ text: string; undoId?: string } | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [journeyDetail, setJourneyDetail] = useState<Journey | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const planner = useRef<HTMLElement>(null);
  const city = cities.find((c) => c.id === cityId)!;
  const network = useMemo(() => createNetwork(city), [city]);
  const journeys = saved.cities[city.id] ?? [];
  const progress = useMemo(() => getProgress(journeys), [journeys]);
  const manualStationIds = useMemo(
    () => new Set(journeys.filter((j) => j.kind === 'station').map((j) => j.stationIds[0])),
    [journeys],
  );
  const percentage = ((progress.stations.size / city.stations.length) * 100).toFixed(1);
  const trips = journeys.filter((j) => j.kind === 'trip');
  const displayName = (id: string) => network.stationById.get(id)?.name ?? id;
  const suggestion = useMemo(() => {
    const preferred =
      city.id === 'shanghai'
        ? ['人民广场', '陆家嘴']
        : city.id === 'beijing'
          ? ['天安门东', '环球度假区']
          : [];
    const line = city.lines[0];
    const start = city.stations.find((s) => s.name === preferred[0])?.id ?? line.stationIds[0];
    const end =
      city.stations.find((s) => s.name === preferred[1])?.id ??
      line.stationIds[Math.min(4, line.stationIds.length - 1)];
    return { start, end };
  }, [city]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 5500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const sync = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        try {
          setSaved(validateBackup(JSON.parse(e.newValue), cities));
          setStorageError(null);
        } catch {
          setStorageError('另一个页面的记录无法读取，请检查备份。');
        }
      }
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);

  const commit = (next: SavedData, allowRecovery = false) => {
    if (initial.error && storageError && !allowRecovery) {
      setToast({ text: '原始记录无法读取，请先在数据管理中导出并恢复备份。' });
      return false;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setSaved(next);
      setStorageError(null);
      return true;
    } catch {
      setStorageError('保存失败：浏览器存储不可用或已满。请导出备份，释放空间后重试。');
      setToast({ text: '未能保存记录，请检查浏览器存储空间。' });
      return false;
    }
  };
  const addJourney = (journey: Journey) =>
    commit({ ...saved, cities: { ...saved.cities, [cityId]: [journey, ...journeys] } });
  const removeJourney = (id: string) => {
    if (
      commit({
        ...saved,
        cities: { ...saved.cities, [cityId]: journeys.filter((j) => j.id !== id) },
      })
    )
      setToast({ text: '记录已撤销，相关足迹已重新计算' });
    setDeleteId(null);
  };
  const invalidate = () => {
    setPreview(null);
    setRouteError('');
  };
  const changeCity = (id: string) => {
    setCityId(id);
    setFrom('');
    setTo('');
    setVia([]);
    invalidate();
    setActiveLine(null);
    setFocusStation(null);
    setCityOpen(false);
    setJourneyDetail(null);
    setToast(null);
  };
  const setEndpoint = (id: string, kind: 'from' | 'to') => {
    kind === 'from' ? setFrom(id) : setTo(id);
    invalidate();
    setPage('map');
    planner.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };
  const lightStation = (s: Station) => {
    if (progress.stations.get(s.id)?.visited) {
      setToast({ text: `${s.name}已经点亮，上下车足迹已记录` });
      return;
    }
    const journey: Journey = {
      id: crypto.randomUUID(),
      kind: 'station',
      createdAt: new Date().toISOString(),
      stationIds: [s.id],
      segmentIds: [],
      lineIds: [],
      transferIds: [],
    };
    if (addJourney(journey))
      setToast({ text: `已点亮「${s.name}」· 未点亮区间`, undoId: journey.id });
  };
  const unlightStation = (s: Station) => {
    const remaining = removeStationLighting(journeys, s.id);
    if (remaining.length === journeys.length) return;
    if (commit({ ...saved, cities: { ...saved.cities, [cityId]: remaining } })) {
      const hasJourney = getProgress(remaining).stations.has(s.id);
      setToast({
        text: `已取消「${s.name}」的单站点亮${hasJourney ? '，行程足迹已保留' : ''}`,
      });
    }
  };
  const planRoute = (start = from, end = to, waypoints = via) => {
    if (!start || !end) {
      setRouteError('请先选择上车站和下车站。');
      return;
    }
    if (start === end) {
      setRouteError('上车站与下车站不能相同，可以点击地图单独点亮此站。');
      return;
    }
    if (waypoints.some((id) => !id)) {
      setRouteError('请选择换乘站，或移除空白的换乘项。');
      return;
    }
    const route = findRoute(network, start, end, waypoints, preference);
    if (!route) {
      setRouteError('未找到符合换乘要求的通路，请检查换乘站及其顺序。');
      setPreview(null);
      return;
    }
    setRouteError('');
    setActiveLine(null);
    setPreview(route);
  };
  const confirmRoute = () => {
    if (!preview) return;
    const journey: Journey = {
      ...preview,
      id: crypto.randomUUID(),
      kind: 'trip',
      createdAt: new Date().toISOString(),
    };
    if (addJourney(journey)) {
      setToast({
        text: `旅程已收集！点亮 ${preview.stationIds.length} 站、${preview.segmentIds.length} 个区间`,
        undoId: journey.id,
      });
      setPreview(null);
      setFrom('');
      setTo('');
      setVia([]);
    }
  };
  const useSuggestion = () => {
    const a = suggestion.start,
      b = suggestion.end;
    setFrom(a);
    setTo(b);
    setVia([]);
    planRoute(a, b, []);
    planner.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };
  const importBackup = async (file: File) => {
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error('备份文件不得超过 10 MB');
      const imported = validateBackup(JSON.parse(await file.text()), cities);
      const next = mergeBackups(saved, imported);
      if (commit(next, true)) setToast({ text: '备份已恢复，与现有记录合并完成' });
    } catch (e) {
      setToast({ text: e instanceof Error ? e.message : '备份读取失败，请检查文件格式' });
    }
  };
  const exportBackup = () => {
    if (initial.error && storageError) {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const blob = new Blob([raw], { type: 'application/json' }),
            url = URL.createObjectURL(blob),
            a = document.createElement('a');
          a.href = url;
          a.download = 'MetroListo-original-recovery.json';
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          return;
        }
      } catch {
        setToast({ text: '浏览器拒绝读取原始记录' });
        return;
      }
    }
    downloadBackup(saved);
    setToast({ text: '备份文件已导出' });
  };
  const shortDate = (date: string) =>
    new Date(date).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand-mark"
          href="#"
          aria-label="全地铁首页"
          onClick={(e) => {
            e.preventDefault();
            setPage('map');
          }}
        >
          <img src="/favicon.svg" alt="" />
        </a>
        <div className="sidebar-nav">
          {nav.map((item) => (
            <button
              key={item.id}
              className={page === item.id ? 'nav-item selected' : 'nav-item'}
              onClick={() => setPage(item.id)}
            >
              <item.icon size={21} strokeWidth={1.7} />
              <span>{item.label}</span>
              {page === item.id && <i />}
            </button>
          ))}
        </div>
        <div className="sidebar-bottom">
          <button className="nav-item" onClick={() => setHelpOpen(true)}>
            <CircleHelp size={21} />
            <span>使用指南</span>
          </button>
          <button className="nav-item" onClick={() => setSettingsOpen(true)}>
            <Settings2 size={21} />
            <span>数据管理</span>
          </button>
          <span className="sidebar-dot" />
        </div>
      </aside>
      <div className="app-main">
        <header className="topbar">
          <div className="wordmark">
            全地铁
            <span>
              MetroListo<span className="brand-period">.</span>
            </span>
          </div>
          <div className="topbar-divider" />
          <button className="city-select" onClick={() => setCityOpen(true)}>
            <MapPin size={15} />
            <strong>{city.name}</strong>
            <ChevronDown size={14} />
          </button>
          <div className="topbar-right">
            <span className="local-status">
              <span className={`live-dot ${storageError ? 'error' : ''}`} />
              {storageError ? '存储异常' : '足迹保存在此设备'}
            </span>
            <button
              className="icon-button"
              aria-label="导出足迹备份"
              title="导出备份"
              onClick={exportBackup}
            >
              <Download size={18} />
            </button>
            <button
              className="avatar"
              aria-label="打开数据管理"
              onClick={() => setSettingsOpen(true)}
            >
              M<span />
            </button>
          </div>
        </header>
        <main className="content">
          <section className="intro">
            <div className="intro-copy">
              <div className="eyebrow">
                <span /> YOUR CITY, YOUR STORY
              </div>
              <h1>
                {page === 'map' ? (
                  <>
                    下一站，<span>点亮城市。</span>
                  </>
                ) : page === 'journal' ? (
                  <>
                    走过的路，<span>都有记录。</span>
                  </>
                ) : (
                  <>
                    一条线路，<span>一种风景。</span>
                  </>
                )}
              </h1>
              <p>
                {page === 'map'
                  ? '把日常的通勤，变成一场城市探索。'
                  : page === 'journal'
                    ? '每一次出发，都是你与这座城市的独家记忆。'
                    : '收集属于你的城市色彩，让每条线路都留下足迹。'}
              </p>
            </div>
            <div className="overview-stats">
              <div className="overview-stat">
                <span>
                  <MapPin size={14} /> 点亮站点
                </span>
                <strong>
                  {progress.stations.size}
                  <small> / {city.stations.length}</small>
                </strong>
                <div className="mini-meter">
                  <i style={{ width: `${percentage}%` }} />
                </div>
              </div>
              <div className="overview-stat">
                <span>
                  <RouteIcon size={14} /> 走过区间
                </span>
                <strong>
                  {progress.segments.size}
                  <small> / {city.segments.length}</small>
                </strong>
                <div className="mini-meter mint">
                  <i
                    style={{ width: `${(progress.segments.size / city.segments.length) * 100}%` }}
                  />
                </div>
              </div>
              <div className="overview-stat">
                <span>
                  <Ticket size={14} /> 记录旅程
                </span>
                <strong>
                  {trips.length}
                  <small> 次出发</small>
                </strong>
                <span className="stat-caption">下一段旅程，等你出发</span>
              </div>
            </div>
          </section>
          {storageError && (
            <div className="storage-warning" role="alert">
              {storageError}
              <button onClick={() => setSettingsOpen(true)}>
                管理备份 <ArrowRight size={14} />
              </button>
            </div>
          )}
          {page === 'map' ? (
            <div className="explore-layout">
              <section className="map-card">
                <div className="map-toolbar">
                  <div className="map-tabs">
                    <button
                      className={exploredOnly ? 'active' : ''}
                      aria-pressed={exploredOnly}
                      onClick={() => setExploredOnly(true)}
                    >
                      <Footprints size={15} />
                      我的足迹
                    </button>
                    <button
                      className={!exploredOnly ? 'active' : ''}
                      aria-pressed={!exploredOnly}
                      onClick={() => setExploredOnly(false)}
                    >
                      <Globe2 size={15} />
                      城市线网
                    </button>
                  </div>
                  <div className="map-toolbar-right">
                    <StationPicker
                      network={network}
                      value=""
                      label="搜索地图站点"
                      placeholder="搜索站点、发现下一站"
                      variant="search"
                      onChange={(id) => {
                        setFocusStation(id);
                        setActiveLine(null);
                      }}
                    />
                    <button
                      className={`line-filter ${activeLine ? 'active' : ''}`}
                      onClick={() => setLineOpen(true)}
                      aria-label="筛选地铁线路"
                    >
                      <Layers2 size={16} />
                      <span>{activeLine ? network.lineById.get(activeLine)?.name : '线路'}</span>
                      <ChevronDown size={12} />
                    </button>
                  </div>
                </div>
                {activeLine && (
                  <div className="active-filter">
                    <span style={{ background: network.lineById.get(activeLine)!.color }} />
                    {network.lineById.get(activeLine)!.name}
                    <button onClick={() => setActiveLine(null)}>
                      <X size={13} />
                      显示全部线路
                    </button>
                  </div>
                )}
                <MetroMap
                  key={city.id}
                  network={network}
                  progress={progress}
                  route={preview}
                  activeLine={activeLine}
                  exploredOnly={exploredOnly}
                  focusStation={focusStation}
                  onStation={lightStation}
                  manualStationIds={manualStationIds}
                  onUnlightStation={unlightStation}
                  onSetEndpoint={setEndpoint}
                />
                <div className="map-legend">
                  <span className="legend-title">足迹图例</span>
                  <span>
                    <i className="legend-dot unvisited" />
                    未点亮
                  </span>
                  <span>
                    <i className="legend-dot passed" />
                    途经过
                  </span>
                  <span>
                    <i className="legend-dot transfer" />
                    换乘过
                  </span>
                  <span>
                    <i className="legend-dot visited" />
                    上下车过
                  </span>
                  <span className="legend-section">
                    <i />
                    已乘区间
                  </span>
                  <button onClick={() => setHelpOpen(true)} aria-label="查看点亮规则">
                    <CircleHelp size={15} />
                  </button>
                </div>
                <div className="line-strip">
                  {city.lines.map((l) => (
                    <button
                      title={l.name}
                      key={l.id}
                      className={activeLine === l.id ? 'active' : ''}
                      onClick={() => {
                        setActiveLine(activeLine === l.id ? null : l.id);
                        setPreview(null);
                      }}
                    >
                      <i style={{ background: l.color }} />
                      {l.shortName}
                    </button>
                  ))}
                </div>
              </section>
              <aside className="right-column">
                <section className="planner-card" ref={planner}>
                  <div className="panel-heading">
                    <span className="panel-icon">
                      <RouteIcon size={20} />
                    </span>
                    <div>
                      <h2>记录一段旅程</h2>
                      <p>从出发，到抵达，都值得被记住</p>
                    </div>
                    <span className="small-sparkle">✳</span>
                  </div>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      planRoute();
                    }}
                  >
                    <div className="route-inputs">
                      <div className="route-field">
                        <i className="endpoint-dot start" />
                        <div className="field-body">
                          <label>上车站</label>
                          <StationPicker
                            network={network}
                            value={from}
                            onChange={(id) => {
                              setFrom(id);
                              invalidate();
                            }}
                            label="上车站"
                            placeholder="从哪一站出发？"
                          />
                        </div>
                      </div>
                      <button
                        type="button"
                        className="swap-stations"
                        aria-label="交换上车站和下车站"
                        onClick={() => {
                          setFrom(to);
                          setTo(from);
                          setVia([...via].reverse());
                          invalidate();
                        }}
                      >
                        <ArrowDownUp size={16} />
                      </button>
                      {via.map((id, i) => (
                        <div className="route-field via-field" key={i}>
                          <i className="endpoint-dot via" />
                          <div className="field-body">
                            <label>换乘站 {i + 1}</label>
                            <StationPicker
                              network={network}
                              value={id}
                              transferOnly
                              onChange={(next) => {
                                setVia((v) => v.map((s, j) => (j === i ? next : s)));
                                invalidate();
                              }}
                              label={`换乘站${i + 1}`}
                              placeholder="选择换乘站点"
                            />
                          </div>
                          <button
                            type="button"
                            className="remove-via"
                            aria-label={`移除换乘站${i + 1}`}
                            onClick={() => {
                              setVia((v) => v.filter((_, j) => j !== i));
                              invalidate();
                            }}
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                      <div className="route-field">
                        <i className="endpoint-dot end" />
                        <div className="field-body">
                          <label>下车站</label>
                          <StationPicker
                            network={network}
                            value={to}
                            onChange={(id) => {
                              setTo(id);
                              invalidate();
                            }}
                            label="下车站"
                            placeholder="想在哪一站停下？"
                          />
                        </div>
                      </div>
                    </div>
                    <div className="planner-options">
                      <button
                        type="button"
                        className="text-button"
                        disabled={via.length >= 3}
                        onClick={() => {
                          setVia([...via, '']);
                          invalidate();
                        }}
                      >
                        <Plus size={14} />
                        添加换乘站<span>选填</span>
                      </button>
                      <select
                        aria-label="路径偏好"
                        value={preference}
                        onChange={(e) => {
                          setPreference(e.target.value as typeof preference);
                          invalidate();
                        }}
                      >
                        <option value="balanced">综合推荐</option>
                        <option value="transfers">换乘最少</option>
                      </select>
                    </div>
                    {routeError && (
                      <p className="form-error" role="alert">
                        {routeError}
                      </p>
                    )}
                    {!preview && (
                      <Button
                        block
                        theme="primary"
                        type="submit"
                        className="plan-button"
                        icon={<RouteIcon size={17} />}
                      >
                        预览行程路线
                        <ArrowRight size={16} />
                      </Button>
                    )}
                  </form>
                  {preview ? (
                    <div className="route-preview">
                      <div className="preview-heading">
                        <span>
                          <span className="live-dot" /> 通路已找到
                        </span>
                        <b>
                          {preview.stationIds.length} 站 <em>·</em> {preview.transferIds.length}{' '}
                          次换乘
                        </b>
                      </div>
                      <div className="route-itinerary">
                        {routeGroups(preview).map((group, i) => (
                          <div className="itinerary-leg" key={i}>
                            <i style={{ background: network.lineById.get(group.lineId)!.color }} />
                            <div>
                              <strong>
                                {displayName(group.from)} <ArrowRight size={12} />{' '}
                                {displayName(group.to)}
                              </strong>
                              <small>
                                {network.lineById.get(group.lineId)!.name} · {group.stops} 个区间
                              </small>
                              <details>
                                <summary>查看沿途站点</summary>
                                <p>{group.stationIds.map(displayName).join(' → ')}</p>
                              </details>
                            </div>
                          </div>
                        ))}
                      </div>
                      <Button
                        block
                        theme="primary"
                        className="confirm-button"
                        icon={<Sparkles size={17} />}
                        onClick={confirmRoute}
                      >
                        确认行程，点亮沿途
                      </Button>
                      <p className="preview-footnote">确认后记录上下车站、换乘站与全部途经区间</p>
                    </div>
                  ) : (
                    <div className="planner-tip">
                      <ShieldCheck size={14} />
                      <span>先预览、再确认，沿途足迹一次点亮</span>
                    </div>
                  )}
                </section>
                <section className="city-progress-card">
                  <div className="city-progress-top">
                    <span className="city-stamp">
                      {city.en} <ArrowUpRight size={12} />
                    </span>
                    <span className="tiny-badge">城市探索度</span>
                  </div>
                  <div className="completion-number">
                    {percentage}
                    <span>%</span>
                  </div>
                  <h3>
                    {progress.stations.size === 0
                      ? '你的城市故事，从这里开始'
                      : Number(percentage) === 100
                        ? '整座城市，都有你的足迹'
                        : '城市正在一点点被你点亮'}
                  </h3>
                  <p>
                    {progress.stations.size === 0
                      ? '不必走很远，就从熟悉的那一站。'
                      : `还有 ${city.stations.length - progress.stations.size} 个站点，等你去发现。`}
                  </p>
                  <Skyline city={city.id} />
                  <div className="city-card-bottom">
                    <span>{city.lines.length} 条线路 · 无限种可能</span>
                    <Sparkles size={14} />
                  </div>
                </section>
              </aside>
              {showInspiration && (
                <section className="discovery-card">
                  <div className="discovery-icon">
                    <TrainFront size={23} />
                  </div>
                  <div>
                    <span className="eyebrow">A LITTLE INSPIRATION</span>
                    <h3>
                      {city.id === 'shanghai'
                        ? '穿过江底，去看一眼陆家嘴'
                        : city.id === 'beijing'
                          ? '沿着长安街，去赴一场奇遇'
                          : '从熟悉的一站，开始新的探索'}
                    </h3>
                    <p>
                      {city.id === 'shanghai'
                        ? '人民广场 → 南京东路 → 陆家嘴'
                        : city.id === 'beijing'
                          ? '天安门东 → 国贸 → 环球度假区'
                          : `${displayName(suggestion.start)} → ${displayName(suggestion.end)}`}
                    </p>
                  </div>
                  <button onClick={useSuggestion}>
                    试试这段旅程
                    <ArrowUpRight size={16} />
                  </button>
                </section>
              )}
            </div>
          ) : page === 'journal' ? (
            <section className="journal-page">
              <div className="section-header">
                <div>
                  <h2>
                    我的城市足迹 <span>{journeys.length}</span>
                  </h2>
                  <p>单独点亮与完整旅程，都收藏在这里。</p>
                </div>
                <Button
                  size="small"
                  variant="outline"
                  icon={<Download size={15} />}
                  onClick={exportBackup}
                >
                  导出备份
                </Button>
              </div>
              {journeys.length ? (
                <div className="journal-list">
                  {journeys.map((j) => (
                    <article className="journey-card" key={j.id}>
                      <span className={`journey-icon ${j.kind}`}>
                        {j.kind === 'trip' ? <RouteIcon size={20} /> : <MapPin size={20} />}
                      </span>
                      <button className="journey-body" onClick={() => setJourneyDetail(j)}>
                        <small>
                          {j.kind === 'trip' ? '地铁旅程' : '站点打卡'}{' '}
                          <span>· {shortDate(j.createdAt)}</span>
                        </small>
                        <h3>
                          {displayName(j.stationIds[0])}
                          {j.kind === 'trip' && (
                            <>
                              <ArrowRight size={17} />
                              {displayName(j.stationIds.at(-1)!)}
                            </>
                          )}
                        </h3>
                        <p>
                          {j.kind === 'trip'
                            ? `${j.stationIds.length} 站 · ${j.segmentIds.length} 个区间 · ${j.transferIds.length} 次换乘`
                            : '单独点亮 · 上下车过 · 不含区间'}
                        </p>
                      </button>
                      <button
                        className="icon-button"
                        aria-label={`撤销${displayName(j.stationIds[0])}记录`}
                        onClick={() => setDeleteId(j.id)}
                      >
                        <Trash2 size={16} />
                      </button>
                      <ChevronRight size={18} className="muted" />
                    </article>
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <div className="empty-art">
                    <Footprints size={38} />
                    <span>✦</span>
                  </div>
                  <h3>第一枚足迹，留给下一次出发</h3>
                  <p>在地图上点亮一个站点，或记录一段完整旅程。</p>
                  <Button theme="primary" onClick={() => setPage('map')}>
                    去探索地图 <ArrowRight size={16} />
                  </Button>
                </div>
              )}
            </section>
          ) : (
            <section className="lines-page">
              <div className="section-header">
                <div>
                  <h2>收藏城市的每一种色彩</h2>
                  <p>
                    {city.description} · 已乘坐 {progress.lines.size} / {city.lines.length} 条线路
                  </p>
                </div>
              </div>
              <div className="line-cards">
                {city.lines.map((line) => {
                  const edges = city.segments.filter((s) => s.lineId === line.id),
                    lit = edges.filter((s) => progress.segments.has(s.id)).length;
                  const stationLit = line.stationIds.filter((id) =>
                    progress.stations.has(id),
                  ).length;
                  return (
                    <button
                      className="collection-card"
                      key={line.id}
                      onClick={() => {
                        setActiveLine(line.id);
                        setPreview(null);
                        setPage('map');
                      }}
                    >
                      <div className="collection-top">
                        <span className="line-number" style={{ background: line.color }}>
                          {line.shortName}
                        </span>
                        <ArrowUpRight size={18} />
                      </div>
                      <h3>{line.name}</h3>
                      <p>
                        {line.stationIds.length} 个站点 <span>·</span>{' '}
                        {line.kind === 'rail'
                          ? '市域铁路'
                          : line.kind === 'tram'
                            ? '有轨电车'
                            : line.kind === 'maglev'
                              ? '磁浮列车'
                              : '城市地铁'}
                      </p>
                      <div className="line-collection-meter">
                        <i
                          style={{
                            width: `${(lit / edges.length) * 100}%`,
                            background: line.color,
                          }}
                        />
                      </div>
                      <div className="collection-bottom">
                        <span>已点亮 {stationLit} 站</span>
                        <strong>
                          {Math.round((lit / edges.length) * 100)}
                          <small>% 区间</small>
                        </strong>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          )}
          <footer className="page-footer">
            <span>
              METROLISTO <i /> 从一站，到一城。
            </span>
            <span>
              示意线网 · 非实时导航 <i />{' '}
              <button onClick={() => setHelpOpen(true)}>
                关于全地铁 <ArrowUpRight size={12} />
              </button>
            </span>
          </footer>
        </main>
      </div>
      <Popup
        visible={cityOpen}
        placement="center"
        onClose={() => setCityOpen(false)}
        destroyOnClose
        className="app-popup"
      >
        <div className="modal-content city-modal">
          <div className="modal-heading">
            <div>
              <span className="eyebrow">CHOOSE YOUR CITY</span>
              <h2>下一站，哪座城？</h2>
            </div>
            <button
              className="icon-button"
              aria-label="关闭城市选择"
              onClick={() => setCityOpen(false)}
            >
              <X size={20} />
            </button>
          </div>
          {cities.map((c) => (
            <button
              className={`city-option ${c.id === cityId ? 'selected' : ''}`}
              key={c.id}
              onClick={() => changeCity(c.id)}
            >
              <span className="city-option-icon">
                <TrainFront size={25} />
              </span>
              <span>
                <strong>
                  {c.name}
                  <small>{c.en}</small>
                </strong>
                <p>
                  {c.lines.length} 条线路 · {c.stations.length} 个站点
                </p>
              </span>
              {c.id === cityId ? <Check size={19} /> : <ChevronRight size={19} />}
            </button>
          ))}
          <p className="modal-note">每座城市的足迹独立记录，切换城市不会丢失数据。</p>
        </div>
      </Popup>
      <Popup
        visible={lineOpen}
        placement="bottom"
        onClose={() => setLineOpen(false)}
        destroyOnClose
        className="app-popup"
      >
        <div className="modal-content line-modal">
          <div className="modal-heading">
            <div>
              <span className="eyebrow">FIND YOUR LINE</span>
              <h2>选择一条线路</h2>
            </div>
            <button
              className="icon-button"
              aria-label="关闭线路选择"
              onClick={() => setLineOpen(false)}
            >
              <X size={20} />
            </button>
          </div>
          <div className="line-choice-grid">
            <button
              className={!activeLine ? 'selected' : ''}
              onClick={() => {
                setActiveLine(null);
                setLineOpen(false);
              }}
            >
              <Globe2 size={18} />
              全部线路
            </button>
            {city.lines.map((l) => (
              <button
                key={l.id}
                className={activeLine === l.id ? 'selected' : ''}
                onClick={() => {
                  setActiveLine(l.id);
                  setPreview(null);
                  setLineOpen(false);
                }}
              >
                <i style={{ background: l.color }} />
                {l.name}
              </button>
            ))}
          </div>
        </div>
      </Popup>
      <Popup
        visible={settingsOpen}
        placement="center"
        onClose={() => setSettingsOpen(false)}
        destroyOnClose
        className="app-popup"
      >
        <div className="modal-content settings-modal">
          <div className="modal-heading">
            <div>
              <span className="eyebrow">YOUR MEMORIES, YOURS TO KEEP</span>
              <h2>好好保存，每一次出发</h2>
            </div>
            <button
              className="icon-button"
              aria-label="关闭数据管理"
              onClick={() => setSettingsOpen(false)}
            >
              <X size={20} />
            </button>
          </div>
          <div className="storage-info">
            <span>
              <HardDrive size={26} />
            </span>
            <div>
              <h3>已在当前设备保存</h3>
              <p>无需登录。所有足迹仅保存在此浏览器，清理浏览器数据前，请记得导出备份。</p>
            </div>
          </div>
          <button className="settings-action" onClick={exportBackup}>
            <Download size={21} />
            <span>
              <strong>导出足迹备份</strong>
              <small>包含所有城市的行程与单站打卡</small>
            </span>
            <ArrowUpRight size={18} />
          </button>
          <button className="settings-action" onClick={() => fileInput.current?.click()}>
            <Upload size={21} />
            <span>
              <strong>从备份中恢复</strong>
              <small>导入 JSON 文件，自动合并、去除重复记录</small>
            </span>
            <ChevronRight size={18} />
          </button>
          <div className="privacy-note">
            <ShieldCheck size={17} />
            <p>你的城市故事，只属于你。全地铁不会上传你的足迹。</p>
          </div>
        </div>
      </Popup>
      <input
        ref={fileInput}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void importBackup(file);
          e.target.value = '';
        }}
      />
      <Popup
        visible={helpOpen}
        placement="center"
        onClose={() => setHelpOpen(false)}
        destroyOnClose
        className="app-popup"
      >
        <div className="modal-content help-modal">
          <div className="modal-heading">
            <div>
              <span className="eyebrow">HELLO, URBAN EXPLORER</span>
              <h2>你的全地铁使用手册</h2>
            </div>
            <button
              className="icon-button"
              aria-label="关闭使用指南"
              onClick={() => setHelpOpen(false)}
            >
              <X size={20} />
            </button>
          </div>
          <div className="guide-item">
            <span>01</span>
            <div>
              <h3>一站，也是一段故事</h3>
              <p>
                单击地图上的站点即可标记“上下车过”，不会点亮任何区间。可以从提示中撤销，也可以在“我的足迹”中删除记录。
              </p>
            </div>
          </div>
          <div className="guide-item">
            <span>02</span>
            <div>
              <h3>记录一段完整旅程</h3>
              <p>
                输入上下车站，可按顺序添加最多三个换乘站。预览路线与沿途站点，确认后点亮所有途经站点和乘车区间。
              </p>
            </div>
          </div>
          <div className="guide-item">
            <span>03</span>
            <div>
              <h3>每一种足迹，都有不同的颜色</h3>
              <p>
                蓝色实心表示上下车过，橙色圆环表示换乘过，浅蓝圆点表示仅途经。同时上下车与换乘过的站点，会显示蓝色实心与橙色标记。
              </p>
            </div>
          </div>
          <div className="data-sources">
            <h3>
              <BookOpen size={16} /> 线网数据说明
            </h3>
            <p>
              {city.name} · 数据快照 {city.updatedAt}。{city.description}
              。本应用记录个人足迹，不提供实时运营、时刻或票价信息。实际出行请以运营方公告为准。
            </p>
            {city.sources.map((s) => (
              <a key={s.url} href={s.url} target="_blank" rel="noreferrer">
                {s.title}
                <ArrowUpRight size={13} />
              </a>
            ))}
          </div>
          <p className="modal-note">MetroListo 全地铁 · 灵感来自线格 · Built with TDesign</p>
        </div>
      </Popup>
      <Popup
        visible={!!journeyDetail}
        placement="center"
        onClose={() => setJourneyDetail(null)}
        destroyOnClose
        className="app-popup"
      >
        <div className="modal-content">
          <div className="modal-heading">
            <h2>这一次出发</h2>
            <button
              className="icon-button"
              aria-label="关闭行程详情"
              onClick={() => setJourneyDetail(null)}
            >
              <X size={20} />
            </button>
          </div>
          {journeyDetail && (
            <>
              <p className="detail-date">
                {new Date(journeyDetail.createdAt).toLocaleString('zh-CN')}
              </p>
              <h3 className="detail-route">
                {displayName(journeyDetail.stationIds[0])}
                {journeyDetail.kind === 'trip' && (
                  <> → {displayName(journeyDetail.stationIds.at(-1)!)}</>
                )}
              </h3>
              {journeyDetail.kind === 'trip' ? (
                <div className="route-itinerary">
                  {routeGroups(journeyDetail).map((g, i) => (
                    <div className="itinerary-leg" key={i}>
                      <i style={{ background: network.lineById.get(g.lineId)!.color }} />
                      <div>
                        <strong>{network.lineById.get(g.lineId)!.name}</strong>
                        <p>{g.stationIds.map(displayName).join(' → ')}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="modal-note">单独点亮 · 上下车过 · 未点亮区间</p>
              )}
              <Button
                block
                theme="primary"
                onClick={() => {
                  setPage('map');
                  if (journeyDetail.kind === 'trip') {
                    setFrom(journeyDetail.stationIds[0]);
                    setTo(journeyDetail.stationIds.at(-1)!);
                    setVia([]);
                    setPreview(null);
                    setActiveLine(journeyDetail.lineIds[0]);
                  }
                  setFocusStation(journeyDetail.stationIds[0]);
                  setJourneyDetail(null);
                }}
              >
                在地图上查看 <ArrowUpRight size={16} />
              </Button>
            </>
          )}
        </div>
      </Popup>
      <Dialog
        visible={!!deleteId}
        title="撤销这条足迹？"
        content="此条记录将被移除。其他旅程中已点亮的站点和区间会保留。"
        confirmBtn="撤销记录"
        cancelBtn="保留"
        onConfirm={() => deleteId && removeJourney(deleteId)}
        onClose={() => setDeleteId(null)}
      />
      {toast && (
        <div className="toast" role="status">
          <CheckCheck size={18} />
          <span>{toast.text}</span>
          {toast.undoId && <button onClick={() => removeJourney(toast.undoId!)}>撤销</button>}
          <button aria-label="关闭提示" className="toast-close" onClick={() => setToast(null)}>
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
