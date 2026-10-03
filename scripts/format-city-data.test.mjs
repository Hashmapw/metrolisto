import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { cityDataFiles, formatCityData } from './format-city-data.mjs';

const temporaryDirectories = [];
const temporaryDirectory = () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'metrolisto-format-'));
  temporaryDirectories.push(directory);
  return directory;
};
afterEach(() => {
  for (const directory of temporaryDirectories.splice(0))
    fs.rmSync(directory, { recursive: true, force: true });
});

const fixture = {
  schemaVersion: 1,
  id: 'example',
  zhName: '示例',
  enName: 'Example',
  center: [0, 0],
  stations: [
    {
      id: 'b',
      names: [
        { language: 'fr', value: '  République, "place": [A]\\B\n北  ' },
        { language: 'en', value: 'Square' },
      ],
      x: 0,
      y: 0,
    },
    { id: 'a', names: [{ language: 'en', value: 'Station' }], x: 10, y: 20 },
  ],
  lines: [{ id: 'line', stationIds: ['b', 'a'] }],
  segments: [
    {
      id: 'section',
      from: 'b',
      to: 'a',
      points: Array.from({ length: 100 }, (_, i) => [i, i + 1]),
    },
  ],
  extra: { z: null, a: [true, false] },
};

describe('city data format', () => {
  it('preserves names, string whitespace, nested values and all array orders', () => {
    const formatted = formatCityData(fixture);
    expect(JSON.parse(formatted)).toEqual(fixture);
    expect(formatted.endsWith('\n')).toBe(true);
    expect(formatted.split('\n').filter((line) => line.startsWith('    { '))).toHaveLength(4);
    expect(formatted.split('\n').find((line) => line.includes('"id": "section"'))).toContain(
      '[99, 100]',
    );
  });
  it('is stable across repeated formatting and different object field orders', () => {
    const reverseKeys = (value) =>
      Array.isArray(value)
        ? value.map(reverseKeys)
        : value && typeof value === 'object'
          ? Object.fromEntries(
              Object.entries(value)
                .reverse()
                .map(([key, entry]) => [key, reverseKeys(entry)]),
            )
          : value;
    const formatted = formatCityData(fixture);
    expect(formatCityData(JSON.parse(formatted))).toBe(formatted);
    expect(formatCityData(reverseKeys(fixture))).toBe(formatted);
  });
  it('limits a station name edit to one changed line', () => {
    const edited = structuredClone(fixture);
    edited.stations[0].names[0].value = 'New name';
    const before = formatCityData(fixture).split('\n');
    const after = formatCityData(edited).split('\n');
    expect(before.length).toBe(after.length);
    expect(before.filter((line, index) => line !== after[index])).toHaveLength(1);
  });
  it('handles optional importer fields like standard JSON serialization', () => {
    const city = { ...fixture, localName: undefined, sources: [], extra: {} };
    expect(JSON.parse(formatCityData(city))).toEqual(JSON.parse(JSON.stringify(city)));
  });
  it('finds newly contributed city files without consulting the city registry', () => {
    const root = temporaryDirectory();
    fs.mkdirSync(path.join(root, 'src/data/nested'), { recursive: true });
    fs.mkdirSync(path.join(root, 'docs'));
    for (const file of [
      'src/data/new-city.json',
      'src/data/nested/another.json',
      'docs/city.example.json',
    ])
      fs.writeFileSync(path.join(root, file), '{}');
    fs.writeFileSync(path.join(root, 'src/data/index.ts'), '');
    expect(cityDataFiles(root).map((file) => path.relative(root, file))).toEqual([
      'docs/city.example.json',
      'src/data/nested/another.json',
      'src/data/new-city.json',
    ]);
  });
  it('fails checks without rewriting files, fixes them on request, and rejects invalid JSON', () => {
    const file = path.join(temporaryDirectory(), 'city.json');
    const original = JSON.stringify(fixture, null, 2);
    fs.writeFileSync(file, original);
    const run = (mode) =>
      spawnSync(process.execPath, ['scripts/format-city-data.mjs', mode, file], {
        encoding: 'utf8',
      });
    expect(run('--check').status).toBe(1);
    expect(fs.readFileSync(file, 'utf8')).toBe(original);
    expect(run('--write').status).toBe(0);
    expect(run('--check').status).toBe(0);
    fs.writeFileSync(file, '{ broken');
    expect(run('--write').status).toBe(1);
    expect(fs.readFileSync(file, 'utf8')).toBe('{ broken');
  });
});
