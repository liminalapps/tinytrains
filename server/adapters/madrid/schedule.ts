// Compact timetables built by scripts/build-madrid.ts, plus the helpers that turn them into train timelines.
import { readJson } from '../../data.ts';
import type { TimelineStop } from '../../../shared/types.ts';

export interface PatternDef {
  line: string;
  dir: number; // GTFS direction_id
  dn: string; // direction label: 'Northbound', 'Clockwise'...
  v?: string; // branch of a line with several services (Metro 7B MetroEste, 9B TFM, 10B MetroNorte)
  st: string[]; // station ids
}

/**
 * [pattern, timing, start (s after service-day base), headsign, day-type mask, label, every, until].
 * With `every`, the row is a frequency series: runs start at start, start + every, ... while < until.
 */
export type TripRow = [number, number, number, number, number, string, number?, number?];

export interface Schedule {
  built: string;
  /** Explicit service dates (YYYYMMDD) and their day type. */
  dates: Record<string, number>;
  /** Day type for Monday..Sunday on dates not listed; public holidays use Sunday's. */
  week: number[];
  holidays: number[];
  /** Feed stop_id -> station id, for matching realtime feeds. */
  stopMap: Record<string, string>;
  /** Feed service_id -> service date (Renfe publishes one service per day). */
  services: Record<string, number>;
  heads: string[];
  pats: PatternDef[];
  /** Flat [a0, d0, a1, d1, ...] offsets in seconds from the run start. */
  tims: number[][];
  trips: TripRow[];
}

export const TZ = 'Europe/Madrid';

export function loadSchedule(name: string): Schedule {
  return readJson<Schedule>(`server/data/madrid/${name}.json`);
}

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

/** Local time minus UTC, seconds. */
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

/** Monday = 0 ... Sunday = 6. */
export function weekday(ymd: number): number {
  return (new Date(Date.UTC(Math.floor(ymd / 10000), (Math.floor(ymd / 100) % 100) - 1, ymd % 100)).getUTCDay() + 6) % 7;
}

/** The day type that runs on a date: the feed's own when it covers the date, else the weekday's (Sunday's on holidays). */
export function dayType(sched: Schedule, ymd: number): number {
  return sched.dates[ymd] ?? sched.week[sched.holidays.includes(ymd) ? 6 : weekday(ymd)];
}

// ---------------------------------------------------------------------------
// Timelines
// ---------------------------------------------------------------------------

export interface ActiveTrip {
  id: string;
  row: TripRow;
  pat: PatternDef;
  ymd: number;
  /** Absolute scheduled [a, d] per pattern stop, epoch seconds. */
  times: number[];
}

/** Runs of yesterday's and today's service days whose scheduled span overlaps [now - pre, now + post]. */
export function activeTrips(sched: Schedule, prefix: string, now: number, pre = 0, post = 0): ActiveTrip[] {
  const out: ActiveTrip[] = [];
  const today = localYmd(now);
  for (const ymd of [ymdAdd(today, -1), today]) {
    const base = dayBase(ymd);
    const bit = 1 << dayType(sched, ymd);
    for (const row of sched.trips) {
      if (!(row[4] & bit)) continue;
      const tim = sched.tims[row[1]];
      const first = tim[0], last = tim[tim.length - 1];
      const every = row[6];
      if (!every) {
        const t0 = base + row[2];
        if (t0 + first > now + post || t0 + last < now - pre) continue;
        out.push({ id: `${prefix}:${ymd}:${row[5]}`, row, pat: sched.pats[row[0]], ymd, times: tim.map((t) => t0 + t) });
        continue;
      }
      const runs = Math.ceil((row[7]! - row[2]) / every);
      const k0 = Math.max(0, Math.ceil((now - pre - last - base - row[2]) / every));
      const k1 = Math.min(runs - 1, Math.floor((now + post - first - base - row[2]) / every));
      for (let k = k0; k <= k1; k++) {
        const start = row[2] + k * every;
        const t0 = base + start;
        out.push({ id: `${prefix}:${ymd}:${row[0]}.${start}`, row, pat: sched.pats[row[0]], ymd, times: tim.map((t) => t0 + t) });
      }
    }
  }
  return out;
}

/**
 * Cut a full timeline (flat [a, d] per pattern stop) down to the previous/current stop plus up to `ahead` upcoming stops.
 * Returns null when the train has not left its origin yet (beyond `lead` seconds of dwell) or has finished.
 */
export function windowTimeline(st: string[], times: number[], now: number, from = 0, ahead = 15, lead = 60): TimelineStop[] | null {
  const n = st.length;
  let k = -1;
  for (let i = from; i < n; i++) if (times[2 * i] <= now) k = i;
  if (k < 0) k = from;
  if (k === 0 && times[1] - now > lead) return null; // still waiting at its origin
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

/** Per-train state kept across polls so predictions that change don't make trains jump around. */
export interface TrainMemo {
  seen: number;
  /** What the previous poll showed: stops[0] pattern index and its departure, and the next arrival. */
  prev?: { now: number; k: number; d: number; next: number };
  /** The stop pattern the indices above refer to. */
  pat?: string;
}

/** Get or create a train's memo; forget it when the trip's stop pattern changes. */
export function memoFor<T extends TrainMemo>(memo: Map<string, T>, id: string, now: number, st: string[]): T {
  const pat = st.join('>');
  let m = memo.get(id);
  if (!m || m.pat !== pat) memo.set(id, (m = { seen: now, pat } as T));
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
    // The feed moved the train back to an earlier stop: keep it where it was shown.
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
  m.prev = { now, k, d: stops[0].d, next: stops[1]?.a ?? NaN };
  return stops;
}
