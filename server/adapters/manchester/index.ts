// Manchester: Metrolink from TfGM's timetable (GTFS kit). With TFGM_KEY set, TfGM's live departure boards pin each tram
// to its timetable trip (predicted times, Single / Double); without it the trams run to the timetable.
import { gtfsAdapters } from '../gtfs/index.ts';
import type { AdapterEnv, AdapterFactory } from '../types.ts';
import { tfgmMetrolinks } from './boards.ts';

export const createAdapters: AdapterFactory = (env) => {
  const key = (env as AdapterEnv & { TFGM_KEY?: string }).TFGM_KEY;
  return gtfsAdapters({
    city: 'manchester',
    schedule: 'server/data/manchester/schedule.json',
    // Boards show only the next few trams per platform and none on the last hop to a terminus: never treat an unseen
    // tram as cancelled.
    adapters: [{ id: 'manchester-metrolink', name: 'Metrolink', systems: ['metrolink'], realtime: key ? tfgmMetrolinks(key) : undefined, dropUnmatched: 'never' }],
  });
};
