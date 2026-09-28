import type { TimelineStop, TrainState } from '../../../shared/types.ts';
import type { Adapter } from '../types.ts';
import { realtimeError, realtimeTrips, type RtTrip } from './gtfsrt.ts';
import { LINE_BY_ID, LINES, RING, type BerlinMode } from './lines.ts';
import { radarError, radarTrips, type RadarTrip } from './radar.ts';
import { activeTrips, getSchedule, memoFor, mergeRealtime, stabilize, type ActiveTrip, type RtStop, type Schedule, type TrainMemo } from './schedule.ts';
import { pickStock } from './stock.ts';

export interface SystemOptions {
  id: string;
  mode: BerlinMode;
  /** Source names: with realtime data, and when running from the timetable only. */
  name: string;
  timetableName: string;
  /** HAFAS radar product to refine the timetable with ('subway', 'tram'). */
  radar?: string;
}

const DWELL: Record<BerlinMode, number> = { u: 20, s: 30, t: 15 };

let allRoutes: Set<string> | undefined;
const routesOf = (sched: Schedule) => (allRoutes ??= new Set(Object.keys(sched.routes)));

/** GTFS-RT updates keyed by `${tripId}|${date}`, plus a fallback by line, station and planned time for other feed versions. */
function indexRealtime(sched: Schedule, active: ActiveTrip[], rt: RtTrip[]): Map<ActiveTrip, RtTrip> {
  const out = new Map<ActiveTrip, RtTrip>();
  const byId = new Map(rt.map((t) => [`${t.tripId}|${t.date}`, t]));
  const unmatched = new Set(rt);
  for (const t of active) {
    const u = byId.get(`${t.row[0]}|${t.date}`);
    if (u) {
      out.set(t, u);
      unmatched.delete(u);
    }
  }
  if (!unmatched.size) return out;
  // A feed built from a newer GTFS than ours: match by line, first mapped station and planned time.
  const taken = new Set(out.keys());
  for (const u of unmatched) {
    const line = sched.routes[u.routeId];
    const first = u.stops.find((s) => sched.stops[s.stop] && s.d);
    if (!line || !first) continue;
    const station = sched.stops[first.stop];
    const planned = first.d! - (first.dd ?? 0);
    let best: ActiveTrip | undefined;
    let bestDiff = 90;
    for (const t of active) {
      if (taken.has(t) || t.pat.line !== line) continue;
      const i = t.pat.st.indexOf(station);
      if (i < 0) continue;
      const diff = Math.abs(t.times[2 * i + 1] - planned);
      if (diff < bestDiff) (best = t), (bestDiff = diff);
    }
    if (best) {
      out.set(best, u);
      taken.add(best);
    }
  }
  return out;
}

/** Radar trips matched to scheduled trips by line and planned times at the stations they report. */
function indexRadar(active: ActiveTrip[], radar: RadarTrip[], mode: BerlinMode): Map<ActiveTrip, RadarTrip> {
  const out = new Map<ActiveTrip, RadarTrip>();
  const byLine = new Map<string, ActiveTrip[]>();
  for (const t of active) byLine.set(t.pat.line, [...(byLine.get(t.pat.line) ?? []), t]);
  for (const r of radar) {
    if (!r.rt && !r.cancelled) continue;
    const votes = new Map<ActiveTrip, number>();
    for (const c of r.calls) {
      const planned = c.pd ?? c.pa;
      if (planned === undefined) continue;
      for (const t of byLine.get(r.line) ?? []) {
        const i = t.pat.st.indexOf(`${mode}${c.station}`);
        if (i >= 0 && Math.min(Math.abs(t.times[2 * i + 1] - planned), Math.abs(t.times[2 * i] - planned)) <= 60) votes.set(t, (votes.get(t) ?? 0) + 1);
      }
    }
    const best = [...votes].sort((a, b) => b[1] - a[1])[0];
    if (best && best[1] >= 2 && !out.has(best[0])) out.set(best[0], r);
  }
  return out;
}

export function createSystem(o: SystemOptions): Adapter {
  const lines = new Set(LINES.filter((l) => l.mode === o.mode).map((l) => l.id));
  const memo = new Map<string, TrainMemo>();
  let liveShare = 0;

  async function poll(nowMs: number): Promise<TrainState[]> {
    const now = nowMs / 1000;
    const sched = getSchedule();
    const [rt, radar] = await Promise.all([
      realtimeTrips(now, routesOf(sched)),
      o.radar ? radarTrips(now, o.radar) : Promise.resolve(null),
    ]);
    const active = activeTrips(sched, now, 3600, 1800, lines);
    const rtMatch = rt ? indexRealtime(sched, active, rt) : new Map<ActiveTrip, RtTrip>();
    const radarMatch = radar ? indexRadar(active, radar, o.mode) : new Map<ActiveTrip, RadarTrip>();

    const trains: TrainState[] = [];
    const ids = new Set<string>();
    for (const t of active) {
      const [tripId, , , , , head] = t.row;
      const id = `${t.pat.line}-${tripId}-${t.date % 10000}`;
      if (ids.has(id)) continue;
      const st = t.pat.st;
      const updates: RtStop[] = [];
      const u = rtMatch.get(t);
      const r = radarMatch.get(t);
      if (u?.canceled || r?.cancelled) continue;
      if (u && u.stops.some((s) => s.ad !== undefined || s.dd !== undefined)) {
        // VBB rounds predicted times to the minute: apply the delays to the to-the-second timetable instead.
        let i = 0;
        for (const s of u.stops) {
          const station = sched.stops[s.stop];
          const j = station && !s.skipped ? st.indexOf(station, i) : -1;
          if (j < 0) continue;
          i = j;
          const a = s.ad !== undefined ? t.times[2 * j] + s.ad : s.a;
          const d = s.dd !== undefined ? t.times[2 * j + 1] + s.dd : s.d;
          if (a || d) updates.push({ station, a, d });
        }
      } else if (r) {
        // Same for the radar: its delays, applied to the timetable.
        let i = 0;
        for (const c of r.calls) {
          const station = `${o.mode}${c.station}`;
          const j = c.rt ? st.indexOf(station, i) : -1;
          if (j < 0) continue;
          i = j;
          const a = c.a !== undefined && c.pa !== undefined ? t.times[2 * j] + c.a - c.pa : undefined;
          const d = c.d !== undefined && c.pd !== undefined ? t.times[2 * j + 1] + c.d - c.pd : undefined;
          if (a || d) updates.push({ station, a, d });
        }
      }
      const m = memoFor(memo, id, now, st);
      let times = t.times.slice();
      let from = 0;
      let live = false;
      let delay: number | undefined;
      if (updates.length) {
        const merged = mergeRealtime(st, t.times, updates, DWELL[o.mode], m.dep, m.prev?.k);
        if (merged) {
          times = merged.times;
          from = merged.from;
          live = true;
        }
      }
      const stops: TimelineStop[] | null = stabilize(m, st, times, from, now);
      if (!stops) continue;
      if (live) {
        const next = Math.min(st.indexOf(stops[0].s, from) + 1, st.length - 1);
        delay = Math.round(times[2 * next + 1] - t.times[2 * next + 1]);
      }
      ids.add(id);
      const line = LINE_BY_ID.get(t.pat.line)!;
      trains.push({
        id,
        line: line.id,
        dest: sched.heads[head],
        dir: RING[line.id] ?? t.pat.bound,
        live,
        delay,
        stops,
        ...pickStock(line, tripId),
      });
    }
    for (const [id, m] of memo) if (now - m.seen > 900) memo.delete(id);
    liveShare = trains.length ? trains.filter((t) => t.live).length / trains.length : 0;
    if (rt === null && o.mode === 's') console.warn(`[${o.id}] GTFS-RT unavailable (${realtimeError() ?? 'stale'}), timetable only`);
    if (o.radar && radar === null && radarError()) console.warn(`[${o.id}] radar unavailable (${radarError()})`);
    return trains;
  }

  return {
    id: o.id,
    city: 'berlin',
    get name() {
      return liveShare > 0.2 ? o.name : o.timetableName;
    },
    get live() {
      return liveShare > 0.2;
    },
    intervalMs: 20_000,
    poll,
  };
}
