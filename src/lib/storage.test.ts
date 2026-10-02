import { afterEach, describe, expect, it, vi } from 'vitest';
import { cities } from '../data';
import { createNetwork, findRoute } from './network';
import {
  getProgress,
  mergeBackups,
  readSavedData,
  removeStationLighting,
  validateBackup,
} from './storage';
import type { Journey } from '../types';

const network = createNetwork(cities[0]);
const id = (name: string) => cities[0].stations.find((s) => s.name === name)!.id;
const journey: Journey = {
  ...findRoute(network, id('徐家汇'), id('陆家嘴'), [id('人民广场')])!,
  id: 'trip-1',
  kind: 'trip',
  createdAt: '2026-10-03T00:00:00Z',
};
const manual: Journey = {
  id: 'manual-1',
  kind: 'station',
  createdAt: '2026-10-03T00:00:00Z',
  stationIds: [id('人民广场')],
  segmentIds: [],
  lineIds: [],
  transferIds: [],
};
afterEach(() => vi.unstubAllGlobals());

describe('persistent exploration history', () => {
  it('merges repeated imports without depending on JSON object property order', () => {
    const current = { version: 1 as const, cities: { shanghai: [journey] } };
    const imported = validateBackup(
      { version: 1, cities: { shanghai: [journey, manual] } },
      cities,
    );
    const once = mergeBackups(current, imported);
    expect(once.cities.shanghai).toHaveLength(2);
    expect(mergeBackups(once, imported)).toEqual(once);
    expect(() =>
      mergeBackups(current, {
        version: 1,
        cities: { shanghai: [{ ...journey, createdAt: '2026-10-04T00:00:00Z' }] },
      }),
    ).toThrow('同 ID');
    expect(current.cities.shanghai).toHaveLength(1);
  });
  it('single station lighting never lights any section or line', () => {
    const p = getProgress([manual]);
    expect(p.stations.size).toBe(1);
    expect(p.segments.size).toBe(0);
    expect(p.lines.size).toBe(0);
    expect(p.stations.get(id('人民广场'))).toEqual({
      passed: true,
      transferred: false,
      visited: true,
    });
  });
  it('distinguishes transfer, passing and boarding, and preserves both visit types', () => {
    const p = getProgress([journey]);
    expect(p.stations.get(id('人民广场'))).toEqual({
      passed: true,
      transferred: true,
      visited: false,
    });
    expect(p.stations.get(id('南京东路'))).toEqual({
      passed: true,
      transferred: false,
      visited: false,
    });
    expect(p.stations.get(id('徐家汇'))?.visited).toBe(true);
    expect(p.stations.get(id('陆家嘴'))?.visited).toBe(true);
    const both = getProgress([journey, manual]);
    expect(both.stations.get(id('人民广场'))).toEqual({
      passed: true,
      transferred: true,
      visited: true,
    });
  });
  it('deduplicates repeated routes and safely recalculates after undo', () => {
    const p = getProgress([journey, { ...journey, id: 'trip-2' }, manual]);
    expect(p.segments.size).toBe(journey.segmentIds.length);
    expect(getProgress([journey, manual]).segments.size).toBe(p.segments.size);
    const afterUndo = getProgress([manual]);
    expect(afterUndo.stations.size).toBe(1);
    expect(afterUndo.segments.size).toBe(0);
  });
  it('round-trips a backup without dropping records', () => {
    const backup = { version: 1, cities: { shanghai: [journey, manual], beijing: [] } };
    expect(validateBackup(JSON.parse(JSON.stringify(backup)), cities)).toEqual(backup);
    vi.stubGlobal('localStorage', { getItem: () => JSON.stringify(backup) });
    expect(readSavedData(cities)).toEqual({ data: backup, error: null });
  });
  it('cancels all manual lighting for one station while retaining trips and other stations', () => {
    const other = { ...manual, id: 'manual-other', stationIds: [id('新闸路')] };
    const records = [journey, manual, { ...manual, id: 'imported-manual' }, other];
    const remaining = removeStationLighting(records, id('人民广场'));
    expect(remaining).toEqual([journey, other]);
    const p = getProgress(remaining);
    expect(p.stations.get(id('人民广场'))).toEqual({
      passed: true,
      transferred: true,
      visited: false,
    });
    expect(p.segments).toEqual(getProgress([journey]).segments);
    expect(p.stations.get(id('新闸路'))?.visited).toBe(true);
    expect(records).toHaveLength(4);
    expect(getProgress(removeStationLighting([manual], manual.stationIds[0])).stations.size).toBe(
      0,
    );
  });
  it('keeps a trip endpoint visited after canceling its independent manual record', () => {
    const endpoint = { ...manual, stationIds: [journey.stationIds[0]] };
    const remaining = removeStationLighting([journey, endpoint], endpoint.stationIds[0]);
    expect(getProgress(remaining)).toEqual(getProgress([journey]));
    expect(getProgress(remaining).stations.get(endpoint.stationIds[0])?.visited).toBe(true);
  });
  it('rejects forged, disconnected and inconsistent records', () => {
    expect(() => validateBackup({ version: 2, cities: {} }, cities)).toThrow();
    expect(() =>
      validateBackup(
        { version: 1, cities: { shanghai: [{ ...manual, segmentIds: [journey.segmentIds[0]] }] } },
        cities,
      ),
    ).toThrow();
    expect(() =>
      validateBackup(
        { version: 1, cities: { shanghai: [{ ...journey, transferIds: [] }] } },
        cities,
      ),
    ).toThrow();
    expect(() =>
      validateBackup(
        {
          version: 1,
          cities: { shanghai: [{ ...journey, stationIds: [...journey.stationIds].reverse() }] },
        },
        cities,
      ),
    ).toThrow();
    expect(() => validateBackup({ version: 1, cities: { unknown: [manual] } }, cities)).toThrow();
  });
  it('does not overwrite damaged local storage on read', () => {
    const setItem = vi.fn();
    vi.stubGlobal('localStorage', { getItem: () => '{broken', setItem });
    expect(readSavedData(cities).error).not.toBeNull();
    expect(setItem).not.toHaveBeenCalled();
  });
  it('reports blocked storage access', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('SecurityError');
      },
    });
    expect(readSavedData(cities).error).not.toBeNull();
  });
});
