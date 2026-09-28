// Run: node --expose-gc --import tsx scripts/check-vienna.ts [--twice] [--at=<ISO time>] [--mock-rt]
import { createAdapters } from '../server/adapters/vienna/index.ts';
import { checkGtfsCity } from './lib/gtfs/check.ts';

await checkGtfsCity('vienna', createAdapters);
