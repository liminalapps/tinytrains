// Run: node --expose-gc --import tsx scripts/check-milan.ts [--twice] [--at=<ISO time>] [--mock-rt]
import { createAdapters } from '../server/adapters/milan/index.ts';
import { checkGtfsCity } from './lib/gtfs/check.ts';

await checkGtfsCity('milan', createAdapters);
