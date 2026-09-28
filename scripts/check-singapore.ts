// Verifies the Singapore data and simulated trains (sim kit). Run: npx tsx scripts/check-singapore.ts
import { checkSimCity } from './lib/osm-network/check.ts';

await checkSimCity('singapore');
