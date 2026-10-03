import { localisedName } from './i18n';
import { describe, expect, it } from 'vitest';
import { cities } from '../data';
import { createNetwork, findRoute, routeGroups, searchStations } from './network';
import { validateCity } from './validate';
import exampleCity from '../../docs/city.example.json';

const sh = createNetwork(cities[0]),
  bj = createNetwork(cities[1]);
const id = (network: typeof sh, name: string) =>
  network.city.stations.find((s) => localisedName(s, 'zh-CN') === name)!.id;
const route = (network: typeof sh, from: string, to: string, via: string[] = []) =>
  findRoute(
    network,
    id(network, from),
    id(network, to),
    via.map((n) => id(network, n)),
  )!;
const names = (network: typeof sh, stationIds: string[]) =>
  stationIds.map((id) => localisedName(network.stationById.get(id), 'zh-CN'));

describe('complete city networks', () => {
  it('accepts a developer-provided city without built-in city assumptions', () => {
    const city = validateCity(exampleCity);
    const network = createNetwork(city);
    const trip = findRoute(network, 'example-west', 'example-south');
    expect(trip?.stationIds).toEqual(['example-west', 'example-central', 'example-south']);
    expect(trip?.transferIds).toEqual(['example-central']);
  });
  it('includes the requested rail and tram networks, without Beijing suburban rail', () => {
    expect(sh.city.lines).toHaveLength(22);
    expect(sh.city.lines.map((l) => localisedName(l, 'zh-CN'))).toEqual(
      expect.arrayContaining(['机场联络线', '金山铁路', '磁浮线']),
    );
    expect(bj.city.lines).toHaveLength(28);
    expect(bj.city.lines.map((l) => localisedName(l, 'zh-CN'))).toEqual(
      expect.arrayContaining(['亦庄有轨电车T1线', '西郊线', '首都机场线', '大兴机场线']),
    );
    expect(
      bj.city.lines.some((l) => /S2|城市副中心|怀柔|通密/.test(localisedName(l, 'zh-CN'))),
    ).toBe(false);
  });
  it.each(cities)('$zhName: every station is reachable in both directions', (city) => {
    const network = createNetwork(city),
      start = city.stations[0].id;
    for (const reverse of [false, true]) {
      const reached = new Set([start]),
        queue = [start];
      while (queue.length) {
        const s = queue.pop()!;
        for (const edge of city.segments) {
          const next = reverse
            ? edge.to === s
              ? edge.from
              : !edge.oneWay && edge.from === s
                ? edge.to
                : null
            : edge.from === s
              ? edge.to
              : !edge.oneWay && edge.to === s
                ? edge.from
                : null;
          if (next && !reached.has(next)) {
            reached.add(next);
            queue.push(next);
          }
        }
      }
      expect(reached.size).toBe(network.stationById.size);
    }
  });
  it('does not offer paused or unopened Beijing stations', () => {
    expect(
      bj.city.stations.some((s) =>
        ['通运门', '老观里', '八角游乐园'].includes(localisedName(s, 'zh-CN') ?? ''),
      ),
    ).toBe(false);
  });
  it('supports airport old names and pinyin search', () => {
    expect(localisedName(searchStations(sh, '浦东国际机场')[0], 'zh-CN')).toBe('浦东1号2号航站楼');
    expect(localisedName(searchStations(sh, 'renmin')[0], 'zh-CN')).toBe('人民广场');
  });
  it('rejects dangling edges and duplicate station IDs', () => {
    const invalid = structuredClone(cities[0]);
    invalid.segments[0].to = 'unknown';
    expect(() => validateCity(invalid)).toThrow();
    const duplicate = structuredClone(cities[0]);
    duplicate.stations.push(duplicate.stations[0]);
    expect(() => validateCity(duplicate)).toThrow();
  });
});

describe('route finding', () => {
  it('uses the single Dahongmen interchange between lines 8 and 10', () => {
    expect(
      searchStations(bj, '大红门').filter((s) => localisedName(s, 'zh-CN') === '大红门'),
    ).toHaveLength(1);
    const r = route(bj, '大红门南', '石榴庄');
    expect(names(bj, r.stationIds)).toEqual(['大红门南', '大红门', '石榴庄']);
    expect(names(bj, r.transferIds)).toEqual(['大红门']);
    expect(
      bj.stationLines
        .get(id(bj, '大红门'))
        ?.map((l) => localisedName(l, 'zh-CN'))
        .sort(),
    ).toEqual(['10号线', '8号线']);
  });
  it.each(['balanced', 'transfers'] as const)(
    'counts branch changes with %s routing, without U-turn shortcuts',
    (preference) => {
      for (const [from, to] of [
        ['上海动物园', '龙柏新村'],
        ['龙柏新村', '上海动物园'],
      ]) {
        const r = findRoute(sh, id(sh, from), id(sh, to), [], preference)!;
        expect(names(sh, r.stationIds)).toEqual([from, '龙溪路', to]);
        expect(names(sh, r.transferIds)).toEqual(['龙溪路']);
        expect(routeGroups(r)).toHaveLength(2);
        expect(new Set(r.lineIds).size).toBe(1);
      }
    },
  );
  it('accepts a branch interchange as an explicit waypoint but keeps through trains direct', () => {
    expect(searchStations(sh, '龙溪路', true)).toHaveLength(1);
    expect(names(sh, route(sh, '上海动物园', '龙柏新村', ['龙溪路']).transferIds)).toEqual([
      '龙溪路',
    ]);
    expect(route(sh, '上海动物园', '水城路').transferIds).toEqual([]);
    expect(route(sh, '龙柏新村', '水城路').transferIds).toEqual([]);
  });

  it('includes all intermediate stations of a direct trip', () => {
    const r = route(sh, '人民广场', '陆家嘴');
    expect(names(sh, r.stationIds)).toEqual(['人民广场', '南京东路', '陆家嘴']);
    expect(r.segmentIds).toHaveLength(2);
    expect(r.transferIds).toHaveLength(0);
  });
  it('handles line 5 branches without a nonexistent shortcut', () => {
    const r = route(sh, '闵行开发区', '奉贤新城');
    expect(names(sh, r.stationIds)).toContain('东川路');
    expect(r.lineIds.every((l) => l === 'shanghai-5号线')).toBe(true);
    expect(names(sh, r.transferIds)).toEqual(['东川路']);
  });
  it('counts changes between line 11 branches without splitting through services', () => {
    expect(names(sh, route(sh, '白银路', '上海赛车场').transferIds)).toEqual(['嘉定新城']);
    expect(route(sh, '白银路', '马陆').transferIds).toEqual([]);
    expect(route(sh, '上海赛车场', '马陆').transferIds).toEqual([]);
    expect(route(sh, '莘庄', '金平路').transferIds).toEqual([]);
    expect(route(sh, '莘庄', '江川路').transferIds).toEqual([]);
  });
  it('connects the ends of ring lines', () => {
    const r = route(bj, '巴沟', '火器营');
    expect(r.segmentIds).toHaveLength(1);
    expect(r.lineIds).toEqual(['beijing-10号线']);
    expect(route(sh, '宜山路', '上海体育馆').segmentIds).toHaveLength(1);
  });
  it('respects the capital airport one-way terminal loop', () => {
    expect(names(bj, route(bj, '三元桥', '2号航站楼').stationIds)).toEqual([
      '三元桥',
      '3号航站楼',
      '2号航站楼',
    ]);
    expect(names(bj, route(bj, '2号航站楼', '三元桥').stationIds)).toEqual(['2号航站楼', '三元桥']);
    expect(names(bj, route(bj, '2号航站楼', '3号航站楼').stationIds)).toEqual([
      '2号航站楼',
      '三元桥',
      '3号航站楼',
    ]);
  });
  it('requires an actual line change at an optional transfer station', () => {
    const r = route(sh, '徐家汇', '陆家嘴', ['人民广场']);
    expect(names(sh, r.transferIds)).toContain('人民广场');
    const i = r.stationIds.indexOf(id(sh, '人民广场'));
    expect(r.lineIds[i - 1]).not.toBe(r.lineIds[i]);
  });
  it('honors ordered multiple transfer stations', () => {
    const r = route(sh, '徐家汇', '五角场', ['人民广场', '南京东路']);
    const transferNames = names(sh, r.transferIds);
    expect(transferNames.indexOf('人民广场')).toBeLessThan(transferNames.indexOf('南京东路'));
  });
  it('rejects same endpoints, duplicate or invalid waypoints', () => {
    expect(findRoute(sh, id(sh, '人民广场'), id(sh, '人民广场'))).toBeNull();
    expect(findRoute(sh, 'missing', id(sh, '人民广场'))).toBeNull();
    expect(
      findRoute(sh, id(sh, '徐家汇'), id(sh, '陆家嘴'), [id(sh, '人民广场'), id(sh, '人民广场')]),
    ).toBeNull();
    expect(findRoute(sh, id(sh, '徐家汇'), id(sh, '陆家嘴'), [id(sh, '衡山路')])).toBeNull();
  });
  it('routes to the supplemental rail and tram networks', () => {
    expect(route(sh, '人民广场', '金山卫').lineIds).toContain('shanghai-金山铁路');
    expect(route(bj, '宋家庄', '屈庄').lineIds).toContain('beijing-亦庄有轨电车T1线');
    expect(route(sh, '虹桥2号航站楼', '浦东1号2号航站楼').lineIds).toContain('shanghai-市域机场线');
  });
});
