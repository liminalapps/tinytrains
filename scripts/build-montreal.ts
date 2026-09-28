// Montreal: the STM Métro and exo commuter trains from their keyless GTFS feeds (GTFS kit), plus the REM light metro,
// which publishes no GTFS, from OSM and rem.info's published frequencies (sim kit). The two kits' transit.json files
// are merged into one.
// Run: npx tsx scripts/build-montreal.ts [--refresh] [--debug]
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'csv-parse/sync';
import type { TransitData } from '../shared/types.ts';
import { buildGtfsCity, type LineConfig, type StockMix } from './lib/gtfs/index.ts';
import { ROOT } from './lib/gtfs/feed.ts';
import { buildSimCity, type DayServices } from './lib/osm-network/index.ts';

// ---------------------------------------------------------------------------- REM (sim kit)
// Quebec statutory holidays run the normal hours with off-peak frequencies, like a Sunday.
const HOLIDAYS = [
  '2026-01-01', '2026-04-03', '2026-04-06', '2026-06-24', '2026-07-01', '2026-09-07', '2026-10-12', '2026-12-25',
  '2026-12-26', '2027-01-01', '2027-03-26', '2027-03-29', '2027-06-24', '2027-07-01', '2027-09-06', '2027-10-11',
  '2027-12-25', '2027-12-26',
];
// rem.info (2026): off-peak every 15 minutes on each branch (7.5 on the trunk); weekday peaks every 7 minutes to
// Deux-Montagnes, 14 to Anse-à-l'Orme and 3.5 between Brossard and Bois-Franc, so every fourth peak train turns at
// Bois-Franc. First departures about 05:30, last ones about 00:30–00:50 (01:20 on Saturday nights). A group's
// headway is one full cycle of its patterns, so the base group's 15 is one train per branch every 15 minutes.
const BASE: DayServices = {
  weekday: { first: '05:30', last: '00:45', headways: [['05:30', 15], ['06:30', 0], ['09:00', 15], ['15:30', 0], ['18:30', 15]] },
  saturday: { first: '05:30', last: '01:10', headways: [['05:30', 15]] },
  sunday: { first: '05:30', last: '00:45', headways: [['05:30', 15]] },
};
const PEAK: DayServices = {
  weekday: { first: '06:30', last: '18:30', headways: [['06:30', 14], ['09:00', 0], ['15:30', 14]] },
  saturday: null,
  sunday: null,
};
const REM_2 = [{ stock: 'montreal-rem', cars: 2 }];
const REM_4 = [{ stock: 'montreal-rem', cars: 4 }];

await buildSimCity({
  city: 'montreal',
  systems: [{ id: 'rem', name: 'REM' }],
  lines: [
    {
      id: 'rem', system: 'rem', name: 'REM', nameLocal: 'Réseau express métropolitain', short: 'A',
      color: '#84BD00', textColor: '#000000', bullet: 'circle', kind: 'light',
      osm: { relations: [19668643, 19668926, 19669299, 19672327] },
      run: { vmax: 90, acc: 1.0, dec: 1.0, dwell: 30, trip: { from: 'Brossard', to: 'Gare Centrale', minutes: 18 } },
      service: BASE,
      groups: { peak: PEAK },
      patterns: [
        { from: 'Brossard', to: 'Deux-Montagnes', share: 1, stock: REM_2, service: ['A4', 'A4'] },
        { from: 'Brossard', to: "Anse-à-l'Orme", share: 1, stock: REM_2, service: ['A3', 'A3'] },
        { from: 'Brossard', to: 'Deux-Montagnes', share: 2, group: 'peak', stock: REM_4, service: ['A4', 'A4'] },
        { from: 'Brossard', to: "Anse-à-l'Orme", share: 1, group: 'peak', stock: REM_4, service: ['A3', 'A3'] },
        { from: 'Brossard', to: 'Bois-Franc', share: 1, group: 'peak', stock: REM_4, service: ['A1', 'A1'] },
      ],
      stock: REM_2,
      directions: ['Westbound', 'Eastbound'],
    },
  ],
  calendar: { holidays: HOLIDAYS },
  names: { local: ['name'], en: ['name'] },
  attribution: ['REM: simulated from rem.info published frequencies'],
});
const simTransit = join(ROOT, '.cache/montreal/sim-transit.json');
renameSync(join(ROOT, 'public/data/montreal/transit.json'), simTransit);

// ---------------------------------------------------------------------------- STM Métro and exo (GTFS kit)
// Orange Line: all Azur. Green Line: 26 of the 71 Azur trains plus MR-73s. Yellow and Blue: six-car MR-73s.
const GREEN_MIX: StockMix[] = [
  { stock: 'montreal-azur', cars: 9, share: 3 },
  { stock: 'montreal-mr73', cars: 9, share: 2 },
];
const EXO_MIX: StockMix[] = [
  { stock: 'montreal-exo-multilevel', cars: 6, share: 2 },
  { stock: 'montreal-exo-multilevel', cars: 8, share: 2 },
  { stock: 'montreal-exo-multilevel', cars: 10, share: 1 },
];
// Saint-Jérôme runs the CRRC coaches (and a few older Bombardier BiLevels) alongside MultiLevels.
const SJ_MIX: StockMix[] = [
  { stock: 'montreal-exo-crrc', cars: 6, share: 2 },
  { stock: 'montreal-exo-multilevel', cars: 6, share: 1 },
];

const metro = (id: string, route: string, name: string, nameLocal: string, stock: string | StockMix[], textColor = '#FFFFFF'): LineConfig => ({
  id, system: 'stm', match: { feed: 'stm', routeId: route }, name, nameLocal, short: route,
  textColor, kind: 'metro', bullet: 'circle', stock, osm: ['subway'],
});
const exo = (route: string, short: string, name: string, stock: StockMix[] = EXO_MIX): LineConfig => ({
  id: `exo${short}`, system: 'exo', match: { feed: 'exo', routeId: route }, name: `${name} line`, nameLocal: `Ligne ${name}`,
  short, textColor: '#000000', kind: 'rail', bullet: 'pill', stock, osm: ['rail'],
});

const FIX: Record<string, string> = { Centrale: 'Gare Centrale', 'LONGUEUIL- U. de SHERBROOKE': 'Longueuil–Université-de-Sherbrooke' };
const clean = (n: string) => {
  const c = n.replace(/^(Station|Gare) /i, '').replace(/ ?-Zone [A-C]$/, '').replace(/\s+/g, ' ').trim();
  return FIX[c] ?? c;
};

// STM parent stations are named in capitals ('STATION BERRI-UQAM'); their platforms carry the mixed-case name.
let childName: Map<string, string> | undefined;
function stmName(stop: Record<string, string>): string | undefined {
  if (!childName) {
    childName = new Map();
    const rows = parse(readFileSync(join(ROOT, '.cache/montreal/stm/stops.txt')), { columns: true, bom: true }) as Record<string, string>[];
    for (const r of rows) if (r.parent_station && r.location_type === '0') childName.set(r.parent_station, r.stop_name);
  }
  return childName.get(stop.stop_id);
}

await buildGtfsCity({
  city: 'montreal',
  feeds: [
    { id: 'stm', url: 'https://www.stm.info/sites/default/files/gtfs/gtfs_stm.zip' },
    { id: 'exo', url: 'https://exo.quebec/xdata/trains/google_transit.zip' },
  ],
  systems: [
    { id: 'stm', name: 'Métro', live: 'scheduled' },
    { id: 'exo', name: 'exo Trains', live: 'scheduled' },
  ],
  lines: [
    metro('green', '1', 'Green Line', 'Ligne verte', GREEN_MIX),
    metro('orange', '2', 'Orange Line', 'Ligne orange', [{ stock: 'montreal-azur', cars: 9 }]),
    metro('yellow', '4', 'Yellow Line', 'Ligne jaune', [{ stock: 'montreal-mr73', cars: 6 }], '#000000'),
    metro('blue', '5', 'Blue Line', 'Ligne bleue', [{ stock: 'montreal-mr73', cars: 6 }]),
    exo('1', '11', 'Vaudreuil–Hudson'),
    exo('4', '12', 'Saint-Jérôme', SJ_MIX),
    exo('3', '13', 'Mont-Saint-Hilaire'),
    exo('5', '14', 'Candiac'),
    exo('6', '15', 'Mascouche'),
  ],
  stations: {
    idPrefix: 'mtl',
    // Métro and exo platforms of one interchange (Vendôme, Parc, De la Concorde…) share a name but no parent station.
    group: (s) => clean(s.stop_name).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-'),
    maxSpread: 150,
    name: (n, stop) => clean(n === n.toUpperCase() ? (stmName(stop) ?? n) : n),
  },
  trips: {
    keepTrip: ({ feed, route }) => feed !== 'stm' || ['1', '2', '4', '5'].includes(route.route_id),
    dest: (t) => clean(t.trip.trip_headsign || t.allStops.at(-1)!.name),
    dir: (t) => (t.feed === 'exo' ? (t.trip.direction_id === '1' ? 'Outbound' : 'Inbound') : undefined),
    label: (t) => (t.feed === 'exo' && t.trip.trip_short_name ? `Train ${t.trip.trip_short_name}` : undefined),
  },
  days: { from: -2, to: 45 },
  out: { transit: '.cache/montreal/gtfs-transit.json' },
  attribution: ['Timetables: Société de transport de Montréal (STM)', 'Timetables: exo', 'Track levels © OpenStreetMap contributors'],
});

// ---------------------------------------------------------------------------- merge
const g = JSON.parse(readFileSync(join(ROOT, '.cache/montreal/gtfs-transit.json'), 'utf8')) as TransitData;
const s = JSON.parse(readFileSync(simTransit, 'utf8')) as TransitData;
const merged: TransitData = {
  ...g,
  attribution: [...new Set([...g.attribution, ...s.attribution])],
  systems: [...g.systems, ...s.systems],
  lines: [...g.lines, ...s.lines],
  stations: [...g.stations, ...s.stations],
  segments: [...g.segments, ...s.segments],
};
// The REM runs through the Mount Royal Tunnel from just south of Canora to Gare Centrale, but OSM leaves parts of it
// untagged: put that whole stretch underground (Canora itself sits at the portal).
const TUNNEL = ['canora', 'edouard-montpetit', 'mcgill', 'gare-centrale'];
for (const seg of s.segments) {
  const a = TUNNEL.indexOf(seg.from), b = TUNNEL.indexOf(seg.to);
  if (a < 0 || b < 0 || Math.abs(a - b) !== 1 || !seg.el) continue;
  seg.el = seg.el.map(() => -1);
  if (seg.from === 'canora') seg.el[0] = 0;
  if (seg.to === 'canora') seg.el[seg.el.length - 1] = 0;
}
const ids = new Set(g.stations.map((x) => x.id));
const clash = s.stations.filter((x) => ids.has(x.id));
if (clash.length) throw new Error(`station id clash: ${clash.map((x) => x.id).join(', ')}`);
writeFileSync(join(ROOT, 'public/data/montreal/transit.json'), JSON.stringify(merged));
console.log(`merged transit.json: ${merged.lines.length} lines, ${merged.stations.length} stations, ${merged.segments.length} segments`);
