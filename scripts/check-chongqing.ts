// Runs the Chongqing adapters once and prints the standard sim-kit report.
// Usage: npx tsx scripts/check-chongqing.ts
import { checkSimCity } from './lib/osm-network/check.ts';

await checkSimCity('chongqing');
