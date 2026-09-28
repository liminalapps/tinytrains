// Runs the Helsinki adapters (HSL timetable + GTFS-realtime) and checks them against transit.json.
// Usage: npx tsx scripts/check-helsinki.ts [--twice] [--at=<ISO time>] [--mock-rt]
import { checkGtfsCity } from './lib/gtfs/check.ts';
import { createAdapters } from '../server/adapters/helsinki/index.ts';

await checkGtfsCity('helsinki', createAdapters, { samples: ['m1', 'i', 't4', 'lr15'] });
