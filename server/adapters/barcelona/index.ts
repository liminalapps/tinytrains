// Barcelona: TMB Metro and the TRAM run on their published timetables (TMB's iTransit API needs an app_id/app_key;
// TRAM's open data API needs registration). FGC and Renfe Rodalies get keyless GTFS-realtime on top of their
// timetables (GTFS kit); FGC's train positioning dataset adds each unit's series (112/113/114/115/213).
import { gtfsAdapters, gtfsRealtime, politeFetch, type RealtimeSource, type RtTrip } from '../gtfs/index.ts';
import type { AdapterFactory } from '../types.ts';

const FGC_DATA = 'https://dadesobertes.fgc.cat/api/explore/v2.1/catalog/datasets';
const FGC_STOCK: Record<string, { stock: string; cars: number }> = {
  '112': { stock: 'barcelona-fgc112', cars: 4 },
  '113': { stock: 'barcelona-fgc113', cars: 4 },
  '114': { stock: 'barcelona-fgc114', cars: 3 },
  '115': { stock: 'barcelona-fgc115', cars: 4 },
  '213': { stock: 'barcelona-fgc213', cars: 3 },
};

function fgcRealtime(): RealtimeSource {
  const base = gtfsRealtime({
    name: 'FGC GTFS-realtime',
    tripUpdates: `${FGC_DATA}/trip-updates-gtfs_realtime/files/735985017f62fd33b2fe46e31ce53829`,
    vehiclePositions: `${FGC_DATA}/vehicle-positions-gtfs_realtime/files/d286964db2d107ecdb1344bf02f7b27b`,
    feed: 'fgc',
    everyMs: 30_000,
    perMinute: 8,
  });
  // Unit id (the VehiclePosition vehicle id) -> series, from the Geotren positioning dataset.
  let series = new Map<string, string>();
  let seriesAt = 0;
  let raw: RtTrip[] | undefined;
  let mapped: RtTrip[] = [];
  return {
    name: base.name,
    async refresh(nowMs, sched) {
      const jobs: Promise<unknown>[] = [base.refresh(nowMs, sched)];
      if (nowMs - seriesAt > 60_000) {
        seriesAt = nowMs;
        jobs.push(
          politeFetch(`${FGC_DATA}/posicionament-dels-trens/records?limit=100&select=ut,tipus_unitat`, {}, { perMinute: 4 })
            .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
            .then((j: { results: { ut: string; tipus_unitat: string }[] }) => {
              series = new Map(j.results.map((x) => [x.ut, x.tipus_unitat]));
              raw = undefined;
            })
            .catch(() => {}),
        );
      }
      await Promise.all(jobs);
    },
    trips(nowMs) {
      const trips = base.trips(nowMs);
      if (!trips || trips === raw) return trips && mapped;
      raw = trips;
      mapped = trips.map((t) => {
        const s = t.label ? FGC_STOCK[series.get(t.label) ?? ''] : undefined;
        // The vehicle id is an opaque hash, not a fleet number: don't show it.
        return { ...t, label: undefined, ...(s ?? {}) };
      });
      return mapped;
    },
  };
}

export const createAdapters: AdapterFactory = () => {
  const rodalies = gtfsRealtime({
    name: 'Renfe GTFS-realtime',
    tripUpdates: 'https://gtfsrt.renfe.com/trip_updates.pb',
    vehiclePositions: 'https://gtfsrt.renfe.com/vehicle_positions.pb',
    feed: 'renfe',
    everyMs: 30_000,
    perMinute: 6,
    filter: (_routeId, tripId) => tripId.startsWith('51'),
    // Realtime trip ids carry a different service prefix than the timetable's; the build keys trips on the rest.
    tripKey: (d) => d.tripId?.replace(/^\d+[A-Z]/, ''),
  });
  return gtfsAdapters({
    city: 'barcelona',
    schedule: 'server/data/barcelona/schedule.json',
    adapters: [
      { id: 'barcelona-metro', name: 'Metro', systems: ['metro'] },
      { id: 'barcelona-fgc', name: 'FGC', systems: ['fgc'], realtime: fgcRealtime() },
      { id: 'barcelona-tram', name: 'Tram', systems: ['tram'] },
      { id: 'barcelona-rodalies', name: 'Rodalies', systems: ['rodalies'], realtime: rodalies, match: 'key' },
    ],
  });
};
