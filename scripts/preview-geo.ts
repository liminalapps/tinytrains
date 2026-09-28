// Renders public/data/{city}/geo.json + buildings.bin to SVG/PNG for eyeballing.
// Usage: npx tsx scripts/preview-geo.ts <city> [--at lon,lat --span meters] [--name tag] [--size px] [--no-buildings]
//        npx tsx scripts/preview-geo.ts <city> --density   (grayscale PNGs of density.bin)
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { crc32, deflateSync } from 'node:zlib';
import { cityBounds, makeProjection } from '../shared/geo.ts';
import { BUILDING_STRIDE, type CityId, type Flat, type GeoData, type Polygon } from '../shared/types.ts';

const argv = process.argv.slice(2);
const city = argv[0] as CityId;
const opt = (name: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const size = Number(opt('size') ?? 2000);
const tag = opt('name') ?? (opt('at') ? 'crop' : 'full');
const outDir = '.cache/geo/preview';
mkdirSync(outDir, { recursive: true });

/** Minimal 8-bit grayscale PNG writer. */
function writePng(path: string, w: number, h: number, gray: Uint8Array) {
  const raw = Buffer.alloc((w + 1) * h);
  for (let j = 0; j < h; j++) raw.set(gray.subarray(j * w, (j + 1) * w), j * (w + 1) + 1);
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth; color type 0 (gray), default compression/filter/interlace
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  writeFileSync(path, Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}

if (argv.includes('--density')) {
  const buf = readFileSync(`public/data/${city}/density.bin`);
  const w = buf.readInt32LE(0), h = buf.readInt32LE(4);
  const cell = buf.readFloatLE(16);
  const n = w * h;
  const cov = buf.subarray(20, 20 + n), hgt = buf.subarray(20 + n, 20 + 2 * n), ang = buf.subarray(20 + 2 * n, 20 + 3 * n);
  const hImg = new Uint8Array(n), aImg = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    hImg[i] = Math.min(255, Math.round(Math.sqrt(hgt[i] / 100) * 255)); // sqrt scale, 100 m = white
    aImg[i] = cov[i] > 25 ? 40 + Math.round((ang[i] / 256) * 215) : 0; // only well-built cells
  }
  const stats = (a: Uint8Array) => `mean ${(a.reduce((s, v) => s + v, 0) / n).toFixed(1)}, max ${a.reduce((m, v) => Math.max(m, v), 0)}`;
  console.log(`${city}: ${w}x${h} @ ${cell} m, ${buf.length} bytes; coverage ${stats(cov)}; height ${stats(hgt)}`);
  for (const [tagName, img] of [['coverage', cov], ['height', hImg], ['angle', aImg]] as const) {
    const path = `${outDir}/${city}-density-${tagName}.png`;
    writePng(path, w, h, img);
    console.log(path);
  }
  process.exit(0);
}

const geo: GeoData = JSON.parse(readFileSync(`public/data/${city}/geo.json`, 'utf8'));
const b = cityBounds(city);
let [x0, y0, x1, y1] = [b.minX, b.minY, b.maxX, b.maxY];
if (opt('at')) {
  const [lon, lat] = opt('at')!.split(',').map(Number);
  const [cx, cy] = makeProjection(city).project(lon, lat);
  const span = Number(opt('span') ?? 3000);
  [x0, y0, x1, y1] = [cx - span / 2, cy - span / 2, cx + span / 2, cy + span / 2];
}
// Square canvas (qlmanage thumbnails are square): pad the shorter side.
const half = Math.max(x1 - x0, y1 - y0) / 2;
const [mx, my] = [(x0 + x1) / 2, (y0 + y1) / 2];
[x0, y0, x1, y1] = [mx - half, my - half, mx + half, my + half];
const s = size / (2 * half);
const W = size, H = size;
const px = (x: number) => ((x - x0) * s).toFixed(1);
const py = (y: number) => ((y1 - y) * s).toFixed(1);
const visible = (f: Flat) => {
  let a = Infinity, c = -Infinity, d = Infinity, e = -Infinity;
  for (let i = 0; i < f.length; i += 2) {
    a = Math.min(a, f[i]); c = Math.max(c, f[i]); d = Math.min(d, f[i + 1]); e = Math.max(e, f[i + 1]);
  }
  return c >= x0 && a <= x1 && e >= y0 && d <= y1;
};
const ringPath = (r: Flat, close: boolean) => {
  let d = `M${px(r[0])} ${py(r[1])}`;
  for (let i = 2; i < r.length; i += 2) d += `L${px(r[i])} ${py(r[i + 1])}`;
  return close ? `${d}Z` : d;
};
const polys = (ps: Polygon[] | undefined, fill: string, stroke = 'none') => {
  const d = (ps ?? []).filter((p) => visible(p[0])).map((p) => p.map((r) => ringPath(r, true)).join('')).join('');
  return d ? `<path d="${d}" fill="${fill}" fill-rule="nonzero" stroke="${stroke}" stroke-width="0.6"/>` : '';
};

// Structural checks: integer coords inside bounds (1 m slack), valid rings, surviving holes.
{
  const bad: string[] = [];
  const checkFlat = (f: Flat, what: string, minPts: number) => {
    if (f.length < minPts * 2 || f.length % 2) bad.push(`${what}: ${f.length / 2} points`);
    for (let i = 0; i < f.length; i += 2) {
      const [x, y] = [f[i], f[i + 1]];
      if (!Number.isInteger(x) || !Number.isInteger(y)) return bad.push(`${what}: non-integer ${x},${y}`);
      if (x < b.minX - 1 || x > b.maxX + 1 || y < b.minY - 1 || y > b.maxY + 1) return bad.push(`${what}: out of bounds ${x},${y}`);
    }
  };
  const summary: string[] = [];
  for (const k of ['water', 'parks', 'green', 'sand', 'airports', 'runways'] as const) {
    const ps = geo[k] ?? [];
    ps.forEach((p, i) => p.forEach((r, j) => checkFlat(r, `${k}[${i}][${j}]`, 3)));
    summary.push(`${k} ${ps.length} (${ps.reduce((s, p) => s + p.length - 1, 0)} holes)`);
  }
  geo.roads.forEach((r, i) => checkFlat(r.pts, `roads[${i}]`, 2));
  (geo.rail ?? []).forEach((r, i) => checkFlat(r, `rail[${i}]`, 2));
  summary.push(`roads ${geo.roads.length}`, `rail ${geo.rail?.length ?? 0}`, `labels ${geo.labels.length}`);
  console.log(summary.join(', '));
  console.log(bad.length ? `${bad.length} problems, e.g.\n  ${bad.slice(0, 5).join('\n  ')}` : 'structure ok');
}

const parts: string[] = [];
parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`);
parts.push(`<rect width="${W}" height="${H}" fill="#555"/>`);
parts.push(`<rect x="${px(b.minX)}" y="${py(b.maxY)}" width="${((b.maxX - b.minX) * s).toFixed(1)}" height="${((b.maxY - b.minY) * s).toFixed(1)}" fill="#efe8d8"/>`);
parts.push(polys(geo.green, '#cfe3b4'));
parts.push(polys(geo.parks, '#9fd38a'));
parts.push(polys(geo.sand, '#f3dd9a'));
parts.push(polys(geo.airports, '#dcdce6'));
parts.push(polys(geo.runways, '#9a9aa8'));
const stroke = argv.includes('--outline') ? '#1a5fa0' : 'none';
parts.push(polys(geo.water, '#7fb8e6', stroke));
const lineW = [3, 2.2, 1.6, 1.1].map((w) => Math.max(0.4, w * Math.min(1, s * 12)));
for (const k of [3, 2, 1, 0]) {
  const d = geo.roads.filter((r) => r.k === k && visible(r.pts)).map((r) => ringPath(r.pts, false)).join('');
  if (d) parts.push(`<path d="${d}" fill="none" stroke="${k === 0 ? '#e0a040' : '#8a8a8a'}" stroke-width="${lineW[k]}" stroke-linejoin="round"/>`);
}
const rd = (geo.rail ?? []).filter(visible).map((r) => ringPath(r, false)).join('');
if (rd) parts.push(`<path d="${rd}" fill="none" stroke="#6a4a8a" stroke-width="${lineW[2]}" stroke-dasharray="4 2"/>`);

let nb = 0;
if (!argv.includes('--no-buildings') && existsSync(`public/data/${city}/buildings.bin`)) {
  const buf = readFileSync(`public/data/${city}/buildings.bin`);
  const a = new Int16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2);
  let d = '';
  for (let i = 0; i < a.length; i += BUILDING_STRIDE) {
    const cx = a[i] * 2, cy = a[i + 1] * 2, w = a[i + 2] / 2, dd = a[i + 3] / 2, ang = a[i + 4] / 10000;
    if (cx < x0 - 200 || cx > x1 + 200 || cy < y0 - 200 || cy > y1 + 200) continue;
    const ux = Math.cos(ang), uy = Math.sin(ang);
    const c = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([p, q]) => [cx + (p * w * ux) / 2 - (q * dd * uy) / 2, cy + (p * w * uy) / 2 + (q * dd * ux) / 2]);
    d += `M${px(c[0][0])} ${py(c[0][1])}L${px(c[1][0])} ${py(c[1][1])}L${px(c[2][0])} ${py(c[2][1])}L${px(c[3][0])} ${py(c[3][1])}Z`;
    nb++;
  }
  if (d) parts.push(`<path d="${d}" fill="#3a3a48" fill-opacity="0.75"/>`);
}

const font = Math.max(9, Math.min(15, size / 140));
const colors: Record<string, string> = { city: '#000', borough: '#402060', neighborhood: '#333', water: '#0a3a80', park: '#1a5a1a', island: '#604020', airport: '#444' };
for (const l of geo.labels) {
  if (l.x < x0 || l.x > x1 || l.y < y0 || l.y > y1) continue;
  const fs = font * (l.rank <= 1 ? 1.5 : l.rank <= 3 ? 1.15 : 0.9);
  const text = l.text.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  parts.push(
    `<text x="${px(l.x)}" y="${py(l.y)}" font-family="Helvetica" font-size="${fs.toFixed(1)}" text-anchor="middle" fill="${colors[l.kind]}" stroke="#fff" stroke-width="2.5" paint-order="stroke">${text}<tspan font-size="${(fs * 0.6).toFixed(1)}"> ${l.rank}</tspan></text>`,
  );
}
parts.push('</svg>');

const svgPath = `${outDir}/${city}-${tag}.svg`;
writeFileSync(svgPath, parts.join('\n'));
console.log(`${svgPath}: ${(statSync(svgPath).size / 1e6).toFixed(1)} MB, ${nb} buildings drawn`);
execFileSync('qlmanage', ['-t', '-s', String(size), '-o', outDir, svgPath], { stdio: 'ignore' });
const png = `${outDir}/${city}-${tag}.png`;
renameSync(`${svgPath}.png`, png);
console.log(png);
