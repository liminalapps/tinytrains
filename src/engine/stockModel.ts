import * as THREE from 'three';
import { LOOK_PARS, lookUniforms } from '../themes/look.ts';
import type { StockSpec, StockStripe } from '../../shared/types.ts';

// Procedural rolling stock: a lofted body from a cross-section profile, a hand-painted livery atlas
// (canvas), an emissive atlas for lit windows and headlights, plus bogies and roof gear.
// Local frame: +x = forward (cab nose), y = up from the rail head, z = lateral.

const AW = 1024;
const AH = 512;
const PAD = 3;

export type CarVariant = 'cab' | 'cabP' | 'mid' | 'midP' | 'solo' | 'soloP';

export interface CarModel {
  spec: StockSpec;
  /** Length of one rendered body (a car, or one section of an articulated vehicle). */
  bodyLength: number;
  height: number;
  width: number;
  material: THREE.MeshLambertMaterial;
  geometry(v: CarVariant): THREE.BufferGeometry;
}

// ---------------------------------------------------------------------------
// Atlas regions (canvas pixel rects)
// ---------------------------------------------------------------------------
const R_SIDE_MID = { x: 0, y: 0, w: AW, h: 128 };
const R_SIDE_CAB = { x: 0, y: 128, w: AW, h: 128 };
const R_FRONT = { x: 0, y: 256, w: 384, h: 128 };
const R_REAR = { x: 384, y: 256, w: 384, h: 128 };
const R_ROOF = { x: 0, y: 384, w: AW, h: 128 };
type Rect = typeof R_SIDE_MID;
enum Sw {
  Under = 0,
  Bogie = 1,
  Metal = 2,
  RoofGear = 3,
  Glass = 4,
  White = 5,
  Body = 6,
  Line = 7,
}
function swatchRect(i: Sw): Rect {
  return { x: 768 + (i % 4) * 64, y: 256 + Math.floor(i / 4) * 64, w: 64, h: 64 };
}

/** Atlas UV for a point (s: 0..1 left→right, t: 0..1 bottom→top) inside a rect. */
function uvIn(r: Rect, s: number, t: number): [number, number] {
  const px = r.x + PAD + s * (r.w - 2 * PAD);
  const py = r.y + PAD + (1 - t) * (r.h - 2 * PAD);
  return [px / AW, 1 - py / AH];
}
function swUV(i: Sw): [number, number] {
  return uvIn(swatchRect(i), 0.5, 0.5);
}

// ---------------------------------------------------------------------------
// Cross-section profiles
// ---------------------------------------------------------------------------
interface SecPt {
  z: number;
  y: number;
  region: 'bottom' | 'side' | 'roof';
}

interface Dims {
  L: number;
  W: number;
  H: number;
  hw: number;
  yb: number; // body bottom
  yWin0: number; // window band (fractions of side height)
  yWin1: number;
  noseLen: number;
}

function dimsFor(spec: StockSpec, L: number): Dims {
  const W = spec.width;
  const H = spec.height;
  const hw = W / 2;
  let yb = 0.95;
  let yWin0 = 0.46;
  let yWin1 = 0.84;
  switch (spec.profile) {
    case 'tube':
      yb = 0.32;
      yWin0 = 0.4;
      yWin1 = 0.9;
      break;
    case 'bilevel':
      yb = 0.45;
      yWin0 = 0.14;
      yWin1 = 0.84;
      break;
    case 'tram':
      yb = 0.3;
      yWin0 = 0.38;
      yWin1 = 0.88;
      break;
    case 'streetcar':
      yb = 0.55;
      yWin0 = 0.45;
      yWin1 = 0.86;
      break;
    case 'cablecar':
      yb = 0.6;
      yWin0 = 0.42;
      yWin1 = 0.9;
      break;
    case 'monorail':
      yb = -1.0;
      yWin0 = 0.5;
      yWin1 = 0.86;
      break;
    case 'agt':
      yb = 0.55;
      yWin0 = 0.42;
      yWin1 = 0.88;
      break;
    case 'rounded':
      yb = 0.95;
      yWin0 = 0.44;
      yWin1 = 0.84;
      break;
  }
  const noseLen = spec.nose === 'bullet' ? Math.min(6, L * 0.3) : spec.nose === 'slant' ? 1.6 : spec.nose === 'rounded' ? 1.4 : 0.5;
  return { L, W, H, hw, yb, yWin0, yWin1, noseLen };
}

/** Right half of the section, bottom center → top center. */
function sectionHalf(spec: StockSpec, d: Dims): SecPt[] {
  const { hw, H, yb } = d;
  const pts: SecPt[] = [];
  const add = (z: number, y: number, region: SecPt['region']) => {
    const last = pts[pts.length - 1];
    if (last && Math.abs(last.z - z) < 1e-4 && Math.abs(last.y - y) < 1e-4) return;
    pts.push({ z, y, region });
  };
  add(0, yb, 'bottom');
  add(hw - 0.1, yb, 'bottom');
  const arc = (cz: number, cy: number, rz: number, ry: number, a0: number, a1: number, n: number, region: (i: number) => SecPt['region']) => {
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      add(cz + Math.cos(a) * rz, cy + Math.sin(a) * ry, region(i));
    }
  };
  switch (spec.profile) {
    case 'tube': {
      const ys = yb + (H - yb) * 0.34;
      add(hw, yb + 0.1, 'side');
      add(hw, ys, 'side');
      // Round tube-shaped upper body: windows curve up into the roof.
      arc(0, ys, hw, H - ys, 0, Math.PI / 2, 9, (i) => (i <= 5 ? 'side' : 'roof'));
      break;
    }
    case 'cablecar': {
      const ys = H - 0.45;
      add(hw, yb + 0.1, 'side');
      add(hw, ys, 'side');
      add(hw + 0.22, ys + 0.04, 'roof');
      add(hw + 0.22, ys + 0.14, 'roof');
      add(hw * 0.62, H - 0.18, 'roof');
      add(hw * 0.55, H, 'roof');
      add(0, H, 'roof');
      break;
    }
    case 'streetcar': {
      const ys = H - 0.55;
      add(hw, yb + 0.1, 'side');
      add(hw, ys, 'side');
      arc(0, ys, hw, H - ys, 0, Math.PI / 2, 6, (i) => (i === 0 ? 'side' : 'roof'));
      break;
    }
    case 'monorail': {
      const ys = H - 0.5;
      add(hw * 0.92, yb + 0.05, 'side');
      add(hw, yb + 0.6, 'side');
      add(hw, ys, 'side');
      arc(0, ys, hw, H - ys, 0, Math.PI / 2, 6, (i) => (i === 0 ? 'side' : 'roof'));
      break;
    }
    case 'rounded':
    case 'agt': {
      const ys = H - 0.55;
      add(hw * 0.97, yb + 0.12, 'side');
      add(hw, yb + (ys - yb) * 0.45, 'side');
      add(hw * 0.985, ys, 'side');
      arc(0, ys, hw * 0.985, H - ys, 0, Math.PI / 2, 6, (i) => (i === 0 ? 'side' : 'roof'));
      break;
    }
    default: {
      // box, bilevel, tram
      const ys = H - 0.32;
      add(hw, yb + 0.08, 'side');
      add(hw, ys, 'side');
      arc(0, ys, hw, H - ys, 0, Math.PI / 2, 4, (i) => (i === 0 ? 'side' : 'roof'));
    }
  }
  return pts;
}

/** How far a point of the nose is pulled back from the tip (meters), by nose style. */
function pullback(spec: StockSpec, d: Dims, y: number, z: number): number {
  const zn = Math.min(1, Math.abs(z) / d.hw);
  const win = d.yb + (d.H - d.yb) * d.yWin0;
  const up = THREE.MathUtils.clamp((y - win) / (d.H - win), 0, 1);
  const lowCorner = THREE.MathUtils.clamp((d.yb + 0.5 - y) / 0.5, 0, 1);
  switch (spec.nose) {
    case 'slant':
      return 1.15 * Math.pow(up, 1.1) + 0.35 * Math.pow(zn, 3) + 0.15 * lowCorner;
    case 'rounded':
      return 0.95 * zn * zn + 0.3 * up * up + 0.1 * lowCorner;
    case 'bullet':
      return d.noseLen * (0.85 * zn * zn + 0.55 * Math.pow(up, 1.5)) + 0.2 * lowCorner;
    default:
      return 0.14 * Math.pow(zn, 6) + 0.08 * Math.pow(up, 4);
  }
}

// ---------------------------------------------------------------------------
// Geometry builder
// ---------------------------------------------------------------------------
class Builder {
  pos: number[] = [];
  uv: number[] = [];
  idx: number[] = [];
  vert(x: number, y: number, z: number, u: number, v: number) {
    this.pos.push(x, y, z);
    this.uv.push(u, v);
    return this.pos.length / 3 - 1;
  }
  tri(a: number, b: number, c: number) {
    this.idx.push(a, b, c);
  }
  quad(a: number, b: number, c: number, d: number) {
    this.idx.push(a, b, c, a, c, d);
  }
  /** Axis-aligned box (optionally rotated about z by `pitch`) in one swatch color. */
  box(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, sw: Sw, pitch = 0) {
    const [u, v] = swUV(sw);
    const c = Math.cos(pitch);
    const s = Math.sin(pitch);
    const P = (x: number, y: number, z: number): [number, number, number] => [cx + x * c - y * s, cy + x * s + y * c, cz + z];
    const hx = sx / 2;
    const hy = sy / 2;
    const hz = sz / 2;
    const faces: [number, number, number][][] = [
      [P(hx, -hy, -hz), P(hx, hy, -hz), P(hx, hy, hz), P(hx, -hy, hz)],
      [P(-hx, -hy, hz), P(-hx, hy, hz), P(-hx, hy, -hz), P(-hx, -hy, -hz)],
      [P(-hx, hy, -hz), P(-hx, hy, hz), P(hx, hy, hz), P(hx, hy, -hz)],
      [P(-hx, -hy, hz), P(-hx, -hy, -hz), P(hx, -hy, -hz), P(hx, -hy, hz)],
      [P(-hx, -hy, hz), P(hx, -hy, hz), P(hx, hy, hz), P(-hx, hy, hz)],
      [P(hx, -hy, -hz), P(-hx, -hy, -hz), P(-hx, hy, -hz), P(hx, hy, -hz)],
    ];
    for (const f of faces) {
      const i = f.map((p) => this.vert(p[0], p[1], p[2], u, v));
      this.quad(i[0], i[1], i[2], i[3]);
    }
  }
  /** A thin rod between two points (square cross-section). */
  rod(a: THREE.Vector3, b: THREE.Vector3, r: number, sw: Sw) {
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const len = a.distanceTo(b);
    const pitch = Math.atan2(b.y - a.y, b.x - a.x);
    this.box(mid.x, mid.y, mid.z, len, r, r, sw, pitch);
  }
  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}

function buildGeometry(spec: StockSpec, d: Dims, variant: CarVariant): THREE.BufferGeometry {
  const b = new Builder();
  const { L, H, hw, yb } = d;
  const noseFront = variant !== 'mid' && variant !== 'midP';
  const noseRear = variant === 'solo' || variant === 'soloP';
  const withPanto = variant.endsWith('P');
  const half = sectionHalf(spec, d);
  // Full ring: right half (z >= 0) then mirrored left half, both bottom → top.
  const left = half.map((p) => ({ ...p, z: -p.z }));

  // Ring stations along x.
  const xs: number[] = [];
  const nN = spec.nose === 'flat' ? 3 : 7;
  const front = L / 2;
  const back = -L / 2;
  const nl = Math.min(d.noseLen, L * 0.3);
  if (noseRear) for (let i = 0; i < nN; i++) xs.push(back + (nl * i) / nN);
  else xs.push(back, back + 0.25);
  if (noseFront) for (let i = nN; i >= 0; i--) xs.push(front - (nl * i) / nN);
  else xs.push(front - 0.25, front);
  xs.sort((a, c) => a - c);
  const uniq = xs.filter((x, i) => i === 0 || x - xs[i - 1] > 1e-3);

  // The pullback must stay under ~0.66·nl for x - P·smoothstep(x) to remain monotonic (no folded
  // triangles); bullet noses use a linear ramp instead, which stays monotonic up to P < nl.
  const linearNose = spec.nose === 'bullet';
  const pull = (y: number, z: number) => Math.min(pullback(spec, d, y, z), nl * (linearNose ? 0.92 : 0.62));
  const ramp = (t: number) => (linearNose ? THREE.MathUtils.clamp(t, 0, 1) : THREE.MathUtils.smoothstep(t, 0, 1));
  const deform = (x: number, y: number, z: number) => {
    let dx = 0;
    if (noseFront && x > front - nl - 1e-6) {
      const w = ramp((x - (front - nl)) / nl);
      dx -= pull(y, z) * w;
    } else if (!noseFront && x > front - 0.3) {
      dx -= 0.06 * Math.pow(Math.min(1, Math.abs(z) / hw), 6) * ((x - (front - 0.3)) / 0.3);
    }
    if (noseRear && x < back + nl + 1e-6) {
      const w = ramp((back + nl - x) / nl);
      dx += pull(y, z) * w;
    } else if (!noseRear && x < back + 0.3) {
      dx += 0.06 * Math.pow(Math.min(1, Math.abs(z) / hw), 6) * (((back + 0.3) - x) / 0.3);
    }
    return x + dx;
  };

  const sideRect = noseFront ? R_SIDE_CAB : R_SIDE_MID;
  // Side v: fraction of side height, from the body bottom to the top of the 'side' region.
  const sideTop = Math.max(...half.filter((p) => p.region === 'side').map((p) => p.y));
  const roofPts = half.filter((p) => p.region === 'roof');
  const roofSpan = roofPts.length ? Math.max(...roofPts.map((p) => Math.abs(p.z))) : hw;

  const strip = (pts: SecPt[], mirror: boolean) => {
    // Edge k→k+1 takes the region of its upper point. Contiguous runs of one region get their
    // own vertices so UVs don't smear across region seams.
    let k0 = 0;
    while (k0 < pts.length - 1) {
      const region = pts[k0 + 1].region;
      let k1 = k0 + 1;
      while (k1 < pts.length - 1 && pts[k1 + 1].region === region) k1++;
      const run = pts.slice(k0, k1 + 1);
      const rows: number[][] = [];
      for (const x of uniq) {
        const row: number[] = [];
        const s = (x - back) / L;
        for (const p of run) {
          let u: number;
          let v: number;
          if (region === 'side') [u, v] = uvIn(sideRect, s, THREE.MathUtils.clamp((p.y - yb) / (sideTop - yb), 0, 1));
          else if (region === 'roof') [u, v] = uvIn(R_ROOF, s, THREE.MathUtils.clamp(0.5 + (p.z / roofSpan) * 0.5, 0, 1));
          else [u, v] = swUV(Sw.Under);
          row.push(b.vert(deform(x, p.y, p.z), p.y, p.z, u, v));
        }
        rows.push(row);
      }
      for (let r = 0; r < rows.length - 1; r++) {
        for (let k = 0; k < run.length - 1; k++) {
          const a = rows[r][k];
          const c = rows[r][k + 1];
          const e = rows[r + 1][k + 1];
          const f = rows[r + 1][k];
          if (mirror) b.quad(a, c, e, f);
          else b.quad(a, f, e, c);
        }
      }
      k0 = k1;
    }
  };
  strip(half, false);
  strip(left, true);

  // End caps (fan). Front: +x face; rear: -x face.
  const ring = [...half, ...left.slice().reverse()];
  const cap = (x: number, isFront: boolean, face: Rect) => {
    const cy = (yb + H) / 2;
    const tFace = (y: number) => THREE.MathUtils.clamp((y - yb) / (H - yb), 0, 1);
    const sFace = (z: number) => (isFront ? 0.5 - z / d.W : 0.5 + z / d.W);
    const [cu, cv] = uvIn(face, 0.5, tFace(cy));
    const c = b.vert(deform(x, cy, 0), cy, 0, cu, cv);
    const ids = ring.map((p) => {
      const [u, v] = uvIn(face, sFace(p.z), tFace(p.y));
      return b.vert(deform(x, p.y, p.z), p.y, p.z, u, v);
    });
    for (let i = 0; i < ids.length - 1; i++) {
      if (isFront) b.tri(c, ids[i + 1], ids[i]);
      else b.tri(c, ids[i], ids[i + 1]);
    }
  };
  cap(front, true, noseFront ? R_FRONT : R_REAR);
  cap(back, false, noseRear ? R_FRONT : R_REAR);

  // Underframe and bogies.
  if (spec.profile !== 'monorail') {
    const uy0 = spec.profile === 'tram' ? 0.15 : 0.3;
    if (yb - uy0 > 0.05) b.box(0, (yb + uy0) / 2, 0, L * 0.72, yb - uy0, hw * 1.6, Sw.Under);
    const bogieX = spec.profile === 'tram' || spec.profile === 'streetcar' || spec.profile === 'cablecar' ? L * 0.3 : L / 2 - Math.min(2.6, L * 0.14);
    for (const bx of [-bogieX, bogieX]) {
      b.box(bx, 0.42, 0, 2.4, 0.62, hw * 1.55, Sw.Bogie);
      for (const wz of [-hw * 0.72, hw * 0.72]) {
        b.box(bx - 0.75, 0.38, wz, 0.72, 0.72, 0.14, Sw.Bogie);
        b.box(bx + 0.75, 0.38, wz, 0.72, 0.72, 0.14, Sw.Bogie);
      }
    }
  } else {
    b.box(0, yb - 0.1, 0, L * 0.9, 0.3, hw * 1.2, Sw.Under);
  }

  // Roof gear.
  const roofY = H;
  if (spec.profile === 'box' || spec.profile === 'rounded' || spec.profile === 'bilevel' || spec.profile === 'agt') {
    const n = L > 17 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const x = n === 1 ? 0 : (i === 0 ? -1 : 1) * L * 0.22;
      b.box(x, roofY + 0.12, 0, Math.min(3.2, L * 0.16), 0.34, hw * 1.05, Sw.RoofGear);
    }
  } else if (spec.profile === 'tram' || spec.profile === 'streetcar') {
    b.box(-L * 0.12, roofY + 0.14, 0, L * 0.3, 0.3, hw * 1.2, Sw.RoofGear);
  }
  if (withPanto && spec.pantograph) {
    const px = spec.profile === 'tram' ? 0 : L * 0.3;
    b.box(px, roofY + 0.14, 0, 1.4, 0.2, 1.4, Sw.RoofGear);
    // Single-arm pantograph.
    const base = new THREE.Vector3(px - 0.6, roofY + 0.25, 0);
    const knee = new THREE.Vector3(px + 0.9, roofY + 0.85, 0);
    const head = new THREE.Vector3(px - 0.1, roofY + 1.55, 0);
    for (const z of [-0.35, 0.35]) {
      b.rod(base.clone().setZ(z), knee.clone().setZ(z * 0.6), 0.08, Sw.Metal);
      b.rod(knee.clone().setZ(z * 0.6), head.clone().setZ(z * 0.2), 0.07, Sw.Metal);
    }
    b.box(head.x, head.y + 0.03, 0, 0.18, 0.08, 1.7, Sw.Metal);
  }
  if (spec.trolleyPole && (variant === 'solo' || variant === 'soloP' || variant === 'cab' || variant === 'cabP')) {
    const base = new THREE.Vector3(-L * 0.12, roofY + 0.25, 0);
    const tip = new THREE.Vector3(-L * 0.5 - 1.2, roofY + 2.3, 0);
    b.box(base.x, roofY + 0.14, 0, 0.8, 0.22, 0.8, Sw.Metal);
    b.rod(base, tip, 0.09, Sw.Bogie);
  }
  if (spec.profile === 'cablecar') {
    // Grip-man's lever and the bell up front.
    b.box(L * 0.18, roofY + 0.2, 0, 0.5, 0.35, 0.5, Sw.Metal);
  }
  return b.build();
}

// ---------------------------------------------------------------------------
// Livery painting
// ---------------------------------------------------------------------------
function hexA(hex: string, a: number) {
  const c = new THREE.Color(hex);
  return `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${a})`;
}

function shade(hex: string, k: number) {
  const c = new THREE.Color(hex);
  if (k > 0) c.lerp(new THREE.Color('#ffffff'), k);
  else c.lerp(new THREE.Color('#000000'), -k);
  return '#' + c.getHexString();
}

interface Painter {
  g: CanvasRenderingContext2D;
  e: CanvasRenderingContext2D;
}

/** Fill a sub-rect of a region: s0..s1 horizontally, t0..t1 bottom→top. */
function frect(g: CanvasRenderingContext2D, r: Rect, s0: number, s1: number, t0: number, t1: number, fill: string, radius = 0) {
  const x0 = r.x + s0 * r.w;
  const x1 = r.x + s1 * r.w;
  const y0 = r.y + (1 - t1) * r.h;
  const y1 = r.y + (1 - t0) * r.h;
  g.fillStyle = fill;
  if (radius > 0) {
    g.beginPath();
    g.roundRect(x0, y0, x1 - x0, y1 - y0, radius);
    g.fill();
  } else g.fillRect(x0, y0, x1 - x0, y1 - y0);
}

/** Clear a band so the shader substitutes the line color (alpha 0 = line color). */
function lineBand(g: CanvasRenderingContext2D, r: Rect, s0: number, s1: number, t0: number, t1: number) {
  g.save();
  g.globalCompositeOperation = 'destination-out';
  frect(g, r, s0, s1, t0, t1, '#000');
  g.restore();
}

function band(g: CanvasRenderingContext2D, r: Rect, st: StockStripe, s0 = 0, s1 = 1) {
  if (st.color === 'line') lineBand(g, r, s0, s1, st.from, st.to);
  else frect(g, r, s0, s1, st.from, st.to, st.color);
}

function paintBody(g: CanvasRenderingContext2D, r: Rect, spec: StockSpec) {
  frect(g, r, 0, 1, 0, 1, spec.body);
  if (spec.finish === 'stainless') {
    // Brushed / fluted stainless: fine vertical streaks and a sky-lit gradient.
    const grad = g.createLinearGradient(0, r.y, 0, r.y + r.h);
    grad.addColorStop(0, 'rgba(255,255,255,0.28)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0)');
    grad.addColorStop(1, 'rgba(40,50,70,0.12)');
    g.fillStyle = grad;
    g.fillRect(r.x, r.y, r.w, r.h);
    for (let x = r.x; x < r.x + r.w; x += 3) {
      g.fillStyle = (x / 3) % 2 ? 'rgba(255,255,255,0.10)' : 'rgba(60,70,90,0.08)';
      g.fillRect(x, r.y, 1, r.h);
    }
  } else {
    const grad = g.createLinearGradient(0, r.y, 0, r.y + r.h);
    grad.addColorStop(0, 'rgba(255,255,255,0.14)');
    grad.addColorStop(1, 'rgba(0,0,0,0.06)');
    g.fillStyle = grad;
    g.fillRect(r.x, r.y, r.w, r.h);
  }
}

function glass(p: Painter, r: Rect, s0: number, s1: number, t0: number, t1: number, spec: StockSpec, lit = 1, radius = 3) {
  const wc = spec.windowColor ?? '#2b3950';
  frect(p.g, r, s0, s1, t0, t1, wc, radius);
  // Glassy highlight streak.
  const g = p.g;
  g.save();
  g.beginPath();
  const x0 = r.x + s0 * r.w;
  const x1 = r.x + s1 * r.w;
  const y0 = r.y + (1 - t1) * r.h;
  const y1 = r.y + (1 - t0) * r.h;
  g.rect(x0, y0, x1 - x0, y1 - y0);
  g.clip();
  g.fillStyle = 'rgba(190,230,255,0.28)';
  g.beginPath();
  const w = x1 - x0;
  g.moveTo(x0 + w * 0.15, y1);
  g.lineTo(x0 + w * 0.4, y0);
  g.lineTo(x0 + w * 0.55, y0);
  g.lineTo(x0 + w * 0.3, y1);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.12)';
  g.fillRect(x0, y0, w, (y1 - y0) * 0.22);
  g.restore();
  if (lit > 0) frect(p.e, r, s0, s1, t0, t1, `rgba(255,214,140,${lit})`, radius);
}

interface SideLayout {
  doors: [number, number][]; // s ranges
  windows: [number, number][];
}

function sideLayout(spec: StockSpec, L: number, cab: 'none' | 'front' | 'both'): SideLayout {
  const n = Math.max(1, spec.doors);
  const doorW = Math.min(1.5, L / (n * 2.6)) / L;
  const cabLen = cab === 'none' ? 0 : Math.min(2.2, L * 0.12) / L;
  const endM = Math.max(0.05, 1.1 / L);
  const lo = cab === 'both' ? cabLen + endM * 0.6 : endM;
  const hi = cab === 'none' ? 1 - endM : 1 - cabLen - endM * 0.6;
  const doors: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const c = n === 1 ? (lo + hi) / 2 : lo + doorW / 2 + ((hi - lo - doorW) * i) / (n - 1);
    doors.push([c - doorW / 2, c + doorW / 2]);
  }
  const windows: [number, number][] = [];
  const edges = [lo - endM * 0.6, ...doors.flat(), hi + endM * 0.6];
  for (let i = 0; i < edges.length; i += 2) {
    const a = edges[i] + 0.012;
    const b2 = edges[i + 1] - 0.012;
    if (b2 - a < 0.02) continue;
    // Split long gaps into panes.
    const panes = Math.max(1, Math.round(((b2 - a) * L) / 1.9));
    const pw = (b2 - a) / panes;
    for (let k = 0; k < panes; k++) windows.push([a + k * pw + 0.004, a + (k + 1) * pw - 0.004]);
  }
  return { doors, windows };
}

function paintSide(p: Painter, r: Rect, spec: StockSpec, d: Dims, cab: 'none' | 'front' | 'both') {
  const { g } = p;
  paintBody(g, r, spec);
  const lay = sideLayout(spec, d.L, cab);
  const w0 = d.yWin0;
  const w1 = d.yWin1;
  if (spec.skirt) frect(g, r, 0, 1, 0, 0.1, spec.skirt);
  for (const st of spec.stripes ?? []) band(g, r, st);
  if (spec.pattern === 'sinewave') {
    // Marunouchi Line: a white sine wave riding the belt line.
    g.save();
    g.strokeStyle = '#ffffff';
    g.lineWidth = r.h * 0.07;
    g.beginPath();
    for (let i = 0; i <= 200; i++) {
      const s = i / 200;
      const t = 0.3 + 0.07 * Math.sin(s * Math.PI * 2 * 5);
      const x = r.x + s * r.w;
      const y = r.y + (1 - t) * r.h;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
    g.restore();
  }
  if (spec.endBand) {
    const bw = Math.min(0.2, spec.endBand.width / d.L);
    const cabW = cab === 'none' ? 0 : Math.min(2.2, d.L * 0.12) / d.L;
    const bandAt = (s0: number) => {
      const st = { color: spec.endBand!.color, from: 0.02, to: 0.97 };
      band(g, r, st, s0, s0 + bw);
    };
    bandAt(0.004);
    bandAt(cab === 'none' ? 1 - bw - 0.004 : 1 - cabW - bw - 0.004);
  }
  const doorTop = Math.min(0.93, w1 + 0.06);
  if (spec.profile === 'bilevel') {
    // Two rows of windows.
    for (const [a, b2] of lay.windows) {
      glass(p, r, a, b2, 0.1, 0.33, spec, 0.9);
      glass(p, r, a, b2, 0.52, 0.8, spec, 0.9);
    }
    for (const [a, b2] of lay.doors) {
      frect(g, r, a, b2, 0.02, 0.45, spec.doorColor, 2);
      glass(p, r, a + 0.006, b2 - 0.006, 0.2, 0.4, spec, 0.7, 2);
    }
  } else if (spec.profile === 'cablecar') {
    // Open-sided grip sections at the ends, enclosed cabin in the middle.
    frect(g, r, 0, 1, 0.0, 0.2, spec.skirt ?? shade(spec.body, -0.3));
    for (let i = 0; i < 8; i++) {
      const s0 = 0.28 + i * 0.056;
      glass(p, r, s0, s0 + 0.045, w0, w1, spec, 0.9, 2);
    }
    for (const [a, b2] of [
      [0.02, 0.25],
      [0.75, 0.98],
    ]) {
      frect(g, r, a, b2, 0.22, 0.95, shade(spec.body, -0.45));
      for (let k = 0; k < 5; k++) frect(g, r, a + (k * (b2 - a)) / 4 - 0.004, a + (k * (b2 - a)) / 4 + 0.004, 0.22, 0.95, spec.roof);
      frect(g, r, a, b2, 0.22, 0.3, spec.doorColor);
    }
    frect(g, r, 0, 1, 0.93, 1, spec.roof);
  } else {
    for (const [a, b2] of lay.windows) glass(p, r, a, b2, w0, w1, spec, 0.95);
    for (const [a, b2] of lay.doors) {
      frect(g, r, a, b2, 0.03, doorTop, spec.doorColor, 2);
      g.fillStyle = 'rgba(0,0,0,0.25)';
      const cx = r.x + ((a + b2) / 2) * r.w;
      g.fillRect(cx - 0.5, r.y + (1 - doorTop) * r.h, 1, (doorTop - 0.03) * r.h);
      const inset = (b2 - a) * 0.12;
      glass(p, r, a + inset, (a + b2) / 2 - inset * 0.5, w0 + 0.02, w1 - 0.02, spec, 0.8, 2);
      glass(p, r, (a + b2) / 2 + inset * 0.5, b2 - inset, w0 + 0.02, w1 - 0.02, spec, 0.8, 2);
    }
  }
  if (cab !== 'none') {
    // Cab: small driver's window at the nose end(s).
    const cw = Math.min(0.08, 1.3 / d.L);
    glass(p, r, 1 - cw - 0.012, 1 - 0.012, w0 + 0.04, w1, spec, 0.4);
    if (cab === 'both') glass(p, r, 0.012, 0.012 + cw, w0 + 0.04, w1, spec, 0.4);
  }
  // Roofline shadow and a thin rain gutter.
  frect(g, r, 0, 1, 0.965, 1, 'rgba(0,0,0,0.12)');
}

function paintFront(p: Painter, r: Rect, spec: StockSpec, d: Dims) {
  const { g, e } = p;
  paintBody(g, r, spec);
  const panoramic = spec.nose !== 'flat' || spec.profile === 'agt' || spec.profile === 'monorail';
  // Face mask.
  const faceInset = spec.finish === 'stainless' ? 0.06 : 0.0;
  frect(g, r, faceInset, 1 - faceInset, 0.12, 0.97, spec.front, 6);
  for (const st of spec.frontStripes ?? []) band(g, r, st);
  const w0 = Math.max(0.42, d.yWin0 + 0.02);
  const w1 = Math.min(0.9, d.yWin1 + 0.02);
  if (spec.profile === 'cablecar') {
    glass(p, r, 0.12, 0.88, w0, w1, spec, 0.7);
    frect(g, r, 0.47, 0.53, w0, w1, spec.body);
  } else if (panoramic) {
    glass(p, r, 0.1, 0.9, w0, w1, spec, 0.35, 8);
  } else {
    // Driver's window, center storm door, right window.
    glass(p, r, 0.08, 0.36, w0, w1, spec, 0.35, 4);
    frect(g, r, 0.4, 0.6, 0.12, w1 + 0.04, shade(spec.front, spec.front === '#000000' ? 0.15 : -0.12), 3);
    glass(p, r, 0.43, 0.57, w0 + 0.02, w1 - 0.02, spec, 0.35, 3);
    glass(p, r, 0.64, 0.92, w0, w1, spec, 0.35, 4);
  }
  // Destination sign with a route-color dot (alpha-cleared → line color in the shader).
  frect(g, r, 0.22, 0.78, w1 + 0.015, Math.min(0.97, w1 + 0.08), '#1a1a1a', 2);
  frect(e, r, 0.26, 0.6, w1 + 0.03, Math.min(0.955, w1 + 0.065), 'rgba(255,190,90,0.9)');
  g.save();
  g.globalCompositeOperation = 'destination-out';
  g.beginPath();
  const cx = r.x + 0.7 * r.w;
  const cy = r.y + (1 - (w1 + 0.048)) * r.h;
  g.ellipse(cx, cy, r.w * 0.035, r.h * 0.035, 0, 0, Math.PI * 2);
  g.fill();
  g.restore();
  // Headlights / taillights.
  for (const s of [0.16, 0.84]) {
    frect(g, r, s - 0.06, s + 0.06, 0.2, 0.3, '#fff8dc', 3);
    frect(e, r, s - 0.06, s + 0.06, 0.2, 0.3, '#ffffff', 3);
  }
  // Anticlimber / coupler shadow.
  frect(g, r, 0.12, 0.88, 0.0, 0.1, '#26282e');
}

function paintRear(p: Painter, r: Rect, spec: StockSpec) {
  paintBody(p.g, r, spec);
  frect(p.g, r, 0.32, 0.68, 0.0, 0.92, '#2a2c33', 6);
  frect(p.g, r, 0.38, 0.62, 0.05, 0.86, shade(spec.body, -0.25), 3);
  glass(p, r, 0.41, 0.59, 0.5, 0.8, spec, 0.4);
}

function paintRoof(p: Painter, r: Rect, spec: StockSpec) {
  frect(p.g, r, 0, 1, 0, 1, spec.roof);
  const g = p.g;
  for (let i = 1; i < 24; i++) {
    g.fillStyle = 'rgba(0,0,0,0.07)';
    g.fillRect(r.x + (i / 24) * r.w, r.y, 1.5, r.h);
  }
  frect(g, r, 0, 1, 0.42, 0.58, shade(spec.roof, 0.12));
}

function paintSwatches(p: Painter, spec: StockSpec) {
  const sw = (i: Sw, c: string) => {
    const r = swatchRect(i);
    p.g.fillStyle = c;
    p.g.fillRect(r.x, r.y, r.w, r.h);
  };
  sw(Sw.Under, '#3b3f48');
  sw(Sw.Bogie, '#24262c');
  sw(Sw.Metal, '#9aa3ad');
  sw(Sw.RoofGear, shade(spec.roof, -0.18));
  sw(Sw.Glass, spec.windowColor ?? '#2b3950');
  sw(Sw.White, '#ffffff');
  sw(Sw.Body, spec.body);
  lineBand(p.g, swatchRect(Sw.Line), 0, 1, 0, 1);
}

function makeAtlas(spec: StockSpec, d: Dims) {
  const c = document.createElement('canvas');
  c.width = AW;
  c.height = AH;
  const ce = document.createElement('canvas');
  ce.width = AW;
  ce.height = AH;
  const p: Painter = { g: c.getContext('2d')!, e: ce.getContext('2d')! };
  // Opaque everywhere first: alpha 0 means "line color", so only intended bands may be clear.
  p.g.fillStyle = spec.body;
  p.g.fillRect(0, 0, AW, AH);
  p.e.fillStyle = '#000';
  p.e.fillRect(0, 0, AW, AH);
  paintSide(p, R_SIDE_MID, spec, d, 'none');
  paintSide(p, R_SIDE_CAB, spec, d, 'front');
  paintFront(p, R_FRONT, spec, d);
  paintRear(p, R_REAR, spec);
  paintRoof(p, R_ROOF, spec);
  paintSwatches(p, spec);
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  map.premultiplyAlpha = false;
  const emissiveMap = new THREE.CanvasTexture(ce);
  emissiveMap.colorSpace = THREE.SRGBColorSpace;
  return { map, emissiveMap, canvas: c };
}

// ---------------------------------------------------------------------------
// Material: livery atlas where alpha = 0 picks up the per-instance line color.
// ---------------------------------------------------------------------------
export const trainUniforms = { uNight: { value: 0 }, uFar: { value: 0 }, uTime: { value: 0 } };

/** Per-instance display mode (the `aMode` instanced attribute). */
export const MODE = { normal: 0, selected: 1, lineFocus: 2, dimmed: 3 } as const;

/** Stencil: buildings write 1, trains write 0, the x-ray pass draws only over 1. */
export const OCCLUDER_STENCIL = {
  stencilWrite: true,
  stencilRef: 1,
  stencilFunc: THREE.AlwaysStencilFunc,
  stencilZPass: THREE.ReplaceStencilOp,
};
export const TRAIN_STENCIL = { ...OCCLUDER_STENCIL, stencilRef: 0 };
export const XRAY_STENCIL = {
  stencilWrite: true,
  stencilRef: 1,
  stencilFunc: THREE.EqualStencilFunc,
  stencilFail: THREE.KeepStencilOp,
  stencilZFail: THREE.KeepStencilOp,
  stencilZPass: THREE.KeepStencilOp,
};

function makeMaterial(map: THREE.Texture, emissiveMap: THREE.Texture) {
  const m = new THREE.MeshLambertMaterial({ map, emissiveMap, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 1, ...TRAIN_STENCIL });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uNight = trainUniforms.uNight;
    sh.uniforms.uFar = trainUniforms.uFar;
    sh.uniforms.uTime = trainUniforms.uTime;
    Object.assign(sh.uniforms, lookUniforms);
    // aMode: 0 normal, 1 selected, 2 on the focused line, 3 dimmed (another line is focused).
    // Geometry without the attribute (previews, portraits) reads the default 0.
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aMode;\nvarying float vMode;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMode = aMode;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform float uNight;\nuniform float uFar;\nuniform float uTime;\nvarying float vMode;\n${LOOK_PARS}`)
      .replace(
        '#include <map_fragment>',
        `#ifdef USE_MAP
  vec4 texel = texture2D( map, vMapUv );
  #ifdef USE_COLOR
    // Zoomed out, bodies brighten toward white so trains pop against the line bands.
    diffuseColor.rgb *= mix( vColor.rgb, mix(texel.rgb, vec3(1.0), uFar), texel.a );
  #else
    diffuseColor.rgb *= texel.rgb;
  #endif
#endif`,
      )
      .replace(
        '#include <color_fragment>',
        `float mSel = 1.0 - step(0.5, abs(vMode - 1.0));
        float mLine = 1.0 - step(0.5, abs(vMode - 2.0));
        float mDim = step(2.5, vMode);
        // Dimmed trains turn into pale gray toys so the focused line stands out.
        float lum = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(lum) * 0.55 + 0.25, mDim * 0.85);`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        totalEmissiveRadiance *= max(uNight, uLk_trainGlow * 0.8) * 1.35 * (1.0 - 0.85 * mDim);
        #ifdef USE_COLOR
          vec3 lineC = vColor.rgb;
        #else
          vec3 lineC = vec3(1.0);
        #endif
        // Highlighted trains glow: a line-colored rim plus self-illumination that grows after dark.
        float hi = mSel + 0.6 * mLine;
        float pulse = 0.85 + 0.15 * sin(uTime * 4.0);
        float rim = pow(1.0 - abs(normal.z), 2.0);
        totalEmissiveRadiance += (lineC * 0.7 + 0.3) * rim * hi * pulse * (0.9 + 1.8 * uNight);
        totalEmissiveRadiance += (diffuseColor.rgb * 0.8 + lineC * 0.25) * hi * (0.12 + 0.95 * uNight);
        // Glowing styles (neon): every train carries a soft line-colored light.
        totalEmissiveRadiance += (lineC * 0.65 + 0.12) * uLk_trainGlow * (0.3 + 0.7 * rim) * (1.0 - 0.8 * mDim);`,
      );
  };
  m.customProgramCacheKey = () => 'train-livery';
  return m;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
const cache = new Map<string, CarModel>();

export function carModel(spec: StockSpec): CarModel {
  const hit = cache.get(spec.id);
  if (hit) return hit;
  const sections = Math.max(1, spec.sections ?? 1);
  const L = spec.length / sections;
  const d = dimsFor(spec, L);
  const { map, emissiveMap } = makeAtlas(spec, d);
  const material = makeMaterial(map, emissiveMap);
  const geos = new Map<CarVariant, THREE.BufferGeometry>();
  const model: CarModel = {
    spec,
    bodyLength: L,
    height: spec.height,
    width: spec.width,
    material,
    geometry(v) {
      let g = geos.get(v);
      if (!g) {
        g = buildGeometry(spec, d, v);
        geos.set(v, g);
      }
      return g;
    },
  };
  cache.set(spec.id, model);
  return model;
}

export interface ConsistBody {
  variant: CarVariant;
  flip: boolean; // true = nose points backward (trailing cab)
}

/** Which body variant sits at each position of a train, front to back. */
export function consist(spec: StockSpec, cars: number): ConsistBody[] {
  const out: ConsistBody[] = [];
  const sections = Math.max(1, spec.sections ?? 1);
  const P = spec.pantograph;
  if (spec.profile === 'cablecar' || spec.profile === 'streetcar' || (cars <= 1 && sections === 1)) {
    for (let i = 0; i < Math.max(1, cars); i++) out.push({ variant: P ? 'soloP' : 'solo', flip: false });
    return out;
  }
  if (sections > 1) {
    for (let v = 0; v < cars; v++) {
      for (let s = 0; s < sections; s++) {
        if (s === 0) out.push({ variant: P ? 'cabP' : 'cab', flip: false });
        else if (s === sections - 1) out.push({ variant: 'cab', flip: true });
        else out.push({ variant: 'mid', flip: false });
      }
    }
    return out;
  }
  for (let i = 0; i < cars; i++) {
    if (i === 0) out.push({ variant: 'cab', flip: false });
    else if (i === cars - 1) out.push({ variant: 'cab', flip: true });
    else out.push({ variant: P && i % 3 === 1 ? 'midP' : 'mid', flip: false });
  }
  return out;
}

/** Fallback spec for unknown stock ids. */
export function genericSpec(id: string, color = '#d8dde6'): StockSpec {
  return {
    id,
    name: 'Train',
    maker: '',
    introduced: 2000,
    blurb: '',
    length: 20,
    width: 2.9,
    height: 3.7,
    doors: 4,
    profile: 'box',
    nose: 'flat',
    body: color,
    finish: 'stainless',
    roof: '#9aa0a8',
    front: '#20242c',
    doorColor: '#c9ced6',
    stripes: [{ color: 'line', from: 0.3, to: 0.36 }],
    pantograph: false,
  };
}
