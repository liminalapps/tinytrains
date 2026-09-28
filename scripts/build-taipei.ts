// Taipei: Taipei Metro and New Taipei Metro, from the operators' own published timetables, packed into a GTFS feed
// for the GTFS kit. Every source is keyless:
// - data.taipei (Taipei Rapid Transit Corp.): per-station timetables of the R, G, O and BL lines, run and dwell times
//   between stations of every line, Wenhu line headways, first and last trains.
// - ntmetro.com.tw (New Taipei Metro): station departure timetables of the Circular line, Danhai LRT and Ankeng LRT.
// - OpenStreetMap: station positions (the kit adds track geometry and levels).
// Run: ./node_modules/.bin/tsx scripts/build-taipei.ts [--refresh] [--debug]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { CITIES } from '../shared/cities.ts';
import { buildGtfsCity, type StockMix } from './lib/gtfs/index.ts';
import { REFRESH, ROOT, UA } from './lib/gtfs/feed.ts';

const CACHE = join(ROOT, '.cache/taipei');
mkdirSync(join(CACHE, 'src'), { recursive: true });

// ---------------------------------------------------------------------------------------------------------- sources

const DATA_TAIPEI = 'https://data.taipei/api/dataset';
/** data.taipei resources (dataset/resource ids) of the Taipei Rapid Transit Corporation. */
const TRTC = {
  lineStations: '8bf00fa8-86a5-437e-b5c7-9bc0fe0e2971/resource/e3c0e67f-5916-405f-ad9a-41f52a65c2d2',
  routeStations: '733ff034-5a2b-442f-832a-c7d89add0ccb/resource/cca16a48-2753-4d3d-9142-ce14f7f9fdd0',
  runTimes: '513e97fe-6a98-4a0d-b7dc-11122c8638d4/resource/c32998fa-c9b2-4324-9016-e19fbe0815f1',
  headways: '6d15899a-ff77-4a39-8203-a3addfe1fa28/resource/650a2f12-dc02-4733-89d3-46de2fba6a8e',
  firstLast: '58e8be7e-3c77-4222-9d8c-26003c2a2cab/resource/c3e1e320-0e29-4521-9ca7-4163190edee1',
  holidays: 'c30ca421-d935-4faa-b523-9c175c8de738/resource/0dcbcfcf-f7a1-4664-a810-82c01cb524e0',
};
const TT = '91cc11bb-40d6-4837-9303-84e6a666c568/resource/';
/** Station timetables: [file, resource, day type]. R has its own Saturday and Sunday timetables. */
const TRTC_TIMETABLES: [string, string, DayType][] = [
  ['BL-wd', '9befd704-fda6-46b4-ad33-98bbc81f7bac', 'wd'],
  ['BL-we', '0ad40b75-d9cd-4eef-8ca2-38688be61205', 'we'],
  ['O-wd', 'c526a43a-fc82-4ba3-beda-0497a303fc4a', 'wd'],
  ['O-we', '6d2a2636-825d-4ec2-b4f5-9f853add9472', 'we'],
  ['G-wd', '3924acc7-6b11-411e-acd5-aacbe1186a7a', 'wd'],
  ['G-we', '46bd70db-62a7-4607-b0f2-221eb2002753', 'we'],
  ['R-wd', '968f7322-36ca-43c4-816c-9f8448a9b4fb', 'wd'],
  ['R-sat', '6fd19e60-2164-4b97-bd41-7059c4c943c8', 'sat'],
  ['R-sun', 'a5f81758-a5a0-44f2-b24c-7f87ffec6283', 'sun'],
];
/** New Taipei Metro station timetable pages (ntmetro.com.tw/basic/?mode=detail&node=N), one per station. */
const NTM_PAGES = [447, 448, 449, 450, 451, 452, 453, 454, 455, 456, 457, 458, 459, 460, 600, 601, 602, 603, 604, 605, 606, 607, 608, 796, 809];

type DayType = 'wd' | 'we' | 'sat' | 'sun';

async function download(url: string, file: string): Promise<Buffer> {
  const path = join(CACHE, 'src', file);
  if (!REFRESH && existsSync(path)) return readFileSync(path);
  let err: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(60_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      writeFileSync(path, buf);
      return buf;
    } catch (e) {
      err = e;
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
    }
  }
  throw new Error(`${url}: ${err instanceof Error ? err.message : err}`);
}

/** data.taipei files come in UTF-8 (with or without BOM) or Big5. */
function decode(buf: Buffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^\uFEFF/, '');
  } catch {
    return new TextDecoder('big5').decode(buf);
  }
}

function csv(text: string): string[][] {
  const out: string[][] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cells: string[] = [];
    let cur = '';
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) {
        if (c === '"' && line[i + 1] === '"') (cur += '"'), i++;
        else if (c === '"') q = false;
        else cur += c;
      } else if (c === '"') q = true;
      else if (c === ',') cells.push(cur), (cur = '');
      else cur += c;
    }
    cells.push(cur);
    out.push(cells.map((s) => s.trim().replace(/^'|'$/g, '')));
  }
  return out;
}

const trtc = async (key: keyof typeof TRTC) => csv(decode(await download(`${DATA_TAIPEI}/${TRTC[key]}/download`, `${key}.csv`))).slice(1);

/** 'HH:MM' -> seconds; hours before 04:00 belong to the previous service day. */
function hm(s: string): number {
  const [h, m] = s.split(':').map(Number);
  return ((h < 4 ? h + 24 : h) * 60 + m) * 60;
}

/** Published times are whole minutes cut down (the arrival feed sees trains ~30 s after them): add half a minute. */
const TRUNCATED = 30;

/** Station name key: '捷運台北車站' / '臺北車站站' / '台北車站' -> '台北車'. */
const nameKey = (s: string) => s.replace(/^捷運/, '').replace(/臺/g, '台').replace(/站$/, '').replace(/\s+/g, '');

// ---------------------------------------------------------------------------------------------------------- lines

interface LineInfo {
  id: string;
  system: 'trtc' | 'ntm';
  name: string;
  nameLocal: string;
  short: string;
  color: string;
  textColor: string;
  kind: 'metro' | 'agt' | 'light';
  stock: StockMix[];
}

// Colors: Taipei Metro and New Taipei Metro line colors (their line icons, as in Wikipedia's route modules). The
// Danhai LRT's two services use their own green and blue.
const LINES: LineInfo[] = [
  { id: 'BR', system: 'trtc', name: 'Wenhu Line', nameLocal: '文湖線', short: 'BR', color: '#C48C31', textColor: '#FFFFFF', kind: 'agt',
    stock: [{ stock: 'taipei-innovia256', cars: 4, share: 2 }, { stock: 'taipei-val256', cars: 4, share: 1 }] },
  { id: 'R', system: 'trtc', name: 'Tamsui–Xinyi Line', nameLocal: '淡水信義線', short: 'R', color: '#E3002C', textColor: '#FFFFFF', kind: 'metro',
    stock: [{ stock: 'taipei-c301', cars: 6, share: 22 }, { stock: 'taipei-c381', cars: 6, share: 15 }] },
  { id: 'xinbeitou', system: 'trtc', name: 'Xinbeitou Branch', nameLocal: '新北投支線', short: 'R', color: '#FD92A3', textColor: '#FFFFFF', kind: 'metro',
    stock: [{ stock: 'taipei-c371-xinbeitou', cars: 3 }] },
  { id: 'G', system: 'trtc', name: 'Songshan–Xindian Line', nameLocal: '松山新店線', short: 'G', color: '#008659', textColor: '#FFFFFF', kind: 'metro',
    stock: [{ stock: 'taipei-c371', cars: 6, share: 19 }, { stock: 'taipei-c381', cars: 6, share: 9 }] },
  { id: 'xiaobitan', system: 'trtc', name: 'Xiaobitan Branch', nameLocal: '小碧潭支線', short: 'G', color: '#CFDB00', textColor: '#FFFFFF', kind: 'metro',
    stock: [{ stock: 'taipei-c371', cars: 3 }] },
  { id: 'O', system: 'trtc', name: 'Zhonghe–Xinlu Line', nameLocal: '中和新蘆線', short: 'O', color: '#F8B61C', textColor: '#FFFFFF', kind: 'metro',
    stock: [{ stock: 'taipei-c371', cars: 6 }] },
  { id: 'BL', system: 'trtc', name: 'Bannan Line', nameLocal: '板南線', short: 'BL', color: '#0070BD', textColor: '#FFFFFF', kind: 'metro',
    stock: [{ stock: 'taipei-c321', cars: 6, share: 36 }, { stock: 'taipei-c341', cars: 6, share: 6 }] },
  { id: 'Y', system: 'ntm', name: 'Circular Line', nameLocal: '環狀線', short: 'Y', color: '#FFDB00', textColor: '#000000', kind: 'metro',
    stock: [{ stock: 'taipei-c610', cars: 4 }] },
  { id: 'VG', system: 'ntm', name: 'Danhai LRT Green Mountain Line', nameLocal: '淡海輕軌綠山線', short: 'V', color: '#8FB94B', textColor: '#FFFFFF', kind: 'light',
    stock: [{ stock: 'taipei-danhai-lrv', cars: 1 }] },
  { id: 'VB', system: 'ntm', name: 'Danhai LRT Blue Coast Line', nameLocal: '淡海輕軌藍海線', short: 'V', color: '#36A6CE', textColor: '#FFFFFF', kind: 'light',
    stock: [{ stock: 'taipei-danhai-lrv', cars: 1 }] },
  { id: 'K', system: 'ntm', name: 'Ankeng LRT', nameLocal: '安坑輕軌', short: 'K', color: '#C3B091', textColor: '#FFFFFF', kind: 'light',
    stock: [{ stock: 'taipei-ankeng-lrv', cars: 1 }] },
];

/** OSM route relations of each line (both directions), used to find the stations' platforms. */
const OSM_RELATIONS: Record<string, number[]> = {
  BR: [447449, 4264892],
  R: [5378981, 5633242, 3343808, 9439377],
  xinbeitou: [2665129, 9437206],
  G: [4250356, 4250357, 447471, 9437777],
  xiaobitan: [4250380, 4250381],
  O: [4250352, 4250353, 4250354, 4250355],
  BL: [199038, 9437776],
  Y: [3322093, 8165684],
  VG: [9154523, 9154524],
  VB: [5990742, 13611116],
  K: [15443525, 15443526],
};

/** New Taipei Metro station lists (codes and names); the TRTC ones come from data.taipei. */
const NTM_STATIONS: Record<string, [string, string][]> = {
  Y: [['Y07', '大坪林'], ['Y08', '十四張'], ['Y09', '秀朗橋'], ['Y10', '景平'], ['Y11', '景安'], ['Y12', '中和'], ['Y13', '橋和'], ['Y14', '中原'],
    ['Y15', '板新'], ['Y16', '板橋'], ['Y17', '新埔民生'], ['Y18', '頭前庄'], ['Y19', '幸福'], ['Y20', '新北產業園區']],
  VG: [['V01', '紅樹林'], ['V02', '竿蓁林'], ['V03', '淡金鄧公'], ['V04', '淡江大學'], ['V05', '淡金北新'], ['V06', '新市一路'], ['V07', '淡水行政中心'],
    ['V08', '濱海義山'], ['V09', '濱海沙崙'], ['V10', '淡海新市鎮'], ['V11', '崁頂']],
  VB: [['V01', '紅樹林'], ['V02', '竿蓁林'], ['V03', '淡金鄧公'], ['V04', '淡江大學'], ['V05', '淡金北新'], ['V06', '新市一路'], ['V07', '淡水行政中心'],
    ['V08', '濱海義山'], ['V09', '濱海沙崙'], ['V28', '台北海洋大學'], ['V27', '沙崙'], ['V26', '淡水漁人碼頭']],
  K: [['K01', '雙城'], ['K02', '玫瑰中國城'], ['K03', '台北小城'], ['K04', '耕莘安康院區'], ['K05', '景文科大'], ['K06', '安康'], ['K07', '陽光運動公園'],
    ['K08', '新和國小'], ['K09', '十四張']],
};

/** English names where OSM's name:en is missing or differs from the operators' signs. */
const EN: Record<string, string> = {
  台北車: 'Taipei Main Station',
  '廣慈/奉天宮': 'Guangci/Fengtian Temple',
  '台北101/世貿': 'Taipei 101/World Trade Center',
  南港展覽館: 'Taipei Nangang Exhibition Center',
  板橋: 'Banqiao',
  中正紀念堂: 'Chiang Kai-shek Memorial Hall',
  國父紀念館: 'Sun Yat-sen Memorial Hall',
  民權西路: 'Minquan W. Rd.',
  台北海洋大學: 'Taipei University of Marine Technology',
  耕莘安康院區: 'Cardinal Tien Hospital An Kang Branch',
  景文科大: 'Jinwen University of Science and Technology',
};

// ---------------------------------------------------------------------------------------------------------- stations

interface Platform {
  code: string; // station code on this line: 'R10'
  line: string;
  zh: string; // official name without 站
  key: string; // physical station: nameKey
}

async function loadCatalog(): Promise<{ platforms: Platform[]; sequences: { line: string; dir: number; codes: string[] }[] }> {
  const platforms: Platform[] = [];
  const add = (line: string, code: string, zh: string) => {
    if (!platforms.some((p) => p.line === line && p.code === code)) platforms.push({ code, line, zh: zh === '台北車站' ? zh : zh.replace(/站$/, ''), key: nameKey(zh) });
  };
  const sequences: { line: string; dir: number; codes: string[] }[] = [];
  for (const [, route, line, dir, stations] of await trtc('routeStations')) {
    const list = [...stations.matchAll(/'?(\d+),([A-Z]+\d+A?),([^',]+)'?/g)].map((m) => ({ code: m[2], zh: m[3] }));
    const myLine = route === 'R-3' ? 'xinbeitou' : route === 'G-3' ? 'xiaobitan' : line;
    for (const s of list) add(myLine, s.code, s.zh);
    sequences.push({ line: myLine, dir: Number(dir), codes: list.map((s) => s.code) });
  }
  for (const [line, list] of Object.entries(NTM_STATIONS)) {
    for (const [code, zh] of list) add(line, code, zh);
    sequences.push({ line, dir: 0, codes: list.map(([c]) => c) }, { line, dir: 1, codes: list.map(([c]) => c).reverse() });
  }
  return { platforms, sequences };
}

interface OsmNode {
  id: number;
  lat: number;
  lon: number;
  tags: Record<string, string>;
}

type OsmElement = OsmNode & { type: string; members?: { type: string; ref: number; role: string }[]; geometry?: { lat: number; lon: number }[] };

async function overpass(q: string, file: string): Promise<{ elements: OsmElement[] }> {
  const path = join(CACHE, file);
  if (REFRESH || !existsSync(path)) {
    let text = '';
    for (const url of ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter']) {
      try {
        console.log(`querying Overpass (${new URL(url).host}) for ${file}`);
        const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': UA }, body: `data=${encodeURIComponent(q)}` });
        const t = await res.text();
        if (res.ok && t.startsWith('{')) {
          text = t;
          break;
        }
        console.warn(`Overpass ${new URL(url).host}: HTTP ${res.status}`);
      } catch (err) {
        console.warn(`Overpass ${new URL(url).host}: ${err instanceof Error ? err.message : err}`);
      }
    }
    if (!text) throw new Error('Overpass unavailable, retry later');
    writeFileSync(path, text);
  }
  return JSON.parse(readFileSync(path, 'utf8'));
}

/**
 * Platform positions: the stop members of the line's OSM route relations, else station nodes of the same name, moved
 * onto the nearest track of the line's relations (a station node can sit between the platforms of two lines).
 */
async function locate(platforms: Platform[]): Promise<{ pos: Map<Platform, [number, number]>; en: Map<string, string>; tracks: Map<string, LineTrack> }> {
  const ids = Object.values(OSM_RELATIONS).flat();
  const rel = await overpass(`[out:json][timeout:180];relation(id:${ids.join(',')})->.r;.r out body;node(r.r);out;way(r.r);out geom;`, 'osm-relations.json');
  const [W, S, E, N] = CITIES.taipei.bbox;
  const all = await overpass(
    `[out:json][timeout:180];(node["railway"~"^(station|halt|stop|tram_stop)$"]["name"](${S - 0.08},${W - 0.08},${N + 0.08},${E + 0.08});` +
      `node["public_transport"~"^(station|stop_position)$"]["name"](${S - 0.08},${W - 0.08},${N + 0.08},${E + 0.08}););out;`,
    'osm-stations.json',
  );
  const nodes = new Map<number, OsmNode>();
  for (const e of [...rel.elements, ...all.elements]) if (e.type === 'node') nodes.set(e.id, e);
  const members = new Map<string, OsmNode[]>(); // line -> stop nodes of its relations
  const track = new Map<string, OsmElement[]>(); // line -> ways of its relations
  const ways = new Map(rel.elements.filter((e) => e.type === 'way' && e.geometry).map((e) => [e.id, e]));
  for (const e of rel.elements) {
    if (e.type !== 'relation') continue;
    const line = Object.entries(OSM_RELATIONS).find(([, list]) => list.includes(e.id))![0];
    const list = members.get(line) ?? members.set(line, []).get(line)!;
    const geo = track.get(line) ?? track.set(line, []).get(line)!;
    for (const m of e.members ?? []) {
      if (m.type === 'node' && /^stop/.test(m.role) && nodes.has(m.ref)) list.push(nodes.get(m.ref)!);
      const w = ways.get(m.ref);
      if (m.type === 'way' && w && !/platform/.test(m.role) && /^(subway|light_rail|tram|rail)$/.test(w.tags?.railway ?? '')) geo.push(w);
    }
  }
  const snap = (line: string, lon: number, lat: number): [number, number] => {
    const kx = Math.cos((lat * Math.PI) / 180);
    let best: [number, number, number] = [lon, lat, 0.006];
    for (const { geometry: g } of track.get(line) ?? [])
      for (let i = 1; i < g!.length; i++) {
        const ax = g![i - 1].lon * kx, ay = g![i - 1].lat, bx = g![i].lon * kx, by = g![i].lat;
        const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
        const t = len2 ? Math.max(0, Math.min(1, ((lon * kx - ax) * dx + (lat - ay) * dy) / len2)) : 0;
        const d = Math.hypot(ax + t * dx - lon * kx, ay + t * dy - lat);
        if (d < best[2]) best = [(ax + t * dx) / kx, ay + t * dy, d];
      }
    return [best[0], best[1]];
  };
  const byName = new Map<string, OsmNode[]>();
  for (const n of nodes.values()) {
    if (!n.tags?.name) continue;
    const k = nameKey(n.tags.name.replace(/\s*\(.*\)$/, ''));
    (byName.get(k) ?? byName.set(k, []).get(k)!).push(n);
  }
  const pos = new Map<Platform, [number, number]>();
  const en = new Map<string, string>();
  const missing: string[] = [];
  for (const p of platforms) {
    const own = (members.get(p.line) ?? []).filter((n) => nameKey(n.tags.name ?? '') === p.key);
    const cands = own.length ? own : (byName.get(p.key) ?? []).filter((n) => n.tags.railway === 'station' || n.tags.public_transport === 'stop_position' || n.tags.railway === 'stop');
    if (!cands.length) {
      missing.push(`${p.line} ${p.code} ${p.zh}`);
      continue;
    }
    // Prefer stop positions (on the track), then average them.
    const onTrack = cands.filter((n) => n.tags.public_transport === 'stop_position' || n.tags.railway === 'stop');
    const use = onTrack.length ? onTrack : cands;
    const near = use.filter((n) => Math.hypot(n.lat - use[0].lat, (n.lon - use[0].lon) * 0.9) < 0.004);
    pos.set(p, snap(p.line, near.reduce((t, n) => t + n.lon, 0) / near.length, near.reduce((t, n) => t + n.lat, 0) / near.length));
    const name = cands.map((n) => n.tags['name:en']).find((s) => s && !/under construction/i.test(s));
    if (name && !en.has(p.key)) en.set(p.key, name.replace(/\s+Station$/, '').trim());
  }
  if (missing.length) console.warn(`no OSM position for: ${missing.join(', ')}`);
  const tracks = new Map([...track].map(([line, list]) => [line, new LineTrack(list)]));
  return { pos, en, tracks };
}

/**
 * A line's own track (the ways of its route relations), so shapes can't stray onto a line stacked above or below.
 * Long tunnel segments are densified so every station has track nodes nearby.
 */
class LineTrack {
  private adj = new Map<number, [number, number][]>();
  private xy = new Map<number, [number, number]>();

  constructor(ways: OsmElement[]) {
    let virtual = -1;
    for (const w of ways) {
      const nodes = (w as unknown as { nodes: number[] }).nodes;
      nodes.forEach((n, i) => this.xy.set(n, [w.geometry![i].lon, w.geometry![i].lat]));
      for (let i = 1; i < nodes.length; i++) {
        const a = this.xy.get(nodes[i - 1])!, b = this.xy.get(nodes[i])!;
        const steps = Math.ceil(this.dist(a, b) / 40);
        let prev = nodes[i - 1];
        for (let k = 1; k <= steps; k++) {
          const n = k === steps ? nodes[i] : virtual--;
          if (k < steps) this.xy.set(n, [a[0] + ((b[0] - a[0]) * k) / steps, a[1] + ((b[1] - a[1]) * k) / steps]);
          this.link(prev, n);
          prev = n;
        }
      }
    }
  }

  private link(u: number, v: number) {
    const d = this.dist(this.xy.get(u)!, this.xy.get(v)!);
    (this.adj.get(u) ?? this.adj.set(u, []).get(u)!).push([v, d]);
    (this.adj.get(v) ?? this.adj.set(v, []).get(v)!).push([u, d]);
  }

  private dist(a: [number, number], b: [number, number]) {
    return Math.hypot((a[0] - b[0]) * 101_000, (a[1] - b[1]) * 111_000);
  }

  /** Nodes near a point with their distance: every node within 60 m, else the nearest within 200 m. */
  private near(p: [number, number]): Map<number, number> {
    const out = new Map<number, number>();
    let best: [number, number] | null = null;
    for (const [n, q] of this.xy) {
      const d = this.dist(p, q);
      if (d < 60) out.set(n, d);
      if (d < 200 && (!best || d < best[1])) best = [n, d];
    }
    if (!out.size && best) out.set(best[0], best[1]);
    return out;
  }

  /** Shortest path along the line's track between two points, as [lon, lat] vertices. Either track may be used. */
  route(a: [number, number], b: [number, number]): [number, number][] | null {
    const sa = this.near(a), sb = this.near(b);
    if (!sa.size || !sb.size) return null;
    return this.dijkstra(sa, sb, 3 * this.dist(a, b) + 2000);
  }

  /** Multi-source Dijkstra; leaving or joining the track away from the point costs triple. */
  private dijkstra(from: Map<number, number>, to: Map<number, number>, limit: number): [number, number][] | null {
    const dist = new Map<number, number>(), prev = new Map<number, number>();
    const heap: [number, number][] = [];
    const push = (e: [number, number]) => {
      heap.push(e);
      for (let i = heap.length - 1; i > 0; ) {
        const p = (i - 1) >> 1;
        if (heap[p][0] <= heap[i][0]) break;
        [heap[p], heap[i]] = [heap[i], heap[p]];
        i = p;
      }
    };
    const pop = () => {
      const top = heap[0], last = heap.pop()!;
      if (heap.length) {
        heap[0] = last;
        for (let i = 0; ; ) {
          const l = 2 * i + 1, r = l + 1;
          let m = i;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === i) break;
          [heap[m], heap[i]] = [heap[i], heap[m]];
          i = m;
        }
      }
      return top;
    };
    for (const [n, d] of from) dist.set(n, 3 * d), push([3 * d, n]);
    let best: [number, number] | null = null; // [total, end node]
    while (heap.length) {
      const [du, u] = pop();
      if (du > (dist.get(u) ?? Infinity)) continue;
      if (du > limit || (best && du >= best[0])) break;
      const end = to.get(u);
      if (end != null && (!best || du + 3 * end < best[0])) best = [du + 3 * end, u];
      for (const [v, w] of this.adj.get(u) ?? [])
        if (du + w < (dist.get(v) ?? Infinity)) {
          dist.set(v, du + w);
          prev.set(v, u);
          push([du + w, v]);
        }
    }
    if (!best) return null;
    const path: [number, number][] = [];
    for (let n: number | undefined = best[1]; n != null; n = prev.get(n)) path.push(this.xy.get(n)!);
    return path.reverse();
  }
}

// ---------------------------------------------------------------------------------------------------------- timing

/** Run time (s) from each station to the next, and dwell (s) at stations, from TRTC's published table. */
async function loadRunTimes(): Promise<{ run: Map<string, number>; dwell: Map<string, number> }> {
  const run = new Map<string, number>();
  const dwells = new Map<string, number[]>();
  for (const r of await trtc('runTimes')) {
    const [, , a, b, t, , stop] = r;
    const ka = nameKey(a), kb = nameKey(b);
    run.set(`${ka}|${kb}`, Number(t));
    if (Number(stop) > 0) (dwells.get(ka) ?? dwells.set(ka, []).get(ka)!).push(Number(stop));
  }
  const dwell = new Map([...dwells].map(([k, v]) => [k, Math.max(...v)]));
  return { run, dwell };
}

interface Trip {
  line: string;
  day: DayType;
  dest: string; // platform code
  dir: number;
  /** [code, arrival, departure] seconds after the service day's midnight. */
  stops: [string, number, number][];
}

interface PathTiming {
  line: string;
  path: string[];
  dir: number;
  arr: number[]; // modeled offsets from leaving path[0]
  dep: number[];
}

/**
 * Chains station timetables into trips. `deps` holds each station's departures toward the group's destination (the
 * destination itself has none). Branches that merge on the way (the Zhonghe–Xinlu line's two northern arms) come as
 * several paths sharing their tail, where their trains compete for the same departures. With `spawn`, a departure no
 * train could have made from upstream starts a new trip there (depot runs, short workings). Late at night trains
 * wait at interchanges for connections. Times follow the model, shifted by the smoothed offsets of the (minute-rounded)
 * published departures.
 */
function stitch(day: DayType, paths: PathTiming[], deps: Map<string, number[]>, tol: number, spawn = true): Trip[] {
  interface Open {
    p: number; // path index
    start: number; // index in its path
    segs: { from: number; res: Map<number, number> }[]; // residuals (published - modeled) by path index
  }
  const mean = (v: number[]) => v.reduce((t, x) => t + x, 0) / v.length;
  const predict = (o: Open, k: number) => mean([...o.segs.at(-1)!.res.values()].slice(-3)) + paths[o.p].dep[k];
  let tail = 1;
  while (tail < Math.min(...paths.map((p) => p.path.length)) && new Set(paths.map((p) => p.path.at(-1 - tail))).size === 1) tail++;
  const open: Open[] = [];
  const visit = (station: string, members: Open[], at: (o: Open) => number, make: () => Open, first: boolean) => {
    const entries = deps.get(station) ?? [];
    const usedO = new Set<Open>(), usedE = new Set<number>();
    for (const t of [tol, 2.5 * tol]) {
      const pairs: [Open, number, number][] = [];
      for (const o of members) {
        if (usedO.has(o)) continue;
        for (const e of entries) if (!usedE.has(e) && Math.abs(predict(o, at(o)) - e) <= t) pairs.push([o, e, Math.abs(predict(o, at(o)) - e)]);
      }
      pairs.sort((a, b) => a[2] - b[2]);
      for (const [o, e] of pairs) {
        if (usedO.has(o) || usedE.has(e)) continue;
        usedO.add(o);
        usedE.add(e);
        o.segs.at(-1)!.res.set(at(o), e - paths[o.p].dep[at(o)]);
      }
    }
    const free = entries.filter((e) => !usedE.has(e));
    // Late-night trains hold at interchanges: an unmatched train takes the next free departure within 30 min.
    for (const o of members.filter((x) => !usedO.has(x)).sort((a, b) => predict(a, at(a)) - predict(b, at(b)))) {
      const want = predict(o, at(o));
      if (want < 22.5 * 3600) continue;
      const i = free.findIndex((e) => e > want && e - want < 1800);
      if (i < 0) continue;
      o.segs.push({ from: at(o), res: new Map([[at(o), free[i] - paths[o.p].dep[at(o)]]]) });
      free.splice(i, 1);
    }
    if (!spawn && !first) return;
    for (const e of free) {
      const o = make();
      o.segs[0].res.set(at(o), e - paths[o.p].dep[at(o)]);
      open.push(o);
    }
  };
  // Each branch up to the shared tail, then the tail with everyone.
  paths.forEach((pt, p) => {
    for (let k = 0; k < pt.path.length - tail; k++)
      visit(pt.path[k], open.filter((o) => o.p === p), () => k, () => ({ p, start: k, segs: [{ from: k, res: new Map() }] }), k === 0);
  });
  for (let j = 0; j < tail - 1; j++) {
    const k0 = paths[0].path.length - tail + j;
    visit(paths[0].path[k0], [...open], (o) => paths[o.p].path.length - tail + j, () => ({ p: 0, start: k0, segs: [{ from: k0, res: new Map() }] }), k0 === 0);
  }
  /** Smoothed residual at k within a segment: the mean over published stations within two stops, else the nearest. */
  const smooth = (res: Map<number, number>, k: number) => {
    const near = [...res].filter(([j]) => Math.abs(j - k) <= 2).map(([, r]) => r);
    if (near.length) return mean(near);
    return [...res].sort((a, b) => Math.abs(a[0] - k) - Math.abs(b[0] - k))[0][1];
  };
  return open.map((o) => {
    const { line, path, arr, dep, dir } = paths[o.p];
    const stops: [string, number, number][] = [];
    for (let k = o.start; k < path.length; k++) {
      const si = o.segs.findLastIndex((s) => s.from <= k);
      const r = smooth(o.segs[si].res, k);
      const rArr = si > 0 && o.segs[si].from === k ? smooth(o.segs[si - 1].res, k) : r;
      let a = Math.round(k === o.start ? r + dep[k] : rArr + arr[k]);
      if (stops.length) a = Math.max(a, stops.at(-1)![2] + 20);
      const d = k === path.length - 1 ? a : Math.max(a, Math.round(r + dep[k]));
      stops.push([path[k], a, d]);
    }
    return { line, day, dest: path.at(-1)!, dir, stops };
  });
}

/** Offsets from a published run-time table: dep[k] / arr[k] relative to leaving path[0]. */
function offsetsFromTable(zh: string[], run: Map<string, number>, dwell: Map<string, number>, fallbackRun: (i: number) => number): { arr: number[]; dep: number[] } {
  const arr = [0], dep = [0];
  for (let k = 1; k < zh.length; k++) {
    const t = run.get(`${zh[k - 1]}|${zh[k]}`) ?? run.get(`${zh[k]}|${zh[k - 1]}`) ?? fallbackRun(k);
    arr.push(dep[k - 1] + t);
    dep.push(arr[k] + (dwell.get(zh[k]) ?? 25));
  }
  return { arr, dep };
}

/** Offsets estimated from the station timetables themselves: the mean time from one station's departure to the next's. */
function offsetsFromTimetables(deps: number[][], lastHop: number, dwellS: number): { arr: number[]; dep: number[] } {
  const arr = [0], dep = [0];
  for (let k = 1; k < deps.length; k++) {
    let hop = lastHop;
    if (deps[k]?.length && deps[k - 1]?.length) {
      const diffs: number[] = [];
      for (const e of deps[k - 1]) {
        const f = deps[k].find((x) => x >= e);
        if (f != null && f - e < 900) diffs.push(f - e);
      }
      diffs.sort((a, b) => a - b);
      const med = diffs[diffs.length >> 1];
      const near = diffs.filter((d) => Math.abs(d - med) <= 90);
      if (near.length) hop = near.reduce((t, x) => t + x, 0) / near.length;
    }
    dep.push(dep[k - 1] + hop);
    arr.push(dep[k] - (k === deps.length - 1 ? 0 : dwellS));
  }
  return { arr, dep };
}

// ---------------------------------------------------------------------------------------------------------- TRTC

async function trtcTrips(platforms: Platform[], sequences: { line: string; dir: number; codes: string[] }[], run: Map<string, number>, dwell: Map<string, number>): Promise<Trip[]> {
  const zhOf = new Map(platforms.map((p) => [p.code, p.key]));
  const trips: Trip[] = [];
  for (const [file, res, day] of TRTC_TIMETABLES) {
    const rows = csv(decode(await download(`${DATA_TAIPEI}/${TT}${res}/download`, `tt-${file}.csv`))).slice(1);
    // (line, direction, destination) -> station -> departures
    const groups = new Map<string, Map<string, number[]>>();
    for (const r of rows) {
      const [, route, station, , dir, dest, , times] = r;
      const t = times.match(/(\d{1,2}:\d{2})/)?.[1];
      if (!t) continue;
      const line = route === 'R-3' ? 'xinbeitou' : route === 'G-3' ? 'xiaobitan' : route.split('-')[0];
      const k = `${line}|${dir}|${dest}`;
      const g = groups.get(k) ?? groups.set(k, new Map()).get(k)!;
      (g.get(station) ?? g.set(station, []).get(station)!).push(hm(t) + TRUNCATED);
    }
    for (const [k, g] of groups) {
      const [line, , dest] = k.split('|');
      // The paths to the destination that cover the stations with departures: one, or one per merging branch.
      const cands = sequences.filter((s) => s.line === line && s.codes.indexOf(dest) > 0).map((s) => ({ dir: s.dir, path: s.codes.slice(0, s.codes.indexOf(dest) + 1) }));
      const chosen: typeof cands = [];
      const left = new Set(g.keys());
      for (;;) {
        const gain = (c: (typeof cands)[0]) => c.path.filter((x) => left.has(x)).length;
        const best = cands.sort((a, b) => gain(b) - gain(a) || b.path.length - a.path.length)[0];
        if (!best || !gain(best)) break;
        chosen.push(best);
        for (const x of best.path) left.delete(x);
      }
      if (left.size) console.warn(`${file} ${k}: departures at ${[...left].join(' ')} off every path`);
      if (!chosen.length) continue;
      const paths = chosen.map((c) => ({ line, ...c, ...offsetsFromTable(c.path.map((x) => zhOf.get(x)!), run, dwell, () => 120) }));
      for (const list of g.values()) list.sort((a, b) => a - b);
      trips.push(...stitch(day, paths, g, 100));
    }
  }
  return trips;
}

/** Wenhu line: driverless and run to headways (data.taipei), from its first and last trains. */
async function wenhuTrips(platforms: Platform[], run: Map<string, number>, dwell: Map<string, number>): Promise<Trip[]> {
  const zhOf = new Map(platforms.filter((p) => p.line === 'BR').map((p) => [p.code, p.key]));
  const codes = [...zhOf.keys()].sort();
  const firstLast = new Map<string, [number, number]>(); // `${code}|${dest}` -> first, last
  for (const r of await trtc('firstLast')) {
    const [, line, station, , dest, , first, last] = r;
    if (line === 'BR') firstLast.set(`${station}|${dest}`, [hm(first), hm(last)]);
  }
  // Bands [from, minutes]: TRTC publishes ranges (2-4 min at peaks, 4-10 off peak, 12 after 23:00); these sit inside them.
  const BANDS: Record<'wd' | 'we', [string, number][]> = {
    wd: [['06:00', 5], ['07:00', 2.5], ['09:00', 5], ['17:00', 2.5], ['19:30', 5], ['22:00', 8], ['23:00', 12]],
    we: [['06:00', 6], ['10:00', 5], ['22:00', 8], ['23:00', 12]],
  };
  const trips: Trip[] = [];
  for (const [dir, path] of [[0, codes], [1, [...codes].reverse()]] as [number, string[]][]) {
    const dest = path.at(-1)!;
    const { arr, dep } = offsetsFromTable(path.map((c) => zhOf.get(c)!), run, dwell, () => 90);
    const fl = path.map((c) => firstLast.get(`${c}|${dest}`));
    for (const day of ['wd', 'we'] as const) {
      const bands = BANDS[day].map(([t, m]) => [hm(t), m * 60] as [number, number]);
      const [first, last] = fl[0]!;
      const make = (start: number, t0: number, holdAt?: number[]): Trip => {
        const stops: [string, number, number][] = [];
        let shift = 0;
        for (let k = start; k < path.length; k++) {
          const a = t0 + arr[k] - arr[start] + shift;
          if (holdAt?.[k]) shift += holdAt[k];
          const d = k === path.length - 1 ? a : t0 + dep[k] - arr[start] + shift;
          stops.push([path[k], Math.round(k === start ? d : a), Math.round(d)]);
        }
        return { line: 'BR', day, dest, dir, stops };
      };
      const times: number[] = [];
      for (let t = first; t < last; t += bands.findLast(([from]) => from <= t)![1]) times.push(t);
      times.push(last);
      for (const t of times.slice(0, -1)) trips.push(make(0, t));
      // The last train waits at stations where TRTC's last departure is later, to meet other lines' last trains.
      const hold: number[] = path.map(() => 0);
      let t = last;
      for (let k = 1; k < path.length - 1; k++) {
        t += dep[k] - dep[k - 1];
        const l = fl[k]?.[1];
        if (l != null && l > t + 60 && l - t < 1800) {
          hold[k] = l - t;
          t = l;
        }
      }
      trips.push(make(0, last, hold));
      // First trains also leave from stations along the line at opening time, before a train from the end reaches them.
      let reach = first;
      for (let k = 1; k < path.length - 1; k++) {
        reach += dep[k] - dep[k - 1];
        const f = fl[k]?.[0];
        if (f != null && f < reach - 60) {
          trips.push(make(k, f - (dep[k] - arr[k])));
          reach = f;
        }
      }
    }
  }
  return trips;
}

// ---------------------------------------------------------------------------------------------------------- New Taipei Metro

/** Departures parsed from a New Taipei Metro station timetable: day type, destination name, seconds. */
function parseNtm(text: string, defaultDest: string): { day: 'wd' | 'we'; dest: string; t: number }[] {
  const out: { day: 'wd' | 'we'; dest: string; t: number }[] = [];
  let day: 'wd' | 'we' = 'wd';
  let sectionDest = defaultDest;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^(\d{1,2})時[：:]?(.*)$/);
    if (!m) {
      if (/假日|週六|週日/.test(line)) day = 'we';
      else if (/平常日|平日/.test(line)) day = 'wd';
      const d = line.match(/往(.+?)(站|發車|平常日|平日|週六|假日|$)/);
      if (d && !/時刻/.test(d[1])) sectionDest = d[1];
      continue;
    }
    let h = Number(m[1]);
    if (h < 4) h += 24;
    for (const chunk of m[2].split(/[，,]/)) {
      const dm = chunk.match(/往(.+?)站?$/);
      const dest = dm ? dm[1] : sectionDest;
      for (const mm of chunk.replace(/往.*$/, '').matchAll(/\d{1,2}/g)) out.push({ day, dest, t: (h * 60 + Number(mm[0])) * 60 + TRUNCATED });
    }
  }
  return out;
}

async function ntmTrips(platforms: Platform[], run: Map<string, number>, dwell: Map<string, number>): Promise<Trip[]> {
  // page -> station code, from the page titles ('V01紅樹林站', 'Y07大坪林', 'K09十四張 ').
  const deps = new Map<string, { day: 'wd' | 'we'; dest: string; t: number }[]>();
  for (const node of NTM_PAGES) {
    const html = decode(await download(`https://www.ntmetro.com.tw/basic/?mode=detail&node=${node}`, `ntm-${node}.html`));
    const title = html.match(/<title>\s*([A-Z]\d{2})/)?.[1];
    const href = html.match(/href="(\/archive\/file\/[^"]+\.odt)"/)?.[1];
    if (!title || !href) {
      console.warn(`ntmetro node ${node}: no timetable`);
      continue;
    }
    const zip = unzipSync(new Uint8Array(await download(`https://www.ntmetro.com.tw${href}`, `ntm-${node}.odt`)));
    const text = strFromU8(zip['content.xml']).replace(/<text:p[^>]*>/g, '\n').replace(/<[^>]+>/g, '');
    const defaults: Record<string, string> = { K01: '十四張', K09: '雙城', Y07: '新北產業園區', Y20: '大坪林', V11: '紅樹林', V26: '紅樹林' };
    deps.set(title, parseNtm(text, defaults[title] ?? ''));
  }
  const destCode = (line: string, name: string) => {
    const k = nameKey(name.replace('新北產月園區', '新北產業園區').replace(/^漁人碼頭$/, '淡水漁人碼頭'));
    return platforms.find((p) => p.line === line && (p.key === k || p.key.endsWith(k)))?.code;
  };
  const trips: Trip[] = [];
  const departures = (c: string, line: string, day: DayType, dest: string) =>
    [...new Set((deps.get(c) ?? []).filter((e) => e.day === day && destCode(line, e.dest) === dest).map((e) => e.t))].sort((a, b) => a - b);
  // Circular line: published run times, departures from the two terminals.
  const y = NTM_STATIONS.Y.map(([c]) => c);
  for (const [dir, path] of [[0, y], [1, [...y].reverse()]] as [number, string[]][]) {
    const zh = path.map((c) => platforms.find((p) => p.line === 'Y' && p.code === c)!.key);
    const timing = { line: 'Y', path, dir, ...offsetsFromTable(zh, run, dwell, () => 110) };
    for (const day of ['wd', 'we'] as const) trips.push(...stitch(day, [timing], new Map([[path[0], departures(path[0], 'Y', day, path.at(-1)!)]]), 60));
  }
  // Light rail: every station's timetable, with hop times estimated from them. Both Danhai services start at
  // Hongshulin and come back to it, so the way back is one group with two merging branches.
  const lrt: { lines: string[]; dir: number }[] = [
    { lines: ['VG'], dir: 0 }, { lines: ['VB'], dir: 0 }, { lines: ['VG', 'VB'], dir: 1 }, { lines: ['K'], dir: 0 }, { lines: ['K'], dir: 1 },
  ];
  for (const { lines, dir } of lrt) {
    // Hop times come from the weekday timetables (some stations' weekend lists are garbled) and serve both days.
    const timing = lines.map((line) => {
      const codes = NTM_STATIONS[line].map(([c]) => c);
      const path = dir ? [...codes].reverse() : codes;
      const per = path.map((c, k) => (k === path.length - 1 ? [] : departures(c, line, 'wd', path.at(-1)!)));
      // The hop into the terminal is the reverse direction's hop out of it.
      const back = path.slice(-2).reverse().map((c) => departures(c, line, 'wd', path[0]));
      const lastHop = offsetsFromTimetables(back, 120, 0).dep[1] || 120;
      return { line, path, dir, ...offsetsFromTimetables(per, lastHop, 20) };
    });
    for (const day of ['wd', 'we'] as const) {
      const g = new Map<string, number[]>();
      for (const { line, path } of timing) path.slice(0, -1).forEach((c) => g.set(c, departures(c, line, day, path.at(-1)!)));
      trips.push(...stitch(day, timing, g, 150, false));
    }
  }
  return trips;
}

// ---------------------------------------------------------------------------------------------------------- calendar

async function calendar(): Promise<{ from: number; to: number; dates: Map<number, boolean> }> {
  const dates = new Map<number, boolean>(); // YYYYMMDD -> is a day off
  // Days off for everyone; '特定節日' (e.g. Armed Forces Day) only concern some trades.
  for (const [date, , isHoliday, category] of await trtc('holidays')) if (/^\d{8}$/.test(date)) dates.set(Number(date), isHoliday === '是' && category !== '特定節日');
  return { from: 20260901, to: 20271231, dates };
}

// ---------------------------------------------------------------------------------------------------------- GTFS

async function main() {
  const { platforms, sequences } = await loadCatalog();
  const { pos, en, tracks } = await locate(platforms);
  const { run, dwell } = await loadRunTimes();
  const trips = [...(await trtcTrips(platforms, sequences, run, dwell)), ...(await wenhuTrips(platforms, run, dwell)), ...(await ntmTrips(platforms, run, dwell))];

  const stat = new Map<string, number>();
  for (const t of trips) stat.set(`${t.line} ${t.day}`, (stat.get(`${t.line} ${t.day}`) ?? 0) + 1);
  console.log(`trips: ${[...stat].map(([k, v]) => `${k}:${v}`).join('  ')}`);
  if (process.argv.includes('--debug')) {
    // Where trips start: the terminal, or (depot runs, short workings, timetable noise) somewhere along the way.
    const starts = new Map<string, Map<string, number>>();
    for (const t of trips) {
      const k = `${t.line} ${t.day} dir${t.dir} to ${t.dest}`;
      const m = starts.get(k) ?? starts.set(k, new Map()).get(k)!;
      m.set(t.stops[0][0], (m.get(t.stops[0][0]) ?? 0) + 1);
    }
    for (const [k, m] of starts) console.log(`  starts ${k}: ${[...m].sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c}:${n}`).join(' ')}`);
  }

  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const enName = (key: string, zh: string) => EN[key] ?? en.get(key) ?? zh;
  const parentOf = new Map<string, string>(); // key -> parent id
  const stops: string[] = ['stop_id,stop_name,stop_lat,stop_lon,location_type,parent_station,name_zh'];
  const q = (s: string) => (/[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const byKey = new Map<string, Platform[]>();
  for (const p of platforms) if (pos.has(p)) (byKey.get(p.key) ?? byKey.set(p.key, []).get(p.key)!).push(p);
  for (const [key, list] of byKey) {
    const name = enName(key, list[0].zh);
    let id = slug(name);
    while ([...parentOf.values()].includes(id)) id += '-2';
    parentOf.set(key, id);
    const lon = list.reduce((t, p) => t + pos.get(p)![0], 0) / list.length, lat = list.reduce((t, p) => t + pos.get(p)![1], 0) / list.length;
    stops.push([id, q(name), lat.toFixed(6), lon.toFixed(6), '1', '', q(list[0].zh)].join(','));
  }
  const stopId = (line: string, code: string) => `${line}:${code}`;
  for (const p of platforms) {
    const xy = pos.get(p);
    if (!xy) continue;
    stops.push([stopId(p.line, p.code), q(enName(p.key, p.zh)), xy[1].toFixed(6), xy[0].toFixed(6), '0', parentOf.get(p.key)!, q(p.zh)].join(','));
  }

  const routes = ['route_id,agency_id,route_short_name,route_long_name,route_type,route_color,route_text_color'];
  for (const l of LINES) routes.push([l.id, l.system, l.short, q(l.name), l.kind === 'light' ? '0' : '1', l.color.slice(1), l.textColor.slice(1)].join(','));
  const agency = ['agency_id,agency_name,agency_url,agency_timezone', 'trtc,Taipei Metro,https://www.metro.taipei,Asia/Taipei', 'ntm,New Taipei Metro,https://www.ntmetro.com.tw,Asia/Taipei'];

  const cal = await calendar();
  const calendarTxt = ['service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date'];
  const DAYS: Record<DayType, string> = { wd: '1,1,1,1,1,0,0', we: '0,0,0,0,0,1,1', sat: '0,0,0,0,0,1,0', sun: '0,0,0,0,0,0,1' };
  for (const [s, d] of Object.entries(DAYS)) calendarTxt.push(`${s},${d},${cal.from},${cal.to}`);
  const calendarDates = ['service_id,date,exception_type'];
  for (const [date, off] of cal.dates) {
    if (date < cal.from || date > cal.to) continue;
    const wd = new Date(Date.UTC(Math.floor(date / 10000), (Math.floor(date / 100) % 100) - 1, date % 100)).getUTCDay();
    const weekend = wd === 0 || wd === 6;
    if (off && !weekend) calendarDates.push(`wd,${date},2`, `we,${date},1`, `sun,${date},1`);
    if (!off && weekend) calendarDates.push(`we,${date},2`, `${wd === 6 ? 'sat' : 'sun'},${date},2`, `wd,${date},1`);
  }

  // One shape per stopping pattern, routed along the line's own track; patterns with a gap in it get none (the kit
  // then routes them over all OSM track).
  const shapes = ['shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence'];
  const shapeOf = new Map<string, string>();
  let shapeGaps = 0;
  const shapeFor = (line: string, codes: string[]): string => {
    const key = `${line}|${codes.join(',')}`;
    if (shapeOf.has(key)) return shapeOf.get(key)!;
    const at = (c: string) => pos.get(platforms.find((p) => p.line === line && p.code === c)!)!;
    const pts: [number, number][] = [];
    for (let i = 1; i < codes.length && pts.length >= 0; i++) {
      const hop = tracks.get(line)?.route(at(codes[i - 1]), at(codes[i]));
      if (!hop) {
        shapeGaps++;
        if (process.argv.includes('--debug')) console.log(`no ${line} track ${codes[i - 1]} -> ${codes[i]}`);
        shapeOf.set(key, '');
        return '';
      }
      pts.push(...(pts.length ? hop.slice(1) : hop));
    }
    const id = `${line}-${shapeOf.size + 1}`;
    pts.forEach(([lon, lat], i) => shapes.push(`${id},${lat.toFixed(6)},${lon.toFixed(6)},${i + 1}`));
    shapeOf.set(key, id);
    return id;
  };

  const tripsTxt = ['route_id,service_id,trip_id,trip_headsign,direction_id,shape_id,headsign_zh'];
  const stopTimes = ['trip_id,arrival_time,departure_time,stop_id,stop_sequence'];
  const clock = (s: number) => `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  const counter = new Map<string, number>();
  for (const t of trips) {
    const kept = t.stops.filter(([c]) => platforms.some((p) => p.line === t.line && p.code === c && pos.has(p)));
    if (kept.length < 2) continue;
    const n = (counter.get(`${t.line}-${t.day}`) ?? 0) + 1;
    counter.set(`${t.line}-${t.day}`, n);
    const id = `${t.line}-${t.day}-${t.dir}-${String(n).padStart(4, '0')}`;
    const dp = platforms.find((p) => p.line === t.line && p.code === t.dest)!;
    tripsTxt.push([t.line, t.day, id, q(enName(dp.key, dp.zh)), String(t.dir), shapeFor(t.line, kept.map(([c]) => c)), q(dp.zh)].join(','));
    kept.forEach(([c, a, d], i) => stopTimes.push([id, clock(a), clock(d), stopId(t.line, c), String(i + 1)].join(',')));
  }

  const zip = zipSync({
    'agency.txt': strToU8(agency.join('\n')),
    'routes.txt': strToU8(routes.join('\n')),
    'stops.txt': strToU8(stops.join('\n')),
    'trips.txt': strToU8(tripsTxt.join('\n')),
    'stop_times.txt': strToU8(stopTimes.join('\n')),
    'calendar.txt': strToU8(calendarTxt.join('\n')),
    'calendar_dates.txt': strToU8(calendarDates.join('\n')),
    'shapes.txt': strToU8(shapes.join('\n')),
  });
  writeFileSync(join(CACHE, 'taipei-gtfs.zip'), zip);
  console.log(`GTFS: ${stops.length - 1} stops, ${tripsTxt.length - 1} trips, ${stopTimes.length - 1} stop times, ${shapeOf.size} patterns (${shapeGaps} without a track shape)`);

  await buildGtfsCity({
    city: 'taipei',
    feeds: [{ id: 'tpe', url: '.cache/taipei/taipei-gtfs.zip' }],
    systems: [
      { id: 'trtc', name: 'Taipei Metro', live: 'realtime' },
      { id: 'ntm', name: 'New Taipei Metro', live: 'scheduled' },
    ],
    lines: LINES.map((l) => ({
      id: l.id,
      system: l.system,
      match: { routeId: l.id },
      name: l.name,
      nameLocal: l.nameLocal,
      short: l.short,
      color: l.color,
      textColor: l.textColor,
      kind: l.kind,
      bullet: 'square' as const,
      stock: l.stock,
      osm: l.kind === 'light' ? ['light_rail', 'tram'] : ['subway'],
    })),
    // Railway ways of the lines' own relations join the default query: some carry service=yard or siding tags.
    geometry: {
      overpass: `rel(id:${Object.values(OSM_RELATIONS).flat().join(',')})->.rr;(way["railway"~"^(subway|light_rail|tram|monorail)$"]["service"!~"^(yard|siding|spur)$"](${CITIES.taipei.bbox[1]},${CITIES.taipei.bbox[0]},${CITIES.taipei.bbox[3]},${CITIES.taipei.bbox[2]});way(r.rr););`,
    },
    stations: {
      idPrefix: 'taipei',
      maxSpread: 200,
      nameLocal: (_name, stop) => stop.name_zh || undefined,
    },
    trips: {
      destLocal: (t) => t.trip.headsign_zh || undefined,
    },
    realtimeKeys: true,
    attribution: [
      'Timetables: Taipei Rapid Transit Corporation (data.taipei)',
      'Timetables: New Taipei Metro',
      'Stations and track © OpenStreetMap contributors',
    ],
  });

  // Station names as the live arrival feed spells them (Chinese, without 站) -> station ids, for the realtime overlay.
  const transit = JSON.parse(readFileSync(join(ROOT, 'public/data/taipei/transit.json'), 'utf8')) as { stations: { id: string; nameLocal?: string }[] };
  const names: Record<string, string[]> = {};
  for (const st of transit.stations) if (st.nameLocal) (names[nameKey(st.nameLocal)] ??= []).push(st.id);
  writeFileSync(join(ROOT, 'server/data/taipei/names.json'), JSON.stringify(names));
  console.log(`wrote server/data/taipei/names.json (${Object.keys(names).length} names)`);
}

await main();
