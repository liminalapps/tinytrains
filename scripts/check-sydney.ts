// Runs the Sydney adapters (TfNSW GTFS-realtime when TFNSW_KEY is set, else the timetable) and checks them
// against transit.json (GTFS kit check).
// Usage: ./node_modules/.bin/tsx scripts/check-sydney.ts [--twice] [--at=<ISO time>] [--mock-rt]
import { checkGtfsCity } from './lib/gtfs/check.ts';
import { createAdapters } from '../server/adapters/sydney/index.ts';

await checkGtfsCity('sydney', createAdapters, { samples: ['T1', 'M1', 'L2'] });
