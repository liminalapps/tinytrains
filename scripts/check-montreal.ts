// Run: node --expose-gc --import tsx scripts/check-montreal.ts [--twice] [--at=<ISO time>]
// STM Métro and exo through the GTFS kit's check, then the simulated REM through the sim kit's.
import { createAdapters } from '../server/adapters/montreal/index.ts';
import { checkGtfsCity } from './lib/gtfs/check.ts';
import { checkSimCity } from './lib/osm-network/check.ts';

await checkGtfsCity('montreal', (env) => createAdapters(env).filter((a) => a.id !== 'montreal-rem'));
console.log('\n--- REM (sim kit) ---');
await checkSimCity('montreal');
