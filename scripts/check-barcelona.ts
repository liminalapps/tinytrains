// Run: node --expose-gc --import tsx scripts/check-barcelona.ts [--twice] [--at=<ISO time>] [--mock-rt]
import { checkGtfsCity } from './lib/gtfs/check.ts';
import { createAdapters } from '../server/adapters/barcelona/index.ts';

await checkGtfsCity('barcelona', createAdapters);
