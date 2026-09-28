// Prague: PID metro, trams, Esko trains and the Petřín funicular from the PID timetable (GTFS kit), with PID's
// keyless GTFS-realtime on top (Golemio TripUpdates + VehiclePositions). Trams carry their fleet number, which gives
// their type; metro and Esko trains are tracked but not identified.
import { gtfsAdapters, gtfsRealtime, type RealtimeSource, type RtTrip } from '../gtfs/index.ts';
import type { AdapterFactory } from '../types.ts';

const RT = 'https://api.golemio.cz/v2/vehiclepositions/gtfsrt/';

/** DPP tram type from its fleet number. */
export function tramStock(label: string): { stock: string; cars: number } | undefined {
  const n = Number(label);
  if (!n) return undefined;
  if (n >= 9501 && n <= 9599) return { stock: 'prague-52t', cars: 1 };
  if (n >= 9201 && n <= 9450) return { stock: 'prague-15t', cars: 1 };
  if (n >= 9111 && n <= 9170) return { stock: 'prague-14t', cars: 1 };
  if (n >= 9001 && n <= 9110) return { stock: 'prague-kt8d5', cars: 1 };
  if ((n >= 8251 && n <= 8299) || (n >= 8751 && n <= 8799)) return { stock: 'prague-t3rplf', cars: 2 };
  if (n >= 8107 && n <= 8749) return { stock: 'prague-t3rp', cars: 2 };
  if (n >= 5000 && n <= 8106) return { stock: 'prague-t3', cars: 1 };
  return undefined;
}

// Trams run T3s as coupled pairs by day; the feed names only the lead car. Night lines and 23 run single cars.
const single = (line: string) => /^t(9\d|23|4[12])$/.test(line);

function pragueRealtime(): RealtimeSource {
  const base = gtfsRealtime({
    name: 'PID GTFS-realtime',
    tripUpdates: `${RT}trip_updates.pb`,
    vehiclePositions: `${RT}vehicle_positions.pb`,
    everyMs: 30_000,
    perMinute: 6,
    filter: (routeId) => /^L(\d{1,2}|99[123]|1\d{3})$/.test(routeId),
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
        const label = t.label;
        if (!label) return t;
        // 'metro-A-6-6' / 'train-9974' are internal ids, not fleet numbers.
        if (label.startsWith('metro-')) return { ...t, label: undefined };
        if (label.startsWith('train-')) return { ...t, label: undefined };
        const s = t.line?.startsWith('t') ? tramStock(label) : undefined;
        if (!s) return t;
        return { ...t, stock: s.stock, cars: s.cars === 2 && single(t.line!) ? 1 : s.cars };
      });
      return mapped;
    },
  };
}

export const createAdapters: AdapterFactory = () => {
  const realtime = pragueRealtime();
  return gtfsAdapters({
    city: 'prague',
    schedule: 'server/data/prague/schedule.json',
    adapters: [
      { id: 'prague-metro', name: 'Metro', systems: ['metro'], realtime },
      { id: 'prague-tram', name: 'Tram', systems: ['tram'], realtime },
      { id: 'prague-esko', name: 'Esko', systems: ['esko'], realtime },
      { id: 'prague-funicular', name: 'Funicular', systems: ['funicular'], realtime },
    ],
  });
};
