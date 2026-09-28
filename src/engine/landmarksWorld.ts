import * as THREE from 'three';
import type { CityId } from '../../shared/types.ts';
import { Kit, V, wheel, type C, type Placed } from './landmarkKit.ts';

// Toy landmarks for the round-three cities. Same conventions as landmarks.ts: local frame x east, y up,
// z south, meters; skyscrapers are drawn at 0.62× height to sit with the buildings around them.

const H = 0.62;

// --- Shared shapes -------------------------------------------------------------
/** An onion dome on a drum: the Russian (and Mughal-ish) silhouette. */
function onion(k: Kit, r: number, x: number, y: number, z: number, color: C, drum: C, tip: C = '#e2b340') {
  k.frustum(r * 0.72, r * 0.72, r * 1.1, x, y, z, drum, 12);
  const g = new THREE.SphereGeometry(r, 14, 10);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const t = p.getY(i) / r; // -1..1
    const pinch = t > 0 ? 1 - 0.55 * t * t : 1;
    p.setX(i, p.getX(i) * pinch);
    p.setZ(i, p.getZ(i) * pinch);
    p.setY(i, p.getY(i) * (t > 0 ? 1.35 : 0.9));
  }
  g.computeVertexNormals();
  k.add(g.translate(x, y + r * 1.1 + r * 0.8, z), color);
  k.cone(r * 0.18, r * 1.1, x, y + r * 1.1 + r * 0.8 + r * 1.2, z, tip, 8, true);
}

/** Tiered Chinese/Japanese hall: walls, then flared hip roofs that shrink toward the top. */
function tieredHall(k: Kit, o: { w: number; d: number; tiers: number; wall: C; roof: C; tierH: number; x?: number; y?: number; z?: number; shrink?: number; glow?: boolean }) {
  let w = o.w;
  let d = o.d;
  let y = o.y ?? 0;
  const x = o.x ?? 0;
  const z = o.z ?? 0;
  const shrink = o.shrink ?? 0.8;
  for (let i = 0; i < o.tiers; i++) {
    k.box(w, o.tierH, d, x, y, z, o.wall, { glow: o.glow });
    y += o.tierH;
    const top = i === o.tiers - 1;
    k.hip(w + o.tierH * 1.6, d + o.tierH * 1.6, top ? w * 0.35 : w * shrink, top ? o.tierH * 0.3 : d * shrink, o.tierH * (top ? 0.9 : 0.45), x, y, z, o.roof);
    y += o.tierH * (top ? 0.9 : 0.45);
    w *= shrink;
    d *= shrink;
  }
  return y;
}

/** A tapering tower of stacked frustums with a twist (Shanghai Tower, Canton Tower...). */
function twisted(k: Kit, o: { rBot: number; rTop: number; h: number; seg: number; twist: number; steps: number; color: C; glow?: boolean; open?: boolean }) {
  for (let i = 0; i < o.steps; i++) {
    const t0 = i / o.steps;
    const t1 = (i + 1) / o.steps;
    const g = new THREE.CylinderGeometry(o.rTop + (o.rBot - o.rTop) * (1 - t1), o.rTop + (o.rBot - o.rTop) * (1 - t0), (t1 - t0) * o.h, o.seg, 1, !!o.open);
    g.rotateY(o.twist * t0);
    k.add(g.translate(0, (t0 + t1) * 0.5 * o.h, 0), o.color, o.glow);
  }
}

/** A cable-stayed bridge along local x: deck, towers, and fans of stays. */
function cableStayed(o: { span: number; side: number; deckH: number; towerH: number; width: number; color: C; cable: C; tower: 'a' | 'y' | 'x' }) {
  const k = new Kit();
  const half = o.span / 2;
  k.box(o.span + o.side * 2, 2.5, o.width, 0, o.deckH, 0, '#c9ccd2');
  for (const sx of [-half, half]) {
    if (o.tower === 'y') {
      k.rod(V(sx, 0, -o.width / 2 - 2), V(sx, o.towerH * 0.62, 0), 2.4, o.color);
      k.rod(V(sx, 0, o.width / 2 + 2), V(sx, o.towerH * 0.62, 0), 2.4, o.color);
      k.frustum(2.4, 1.6, o.towerH * 0.38, sx, o.towerH * 0.62, 0, o.color, 6);
    } else {
      for (const z of [-o.width / 2 - 1.5, o.width / 2 + 1.5]) k.frustum(2.6, 1.8, o.towerH, sx, 0, z, o.color, 6);
      k.box(4, 3, o.width + 4, sx, o.towerH * 0.8, 0, o.color);
    }
    for (let i = 1; i <= 9; i++) {
      const top = o.towerH * (0.7 + i * 0.03);
      for (const dir of [-1, 1]) {
        const reach = dir * (i / 9) * (dir * sx > 0 ? o.side : half) * 0.95;
        for (const z of o.tower === 'y' ? [-o.width / 2, o.width / 2] : [-o.width / 2 - 1.5, o.width / 2 + 1.5])
          k.rod(V(sx, top, o.tower === 'y' ? 0 : z), V(sx + reach, o.deckH + 2, z), 0.35, o.cable);
      }
    }
  }
  return k.build();
}

// --- Washington -------------------------------------------------------------------
function washingtonMonument() {
  const k = new Kit();
  k.frustum(26, 26, 1.5, 0, 0, 0, '#dcd8cc', 24);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    k.rod(V(Math.cos(a) * 24, 0, Math.sin(a) * 24), V(Math.cos(a) * 24, 14, Math.sin(a) * 24), 0.25, '#e8e8e8');
    k.box(1.6, 1, 0.1, Math.cos(a) * 24 + 0.8, 12.5, Math.sin(a) * 24, i % 2 ? '#c8373b' : '#3a5aa0');
  }
  k.frustum(8.6 * Math.SQRT2 * 0.5, 5.3 * Math.SQRT2 * 0.5, 152, 0, 1.5, 0, '#efe9dc', 4, { glow: true });
  k.cone(5.3 * Math.SQRT2 * 0.5, 17, 0, 153.5, 0, '#f4f0e6', 4, true);
  k.box(0.6, 0.6, 0.6, 1.2, 145, 1.2, '#ff5a5f', { glow: true });
  return k.build();
}

function capitol() {
  const k = new Kit();
  const w = '#f4f1ea';
  k.box(230, 4, 100, 0, 0, 0, '#dcd6c8');
  k.box(96, 24, 70, 0, 4, 0, w, { glow: true });
  for (const x of [-80, 80]) k.box(64, 20, 50, x, 4, 0, w, { glow: true });
  k.frustum(22, 22, 14, 0, 28, 0, w, 24, { glow: true });
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    k.rod(V(Math.cos(a) * 23.5, 42, Math.sin(a) * 23.5), V(Math.cos(a) * 23.5, 52, Math.sin(a) * 23.5), 0.7, w);
  }
  k.frustum(23.5, 23.5, 1.2, 0, 52, 0, w, 24);
  k.frustum(18, 18, 6, 0, 53, 0, w, 24);
  k.sphere(18, 0, 59, 0, w, { half: true, sy: 1.25, glow: true });
  k.frustum(3.6, 3.2, 8, 0, 80, 0, w, 10);
  k.frustum(1, 0.5, 6, 0, 88, 0, '#6f7a88', 8);
  return k.build();
}

function lincolnMemorial() {
  const k = new Kit();
  const m = '#f2efe6';
  k.box(62, 6, 42, 0, 0, 0, '#e2ddd0');
  k.box(48, 18, 28, 0, 6, 0, '#ebe7dc', { glow: true });
  for (let i = 0; i < 12; i++) for (const z of [-15.5, 15.5]) k.frustum(1.2, 1.05, 14, -25 + (i * 50) / 11, 6, z, m, 10);
  for (let i = 1; i < 7; i++) for (const x of [-25.5, 25.5]) k.frustum(1.2, 1.05, 14, x, 6, -15.5 + (i * 31) / 7, m, 10);
  k.box(56, 4, 36, 0, 20, 0, m);
  k.box(44, 4, 24, 0, 24, 0, '#e6e1d6');
  return k.build();
}

// --- Chicago ------------------------------------------------------------------------
function willisTower() {
  const k = new Kit();
  const t = 23;
  // The nine bundled tubes, stepping back as they rise (stories: 50, 66, 90, 108).
  const floors = [
    [66, 108, 90],
    [50, 108, 90],
    [50, 66, 66],
  ];
  floors.forEach((row, j) =>
    row.forEach((f, i) => k.box(t, f * 3.94 * H, t, (i - 1) * t, 0, (j - 1) * t, '#2b2f36', { glow: true })),
  );
  for (const x of [-4, 4]) k.frustum(1.1, 0.5, 60 * H, x, 108 * 3.94 * H, -t / 2 + 6, '#e8ebef', 6);
  return k.build();
}

function cloudGate() {
  const k = new Kit();
  const g = new THREE.SphereGeometry(1, 24, 14);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    // The omphalos: a dimple arch underneath.
    const x = p.getX(i);
    const y = p.getY(i);
    if (y < 0) p.setY(i, y * (0.35 + 0.65 * Math.min(1, Math.abs(x) * 1.6)));
  }
  g.computeVertexNormals();
  k.add(g.scale(10, 5, 7).translate(0, 5, 0), '#d7dee6', true);
  return k.build();
}

// --- Boston -------------------------------------------------------------------------
function zakim() {
  return cableStayed({ span: 227, side: 105, deckH: 18, towerH: 98, width: 56, color: '#eef2f5', cable: '#e6ebf0', tower: 'y' });
}

function stateHouse() {
  const k = new Kit();
  k.box(52, 18, 34, 0, 0, 0, '#c9774f', { glow: true });
  k.box(30, 20, 8, 0, 0, -20, '#f4f1ea');
  for (let i = 0; i < 8; i++) k.frustum(0.8, 0.7, 12, -13 + (i * 26) / 7, 8, -24, '#f7f5ef', 8);
  k.hip(32, 9, 2, 1, 6, 0, 20, -20, '#e9e5da');
  k.frustum(10, 10, 6, 0, 18, 0, '#f4f1ea', 16);
  k.sphere(10, 0, 24, 0, '#e8b83c', { half: true, sy: 1.1, glow: true });
  k.frustum(1.6, 1.2, 5, 0, 35, 0, '#e8b83c', 8);
  k.cone(1.4, 3, 0, 40, 0, '#e8b83c', 8);
  return k.build();
}

function prudential() {
  const k = new Kit();
  k.box(48, 228 * H, 48, 0, 0, 0, '#95a3b0', { glow: true });
  k.box(40, 6, 40, 0, 228 * H, 0, '#7f8b96');
  k.rod(V(0, 228 * H + 6, 0), V(0, 228 * H + 40, 0), 0.9, '#d8dde2');
  return k.build();
}

// --- Mexico City -----------------------------------------------------------------------
function bellasArtes() {
  const k = new Kit();
  const m = '#f1ece2';
  k.box(96, 4, 64, 0, 0, 0, '#dcd5c6');
  k.box(86, 26, 56, 0, 4, 0, m, { glow: true });
  k.frustum(18, 16, 8, 0, 30, 0, m, 12);
  k.sphere(16, 0, 38, 0, '#e8a33c', { half: true, sy: 1.5, glow: true });
  k.frustum(2.4, 1.8, 6, 0, 62, 0, '#e8a33c', 8);
  k.sphere(3, 0, 70, 0, '#f0c24c', { glow: true });
  for (const [x, z] of [
    [-38, -24],
    [38, -24],
    [-38, 24],
    [38, 24],
  ])
    k.sphere(6, x, 30, z, '#e8a33c', { half: true, sy: 1.3 });
  return k.build();
}

function angel() {
  const k = new Kit();
  k.frustum(14, 14, 2, 0, 0, 0, '#d9d2c2', 16);
  k.box(14, 8, 14, 0, 2, 0, '#e8e2d4');
  k.frustum(2.4, 2, 34, 0, 10, 0, '#ece6d8', 16, { glow: true });
  k.box(4.5, 2, 4.5, 0, 44, 0, '#e8e2d4');
  k.frustum(1, 0.5, 5, 0, 46, 0, '#f0c64a', 8, { glow: true });
  k.sphere(0.6, 0, 51.5, 0, '#f0c64a', { glow: true });
  k.box(0.3, 3.4, 7, 0, 47, -0.6, '#f0c64a', { glow: true, rotY: 0.3 });
  return k.build();
}

function torreLatino() {
  const k = new Kit();
  k.box(30, 150 * H, 30, 0, 0, 0, '#aebfd0', { glow: true });
  k.box(24, 20 * H, 24, 0, 150 * H, 0, '#9fb2c4', { glow: true });
  k.rod(V(0, 170 * H, 0), V(0, 204 * H, 0), 0.8, '#d8dde2');
  return k.build();
}

// --- São Paulo ------------------------------------------------------------------------
function masp() {
  const k = new Kit();
  const red = '#d0332f';
  k.box(74, 11, 29, 0, 8, 0, '#6f8698', { glow: true });
  for (const z of [-15, 15]) {
    k.box(74, 4, 3, 0, 19, z, red);
    for (const x of [-35, 35]) k.box(3, 23, 3, x, 0, z, red);
  }
  return k.build();
}

function copan() {
  const k = new Kit();
  const pts: [number, number][] = [];
  const N = 30;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    pts.push([-60 + 120 * t, Math.sin(t * Math.PI * 1.5) * 12 - 10]);
  }
  for (let i = N; i >= 0; i--) {
    const t = i / N;
    pts.push([-60 + 120 * t, Math.sin(t * Math.PI * 1.5) * 12 + 10]);
  }
  k.prism(pts, 115 * H, 0, '#f2efe6', true);
  return k.build();
}

function ponteEstaiada() {
  const k = new Kit();
  const top = 138;
  // The X-shaped mast, two curving decks crossing under it.
  k.rod(V(-26, 0, 0), V(0, 80, 0), 3, '#eef1f4');
  k.rod(V(26, 0, 0), V(0, 80, 0), 3, '#eef1f4');
  k.frustum(3, 1.5, top - 80, 0, 80, 0, '#eef1f4', 6);
  for (const [dz, a] of [
    [-10, 0.18],
    [10, -0.18],
  ] as const) {
    k.box(290, 2.5, 12, 0, 12, dz, '#c9ccd2', { rotY: a });
    for (let i = 1; i <= 12; i++) {
      const t = i / 12;
      for (const s of [-1, 1]) {
        const x = s * t * 140;
        k.rod(V(0, top - 4 - i * 3, 0), V(x * Math.cos(a), 13, dz - x * Math.sin(a)), 0.3, '#f4d23c');
      }
    }
  }
  return k.build();
}

// --- Moscow -----------------------------------------------------------------------------
function stBasils() {
  const k = new Kit();
  const brick = '#b9463a';
  k.box(60, 10, 60, 0, 0, 0, '#c0584a', { glow: true });
  k.box(18, 22, 18, 0, 10, 0, brick, { glow: true });
  // The central tent roof.
  k.frustum(8, 7, 8, 0, 32, 0, '#e8dcc4', 8);
  k.cone(7, 22, 0, 40, 0, '#d8c8a4', 8);
  onion(k, 2.4, 0, 60, 0, '#e2b340', '#e8dcc4');
  const domes: [number, number, C, number][] = [
    [0, -22, '#3d6fb8', 6],
    [22, 0, '#3f9a5a', 6],
    [0, 22, '#e2b340', 6],
    [-22, 0, '#c8423a', 6],
    [16, -16, '#e8dcc4', 4.5],
    [16, 16, '#3f9a5a', 4.5],
    [-16, 16, '#c8423a', 4.5],
    [-16, -16, '#3d6fb8', 4.5],
  ];
  for (const [x, z, c, r] of domes) {
    const tall = r > 5 ? 18 : 12;
    k.frustum(r * 1.3, r * 1.1, tall, x, 10, z, brick, 8, { glow: true });
    onion(k, r, x, 10 + tall, z, c, '#e8dcc4');
  }
  return k.build();
}

function spasskaya() {
  const k = new Kit();
  const brick = '#b9463a';
  k.box(60, 12, 8, -20, 0, 0, brick);
  k.box(16, 36, 16, 0, 0, 0, brick, { glow: true });
  k.box(12, 14, 12, 0, 36, 0, '#c24a3c', { glow: true });
  for (const [x, z, r] of [
    [6.1, 0, Math.PI / 2],
    [-6.1, 0, -Math.PI / 2],
    [0, 6.1, 0],
    [0, -6.1, Math.PI],
  ] as const)
    k.add(new THREE.CircleGeometry(3.2, 18).rotateY(r).translate(x, 43, z), '#fff6d6', true);
  k.frustum(5.5, 4.5, 6, 0, 50, 0, '#e8dcc4', 8);
  k.cone(5, 14, 0, 56, 0, '#3f7a52', 8);
  k.sphere(1.8, 0, 72, 0, '#ff3b30', { glow: true });
  return k.build();
}

function msu() {
  const k = new Kit();
  const w = '#ebe3d2';
  for (const x of [-95, 95]) k.box(70, 36, 40, x, 0, 0, w, { glow: true });
  for (const x of [-60, 60]) k.box(26, 60, 26, x, 0, 0, w, { glow: true });
  k.box(70, 70, 50, 0, 0, 0, w, { glow: true });
  k.box(46, 30, 36, 0, 70, 0, w, { glow: true });
  k.box(30, 26, 26, 0, 100, 0, w, { glow: true });
  for (const [x, z] of [
    [-14, -12],
    [14, -12],
    [-14, 12],
    [14, 12],
  ])
    k.cone(1.2, 8, x, 126, z, '#d9c28a', 6);
  k.frustum(9, 5, 12, 0, 126, 0, '#b99b7a', 8);
  k.frustum(4, 0.6, 34, 0, 138, 0, '#d9c28a', 8, { glow: true });
  k.sphere(2, 0, 173, 0, '#f0c64a', { glow: true });
  return k.build();
}

function ostankino() {
  const k = new Kit();
  // Ten concrete legs flare into the shaft (h scaled like the other towers).
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    k.rod(V(Math.cos(a) * 30, 0, Math.sin(a) * 30), V(Math.cos(a) * 9, 38, Math.sin(a) * 9), 2.2, '#e6e3dc', true);
  }
  k.frustum(10, 5, 385 * H - 38, 0, 38, 0, '#ece9e2', 16, { glow: true });
  k.frustum(11, 11, 12, 0, 330 * H, 0, '#cfd6de', 16, { glow: true });
  k.ring(11.2, 1, 0, 336 * H, 0, '#fff0bd', true);
  for (let i = 0; i < 6; i++) k.frustum(2.4 - i * 0.3, 2.1 - i * 0.3, 20, 0, 385 * H + i * 20, 0, i % 2 ? '#f6f4ef' : '#e2463c', 8, { glow: true });
  return k.build();
}

// --- Stockholm ------------------------------------------------------------------------
function stadshuset() {
  const k = new Kit();
  const brick = '#b0513d';
  k.box(100, 24, 70, 0, 0, 0, brick, { glow: true });
  k.box(80, 4, 50, 0, 24, 0, '#6f9a86');
  k.box(18, 66, 18, 40, 0, -26, brick, { glow: true });
  k.box(14, 8, 14, 40, 66, -26, '#6f9a86');
  k.frustum(5, 2, 8, 40, 74, -26, '#6f9a86', 8);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    k.ring(1.2, 0.4, 40 + Math.cos(a) * 1.6, 83, -26 + Math.sin(a) * 1.6, '#f0c64a', true);
  }
  k.rod(V(40, 82, -26), V(40, 86, -26), 0.3, '#f0c64a');
  return k.build();
}

function globen() {
  const k = new Kit();
  k.sphere(55, 0, 30, 0, '#f6f6f2', { glow: true });
  return k.build();
}

// --- Vienna ----------------------------------------------------------------------------
function stephansdom() {
  const k = new Kit();
  const stone = '#d8cdb5';
  k.box(107, 28, 34, 0, 0, 0, stone, { glow: true });
  k.hip(107, 36, 104, 2, 34, 0, 28, 0, '#4f7a5c');
  // Chevrons of glazed tiles on the roof (gold bands).
  for (let i = 0; i < 7; i++) {
    const x = -45 + i * 15;
    k.rod(V(x - 6, 30, -16), V(x, 58, 0), 0.9, '#e0b64c');
    k.rod(V(x - 6, 30, 16), V(x, 58, 0), 0.9, '#e0b64c');
  }
  // The south tower and its spire, the stumpy north tower with its dome.
  k.box(18, 60, 18, 18, 0, 22, stone, { glow: true });
  k.frustum(9 * Math.SQRT2 * 0.5 * 1.3, 0.4, 76, 18, 60, 22, '#cabd9f', 8, { glow: true });
  k.box(16, 50, 16, 18, 0, -22, stone);
  k.sphere(6, 18, 52, -22, '#6f9a86', { half: true, sy: 1.3 });
  k.box(22, 44, 30, -58, 0, 0, stone);
  return k.build();
}

function karlskirche() {
  const k = new Kit();
  const w = '#f1ebdc';
  k.box(60, 20, 34, 0, 0, 6, w, { glow: true });
  k.box(34, 18, 10, 0, 0, -16, w);
  k.hip(36, 12, 2, 1, 8, 0, 18, -16, '#e8e1d0');
  k.frustum(14, 14, 16, 0, 20, 6, w, 16, { glow: true });
  k.sphere(14, 0, 36, 6, '#6aa58a', { half: true, sy: 1.5 });
  k.frustum(2.2, 1.6, 8, 0, 57, 6, '#6aa58a', 8);
  for (const x of [-24, 24]) {
    k.frustum(3.4, 3.2, 38, x, 0, -18, '#ece5d4', 12, { glow: true });
    k.cone(2.8, 6, x, 38, -18, '#6aa58a', 8);
  }
  return k.build();
}

// --- Helsinki --------------------------------------------------------------------------
function tuomiokirkko() {
  const k = new Kit();
  const w = '#f6f5ef';
  const g = '#5e9e84';
  k.box(80, 8, 80, 0, 0, 0, '#e6e2d8');
  k.box(52, 24, 24, 0, 8, 0, w, { glow: true });
  k.box(24, 24, 52, 0, 8, 0, w, { glow: true });
  for (const [x, z] of [
    [0, -26],
    [0, 26],
    [-26, 0],
    [26, 0],
  ])
    k.hip(x ? 4 : 26, x ? 26 : 4, x ? 1 : 22, x ? 22 : 1, 6, x, 32, z, w);
  k.frustum(10, 10, 14, 0, 32, 0, w, 16, { glow: true });
  k.sphere(10, 0, 46, 0, g, { half: true, sy: 1.4 });
  k.frustum(1.6, 1.2, 5, 0, 60, 0, g, 8);
  k.sphere(0.9, 0, 66, 0, '#f0c64a', { glow: true });
  for (const [x, z] of [
    [-16, -16],
    [16, -16],
    [-16, 16],
    [16, 16],
  ]) {
    k.frustum(3.4, 3.4, 6, x, 32, z, w, 12);
    k.sphere(3.4, x, 38, z, g, { half: true, sy: 1.5 });
  }
  return k.build();
}

function uspenski() {
  const k = new Kit();
  const brick = '#a04a38';
  k.box(46, 20, 30, 0, 0, 0, brick, { glow: true });
  k.hip(46, 30, 20, 10, 6, 0, 20, 0, '#4f6f66');
  k.frustum(6, 6, 14, 0, 26, 0, brick, 8, { glow: true });
  onion(k, 5, 0, 40, 0, '#e3b341', brick);
  for (const [x, z] of [
    [-14, -9],
    [14, -9],
    [-14, 9],
    [14, 9],
  ])
    onion(k, 2.6, x, 26, z, '#e3b341', brick);
  k.box(10, 30, 10, -26, 0, 0, brick, { glow: true });
  onion(k, 2.8, -26, 30, 0, '#e3b341', brick);
  return k.build();
}

function helsinkiStation() {
  const k = new Kit();
  const granite = '#c8b89c';
  k.box(130, 16, 36, 0, 0, 0, granite, { glow: true });
  k.box(40, 22, 30, 0, 0, 0, granite, { glow: true });
  k.sphere(12, 0, 22, 0, '#7f9b8a', { half: true, sy: 0.7 });
  k.box(9, 48, 9, 42, 0, -10, granite, { glow: true });
  k.add(new THREE.CircleGeometry(2.6, 16).rotateY(Math.PI).translate(42, 42, -14.6), '#fff6d6', true);
  k.frustum(4, 1, 6, 42, 48, -10, '#7f9b8a', 8);
  // The four lantern carriers flanking the door.
  for (const x of [-12, -8, 8, 12]) {
    k.box(2, 7, 2, x, 6, -18, '#d6c6a8');
    k.sphere(0.9, x, 14, -19, '#fff0bd', { glow: true });
  }
  return k.build();
}

// --- Amsterdam ------------------------------------------------------------------------
function centraal() {
  const k = new Kit();
  const brick = '#a44e3a';
  k.box(300, 18, 26, 0, 0, 0, brick, { glow: true });
  k.hip(300, 26, 296, 6, 8, 0, 18, 0, '#56606c');
  for (const x of [-20, 20]) {
    k.box(14, 40, 14, x, 0, -8, brick, { glow: true });
    k.hip(14, 14, 3, 3, 10, x, 40, -8, '#56606c');
    k.add(new THREE.CircleGeometry(2.6, 16).rotateY(Math.PI).translate(x, 33, -15.1), '#f0c64a', true);
  }
  // The iron train shed behind.
  k.add(new THREE.CylinderGeometry(22, 22, 280, 18, 1, true, 0, Math.PI).rotateZ(Math.PI / 2).rotateX(Math.PI / 2).translate(0, 4, 36).scale(1, 0.8, 1), '#c9d8e6');
  return k.build();
}

function rijksmuseum() {
  const k = new Kit();
  const brick = '#b0503c';
  k.box(120, 26, 60, 0, 0, 0, brick, { glow: true });
  k.hip(120, 60, 110, 20, 10, 0, 26, 0, '#56606c');
  for (const x of [-12, 12]) {
    k.box(12, 48, 12, x, 0, -26, brick, { glow: true });
    k.cone(7, 16, x, 48, -26, '#56606c', 4);
  }
  k.box(16, 12, 62, 0, 0, 0, '#3a2a24');
  return k.build();
}

function windmill() {
  const base = new Kit();
  base.frustum(9, 5, 20, 0, 0, 0, '#8a5a3c', 8);
  base.frustum(9.5, 9.5, 1.2, 0, 6, 0, '#6f4a34', 8);
  base.hip(10, 10, 4, 10, 6, 0, 20, 0, '#3f3a38');
  const g = base.build();
  const sails = new Kit();
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const tip = V(Math.cos(a) * 16, Math.sin(a) * 16, 0);
    sails.rod(V(0, 0, 0), tip, 0.35, '#4a3a30');
    const s = new THREE.BoxGeometry(12, 3, 0.2).translate(8.5, 1.6, 0).rotateZ(a);
    sails.add(s, '#f4efe2');
  }
  const rotor = sails.build();
  rotor.position.set(0, 22, -5.5);
  g.add(rotor);
  g.userData.rotor = { obj: rotor, axis: 'z', speed: 0.6 };
  return g;
}

// --- Oslo -----------------------------------------------------------------------------
function operaHouse() {
  const k = new Kit();
  const marble = '#f4f4f0';
  k.box(110, 3, 100, 0, 0, 0, marble);
  // Walkable roof planes sloping down to the fjord.
  k.add(new THREE.BoxGeometry(80, 2, 90).rotateZ(0.2).translate(-12, 9, 0), marble);
  k.add(new THREE.BoxGeometry(46, 2, 60).rotateZ(-0.16).translate(38, 10, -8), marble);
  k.box(40, 20, 50, 5, 3, -10, '#8fb0c8', { glow: true });
  k.box(22, 42, 24, 10, 3, -12, '#e8ecef', { glow: true });
  return k.build();
}

function radhus() {
  const k = new Kit();
  const brick = '#a95f45';
  k.box(70, 24, 40, 0, 0, 0, brick, { glow: true });
  for (const x of [-22, 22]) {
    k.box(20, 60, 24, x, 0, 0, brick, { glow: true });
    k.box(21, 3, 25, x, 60, 0, '#8a4a36');
  }
  k.add(new THREE.CircleGeometry(3.6, 18).rotateY(Math.PI).translate(22, 50, -12.2), '#f0c64a', true);
  return k.build();
}

function holmenkollen() {
  const k = new Kit();
  const white = '#e8edf2';
  k.box(10, 58, 10, 0, 0, 0, '#cfd6de', { glow: true });
  k.add(new THREE.BoxGeometry(110, 3, 10).rotateZ(-0.62).translate(46, 30, 0), white, true);
  k.add(new THREE.BoxGeometry(160, 2, 50).rotateZ(-0.52).translate(170, -12, 0), '#f6f8fa');
  k.box(40, 1, 60, 250, -46, 0, '#f6f8fa');
  return k.build();
}

// --- Cairo ----------------------------------------------------------------------------
function cairoTower() {
  const k = new Kit();
  k.frustum(14, 14, 6, 0, 0, 0, '#cbb893', 12);
  // A lattice of concrete strands, like a woven reed basket.
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const b = a + 0.6;
    k.rod(V(Math.cos(a) * 8, 6, Math.sin(a) * 8), V(Math.cos(b) * 6.5, 125, Math.sin(b) * 6.5), 0.6, '#d8c6a6');
    k.rod(V(Math.cos(a) * 8, 6, Math.sin(a) * 8), V(Math.cos(a - 0.6) * 6.5, 125, Math.sin(a - 0.6) * 6.5), 0.6, '#d8c6a6');
  }
  k.frustum(6.8, 6.4, 119, 0, 6, 0, '#bfae8e', 12);
  k.frustum(6.5, 11, 10, 0, 125, 0, '#d8c6a6', 12, { glow: true });
  k.frustum(11, 10, 10, 0, 135, 0, '#e6dcc4', 12, { glow: true });
  k.rod(V(0, 145, 0), V(0, 162, 0), 0.6, '#e8e2d4');
  return k.build();
}

function pyramid(base: number, height: number, cap = false) {
  const k = new Kit();
  k.cone(base / Math.SQRT2, height, 0, 0, 0, '#e0c48a', 4, true);
  if (cap) k.cone((base / Math.SQRT2) * 0.16, height * 0.16, 0, height * 0.84, 0, '#f4ead4', 4);
  return k.build();
}

function sphinx() {
  const k = new Kit();
  const s = '#d8b87e';
  k.box(20, 6, 60, 0, 0, 0, s);
  k.box(8, 3, 16, -5, 0, -34, s);
  k.box(8, 3, 16, 5, 0, -34, s);
  k.box(10, 10, 9, 0, 6, -24, s);
  k.hip(14, 10, 8, 8, 4, 0, 11, -24, '#c8a86e');
  return k.build();
}

function muhammadAli() {
  const k = new Kit();
  const w = '#e8e2d6';
  const lead = '#b8c0c8';
  k.box(54, 18, 54, 0, 0, 0, w, { glow: true });
  k.frustum(12, 12, 6, 0, 18, 0, w, 16);
  k.sphere(12, 0, 24, 0, lead, { half: true, sy: 1.1 });
  for (const [x, z] of [
    [-18, 0],
    [18, 0],
    [0, -18],
    [0, 18],
  ])
    k.sphere(7, x, 18, z, lead, { half: true });
  for (const x of [-26, 26]) {
    k.frustum(1.8, 1.4, 70, x, 0, -26, w, 8, { glow: true });
    k.cone(1.5, 9, x, 70, -26, lead, 8);
  }
  return k.build();
}

// --- Delhi ----------------------------------------------------------------------------
function indiaGate() {
  const k = new Kit();
  const s = '#d9a57a';
  for (const x of [-9, 9]) k.box(8, 30, 12, x, 0, 0, s, { glow: true });
  k.box(26, 8, 12, 0, 30, 0, s, { glow: true });
  k.box(18, 4, 10, 0, 38, 0, '#cf9a70');
  k.sphere(3.5, 0, 42, 0, '#cf9a70', { half: true });
  k.frustum(1.5, 1.5, 1, 0, 0, 0, '#ffb54a', 8, { glow: true });
  return k.build();
}

function qutubMinar() {
  const k = new Kit();
  const red = '#b8674a';
  const tiers = [
    [7.4, 5.8, 29, red],
    [5.8, 4.8, 15, red],
    [4.8, 4.1, 11, red],
    [4.1, 3.6, 9, '#efe6d8'],
    [3.6, 3.1, 8, '#d49a7a'],
  ] as const;
  let y = 0;
  for (const [r0, r1, h, c] of tiers) {
    k.frustum(r0, r1, h, 0, y, 0, c, 20, { glow: true });
    y += h;
    k.ring(r1 + 0.8, 0.5, 0, y - 0.3, 0, '#e8dcc6');
  }
  k.frustum(2, 1.4, 3, 0, y, 0, '#efe6d8', 8);
  return k.build();
}

function lotusTemple() {
  const k = new Kit();
  const w = '#f5f3ee';
  k.frustum(36, 34, 3, 0, 0, 0, '#e8e4dc', 9);
  // Three rings of nine marble petals, opening outward.
  const rings = [
    [8, 30, 0.12],
    [15, 24, 0.45],
    [22, 16, 0.8],
  ];
  for (const [r, h, tilt] of rings) {
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + r * 0.05;
      const petal = new THREE.SphereGeometry(1, 10, 8, 0, Math.PI, 0, Math.PI);
      petal.scale(7, h, 3.5).rotateX(-tilt).translate(0, 0, -r * 0.2).rotateY(-a).translate(Math.cos(a) * r * 0.55, 3, Math.sin(a) * r * 0.55);
      k.add(petal, w, true);
    }
  }
  return k.build();
}

// --- Shanghai -------------------------------------------------------------------------
function orientalPearl() {
  const k = new Kit();
  const pink = '#e05a8c';
  const shaft = '#e9e4ea';
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    k.rod(V(Math.cos(a) * 40, 0, Math.sin(a) * 40), V(Math.cos(a) * 9, 60, Math.sin(a) * 9), 3.5, shaft, true);
    k.rod(V(Math.cos(a + 1.05) * 7, 0, Math.sin(a + 1.05) * 7), V(Math.cos(a + 1.05) * 7, 263 * H, Math.sin(a + 1.05) * 7), 3.4, shaft, true);
  }
  k.sphere(25, 0, 90 * H, 0, pink, { glow: true });
  for (let i = 0; i < 5; i++) k.sphere(5, 0, (130 + i * 22) * H, 0, pink, { glow: true });
  k.sphere(15, 0, 263 * H, 0, pink, { glow: true });
  k.frustum(4, 3, 60 * H, 0, 275 * H, 0, shaft, 8);
  k.sphere(7, 0, 342 * H, 0, pink, { glow: true });
  k.frustum(1.6, 0.4, 110 * H, 0, 348 * H, 0, '#f0eef2', 8, { glow: true });
  return k.build();
}

function shanghaiTower() {
  const k = new Kit();
  twisted(k, { rBot: 43, rTop: 24, h: 632 * H, seg: 3, twist: (120 * Math.PI) / 180, steps: 18, color: '#b9d3e6', glow: true });
  return k.build();
}

function swfc() {
  const k = new Kit();
  const g = '#aac6dc';
  const h = 492 * H;
  k.hip(58, 58, 12, 58, h * 0.86, 0, 0, 0, g, true);
  // The "bottle opener": two slim legs around the aperture, and a bar across the top.
  for (const x of [-9, 9]) k.box(6, h * 0.14, 50, x, h * 0.86, 0, g, { glow: true });
  k.box(24, 5, 50, 0, h - 5, 0, g, { glow: true });
  return k.build();
}

// --- Beijing --------------------------------------------------------------------------
function tiananmen() {
  const k = new Kit();
  const red = '#b93a2e';
  k.box(118, 14, 36, 0, 0, 0, red, { glow: true });
  for (let i = 0; i < 5; i++) k.box(i === 2 ? 7 : 5, 8, 0.4, -24 + i * 12, 0, -18.2, '#3a2622');
  k.add(new THREE.BoxGeometry(7, 9, 0.2).translate(0, 9, -18.3), '#f4efe2', true);
  tieredHall(k, { w: 64, d: 22, tiers: 2, wall: '#c4453a', roof: '#e3b33c', tierH: 7, y: 14 });
  return k.build();
}

function templeOfHeaven() {
  const k = new Kit();
  const marble = '#f1efe8';
  [45, 38, 31].forEach((r, i) => k.frustum(r, r, 2, 0, i * 2, 0, marble, 32));
  k.frustum(13, 13, 8, 0, 6, 0, '#b8483b', 24, { glow: true });
  k.frustum(17, 11, 5, 0, 14, 0, '#2f5aa0', 24);
  k.frustum(11, 11, 6, 0, 19, 0, '#b8483b', 24, { glow: true });
  k.frustum(14, 8, 5, 0, 25, 0, '#2f5aa0', 24);
  k.frustum(8, 8, 5, 0, 30, 0, '#b8483b', 24, { glow: true });
  k.cone(11, 8, 0, 35, 0, '#2f5aa0', 24);
  k.sphere(1.6, 0, 44, 0, '#e8b83c', { glow: true });
  return k.build();
}

function cctv() {
  const k = new Kit();
  const g = '#4a5058';
  const h = 234 * H;
  k.box(160, 12, 100, 0, 0, 0, g, { glow: true });
  k.leanBox(40, h, 40, -40, 12, 30, g, 0.18, true);
  k.leanBox(40, h, 40, 40, 12, -30, g, -0.18, true);
  k.box(110, 30, 40, 0, h - 18, -30, g, { glow: true });
  k.box(40, 30, 100, -40 + h * 0.18, h - 18, 0, g, { glow: true });
  return k.build();
}

// --- Guangzhou & Shenzhen -------------------------------------------------------------
function cantonTower() {
  const k = new Kit();
  const N = 24;
  const h = 454 * H;
  // A hyperboloid of straight members: an ellipse at the base, a smaller one at the top, twisted 45°.
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const b = a + Math.PI / 4;
    k.rod(V(Math.cos(a) * 40, 0, Math.sin(a) * 30), V(Math.cos(b) * 21, h, Math.sin(b) * 15), 0.9, '#dfe7ee', true);
  }
  for (let j = 1; j < 14; j++) {
    const t = j / 14;
    const w = 1 - Math.sin(t * Math.PI) * 0.45;
    const g = new THREE.TorusGeometry(1, 0.03, 4, 28).rotateX(Math.PI / 2).scale((40 + (21 - 40) * t) * w * 1.02, 1, (30 + (15 - 30) * t) * w * 1.02);
    k.add(g.translate(0, h * t, 0), '#dfe7ee', true);
  }
  k.frustum(8, 6, h, 0, 0, 0, '#c9d2dc', 12, { glow: true });
  k.frustum(3, 0.6, 146 * H, 0, h, 0, '#f0eef2', 8, { glow: true });
  return k.build();
}

function gzIfc() {
  const k = new Kit();
  twisted(k, { rBot: 36, rTop: 30, h: 440 * H, seg: 3, twist: 0, steps: 6, color: '#c8dbe8', glow: true });
  return k.build();
}

function pingAn() {
  const k = new Kit();
  const h = 555 * H;
  k.frustum(48, 38, h * 0.9, 0, 0, 0, '#c5ccd4', 8, { glow: true });
  k.frustum(38, 18, h * 0.1, 0, h * 0.9, 0, '#d6dce2', 8, { glow: true });
  k.frustum(4, 0.6, 60 * H, 0, h, 0, '#e8ecef', 8);
  return k.build();
}

function civicCenter() {
  const k = new Kit();
  k.box(420, 30, 90, 0, 0, 0, '#e8ecef', { glow: true });
  // The huge floating roof, like a wing.
  for (let i = 0; i < 5; i++) {
    const x = -200 + i * 100;
    k.add(new THREE.BoxGeometry(100, 3, 150).rotateZ(i % 2 ? 0.06 : -0.06).translate(x + 50, 42 + (i % 2) * 6, 0), '#bfc9d2');
  }
  k.sphere(18, -40, 30, 0, '#6f9ec8', { half: true, sy: 0.7 });
  return k.build();
}

// --- Chengdu, Hangzhou, Wuhan, Chongqing ------------------------------------------------
function ifsPanda() {
  const k = new Kit();
  k.box(120, 40, 70, 0, 0, 0, '#d6dce2', { glow: true });
  k.box(40, 248 * H, 40, -30, 0, 0, '#b8c6d4', { glow: true });
  // The giant panda clambering over the top of the mall, bottom first.
  const x = 40;
  const z = 36;
  const y = 40;
  k.sphere(7, x, y + 1, z - 3, '#f4f4f0', { sy: 1.1 });
  k.sphere(4.5, x, y + 8, z - 9, '#f4f4f0');
  k.sphere(1.6, x - 3.2, y + 12, z - 9, '#1e1e22');
  k.sphere(1.6, x + 3.2, y + 12, z - 9, '#1e1e22');
  for (const s of [-1, 1]) {
    k.add(new THREE.CapsuleGeometry(1.8, 8, 4, 8).rotateX(0.9).translate(x + s * 5, y + 4, z - 9), '#1e1e22');
    k.add(new THREE.CapsuleGeometry(2, 6, 4, 8).rotateX(-0.4).translate(x + s * 4, y - 4, z + 1), '#1e1e22');
  }
  return k.build();
}

function octPagoda(o: { tiers: number; r: number; tierH: number; wall: C; roof: C; base?: number }) {
  const k = new Kit();
  let y = 0;
  if (o.base) {
    k.frustum(o.r * 1.5, o.r * 1.4, o.base, 0, 0, 0, '#d8cfbd', 8);
    y = o.base;
  }
  let r = o.r;
  for (let i = 0; i < o.tiers; i++) {
    k.frustum(r, r * 0.97, o.tierH, 0, y, 0, o.wall, 8, { glow: true });
    y += o.tierH;
    k.frustum(r * 1.45, r * 0.9, o.tierH * 0.35, 0, y, 0, o.roof, 8);
    y += o.tierH * 0.35;
    r *= 0.9;
  }
  k.cone(r * 0.9, o.tierH * 1.2, 0, y, 0, o.roof, 8);
  k.rod(V(0, y + o.tierH * 1.1, 0), V(0, y + o.tierH * 2.2, 0), 0.5, '#e2b340');
  return k.build();
}

function sunAndMoon() {
  const k = new Kit();
  k.frustum(40, 40, 10, 0, 0, 0, '#d8dce2', 24);
  k.sphere(42, 0, 52, 0, '#e8b845', { glow: true });
  k.add(new THREE.SphereGeometry(40, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.55, 1).translate(-150, 0, 40), '#dfe4ea', true);
  return k.build();
}

function trussBridge(o: { length: number; spans: number; deck: number; color: C }) {
  const k = new Kit();
  const half = o.length / 2;
  const hTruss = 16;
  k.box(o.length, 2.5, 20, 0, o.deck, 0, '#8a8f96');
  k.box(o.length, 2, 18, 0, o.deck + hTruss, 0, o.color);
  for (const z of [-10, 10]) {
    k.box(o.length, 1.4, 1.4, 0, o.deck + hTruss, z, o.color);
    k.box(o.length, 1.4, 1.4, 0, o.deck, z, o.color);
    const n = o.spans * 8;
    for (let i = 0; i <= n; i++) {
      const x = -half + (i / n) * o.length;
      k.rod(V(x, o.deck, z), V(x, o.deck + hTruss, z), 0.4, o.color);
      if (i < n) k.rod(V(x, o.deck + (i % 2 ? hTruss : 0), z), V(x + o.length / n, o.deck + (i % 2 ? 0 : hTruss), z), 0.35, o.color);
    }
  }
  for (let i = 0; i <= o.spans; i++) k.box(10, o.deck, 26, -half + (i / o.spans) * o.length, 0, 0, '#c9b89a');
  return k.build();
}

function yellowCrane() {
  const k = new Kit();
  k.box(40, 6, 40, 0, 0, 0, '#d8cfbd');
  tieredHall(k, { w: 30, d: 30, tiers: 5, wall: '#b8483b', roof: '#e6b43c', tierH: 7.5, y: 6, shrink: 0.88, glow: true });
  return k.build();
}

function rafflesChongqing() {
  const k = new Kit();
  const glass = '#c8d8e4';
  const towers: [number, number, number][] = [
    [-90, 30, 350],
    [-50, -10, 250],
    [-10, -30, 250],
    [30, -30, 250],
    [70, -10, 250],
    [110, 30, 350],
  ];
  k.box(260, 30, 110, 10, 0, 0, '#dfe4ea', { glow: true });
  for (const [x, z, h] of towers) k.hip(34, 34, 30, 30, h * H, x, 0, z, glass, true);
  // The Crystal: a 300 m horizontal skyscraper resting on the four middle towers.
  k.box(170, 20, 34, 10, 250 * H, -24, '#e6eef4', { glow: true });
  return k.build();
}

function hongyadong() {
  const k = new Kit();
  // Stilted houses stacked eleven stories up the cliff, lit up like lanterns at night.
  for (let i = 0; i < 8; i++) {
    const w = 140 - i * 8;
    k.box(w, 7, 26 - i * 1.2, 0, i * 8, i * 2.4, i % 2 ? '#6a4632' : '#7a5238', { glow: true });
    k.hip(w + 4, 30 - i * 1.2, w, 4, 1.6, 0, i * 8 + 7, i * 2.4, '#4a4a4e');
  }
  for (let i = 0; i < 14; i++) k.sphere(0.9, -60 + i * 9, 5, -14, '#ff6a3c', { glow: true });
  return k.build();
}

// --- Osaka ----------------------------------------------------------------------------
function osakaCastle() {
  const k = new Kit();
  k.frustum(58, 44, 20, 0, 0, 0, '#9a968c', 4);
  const top = tieredHall(k, { w: 34, d: 28, tiers: 5, wall: '#f4f2ec', roof: '#4e8f7a', tierH: 7, y: 20, shrink: 0.86, glow: true });
  for (const x of [-4, 4]) k.box(1.4, 3, 1.4, x, top - 2, 0, '#e2b340', { glow: true });
  return k.build();
}

function tsutenkaku() {
  const k = new Kit();
  const s = '#c9ccd2';
  for (const [x, z] of [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ])
    k.rod(V(x * 14, 0, z * 14), V(x * 7, 24, z * 7), 1.6, s);
  k.frustum(8, 8, 8, 0, 24, 0, s, 8, { glow: true });
  k.frustum(6, 4.5, 50, 0, 32, 0, s, 8, { glow: true });
  for (let i = 0; i < 3; i++) k.ring(5.4 - i * 0.3, 0.6, 0, 50 + i * 9, 0, ['#ff5a5f', '#ffd23f', '#4cc3ff'][i], true);
  k.frustum(9, 9, 10, 0, 82, 0, '#e8eaee', 8, { glow: true });
  k.frustum(3, 1.4, 16, 0, 92, 0, s, 8);
  return k.build();
}

function umedaSky() {
  const k = new Kit();
  const g = '#b8c8d6';
  const h = 173 * H;
  for (const x of [-26, 26]) k.box(34, h, 40, x, 0, 0, g, { glow: true });
  // The Floating Garden observatory bridging the twin towers.
  k.box(86, 8, 40, 0, h - 4, 0, '#dfe6ec', { glow: true });
  k.frustum(24, 24, 4, 0, h - 8, 0, '#e8eef2', 24, { glow: true, open: true });
  return k.build();
}

// --- Taipei ---------------------------------------------------------------------------
function taipei101() {
  const k = new Kit();
  const g = '#7fb3a6';
  k.frustum(40, 33, 25 * 4 * H, 0, 0, 0, g, 4, { glow: true });
  let y = 100 * H;
  // Eight stacked, outward-flaring segments of eight floors each, like a bamboo stalk or a pagoda.
  for (let i = 0; i < 8; i++) {
    const hSeg = 8 * 4.2 * H;
    k.frustum(24, 30, hSeg, 0, y, 0, g, 4, { glow: true });
    y += hSeg;
  }
  k.frustum(22, 14, 30 * H, 0, y, 0, g, 4, { glow: true });
  y += 30 * H;
  k.frustum(3, 0.8, 60 * H, 0, y, 0, '#dfe6ec', 8);
  return k.build();
}

function ckshall() {
  const k = new Kit();
  k.box(80, 16, 80, 0, 0, 0, '#f5f5f2', { glow: true });
  k.box(50, 22, 50, 0, 16, 0, '#f5f5f2', { glow: true });
  k.frustum(40, 24, 10, 0, 38, 0, '#2f55a4', 8);
  k.frustum(24, 24, 6, 0, 48, 0, '#f5f5f2', 8);
  k.frustum(24, 6, 10, 0, 54, 0, '#2f55a4', 8);
  k.sphere(2, 0, 65, 0, '#e2b340', { glow: true });
  return k.build();
}

function grandHotel() {
  const k = new Kit();
  k.box(150, 30, 34, 0, 0, 0, '#c4453a', { glow: true });
  tieredHall(k, { w: 150, d: 34, tiers: 1, wall: '#c4453a', roof: '#e3b33c', tierH: 8, y: 30 });
  tieredHall(k, { w: 56, d: 30, tiers: 2, wall: '#c4453a', roof: '#e3b33c', tierH: 8, y: 30 });
  return k.build();
}

// --- Singapore ------------------------------------------------------------------------
function marinaBaySands() {
  const k = new Kit();
  const w = '#dfe6ec';
  const h = 191 * H;
  // Three towers, each two legs leaning into each other; the SkyPark boat on top (local +x points north).
  for (const x of [-95, 0, 95]) {
    k.leanBox(26, h, 36, x - 16, 0, 0, w, 0.06, true);
    k.leanBox(26, h, 36, x + 16, 0, 0, w, -0.06, true);
  }
  k.box(260, 8, 40, 25, h, 0, '#eef3f6', { glow: true });
  k.box(200, 2, 12, 25, h + 8, 0, '#7fd3e8', { glow: true });
  for (let i = 0; i < 12; i++) k.cone(3, 6, -80 + i * 17, h + 8, 12, '#5aa86a', 6);
  return k.build();
}

function supertrees() {
  const k = new Kit();
  const spots: [number, number, number][] = [
    [0, 0, 50],
    [-40, 30, 42],
    [45, 25, 45],
    [-30, -35, 30],
    [20, -40, 28],
    [60, -20, 26],
    [-65, -5, 25],
    [10, 55, 30],
  ];
  for (const [x, z, h] of spots) {
    k.frustum(3, 1.4, h, x, 0, z, '#7a5a6e', 8);
    k.frustum(2, h * 0.28, h * 0.22, x, h * 0.78, z, '#c04a8a', 16, { glow: true, open: true });
    k.ring(h * 0.28, 0.6, x, h, z, '#ff8ac6', true);
  }
  return k.build();
}

// --- Sydney ---------------------------------------------------------------------------
function operaSydney() {
  const k = new Kit();
  k.box(120, 12, 70, 0, 0, 0, '#d8b89a');
  // Shells: spherical triangles cut from one sphere (Utzon's solution), in two rows back to back.
  const shell = (x: number, z: number, s: number, flip: boolean) => {
    const g = new THREE.SphereGeometry(1, 12, 10, 0, Math.PI * 0.45, 0, Math.PI * 0.5);
    g.scale(s, s * 1.15, s).rotateY(flip ? Math.PI * 0.77 : -Math.PI * 0.23).translate(x, 12, z);
    k.add(g, '#f4f2ea', true);
  };
  [
    [-40, -14, 30],
    [-14, -14, 26],
    [8, -14, 20],
  ].forEach(([x, z, s]) => {
    shell(x, z, s, false);
    shell(x + 4, z, s * 0.9, true);
  });
  [
    [-40, 18, 24],
    [-18, 18, 20],
    [2, 18, 15],
  ].forEach(([x, z, s]) => {
    shell(x, z, s, false);
    shell(x + 3, z, s * 0.9, true);
  });
  return k.build();
}

function harbourBridge() {
  const k = new Kit();
  const steel = '#8a9096';
  const span = 503;
  const half = span / 2;
  const deck = 49;
  const crown = 134;
  k.box(1149, 3, 49, 0, deck, 0, '#a4aab2');
  for (const z of [-14, 14]) {
    const upper: THREE.Vector3[] = [];
    const lower: THREE.Vector3[] = [];
    for (let i = 0; i <= 40; i++) {
      const x = -half + (span * i) / 40;
      const t = x / half;
      upper.push(V(x, crown - (crown - 60) * t * t, z));
      lower.push(V(x, crown - 18 - (crown - 18 - 12) * t * t, z));
    }
    k.cable(upper, 2.2, steel);
    k.cable(lower, 2.2, steel);
    for (let i = 0; i <= 40; i += 2) {
      k.rod(upper[i], lower[i], 0.7, steel);
      if (Math.abs(upper[i].x) < half - 30) k.rod(lower[i], V(upper[i].x, deck + 2, z), 0.5, steel);
    }
  }
  for (const x of [-half - 10, half + 10]) for (const z of [-22, 22]) k.box(16, 89, 16, x, 0, z, '#d8c8a8', { glow: true });
  return k.build();
}

function sydneyTower() {
  const k = new Kit();
  k.frustum(3.5, 3.2, 250 * H * 1.1, 0, 0, 0, '#dfe2e6', 12);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    k.rod(V(Math.cos(a) * 5, 0, Math.sin(a) * 5), V(Math.cos(a) * 5, 170, Math.sin(a) * 5), 0.4, '#b8bec6');
  }
  k.frustum(10, 14, 20, 0, 170, 0, '#e3b340', 16, { glow: true });
  k.frustum(14, 10, 10, 0, 190, 0, '#e3b340', 16, { glow: true });
  k.frustum(1.6, 0.4, 30, 0, 200, 0, '#e8eaee', 8);
  return k.build();
}

// ---------------------------------------------------------------------------------------
type New = Extract<
  CityId,
  | 'washington' | 'chicago' | 'boston' | 'mexicocity' | 'saopaulo' | 'moscow' | 'stockholm' | 'vienna' | 'helsinki' | 'amsterdam' | 'oslo'
  | 'cairo' | 'delhi' | 'shanghai' | 'beijing' | 'guangzhou' | 'shenzhen' | 'chengdu' | 'hangzhou' | 'wuhan' | 'chongqing' | 'osaka' | 'taipei'
  | 'singapore' | 'sydney'
>;

export const WORLD_LANDMARKS: Record<New, Placed[]> = {
  washington: [
    { build: washingtonMonument, at: [-77.03524, 38.88948], clear: 30 },
    { build: capitol, at: [-77.00902, 38.88981], rot: Math.PI / 2, clear: 130 },
    { build: lincolnMemorial, at: [-77.05021, 38.88926], rot: Math.PI / 2, clear: 40 },
  ],
  chicago: [
    { build: willisTower, at: [-87.63596, 41.87874], clear: 45 },
    { build: cloudGate, at: [-87.62334, 41.88268], clear: 15 },
    {
      build: () => wheel({ R: 27, hub: 31, cars: 42, legs: 'a', rim: '#ffffff', carColors: ['#6fc3ff', '#ffffff'], glowCars: true }),
      at: [-87.60747, 41.8917],
      rot: 0,
      clear: 35,
    },
  ],
  boston: [
    { build: zakim, at: [-71.06296, 42.3686], toward: [-71.062, 42.3702], cutHalf: 220 },
    { build: stateHouse, at: [-71.06388, 42.3586], clear: 40 },
    { build: prudential, at: [-71.08251, 42.34717], clear: 35 },
  ],
  mexicocity: [
    { build: bellasArtes, at: [-99.14126, 19.4355], clear: 60 },
    { build: angel, at: [-99.16767, 19.427], clear: 16 },
    { build: torreLatino, at: [-99.14061, 19.43387], clear: 25 },
  ],
  saopaulo: [
    { build: masp, at: [-46.65597, -23.5615], rot: 0.72, clear: 45 },
    { build: copan, at: [-46.64453, -23.54659], rot: -0.5, clear: 70 },
    { build: ponteEstaiada, at: [-46.6993, -23.6109], rot: 1.35 },
  ],
  moscow: [
    { build: stBasils, at: [37.62316, 55.75247], clear: 45 },
    { build: spasskaya, at: [37.62135, 55.75253], rot: -0.7, clear: 18 },
    { build: msu, at: [37.53076, 55.70291], rot: 0.05, clear: 140 },
    { build: ostankino, at: [37.6117, 55.8197], clear: 40 },
  ],
  stockholm: [
    { build: stadshuset, at: [18.05421, 59.32749], rot: 0.35, clear: 70 },
    { build: globen, at: [18.08321, 59.29362], clear: 70 },
  ],
  vienna: [
    { build: stephansdom, at: [16.37313, 48.20849], rot: -0.12, clear: 70 },
    {
      build: () => wheel({ R: 30, hub: 34, cars: 15, legs: 'a', rim: '#8a3a30', carColors: ['#b83a2e'], glowCars: true }),
      at: [16.39591, 48.21674],
      rot: 0.6,
      clear: 40,
    },
    { build: karlskirche, at: [16.3719, 48.19828], rot: 0.05, clear: 45 },
  ],
  helsinki: [
    { build: tuomiokirkko, at: [24.95218, 60.17042], clear: 50 },
    { build: uspenski, at: [24.95993, 60.16846], clear: 35 },
    { build: helsinkiStation, at: [24.94059, 60.17155], rot: 0.05, clear: 60 },
  ],
  amsterdam: [
    { build: centraal, at: [4.90058, 52.3789], rot: 0.12, clear: 150 },
    { build: rijksmuseum, at: [4.88504, 52.35984], rot: 0.55, clear: 70 },
    { build: windmill, at: [4.9265, 52.3667], clear: 18 },
  ],
  oslo: [
    { build: operaHouse, at: [10.75268, 59.90752], rot: -0.3, clear: 70 },
    { build: radhus, at: [10.73372, 59.91208], clear: 45 },
    { build: holmenkollen, at: [10.66679, 59.96445], rot: 0.9, clear: 40 },
  ],
  cairo: [
    { build: cairoTower, at: [31.22431, 30.04601], clear: 20 },
    { build: () => pyramid(230, 139), at: [31.13421, 29.97916], rot: 0.02, clear: 170 },
    { build: () => pyramid(215, 136, true), at: [31.1308, 29.9761], rot: 0.02, clear: 160 },
    { build: () => pyramid(103, 65), at: [31.1281, 29.9725], rot: 0.02, clear: 80 },
    { build: sphinx, at: [31.1376, 29.9753], rot: -Math.PI / 2, clear: 40 },
    { build: muhammadAli, at: [31.25983, 30.02907], clear: 50 },
  ],
  delhi: [
    { build: indiaGate, at: [77.22949, 28.61293], clear: 25 },
    { build: qutubMinar, at: [77.18545, 28.52441], clear: 15 },
    { build: lotusTemple, at: [77.2588, 28.5535], clear: 50 },
  ],
  shanghai: [
    { build: orientalPearl, at: [121.49526, 31.24195], clear: 55 },
    { build: shanghaiTower, at: [121.50125, 31.23564], clear: 50 },
    { build: swfc, at: [121.50304, 31.23658], rot: 0.78, clear: 40 },
  ],
  beijing: [
    { build: tiananmen, at: [116.3913, 39.9075], clear: 70 },
    { build: templeOfHeaven, at: [116.4074, 39.8822], clear: 50 },
    { build: cctv, at: [116.45848, 39.91386], rot: 0.1, clear: 90 },
  ],
  guangzhou: [
    { build: cantonTower, at: [113.31915, 23.10901], clear: 45 },
    { build: gzIfc, at: [113.31786, 23.12025], clear: 40 },
  ],
  shenzhen: [
    { build: pingAn, at: [114.0512, 22.5367], clear: 55 },
    { build: civicCenter, at: [114.05452, 22.54637], clear: 200 },
  ],
  chengdu: [{ build: ifsPanda, at: [104.07933, 30.65833], rot: 0.1, clear: 70 }],
  hangzhou: [
    { build: () => octPagoda({ tiers: 5, r: 11, tierH: 8, wall: '#c9a86a', roof: '#8a6a3c', base: 8 }), at: [120.14501, 30.23388], clear: 25 },
    { build: sunAndMoon, at: [120.2125, 30.2465], clear: 130 },
  ],
  wuhan: [
    { build: yellowCrane, at: [114.29705, 30.54708], clear: 30 },
    { build: () => trussBridge({ length: 1156, spans: 9, deck: 36, color: '#6f7a86' }), at: [114.2835, 30.5518], toward: [114.289, 30.5495], cutHalf: 600 },
  ],
  chongqing: [
    { build: rafflesChongqing, at: [106.58313, 29.56756], rot: -0.6, clear: 150 },
    { build: hongyadong, at: [106.5775, 29.5645], rot: 2.3, clear: 90 },
  ],
  osaka: [
    { build: osakaCastle, at: [135.5258, 34.6873], clear: 60 },
    { build: tsutenkaku, at: [135.50631, 34.65254], clear: 20 },
    { build: umedaSky, at: [135.49053, 34.70529], clear: 55 },
  ],
  taipei: [
    { build: taipei101, at: [121.5645, 25.03384], clear: 45 },
    { build: ckshall, at: [121.52178, 25.03458], clear: 60 },
    { build: grandHotel, at: [121.5262, 25.0791], clear: 90 },
  ],
  singapore: [
    { build: marinaBaySands, at: [103.8607, 1.2835], rot: Math.PI / 2 + 0.25, clear: 150 },
    { build: supertrees, at: [103.86394, 1.282], clear: 20 },
    {
      build: () => wheel({ R: 70, hub: 80, cars: 28, legs: 'a', rim: '#f4f6f8', carColors: ['#dff3ff'], glowCars: true }),
      at: [103.86326, 1.28944],
      rot: 0.3,
      clear: 60,
    },
  ],
  sydney: [
    { build: operaSydney, at: [151.21512, -33.8572], rot: 1.1, clear: 70 },
    { build: harbourBridge, at: [151.21078, -33.85212], toward: [151.2118, -33.8477], cutHalf: 580 },
    { build: sydneyTower, at: [151.20895, -33.8705], clear: 15 },
  ],
};
