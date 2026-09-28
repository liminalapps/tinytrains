// Amsterdam: GVB metro and trams from the OVapi timetable, with OVapi GTFS-realtime (keyless) on top (GTFS kit).
import { gtfsAdapters, gtfsRealtime } from '../gtfs/index.ts';
import type { AdapterFactory } from '../types.ts';

export const createAdapters: AdapterFactory = () => {
  const realtime = gtfsRealtime({
    name: 'OVapi GTFS-realtime',
    tripUpdates: 'https://gtfs.ovapi.nl/nl/tripUpdates.pb',
    vehiclePositions: 'https://gtfs.ovapi.nl/nl/vehiclePositions.pb',
    everyMs: 30_000,
    perMinute: 12,
  });
  return gtfsAdapters({
    city: 'amsterdam',
    schedule: 'server/data/amsterdam/schedule.json',
    adapters: [
      { id: 'amsterdam-metro', name: 'Metro', systems: ['metro'], realtime },
      { id: 'amsterdam-tram', name: 'Tram', systems: ['tram'], realtime },
    ],
  });
};
