// Dev tool: a tiny transit-map silhouette per city (its lines in their real colors) for the city picker.
// Reads public/data/<city>/transit.json and writes public/thumbs/<city>.svg (a few KB each).
// usage: npx tsx scripts/dev/network-icons.ts [city ...]
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { CITY_ORDER } from '../../shared/cities.ts';
import type { TransitData } from '../../shared/types.ts';

const ROOT = resolve(import.meta.dirname, '..', '..');
const OUT = join(ROOT, 'public', 'thumbs');
const W = 120;
const H = 72;
const PAD = 5;
mkdirSync(OUT, { recursive: true });

/** Douglas–Peucker on a flat [x, y, ...] list. */
function simplify(pts: number[], tol: number): number[] {
  const n = pts.length / 2;
  if (n < 3) return pts;
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const stack: [number, number][] = [[0, n - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const ax = pts[a * 2], ay = pts[a * 2 + 1], bx = pts[b * 2], by = pts[b * 2 + 1];
    const dx = bx - ax, dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;
    let far = -1, fd = tol;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((pts[i * 2] - ax) * dy - (pts[i * 2 + 1] - ay) * dx) / len;
      if (d > fd) (fd = d), (far = i);
    }
    if (far >= 0) {
      keep[far] = 1;
      stack.push([a, far], [far, b]);
    }
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(pts[i * 2], pts[i * 2 + 1]);
  return out;
}

const quantile = (xs: number[], q: number) => xs[Math.min(xs.length - 1, Math.max(0, Math.floor(q * (xs.length - 1))))];

const cities = process.argv.slice(2).length ? process.argv.slice(2) : CITY_ORDER;
for (const c of cities) {
  const f = join(ROOT, 'public', 'data', c, 'transit.json');
  if (!existsSync(f)) continue;
  const t = JSON.parse(readFileSync(f, 'utf8')) as TransitData;
  const color = new Map(t.lines.map((l) => [l.id, l.color]));
  const kind = new Map(t.lines.map((l) => [l.id, l.kind]));
  // Frame the network's core: trim the far 3% of stations on each side so one long branch doesn't shrink the rest.
  const xs = t.stations.map((s) => s.x).sort((a, b) => a - b);
  const ys = t.stations.map((s) => s.y).sort((a, b) => a - b);
  const [x0, x1, y0, y1] = [quantile(xs, 0.03), quantile(xs, 0.97), quantile(ys, 0.03), quantile(ys, 0.97)];
  const k = Math.min((W - PAD * 2) / Math.max(1, x1 - x0), (H - PAD * 2) / Math.max(1, y1 - y0));
  const ox = (W - (x1 - x0) * k) / 2;
  const oy = (H - (y1 - y0) * k) / 2;
  const px = (x: number) => Math.round((ox + (x - x0) * k) * 2) / 2;
  const py = (y: number) => Math.round((H - oy - (y - y0) * k) * 2) / 2;
  // Trams and light rail first and thinner; metro and heavy rail on top.
  const heavy = (id: string) => !/tram|light|funicular|cable|monorail/i.test(kind.get(id) ?? '');
  const segs = [...t.segments].sort((a, b) => Number(heavy(a.lines[0])) - Number(heavy(b.lines[0])));
  // One path per color and weight: segments join into polylines, simplified to ~1 px and snapped to half pixels.
  const groups = new Map<string, string>();
  for (const seg of segs) {
    const p = simplify(seg.pts, 1.1 / k);
    let d = '';
    let last = '';
    for (let i = 0; i < p.length; i += 2) {
      const pt = `${px(p[i])} ${py(p[i + 1])}`;
      if (pt === last) continue;
      d += `${d ? 'L' : 'M'}${pt}`;
      last = pt;
    }
    if (!d.includes('L')) continue;
    const key = `${color.get(seg.lines[0]) ?? '#888'}|${heavy(seg.lines[0]) ? 2.2 : 1.2}`;
    groups.set(key, (groups.get(key) ?? '') + d);
  }
  const paths = [...groups].map(([key, d]) => {
    const [col, w] = key.split('|');
    return `<path d="${d}" stroke="${col}" stroke-width="${w}"/>`;
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" fill="none" stroke-linecap="round" stroke-linejoin="round">${paths.join('')}</svg>`;
  const out = join(OUT, `${c}.svg`);
  writeFileSync(out, svg);
  console.log(`${c}.svg ${(statSync(out).size / 1024).toFixed(1)} KB`);
}
