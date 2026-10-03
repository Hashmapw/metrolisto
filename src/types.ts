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

/** Each physical section is explicit; optional city rules describe same-line train changes. */
export interface Segment {
  id: string;
  lineId: string;
  from: string;
  to: string;
  points?: Point[];
  /** Interpret points as cubic Bézier control/control/end triples after the start. */
  curve?: 'cubic';
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
  /** Pairs of adjacent sections that require changing trains on the same line. */
  sameLineTransfers?: [string, string][];
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
  /** Unusable source records are retained verbatim for recovery and export. */
  quarantined?: { cityId: string; value: unknown; reason: string }[];
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
