// Checks Cairo's sim-kit network and simulated trains. Usage: npx tsx scripts/check-cairo.ts
import { checkSimCity } from './lib/osm-network/check.ts';

await checkSimCity('cairo');
