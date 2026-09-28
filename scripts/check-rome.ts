// Run: node --expose-gc --import tsx scripts/check-rome.ts [--twice] [--at=<ISO time>] [--mock-rt]
// ATAC metro and trams through the GTFS kit's check, then the simulated Cotral railways through the sim kit's.
import { createAdapters } from '../server/adapters/rome/index.ts';
import { checkGtfsCity } from './lib/gtfs/check.ts';
import { checkSimCity } from './lib/osm-network/check.ts';

await checkGtfsCity('rome', (env) => createAdapters(env).filter((a) => a.id !== 'rome-rail'));
console.log('\n--- Cotral railways (sim kit) ---');
await checkSimCity('rome');
