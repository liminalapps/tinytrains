// Checks Osaka's sim-kit network and simulated trains. Usage: npx tsx scripts/check-osaka.ts
import { checkSimCity } from './lib/osm-network/check.ts';

await checkSimCity('osaka');
