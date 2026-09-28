// Run: node --expose-gc --import tsx scripts/check-lisbon.ts [--twice] [--at=<ISO time>] [--mock-rt]
import { checkGtfsCity } from './lib/gtfs/check.ts';
import { createAdapters } from '../server/adapters/lisbon/index.ts';

await checkGtfsCity('lisbon', createAdapters);
