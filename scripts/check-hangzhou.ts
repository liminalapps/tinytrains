// Runs the Hangzhou adapters once and prints the standard sim-kit report.
// Usage: npx tsx scripts/check-hangzhou.ts
import { checkSimCity } from './lib/osm-network/check.ts';

await checkSimCity('hangzhou');
