// Chicago: the CTA 'L' from the CTA timetable (GTFS kit), with Train Tracker positions on top when CTA_TRAIN_KEY is set.
import { gtfsAdapters } from '../gtfs/index.ts';
import type { AdapterFactory } from '../types.ts';
import { trainTracker } from './traintracker.ts';

export const createAdapters: AdapterFactory = (env) =>
  gtfsAdapters({
    city: 'chicago',
    schedule: 'server/data/chicago/schedule.json',
    adapters: [{ id: 'chicago-l', name: "CTA 'L'", systems: ['cta-l'], realtime: env.CTA_TRAIN_KEY ? trainTracker(env.CTA_TRAIN_KEY) : undefined, match: 'time' }],
  });
