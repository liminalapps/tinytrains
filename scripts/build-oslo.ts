// Oslo: Ruter's T-bane and trikk, Flytoget and Vy's local and regional trains, from Entur's keyless national GTFS
// (NLOD). Entur's GTFS-realtime shares the trip ids, so they are stored for matching.
// Run: npx tsx scripts/build-oslo.ts [--refresh] [--debug]
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildGtfsCity, type StockMix } from './lib/gtfs/index.ts';
import type { TransitData } from '../shared/types.ts';
import { ROOT, splitCsv } from './lib/gtfs/feed.ts';

const ENTUR = 'https://storage.googleapis.com/marduk-production/outbound/gtfs';
const mix = (...m: [string, number, number][]): StockMix[] => m.map(([stock, cars, share]) => ({ stock, cars, share }));

// Colors from Ruter's line signs; the GTFS gives every metro line the same orange and every tram the same blue.
const TBANE: [string, string, string][] = [
  ['1', 'Frognerseteren – Bergkrystallen', '#009CDC'],
  ['2', 'Østerås – Ellingsrudåsen', '#EC700C'],
  ['3', 'Kolsås – Mortensrud', '#A85FA5'],
  ['4', 'Vestli – Bergkrystallen', '#00489A'],
  ['5', 'Sognsvann – Vestli', '#3AAA35'],
];

/** Line 15 runs Kjelsås–Majorstuen in place of line 11 while the Briskeby line is rebuilt (until December 2026). */
const TRIKK: Record<string, string> = {
  '11': '#75C92B',
  '12': '#9F50AE',
  '13': '#33B764',
  '15': '#E5609E', // "rosa" on Ruter's map; no published value, so estimated
  '17': '#EF3120',
  '18': '#FAB217',
  '19': '#F6871C',
};

// Vy: L local (Class 72 on L1, mostly FLIRT 75 on L2), R regional (FLIRT 75), RE InterCity (FLIRT 74). The x
// variants are extra rush-hour trains of the same line.
const VY: { id: string; routes: string[]; name: string; stock: StockMix[] }[] = [
  { id: 'L1', routes: ['L1'], name: 'L1 Spikkestad – Oslo S – Lillestrøm', stock: mix(['oslo-vy72', 4, 0.5], ['oslo-vy72', 8, 0.5]) },
  { id: 'L2', routes: ['L2', 'L2x'], name: 'L2 Stabekk – Oslo S – Ski', stock: mix(['oslo-vy75', 5, 0.6], ['oslo-vy72', 4, 0.4]) },
  { id: 'R12', routes: ['R12'], name: 'R12 Kongsberg – Oslo S – Eidsvoll', stock: mix(['oslo-vy75', 5, 0.5], ['oslo-vy75', 10, 0.5]) },
  { id: 'R13', routes: ['R13', 'R13x'], name: 'R13 Drammen – Oslo S – Dal', stock: mix(['oslo-vy75', 5, 0.5], ['oslo-vy75', 10, 0.5]) },
  { id: 'R14', routes: ['R14'], name: 'R14 Asker – Oslo S – Kongsvinger', stock: mix(['oslo-vy75', 5, 0.6], ['oslo-vy75', 10, 0.4]) },
  { id: 'R21', routes: ['R21'], name: 'R21 Stabekk – Oslo S – Moss', stock: mix(['oslo-vy75', 5, 0.5], ['oslo-vy75', 10, 0.5]) },
  { id: 'R22', routes: ['R22'], name: 'R22 Skøyen – Oslo S – Mysen', stock: mix(['oslo-vy75', 5, 0.6], ['oslo-vy75', 10, 0.4]) },
  { id: 'R23', routes: ['R23', 'R23x'], name: 'R23 Stabekk – Oslo S – Moss', stock: mix(['oslo-vy75', 5, 0.6], ['oslo-vy75', 10, 0.4]) },
  { id: 'R31', routes: ['R31'], name: 'R31 Oslo S – Jaren', stock: 'oslo-vy75' },
  { id: 'RE10', routes: ['RE10'], name: 'RE10 Drammen – Oslo S – Lillehammer', stock: mix(['oslo-vy74', 5, 0.4], ['oslo-vy74', 10, 0.6]) },
  { id: 'RE11', routes: ['RE11', 'RX11'], name: 'RE11 Eidsvoll – Oslo S – Skien', stock: mix(['oslo-vy74', 5, 0.4], ['oslo-vy74', 10, 0.6]) },
  { id: 'RE20', routes: ['RE20', 'RX20'], name: 'RE20 Oslo S – Halden', stock: mix(['oslo-vy74', 5, 0.5], ['oslo-vy74', 10, 0.5]) },
  { id: 'RE30', routes: ['RE30'], name: 'RE30 Oslo S – Gjøvik', stock: 'oslo-vy75' },
].map((l) => ({ ...l, stock: typeof l.stock === 'string' ? mix([l.stock, 5, 1]) : l.stock }));

/** Quays of buses (NeTEx vehicle type 7xx): Vy runs its replacement buses inside the rail routes. */
const busQuays = new Map<string, Set<string>>();
function isBus(feed: string, stopId: string): boolean {
  let set = busQuays.get(feed);
  if (!set) {
    set = new Set();
    const [head, ...lines] = readFileSync(join(ROOT, '.cache/oslo', feed, 'stops.txt'), 'utf8').split('\n');
    const cols = splitCsv(head.replace(/^\uFEFF/, ''));
    const id = cols.indexOf('stop_id'), vt = cols.indexOf('vehicle_type');
    for (const l of lines) {
      const c = splitCsv(l);
      if (c[vt]?.startsWith('7')) set.add(c[id]);
    }
    busQuays.set(feed, set);
  }
  return set.has(stopId);
}

await buildGtfsCity({
  city: 'oslo',
  feeds: [
    { id: 'rut', url: `${ENTUR}/rb_rut-aggregated-gtfs.zip` },
    { id: 'flt', url: `${ENTUR}/rb_flt-aggregated-gtfs.zip` },
    { id: 'vyg', url: `${ENTUR}/rb_vyg-aggregated-gtfs.zip` },
  ],
  systems: [
    { id: 'tbane', name: 'T-bane', live: 'realtime' },
    { id: 'trikk', name: 'Trikk', live: 'realtime' },
    { id: 'flytoget', name: 'Flytoget', live: 'realtime' },
    { id: 'vy', name: 'Vy', live: 'realtime' },
  ],
  lines: [
    ...TBANE.map(([n, long, color]) => ({
      id: `t${n}`,
      system: 'tbane',
      match: { feed: 'rut', routeType: 1, shortName: n },
      name: `Line ${n} ${long}`,
      short: n,
      color,
      textColor: '#FFFFFF',
      kind: 'metro' as const,
      bullet: 'circle' as const,
      stock: mix(['oslo-mx3000', n === '1' ? 3 : 6, 1]),
      osm: ['subway', 'light_rail'],
    })),
    ...['1', '2'].map((n) => ({
      id: `fly${n}`,
      system: 'flytoget',
      match: { feed: 'flt', shortName: `FLY${n}` },
      name: n === '1' ? 'Flytoget FLY1 Drammen – Oslo Airport' : 'Flytoget FLY2 Stabekk – Oslo Airport',
      short: `FLY${n}`,
      color: '#F26B21',
      textColor: '#FFFFFF',
      kind: 'rail' as const,
      bullet: 'pill' as const,
      stock: mix(['oslo-fly71', 4, 0.45], ['oslo-fly71', 8, 0.2], ['oslo-fly78', 4, 0.35]),
    })),
    ...VY.map((l) => ({
      id: l.id.toLowerCase(),
      system: 'vy',
      match: { feed: 'vyg', routeType: 2, shortName: l.routes },
      name: l.name,
      short: l.id,
      kind: 'rail' as const,
      bullet: 'pill' as const,
      stock: l.stock,
    })),
  ],
  routes: {
    match: { feed: 'rut', routeType: 0 },
    line: (r) => ({
      id: `tr${r.route_short_name}`,
      system: 'trikk',
      name: `Tram ${r.route_short_name}`,
      short: r.route_short_name,
      color: TRIKK[r.route_short_name] ?? '#0B91EF',
      textColor: '#FFFFFF',
      kind: 'tram',
      bullet: 'square',
      stock: 'oslo-sl18',
      // Ruter's tram shapes double back on themselves in places (line 19 at Homansbyen): route over OSM tram track.
      geometry: 'osm',
    }),
  },
  // One track per station pair for trains: parallel platform tracks otherwise draw as a fan of ribbons.
  geometry: { variants: 'merge' },
  stations: {
    idPrefix: 'osl',
    // Entur's quays share NSR stop places across feeds: group on the raw stop place so Vy and Flytoget meet at Oslo S.
    group: (s) => s.parent_station || s.stop_id,
    name: (n) => n.replace(/\s+stasjon$/, '').trim(),
  },
  // Vy's service journeys carry the train number: 'VYG:ServiceJourney:2841-HVK_444073-R'.
  trips: {
    keepTrip: (t) => !t.stopIds.some((s) => isBus(t.feed, s)),
    label: (t) => (t.feed === 'vyg' ? t.trip.trip_id.match(/ServiceJourney:(\d+)-/)?.[1] : undefined),
  },
  realtimeKeys: true,
  days: { from: -2, to: 30 },
  attribution: ['Timetables & realtime: Entur (NLOD), Ruter, Vy, Flytoget', 'Track levels © OpenStreetMap contributors'],
});
cleanSegments('oslo');

/**
 * Two cleanups on the kit's transit.json:
 * - Hairpins: snapping a segment end to the far track of a double line, or a shape running into a siding, leaves turns
 *   sharper than 110° next to a short leg, which track never makes. Drop those vertices.
 * - Level steps: OSM splits ways where a tunnel or bridge starts, so the level (el) often changes between two points a
 *   few meters apart and the ribbon jumps up or down like a stair. Drop one of the pair so the ramp spans the longer leg.
 */
function cleanSegments(city: string) {
  const file = join(ROOT, `public/data/${city}/transit.json`);
  const t = JSON.parse(readFileSync(file, 'utf8')) as TransitData;
  let spikes = 0;
  for (const s of t.segments) {
    for (let i = 1; i < s.pts.length / 2 - 1; i++) {
      const [ax, ay, bx, by] = [s.pts[2 * i] - s.pts[2 * i - 2], s.pts[2 * i + 1] - s.pts[2 * i - 1], s.pts[2 * i + 2] - s.pts[2 * i], s.pts[2 * i + 3] - s.pts[2 * i + 1]];
      const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
      if (Math.min(la, lb) < 60 && (ax * bx + ay * by) / (la * lb || 1) < -0.34) {
        s.pts.splice(2 * i, 2);
        s.el?.splice(i, 1);
        spikes++;
        i = Math.max(0, i - 2);
      }
    }
  }
  let steps = 0;
  for (const s of t.segments) {
    if (!s.el) continue;
    for (let i = 0; i < s.el.length - 1; i++) {
      if (s.el[i] === s.el[i + 1] || Math.hypot(s.pts[2 * i + 2] - s.pts[2 * i], s.pts[2 * i + 3] - s.pts[2 * i + 1]) >= 40) continue;
      const drop = i + 1 < s.el.length - 1 ? i + 1 : i > 0 ? i : -1;
      if (drop < 0) continue;
      s.pts.splice(2 * drop, 2);
      s.el.splice(drop, 1);
      steps++;
      i = Math.max(-1, i - 2);
    }
  }
  writeFileSync(file, JSON.stringify(t));
  console.log(`removed ${spikes} hairpins and ${steps} level steps`);
}
