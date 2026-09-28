// Budapest: BKK metro, MÁV-HÉV and trams from the BKK timetable (GTFS kit). BKK's GTFS-realtime needs a free key
// from opendata.bkk.hu; with BKK_KEY set, TripUpdates and VehiclePositions are laid over the timetable.
import { gtfsAdapters, gtfsRealtime } from '../gtfs/index.ts';
import type { AdapterEnv, AdapterFactory } from '../types.ts';

const RT = 'https://go.bkk.hu/api/query/v1/ws/gtfs-rt/full';

export const createAdapters: AdapterFactory = (env) => {
  const key = (env as AdapterEnv & { BKK_KEY?: string }).BKK_KEY;
  const realtime = key
    ? gtfsRealtime({
        name: 'BKK FUTÁR GTFS-realtime',
        tripUpdates: `${RT}/TripUpdates.pb?key=${encodeURIComponent(key)}`,
        vehiclePositions: `${RT}/VehiclePositions.pb?key=${encodeURIComponent(key)}`,
        everyMs: 30_000,
        perMinute: 6,
      })
    : undefined;
  return gtfsAdapters({
    city: 'budapest',
    schedule: 'server/data/budapest/schedule.json',
    adapters: [
      { id: 'budapest-metro', name: 'Metro', systems: ['metro'], realtime },
      { id: 'budapest-hev', name: 'HÉV', systems: ['hev'], realtime },
      { id: 'budapest-tram', name: 'Tram', systems: ['tram'], realtime },
    ],
  });
};
