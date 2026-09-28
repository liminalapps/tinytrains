// Run: node --expose-gc --import tsx scripts/check-prague.ts [--twice] [--at=<ISO time>] [--mock-rt]
import { createAdapters } from '../server/adapters/prague/index.ts';
import { checkGtfsCity } from './lib/gtfs/check.ts';

await checkGtfsCity('prague', createAdapters);
