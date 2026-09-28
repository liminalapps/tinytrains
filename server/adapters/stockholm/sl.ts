// SL Transport departures (https://transport.integration.sl.se, keyless): expected times of the tunnelbana and
// pendeltåg at a ring of stations, gathered per journey into realtime trips for the GTFS kit. The API has one board
// per site, so the sites are polled in turn; each train gets a prediction from a station at most ~10 minutes ahead.
import { politeFetch, type GtfsSchedule, type RealtimeSource, type RtTrip } from '../gtfs/index.ts';

const BASE = 'https://transport.integration.sl.se/v1/sites/';
const UA = 'TinyTrains/0.1 (live transit diorama; https://tinytrains.app)';

/**
 * Sites picked so that every tunnelbana and pendeltåg pattern passes one at least every 10 minutes (hubs first, then
 * the stations where a gap would open, termini included).
 */
const SITES = [
  9001, 9192, 9189, 9294, 9112, 9115, 9117, 9529, 9305, 9220, 9507, 9531, 9527, 9508, 9703, 9325, 9180, 9002, 9509,
  9340, 9320, 9301, 9300, 9306, 9303, 9280, 9285, 9290, 9291, 9288, 9281, 9282, 9260, 9200, 9263, 9140, 9188, 9108,
  9102, 9100, 9103, 9185, 9160, 9166, 9162,
];
/** Sites fetched per refresh (every 30 s): 15, so 30 requests a minute and each board every 90 s. The local budget
 * (60/min) only needs room for one refresh's burst. */
const PER_REFRESH = 15;
/**
 * A journey's calls stay usable this long after the board last listed them. Calls already passed still carry the
 * train's delay to the stops beyond the last polled station (a terminus board lists departures, not arrivals).
 */
const KEEP_S = 1200;

interface Departure {
  state?: string;
  scheduled?: string;
  expected?: string;
  journey?: { id?: number };
  stop_area?: { id?: number };
  line?: { designation?: string; transport_mode?: string };
}

interface Call {
  station: number;
  d: number;
  aimed: number;
  cancelled: boolean;
  seen: number;
}

const wallClock = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Stockholm', hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });

/** Seconds that Stockholm's wall clock is ahead of UTC at `sec`. */
function tzOffset(sec: number): number {
  const p: Record<string, number> = {};
  for (const { type, value } of wallClock.formatToParts(new Date(sec * 1000))) if (type !== 'literal') p[type] = Number(value);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) / 1000 - Math.floor(sec);
}

/** The boards give local wall-clock times without an offset. */
const local = (s: string, offset: number) => Date.parse(`${s}Z`) / 1000 - offset;

/** SL's line designations to line ids of transit.json. */
function lineOf(mode: string | undefined, designation: string | undefined): string | undefined {
  if (!designation) return undefined;
  if (mode === 'METRO') return designation;
  if (mode === 'TRAIN') return `p${designation.replace(/X$/, '')}`;
  return undefined;
}

export function slRealtime(): RealtimeSource {
  const journeys = new Map<string, { line: string; calls: Map<number, Call>; seen: number }>();
  let areaStation: Map<number, number> | undefined;
  let cursor = 0;
  let last = 0;
  let inflight: Promise<void> | undefined;

  async function board(site: number, now: number, offset: number) {
    const res = await politeFetch(`${BASE}${site}/departures?forecast=60`, { headers: { 'user-agent': UA, accept: 'application/json' } }, { perMinute: 60 });
    const body = (await res.json()) as { departures?: Departure[] };
    for (const d of body.departures ?? []) {
      const line = lineOf(d.line?.transport_mode, d.line?.designation);
      const station = d.stop_area?.id != null ? areaStation!.get(d.stop_area.id) : undefined;
      const id = d.journey?.id;
      if (!line || station == null || id == null || !d.scheduled) continue;
      const aimed = local(d.scheduled, offset);
      const key = `${line}|${id}`;
      let j = journeys.get(key);
      if (!j) journeys.set(key, (j = { line, calls: new Map(), seen: now }));
      j.seen = now;
      j.calls.set(station, { station, aimed, d: d.expected ? local(d.expected, offset) : aimed, cancelled: d.state === 'CANCELLED', seen: now });
    }
  }

  async function refresh(nowMs: number, sched: GtfsSchedule) {
    if (!areaStation) {
      // GTFS platform ids embed SL's stop area: 9022001 001051 003 is a platform of area 1051 (T-Centralen).
      areaStation = new Map();
      for (const [stop, i] of Object.entries(sched.data.stops)) if (/^90220\d{11}$/.test(stop)) areaStation.set(Number(stop.slice(7, 13)), i);
    }
    const now = nowMs / 1000;
    const offset = tzOffset(now);
    const sites = Array.from({ length: PER_REFRESH }, (_, k) => SITES[(cursor + k) % SITES.length]);
    cursor = (cursor + PER_REFRESH) % SITES.length;
    const results = await Promise.allSettled(sites.map((s) => board(s, now, offset)));
    const failed = results.filter((r) => r.status === 'rejected');
    if (failed.length) console.warn(`[SL realtime] ${failed.length}/${sites.length} boards failed: ${(failed[0] as PromiseRejectedResult).reason?.message ?? ''}`);
    for (const [k, j] of journeys) {
      for (const [s, c] of j.calls) if (now - c.seen > KEEP_S || c.d < now - KEEP_S) j.calls.delete(s);
      if (!j.calls.size || now - j.seen > KEEP_S) journeys.delete(k);
    }
  }

  return {
    name: 'SL realtime',
    async refresh(nowMs, sched) {
      if (inflight) return inflight;
      if (nowMs - last < 30_000 && nowMs >= last) return;
      last = nowMs;
      inflight = refresh(nowMs, sched).finally(() => (inflight = undefined));
      return inflight;
    },
    trips(nowMs) {
      const now = nowMs / 1000;
      const out: RtTrip[] = [];
      for (const [key, j] of journeys) {
        if (now - j.seen > KEEP_S) continue;
        const calls = [...j.calls.values()].sort((a, b) => a.aimed - b.aimed);
        out.push({
          // Not a schedule key (the adapters match by time): it keeps a journey on the same train between polls.
          key,
          line: j.line,
          cancelled: calls.every((c) => c.cancelled) || undefined,
          stops: calls.map((c) => ({ station: c.station, d: c.d, aimedD: c.aimed, skipped: c.cancelled || undefined })),
        });
      }
      return out.length ? out : undefined;
    },
  };
}
