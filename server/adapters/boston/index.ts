// Boston: MBTA subway, Green Line and Commuter Rail from the MBTA timetable, with MBTA's keyless GTFS-realtime on top
// (GTFS kit). Car numbers in VehiclePositions tell each train's car class and length.
import { gtfsAdapters, gtfsRealtime, type RealtimeSource, type RtTrip } from '../gtfs/index.ts';
import type { AdapterFactory } from '../types.ts';

const ROUTES = /^(Red|Mattapan|Orange|Blue|Green-[BCDE]|CR-)/;

/** Stock and car count from the lead car's number and the consist's car numbers. */
export function consist(line: string, cars: string[]): { stock?: string; cars?: number } {
  const lead = Number(cars[0]);
  if (!lead) return {};
  const n = cars.length;
  if (line === 'red') {
    const stock = lead >= 1900 ? 'boston-red-4' : lead >= 1800 ? 'boston-red-3' : lead >= 1700 ? 'boston-red-2' : 'boston-red-1';
    return { stock, cars: n > 1 ? n : 6 };
  }
  if (line === 'orange') return { stock: 'boston-orange-crrc', cars: n > 1 ? n : 6 };
  if (line === 'blue') return { stock: 'boston-blue-siemens', cars: n > 1 ? n : 6 };
  if (line === 'mattapan') return { stock: 'boston-pcc', cars: 1 };
  if (line.startsWith('green-')) {
    const stock = lead >= 3900 ? 'boston-type9' : lead >= 3800 ? 'boston-type8' : 'boston-type7';
    return { stock, cars: n };
  }
  // Commuter Rail: the vehicle is the cab car (1700s Kawasaki, 1800s Rotem); the train length isn't published.
  if (line.startsWith('cr-')) return { stock: lead >= 1800 ? 'boston-cr-rotem' : 'boston-cr-kawasaki' };
  return {};
}

/** MBTA GTFS-realtime, with each train's consist read from its car numbers. */
function mbtaRealtime(): RealtimeSource {
  const base = gtfsRealtime({
    name: 'MBTA GTFS-realtime',
    tripUpdates: 'https://cdn.mbta.com/realtime/TripUpdates.pb',
    vehiclePositions: 'https://cdn.mbta.com/realtime/VehiclePositions.pb',
    everyMs: 30_000,
    perMinute: 12,
    filter: (routeId) => ROUTES.test(routeId),
  });
  let raw: RtTrip[] | undefined;
  let mapped: RtTrip[] = [];
  return {
    name: base.name,
    refresh: (nowMs, sched) => base.refresh(nowMs, sched),
    trips(nowMs) {
      const trips = base.trips(nowMs);
      if (!trips || trips === raw) return trips && mapped;
      raw = trips;
      mapped = trips.map((t) => {
        if (!t.line || !t.label) return t;
        const c = consist(t.line, t.carriages?.length ? t.carriages : t.label.split('-'));
        // Commuter Rail shows its train number from the timetable rather than the cab car number.
        return { ...t, ...c, label: t.line.startsWith('cr-') ? undefined : t.label };
      });
      return mapped;
    },
  };
}

export const createAdapters: AdapterFactory = () => {
  const realtime = mbtaRealtime();
  return gtfsAdapters({
    city: 'boston',
    schedule: 'server/data/boston/schedule.json',
    adapters: [
      { id: 'boston-subway', name: 'Subway', systems: ['mbta-subway'], realtime },
      { id: 'boston-green', name: 'Green Line', systems: ['mbta-green'], realtime },
      { id: 'boston-cr', name: 'Commuter Rail', systems: ['mbta-cr'], realtime },
    ],
  });
};
