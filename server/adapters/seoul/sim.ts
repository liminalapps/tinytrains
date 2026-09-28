import type { TimelineStop, TrainState } from '../../../shared/types.ts';
import { serviceDay } from './calendar.ts';
import { chooseStock } from './lines.ts';
import { network, shortCars, type DayService, type NetLine, type NetPattern } from './network.ts';

export const MAX_STOPS = 16;
const TERMINAL_DWELL = 40;

const headway = (svc: DayService, t: number) => 60 * svc.hw[Math.min(svc.hw.length - 1, Math.max(0, Math.floor(t / 3600)))];

interface Group {
  name: string;
  patterns: NetPattern[];
  weight: number;
  phase: number;
}

const groupCache = new WeakMap<NetLine, Group[]>();

/** Patterns grouped into departure sequences; groups are staggered across the headway. */
function groupsOf(L: NetLine): Group[] {
  let groups = groupCache.get(L);
  if (!groups) {
    const byKey = new Map<string, NetPattern[]>();
    for (const p of L.patterns) {
      if (!byKey.has(p.group)) byKey.set(p.group, []);
      byKey.get(p.group)!.push(p);
    }
    const names = [...new Set(L.patterns.map((p) => p.group.slice(0, -1)))];
    groups = [...byKey].map(([key, patterns]) => ({
      name: key.slice(0, -1),
      patterns,
      weight: patterns.reduce((s, p) => s + p.share, 0),
      phase: names.indexOf(key.slice(0, -1)) / names.length,
    }));
    groupCache.set(L, groups);
  }
  return groups;
}

/**
 * Departures of a group (seconds after the service day's midnight): evenly spaced at the line headway divided by
 * the group's weight, with the patterns taking turns in proportion to their shares (smooth weighted round robin).
 */
function* departures(svc: DayService, g: Group): Generator<[number, NetPattern]> {
  const credit = g.patterns.map(() => 0);
  let t = svc.first + g.phase * headway(svc, svc.first);
  while (t <= svc.last) {
    let pick = 0;
    g.patterns.forEach((p, i) => {
      credit[i] += p.share;
      if (credit[i] > credit[pick]) pick = i;
    });
    credit[pick] -= g.weight;
    yield [Math.round(t), g.patterns[pick]];
    t += headway(svc, t) / g.weight;
  }
}

/** Trains of the given lines at `nowSec`, simulated from typical headways and run times. */
export function simulate(lines: Iterable<string>, nowSec: number): TrainState[] {
  const net = network();
  const out: TrainState[] = [];
  for (const line of lines) {
    const L = net.lines[line];
    if (!L) continue;
    for (const back of [0, 1]) {
      const day = serviceDay(nowSec, back);
      const t = nowSec - day.base;
      for (const g of groupsOf(L)) {
        const svc = (L.groupService?.[g.name] ?? L.service)[day.type];
        if (!svc.hw.length) continue;
        for (const [dep, p] of departures(svc, g)) {
          if (dep > t) break;
          if (dep + p.t[p.t.length - 1] + TERMINAL_DWELL < t) continue;
          out.push(tripState(line, p, day.base + dep, nowSec, `${line}.${p.id}.${day.date.slice(5)}.${Math.round(dep / 60)}`));
        }
      }
    }
  }
  return out;
}

function tripState(line: string, p: NetPattern, start: number, nowSec: number, id: string): TrainState {
  const net = network();
  const n = p.st.length;
  let i = 0;
  while (i + 1 < n && start + p.t[2 * (i + 1)] <= nowSec) i++;
  while (i > 0 && p.stop && !p.stop[i]) i--;
  const stops: TimelineStop[] = [];
  for (let j = i; j < n && stops.length < MAX_STOPS; j++) {
    if (p.stop && !p.stop[j] && j !== n - 1) continue;
    stops.push({ s: net.stations[p.st[j]], a: start + p.t[2 * j], d: start + p.t[2 * j + 1] + (j === n - 1 ? TERMINAL_DWELL : 0) });
  }
  const [dest, destLocal] = net.names[p.dest] ?? [p.dest, p.dest];
  const { stock, cars } = chooseStock(line, id, { express: p.express });
  const short = shortCars(net.lines[line], p.st);
  return {
    id,
    line,
    dest,
    destLocal,
    service: p.express ? 'Express' : undefined,
    serviceLocal: p.express ? '급행' : undefined,
    dir: p.loop ? dest : undefined,
    stock,
    cars: short ?? cars,
    live: false,
    stops,
  };
}
