// Muni and Caltrain: timetable simulation from static GTFS, upgraded to 511.org GTFS-realtime when API_511_KEY is set.
import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import type { TrainState } from '../../../shared/types.ts';
import type { Adapter } from '../types.ts';
import { activeTrips, loadSchedule, memoFor, mergeRealtime, stabilize, windowTimeline, type ActiveTrip, type PatternDef, type RtStop, type TrainMemo, type TripRow } from './schedule.ts';

type RtTrip = GtfsRealtimeBindings.transit_realtime.ITripUpdate;

export interface TimetableOptions {
  id: string;
  name: string;
  schedule: string; // server/data/sf/<schedule>.json
  agency511: string; // 511 operator id: 'SF' (Muni) or 'CT' (Caltrain)
  key?: string;
  /** 511 allows 60 requests/hour per key by default, shared by every agency polled with it. */
  rtEveryMs: number;
  train(row: TripRow, pat: PatternDef): Pick<TrainState, 'stock' | 'cars' | 'dir'> & Partial<Pick<TrainState, 'service' | 'label'>>;
}

export function timetableAdapter(o: TimetableOptions): Adapter {
  const sched = loadSchedule(o.schedule);
  const memo = new Map<string, TrainMemo>();
  let rt: RtTrip[] = [];
  let rtAt = 0;

  async function refreshRealtime(now: number) {
    if (!o.key || now - rtAt < o.rtEveryMs / 1000) return;
    rtAt = now;
    try {
      const url = `https://api.511.org/transit/tripupdates?api_key=${encodeURIComponent(o.key)}&agency=${o.agency511}`;
      const res = await fetch(url, { headers: { accept: 'application/x-google-protobuf' }, signal: AbortSignal.timeout(15_000) });
      if (!res.ok) throw new Error(`511 HTTP ${res.status}`);
      const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(new Uint8Array(await res.arrayBuffer()));
      rt = feed.entity.map((e) => e.tripUpdate).filter((tu): tu is RtTrip => !!tu?.trip);
    } catch (err) {
      console.warn(`[${o.id}] realtime: ${err instanceof Error ? err.message : err}`);
    }
  }

  /** Realtime updates keyed by static trip id: by trip_id, else by train number, else by route + start time. */
  function matchRealtime(active: ActiveTrip[]): Map<string, RtTrip> {
    const out = new Map<string, RtTrip>();
    if (!rt.length) return out;
    const ids = new Set(active.map((t) => t.row[0]));
    const byLabel = new Map(active.filter((t) => t.row[6]).map((t) => [t.row[6], t.row[0]]));
    const byStart = new Map(active.map((t) => [`${t.pat.line}|${t.row[4]}`, t.row[0]]));
    for (const tu of rt) {
      const tid = tu.trip.tripId ?? '';
      let id: string | undefined = ids.has(tid) ? tid : undefined;
      const num = tu.vehicle?.label ?? tid.match(/(\d{3})$/)?.[1];
      if (!id && num) id = byLabel.get(num);
      const line = sched.routes[tu.trip.routeId ?? ''];
      if (!id && line && tu.trip.startTime) {
        const [h, m, sec] = tu.trip.startTime.split(':').map(Number);
        id = byStart.get(`${line}|${h * 3600 + m * 60 + (sec || 0)}`);
      }
      if (id && !out.has(id)) out.set(id, tu);
    }
    return out;
  }

  async function poll(nowMs: number): Promise<TrainState[]> {
    const now = nowMs / 1000;
    await refreshRealtime(now);
    const trains: TrainState[] = [];
    const active = activeTrips(sched, now, 900, 900);
    const matched = matchRealtime(active);
    for (const t of active) {
      const [tripId] = t.row;
      const id = `${o.schedule}:${tripId}`;
      const tu = matched.get(tripId);
      let times = t.times;
      let from = 0;
      let live = false;
      let delay: number | undefined;
      if (tu) {
        if (tu.trip.scheduleRelationship === 3 /* CANCELED */) continue;
        const updates: RtStop[] = [];
        for (const u of tu.stopTimeUpdate ?? []) {
          const station = sched.stopMap[u.stopId ?? ''];
          if (!station || u.scheduleRelationship === 1 /* SKIPPED */) continue;
          const a = Number(u.arrival?.time ?? 0) || undefined;
          const d = Number(u.departure?.time ?? 0) || undefined;
          if (a || d) updates.push({ station, a, d });
          else if (u.arrival?.delay != null || u.departure?.delay != null) {
            const i = t.pat.st.indexOf(station);
            const dl = Number(u.arrival?.delay ?? u.departure?.delay);
            if (i >= 0) updates.push({ station, a: t.times[2 * i] + dl, d: t.times[2 * i + 1] + dl });
          }
        }
        const m = memoFor(memo, id, now, t.pat.st);
        const merged = updates.length ? mergeRealtime(t.pat.st, t.times, updates, m.dep, m.prev?.k) : null;
        if (merged) {
          times = merged.times;
          from = merged.from;
          live = true;
          const next = Math.min(merged.from + 1, t.pat.st.length - 1);
          delay = Math.round(times[2 * next] - t.times[2 * next]);
        }
      }
      const stops = live ? stabilize(memo.get(id)!, t.pat.st, times, from, now) : windowTimeline(t.pat.st, times, now, from);
      if (!stops) continue;
      const label = tu?.vehicle?.label && !t.row[6] ? `Car ${tu.vehicle.label}` : undefined;
      trains.push({ id, line: t.pat.line, dest: sched.heads[t.row[5]], live, delay, label, stops, ...o.train(t.row, t.pat) });
    }
    for (const [id, m] of memo) if (now - m.seen > 600) memo.delete(id);
    return trains;
  }

  return {
    id: o.id,
    city: 'sf',
    name: o.key ? `${o.name} · 511 GTFS-realtime` : `${o.name} · timetable`,
    live: !!o.key,
    intervalMs: 20_000,
    poll,
  };
}
