// Runs the Manchester adapters once and prints data-quality numbers (live boards need TFGM_KEY in the environment).
// Usage: npx tsx scripts/check-manchester.ts [--twice] [--at=<ISO time>] [--mock-rt]
import { checkGtfsCity } from './lib/gtfs/check.ts';
import { createAdapters } from '../server/adapters/manchester/index.ts';

await checkGtfsCity('manchester', createAdapters);
