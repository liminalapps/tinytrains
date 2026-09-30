// Toulouse: Tisséo métro, tram and Téléo from the Tisséo timetable (GTFS kit), with Tisséo's keyless GTFS-realtime
// on top. That feed mostly carries alerts and added or cancelled trips, so trains usually run on the timetable.
import { gtfsAdapters, gtfsRealtime, type RealtimeSource, type RtTrip } from '../gtfs/index.ts';
import type { AdapterFactory } from '../types.ts';

const ROUTES = new Set(['line:61', 'line:69', 'line:68', 'line:204']);

// The feed keeps added trips ('new_…') around for hours, reduced to a single past stop. Only trips that say something
// about now count, so a stale entry doesn't label a line as live.
function tisseoRealtime(): RealtimeSource {
  const base = gtfsRealtime({
    name: 'Tisséo GTFS-realtime',
    tripUpdates: 'https://api.tisseo.fr/opendata/gtfsrt/GtfsRt.pb',
    everyMs: 60_000,
    perMinute: 2,
    filter: (routeId) => ROUTES.has(routeId),
  });
  const current = (t: RtTrip, now: number) =>
    t.cancelled || (t.delay != null && !t.key?.startsWith('new_')) || !!t.at || (t.stops ?? []).some((s) => (s.d ?? s.a ?? 0) > now - 600);
  return {
    name: base.name,
    refresh: (nowMs, sched) => base.refresh(nowMs, sched),
    trips(nowMs) {
      const trips = base.trips(nowMs)?.filter((t) => current(t, nowMs / 1000));
      return trips?.length ? trips : undefined;
    },
  };
}

export const createAdapters: AdapterFactory = () => {
  const realtime = tisseoRealtime();
  return gtfsAdapters({
    city: 'toulouse',
    schedule: 'server/data/toulouse/schedule.json',
    adapters: [
      { id: 'toulouse-metro', name: 'Métro', systems: ['metro'], realtime },
      { id: 'toulouse-tram', name: 'Tram', systems: ['tram'], realtime },
      { id: 'toulouse-teleo', name: 'Téléo', systems: ['teleo'], realtime },
    ],
  });
};
