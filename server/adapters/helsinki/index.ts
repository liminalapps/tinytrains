// Helsinki: HSL metro, commuter trains, trams and light rail from HSL's timetable, with HSL's keyless GTFS-realtime on
// top (GTFS kit). The feed has no trip ids; route, direction and start time identify a trip (see build-helsinki.ts).
import { gtfsAdapters, gtfsRealtime } from '../gtfs/index.ts';
import type { AdapterFactory } from '../types.ts';

export const createAdapters: AdapterFactory = () => {
  const realtime = gtfsRealtime({
    name: 'HSL GTFS-realtime',
    tripUpdates: 'https://realtime.hsl.fi/realtime/trip-updates/v2/hsl',
    vehiclePositions: 'https://realtime.hsl.fi/realtime/vehicle-positions/v2/hsl',
    everyMs: 30_000,
    perMinute: 12,
    tripKey: (d) => (d.routeId && d.startTime ? `${d.routeId}|${d.directionId ?? 0}|${d.startTime}` : undefined),
  });
  return gtfsAdapters({
    city: 'helsinki',
    schedule: 'server/data/helsinki/schedule.json',
    adapters: [
      { id: 'helsinki-metro', name: 'Metro', systems: ['metro'], realtime },
      { id: 'helsinki-train', name: 'Commuter trains', systems: ['train'], realtime },
      { id: 'helsinki-tram', name: 'Tram', systems: ['tram'], realtime },
      { id: 'helsinki-lightrail', name: 'Light rail', systems: ['lightrail'], realtime },
    ],
  });
};
