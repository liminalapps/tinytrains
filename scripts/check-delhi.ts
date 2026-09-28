// Checks Delhi's sim-kit network and simulated trains. Usage: npx tsx scripts/check-delhi.ts
import { checkSimCity } from './lib/osm-network/check.ts';

await checkSimCity('delhi');
