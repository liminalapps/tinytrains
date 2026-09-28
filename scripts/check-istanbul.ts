// Checks Istanbul's sim-kit network and simulated trains. Usage: ./node_modules/.bin/tsx scripts/check-istanbul.ts
import { checkSimCity } from './lib/osm-network/check.ts';

await checkSimCity('istanbul');
