// Barcelona: TMB Metro L1–L11 and the Montjuïc funicular (TMB GTFS via the Mobility Database's keyless mirror), FGC's
// urban and suburban lines (FGC GTFS, with keyless GTFS-realtime), Trambaix and Trambesòs (TRAM GTFS) and the Renfe
// Rodalies R lines (Renfe Cercanías GTFS, with keyless GTFS-realtime). All through the GTFS kit.
// Run: npx tsx scripts/build-barcelona.ts [--refresh] [--debug]
import { buildGtfsCity, type StockMix } from './lib/gtfs/index.ts';

// TMB fleet (5-car trains; 2024 figures): L1 runs 14 series 6000 and 23 new 8000; L2, L9 and L10 the Alstom
// Metropolis 9000 (the L9/L10 batch driverless, without cabs); L3 24 new 7000 and part of the 39 CAF 5000s; L4 the 15
// series 2100 and 9000s; L5 the rest of the 5000s; L11 three two-car series 500 trains.
const S = (stock: string, share: number, cars = 5): StockMix => ({ stock, cars, share });
const METRO: { id: string; route: string | string[]; name: string; short: string; stock: StockMix[] }[] = [
  { id: 'l1', route: '1.1.1', name: 'L1', short: 'L1', stock: [S('barcelona-8000', 23), S('barcelona-6000', 14)] },
  { id: 'l2', route: '1.2.1', name: 'L2', short: 'L2', stock: [S('barcelona-9000', 1)] },
  { id: 'l3', route: '1.3.1', name: 'L3', short: 'L3', stock: [S('barcelona-7000', 24), S('barcelona-5000', 12)] },
  { id: 'l4', route: '1.4.1', name: 'L4', short: 'L4', stock: [S('barcelona-2100', 15), S('barcelona-9000', 8)] },
  { id: 'l5', route: '1.5.1', name: 'L5', short: 'L5', stock: [S('barcelona-5000', 1)] },
  { id: 'l9n', route: '1.94.1', name: 'L9 Nord', short: 'L9N', stock: [S('barcelona-9000-auto', 1)] },
  { id: 'l9s', route: '1.91.1', name: 'L9 Sud', short: 'L9S', stock: [S('barcelona-9000-auto', 1)] },
  { id: 'l10n', route: '1.104.1', name: 'L10 Nord', short: 'L10N', stock: [S('barcelona-9000-auto', 1)] },
  { id: 'l10s', route: '1.101.1', name: 'L10 Sud', short: 'L10S', stock: [S('barcelona-9000-auto', 1)] },
  { id: 'l11', route: '1.11.1', name: 'L11', short: 'L11', stock: [S('barcelona-500', 1, 2)] },
];

// FGC: Barcelona–Vallès (standard gauge) runs 4-car 112, 113 and 115 units, and the 3-car 114s on the L7, whose
// platforms are 60 m long. Llobregat–Anoia (metre gauge) runs the 3-car 213s, doubled at peaks.
const VALLES: StockMix[] = [
  { stock: 'barcelona-fgc112', cars: 4, share: 22 },
  { stock: 'barcelona-fgc113', cars: 4, share: 19 },
  { stock: 'barcelona-fgc115', cars: 4, share: 15 },
];
const ANOIA: StockMix[] = [{ stock: 'barcelona-fgc213', cars: 3, share: 3 }, { stock: 'barcelona-fgc213', cars: 6, share: 1 }];
const FGC: { id: string; routes: string[]; short: string; name: string; stock: StockMix[] }[] = [
  { id: 'l6', routes: ['L6'], short: 'L6', name: 'L6 Sarrià', stock: VALLES },
  { id: 'l7', routes: ['L7'], short: 'L7', name: 'L7 Av. Tibidabo', stock: [{ stock: 'barcelona-fgc114', cars: 3 }] },
  { id: 'l12', routes: ['L12'], short: 'L12', name: 'L12 Reina Elisenda', stock: VALLES },
  { id: 's1', routes: ['S1'], short: 'S1', name: 'S1 Terrassa', stock: VALLES },
  { id: 's2', routes: ['S2'], short: 'S2', name: 'S2 Sabadell', stock: VALLES },
  { id: 'l8', routes: ['L8'], short: 'L8', name: 'L8 Molí Nou', stock: ANOIA },
  { id: 's3', routes: ['S3'], short: 'S3', name: 'S3 Can Ros', stock: ANOIA },
  { id: 's4', routes: ['S4'], short: 'S4', name: 'S4 Olesa de Montserrat', stock: ANOIA },
  { id: 's8', routes: ['S8'], short: 'S8', name: 'S8 Martorell', stock: ANOIA },
  { id: 's9', routes: ['S9'], short: 'S9', name: 'S9 Quatre Camins', stock: ANOIA },
  { id: 'r5', routes: ['R5', 'R50', 'R53'], short: 'R5', name: 'R5 Manresa', stock: ANOIA },
  { id: 'r6', routes: ['R6', 'R60', 'R63'], short: 'R6', name: 'R6 Igualada', stock: ANOIA },
];

// Rodalies (Renfe, 2025 fleet): 111 three-car 447s, 67 Civia sets and 18 double-deck 450/451s, the double-deckers on
// the R2 family. Colors from Rodalies de Catalunya.
const R447 = (share: number, cars = 3): StockMix => ({ stock: 'barcelona-447', cars, share });
const CIVIA = (share: number): StockMix => ({ stock: 'barcelona-civia', cars: 5, share });
const R450 = (share: number): StockMix => ({ stock: 'barcelona-450', cars: 6, share });
const RODALIES: { id: string; color: string; text?: string; stock: StockMix[] }[] = [
  { id: 'R1', color: '#4499D4', stock: [R447(2, 6), R447(1), CIVIA(1)] },
  { id: 'R2', color: '#009900', stock: [R447(2, 6), CIVIA(2), R450(1)] },
  { id: 'R2N', color: '#99C83E', text: '#1A1A1A', stock: [CIVIA(2), R447(1, 6), R450(1)] },
  { id: 'R2S', color: '#00642E', stock: [R447(2, 6), R450(1)] },
  { id: 'R3', color: '#FF131A', stock: [R447(1)] },
  { id: 'R4', color: '#FF9221', stock: [R447(2, 6), CIVIA(1)] },
  { id: 'R7', color: '#BD7DB5', stock: [R447(1), CIVIA(1)] },
];

// TRAM uses one teal for every line.
const TRAM_COLOR = '#008E7A';
const TRAM_STOCK: StockMix[] = [{ stock: 'barcelona-citadis302', cars: 1 }];
const TRAMS: { id: string; feed: string; route: string }[] = [
  { id: 'T1', feed: 'tbx', route: '1' },
  { id: 'T2', feed: 'tbx', route: '2' },
  { id: 'T3', feed: 'tbx', route: '3' },
  { id: 'T4', feed: 'tbs', route: '4' },
  { id: 'T5', feed: 'tbs', route: '5' },
  { id: 'T6', feed: 'tbs', route: '6' },
];

// TRAM abbreviates and joins double names with '|'; Renfe prefixes city stations with 'Barcelona'.
const NAMES: Record<string, string> = {
  'Z.Universitària': 'Zona Universitària', 'Llevant-L.Planes': 'Llevant-Les Planes', 'Estació St.Adrià': 'Estació de Sant Adrià',
  'Sant Feliu|C.C.': 'Sant Feliu / Consell Comarcal', 'Ciutadella|V.O.': 'Ciutadella / Vila Olímpica', 'Hospital SJD|TV3': 'Hospital Sant Joan de Déu / TV3',
  Sicilia: 'Sicília', 'Torre Baró -Vallbona': 'Torre Baró-Vallbona', 'Pl. Molina': 'Plaça Molina',
};
function cleanName(raw: string): string {
  const n = raw.replace(/^Barcelona(\s*-\s*|\s+)(?=\p{Lu})/u, '').replace(/\s+/g, ' ').trim();
  return NAMES[n] ?? n.replace(/\|/g, ' / ');
}

await buildGtfsCity({
  city: 'barcelona',
  feeds: [
    { id: 'tmb', url: 'https://files.mobilitydatabase.org/mdb-2359/latest.zip' },
    { id: 'fgc', url: 'https://www.fgc.cat/google/google_transit.zip' },
    { id: 'tbx', url: 'https://opendata.tram.cat/GTFS/zip/TBX.zip' },
    { id: 'tbs', url: 'https://opendata.tram.cat/GTFS/zip/TBS.zip' },
    { id: 'renfe', url: 'https://ssl.renfe.com/ftransit/Fichero_CER_FOMENTO/fomento_transit.zip' },
  ],
  systems: [
    { id: 'metro', name: 'Metro', live: 'scheduled' },
    { id: 'fgc', name: 'FGC', live: 'realtime' },
    { id: 'tram', name: 'Tram', live: 'scheduled' },
    { id: 'rodalies', name: 'Rodalies', live: 'realtime' },
  ],
  lines: [
    ...METRO.map((m) => ({
      id: m.id,
      system: 'metro',
      match: { feed: 'tmb', routeId: m.route },
      name: m.name,
      short: m.short,
      kind: 'metro' as const,
      bullet: 'square' as const,
      stock: m.stock,
      osm: ['subway'],
    })),
    {
      id: 'fm', system: 'metro', match: { feed: 'tmb', routeId: '1.99.1' }, name: 'Montjuïc Funicular', nameLocal: 'Funicular de Montjuïc',
      short: 'FM', kind: 'cable', bullet: 'square', stock: [{ stock: 'barcelona-fm', cars: 2 }],
    },
    ...FGC.map((f) => ({
      id: f.id,
      system: 'fgc',
      match: { feed: 'fgc', routeId: f.routes },
      name: f.name,
      short: f.short,
      kind: (f.id.startsWith('l') ? 'metro' : 'rail') as 'metro' | 'rail',
      bullet: (f.id.startsWith('l') ? 'square' : 'pill') as 'square' | 'pill',
      stock: f.stock,
      osm: ['rail', 'subway', 'narrow_gauge', 'light_rail'],
    })),
    {
      id: 'fv', system: 'fgc', match: { feed: 'fgc', routeId: 'FV' }, name: 'Vallvidrera Funicular', nameLocal: 'Funicular de Vallvidrera',
      short: 'FV', kind: 'cable', bullet: 'square', stock: [{ stock: 'barcelona-fv', cars: 1 }],
    },
    ...TRAMS.map((t) => ({
      id: t.id.toLowerCase(),
      system: 'tram',
      match: { feed: t.feed, routeId: t.route },
      name: t.id,
      short: t.id,
      color: TRAM_COLOR,
      textColor: '#FFFFFF',
      kind: 'tram' as const,
      bullet: 'square' as const,
      stock: TRAM_STOCK,
    })),
    ...RODALIES.map((r) => ({
      id: r.id.toLowerCase(),
      system: 'rodalies',
      match: { feed: 'renfe', shortName: r.id, test: (route: Record<string, string>) => route.route_id.startsWith('51') },
      name: `Rodalies ${r.id}`,
      short: r.id,
      color: r.color,
      textColor: r.text ?? '#FFFFFF',
      kind: 'rail' as const,
      bullet: 'pill' as const,
      stock: r.stock,
      osm: ['rail'],
    })),
  ],
  stations: {
    idPrefix: 'bcn',
    maxSpread: 150,
    name: (n) => cleanName(n),
  },
  trips: {
    keepTrip: ({ feed, route }) =>
      feed === 'renfe' ? route.route_id.startsWith('51') : feed === 'tmb' ? route.route_id.startsWith('1.') : feed !== 'fgc' || route.route_type !== '3',
    dest: (t) => cleanName(t.trip.trip_headsign || t.allStops.at(-1)!.name),
    label: (t) => (t.feed === 'renfe' ? t.trip.trip_id.replace(/^\d+[A-Z]/, '').replace(/[A-Z]\d*[A-Za-z]*$/, '') : undefined),
    // Renfe's realtime trip ids carry a different service prefix ('5169L25693R1' vs '5165J25693R1'): key on the rest.
    rtKey: (t) => (t.feed === 'renfe' ? t.trip.trip_id.replace(/^\d+[A-Z]/, '') : t.trip.trip_id),
  },
  realtimeKeys: true,
  days: { from: -2, to: 35 },
  attribution: [
    'Metro: Transports Metropolitans de Barcelona (TMB) open data',
    'FGC timetables and realtime: Ferrocarrils de la Generalitat de Catalunya (dadesobertes.fgc.cat, CC BY 4.0)',
    'Tram: TRAM Barcelona open data',
    'Rodalies: Renfe open data (data.renfe.com)',
    'Track © OpenStreetMap contributors',
  ],
});

// A few Rodalies hops (the Passeig de Gràcia–França tunnel, Montcada) come out straight: the kit snaps each station to
// its nearest track, which can be a parallel one that doesn't connect. Re-route them here over OSM rail, searching from
// every track node near each end (multi-source Dijkstra).
{
  const { readFileSync, writeFileSync, existsSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { ROOT } = await import('./lib/gtfs/feed.ts');
  const { simplify } = await import('./lib/gtfs/geometry.ts');
  const { makeProjection, roundFlat, flatLength } = await import('../shared/geo.ts');
  type Way = { type: string; nodes: number[]; geometry: { lat: number; lon: number }[]; tags?: Record<string, string> };
  const { project } = makeProjection('barcelona');
  const file = join(ROOT, 'public/data/barcelona/transit.json');
  const transit = JSON.parse(readFileSync(file, 'utf8')) as { lines: { id: string; kind: string }[]; segments: { from: string; to: string; lines: string[]; pts: number[]; el?: number[] }[] };
  const sources: Record<string, string> = Object.fromEntries(RODALIES.map((r) => [r.id.toLowerCase(), 'osm-track.json']));

  const graphs = new Map<string, { xy: Map<number, [number, number]>; lvl: Map<number, number>; adj: Map<number, [number, number][]> }>();
  const graph = (name: string, kind: string) => {
    const key = `${name}|${kind}`;
    if (graphs.has(key)) return graphs.get(key)!;
    const xy = new Map<number, [number, number]>();
    const lvl = new Map<number, number>();
    const adj = new Map<number, [number, number][]>();
    const osm = JSON.parse(readFileSync(join(ROOT, '.cache/barcelona', name), 'utf8')) as { elements: Way[] };
    for (const w of osm.elements) {
      if (w.type !== 'way' || w.tags?.railway !== kind || !w.nodes || !w.geometry) continue;
      const level = w.tags.tunnel === 'yes' || w.tags.tunnel === 'building_passage' || Number(w.tags.layer) < 0 ? -1 : w.tags.bridge ? 1 : 0;
      w.nodes.forEach((n, i) => {
        xy.set(n, project(w.geometry[i].lon, w.geometry[i].lat));
        if (level === -1 || !lvl.has(n)) lvl.set(n, level);
        if (!i) return;
        const u = w.nodes[i - 1];
        const d = Math.hypot(xy.get(n)![0] - xy.get(u)![0], xy.get(n)![1] - xy.get(u)![1]);
        (adj.get(u) ?? adj.set(u, []).get(u)!).push([n, d]);
        (adj.get(n) ?? adj.set(n, []).get(n)!).push([u, d]);
      });
    }
    const g = { xy, lvl, adj };
    graphs.set(key, g);
    return g;
  };
  const kindOf = new Map(transit.lines.map((l) => [l.id, l.kind]));
  const todo = transit.segments.filter((s) => s.pts.length === 4 && sources[s.lines[0]] && flatLength(s.pts) > 150);
  let fixed = 0;
  for (const s of todo) {
    const src = sources[s.lines[0]];
    if (!existsSync(join(ROOT, '.cache/barcelona', src))) continue;
    const { xy, lvl, adj } = graph(src, kindOf.get(s.lines[0]) === 'metro' ? 'subway' : 'rail');
    const [ax, ay, bx, by] = s.pts;
    const near = (x: number, y: number) => [...xy].filter(([, p]) => Math.hypot(p[0] - x, p[1] - y) < 350).map(([n, p]) => [n, Math.hypot(p[0] - x, p[1] - y)] as [number, number]);
    const goal = new Map(near(bx, by));
    const dist = new Map<number, number>();
    const prev = new Map<number, number>();
    const open: [number, number][] = near(ax, ay).map(([n, d]) => [d, n]);
    for (const [d, n] of open) dist.set(n, d);
    let best: [number, number] | null = null;
    const limit = Math.hypot(bx - ax, by - ay) * 4 + 3000;
    while (open.length) {
      open.sort((a, b) => a[0] - b[0]);
      const [d, u] = open.shift()!;
      if (d > (dist.get(u) ?? Infinity) || d > limit) continue;
      if (best && d >= best[0]) break;
      const g = goal.get(u);
      if (g != null && (!best || d + g < best[0])) best = [d + g, u];
      for (const [v, w] of adj.get(u) ?? []) {
        if (d + w < (dist.get(v) ?? Infinity)) {
          dist.set(v, d + w);
          prev.set(v, u);
          open.push([d + w, v]);
        }
      }
    }
    if (!best) {
      console.warn(`barcelona: no track path ${s.from} -> ${s.to} (${s.lines.join(',')})`);
      continue;
    }
    const nodes: number[] = [];
    for (let n: number | undefined = best[1]; n != null; n = prev.get(n)) nodes.unshift(n);
    const raw = [ax, ay, ...nodes.flatMap((n) => xy.get(n)!), bx, by];
    const levels = [lvl.get(nodes[0]) ?? 0, ...nodes.map((n) => lvl.get(n) ?? 0), lvl.get(nodes.at(-1)!) ?? 0];
    const pts: number[] = [];
    const el: number[] = [];
    for (let i = 0; i < levels.length; ) {
      let j = i;
      while (j < levels.length && levels[j] === levels[i]) j++;
      const run = simplify(raw.slice(2 * i, 2 * j), 2);
      for (let k = 0; k < run.length; k += 2) pts.push(run[k], run[k + 1]), el.push(levels[i]);
      i = j;
    }
    s.pts = roundFlat(pts);
    s.el = el;
    fixed++;
  }
  writeFileSync(file, JSON.stringify(transit));
  console.log(`barcelona: re-routed ${fixed}/${todo.length} straight segments over OSM track`);
}
