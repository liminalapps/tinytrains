// Runs the Philadelphia adapters once against the live SEPTA feeds and prints data-quality numbers.
// Usage: npx tsx scripts/check-philadelphia.ts [--twice] [--at=<ISO time>] [--mock-rt]
import { checkGtfsCity } from './lib/gtfs/check.ts';
import { createAdapters } from '../server/adapters/philadelphia/index.ts';

await checkGtfsCity('philadelphia', createAdapters);
