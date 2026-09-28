// Packed GTFS timetable (written by scripts/lib/gtfs) and its runtime view: service days, active trips, lookups.
import { CITIES } from '../../../shared/cities.ts';
import type { CityId } from '../../../shared/types.ts';
import { readJson } from '../../data.ts';

export interface ServiceDef {
  days: string; // '1111100' = Monday..Sunday
  start: number; // YYYYMMDD
  end: number;
  add?: number[];
  rem?: number[];
}

export interface StockMix {
  stock: string;
  cars: number;
  share?: number;
}

export interface PatternDef {
  l: number; // line index
  st: number[]; // station indices
  d?: number; // GTFS direction_id
  c?: number; // direction label (strs index)
  s?: number; // service label (strs index)
  sl?: number; // local service label (strs index)
  /** Destination changes along the trip: [stop index, strs index, ...], each applying from that stop on. */
  hd?: number[];
  /** Direction label changes along the trip, same layout. */
  hc?: number[];
}

/** Flat trip rows of TRIP_STRIDE numbers: service, pattern, timing, start (s after the service-day base),
 * dest, destLocal, label (strs indices), consist (1-based index into consists, 0 = the line's mix). */
export const TRIP_STRIDE = 8;

export interface GtfsScheduleData {
  v: 1;
  city: CityId;
  built: string;
  /** First and last service date the feed covers, YYYYMMDD. */
  range: [number, number];
  services: ServiceDef[];
  lines: { id: string; system: string; fleet: StockMix[] }[];
  stations: string[];
  /** GTFS stop_id -> station index. */
  stops: Record<string, number>;
  /** GTFS route_id -> line index. */
  routes: Record<string, number>;
  strs: string[];
  pats: PatternDef[];
  /** [a0, d0, a1, d1, ...] offsets in seconds from the trip start. */
  tims: number[][];
  trips: number[];
  consists?: StockMix[];
  /** Realtime trip key per trip row (GTFS trip_id unless configured otherwise). */
  keys?: string[];
  /** Extra keys -> row: follow-on trips joined into their block's row (chainBlocks). */
  keyAlias?: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Service days
// ---------------------------------------------------------------------------

export function ymdAdd(ymd: number, days: number): number {
  const d = new Date(Date.UTC(Math.floor(ymd / 10000), (Math.floor(ymd / 100) % 100) - 1, ymd % 100) + days * 86400e3);
  return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
}

function serviceActive(s: ServiceDef, ymd: number): boolean {
  if (s.rem?.includes(ymd)) return false;
  if (s.add?.includes(ymd)) return true;
  if (ymd < s.start || ymd > s.end) return false;
  const wd = (new Date(Date.UTC(Math.floor(ymd / 10000), (Math.floor(ymd / 100) % 100) - 1, ymd % 100)).getUTCDay() + 6) % 7;
  return s.days[wd] === '1';
}

export class Clock {
  private fmt: Intl.DateTimeFormat;
  constructor(tz: string) {
    this.fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
  }
  private parts(sec: number) {
    const p: Record<string, number> = {};
    for (const { type, value } of this.fmt.formatToParts(new Date(sec * 1000))) if (type !== 'literal') p[type] = Number(value);
    return p;
  }
  /** Local date of an instant, YYYYMMDD. */
  ymd(sec: number): number {
    const p = this.parts(sec);
    return p.year * 10000 + p.month * 100 + p.day;
  }
  /** GTFS service-day origin: local noon minus 12 h (correct across DST changes). */
  base(ymd: number): number {
    const noon = Date.UTC(Math.floor(ymd / 10000), (Math.floor(ymd / 100) % 100) - 1, ymd % 100, 12) / 1000;
    const p = this.parts(noon);
    const offset = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) / 1000 - noon;
    return noon - offset - 43200;
  }
}

// ---------------------------------------------------------------------------
// Runtime schedule
// ---------------------------------------------------------------------------

export interface ActiveTrip {
  /** Stable train id: line, service date and trip row. */
  id: string;
  row: number;
  /** Service date, YYYYMMDD. */
  date: number;
  line: string;
  pat: PatternDef;
  /** Station ids of the pattern. */
  st: string[];
  /** Absolute scheduled [a, d] per pattern stop, epoch seconds. */
  times: number[];
}

const loaded = new Map<string, GtfsSchedule>();

export class GtfsSchedule {
  readonly data: GtfsScheduleData;
  readonly clock: Clock;
  readonly patStations: string[][];
  readonly lineIndex = new Map<string, number>();
  private stationIdx = new Map<string, number>();
  private keyIdx?: Map<string, number[]>;
  /** Trip rows are sorted by service: [first row, end row) per service. */
  private svcRows: [number, number][];
  private activeCache = new Map<number, Uint8Array>();

  constructor(data: GtfsScheduleData) {
    this.data = data;
    this.clock = new Clock(CITIES[data.city].tz);
    this.patStations = data.pats.map((p) => p.st.map((i) => data.stations[i]));
    data.lines.forEach((l, i) => this.lineIndex.set(l.id, i));
    data.stations.forEach((s, i) => this.stationIdx.set(s, i));
    this.svcRows = data.services.map(() => [0, 0]);
    const n = data.trips.length / TRIP_STRIDE;
    for (let r = 0; r < n; r++) {
      const s = data.trips[r * TRIP_STRIDE];
      if (r === 0 || data.trips[(r - 1) * TRIP_STRIDE] !== s) this.svcRows[s][0] = r;
      this.svcRows[s][1] = r + 1;
    }
  }

  /** Load (once per isolate) a packed schedule, e.g. 'server/data/vienna/schedule.json'. */
  static load(path: string): GtfsSchedule {
    let s = loaded.get(path);
    if (!s) loaded.set(path, (s = new GtfsSchedule(readJson<GtfsScheduleData>(path))));
    return s;
  }

  /** Station index of a GTFS stop_id, if it belongs to the network. */
  station(stopId: string): number | undefined {
    return this.data.stops[stopId];
  }

  stationIndex(id: string): number | undefined {
    return this.stationIdx.get(id);
  }

  /** Trip rows of a realtime key (schedules built with realtimeKeys). A key can repeat across service days' rows. */
  rowsOfKey(key: string): number[] {
    if (!this.data.keys) return [];
    if (!this.keyIdx) {
      this.keyIdx = new Map();
      this.data.keys.forEach((k, r) => k && (this.keyIdx!.get(k) ?? this.keyIdx!.set(k, []).get(k)!).push(r));
      for (const [k, r] of Object.entries(this.data.keyAlias ?? {})) (this.keyIdx.get(k) ?? this.keyIdx.set(k, []).get(k)!).push(r);
    }
    return this.keyIdx.get(key) ?? [];
  }

  rowOfKey(key: string): number | undefined {
    return this.rowsOfKey(key)[0];
  }

  /** Whether the timetable runs a trip row on a service date. */
  runsOn(row: number, date: number): boolean {
    return !!this.activeServices(date)[this.data.trips[row * TRIP_STRIDE]];
  }

  get hasKeys(): boolean {
    return !!this.data.keys;
  }

  /**
   * Services running on a date. Past the end of the feed (or before its start) the same weekday of the nearest
   * covered week stands in, so trains keep running until the data is rebuilt.
   */
  private activeServices(ymd: number): Uint8Array {
    let hit = this.activeCache.get(ymd);
    if (hit) return hit;
    const [first, last] = this.data.range;
    let day = ymd;
    while (day > last) day = ymdAdd(day, -7);
    while (day < first) day = ymdAdd(day, 7);
    hit = Uint8Array.from(this.data.services, (s) => (serviceActive(s, day) ? 1 : 0));
    if (this.activeCache.size > 8) this.activeCache.clear();
    this.activeCache.set(ymd, hit);
    return hit;
  }

  /** Trips of yesterday's and today's service days on the given lines whose span overlaps [now - pre, now + post]. */
  active(now: number, lines: Set<number>, pre = 0, post = 0): ActiveTrip[] {
    const out: ActiveTrip[] = [];
    const d = this.data;
    const today = this.clock.ymd(now);
    for (const ymd of [ymdAdd(today, -1), today]) {
      const base = this.clock.base(ymd);
      const on = this.activeServices(ymd);
      for (let s = 0; s < on.length; s++) {
        if (!on[s]) continue;
        const [r0, r1] = this.svcRows[s];
        for (let r = r0; r < r1; r++) {
          const o = r * TRIP_STRIDE;
          const pat = d.pats[d.trips[o + 1]];
          if (!lines.has(pat.l)) continue;
          const tim = d.tims[d.trips[o + 2]];
          const t0 = base + d.trips[o + 3];
          if (t0 + tim[0] > now + post || t0 + tim[tim.length - 1] < now - pre) continue;
          const line = d.lines[pat.l].id;
          out.push({ id: `${line}:${ymd}:${r}`, row: r, date: ymd, line, pat, st: this.patStations[d.trips[o + 1]], times: tim.map((t) => t0 + t) });
        }
      }
    }
    return out;
  }

  /** One trip row on a given service date, whether or not the timetable runs it then (for late realtime trips). */
  trip(row: number, date: number): ActiveTrip {
    const d = this.data;
    const o = row * TRIP_STRIDE;
    const pat = d.pats[d.trips[o + 1]];
    const t0 = this.clock.base(date) + d.trips[o + 3];
    const line = d.lines[pat.l].id;
    return { id: `${line}:${date}:${row}`, row, date, line, pat, st: this.patStations[d.trips[o + 1]], times: d.tims[d.trips[o + 2]].map((t) => t0 + t) };
  }

  private patRows?: Int32Array;
  private patCount?: Int32Array;

  /** Patterns of a line with a representative trip row and the number of trips using each. */
  patterns(line: number): { pat: number; row: number; trips: number }[] {
    if (!this.patRows) {
      this.patRows = new Int32Array(this.data.pats.length).fill(-1);
      this.patCount = new Int32Array(this.data.pats.length);
      for (let r = 0; r < this.data.trips.length / TRIP_STRIDE; r++) {
        const p = this.data.trips[r * TRIP_STRIDE + 1];
        if (this.patRows[p] < 0) this.patRows[p] = r;
        this.patCount![p]++;
      }
    }
    const out: { pat: number; row: number; trips: number }[] = [];
    this.data.pats.forEach((p, i) => p.l === line && this.patRows![i] >= 0 && out.push({ pat: i, row: this.patRows![i], trips: this.patCount![i] }));
    return out;
  }

  str(i: number | undefined): string | undefined {
    return i ? this.data.strs[i] : undefined;
  }

  /** The value of a [stop index, strs index, ...] change list at stop k. */
  private at(list: number[], k: number): string | undefined {
    let v: number | undefined;
    for (let i = 0; i < list.length && list[i] <= k; i += 2) v = list[i + 1];
    return this.str(v);
  }

  /** Destination shown at pattern stop k (loop services change their sign on the way). */
  destAt(row: number, pat: PatternDef, k: number): string {
    return (pat.hd && this.at(pat.hd, k)) || this.dest(row);
  }

  dirAt(pat: PatternDef, k: number): string | undefined {
    return (pat.hc && this.at(pat.hc, k)) || this.str(pat.c);
  }

  dest(row: number): string {
    return this.data.strs[this.data.trips[row * TRIP_STRIDE + 4]];
  }

  destLocal(row: number): string | undefined {
    return this.str(this.data.trips[row * TRIP_STRIDE + 5]);
  }

  label(row: number): string | undefined {
    return this.str(this.data.trips[row * TRIP_STRIDE + 6]);
  }

  key(row: number): string | undefined {
    return this.data.keys?.[row];
  }

  /** The trip's stock and consist length: a per-trip override, else the line's mix shared out by trip. */
  consist(row: number, line: number): { stock: string; cars: number } {
    const c = this.data.trips[row * TRIP_STRIDE + 7];
    if (c) {
      const m = this.data.consists![c - 1];
      return { stock: m.stock, cars: m.cars };
    }
    const mix = this.data.lines[line].fleet;
    let f = hash(row) * mix.reduce((t, m) => t + (m.share ?? 1), 0);
    for (const m of mix) {
      if (f < (m.share ?? 1)) return { stock: m.stock, cars: m.cars };
      f -= m.share ?? 1;
    }
    return { stock: mix[0].stock, cars: mix[0].cars };
  }
}

function hash(n: number): number {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
