// Naples: Metro Lines 1 and 6, the Trenitalia-run Line 2 and three funiculars from the ANM GTFS, plus the EAV
// railways (Circumvesuviana, Cumana, Circumflegrea and the Line 11 "Arcobaleno" to Aversa) from the EAV GTFS.
// Both feeds are keyless. Run: ./node_modules/.bin/tsx scripts/build-naples.ts [--refresh] [--debug]
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildGtfsCity, type LineConfig, type StockMix } from './lib/gtfs/index.ts';
import { REFRESH, ROOT } from './lib/gtfs/feed.ts';

// ANM route ids: L1 4955, L2 4778 (Trenitalia), L6 2302, Chiaia F1 2305, Centrale F3 2315, Mergellina F4 2300.
// The Montesanto funicular (F2) is closed for its 20-year overhaul from May 2026 to early 2027 and not in the feed.
const METRO = 'Metro';
// OSM still tags some in-service EAV track as railway=construction (Pozzuoli tunnel, Mugnano–Piscinola).
const EAV_RAIL = ['rail', 'narrow_gauge', 'light_rail', 'subway', 'construction'];

const CV: StockMix[] = [
  { stock: 'naples-fe220', cars: 6, share: 3 },
  { stock: 'naples-metrostar', cars: 3, share: 2 },
  { stock: 'naples-etr300', cars: 3, share: 2 },
];
const FLEGREE: StockMix[] = [
  { stock: 'naples-et400', cars: 3, share: 1 },
  { stock: 'naples-et500', cars: 3, share: 1 },
];

type Line = Omit<LineConfig, 'kind' | 'bullet'> & { kind?: LineConfig['kind']; bullet?: LineConfig['bullet'] };
const lines: Line[] = [
  {
    id: 'l1', system: 'metro', match: { feed: 'anm', routeId: '4955' }, name: 'Line 1', nameLocal: 'Linea 1', short: '1',
    color: '#F8E414', textColor: '#000000', stock: [{ stock: 'naples-inneo', cars: 6 }], osmRelations: [386098, 2168102], osm: ['subway', 'rail', 'light_rail'],
  },
  {
    id: 'l2', system: 'metro', match: { feed: 'anm', routeId: '4778' }, name: 'Line 2', nameLocal: 'Linea 2', short: '2',
    color: '#4E78BA', textColor: '#FFFFFF',
    stock: [{ stock: 'naples-jazz', cars: 5, share: 2 }, { stock: 'naples-pop', cars: 4, share: 1 }], osmRelations: [445980, 2168103], osm: ['rail'],
  },
  {
    id: 'l6', system: 'metro', match: { feed: 'anm', routeId: '2302' }, name: 'Line 6', nameLocal: 'Linea 6', short: '6',
    color: '#179ED6', textColor: '#FFFFFF',
    stock: [{ stock: 'naples-t67', cars: 2, share: 1 }, { stock: 'naples-t67', cars: 1, share: 1 }], osmRelations: [446007, 2168104], osm: ['subway', 'light_rail'],
  },
  {
    id: 'l11', system: 'eav', match: { feed: 'eav', routeId: '2' }, name: 'Line 11 Arcobaleno', nameLocal: 'Linea 11 Arcobaleno',
    short: '11', color: '#F17238', textColor: '#FFFFFF', stock: [{ stock: 'naples-inneo-eav', cars: 6 }], osm: EAV_RAIL,
  },
  {
    id: 'sor', system: 'eav', match: { feed: 'eav', routeId: ['1', '1.', '1..'] }, name: 'Circumvesuviana Naples–Sorrento',
    nameLocal: 'Circumvesuviana Napoli–Sorrento', short: 'S', color: '#1E5AA8', textColor: '#FFFFFF', stock: CV, osm: EAV_RAIL,
  },
  {
    id: 'pog', system: 'eav', match: { feed: 'eav', routeId: '4' }, name: 'Circumvesuviana Naples–Poggiomarino',
    nameLocal: 'Circumvesuviana Napoli–Poggiomarino', short: 'P', color: '#2E9B45', textColor: '#FFFFFF', stock: CV, osm: EAV_RAIL,
  },
  {
    id: 'sar', system: 'eav', match: { feed: 'eav', routeId: '6' }, name: 'Circumvesuviana Naples–Sarno',
    nameLocal: 'Circumvesuviana Napoli–Sarno', short: 'Sa', color: '#D7262E', textColor: '#FFFFFF', stock: CV, osm: EAV_RAIL,
  },
  {
    id: 'bai', system: 'eav', match: { feed: 'eav', routeId: ['8', '8.', '8..'] }, name: 'Circumvesuviana Naples–Baiano',
    nameLocal: 'Circumvesuviana Napoli–Baiano', short: 'B', color: '#F2C500', textColor: '#000000', stock: CV, osm: EAV_RAIL,
  },
  {
    id: 'cum', system: 'eav', match: { feed: 'eav', routeId: ['9', '9.', '9..'] }, name: 'Cumana', nameLocal: 'Ferrovia Cumana',
    short: 'C', color: '#8C3B96', textColor: '#FFFFFF', stock: FLEGREE, osmRelations: [2168312, 2168313], osm: EAV_RAIL,
  },
  {
    id: 'cfl', system: 'eav', match: { feed: 'eav', routeId: ['5', '5.'] }, name: 'Circumflegrea', nameLocal: 'Ferrovia Circumflegrea',
    short: 'CF', color: '#0096A6', textColor: '#FFFFFF', stock: FLEGREE, osm: EAV_RAIL,
  },
  ...([
    ['fcen', '2315', 'Central Funicular', 'Funicolare Centrale', 'FC', 2],
    ['fchi', '2305', 'Chiaia Funicular', 'Funicolare di Chiaia', 'FCh', 2],
    ['fmer', '2300', 'Mergellina Funicular', 'Funicolare di Mergellina', 'FM', 1],
  ] as const).map(([id, routeId, name, nameLocal, short, cars]) => ({
    id, system: 'funicular', match: { feed: 'anm', routeId }, name, nameLocal, short, color: '#F89329', textColor: '#000000',
    kind: 'cable' as const, bullet: 'square' as const, stock: [{ stock: 'naples-funicular', cars }],
  })),
];

const SMALL = new Set(['di', 'del', 'della', 'dei', 'degli', 'delle', 'da', 'de', 'a', 'al', 'in', 'e']);
// ANM names (UPPER CASE) that need more than title case, and ANM's Line 2 stops, which are named after their squares.
const ANM: Record<string, string> = {
  's. rosa': 'Salvator Rosa', 's.rosa': 'Salvator Rosa', "universita'": 'Università', 'p. fuga': 'Piazza Fuga',
  'c.so v. emanuele': 'Corso Vittorio Emanuele', 'p.co angelina': 'Parco Angelina', 's. antonio': "Sant'Antonio",
  's. gioacchino': 'San Gioacchino', amedeo: 'Piazza Amedeo', leopardi: 'Piazza Leopardi', cavour: 'Piazza Cavour',
  'piazza garibaldi': 'Garibaldi', 'san giovanni - barra': 'San Giovanni-Barra', "medaglie d'oro": "Medaglie d'Oro",
  pozzuoli: 'Pozzuoli Solfatara',
};
const EAV: Record<string, string> = {
  'napoli p. garibaldi': 'Garibaldi', 'corso v. emanuele': 'Corso Vittorio Emanuele', 's. anastasia': "Sant'Anastasia",
  'via s. antonio': "Via Sant'Antonio", "portici via liberta'": 'Portici Via Libertà', 'vesuvio de meis (sa)': 'Vesuvio De Meis',
};
const titleCase = (k: string) =>
  k
    .replace(/(^|[\s/'.(-])(\p{L})/gu, (_, p, c) => p + c.toUpperCase())
    .replace(/\b(\p{L}+)\b/gu, (w, _x, i) => (i > 0 && SMALL.has(w.toLowerCase()) ? w.toLowerCase() : w));
/** GTFS stop names (ANM's are UPPER CASE, EAV's mixed) to display names. */
export function cleanName(raw: string): string {
  const s = raw.replace(/\s+/g, ' ').trim();
  const k = s.toLowerCase();
  const upper = !/[a-z]/.test(s);
  if (upper && ANM[k]) return ANM[k];
  if (!upper && EAV[k]) return EAV[k];
  const n = upper || s === k ? titleCase(k) : s.replace(/\b(\p{Ll})(\p{L}*)$/u, (w) => (SMALL.has(w) ? w : w[0].toUpperCase() + w.slice(1)));
  return n.replace(/\bS\. M\.\s*|\bS\. Maria\b/, 'Santa Maria').replace(/\bS\.\s?(?=[A-Z])/g, 'San ').replace(/'$/, '');
}
const key = (n: string) => cleanName(n).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-');

// The kit's default track query plus railway=construction (see EAV_RAIL). The main Overpass servers often time out on
// it, so the cache is filled from a mirror first when it's missing.
const TRACK = 'way["railway"~"^(subway|rail|light_rail|tram|funicular|narrow_gauge|construction)$"]["service"!~"^(yard|siding|spur)$"](40.7,14.0,41.0,14.6);';
const trackCache = join(ROOT, '.cache/naples/osm-track.json');
if (REFRESH || !existsSync(trackCache)) {
  const res = await fetch('https://maps.mail.ru/osm/tools/overpass/api/interpreter', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(`[out:json][timeout:600];${TRACK}out body geom;`)}`,
  });
  const text = await res.text();
  if (res.ok && text.trimStart().startsWith('{')) writeFileSync(trackCache, text);
}

await buildGtfsCity({
  city: 'naples',
  feeds: [
    { id: 'anm', url: 'http://www.anm.it/google/google-transit.zip' },
    { id: 'eav', url: 'https://www.wimob.it/cfile/download.php?file=google-transit.zip' },
  ],
  systems: [
    { id: 'metro', name: METRO, live: 'realtime' },
    { id: 'eav', name: 'EAV railways', live: 'scheduled' },
    { id: 'funicular', name: 'Funiculars', live: 'scheduled' },
  ],
  lines: lines.map((l) => ({ kind: 'metro' as const, bullet: 'circle' as const, ...l, ...(l.system === 'eav' ? { kind: 'rail' as const, bullet: 'pill' as const } : {}) })),
  stations: { idPrefix: 'nap', group: (s) => key(s.stop_name), maxSpread: 150, name: cleanName },
  trips: {
    dest: (t) => cleanName(t.trip.trip_headsign || t.allStops.at(-1)!.name),
    // EAV trips carry their train number.
    label: (t) => (t.feed === 'eav' && /^\d+$/.test(t.trip.trip_short_name ?? '') ? t.trip.trip_short_name : undefined),
  },
  geometry: {
    snap: 200,
    overpass: TRACK,
  },
  days: { from: -2, to: 45 },
  attribution: [
    'Timetables: ANM (Azienda Napoletana Mobilità) GTFS; EAV srl GTFS (Italian Open Data Licence)',
    'Line 2 delays: ViaggiaTreno (RFI)',
    'Track © OpenStreetMap contributors',
  ],
});
