// Run: node --expose-gc --import tsx scripts/check-toulouse.ts [--twice] [--at=<ISO time>] [--mock-rt]
import { createAdapters } from '../server/adapters/toulouse/index.ts';
import { checkGtfsCity } from './lib/gtfs/check.ts';

await checkGtfsCity('toulouse', createAdapters);
