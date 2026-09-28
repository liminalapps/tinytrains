// Runs the Stockholm adapters (SL timetable) and checks them against transit.json.
// Usage: npx tsx scripts/check-stockholm.ts [--twice] [--at=<ISO time>]
import { checkGtfsCity } from './lib/gtfs/check.ts';
import { createAdapters } from '../server/adapters/stockholm/index.ts';

await checkGtfsCity('stockholm', createAdapters, { samples: ['17', '13', 'p41', 's30', 'l27'] });
