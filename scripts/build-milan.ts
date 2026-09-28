// Milan: ATM Metro M1–M5 and trams (Comune di Milano GTFS, keyless) plus the Trenord suburban S lines and the
// Malpensa Express (Regione Lombardia open data GTFS, keyless).
// Run: npx tsx scripts/build-milan.ts [--refresh] [--debug]
import { buildGtfsCity, type StockMix } from './lib/gtfs/index.ts';

// Fleet shares from the 2025/26 fleet: M1 runs 26 Leonardo, 20 Meneghino and 21 revamped 1970s–80s trains; M2
// 46 Leonardo and 15 Meneghino; M3 18 original trains and 11 Meneghino. All are six-car sets.
const METRO: { id: string; name: string; local: string; color: string; text?: string; stock: StockMix[] }[] = [
  {
    id: 'm1', name: 'M1 Red Line', local: 'M1 Linea rossa', color: '#EE2E26',
    stock: [{ stock: 'milan-leonardo-m1', cars: 6, share: 26 }, { stock: 'milan-meneghino-m1', cars: 6, share: 20 }, { stock: 'milan-m1-classic', cars: 6, share: 21 }],
  },
  {
    id: 'm2', name: 'M2 Green Line', local: 'M2 Linea verde', color: '#5E9632',
    stock: [{ stock: 'milan-leonardo-m2', cars: 6, share: 46 }, { stock: 'milan-meneghino-m2', cars: 6, share: 15 }],
  },
  {
    id: 'm3', name: 'M3 Yellow Line', local: 'M3 Linea gialla', color: '#FFBA14', text: '#1A1A1A',
    stock: [{ stock: 'milan-m3-classic', cars: 6, share: 18 }, { stock: 'milan-meneghino-m3', cars: 6, share: 11 }],
  },
  { id: 'm4', name: 'M4 Blue Line', local: 'M4 Linea blu', color: '#001588', stock: [{ stock: 'milan-m4', cars: 4 }] },
  { id: 'm5', name: 'M5 Lilac Line', local: 'M5 Linea lilla', color: '#9A6FB0', stock: [{ stock: 'milan-m5', cars: 4 }] },
];

// Tram series per line, from ATM's depot assignments (2025/26). Ventotto: 1, 5, 10, 19, 33. Jumbotram 4900: 2, 3,
// 12, 16, 24, 27. Eurotram 7000: 15. Long Sirio 7100: 4, 7, 15, 31. Short Sirio 7500/7600: 3, 9, 14, 24, 27.
// Tramlink 7700: 7, 9, 31.
const TRAM_STOCK: Record<string, StockMix[]> = {
  '1': [{ stock: 'milan-ventotto', cars: 1 }],
  '2': [{ stock: 'milan-jumbotram', cars: 1 }],
  '3': [{ stock: 'milan-sirio-short', cars: 1, share: 2 }, { stock: 'milan-jumbotram', cars: 1, share: 1 }],
  '4': [{ stock: 'milan-sirio-long', cars: 1 }],
  '5': [{ stock: 'milan-ventotto', cars: 1 }],
  '7': [{ stock: 'milan-tramlink', cars: 1, share: 2 }, { stock: 'milan-sirio-long', cars: 1, share: 1 }],
  '9': [{ stock: 'milan-tramlink', cars: 1, share: 1 }, { stock: 'milan-sirio-short', cars: 1, share: 2 }],
  '10': [{ stock: 'milan-ventotto', cars: 1 }],
  '12': [{ stock: 'milan-jumbotram', cars: 1 }],
  '14': [{ stock: 'milan-sirio-short', cars: 1 }],
  '15': [{ stock: 'milan-eurotram', cars: 1, share: 2 }, { stock: 'milan-sirio-long', cars: 1, share: 1 }],
  '16': [{ stock: 'milan-jumbotram', cars: 1 }],
  '19': [{ stock: 'milan-ventotto', cars: 1 }],
  '24': [{ stock: 'milan-sirio-short', cars: 1, share: 1 }, { stock: 'milan-jumbotram', cars: 1, share: 1 }],
  '27': [{ stock: 'milan-jumbotram', cars: 1, share: 1 }, { stock: 'milan-sirio-short', cars: 1, share: 1 }],
  '31': [{ stock: 'milan-sirio-long', cars: 1, share: 1 }, { stock: 'milan-tramlink', cars: 1, share: 1 }],
  '33': [{ stock: 'milan-ventotto', cars: 1 }],
};
// ATM publishes no tram line colors; these keep the lines apart on the map.
const TRAM_COLORS: Record<string, string> = {
  '1': '#E07B00', '2': '#2E86C1', '3': '#8E44AD', '4': '#16A085', '5': '#C0392B', '7': '#7D6608', '9': '#D35400',
  '10': '#1F618D', '12': '#B03A2E', '14': '#117A65', '15': '#6C3483', '16': '#A04000', '19': '#2874A6',
  '24': '#1E8449', '27': '#884EA0', '31': '#935116', '33': '#5B2C6F',
};

// Suburban S lines: TSR double-deckers still dominate the Passante; Caravaggio (Hitachi Rock) sets have taken over
// much of the rest, and the former Malpensa Express CSA sets moved to S3, S4, S12 and S19 in 2025.
const TSR = (share: number, cars = 6): StockMix => ({ stock: 'milan-tsr', cars, share });
const CARAV = (share: number, cars = 5): StockMix => ({ stock: 'milan-caravaggio', cars, share });
const CSA = (share: number): StockMix => ({ stock: 'milan-csa', cars: 5, share });
const DONI = (share: number): StockMix => ({ stock: 'milan-donizetti', cars: 4, share });
const S_LINES: { id: string; name: string; stock: StockMix[] }[] = [
  { id: 'S1', name: 'S1 Saronno – Lodi', stock: [TSR(3), CARAV(1)] },
  { id: 'S2', name: 'S2 Seveso – Rogoredo', stock: [TSR(3), CARAV(1)] },
  { id: 'S3', name: 'S3 Saronno – Cadorna', stock: [TSR(2), CSA(1), CARAV(1)] },
  { id: 'S4', name: 'S4 Camnago – Cadorna', stock: [TSR(2), CSA(1), CARAV(1)] },
  { id: 'S5', name: 'S5 Varese – Treviglio', stock: [TSR(2), CARAV(2)] },
  { id: 'S6', name: 'S6 Novara – Treviglio', stock: [TSR(2), CARAV(2)] },
  { id: 'S7', name: 'S7 Lecco – Garibaldi', stock: [{ stock: 'milan-atr115', cars: 2 }] },
  { id: 'S8', name: 'S8 Lecco – Garibaldi', stock: [CARAV(3), TSR(1)] },
  { id: 'S9', name: 'S9 Saronno – Albairate', stock: [TSR(2), DONI(1)] },
  { id: 'S11', name: 'S11 Como – Rho', stock: [CARAV(3), TSR(1)] },
  { id: 'S12', name: 'S12 Melegnano – Bovisa', stock: [CSA(1), TSR(1)] },
  { id: 'S13', name: 'S13 Pavia – Garbagnate', stock: [TSR(3), CARAV(1)] },
  { id: 'S19', name: 'S19 Albairate – Rogoredo', stock: [CSA(1), DONI(1)] },
];
const S_COLORS: Record<string, string> = {
  S1: '#E40520', S2: '#009879', S3: '#A90A2E', S4: '#83BB26', S5: '#F39123', S6: '#F6D200', S7: '#E50071',
  S8: '#F6B6B6', S9: '#A2338A', S11: '#A593C6', S12: '#2C5234', S13: '#A76D11', S19: '#663333',
};

const ABBR: Record<string, string> = {
  'p.za': 'Piazza', 'p.le': 'Piazzale', 'v.le': 'Viale', 'c.so': 'Corso', 'l.go': 'Largo', 'p.ta': 'Porta', 'm.te': 'Monte',
  'cim.': 'Cimitero', 'osp.': 'Osp.', 'ist.': 'Ist.', 'nav.': 'Naviglio', 'p.te': 'Ponte',
};
const LOWER = new Set(['di', 'de', 'del', 'della', 'delle', 'dei', 'degli', 'da', 'al', 'alla', 'e', 'in']);
const UPPER = new Set(['fs', 'fn', 'm1', 'm2', 'm3', 'm4', 'm5', 'qt8', 'tibb', 'ice']);
// Metro stop names in the ATM feed are upper case and carry line suffixes (DUOMO M1 / DUOMO M3).
const METRO_NAMES: Record<string, string> = {
  'villa s.g.': 'Villa San Giovanni', 's.leonardo': 'San Leonardo', 's.agostino': "Sant'Agostino", 's.ambrogio': "Sant'Ambrogio",
  'san ambrogio': "Sant'Ambrogio", 'ca granda': "Ca' Granda", 'lodi t.i.b.b.': 'Lodi TIBB', 'p.ta genova f.s.': 'Porta Genova',
  'p.ta venezia': 'Porta Venezia', 'sesto 1 maggio fs': 'Sesto 1° Maggio FS', 'rho fieramilano': 'Rho Fiera',
  'lotto fieramilanocity': 'Lotto', 'centrale fs': 'Centrale', 'garibaldi fs': 'Garibaldi', 'lambrate fs': 'Lambrate',
  'rogoredo fs': 'Rogoredo', 'cadorna fn': 'Cadorna', 'affori fn': 'Affori FN', 'domodossola': 'Domodossola',
  'sesto rondo': 'Sesto Rondò', 'sforza-policlinico': 'Sforza-Policlinico',
   'stazione forlanini': 'Stazione Forlanini', 'san siro ippodromo': 'San Siro Ippodromo',
};

function titleWord(w: string, first: boolean): string {
  const lw = w.toLowerCase();
  if (ABBR[lw]) return ABBR[lw];
  if (UPPER.has(lw)) return lw.toUpperCase();
  if (!first && LOWER.has(lw)) return lw;
  if (/^d'/.test(lw)) return `d'${lw.slice(2, 3).toUpperCase()}${lw.slice(3)}`;
  return lw.replace(/^(\(?)(\p{L})/u, (_, p, c) => p + c.toUpperCase()).replace(/([.'-])(\p{L})/gu, (_, p, c) => p + c.toUpperCase());
}
function cleanName(raw: string): string {
  let s = raw.replace(/Ã /g, 'à').replace(/Ã¨/g, 'è').replace(/Ã©/g, 'é').replace(/Ã²/g, 'ò').replace(/Ã¹/g, 'ù').replace(/Ã¬/g, 'ì');
  s = s.replace(/\b([aeiou])'(?=\s|$|\))/gi, (_, v: string) => ({ a: 'à', e: 'è', i: 'ì', o: 'ò', u: 'ù' })[v.toLowerCase() as 'a'] ?? v);
  if (/^S\d{5}$/.test(raw)) return raw;
  // Trenord names are already mixed case.
  if (/[a-z]/.test(s) && /[A-Z]/.test(s)) return s.replace(/\bS\.(?=[A-Z])/g, 'San ');
  const upper = s === s.toUpperCase();
  let n = s.toLowerCase().replace(/\s+/g, ' ').trim();
  if (upper) {
    n = n.replace(/\s+m[1-5]$/, '').trim();
    if (METRO_NAMES[n]) return METRO_NAMES[n];
  }
  // Tram stops and headsigns: drop metro interchange suffixes ('duomo m1 m3'), keep the street name.
  n = n.replace(/(\s+m[1-5])+(?=$|\s*\))/g, '').replace(/\(\s*\)/g, '').replace(/\s+/g, ' ').trim();
  if (METRO_NAMES[n]) return METRO_NAMES[n];
  return n.split(' ').map((w, i) => titleWord(w, i === 0)).join(' ').replace(/\bS\. /g, 'S. ');
}

await buildGtfsCity({
  city: 'milan',
  feeds: [
    { id: 'atm', url: 'https://dati.comune.milano.it/gtfs.zip' },
    { id: 'tn', url: 'https://www.dati.lombardia.it/download/3z4k-mxz9/application%2Fzip' },
  ],
  systems: [
    { id: 'metro', name: 'Metro', live: 'scheduled' },
    { id: 'suburbano', name: 'Suburban railway', live: 'realtime' },
    { id: 'tram', name: 'Tram', live: 'scheduled' },
  ],
  lines: [
    ...METRO.map((m) => ({
      id: m.id,
      system: 'metro',
      match: { feed: 'atm', routeId: m.id.toUpperCase() },
      name: m.name,
      nameLocal: m.local,
      short: m.id.toUpperCase(),
      color: m.color,
      textColor: m.text ?? '#FFFFFF',
      kind: 'metro' as const,
      bullet: 'square' as const,
      stock: m.stock,
      osm: ['subway', 'light_rail', 'rail'],
    })),
    ...S_LINES.map((s) => ({
      id: s.id.toLowerCase(),
      system: 'suburbano',
      match: { feed: 'tn', routeId: s.id },
      name: s.name,
      short: s.id,
      color: S_COLORS[s.id],
      textColor: s.id === 'S6' || s.id === 'S8' ? '#1A1A1A' : '#FFFFFF',
      kind: 'rail' as const,
      bullet: 'circle' as const,
      stock: s.stock,
    })),
    {
      id: 'mxp',
      system: 'suburbano',
      match: { feed: 'tn', routeId: ['RE_51', 'RE_54'] },
      name: 'Malpensa Express',
      short: 'MXP',
      color: '#D2232A',
      textColor: '#FFFFFF',
      kind: 'rail',
      bullet: 'pill',
      stock: [{ stock: 'milan-caravaggio-mxp', cars: 4 }],
    },
  ],
  routes: {
    match: { feed: 'atm', routeType: 0 },
    line: (r) => {
      const n = r.route_short_name;
      if (!TRAM_STOCK[n]) console.warn(`tram ${n}: no stock mapping`);
      return {
        id: `t${n}`,
        system: 'tram',
        name: `Tram ${n}`,
        short: n,
        color: TRAM_COLORS[n] ?? '#E07B00',
        kind: 'tram',
        bullet: 'square',
        stock: TRAM_STOCK[n] ?? [{ stock: 'milan-sirio-short', cars: 1 }],
      };
    },
  },
  stations: {
    idPrefix: 'mil',
    maxSpread: 150,
    name: (n) => cleanName(n),
  },
  trips: {
    keepTrip: ({ trip }) => !/^TN_/.test(trip.route_id ?? ''),
    label: (t) => (t.feed === 'tn' ? t.trip.trip_short_name?.replace(/^.*-\s*/, '') : undefined),
    rtKey: (t) => (t.feed === 'tn' ? (t.trip.trip_short_name?.replace(/^.*-\s*/, '') ?? '') : ''),
  },
  geometry: { variants: 'merge' },
  realtimeKeys: true,
  days: { from: -2, to: 30 },
  attribution: [
    'Timetables: ATM / Comune di Milano (dati.comune.milano.it, CC BY 4.0)',
    'Trenord timetables: Regione Lombardia open data (dati.lombardia.it, CC BY 4.0)',
    'Live delays: ViaggiaTreno (RFI)',
    'Track © OpenStreetMap contributors',
  ],
});

// The Passante and several belt-line stretches run as two single-track tubes or parallel tracks; the kit snaps each
// station to its nearest track, which can pick opposite tracks and fail to route. Re-route those rail segments here
// from every track node near each end (multi-source Dijkstra), with tunnel/bridge levels from the OSM tags.
{
  const { readFileSync, writeFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { ROOT } = await import('./lib/gtfs/feed.ts');
  const { simplify } = await import('./lib/gtfs/geometry.ts');
  const { makeProjection, roundFlat, flatLength } = await import('../shared/geo.ts');
  type Way = { nodes: number[]; geometry: { lat: number; lon: number }[]; tags: Record<string, string> };
  const { project } = makeProjection('milan');
  const file = join(ROOT, 'public/data/milan/transit.json');
  const transit = JSON.parse(readFileSync(file, 'utf8')) as { lines: { id: string; kind: string }[]; segments: { from: string; to: string; lines: string[]; pts: number[]; el?: number[] }[] };
  const rail = new Set(transit.lines.filter((l) => l.kind === 'rail').map((l) => l.id));
  const todo = transit.segments.filter((s) => s.pts.length === 4 && s.lines.every((l) => rail.has(l)) && flatLength(s.pts) > 300);
  if (todo.length) {
    const osm = JSON.parse(readFileSync(join(ROOT, '.cache/milan/osm-track.json'), 'utf8')) as { elements: Way[] };
    const xy = new Map<number, [number, number]>();
    const lvl = new Map<number, number>();
    const adj = new Map<number, [number, number][]>();
    for (const w of osm.elements) {
      if (w.tags?.railway !== 'rail' || !w.nodes) continue;
      const level = w.tags.tunnel === 'yes' || Number(w.tags.layer) < 0 ? -1 : w.tags.bridge === 'yes' ? 1 : 0;
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
    const near = (x: number, y: number) => [...xy].filter(([, p]) => Math.hypot(p[0] - x, p[1] - y) < 150).map(([n, p]) => [n, Math.hypot(p[0] - x, p[1] - y)] as [number, number]);
    let fixed = 0;
    for (const s of todo) {
      const [ax, ay, bx, by] = s.pts;
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
        console.warn(`milan: no track path ${s.from} -> ${s.to}`);
        continue;
      }
      const nodes: number[] = [];
      for (let n: number | undefined = best[1]; n != null; n = prev.get(n)) nodes.unshift(n);
      const raw = [ax, ay, ...nodes.flatMap((n) => xy.get(n)!), bx, by];
      const levels = [lvl.get(nodes[0]) ?? 0, ...nodes.map((n) => lvl.get(n) ?? 0), lvl.get(nodes.at(-1)!) ?? 0];
      // Simplify each constant-level run on its own so el stays aligned with pts.
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
    console.log(`milan: re-routed ${fixed}/${todo.length} straight rail segments over OSM track`);
  }
}
