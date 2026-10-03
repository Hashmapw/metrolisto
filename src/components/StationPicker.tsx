import { useLocale } from './LocaleProvider';
import { useEffect, useRef, useState } from 'react';
import { ChevronRight, Search, X } from 'lucide-react';
import { searchStations, type Network } from '../lib/network';
import type { Station } from '../types';

interface Props {
  network: Network;
  value: string;
  onChange: (id: string) => void;
  placeholder: string;
  transferOnly?: boolean;
  label: string;
  variant?: 'search' | 'field';
}

export default function StationPicker({
  network,
  value,
  onChange,
  placeholder,
  transferOnly = false,
  label,
  variant = 'field',
}: Props) {
  const { locale, t, name } = useLocale();
  const [query, setQuery] = useState(''),
    [open, setOpen] = useState(false),
    [active, setActive] = useState(0);
  const container = useRef<HTMLDivElement>(null),
    input = useRef<HTMLInputElement>(null);
  const selected = network.stationById.get(value);
  const results = searchStations(network, query, transferOnly).slice(0, 50);
  const listId = `station-list-${label.replaceAll(' ', '-')}`;
  useEffect(() => {
    const close = (e: PointerEvent) => {
      if (!container.current?.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);
  useEffect(() => {
    setQuery('');
    setOpen(false);
  }, [network]);
  const choose = (s: Station) => {
    onChange(s.id);
    setOpen(false);
    setQuery('');
    input.current?.blur();
  };
  const field = (
    <>
      {variant === 'search' && <Search size={16} />}
      <input
        ref={input}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && results[active] ? `${listId}-${active}` : undefined}
        aria-label={label}
        value={open ? query : name(selected)}
        placeholder={name(selected) || placeholder}
        onFocus={() => {
          setOpen(true);
          setActive(0);
          setQuery('');
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onBlur={() => {
          setOpen(false);
          setQuery('');
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setOpen(false);
            setQuery('');
            input.current?.blur();
          }
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
            setActive((i) => Math.min(i + 1, results.length - 1));
          }
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((i) => Math.max(0, i - 1));
          }
          if (e.key === 'Enter' && open && results[active]) {
            e.preventDefault();
            choose(results[active]);
          }
        }}
      />
      {value && !open && (
        <button
          type="button"
          className="clear-btn"
          aria-label={t('清除{0}', label)}
          onClick={() => {
            onChange('');
            setQuery('');
          }}
        >
          <X size={13} />
        </button>
      )}
      {open && (
        <div className="options" role="listbox" id={listId} aria-label={t('{0}搜索结果', label)}>
          <div className="options-head">
            <span>{query ? t('搜索结果') : transferOnly ? t('可换乘站点') : t('全部站点')}</span>
            <span>
              {results.length === 50 ? '50+' : results.length}{' '}
              {locale === 'en-GB' && results.length === 1 ? 'result' : t('个')}
            </span>
          </div>
          {results.length ? (
            results.map((s, i) => (
              <button
                type="button"
                role="option"
                tabIndex={-1}
                aria-selected={active === i}
                id={`${listId}-${i}`}
                className={active === i ? 'active' : ''}
                key={s.id}
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => choose(s)}
              >
                <div>
                  <strong>{name(s)}</strong>
                  <small>{network.stationLines.get(s.id)!.map(name).join(' · ')}</small>
                </div>
                <ChevronRight size={15} />
              </button>
            ))
          ) : (
            <div className="options-empty">
              {t('没有找到站点，试试英文、当地语言站名或别名。')}
              {transferOnly && <small>{t('这里只显示可换乘的站点。')}</small>}
            </div>
          )}
        </div>
      )}
    </>
  );
  if (variant === 'search')
    return (
      <div ref={container} className={`picker search-box ${open ? 'is-open' : ''}`}>
        {field}
      </div>
    );
  return (
    <div ref={container} className={`picker field ${open ? 'is-open' : ''}`}>
      {field}
    </div>
  );
}
