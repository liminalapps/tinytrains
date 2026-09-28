// Runs the Chengdu adapters once and prints the standard sim-kit report.
// Usage: npx tsx scripts/check-chengdu.ts
import { checkSimCity } from './lib/osm-network/check.ts';

await checkSimCity('chengdu');
