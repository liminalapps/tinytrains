// Toulouse: Tisséo métro A/B (VAL), tram T1 and the Téléo urban gondola from the Tisséo static GTFS (keyless, ODbL,
// GTFS kit). Run: ./node_modules/.bin/tsx scripts/build-toulouse.ts [--refresh] [--debug]
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TransitData } from '../shared/types.ts';
import { buildGtfsCity } from './lib/gtfs/index.ts';
import { ROOT } from './lib/gtfs/feed.ts';

const FEED = 'https://data.toulouse-metropole.fr/api/explore/v2.1/catalog/datasets/tisseo-gtfs/files/fc1dda89077cf37e4f7521760e0ef4e9';

const cleanName = (n: string) =>
  n
    .replace(/\s+-\s+/g, ' – ')
    .replace(/-Gramont$/, ' – Gramont')
    .replace(/\s+/g, ' ')
    .replace(/\bAeroscopia\b/, 'Aeroscopia')
    .trim();

await buildGtfsCity({
  city: 'toulouse',
  feeds: [{ id: 'tisseo', url: FEED, file: 'tisseo_gtfs_v2.zip' }],
  systems: [
    { id: 'metro', name: 'Métro', live: 'scheduled' },
    { id: 'tram', name: 'Tram', live: 'scheduled' },
    { id: 'teleo', name: 'Téléo', live: 'scheduled' },
  ],
  lines: [
    {
      id: 'a', system: 'metro', match: { routeId: 'line:61' }, name: 'Métro A', short: 'A',
      color: '#DB001B', textColor: '#FFFFFF', kind: 'metro', bullet: 'circle', osm: ['subway'],
      // Line A has run 52 m trains (two coupled VAL units) since its platforms were lengthened in 2019.
      stock: [{ stock: 'toulouse-val206', cars: 4, share: 3 }, { stock: 'toulouse-val208', cars: 4, share: 2 }],
    },
    {
      id: 'b', system: 'metro', match: { routeId: 'line:69' }, name: 'Métro B', short: 'B',
      color: '#FFDD00', textColor: '#000000', kind: 'metro', bullet: 'circle', osm: ['subway'],
      stock: [{ stock: 'toulouse-val208', cars: 2 }],
    },
    {
      id: 't1', system: 'tram', match: { routeId: 'line:68' }, name: 'Tram T1', short: 'T1',
      color: '#004687', textColor: '#FFFFFF', kind: 'tram', bullet: 'square',
      stock: [{ stock: 'toulouse-citadis302', cars: 1 }],
    },
    {
      id: 'teleo', system: 'teleo', match: { routeId: 'line:204' }, name: 'Téléo', short: 'Téléo',
      color: '#DC006B', textColor: '#FFFFFF', kind: 'cable', bullet: 'pill', geometry: 'straight',
      stock: [{ stock: 'toulouse-teleo', cars: 1 }],
    },
  ],
  stations: { idPrefix: 'tls', maxSpread: 150, name: cleanName },
  trips: { dest: (t) => cleanName(t.trip.trip_headsign || t.allStops.at(-1)!.name) },
  geometry: { levels: true },
  realtimeKeys: true,
  days: { from: -2, to: 40 },
  attribution: ['Timetables: Tisséo open data (ODbL), via Toulouse Métropole', 'Track levels © OpenStreetMap contributors'],
});

// Téléo hangs from its cables up to 70 m above the Garonne and the Pech David hillside: draw it all as elevated.
const path = join(ROOT, 'public/data/toulouse/transit.json');
const data = JSON.parse(readFileSync(path, 'utf8')) as TransitData;
for (const s of data.segments) if (s.lines.includes('teleo')) s.el = new Array(s.pts.length / 2).fill(1);
writeFileSync(path, JSON.stringify(data));
