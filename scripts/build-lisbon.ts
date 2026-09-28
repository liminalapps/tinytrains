// Lisbon: Metropolitano de Lisboa (official GTFS on dados.gov.pt), the Carris trams and funiculars (Carris GTFS, with
// keyless GTFS-realtime vehicle positions), CP's Sintra, Azambuja and Cascais suburban lines (CP GTFS) and Fertagus
// over the 25 de Abril bridge (TML GTFS). All through the GTFS kit.
// Run: npx tsx scripts/build-lisbon.ts [--refresh] [--debug]
import { CITIES } from '../shared/cities.ts';
import { buildGtfsCity, type StockMix } from './lib/gtfs/index.ts';

// Metro: 6-car trains (two M-R-M triple units) on every line since the Arroios rebuild (2021). No per-line allocation
// is published, so each line draws from the whole fleet in proportion to its size: 19 ML90, 38 ML95, 18 ML97 and
// 38 ML99 triple units, plus the 14 Stadler ML20 units, kept on the Yellow and Green lines' circle project.
const METRO_MIX: StockMix[] = [
  { stock: 'lisbon-ml90', cars: 6, share: 19 },
  { stock: 'lisbon-ml95', cars: 6, share: 38 },
  { stock: 'lisbon-ml97', cars: 6, share: 18 },
  { stock: 'lisbon-ml99', cars: 6, share: 38 },
];
const CIRCLE_MIX: StockMix[] = [...METRO_MIX, { stock: 'lisbon-ml20', cars: 6, share: 14 }];

const METRO = [
  { id: 'azul', route: 'A', rel: [371021, 7734161], name: 'Blue Line', local: 'Linha Azul', short: 'AZ', color: '#4E84C4', stock: METRO_MIX },
  { id: 'amarela', route: 'B', rel: [370761, 7734162], name: 'Yellow Line', local: 'Linha Amarela', short: 'AM', color: '#FDB913', text: '#1A1A1A', stock: CIRCLE_MIX },
  { id: 'verde', route: 'C', rel: [371080, 7734160], name: 'Green Line', local: 'Linha Verde', short: 'VD', color: '#00AAA6', stock: CIRCLE_MIX },
  { id: 'vermelha', route: 'D', rel: [371084, 7734159], name: 'Red Line', local: 'Linha Vermelha', short: 'VM', color: '#EE2B74', stock: METRO_MIX },
];

// Carris trams: the hill lines run only the 45 two-axle Remodelados; 15E runs the ten Siemens articulated cars and the
// fifteen CAF Urbos. Live trams get their type from the fleet number (server/adapters/lisbon).
const REMODELADO: StockMix[] = [{ stock: 'lisbon-remodelado', cars: 1 }];
// Carris publishes no per-line tram colors; these keep the lines apart on the map.
const TRAMS: { route: string; short: string; color: string; stock: StockMix[] }[] = [
  { route: '77_0', short: '12E', color: '#8E44AD', stock: REMODELADO },
  { route: '76_0', short: '15E', color: '#E4002B', stock: [{ stock: 'lisbon-urbos', cars: 1, share: 15 }, { stock: 'lisbon-siemens', cars: 1, share: 10 }] },
  { route: '78_0', short: '18E', color: '#2E86C1', stock: REMODELADO },
  { route: '213_0', short: '24E', color: '#16A085', stock: REMODELADO },
  { route: '79_0', short: '25E', color: '#D35400', stock: REMODELADO },
  { route: '75_0', short: '28E', color: '#F2B705', stock: REMODELADO },
];

// CP Lisbon suburban lines (the colors of CP's Lisbon network map, which its GTFS also carries).
const CP = [
  {
    id: 'sintra', match: ['Linha de Sintra'], name: 'Sintra Line', local: 'Linha de Sintra', short: 'S', color: '#008A3E',
    stock: [{ stock: 'lisbon-cp2300', cars: 8, share: 3 }, { stock: 'lisbon-cp2300', cars: 4, share: 2 }, { stock: 'lisbon-cp2400', cars: 8, share: 1 }, { stock: 'lisbon-cp3500', cars: 4, share: 1 }],
  },
  {
    id: 'azambuja', match: ['Linha da Azambuja', 'U'], name: 'Azambuja Line', local: 'Linha da Azambuja', short: 'Az', color: '#E3001B',
    stock: [{ stock: 'lisbon-cp2300', cars: 4, share: 2 }, { stock: 'lisbon-cp2400', cars: 4, share: 1 }, { stock: 'lisbon-cp3500', cars: 4, share: 2 }],
  },
  {
    id: 'cascais', match: ['Linha de Cascais'], name: 'Cascais Line', local: 'Linha de Cascais', short: 'C', color: '#F39200',
    stock: [{ stock: 'lisbon-cp3150', cars: 6, share: 2 }, { stock: 'lisbon-cp3150', cars: 3, share: 1 }, { stock: 'lisbon-cp3150', cars: 9, share: 1 }],
  },
];

// CP names carry no diacritics ('Braco de Prata'); restore them word by word.
const ACCENTS: Record<string, string> = {
  apolonia: 'Apolónia', braco: 'Braço', sacavem: 'Sacavém', alcantara: 'Alcântara', cacem: 'Cacém', massama: 'Massamá',
  abraao: 'Abraão', paco: 'Paço', alges: 'Algés', belem: 'Belém', sodre: 'Sodré', melecas: 'Meleças', povoa: 'Póvoa',
  setubal: 'Setúbal', sao: 'São', joao: 'João',
};
const CP_NAMES: Record<string, string> = {
  'Lisboa Santa Apolonia': 'Santa Apolónia', 'Lisboa Oriente': 'Oriente', 'Lisboa Rossio': 'Rossio',
  'Alcantara - Terra': 'Alcântara-Terra', 'Alcantara -  Mar': 'Alcântara-Mar', 'Alcantara - Mar': 'Alcântara-Mar',
  'Roma - Areeiro': 'Roma-Areeiro', 'Agualva - Cacem': 'Agualva-Cacém', 'Santa Cruz - Damaia': 'Santa Cruz-Damaia',
  'Massama - Barcarena': 'Massamá-Barcarena', 'Queluz - Belas': 'Queluz-Belas', 'Mira Sintra - Melecas': 'Mira Sintra-Meleças',
};
function cpName(raw: string): string {
  const n = raw.replace(/\s+/g, ' ').trim();
  return CP_NAMES[raw] ?? CP_NAMES[n] ?? n.replace(/\p{L}+/gu, (w) => ACCENTS[w.toLowerCase()] ?? w);
}

// Carris stop names are abbreviated ('Pç. Luis Camões (B. Alto)').
const CARRIS_ABBR: [RegExp, string][] = [
  [/\bPç\.\s*/g, 'Praça '], [/\bLg\.\s*/g, 'Largo '], [/\bCç\.\s*/g, 'Calçada '], [/(^|[\s/-])R\.\s*/g, '$1Rua '],
  [/\bSta\.\s*/g, 'Santa '], [/\bSto\.\s*/g, 'Santo '], [/\bS\.\s+(?=\p{Lu})/gu, 'São '], [/\bHosp\.\s*/g, 'Hospital '],
  [/\bNac\.\s*/g, 'Nacional '], [/\bCons\.\s*/g, 'Conselheiro '], [/\bLuis Camões\b/g, 'Luís de Camões'], [/\(B\. Alto\)/g, '(Bairro Alto)'],
  [/\(C\. Ourique\)/g, '(Campo de Ourique)'],
];
// The prepositions Carris drops ('Cais Sodré'), for the names people know.
const CARRIS_NAMES: Record<string, string> = {
  'Cais Sodré': 'Cais do Sodré', 'Praça Comércio': 'Praça do Comércio', 'Praça Figueira': 'Praça da Figueira', 'Rua Prata': 'Rua da Prata',
  'Mosteiro Jerónimos': 'Mosteiro dos Jerónimos', 'Belém (Museu Coches)': 'Belém (Museu dos Coches)', 'Largo Portas Sol': 'Largo das Portas do Sol',
  'Miradouro Santa Luzia': 'Miradouro de Santa Luzia', 'Cemitério Ajuda': 'Cemitério da Ajuda', 'Palácio Nacional Ajuda': 'Palácio Nacional da Ajuda',
  'Rua Graça': 'Rua da Graça', 'Igreja Anjos': 'Igreja dos Anjos', 'Campo Ourique (Prazeres)': 'Campo de Ourique (Prazeres)',
  'Rua Palma': 'Rua da Palma', 'Rua Conceição': 'Rua da Conceição', 'Calçada Estrela': 'Calçada da Estrela', 'Calçada Combro': 'Calçada do Combro',
  'Estação Santo Amaro': 'Estação de Santo Amaro', 'Largo Princesa': 'Largo da Princesa', 'Algés (Jardim)': 'Algés (Jardim)',
  'Centro Cultural Belém': 'Centro Cultural de Belém', 'Calçada Ajuda (GNR)': 'Calçada da Ajuda (GNR)', 'Martim Moniz': 'Martim Moniz',
  'Cais Rocha (Museu Nacional Arte Antiga)': 'Cais da Rocha (Museu de Arte Antiga)', 'Rua Junqueira (Centro Congressos)': 'Rua da Junqueira',
  'Graça - Rua Lagares': 'Graça - Rua dos Lagares', 'Bica - Rua São Paulo': 'Bica - Rua de São Paulo', 'Bica - Largo Calhariz': 'Bica - Largo do Calhariz',
  'Largo Trindade Coelho': 'Largo Trindade Coelho', 'Ascensor Glória': 'Ascensor da Glória', 'Praça Luís de Camões (Bairro Alto)': 'Praça Luís de Camões',
};
function carrisName(raw: string): string {
  let n = raw;
  for (const [re, to] of CARRIS_ABBR) n = n.replace(re, to);
  n = n.replace(/\s+/g, ' ').trim();
  return CARRIS_NAMES[n] ?? n;
}

const [W, S, E, N] = CITIES.lisbon.bbox;
// Fertagus leaves the map on the 25 de Abril bridge; keep its first stop on the south bank (Pragal) so trains
// cross the bridge instead of vanishing at Campolide.
const PRAGAL = [-9.1795, 38.6657];
const clip = (lon: number, lat: number) =>
  (lon >= W && lon <= E && lat >= S && lat <= N) || Math.hypot((lon - PRAGAL[0]) * 0.78, lat - PRAGAL[1]) < 0.006;

await buildGtfsCity({
  city: 'lisbon',
  feeds: [
    { id: 'ml', url: 'https://dados.gov.pt/s/resources/gfts-do-metropolitano-de-lisboa/20260114-115938/gtfs.zip' },
    { id: 'carris', url: 'https://gateway.carris.pt/gateway/gtfs/api/v2.11/GTFS' },
    { id: 'cp', url: 'https://publico.cp.pt/gtfs/gtfs.zip' },
    { id: 'tml', url: 'https://go.tmlmobilidade.pt/hub/api/v1/plans/gtfs' },
  ],
  systems: [
    { id: 'metro', name: 'Metro', live: 'scheduled' },
    { id: 'tram', name: 'Tram', live: 'realtime' },
    { id: 'funicular', name: 'Funiculars', live: 'realtime' },
    { id: 'cp', name: 'CP suburban trains', live: 'scheduled' },
    { id: 'fertagus', name: 'Fertagus', live: 'scheduled' },
  ],
  lines: [
    ...METRO.map((m) => ({
      id: m.id,
      system: 'metro',
      match: { feed: 'ml', routeId: m.route },
      name: m.name,
      nameLocal: m.local,
      short: m.short,
      color: m.color,
      textColor: m.text ?? '#FFFFFF',
      kind: 'metro' as const,
      bullet: 'circle' as const,
      stock: m.stock,
      osm: ['subway'],
      osmRelations: m.rel,
      geometry: 'osm' as const,
    })),
    ...TRAMS.map((t) => ({
      id: `t${t.short.replace('E', '')}`,
      system: 'tram',
      match: { feed: 'carris', routeId: t.route },
      name: `Tram ${t.short}`,
      nameLocal: `Elétrico ${t.short}`,
      short: t.short,
      color: t.color,
      textColor: t.short === '28E' ? '#1A1A1A' : '#FFFFFF',
      kind: 'tram' as const,
      bullet: 'square' as const,
      stock: t.stock,
    })),
    {
      id: 'bica', system: 'funicular', match: { feed: 'carris', routeId: '160_0' }, name: 'Bica Funicular', nameLocal: 'Ascensor da Bica',
      short: 'BI', color: '#F2B705', textColor: '#1A1A1A', kind: 'cable', bullet: 'square', stock: [{ stock: 'lisbon-bica', cars: 1 }],
      geometry: 'shapes',
    },
    {
      id: 'graca', system: 'funicular', match: { feed: 'carris', routeId: '284_0' }, name: 'Graça Funicular', nameLocal: 'Funicular da Graça',
      short: 'GR', color: '#F2B705', textColor: '#1A1A1A', kind: 'cable', bullet: 'square', stock: [{ stock: 'lisbon-graca', cars: 1 }],
      geometry: 'shapes',
    },
    ...CP.map((c) => ({
      id: c.id,
      system: 'cp',
      match: { feed: 'cp', shortName: c.match },
      name: c.name,
      nameLocal: c.local,
      short: c.short,
      color: c.color,
      textColor: '#FFFFFF',
      kind: 'rail' as const,
      bullet: 'pill' as const,
      stock: c.stock,
      osm: ['rail'],
    })),
    {
      id: 'fertagus', system: 'fertagus', match: { feed: 'tml', agency: '7NTB1' }, name: 'Fertagus', short: 'FT',
      color: '#C74F4F', textColor: '#FFFFFF', kind: 'rail', bullet: 'pill', stock: [{ stock: 'lisbon-fertagus', cars: 4 }],
      osm: ['rail'], osmRelations: [14612297, 14612299, 14614590, 14614591],
    },
  ],
  stations: {
    idPrefix: 'lis',
    maxSpread: 150,
    name: (n) => carrisName(cpName(n)),
  },
  trips: {
    keepTrip: ({ feed, route }) => feed !== 'tml' || route.agency_id === '7NTB1',
    dest: (t) => {
      const head = t.trip.trip_headsign?.trim();
      const raw = head || t.allStops.at(-1)!.name;
      return carrisName(cpName(raw));
    },
    label: (t) => (t.feed === 'cp' ? t.trip.trip_short_name || undefined : undefined),
    service: (t) => (t.feed === 'cp' && t.skips ? 'Semi-fast' : undefined),
    serviceLocal: (t) => (t.feed === 'cp' && t.skips ? 'Semidireto' : undefined),
  },
  clip,
  realtimeKeys: true,
  days: { from: -2, to: 35 },
  attribution: [
    'Metro timetable: Metropolitano de Lisboa (dados.gov.pt, CC BY)',
    'Trams and funiculars: Carris GTFS and GTFS-realtime',
    'CP timetables: CP – Comboios de Portugal open data',
    'Fertagus timetable: Transportes Metropolitanos de Lisboa (TML) GTFS',
    'Track © OpenStreetMap contributors',
  ],
});

// The Metro runs in twin single-track tubes (one OSM way per direction), and the kit snaps each station to its
// nearest track, which can pick opposite tubes and fail to route. Re-route the straight segments here over the line's
// own relation ways (rail: all OSM rail), searching from every track node near each end (multi-source Dijkstra).
{
  const { readFileSync, writeFileSync, existsSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { ROOT } = await import('./lib/gtfs/feed.ts');
  const { simplify } = await import('./lib/gtfs/geometry.ts');
  const { makeProjection, roundFlat, flatLength } = await import('../shared/geo.ts');
  type Way = { type: string; nodes: number[]; geometry: { lat: number; lon: number }[]; tags?: Record<string, string> };
  const { project } = makeProjection('lisbon');
  const file = join(ROOT, 'public/data/lisbon/transit.json');
  const transit = JSON.parse(readFileSync(file, 'utf8')) as { lines: { id: string; kind: string }[]; segments: { from: string; to: string; lines: string[]; pts: number[]; el?: number[] }[] };
  const sources: Record<string, string> = Object.fromEntries(METRO.map((m) => [m.id, `osm-rel-${m.rel.join('-')}.json`]));
  for (const c of CP) sources[c.id] = 'osm-track.json';
  sources.fertagus = 'osm-track.json';

  const graphs = new Map<string, { xy: Map<number, [number, number]>; lvl: Map<number, number>; adj: Map<number, [number, number][]> }>();
  const graph = (name: string, kind: string) => {
    const key = `${name}|${kind}`;
    if (graphs.has(key)) return graphs.get(key)!;
    const xy = new Map<number, [number, number]>();
    const lvl = new Map<number, number>();
    const adj = new Map<number, [number, number][]>();
    const osm = JSON.parse(readFileSync(join(ROOT, '.cache/lisbon', name), 'utf8')) as { elements: Way[] };
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
    if (!existsSync(join(ROOT, '.cache/lisbon', src))) continue;
    const { xy, lvl, adj } = graph(src, kindOf.get(s.lines[0]) === 'metro' ? 'subway' : 'rail');
    const [ax, ay, bx, by] = s.pts;
    const near = (x: number, y: number) => [...xy].filter(([, p]) => Math.hypot(p[0] - x, p[1] - y) < 200).map(([n, p]) => [n, Math.hypot(p[0] - x, p[1] - y)] as [number, number]);
    const goal = new Map(near(bx, by));
    const dist = new Map<number, number>();
    const prev = new Map<number, number>();
    const open: [number, number][] = near(ax, ay).map(([n, d]) => [d, n]);
    for (const [d, n] of open) dist.set(n, d);
    let best: [number, number] | null = null;
    const limit = Math.hypot(bx - ax, by - ay) * 3 + 2000;
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
      console.warn(`lisbon: no track path ${s.from} -> ${s.to} (${s.lines.join(',')})`);
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
  console.log(`lisbon: re-routed ${fixed}/${todo.length} straight segments over OSM track`);
}
