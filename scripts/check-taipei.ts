// Runs the Taipei adapters against the live arrival feed and checks them against transit.json (GTFS kit check).
// Usage: ./node_modules/.bin/tsx scripts/check-taipei.ts [--twice] [--at=<ISO time>]
import { checkGtfsCity } from './lib/gtfs/check.ts';
import { createAdapters } from '../server/adapters/taipei/index.ts';

await checkGtfsCity('taipei', createAdapters, { samples: ['R', 'BR', 'Y'] });
