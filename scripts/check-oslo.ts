// Runs the Oslo adapters (Entur timetable + GTFS-realtime) and checks them against transit.json.
// Usage: npx tsx scripts/check-oslo.ts [--twice] [--at=<ISO time>] [--mock-rt]
import { checkGtfsCity } from './lib/gtfs/check.ts';
import { createAdapters } from '../server/adapters/oslo/index.ts';

await checkGtfsCity('oslo', createAdapters, { samples: ['t2', 'tr17', 'l1'] });
