export type Point = [number, number];

export interface Station {
  id: string;
  name: string;
  en?: string;
  aliases?: string[];
  x: number;
  y: number;
  label?: number;
}

export interface MetroLine {
  id: string;
  name: string;
  shortName: string;
  color: string;
  kind: 'metro' | 'rail' | 'tram' | 'maglev';
  stationIds: string[];
}

/** Each physical section is explicit. Branches and loops require no special routing logic. */
export interface Segment {
  id: string;
  lineId: string;
  from: string;
  to: string;
  points?: Point[];
  oneWay?: boolean;
}

export interface CityData {
  schemaVersion: 1;
  id: string;
  name: string;
  en: string;
  updatedAt: string;
  description: string;
  center: Point;
  sources: { title: string; url: string }[];
  stations: Station[];
  lines: MetroLine[];
  segments: Segment[];
}

export interface Route {
  stationIds: string[];
  segmentIds: string[];
  lineIds: string[];
  transferIds: string[];
}

export interface Journey extends Route {
  id: string;
  kind: 'trip' | 'station';
  createdAt: string;
}

export interface SavedData {
  version: 1;
  cities: Record<string, Journey[]>;
}

export interface StationState {
  passed: boolean;
  transferred: boolean;
  visited: boolean;
}

export interface Progress {
  stations: Map<string, StationState>;
  segments: Set<string>;
  lines: Set<string>;
}
