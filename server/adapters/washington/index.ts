// Washington: Metrorail from the WMATA timetable (GTFS kit), with WMATA's GTFS-realtime on top when WMATA_KEY is set.
import { gtfsAdapters, gtfsRealtime } from '../gtfs/index.ts';
import type { AdapterFactory } from '../types.ts';

export const createAdapters: AdapterFactory = (env) => {
  const realtime = env.WMATA_KEY
    ? gtfsRealtime({
        name: 'WMATA GTFS-realtime',
        tripUpdates: 'https://api.wmata.com/gtfs/rail-gtfsrt-tripupdates.pb',
        vehiclePositions: 'https://api.wmata.com/gtfs/rail-gtfsrt-vehiclepositions.pb',
        headers: { api_key: env.WMATA_KEY },
        everyMs: 30_000,
        perMinute: 6,
      })
    : undefined;
  return gtfsAdapters({
    city: 'washington',
    schedule: 'server/data/washington/schedule.json',
    adapters: [{ id: 'washington-metrorail', name: 'Metrorail', systems: ['metrorail'], realtime }],
  });
};
