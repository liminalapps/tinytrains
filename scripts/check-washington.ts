// Runs the Washington adapter once (timetable, or WMATA GTFS-realtime with WMATA_KEY) and prints data-quality numbers.
// Usage: npx tsx scripts/check-washington.ts [--twice] [--at=<ISO time>] [--mock-rt]
import { checkGtfsCity } from './lib/gtfs/check.ts';
import { createAdapters } from '../server/adapters/washington/index.ts';

await checkGtfsCity('washington', createAdapters);
