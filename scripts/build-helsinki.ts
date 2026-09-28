// Helsinki: HSL metro, commuter trains, trams and the line 15 light rail from HSL's keyless GTFS (CC BY 4.0).
// HSL's GTFS-realtime (realtime.hsl.fi, keyless) has no trip ids, so trips are keyed by route, direction and start time.
// Run: npx tsx scripts/build-helsinki.ts [--refresh] [--debug]
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, splitCsv } from './lib/gtfs/feed.ts';
import { buildGtfsCity, type StockMix } from './lib/gtfs/index.ts';
import type { TransitData } from '../shared/types.ts';

const mix = (...m: [string, number, number][]): StockMix[] => m.map(([stock, cars, share]) => ({ stock, cars, share }));

// HSL's mode colors: every metro line is metro orange, every train purple, every tram green.
const METRO = '#FF6319';
const TRAIN = '#8C4799';
const TRAM = '#00985F';
const LIGHT_RAIL = '#007E79';

/** Commuter lines inside the HSL area run Sm5 FLIRTs; the longer VR lines beyond it run Sm4s. */
const TRAINS: [string, string][] = [
  ['A', 'Helsinki – Leppävaara'],
  ['E', 'Helsinki – Kauklahti'],
  ['L', 'Helsinki – Kirkkonummi'],
  ['U', 'Helsinki – Kirkkonummi'],
  ['Y', 'Helsinki – Siuntio'],
  ['K', 'Helsinki – Kerava'],
  ['I', 'Helsinki – Airport – Helsinki (via Tikkurila)'],
  ['P', 'Helsinki – Airport – Helsinki (via Myyrmäki)'],
  ['R', 'Helsinki – Riihimäki – Tampere'],
  ['T', 'Helsinki – Riihimäki'],
  ['D', 'Helsinki – Hämeenlinna'],
  ['Z', 'Helsinki – Lahti'],
  ['H', 'Helsinki – Hanko'],
];
const VR_LINES = new Set(['R', 'T', 'D', 'Z', 'H']);

/** Crown Bridges lines and line 13 run the bidirectional Artic X54s; the rest mix Artics and rebuilt Valmets. */
const X54_TRAMS = new Set(['11', '12', '13']);

/** '1H' -> 1, '9N' -> 9, '10B' -> 10: short-turn, night and variant routes belong to their line. */
const tramNumber = (short: string) => short.match(/^(\d+)[A-Z]?$/)?.[1];

/**
 * HSL's parent stations carry genitive names ('Kampin metroasema', 'Pasilan asema'); their platforms carry the plain
 * ones ('Kamppi', 'Pasila'). Name each station after its platforms.
 */
let platformNames: Map<string, string> | undefined;
function platformName(parent: string): string | undefined {
  if (!platformNames) {
    platformNames = new Map();
    const [head, ...lines] = readFileSync(join(ROOT, '.cache/helsinki/hsl/stops.txt'), 'utf8').split('\n');
    const cols = splitCsv(head.replace(/^\uFEFF/, ''));
    const name = cols.indexOf('stop_name'), par = cols.indexOf('parent_station');
    for (const l of lines) {
      const c = splitCsv(l);
      if (c[par] && !platformNames.has(c[par])) platformNames.set(c[par], c[name]);
    }
  }
  return platformNames.get(parent);
}

const hhmmss = (s: number) => [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map((v) => String(v).padStart(2, '0')).join(':');

await buildGtfsCity({
  city: 'helsinki',
  feeds: [{ id: 'hsl', url: 'https://infopalvelut.storage.hsldev.com/gtfs/hsl.zip' }],
  systems: [
    { id: 'metro', name: 'Metro', live: 'realtime' },
    { id: 'train', name: 'Commuter trains', live: 'realtime' },
    { id: 'tram', name: 'Tram', live: 'realtime' },
    { id: 'lightrail', name: 'Light rail', live: 'realtime' },
  ],
  lines: [
    ...(['M1', 'M2'] as const).map((m) => ({
      id: m.toLowerCase(),
      system: 'metro',
      match: { routeType: 1, shortName: [m, `${m}B`] },
      name: m === 'M1' ? 'M1 Kivenlahti – Vuosaari' : 'M2 Tapiola – Mellunmäki',
      short: m,
      color: METRO,
      textColor: '#FFFFFF',
      kind: 'metro' as const,
      bullet: 'square' as const,
      stock: mix(['helsinki-m300', 4, 0.5], ['helsinki-m100', 4, 0.38], ['helsinki-m200', 4, 0.12]),
      osm: ['subway'],
    })),
    ...TRAINS.map(([l, long]) => ({
      id: l.toLowerCase(),
      system: 'train',
      match: { routeType: 2, shortName: l },
      name: `${l} ${long}`,
      short: l,
      color: TRAIN,
      textColor: '#FFFFFF',
      kind: 'rail' as const,
      bullet: 'circle' as const,
      stock: VR_LINES.has(l) ? mix(['helsinki-sm4', 4, 0.6], ['helsinki-sm4', 6, 0.2], ['helsinki-sm4', 2, 0.2]) : mix(['helsinki-sm5', 4, 0.55], ['helsinki-sm5', 8, 0.45]),
    })),
    {
      id: 'lr15',
      system: 'lightrail',
      match: { routeId: '2015' },
      name: '15 Keilaniemi – Itäkeskus',
      short: '15',
      color: LIGHT_RAIL,
      textColor: '#FFFFFF',
      kind: 'light',
      bullet: 'square',
      stock: 'helsinki-artic-x54',
      osm: ['tram', 'light_rail'],
    },
  ],
  routes: {
    match: { routeType: 0 },
    line: (r) => {
      const n = tramNumber(r.route_short_name);
      if (!n) return null;
      return {
        id: `t${n}`,
        system: 'tram',
        name: `Tram ${n}`,
        short: n,
        color: TRAM,
        textColor: '#FFFFFF',
        kind: 'tram',
        bullet: 'square',
        stock: X54_TRAMS.has(n) ? 'helsinki-artic-x54' : mix(['helsinki-artic', 1, 0.6], ['helsinki-mlnrv', 1, 0.4]),
      };
    },
  },
  // Also cleans the signs: 'Keilaniemi (M) via Aalto-yliopisto' -> 'Keilaniemi'.
  // One track per station pair for trains: parallel platform tracks otherwise draw as a fan of ribbons.
  geometry: { variants: 'merge' },
  stations: { idPrefix: 'hel', name: (n, stop) => (platformName(stop.stop_id) ?? n).replace(/\s*\(M\)/g, '').replace(/\s+via\s.*$/, '').trim() },
  trips: {
    // The ring rail: I runs out via Tikkurila, P via Myyrmäki, both back to Helsinki after the airport.
    dir: (t) => (t.line === 'i' ? 'Counterclockwise' : t.line === 'p' ? 'Clockwise' : undefined),
    // Matches the TripDescriptor of HSL's realtime feed: route_id, direction_id and the origin's departure time.
    rtKey: (t) => `${t.route.route_id}|${t.trip.direction_id}|${hhmmss(t.allStops[0].a)}`,
  },
  realtimeKeys: true,
  days: { from: -2, to: 30 },
  attribution: ['Timetables & realtime: HSL (CC BY 4.0)', 'Track levels © OpenStreetMap contributors'],
});
cleanSegments('helsinki');

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
