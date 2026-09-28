import { CITIES } from '../../../shared/cities.ts';
import type { CityId, TimelineStop, TrainState } from '../../../shared/types.ts';
import { readJson } from '../../data.ts';
import type { Adapter } from '../types.ts';
import type { SimData, SimDay, SimLine, SimPattern } from './data.ts';

// The sim kit's runtime: trains simulated from researched headways over an OSM-built network (docs/KIT_SIM.md).

const MAX_STOPS = 16;
const TERMINAL_DWELL = 40;
/** Lingering at the end of the timeline: at a terminal, but not where an express leaves the map. */
const endDwell = (p: SimPattern) => (p.stop && !p.stop[p.st.length - 1] ? 0 : TERMINAL_DWELL);

interface ServiceDay {
  date: string; // YYYY-MM-DD, local
  base: number; // epoch seconds of the service day's local midnight
  type: 0 | 1 | 2; // weekday, Saturday, Sunday/holiday
}

const formatters = new Map<string, Intl.DateTimeFormat>();

/** Local calendar date, weekday and seconds since local midnight of an instant. */
function local(sec: number, tz: string) {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short' });
    formatters.set(tz, f);
  }
  const p = Object.fromEntries(f.formatToParts(new Date(sec * 1000)).map((x) => [x.type, x.value]));
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday);
  return { date: `${p.year}-${p.month}-${p.day}`, dow, secs: Number(p.hour) * 3600 + Number(p.minute) * 60 + Number(p.second) };
}

/** The service day running at `nowSec` (or `back` days before), in the city's time zone. */
export function serviceDay(data: Pick<SimData, 'calendar'>, tz: string, nowSec: number, back = 0): ServiceDay {
  const t = nowSec - data.calendar.dayStart - back * 86400;
  const l = local(t, tz);
  const c = data.calendar;
  const weekendDay = c.weekend.includes(l.dow) && !c.workdays.includes(l.date);
  const type = c.holidays.includes(l.date) || (weekendDay && l.dow !== 6) ? 2 : weekendDay ? 1 : 0;
  return { date: l.date, base: t - l.secs, type };
}

const hash = (s: string) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return (h ^ (h >>> 16)) >>> 0;
};

function headwayAt(day: SimDay, t: number): number {
  let hw = day.hw[0][1];
  for (const [from, h] of day.hw) if (t >= from) hw = h;
  return hw;
}

interface Group {
  name: string; // base name without the direction mark
  patterns: SimPattern[];
  weight: number;
  phase: number;
  lead: number; // largest align offset: departures that early can still be running
}

/** The simulated trains of one city. */
export class SimCity {
  readonly tz: string;
  private groups = new Map<string, Group[]>();

  constructor(readonly city: CityId, readonly data: SimData) {
    this.tz = CITIES[city].tz;
    for (const [id, line] of Object.entries(data.lines)) {
      const byKey = new Map<string, SimPattern[]>();
      for (const p of line.patterns) {
        if (!byKey.has(p.group)) byKey.set(p.group, []);
        byKey.get(p.group)!.push(p);
      }
      const names = [...new Set(line.patterns.map((p) => p.group.slice(0, -1)))];
      this.groups.set(
        id,
        [...byKey].map(([key, patterns]) => ({
          name: key.slice(0, -1),
          patterns,
          weight: patterns.reduce((s, p) => s + p.share, 0),
          phase: names.indexOf(key.slice(0, -1)) / names.length,
          lead: Math.max(0, ...patterns.map((p) => p.align ?? 0)),
        })),
      );
    }
  }

  static load(city: CityId): SimCity {
    return new SimCity(city, readJson<SimData>(`server/data/${city}/sim.json`));
  }

  /** Simulated trains of the given lines at `nowSec`. */
  simulate(lines: Iterable<string>, nowSec: number): TrainState[] {
    const out: TrainState[] = [];
    for (const lineId of lines) {
      const line = this.data.lines[lineId];
      if (!line) continue;
      for (const back of [0, 1]) {
        const day = serviceDay(this.data, this.tz, nowSec, back);
        const t = nowSec - day.base;
        for (const g of this.groups.get(lineId) ?? []) {
          const svc = (line.groups?.[g.name] ?? line.service)[day.type];
          for (const [slot, p] of departures(svc, g)) {
            if (slot - g.lead > t) break;
            const dep = slot - (p.align ?? 0); // leaves its terminal so as to pass the aligned station on the slot
            if (dep + p.t[0] > t) continue;
            if (dep + p.t[p.t.length - 1] + endDwell(p) < t) continue;
            const term = svc.terminals?.[p.from];
            if (term && ((term.first !== undefined && dep < term.first) || (term.last !== undefined && dep > term.last))) continue;
            out.push(this.state(lineId, line, p, day, dep, nowSec));
          }
        }
      }
    }
    return out;
  }

  private state(lineId: string, line: SimLine, p: SimPattern, day: ServiceDay, dep: number, nowSec: number): TrainState {
    const start = day.base + dep;
    const n = p.st.length;
    let i = 0;
    while (i + 1 < n && start + p.t[2 * (i + 1)] <= nowSec) i++;
    while (i > 0 && p.stop && !p.stop[i]) i--;
    const stops: TimelineStop[] = [];
    for (let j = i; j < n && stops.length < MAX_STOPS; j++) {
      // The timeline always runs from the first station to the last, even where an express only passes them (the edge of the map).
      if (p.stop && !p.stop[j] && j !== 0 && j !== n - 1) continue;
      stops.push({ s: this.data.stations[p.st[j]], a: start + p.t[2 * j], d: start + p.t[2 * j + 1] + (j === n - 1 ? endDwell(p) : 0) });
    }
    const id = `${lineId}.${p.id}.${day.date.slice(5)}.${Math.round(dep / 60)}`;
    const mix = p.stock ?? line.stock;
    let r = (hash(id) % 1000) / 1000;
    let stock = mix[mix.length - 1];
    for (const s of mix) {
      if (r < s.share) {
        stock = s;
        break;
      }
      r -= s.share;
    }
    return {
      id,
      line: lineId,
      dest: p.dest[0],
      destLocal: p.dest[1] && p.dest[1] !== p.dest[0] ? p.dest[1] : undefined,
      service: p.service?.[0],
      serviceLocal: p.service?.[1],
      dir: p.dir,
      stock: stock.stock,
      cars: stock.cars,
      live: false,
      stops,
    };
  }
}

/**
 * A group's departures (seconds after midnight from the pattern's terminal): evenly spaced at the headway divided by
 * the group's weight, the patterns taking turns in proportion to their shares (smooth weighted round robin).
 */
function* departures(day: SimDay, g: Group): Generator<[number, SimPattern]> {
  const credit = g.patterns.map(() => 0);
  let t = day.first;
  let phased = false;
  while (t <= day.last) {
    const hw = headwayAt(day, t);
    if (hw === 0) {
      // A gap in service: resume at the next band.
      const next = day.hw.find(([from]) => from > t);
      if (!next) break;
      t = next[0];
      continue;
    }
    if (!phased) {
      phased = true;
      t += g.phase * hw;
      continue;
    }
    let pick = 0;
    g.patterns.forEach((p, i) => {
      credit[i] += p.share;
      if (credit[i] > credit[pick]) pick = i;
    });
    credit[pick] -= g.weight;
    yield [Math.round(t), g.patterns[pick]];
    t += hw / g.weight;
  }
}

const cities = new Map<string, SimCity>();
export const simCity = (city: CityId) => {
  let c = cities.get(city);
  if (!c) cities.set(city, (c = SimCity.load(city)));
  return c;
};

/** One adapter per group of lines, all simulated. */
export function simAdapters(city: CityId, groups: { id: string; name: string; lines: string[] }[], intervalMs = 30_000): Adapter[] {
  return groups.map((g) => ({
    id: g.id,
    city,
    name: g.name,
    live: false,
    intervalMs,
    poll: async (now: number) => simCity(city).simulate(g.lines, now / 1000),
  }));
}
