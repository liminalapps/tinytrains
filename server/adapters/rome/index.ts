// Rome: ATAC metro and trams from the Roma Servizi per la Mobilità timetable, with its keyless GTFS-realtime on top
// (GTFS kit). The realtime feed tracks the trams (by car number) but not the metro, which runs on the timetable.
// The Cotral Roma–Lido and Roma–Viterbo railways publish no feed and are simulated from their frequencies (sim kit).
import { gtfsAdapters, gtfsRealtime, type RealtimeSource, type RtTrip } from '../gtfs/index.ts';
import { simAdapters } from '../sim/index.ts';
import type { AdapterFactory } from '../types.ts';

const ROUTES = new Set(['MEA', 'MEB', 'MEB1', 'MEC', '2', '3', '5', '8', '14', '19']);

/** Tram type from its fleet number: 7xxx Stanga, 90xx Socimi, 91xx Cityway 1, 92xx Cityway 2. */
export function tramStock(label: string): string | undefined {
  const n = Number(label);
  if (!n) return undefined;
  if (n >= 9200 && n < 9300) return 'rome-cityway2';
  if (n >= 9100 && n < 9200) return 'rome-cityway1';
  if (n >= 9000 && n < 9100) return 'rome-socimi';
  if (n >= 7000 && n < 8000) return 'rome-stanga';
  return undefined;
}

function romeRealtime(): RealtimeSource {
  const base = gtfsRealtime({
    name: 'Roma Mobilità GTFS-realtime',
    tripUpdates: 'https://romamobilita.it/sites/default/files/rome_rtgtfs_trip_updates_feed.pb',
    vehiclePositions: 'https://romamobilita.it/sites/default/files/rome_rtgtfs_vehicle_positions_feed.pb',
    everyMs: 30_000,
    perMinute: 6,
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
        const stock = t.label && t.line?.startsWith('t') ? tramStock(t.label) : undefined;
        return stock ? { ...t, stock, cars: 1 } : t;
      });
      return mapped;
    },
  };
}

export const createAdapters: AdapterFactory = () => {
  const realtime = romeRealtime();
  return [
    ...gtfsAdapters({
      city: 'rome',
      schedule: 'server/data/rome/schedule.json',
      adapters: [
        { id: 'rome-metro', name: 'Metro', systems: ['metro'], realtime },
        { id: 'rome-tram', name: 'Tram', systems: ['tram'], realtime },
      ],
    }),
    ...simAdapters('rome', [
      { id: 'rome-rail', name: 'Railways · simulated from Cotral published frequencies', lines: ['lido', 'viterbo'] },
    ]),
  ];
};
