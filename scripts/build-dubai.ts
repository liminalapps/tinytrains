// Dubai: RTA Metro (Red Line with its Route 2020 branch to Expo City, Green Line) and the Dubai Tram from the RTA
// static GTFS published on Dubai Pulse (keyless mirror: Mobility Database feed 3359), GTFS kit; plus the privately run
// Palm Monorail, which publishes no GTFS, from OSM and its posted 15-minute interval (sim kit). The two kits'
// transit.json files are merged into one.
// Run: ./node_modules/.bin/tsx scripts/build-dubai.ts [--refresh] [--debug]
import { execSync } from 'node:child_process';
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TransitData } from '../shared/types.ts';
import { buildGtfsCity, type StockMix } from './lib/gtfs/index.ts';
import { ROOT } from './lib/gtfs/feed.ts';
import { buildSimCity } from './lib/osm-network/index.ts';

// UAE public holidays (Islamic dates approximate) run the Sunday service.
const HOLIDAYS = [
  '2026-01-01', '2026-03-19', '2026-03-20', '2026-03-21', '2026-05-26', '2026-05-27', '2026-05-28', '2026-05-29',
  '2026-06-16', '2026-08-25', '2026-12-02', '2026-12-03',
  '2027-01-01', '2027-03-09', '2027-03-10', '2027-03-11', '2027-05-15', '2027-05-16', '2027-05-17', '2027-05-18',
  '2027-06-06', '2027-08-14', '2027-12-02', '2027-12-03',
];

// ---------------------------------------------------------------------------- Palm Monorail (sim kit)
// Every 15 minutes, 09:00–21:45 from Gateway and 09:15–22:00 from Atlantis, every day (palmmonorail.com). It reopened
// in June 2026 after a six-month closure.
await buildSimCity({
  city: 'dubai',
  systems: [{ id: 'monorail', name: 'Palm Monorail' }],
  lines: [
    {
      id: 'palm', system: 'monorail', name: 'Palm Monorail', nameLocal: 'مونوريل النخلة', short: 'PM',
      color: '#748477', bullet: 'pill', kind: 'monorail',
      osm: { relations: [7825237, 7825238] },
      run: { vmax: 55, dwell: 40, trip: { from: 'Palm Gateway', to: 'Atlantis Aquaventure', minutes: 12 } },
      service: {
        weekday: {
          first: '09:00', last: '21:45', headways: [['09:00', 15]],
          terminals: { 'Atlantis Aquaventure': { first: '09:15', last: '22:00' } },
        },
      },
      patterns: [{ from: 'Palm Gateway', to: 'Atlantis Aquaventure', share: 1 }],
      stock: [{ stock: 'dubai-palm-monorail', cars: 3 }],
      directions: ['To Atlantis', 'To Gateway'],
    },
  ],
  calendar: { holidays: HOLIDAYS, weekend: [0, 6] },
  names: { local: ['name:ar', 'name'], en: ['name:en', 'name'] },
  attribution: ['Palm Monorail: simulated from its published interval'],
});
const simTransit = join(ROOT, '.cache/dubai/sim-transit.json');
renameSync(join(ROOT, 'public/data/dubai/transit.json'), simTransit);

// ---------------------------------------------------------------------------- RTA metro and tram (GTFS kit)
// 79 Kinki Sharyo five-car sets (60 bought for the Red Line, 19 for the Green) and 50 Alstom Metropolis sets, which
// RTA runs mostly on the Green Line. The shares are estimates.
const RED: StockMix[] = [{ stock: 'dubai-kinki', cars: 5, share: 3 }, { stock: 'dubai-metropolis', cars: 5, share: 2 }];
const GREEN: StockMix[] = [{ stock: 'dubai-metropolis', cars: 5, share: 3 }, { stock: 'dubai-kinki', cars: 5, share: 1 }];

/** 'BurJuman Metro Station 1', 'Union  (Green Line ) Metro Station 1', 'Knowledge Village1' → 'BurJuman', 'Union', … */
function cleanName(raw: string): string {
  const metro = /Metro\s+station/i.test(raw);
  const n = raw
    .replace(/\(Green Line\s*\)/i, '')
    .replace(metro ? /\s*Metro\s+station\s*\d*\s*$/i : /(\D)\s*[12]$/, metro ? '' : '$1')
    .replace(/\s+/g, ' ')
    .trim();
  // The tram's two JBR stops are separate stations; the platform suffix is the only difference.
  if (/^Jumeirah Beach Residence$/.test(n)) return raw.trim();
  const fix: Record<string, string> = { centrepoint: 'Centrepoint', max: 'Max', 'Burj Khalifa/ Dubai Mall': 'Burj Khalifa/Dubai Mall', EXPO: 'Expo City Dubai' };
  return fix[n] ?? n;
}

// Arabic stop names come from translations.txt ('محطة المترو_برجمان 1', 'القصيص - محطة المترو 1', …).
const ARABIC_FIX: Record<string, string> = {
  'Airport Terminal 3': 'مبنى المطار 3',
  'Airport Terminal 1': 'مبنى المطار 1',
  'Jumeirah Beach Residence 1': 'جي بي آر 1',
  'Jumeirah Beach Residence 2': 'جي بي آر 2',
  'e&': 'إي آند',
  'Expo City Dubai': 'إكسبو سيتي دبي',
};
function arabicNames(zip: string): Map<string, string> {
  const out = new Map<string, string>();
  const text = execSync(`unzip -p '${zip}' translations.txt | grep '^"stops","stop_name","ar"'`, { maxBuffer: 1 << 26 }).toString();
  for (const line of text.split('\n')) {
    const m = line.match(/^"stops","stop_name","ar","([^"]*)","([^"]*)"/);
    if (!m) continue;
    const ar = m[1]
      .replace(/ـ/g, '')
      .replace(/محطة\s*(ال)?مترو\s*[_-]?/g, '')
      .replace(/e&/g, '')
      .replace(/[_-]?\s*الخط الأخضر/g, '')
      .replace(/^\s*\d+\s+/, '')
      .replace(/\s*[-_]\s*$/, '')
      .replace(/\s*\d\s*$/, '')
      .replace(/^[\s_-]+|[\s_-]+$/g, '')
      .replace(/\s+/g, ' ');
    out.set(m[2], ar);
  }
  return out;
}
let arabic: Map<string, string> | undefined;

// Line colors are RTA's own route_color values from the GTFS.
const lineColors = { red: '#E91D2F', green: '#0AAE53' };

await buildGtfsCity({
  city: 'dubai',
  feeds: [{ id: 'rta', url: 'https://files.mobilitydatabase.org/mdb-3359/latest.zip' }],
  systems: [
    { id: 'metro', name: 'Metro', live: 'scheduled' },
    { id: 'tram', name: 'Tram', live: 'scheduled' },
  ],
  lines: [
    {
      id: 'red', system: 'metro', match: { routeId: ['11-MRe-1-y08-1', '11-MRe-2-y08-1'] }, name: 'Red Line', nameLocal: 'الخط الأحمر',
      short: 'R', color: lineColors.red, textColor: '#FFFFFF', kind: 'metro', bullet: 'circle', stock: RED, osm: ['subway'],
      osmRelations: [420297, 7734260, 12820284, 12820285],
    },
    {
      id: 'green', system: 'metro', match: { routeId: '11-MGr-n-y08-1' }, name: 'Green Line', nameLocal: 'الخط الأخضر',
      short: 'G', color: lineColors.green, textColor: '#FFFFFF', kind: 'metro', bullet: 'circle', stock: GREEN, osm: ['subway'],
      osmRelations: [2767663, 7734261],
    },
    {
      id: 'tram', system: 'tram', match: { routeId: '5-T01-y08-1' }, name: 'Dubai Tram', nameLocal: 'ترام دبي',
      short: 'T', color: '#F47922', textColor: '#FFFFFF', kind: 'tram', bullet: 'square', stock: [{ stock: 'dubai-citadis', cars: 1 }],
      osmRelations: [7826083],
    },
  ],
  stations: {
    idPrefix: 'dxb',
    group: (s) => cleanName(s.stop_name).toLowerCase().replace(/&/g, '-and').replace(/[^a-z0-9]+/g, '-'),
    maxSpread: 150,
    name: (n) => cleanName(n),
    nameLocal: (n, s) => {
      arabic ??= arabicNames(join(ROOT, '.cache/dubai/rta.zip'));
      return ARABIC_FIX[cleanName(n)] ?? arabic.get(s.stop_id);
    },
  },
  trips: {
    dest: (t) => cleanName(t.trip.trip_headsign || t.allStops.at(-1)!.name),
    destLocal: (t) => {
      const last = t.allStops.at(-1)!;
      return ARABIC_FIX[cleanName(last.name)] ?? arabic?.get(last.stopId);
    },
  },
  out: { transit: '.cache/dubai/gtfs-transit.json' },
  attribution: ['Timetables: Roads and Transport Authority (RTA), Dubai Pulse open data', 'Track levels © OpenStreetMap contributors'],
});

// ---------------------------------------------------------------------------- merge
const g = JSON.parse(readFileSync(join(ROOT, '.cache/dubai/gtfs-transit.json'), 'utf8')) as TransitData;
const s = JSON.parse(readFileSync(simTransit, 'utf8')) as TransitData;
const merged: TransitData = {
  ...g,
  attribution: [...new Set([...g.attribution, ...s.attribution])],
  systems: [...g.systems, ...s.systems],
  lines: [...g.lines, ...s.lines],
  stations: [...g.stations, ...s.stations],
  segments: [...g.segments, ...s.segments],
};
const ids = new Set(g.stations.map((x) => x.id));
const clash = s.stations.filter((x) => ids.has(x.id));
if (clash.length) throw new Error(`station id clash: ${clash.map((x) => x.id).join(', ')}`);
writeFileSync(join(ROOT, 'public/data/dubai/transit.json'), JSON.stringify(merged));
console.log(`merged transit.json: ${merged.lines.length} lines, ${merged.stations.length} stations, ${merged.segments.length} segments`);
