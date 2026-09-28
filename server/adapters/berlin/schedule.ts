// Compact VBB GTFS timetable (built by scripts/build-berlin.ts) plus the helpers that turn it into train timelines.
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
  line: string;
  dir: number; // GTFS direction_id
  bound?: string; // 'Northbound'... from the first to the last station
  st: string[]; // station ids, clipped to the map
}

/** [tripId, serviceId, pattern, timing, start (s after service-day base), headsign] */
export type TripRow = [string, string, number, number, number, number];

export interface Schedule {
  built: string;
  services: Record<string, ServiceDef>;
  /** GTFS route_id -> line id. */
  routes: Record<string, string>;
  /** GTFS stop_id (platform) -> station id, for matching realtime feeds. */
  stops: Record<string, string>;
  heads: string[];
  pats: PatternDef[];
  /** Flat [a0, d0, a1, d1, ...] offsets in seconds from the trip start. */
  tims: number[][];
  trips: TripRow[];
}

export const SCHEDULE_FILE = 'server/data/berlin/schedule.json';

let loaded: Schedule | undefined;
export const getSchedule = () => (loaded ??= readJson<Schedule>(SCHEDULE_FILE));

// ---------------------------------------------------------------------------
// Service days (Europe/Berlin)
// ---------------------------------------------------------------------------

const fmt = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Europe/Berlin',
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

const toDate = (ymd: number) => new Date(Date.UTC(Math.floor(ymd / 10000), (Math.floor(ymd / 100) % 100) - 1, ymd % 100));
const weekday = (ymd: number) => (toDate(ymd).getUTCDay() + 6) % 7; // 0 = Monday

export function ymdAdd(ymd: number, days: number): number {
  const d = new Date(toDate(ymd).getTime() + days * 86400e3);
  return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
}

/** GTFS service-day origin: local noon minus 12 h (correct across DST changes). */
export function dayBase(ymd: number): number {
  const noon = Date.UTC(Math.floor(ymd / 10000), (Math.floor(ymd / 100) % 100) - 1, ymd % 100, 12) / 1000;
  return noon - tzOffset(noon) - 43200;
}

export function serviceActive(s: ServiceDef, ymd: number): boolean {
  if (s.rem?.includes(ymd)) return false;
  if (s.add?.includes(ymd)) return true;
  if (ymd < s.start || ymd > s.end) return false;
  return s.days[weekday(ymd)] === '1';
}

const ranges = new WeakMap<Schedule, [number, number]>();

/**
 * The timetable day to run for a calendar day. Outside the feed's validity (a stale build), use the same
 * weekday one week inside the valid range, so the map keeps showing a typical service.
 */
export function serviceDay(sched: Schedule, ymd: number): number {
  let r = ranges.get(sched);
  if (!r) {
    const all = Object.values(sched.services);
    r = [Math.min(...all.map((s) => s.start || Infinity)), Math.max(...all.map((s) => s.end))];
    ranges.set(sched, r);
  }
  const [start, end] = r;
  if (ymd > end) return ymdAdd(end, -7 - ((weekday(end) - weekday(ymd) + 7) % 7));
  if (ymd < start) return ymdAdd(start, 7 + ((weekday(ymd) - weekday(start) + 7) % 7));
  return ymd;
}

export interface ActiveTrip {
  row: TripRow;
  pat: PatternDef;
  /** Absolute scheduled [a, d] per pattern stop, epoch seconds. */
  times: number[];
  /** Service date YYYYMMDD the trip belongs to (as in GTFS-RT start_date). */
  date: number;
}

/** Trips of yesterday's and today's service days whose scheduled span overlaps [now - pre, now + post]. */
export function activeTrips(sched: Schedule, now: number, pre = 0, post = 0, lines?: Set<string>): ActiveTrip[] {
  const out: ActiveTrip[] = [];
  const today = localYmd(now);
  for (const ymd of [ymdAdd(today, -1), today]) {
    const base = dayBase(ymd);
    const sday = serviceDay(sched, ymd);
    const on = new Set(Object.keys(sched.services).filter((id) => serviceActive(sched.services[id], sday)));
    for (const row of sched.trips) {
      if (!on.has(row[1])) continue;
      const pat = sched.pats[row[2]];
      if (lines && !lines.has(pat.line)) continue;
      const tim = sched.tims[row[3]];
      const t0 = base + row[4];
      if (t0 + tim[0] > now + post || t0 + tim[tim.length - 1] < now - pre) continue;
      out.push({ row, pat, times: tim.map((t) => t0 + t), date: ymd });
    }
  }
  return out;
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
 * Returns the absolute [a, d] list and the first usable index.
 */
export function mergeRealtime(
  st: string[],
  sched: number[],
  rt: RtStop[],
  minDwell: number,
  remembered?: Map<number, number>,
  shownAt?: number,
): { times: number[]; from: number } | null {
  const n = st.length;
  const got: (RtStop | undefined)[] = new Array(n);
  let cursor = 0;
  for (const u of rt) {
    let j = -1;
    for (let i = cursor; i < n; i++) {
      if (st[i] === u.station) {
        j = i;
        break;
      }
    }
    if (j < 0) continue;
    got[j] = got[j] ? { station: u.station, a: got[j]!.a ?? u.a, d: u.d ?? got[j]!.d } : u;
    cursor = j;
  }
  const first = got.findIndex(Boolean);
  if (first < 0) return null;

  const times = new Array<number>(2 * n);
  const run = (i: number) => sched[2 * i] - sched[2 * i - 1];
  const dwell = (i: number) => sched[2 * i + 1] - sched[2 * i];
  for (let i = first; i < n; i++) {
    const u = got[i];
    let a = u?.a ?? u?.d ?? times[2 * i - 1] + run(i);
    let d = u?.d ?? (u?.a != null ? u.a + dwell(i) : a + dwell(i));
    if (i > first && a < times[2 * i - 1]) a = times[2 * i - 1];
    if (d < a) d = a;
    // Feeds often give one time per stop: stand for a realistic dwell, arriving early rather than leaving late.
    if (i === n - 1) d = Math.max(d, a + minDwell);
    else if (d - a < minDwell / 2) a = i > first ? Math.max(times[2 * i - 1] + (d - times[2 * i - 1]) * 0.6, d - minDwell) : d - minDwell;
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
  /** Departures already shown as past, by pattern index. */
  dep: Map<number, number>;
  /** What the previous poll showed: stops[0] index and its departure, and the next arrival. */
  prev?: { now: number; k: number; d: number; next: number };
  pat?: string;
}

export function memoFor(memo: Map<string, TrainMemo>, id: string, now: number, st: string[]): TrainMemo {
  const pat = st.join('>');
  let m = memo.get(id);
  if (!m || m.pat !== pat) memo.set(id, (m = { seen: now, dep: new Map(), pat }));
  m.seen = now;
  return m;
}

/**
 * Keep a train continuous with what the previous poll showed: a new timeline starts from wherever the old one
 * places the train right now. A running train whose predicted arrival moved gets a re-based departure, so it
 * carries on from the spot where it is drawn at a new speed instead of jumping.
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
      if (times[2 * k + 1] < now && next > now + 10) times[2 * k + 1] = now; // still at the platform
    } else if (now >= p.next) {
      if (next > now) (times[2 * k + 2] = now), (times[2 * k + 3] = Math.max(times[2 * k + 3], now)); // already in
    } else {
      const f = (now - p.d) / Math.max(1, p.next - p.d); // running: keep the spot, change the speed
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
