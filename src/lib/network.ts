import type { CityData, MetroLine, Route, Segment, Station } from '../types';

export interface Network {
  city: CityData;
  stationById: Map<string, Station>;
  lineById: Map<string, MetroLine>;
  segmentById: Map<string, Segment>;
  stationLines: Map<string, MetroLine[]>;
  adjacency: Map<string, { to: string; segment: Segment }[]>;
}

export function createNetwork(city: CityData): Network {
  const adjacency: Network['adjacency'] = new Map(city.stations.map((s) => [s.id, []]));
  city.segments.forEach((segment) => {
    adjacency.get(segment.from)!.push({ to: segment.to, segment });
    if (!segment.oneWay) adjacency.get(segment.to)!.push({ to: segment.from, segment });
  });
  return {
    city,
    adjacency,
    stationById: new Map(city.stations.map((s) => [s.id, s])),
    lineById: new Map(city.lines.map((l) => [l.id, l])),
    segmentById: new Map(city.segments.map((s) => [s.id, s])),
    stationLines: new Map(
      city.stations.map((s) => [s.id, city.lines.filter((l) => l.stationIds.includes(s.id))]),
    ),
  };
}

type Step = {
  key: string;
  station: string;
  line: string;
  via: number;
  cost: number;
  previous?: Step;
  edge?: Segment;
};

/** Dijkstra over (station, incoming line, ordered transfer waypoint index).
 * A requested transfer station is satisfied only by changing lines there.
 */
export function findRoute(
  network: Network,
  from: string,
  to: string,
  via: string[] = [],
  preference: 'balanced' | 'transfers' = 'balanced',
): Route | null {
  if (
    !network.stationById.has(from) ||
    !network.stationById.has(to) ||
    from === to ||
    via.includes(from) ||
    via.includes(to) ||
    new Set(via).size !== via.length ||
    via.some((id) => (network.stationLines.get(id)?.length ?? 0) < 2)
  )
    return null;
  const start: Step = { key: `${from}||0`, station: from, line: '', via: 0, cost: 0 };
  const costs = new Map([[start.key, 0]]),
    queue: Step[] = [start];
  const transferCost = preference === 'transfers' ? network.city.segments.length + 1 : 4;
  while (queue.length) {
    queue.sort((a, b) => b.cost - a.cost);
    const current = queue.pop()!;
    if (current.cost !== costs.get(current.key)) continue;
    if (current.station === to && current.via === via.length) {
      const stationIds: string[] = [],
        segmentIds: string[] = [],
        lineIds: string[] = [];
      let step: Step | undefined = current;
      while (step) {
        stationIds.unshift(step.station);
        if (step.edge) {
          segmentIds.unshift(step.edge.id);
          lineIds.unshift(step.edge.lineId);
        }
        step = step.previous;
      }
      const transferIds = stationIds.filter(
        (_, i) => i > 0 && i < stationIds.length - 1 && lineIds[i - 1] !== lineIds[i],
      );
      return { stationIds, segmentIds, lineIds, transferIds };
    }
    for (const { to: next, segment } of network.adjacency.get(current.station) ?? []) {
      const transfer = !!current.line && current.line !== segment.lineId;
      let nextVia = current.via;
      if (current.station === via[current.via]) {
        if (!transfer) continue;
        nextVia++;
      }
      const cost = current.cost + 1 + (transfer ? transferCost : 0);
      const key = `${next}|${segment.lineId}|${nextVia}`;
      if (cost >= (costs.get(key) ?? Infinity)) continue;
      costs.set(key, cost);
      queue.push({
        key,
        station: next,
        line: segment.lineId,
        via: nextVia,
        cost,
        previous: current,
        edge: segment,
      });
    }
  }
  return null;
}

export function searchStations(network: Network, query: string, transferOnly = false) {
  const normalized = query.toLowerCase().replace(/\s/g, '');
  return network.city.stations.filter(
    (s) =>
      (!transferOnly || network.stationLines.get(s.id)!.length > 1) &&
      (!normalized ||
        [s.name, s.en ?? '', ...(s.aliases ?? [])].some((v) =>
          v.toLowerCase().replace(/\s/g, '').includes(normalized),
        )),
  );
}

export function routeGroups(route: Route) {
  const groups: {
    lineId: string;
    from: string;
    to: string;
    stops: number;
    stationIds: string[];
  }[] = [];
  route.lineIds.forEach((lineId, i) => {
    const last = groups.at(-1);
    if (last?.lineId === lineId) {
      last.to = route.stationIds[i + 1];
      last.stops++;
      last.stationIds.push(route.stationIds[i + 1]);
    } else
      groups.push({
        lineId,
        from: route.stationIds[i],
        to: route.stationIds[i + 1],
        stops: 1,
        stationIds: [route.stationIds[i], route.stationIds[i + 1]],
      });
  });
  return groups;
}
