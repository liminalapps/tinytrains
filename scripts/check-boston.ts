// Runs the Boston adapters once against the live MBTA feeds and prints data-quality numbers.
// Usage: npx tsx scripts/check-boston.ts [--twice] [--at=<ISO time>] [--mock-rt]
import { checkGtfsCity } from './lib/gtfs/check.ts';
import { createAdapters } from '../server/adapters/boston/index.ts';

await checkGtfsCity('boston', createAdapters);
