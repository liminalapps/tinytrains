// Rome: ATAC Metro A, B/B1, C and trams from the Roma Servizi per la Mobilità GTFS (keyless, GTFS kit), plus the
// Cotral-run Roma–Lido (Metromare) and Roma–Viterbo urban railways, which publish no GTFS, from OSM and researched
// headways (sim kit). The two kits' transit.json files are merged into one.
// Run: npx tsx scripts/build-rome.ts [--refresh] [--debug]
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TransitData } from '../shared/types.ts';
import { buildGtfsCity, type StockMix } from './lib/gtfs/index.ts';
import { ROOT } from './lib/gtfs/feed.ts';
import { buildSimCity, type DayServices } from './lib/osm-network/index.ts';

// ---------------------------------------------------------------------------- railways (sim kit)
// Italian public holidays, plus Rome's patron saints' day (29 June), run the Sunday service.
const HOLIDAYS = [
  '2026-01-01', '2026-01-06', '2026-04-05', '2026-04-06', '2026-04-25', '2026-05-01', '2026-06-02', '2026-06-29',
  '2026-08-15', '2026-11-01', '2026-12-08', '2026-12-25', '2026-12-26',
  '2027-01-01', '2027-01-06', '2027-03-28', '2027-03-29', '2027-04-25', '2027-05-01', '2027-06-02', '2027-06-29',
  '2027-08-15', '2027-11-01', '2027-12-08', '2027-12-25', '2027-12-26',
];
// Metromare: every day 05:15–23:30 from both ends, 37 minutes end to end; the 2026 timetable with nine trains in
// line runs about every 12–15 minutes by day and 20 early and late.
const LIDO: DayServices = {
  weekday: { first: '05:15', last: '23:30', headways: [['05:15', 20], ['06:30', 12], ['09:30', 15], ['16:30', 12], ['19:30', 15], ['21:00', 20]] },
  saturday: { first: '05:15', last: '23:30', headways: [['05:15', 20], ['07:00', 15], ['21:00', 20]] },
  sunday: { first: '05:15', last: '23:30', headways: [['05:15', 20], ['08:00', 15], ['21:00', 20]] },
};
// Roma–Viterbo urban service Flaminio–Montebello: every 10–15 minutes, all stops.
const VITERBO: DayServices = {
  weekday: { first: '05:45', last: '22:30', headways: [['05:45', 15], ['06:45', 10], ['09:30', 15], ['16:30', 10], ['19:30', 15], ['21:00', 20]] },
  saturday: { first: '05:45', last: '22:30', headways: [['05:45', 20], ['07:00', 15], ['21:00', 20]] },
  sunday: { first: '06:00', last: '22:30', headways: [['06:00', 20], ['08:00', 15], ['21:00', 20]] },
};

await buildSimCity({
  city: 'rome',
  systems: [{ id: 'cotral', name: 'Railways' }],
  lines: [
    {
      id: 'lido', system: 'cotral', name: 'Rome–Lido (Metromare)', nameLocal: 'Ferrovia Roma-Lido (Metromare)', short: 'RL',
      color: '#7EB9E6', bullet: 'pill', kind: 'rail', osm: { relations: [208013, 1721156] },
      run: { vmax: 90, dwell: 30, trip: { from: 'Porta San Paolo', to: 'Cristoforo Colombo', minutes: 37 } },
      service: LIDO,
      patterns: [{ from: 'Porta San Paolo', to: 'Cristoforo Colombo', share: 1 }],
      stock: [{ stock: 'rome-lido-ma300', cars: 6, share: 3 }, { stock: 'rome-ma200', cars: 6, share: 1 }],
      directions: ['To Ostia', 'To Rome'],
    },
    {
      id: 'viterbo', system: 'cotral', name: 'Rome–Viterbo (urban)', nameLocal: 'Ferrovia Roma-Viterbo (urbana)', short: 'RV',
      color: '#7E7BB4', bullet: 'pill', kind: 'rail', osm: { relations: [387417, 1721478] },
      run: { vmax: 70, dwell: 25, trip: { from: 'Flaminio', to: 'Montebello', minutes: 27 } },
      service: VITERBO,
      patterns: [{ from: 'Flaminio', to: 'Montebello', share: 1 }],
      stock: [{ stock: 'rome-e84', cars: 3, share: 2 }, { stock: 'rome-mrp236', cars: 3, share: 1 }],
      directions: ['Outbound', 'Inbound'],
    },
  ],
  calendar: { holidays: HOLIDAYS },
  names: { local: ['name'], en: ['name'] },
  attribution: ['Roma–Lido and Roma–Viterbo: simulated from Cotral published frequencies'],
});
const simTransit = join(ROOT, '.cache/rome/sim-transit.json');
renameSync(join(ROOT, 'public/data/rome/transit.json'), simTransit);

// ---------------------------------------------------------------------------- ATAC metro and trams (GTFS kit)
// Fleet shares for the timetable fallback (2025/26): Line A runs only CAF MA300s; Line B has 17 MB400s, 7 MA300s and
// a handful of MB100s still in daily use (the Hitachi MB500 is still in testing). Line C runs AnsaldoBreda MC100s.
const LINE_B: StockMix[] = [
  { stock: 'rome-mb400', cars: 6, share: 17 },
  { stock: 'rome-ma300', cars: 6, share: 7 },
  { stock: 'rome-mb100', cars: 6, share: 3 },
];
// Trams: Cityway 1 and 2 on 8 (and 2), Socimi and Stanga on the older lines. Live trams get their stock from the
// car number (server/adapters/rome). Since mid-2025 only line 8 runs; the others are bus-replaced for works.
const CITYWAY: StockMix[] = [{ stock: 'rome-cityway1', cars: 1, share: 1 }, { stock: 'rome-cityway2', cars: 1, share: 1 }];
const TRAM_MIX: Record<string, StockMix[]> = {
  '2': CITYWAY,
  '3': [{ stock: 'rome-stanga', cars: 1, share: 3 }, { stock: 'rome-socimi', cars: 1, share: 2 }],
  '5': [{ stock: 'rome-socimi', cars: 1, share: 1 }, { stock: 'rome-stanga', cars: 1, share: 1 }],
  '8': CITYWAY,
  '14': [{ stock: 'rome-cityway2', cars: 1, share: 3 }, { stock: 'rome-socimi', cars: 1, share: 2 }],
  '19': [{ stock: 'rome-socimi', cars: 1, share: 1 }, { stock: 'rome-stanga', cars: 1, share: 1 }],
};
// ATAC tram map colors.
const TRAM_COLOR: Record<string, string> = { '2': '#1C63B7', '3': '#3AAA35', '5': '#ED1C24', '8': '#BFDF14', '14': '#00ADEF', '19': '#F89C0E' };

const SMALL = new Set(['di', 'del', 'della', 'dei', 'degli', 'da', 'de', 'in', 'e']);
/** GTFS stop names (often UPPERCASE, abbreviated, with '(MA)' line tags) to display names. */
function cleanName(raw: string): string {
  let n = raw.replace(/\s*\((MA|MB|MB1|MC|FS|H|MA-MB-FS|MA-MB|MB-MC|MA-MC)\)\s*/gi, ' ').replace(/\s+/g, ' ').trim();
  n = n
    .toLowerCase()
    .replace(/(^|[\s/'.-])(\p{L})/gu, (_, p, c) => p + c.toUpperCase())
    .replace(/\b(\p{L}+)\b/gu, (w, _x, i) => (i > 0 && SMALL.has(w.toLowerCase()) ? w.toLowerCase() : w));
  const fix: [RegExp, string][] = [
    [/^S\.\s*Giovanni$/, 'San Giovanni'],
    [/^Metronia$/, 'Porta Metronia'],
    [/^Colosseo\/Fori Imperiali$/, 'Colosseo'],
    [/^Tiburtina F\.s\.$/i, 'Tiburtina'],
    [/^S\.m\. del Soccorso$/i, 'Santa Maria del Soccorso'],
    [/^S\.agnese\/Annibaliano$/i, "Sant'Agnese/Annibaliano"],
    [/^Cinecitta'$/, 'Cinecittà'],
    [/^Conca D'oro$/i, "Conca d'Oro"],
    [/^Eur /, 'EUR '],
    [/^Staz\.ne /i, 'Stazione '],
    [/^P\.za /i, 'Piazza '],
  ];
  for (const [re, to] of fix) n = n.replace(re, to);
  return n;
}

await buildGtfsCity({
  city: 'rome',
  feeds: [{ id: 'rsm', url: 'https://romamobilita.it/sites/default/files/rome_static_gtfs.zip' }],
  systems: [
    { id: 'metro', name: 'Metro', live: 'scheduled' },
    { id: 'tram', name: 'Tram', live: 'realtime' },
  ],
  lines: [
    {
      id: 'a', system: 'metro', match: { agency: 'OP1', routeId: 'MEA' }, name: 'Line A', nameLocal: 'Linea A', short: 'A',
      color: '#F36C21', textColor: '#FFFFFF', kind: 'metro', bullet: 'square', stock: [{ stock: 'rome-ma300', cars: 6 }], osm: ['subway'],
    },
    {
      id: 'b', system: 'metro', match: { agency: 'OP1', routeId: 'MEB' }, name: 'Line B', nameLocal: 'Linea B', short: 'B',
      color: '#0071BB', textColor: '#FFFFFF', kind: 'metro', bullet: 'square', stock: LINE_B, osm: ['subway'],
    },
    {
      id: 'b1', system: 'metro', match: { agency: 'OP1', routeId: 'MEB1' }, name: 'Line B1', nameLocal: 'Linea B1', short: 'B1',
      color: '#0071BB', textColor: '#FFFFFF', kind: 'metro', bullet: 'square', stock: LINE_B, osm: ['subway'],
    },
    {
      id: 'c', system: 'metro', match: { agency: 'OP1', routeId: 'MEC' }, name: 'Line C', nameLocal: 'Linea C', short: 'C',
      color: '#008751', textColor: '#FFFFFF', kind: 'metro', bullet: 'square', stock: [{ stock: 'rome-mc100', cars: 6 }], osm: ['subway'],
    },
  ],
  routes: {
    match: { agency: 'OP1', routeType: 0 },
    line: (r) => ({
      id: `t${r.route_short_name}`,
      system: 'tram',
      name: `Tram ${r.route_short_name}`,
      short: r.route_short_name,
      color: TRAM_COLOR[r.route_short_name] ?? '#6D6E71',
      textColor: r.route_short_name === '8' ? '#000000' : '#FFFFFF',
      kind: 'tram',
      bullet: 'square',
      stock: TRAM_MIX[r.route_short_name] ?? CITYWAY,
    }),
  },
  stations: {
    idPrefix: 'rom',
    // Metro platforms carry no parent station, and interchange stops are spelled differently per line.
    group: (s) => cleanName(s.stop_name).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    maxSpread: 150,
    name: (n) => cleanName(n),
  },
  trips: {
    dest: (t) => cleanName(t.trip.trip_headsign || t.allStops.at(-1)!.name),
  },
  realtimeKeys: true,
  days: { from: -2, to: 45 },
  out: { transit: '.cache/rome/gtfs-transit.json' },
  attribution: [
    'Timetables and realtime: Roma Servizi per la Mobilità (romamobilita.it open data)',
    'Track levels © OpenStreetMap contributors',
  ],
});

// ---------------------------------------------------------------------------- merge
const g = JSON.parse(readFileSync(join(ROOT, '.cache/rome/gtfs-transit.json'), 'utf8')) as TransitData;
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
writeFileSync(join(ROOT, 'public/data/rome/transit.json'), JSON.stringify(merged));
console.log(`merged transit.json: ${merged.lines.length} lines, ${merged.stations.length} stations, ${merged.segments.length} segments`);
