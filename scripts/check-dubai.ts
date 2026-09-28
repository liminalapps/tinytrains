// Run: node --expose-gc --import tsx scripts/check-dubai.ts [--twice] [--at=<ISO time>]
// RTA metro and tram through the GTFS kit's check, then the simulated Palm Monorail through the sim kit's.
import { createAdapters } from '../server/adapters/dubai/index.ts';
import { checkGtfsCity } from './lib/gtfs/check.ts';
import { checkSimCity } from './lib/osm-network/check.ts';

await checkGtfsCity('dubai', (env) => createAdapters(env).filter((a) => a.id !== 'dubai-monorail'));
console.log('\n--- Palm Monorail (sim kit) ---');
await checkSimCity('dubai');
