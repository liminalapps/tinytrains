// Runs the Wuhan adapters once and prints the standard sim-kit report.
// Usage: npx tsx scripts/check-wuhan.ts
import { checkSimCity } from './lib/osm-network/check.ts';

await checkSimCity('wuhan');
