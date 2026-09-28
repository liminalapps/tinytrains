// Verifies the Moscow data and simulated trains (sim kit). Run: npx tsx scripts/check-moscow.ts
import { checkSimCity } from './lib/osm-network/check.ts';

await checkSimCity('moscow');
