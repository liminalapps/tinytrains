import type { Polygon } from '../../shared/types.ts';

export interface Grid {
  w: number;
  h: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  /** meters per cell */
  cell: number;
}

export function makeGrid(b: { minX: number; minY: number; maxX: number; maxY: number }, maxCells: number): Grid {
  const W = b.maxX - b.minX;
  const H = b.maxY - b.minY;
  const cell = Math.max(W, H) / maxCells;
  return { w: Math.ceil(W / cell), h: Math.ceil(H / cell), cell, ...b };
}

/** Rasterize polygons (even-odd holes) into a 0/1 mask using a canvas. */
export function rasterize(grid: Grid, polys: Polygon[]): Uint8Array {
  const c = new OffscreenCanvas(grid.w, grid.h);
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff';
  const sx = 1 / grid.cell;
  for (const poly of polys) {
    g.beginPath();
    for (const ring of poly) {
      for (let i = 0; i < ring.length; i += 2) {
        const x = (ring[i] - grid.minX) * sx;
        const y = (grid.maxY - ring[i + 1]) * sx;
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.closePath();
    }
    g.fill('evenodd');
  }
  const data = g.getImageData(0, 0, grid.w, grid.h).data;
  const out = new Uint8Array(grid.w * grid.h);
  for (let i = 0; i < out.length; i++) out[i] = data[i * 4 + 3] > 127 ? 1 : 0;
  return out;
}

/** 1D squared distance transform (Felzenszwalb & Huttenlocher). */
function edt1d(f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array) {
  let k = 0;
  v[0] = 0;
  z[0] = -Infinity;
  z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
  }
}

/** Euclidean distance (in cells) from each cell to the nearest cell where mask === target. */
function edt(mask: Uint8Array, w: number, h: number, target: number): Float32Array {
  const INF = 1e20;
  const n = Math.max(w, h);
  const f = new Float64Array(n);
  const d = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  const grid = new Float64Array(w * h);
  for (let i = 0; i < w * h; i++) grid[i] = mask[i] === target ? 0 : INF;
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = grid[y * w + x];
    edt1d(f, h, d, v, z);
    for (let y = 0; y < h; y++) grid[y * w + x] = d[y];
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = grid[y * w + x];
    edt1d(f, w, d, v, z);
    for (let x = 0; x < w; x++) grid[y * w + x] = d[x];
  }
  const out = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = Math.sqrt(grid[i]);
  return out;
}

/** Signed distance in meters: positive over land, negative over water. */
export function signedDistance(grid: Grid, water: Uint8Array): Float32Array {
  const toWater = edt(water, grid.w, grid.h, 1);
  const toLand = edt(water, grid.w, grid.h, 0);
  const out = new Float32Array(grid.w * grid.h);
  for (let i = 0; i < out.length; i++) out[i] = (water[i] ? -(toLand[i] - 0.5) : toWater[i] - 0.5) * grid.cell;
  return out;
}

export function sampleMask(grid: Grid, mask: Uint8Array, x: number, y: number): number {
  const i = Math.floor((x - grid.minX) / grid.cell);
  const j = Math.floor((grid.maxY - y) / grid.cell);
  if (i < 0 || j < 0 || i >= grid.w || j >= grid.h) return 0;
  return mask[j * grid.w + i];
}

/** Seeded PRNG. */
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}
