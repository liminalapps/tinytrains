// Run: node --expose-gc --import tsx scripts/check-amsterdam.ts [--twice] [--at=<ISO time>] [--mock-rt]
import { createAdapters } from '../server/adapters/amsterdam/index.ts';
import { checkGtfsCity } from './lib/gtfs/check.ts';

await checkGtfsCity('amsterdam', createAdapters);
