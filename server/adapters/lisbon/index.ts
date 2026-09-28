// Lisbon: Metro, CP and Fertagus run on their published timetables (Metro de Lisboa's own API needs a key; CP and
// Fertagus publish no keyless realtime). Carris trams and funiculars get keyless GTFS-realtime vehicle positions
// on top of the Carris timetable (GTFS kit), with the tram type read from the fleet number.
import { gtfsAdapters, gtfsRealtime, type RealtimeSource, type RtTrip } from '../gtfs/index.ts';
import type { AdapterFactory } from '../types.ts';

// Carris route ids of the tram lines (12E 15E 18E 24E 25E 28E) and the Bica and Graça funiculars.
const ROUTES = new Set(['77_0', '76_0', '78_0', '213_0', '79_0', '75_0', '160_0', '284_0']);

/** Tram type from its fleet number: 501–510 Siemens articulated, 541–585 Remodelados, 601–615 CAF Urbos. */
export function tramStock(label: string): string | undefined {
  const n = Number(label);
  if (n >= 501 && n <= 510) return 'lisbon-siemens';
  if (n >= 541 && n <= 585) return 'lisbon-remodelado';
  if (n >= 601 && n <= 615) return 'lisbon-urbos';
  return undefined;
}

function carrisRealtime(): RealtimeSource {
  const base = gtfsRealtime({
    name: 'Carris GTFS-realtime',
    vehiclePositions: 'https://gateway.carris.pt/gateway/gtfs/api/v2.11/GTFS/realtime/vehiclepositions',
    feed: 'carris',
    everyMs: 30_000,
    perMinute: 4,
    filter: (routeId) => ROUTES.has(routeId),
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
        const stock = t.label ? tramStock(t.label) : undefined;
        return stock ? { ...t, stock, cars: 1 } : t;
      });
      return mapped;
    },
  };
}

export const createAdapters: AdapterFactory = () => {
  const carris = carrisRealtime();
  return gtfsAdapters({
    city: 'lisbon',
    schedule: 'server/data/lisbon/schedule.json',
    adapters: [
      { id: 'lisbon-metro', name: 'Metro', systems: ['metro'] },
      { id: 'lisbon-tram', name: 'Tram', systems: ['tram'], realtime: carris },
      { id: 'lisbon-funicular', name: 'Funiculars', systems: ['funicular'], realtime: carris },
      { id: 'lisbon-cp', name: 'CP suburban trains', systems: ['cp'] },
      { id: 'lisbon-fertagus', name: 'Fertagus', systems: ['fertagus'] },
    ],
  });
};
