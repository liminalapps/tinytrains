// Oslo: T-bane, trikk, Flytoget and Vy from Entur's timetable, with Entur's keyless GTFS-realtime on top (GTFS kit).
// Entur publishes one feed per operator (codespace); each source is fetched once and shared by its adapters.
import { gtfsAdapters, gtfsRealtime } from '../gtfs/index.ts';
import type { AdapterFactory } from '../types.ts';

const ENTUR = 'https://api.entur.io/realtime/v1/gtfs-rt/trip-updates?datasource=';
/** Entur asks every client to identify itself. */
const HEADERS = { 'ET-Client-Name': 'tinytrains-app' };

export const createAdapters: AdapterFactory = () => {
  const entur = (codespace: string) =>
    gtfsRealtime({ name: 'Entur GTFS-realtime', tripUpdates: ENTUR + codespace, headers: HEADERS, everyMs: 30_000, perMinute: 30 });
  const ruter = entur('RUT');
  return gtfsAdapters({
    city: 'oslo',
    schedule: 'server/data/oslo/schedule.json',
    adapters: [
      { id: 'oslo-tbane', name: 'T-bane', systems: ['tbane'], realtime: ruter },
      { id: 'oslo-trikk', name: 'Trikk', systems: ['trikk'], realtime: ruter },
      { id: 'oslo-flytoget', name: 'Flytoget', systems: ['flytoget'], realtime: entur('FLT') },
      { id: 'oslo-vy', name: 'Vy', systems: ['vy'], realtime: entur('VYG') },
    ],
  });
};
