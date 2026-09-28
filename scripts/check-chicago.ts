// Runs the Chicago adapter once (timetable, or Train Tracker with CTA_TRAIN_KEY) and prints data-quality numbers.
// Usage: npx tsx scripts/check-chicago.ts [--twice] [--at=<ISO time>]
import { checkGtfsCity } from './lib/gtfs/check.ts';
import { createAdapters } from '../server/adapters/chicago/index.ts';

await checkGtfsCity('chicago', createAdapters);
