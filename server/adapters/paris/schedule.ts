// Compact IDFM timetable (built by scripts/build-paris.ts) and the helpers that turn it into train timelines.
// The timeline helpers follow server/adapters/sf/schedule.ts.
import { readJson } from '../../data.ts';
import type { TimelineStop } from '../../../shared/types.ts';

export interface ServiceDef {
  days: string; // '1111100' = Monday..Sunday
  start: number; // YYYYMMDD
  end: number;
  add?: number[];
  rem?: number[];
}

export interface PatternDef {
  l: number; // line index
  d: number; // GTFS direction_id
  c: string; // 'Eastbound', 'Northbound'...
  st: number[]; // station indices
  x?: 0 | 1; // RER: 1 when the train skips stations other trains of the line serve
}

/** Flat trip rows, TRIP_STRIDE numbers each: service, pattern, timing, start (s after the service-day base), head, label. */
export const TRIP_STRIDE = 6;

export interface ParisSchedule {
  built: string;
  /** First and last service date the feed covers, YYYYMMDD. */
  range: [number, number];
  services: ServiceDef[];
  /** Line id and IDFM line code ('C01371'), which realtime feeds use as 'STIF:Line::C01371:'. */
  lines: { id: string; ref: string }[];
  stations: string[];
  /** 'Q:<quay>' / 'SP:<stop place>' -> station index. */
  stopMap: Record<string, number>;
  heads: string[];
  labels: string[];
  pats: PatternDef[];
  /** [a0, d0, a1, d1, ...] offsets in seconds from the trip start. */
  tims: number[][];
  trips: number[];
}

export const TZ = 'Europe/Paris';

// ---------------------------------------------------------------------------
// Service days
// ---------------------------------------------------------------------------

const fmt = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ,
  hourCycle: 'h23',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
});

function localParts(sec: number) {
  const p: Record<string, number> = {};
  for (const { type, value } of fmt.formatToParts(new Date(sec * 1000))) if (type !== 'literal') p[type] = Number(value);
  return p;
}

function tzOffset(sec: number): number {
  const p = localParts(sec);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) / 1000 - sec;
}

export function localYmd(sec: number): number {
  const p = localParts(sec);
  return p.year * 10000 + p.month * 100 + p.day;
}

export function ymdAdd(ymd: number, days: number): number {
  const d = new Date(Date.UTC(Math.floor(ymd / 10000), (Math.floor(ymd / 100) % 100) - 1, ymd % 100) + days * 86400e3);
  return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
}

/** GTFS service-day origin: local noon minus 12 h (correct across DST changes). */
export function dayBase(ymd: number): number {
  const noon = Date.UTC(Math.floor(ymd / 10000), (Math.floor(ymd / 100) % 100) - 1, ymd % 100, 12) / 1000;
  return noon - tzOffset(noon) - 43200;
}

function serviceActive(s: ServiceDef, ymd: number): boolean {
  if (s.rem?.includes(ymd)) return false;
  if (s.add?.includes(ymd)) return true;
  if (ymd < s.start || ymd > s.end) return false;
  const wd = (new Date(Date.UTC(Math.floor(ymd / 10000), (Math.floor(ymd / 100) % 100) - 1, ymd % 100)).getUTCDay() + 6) % 7;
  return s.days[wd] === '1';
}

// ---------------------------------------------------------------------------
// Schedule
// ---------------------------------------------------------------------------

export interface ActiveTrip {
  /** Stable train id: line, service date and trip row. */
  id: string;
  row: number;
  pat: PatternDef;
  /** Station ids of the pattern. */
  st: string[];
  /** Absolute scheduled [a, d] per pattern stop, epoch seconds. */
  times: number[];
}

export class Schedule {
  readonly data: ParisSchedule;
  readonly patStations: string[][];
  readonly lineIndex = new Map<string, number>();
  /** Trip rows are sorted by service: [first row, end row) per service. */
  private svcRows: [number, number][];
  private activeCache = new Map<number, Uint8Array>();

  constructor(data: ParisSchedule) {
    this.data = data;
    this.patStations = data.pats.map((p) => p.st.map((i) => data.stations[i]));
    data.lines.forEach((l, i) => this.lineIndex.set(l.id, i));
    this.svcRows = data.services.map(() => [0, 0]);
    const n = data.trips.length / TRIP_STRIDE;
    for (let r = 0; r < n; r++) {
      const s = data.trips[r * TRIP_STRIDE];
      if (r === 0 || data.trips[(r - 1) * TRIP_STRIDE] !== s) this.svcRows[s][0] = r;
      this.svcRows[s][1] = r + 1;
    }
  }

  static load(): Schedule {
    return new Schedule(readJson<ParisSchedule>('server/data/paris/schedule.json'));
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
    const today = localYmd(now);
    for (const ymd of [ymdAdd(today, -1), today]) {
      const base = dayBase(ymd);
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
          out.push({ id: `${d.lines[pat.l].id}:${ymd}:${r}`, row: r, pat, st: this.patStations[d.trips[o + 1]], times: tim.map((t) => t0 + t) });
        }
      }
    }
    return out;
  }

  head(row: number): string {
    return this.data.heads[this.data.trips[row * TRIP_STRIDE + 4]];
  }

  label(row: number): string {
    return this.data.labels[this.data.trips[row * TRIP_STRIDE + 5]];
  }
}

// ---------------------------------------------------------------------------
// Timelines
// ---------------------------------------------------------------------------

/**
 * Cut a full timeline (flat [a, d] per pattern stop) down to the previous/current stop plus up to `ahead` upcoming stops.
 * Returns null when the train has not left its origin yet (beyond `lead` seconds of dwell) or has finished.
 */
export function windowTimeline(st: string[], times: number[], now: number, from = 0, ahead = 15, lead = 60): TimelineStop[] | null {
  const n = st.length;
  let k = -1;
  for (let i = from; i < n; i++) if (times[2 * i] <= now) k = i;
  if (k < 0) k = from;
  if (k === 0 && times[1] - now > lead) return null;
  if (k === n - 1 && now > times[2 * k + 1]) return null;
  const out: TimelineStop[] = [];
  for (let i = k; i < Math.min(n, k + 1 + ahead); i++) out.push({ s: st[i], a: Math.round(times[2 * i]), d: Math.round(times[2 * i + 1]) });
  if (out[0].a > now) out[0].a = Math.floor(now);
  for (let i = 0; i < out.length; i++) {
    if (i > 0 && out[i].a < out[i - 1].d) out[i].a = out[i - 1].d;
    if (out[i].d < out[i].a) out[i].d = out[i].a;
  }
  return out;
}

export interface RtStop {
  station: string;
  a?: number;
  d?: number;
}

/**
 * Overlay realtime predictions on a trip's scheduled times. Stops the feed doesn't mention inherit the delay of
 * their neighbors through scheduled run times; the stop before the first prediction gets an estimated departure
 * (or a remembered one from an earlier poll). `shownAt` is the stop index the train was shown at last poll.
 */
export function mergeRealtime(
  st: string[],
  sched: number[],
  rt: RtStop[],
  remembered?: Map<number, number>,
  shownAt?: number,
): { times: number[]; from: number } | null {
  const n = st.length;
  const got: (RtStop | undefined)[] = new Array(n);
  let cursor = 0;
  let last = -1;
  for (const u of rt) {
    let j = -1;
    for (let i = cursor; i < n; i++)
      if (st[i] === u.station) {
        j = i;
        break;
      }
    if (j < 0) continue;
    if (j === last && got[j]) got[j] = { station: u.station, a: got[j]!.a ?? u.a, d: u.d ?? got[j]!.d };
    else got[j] = u;
    cursor = j;
    last = j;
  }
  const first = got.findIndex(Boolean);
  if (first < 0) return null;

  const times = new Array<number>(2 * n);
  const run = (i: number) => sched[2 * i] - sched[2 * i - 1];
  const dwell = (i: number) => sched[2 * i + 1] - sched[2 * i];
  for (let i = first; i < n; i++) {
    const u = got[i];
    const est = i === first ? NaN : times[2 * i - 1] + run(i);
    let a = u?.a ?? u?.d ?? est;
    let d = u?.d ?? (u?.a != null ? u.a + Math.max(dwell(i), i === n - 1 ? 30 : 20) : a + dwell(i));
    if (i === n - 1 && u?.d == null) d = a + 30;
    if (i > first && a < times[2 * i - 1]) a = times[2 * i - 1];
    if (d < a) d = a;
    times[2 * i] = a;
    times[2 * i + 1] = d;
  }
  const shown = remembered?.get(first);
  if (shown != null) times[2 * first + 1] = Math.max(shown, times[2 * first]);
  else if (first < n - 1) {
    const hold = Math.min(times[2 * first + 2] - run(first + 1), sched[2 * first + 1]);
    if (hold > times[2 * first + 1] + 60) times[2 * first + 1] = hold;
  }
  if (first < n - 1 && times[2 * first + 2] < times[2 * first + 1]) times[2 * first + 2] = times[2 * first + 1];
  let from = first;
  const back = Math.max(0, Math.min(first - 1, shownAt ?? first - 1));
  for (let p = first - 1; p >= back; p--) {
    const d = remembered?.get(p) ?? times[2 * p + 2] - run(p + 1);
    times[2 * p + 1] = Math.min(d, times[2 * p + 2]);
    times[2 * p] = times[2 * p + 1] - Math.max(dwell(p), p === 0 ? 0 : 20);
    from = p;
  }
  return { times, from };
}

/** Per-train state kept across polls so predictions that change don't make trains jump around. */
export interface TrainMemo {
  seen: number;
  dep: Map<number, number>;
  prev?: { now: number; k: number; d: number; next: number };
}

export function memoFor(memo: Map<string, TrainMemo>, id: string, now: number): TrainMemo {
  let m = memo.get(id);
  if (!m) memo.set(id, (m = { seen: now, dep: new Map() }));
  m.seen = now;
  return m;
}

/**
 * Keep a train continuous with what the previous poll showed: a new timeline starts from wherever the old one
 * places the train right now.
 */
export function stabilize(m: TrainMemo, st: string[], times: number[], from: number, now: number): TimelineStop[] | null {
  const p = m.prev;
  if (p && p.k > from && p.k < st.length) {
    from = p.k;
    times[2 * from] = Math.min(times[2 * from], p.now);
    times[2 * from + 1] = Math.max(times[2 * from + 1], times[2 * from], p.d);
  }
  if (p && p.k >= from && p.k < st.length - 1) {
    const k = p.k;
    const next = times[2 * k + 2];
    if (p.d >= now) {
      if (times[2 * k + 1] < now && next > now + 10) times[2 * k + 1] = now;
    } else if (now >= p.next) {
      if (next > now) (times[2 * k + 2] = now), (times[2 * k + 3] = Math.max(times[2 * k + 3], now));
    } else {
      const f = (now - p.d) / Math.max(1, p.next - p.d);
      if (next > now && f < 0.97) {
        times[2 * k + 1] = Math.min(now, (now - f * next) / (1 - f));
        times[2 * k] = Math.min(times[2 * k], times[2 * k + 1]);
      }
    }
  }
  const stops = windowTimeline(st, times, now, from);
  if (!stops) return null;
  const k = st.indexOf(stops[0].s, from);
  if (stops[0].d <= now) m.dep.set(k, stops[0].d);
  m.prev = { now, k, d: stops[0].d, next: stops[1]?.a ?? NaN };
  return stops;
}
