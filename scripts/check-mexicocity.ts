// Run: node --expose-gc --import tsx scripts/check-mexicocity.ts [--twice] [--at=<ISO time>]
import { createAdapters } from '../server/adapters/mexicocity/index.ts';
import { checkGtfsCity } from './lib/gtfs/check.ts';

await checkGtfsCity('mexicocity', createAdapters);
