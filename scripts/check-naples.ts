// Run: node --expose-gc --import tsx scripts/check-naples.ts [--twice] [--at=<ISO time>] [--mock-rt]
import { createAdapters } from '../server/adapters/naples/index.ts';
import { checkGtfsCity } from './lib/gtfs/check.ts';

await checkGtfsCity('naples', createAdapters);
