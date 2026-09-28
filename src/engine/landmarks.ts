import * as THREE from 'three';
import { CITIES } from '../../shared/cities.ts';
import { makeProjection } from '../../shared/geo.ts';
import type { CityId } from '../../shared/types.ts';
import { Kit, V, suspensionBridge, wheel, type Placed } from './landmarkKit.ts';
import { WORLD_LANDMARKS } from './landmarksWorld.ts';
import type { FrameInfo, Layer } from './world.ts';

// Hand-built toy landmarks. Local frame: x east, y up, z south, meters. Each landmark is placed at its
// real coordinates; bridges are aligned between their real tower positions.

// ---------------------------------------------------------------------------
// Models (built around the origin)
// ---------------------------------------------------------------------------
function statueOfLiberty() {
  const k = new Kit();
  const s = 1.25;
  // Fort Wood's star base.
  const star = new THREE.Shape();
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2;
    const r = (i % 2 ? 38 : 58) * s;
    if (i === 0) star.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else star.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  k.add(new THREE.ExtrudeGeometry(star, { depth: 9 * s, bevelEnabled: false }).rotateX(-Math.PI / 2), '#d8c9a8');
  k.frustum(15 * s, 12 * s, 27 * s, 0, 9 * s, 0, '#cdb892', 4, { glow: true });
  k.box(20 * s, 3 * s, 20 * s, 0, 36 * s, 0, '#c2ab82');
  const g = '#7cc7ad';
  k.frustum(7 * s, 4.6 * s, 26 * s, 0, 39 * s, 0, g, 10);
  k.frustum(4.6 * s, 3.2 * s, 6 * s, 0, 65 * s, 0, g, 10);
  k.sphere(3.1 * s, 0, 73.5 * s, 0, g);
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI / 2 + ((i - 3) / 3) * 1.1;
    k.rod(V(0, 75 * s, 0), V(Math.cos(a) * 6.5 * s, 78 * s, Math.sin(a) * 6.5 * s - 1), 0.6 * s, g);
  }
  k.rod(V(3 * s, 66 * s, 0), V(5 * s, 86 * s, 0), 1.3 * s, g);
  k.frustum(1.3 * s, 2 * s, 3 * s, 5 * s, 86 * s, 0, '#d9b24a');
  k.cone(1.9 * s, 4.5 * s, 5 * s, 89 * s, 0, '#ffc93c', 8, true);
  k.box(1.5 * s, 7 * s, 5 * s, -4.5 * s, 58 * s, -1 * s, g);
  return k.build();
}

function empireState() {
  const k = new Kit();
  const h = 0.62;
  const stone = '#e7ddc9';
  k.box(110, 25 * h, 55, 0, 0, 0, '#dcd1bc');
  k.box(62, 240 * h, 46, 0, 25 * h, 0, stone);
  k.box(46, 60 * h, 34, 0, 265 * h, 0, stone);
  k.box(32, 30 * h, 24, 0, 325 * h, 0, stone);
  k.box(20, 26 * h, 20, 0, 355 * h, 0, '#f4f0e6', { glow: true });
  k.frustum(8, 3, 60 * h, 0, 381 * h, 0, '#cfd6e0', 8, { glow: true });
  k.rod(V(0, 441 * h, 0), V(0, 460 * h, 0), 0.8, '#b0b8c4');
  return k.build();
}

function goldenGate() {
  const o = '#c9432e';
  return suspensionBridge({
    span: 1280,
    towerH: 227,
    deckH: 67,
    width: 30,
    side: 343,
    color: o,
    cableColor: '#b83a28',
    hangers: 32,
    tower: (k, x) => {
      for (const z of [-14, 14]) k.frustum(6.5, 4.5, 227, x, 0, z, o, 4);
      for (const y of [80, 125, 165, 205, 222]) k.box(8, 6, 28, x, y, 0, o);
      k.box(9, 3, 9, x, 227, -14, '#ffdf8a', { glow: true });
      k.box(9, 3, 9, x, 227, 14, '#ffdf8a', { glow: true });
    },
  });
}

function brooklynBridge() {
  const granite = '#cfae86';
  return suspensionBridge({
    span: 486,
    towerH: 84,
    deckH: 38,
    width: 26,
    side: 283,
    color: granite,
    cableColor: '#6d5f55',
    deckColor: '#9a8b7c',
    stays: true,
    hangers: 14,
    tower: (k, x) => {
      k.box(16, 84, 40, x, 0, 0, granite, { glow: true });
      k.box(17, 22, 8, x, 34, -7, '#7c6a58');
      k.box(17, 22, 8, x, 34, 7, '#7c6a58');
      k.box(18, 4, 42, x, 84, 0, '#bb9a74');
    },
  });
}

function transamerica() {
  const k = new Kit();
  const h = 0.62;
  k.frustum(38, 2, 260 * h, 0, 0, 0, '#f3f1ea', 4, { glow: true });
  k.frustum(10, 2, 60 * h, 26, 120 * h, 0, '#ecebe4', 4);
  k.frustum(10, 2, 60 * h, -26, 120 * h, 0, '#ecebe4', 4);
  k.rod(V(0, 255 * h, 0), V(0, 275 * h, 0), 0.8, '#c9c9c9');
  return k.build();
}

function salesforce() {
  const k = new Kit();
  const h = 0.62;
  k.frustum(30, 25, 300 * h, 0, 0, 0, '#e8e4dc', 12);
  k.frustum(25, 16, 26 * h, 0, 300 * h, 0, '#f6f2ea', 12, { glow: true, open: true });
  return k.build();
}

function coitTower() {
  const k = new Kit();
  k.frustum(10, 10, 6, 0, 0, 0, '#e9e1cf', 16);
  k.frustum(6, 5.4, 58, 0, 6, 0, '#f2ecdf', 16, { glow: true });
  k.box(13, 2, 13, 0, 64, 0, '#e2d8c2', { rotY: Math.PI / 4 });
  return k.build();
}

function elizabethTower() {
  const k = new Kit();
  const s = 1.35;
  const stone = '#d9c38f';
  k.box(12 * s, 55 * s, 12 * s, 0, 0, 0, stone, { glow: true });
  k.box(14.5 * s, 16 * s, 14.5 * s, 0, 55 * s, 0, '#cbb07a', { glow: true });
  for (const [x, z] of [
    [7.35, 0],
    [-7.35, 0],
    [0, 7.35],
    [0, -7.35],
  ]) {
    const g = new THREE.CircleGeometry(5.2 * s, 20);
    if (x) g.rotateY(Math.PI / 2 * Math.sign(x));
    else if (z < 0) g.rotateY(Math.PI);
    k.add(g.translate(x * s, 63 * s, z * s), '#fff6d6', true);
  }
  k.box(11 * s, 9 * s, 11 * s, 0, 71 * s, 0, stone);
  k.frustum(8.5 * s, 0.4, 16 * s, 0, 80 * s, 0, '#4a5163', 4);
  k.rod(V(0, 95 * s, 0), V(0, 100 * s, 0), 0.5, '#d9b24a');
  return k.build();
}

function westminster() {
  const k = new Kit();
  const stone = '#d8c796';
  k.box(40, 26, 260, 0, 0, 0, stone, { glow: true });
  k.box(24, 102, 24, 0, 0, 125, '#d1bd88', { glow: true });
  k.frustum(4, 0.3, 14, 0, 102, 125, '#4a5163', 4);
  k.frustum(7, 2, 40, 0, 26, 10, '#ccb883', 8);
  k.cone(4, 26, 0, 66, 10, '#4a5163', 8);
  for (let z = -120; z <= 110; z += 20) k.cone(1.4, 7, 19, 26, z, '#cdb987', 4);
  return k.build();
}

function towerBridge() {
  const k = new Kit();
  const stone = '#e2d4b3';
  const blue = '#76a9d4';
  const span = 76;
  for (const x of [-span / 2, span / 2]) {
    k.box(20, 58, 22, x, 0, 0, stone, { glow: true });
    k.cone(9, 14, x, 58, 0, '#5e6b80', 4);
    for (const [dx, dz] of [
      [-8, -9],
      [8, -9],
      [-8, 9],
      [8, 9],
    ]) {
      k.frustum(2.2, 2.2, 62, x + dx, 0, dz, stone, 8);
      k.cone(2.6, 7, x + dx, 62, dz, '#5e6b80', 8);
    }
    k.box(21, 2, 23, x, 40, 0, '#ffe7a8', { glow: true });
  }
  k.box(span, 4, 5, 0, 44, -6, blue);
  k.box(span, 4, 5, 0, 44, 6, blue);
  k.box(span + 60, 3, 18, 0, 10, 0, blue);
  for (const sgn of [-1, 1]) {
    for (const z of [-8, 8]) {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 10; i++) {
        const t = i / 10;
        const x = sgn * (span / 2 + t * 80);
        pts.push(V(x, 40 - 30 * Math.sin(t * Math.PI * 0.5) + 6 * t * t, z));
      }
      k.cable(pts, 1.2, blue);
    }
  }
  return k.build();
}

function shard() {
  const k = new Kit();
  const h = 0.62;
  k.frustum(34, 5, 300 * h, 0, 0, 0, '#bfd7ea', 5);
  k.frustum(5, 1, 16 * h, 2, 300 * h, 0, '#dfeef8', 5, { glow: true });
  return k.build();
}

function stPauls() {
  const k = new Kit();
  const stone = '#ebe4d2';
  k.box(40, 30, 150, 0, 0, 0, stone, {});
  k.box(95, 30, 34, 0, 0, 10, stone);
  k.box(14, 60, 14, -14, 0, 70, stone);
  k.box(14, 60, 14, 14, 0, 70, stone);
  k.frustum(20, 20, 26, 0, 30, 10, stone, 20, { glow: true });
  k.sphere(19, 0, 56, 10, '#a9b2bb', { half: true, sy: 1.3, glow: true });
  k.frustum(4, 3, 14, 0, 80, 10, stone, 10);
  k.sphere(3, 0, 96, 10, '#e7c65b');
  return k.build();
}

function tokyoTower() {
  const k = new Kit();
  const h = 0.85;
  const orange = '#ff5b24';
  const white = '#f7f3ee';
  const bands = [
    [0, 30, 48, 36],
    [30, 60, 36, 26],
    [60, 90, 26, 19],
    [90, 125, 19, 13],
    [125, 150, 13, 10],
  ];
  bands.forEach(([y0, y1, r0, r1], i) => k.frustum(r0, r1, (y1 - y0) * h, 0, y0 * h, 0, i % 2 ? white : orange, 4, { glow: true, open: true }));
  // Legs to the ground read as a lattice.
  for (const [x, z] of [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ])
    k.rod(V(x * 44, 0, z * 44), V(x * 30, 60 * h, z * 30), 3, orange, true);
  k.box(28, 12 * h, 28, 0, 150 * h, 0, '#fdf4e8', { glow: true, rotY: Math.PI / 4 });
  const upper = [
    [162, 200, 10, 7, orange],
    [200, 225, 7, 5.5, white],
    [225, 250, 5.5, 4.5, orange],
  ] as const;
  for (const [y0, y1, r0, r1, c] of upper) k.frustum(r0, r1, (y1 - y0) * h, 0, y0 * h, 0, c, 4, { glow: true });
  k.box(12, 7 * h, 12, 0, 250 * h, 0, '#fdf4e8', { glow: true, rotY: Math.PI / 4 });
  k.frustum(3.5, 1, 70 * h, 0, 257 * h, 0, white, 6, { glow: true });
  k.frustum(1, 0.5, 10 * h, 0, 327 * h, 0, orange, 6, { glow: true });
  return k.build();
}

function skytree() {
  const k = new Kit();
  const h = 0.6;
  k.frustum(34, 18, 340 * h, 0, 0, 0, '#e6eef6', 9, { glow: true });
  k.frustum(26, 26, 20 * h, 0, 340 * h, 0, '#d7e4f1', 16, { glow: true });
  k.frustum(18, 12, 105 * h, 0, 360 * h, 0, '#e6eef6', 9);
  k.frustum(17, 17, 12 * h, 0, 445 * h, 0, '#d7e4f1', 16, { glow: true });
  k.frustum(10, 3, 140 * h, 0, 457 * h, 0, '#eef3f8', 8, { glow: true });
  k.rod(V(0, 597 * h, 0), V(0, 634 * h, 0), 1.2, '#dfe7ef');
  return k.build();
}

function rainbowBridge() {
  return suspensionBridge({
    span: 570,
    towerH: 126,
    deckH: 52,
    width: 34,
    side: 190,
    color: '#f3f4f6',
    cableColor: '#e9ecef',
    hangers: 20,
    glowTowers: true,
    tower: (k, x) => {
      for (const z of [-15, 15]) k.frustum(5, 4, 126, x, 0, z, '#f3f4f6', 4, { glow: true });
      for (const y of [60, 96, 120]) k.box(6, 5, 30, x, y, 0, '#eceef1');
    },
  });
}

function pagoda() {
  const k = new Kit();
  const s = 1.4;
  const red = '#d23a3a';
  for (let i = 0; i < 5; i++) {
    const w = (14 - i * 1.6) * s;
    const y = i * 9 * s;
    k.box(w, 7 * s, w, 0, y, 0, red);
    k.frustum((w * 0.95), w * 0.55, 2.4 * s, 0, y + 7 * s, 0, '#384050', 4);
  }
  k.rod(V(0, 45 * s, 0), V(0, 58 * s, 0), 0.6 * s, '#e0b340');
  return k.build();
}

function fuji(scale: number) {
  const k = new Kit();
  // Toy proportions: the real cone is far flatter, which reads as a disc from above.
  const r = 6200 * scale;
  const h = 5200 * scale;
  const prof: THREE.Vector2[] = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    prof.push(new THREE.Vector2(r * (1 - t) ** 1.35 + r * 0.06, h * t));
  }
  prof.push(new THREE.Vector2(0, h * 0.99));
  const lathe = new THREE.LatheGeometry(prof, 28);
  // Paint: snow above 68% height.
  const g = lathe.toNonIndexed();
  const pos = g.getAttribute('position');
  const cols: number[] = [];
  const snow = new THREE.Color('#fbfdff');
  const rock = new THREE.Color('#7189b9');
  const low = new THREE.Color('#5d7aa8');
  for (let i = 0; i < pos.count; i += 3) {
    const y = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
    const t = y / h;
    const wobble = Math.sin(Math.atan2(pos.getZ(i), pos.getX(i)) * 9) * 0.035;
    const c = t > 0.66 + wobble ? snow : t < 0.2 ? low : rock;
    for (let j = 0; j < 3; j++) cols.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }));
  const group = new THREE.Group();
  group.add(mesh);
  // A collar of cloud puffs around the lower slopes.
  const puffMat = new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: '#eef3ff', emissiveIntensity: 0.35, flatShading: true });
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const pr = r * (0.62 + (i % 3) * 0.08);
    const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(r * (0.22 + (i % 4) * 0.04), 1).scale(1.3, 0.6, 1), puffMat);
    puff.position.set(Math.cos(a) * pr, h * (0.2 + (i % 2) * 0.06), Math.sin(a) * pr);
    group.add(puff);
  }
  void k;
  return group;
}

// --- Paris -------------------------------------------------------------------
function eiffelTower() {
  const k = new Kit();
  const h = 0.62;
  const Y = (m: number) => m * h;
  const iron = '#b0875e';
  const deck = '#94704d';
  const corners = [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ];
  // Four splayed legs to the first floor, then to the second, then the spire, bowing inward as they rise.
  for (const [sx, sz] of corners) {
    k.cable([V(sx * 62, 0, sz * 62), V(sx * 50, Y(30), sz * 50), V(sx * 40, Y(57), sz * 40)], 6.5, iron, true);
    k.cable([V(sx * 37, Y(60), sz * 37), V(sx * 27, Y(90), sz * 27), V(sx * 19, Y(115), sz * 19)], 4.2, iron, true);
    k.cable([V(sx * 17, Y(118), sz * 17), V(sx * 10, Y(180), sz * 10), V(sx * 4, Y(272), sz * 4)], 2.6, iron, true);
  }
  // The great arches between the legs.
  for (let side = 0; side < 4; side++) {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      const y = 4 + Y(36) * Math.sin(t * Math.PI);
      const inset = 62 - (22 * y) / Y(57);
      const u = -54 + 108 * t;
      pts.push(side === 0 ? V(u, y, inset) : side === 1 ? V(u, y, -inset) : side === 2 ? V(inset, y, u) : V(-inset, y, u));
    }
    k.cable(pts, 1.7, iron, true);
  }
  k.box(86, 5, 86, 0, Y(53), 0, deck, { glow: true });
  k.box(46, 4, 46, 0, Y(113), 0, deck, { glow: true });
  // Braces across the spire.
  for (const yr of [150, 190, 230]) {
    const hw = 17 - ((17 - 4) * (yr - 118)) / 154;
    k.box(hw * 2 + 3, 2, hw * 2 + 3, 0, Y(yr), 0, deck, { glow: true });
  }
  k.box(10, Y(14), 10, 0, Y(270), 0, deck, { glow: true });
  k.box(5, Y(10), 5, 0, Y(284), 0, '#fff1b0', { glow: true });
  k.rod(V(0, Y(294), 0), V(0, Y(330), 0), 1, '#d9d4cc');
  return k.build();
}

function arcDeTriomphe() {
  const k = new Kit();
  const s = 1.5;
  const stone = '#efe4cc';
  for (const x of [-15.5, 15.5]) {
    k.box(14 * s, 30 * s, 22 * s, x * s, 0, 0, stone, { glow: true });
    // The small arches through the piers, seen on the outer faces.
    k.box(0.8, 17 * s, 7 * s, Math.sign(x) * 22.6 * s, 0, 0, '#9d917d');
  }
  k.box(45 * s, 20 * s, 22 * s, 0, 30 * s, 0, stone, { glow: true });
  k.box(47 * s, 1.6 * s, 24 * s, 0, 44 * s, 0, '#e0d2b3');
  k.box(47 * s, 1.4 * s, 24 * s, 0, 30 * s, 0, '#e0d2b3');
  return k.build();
}

function notreDame() {
  const k = new Kit();
  const stone = '#eadfc4';
  const roof = '#6c7889';
  // Nave along +x (east), west front at -x.
  k.box(112, 30, 36, 6, 0, 0, stone, { glow: true });
  // A steep lead roof: a triangular prism along the nave, apex up.
  k.add(new THREE.CylinderGeometry(19, 19, 112, 3, 1).rotateZ(Math.PI / 2).rotateX(-Math.PI / 2).scale(1, 0.7, 1.1).translate(6, 36.6, 0), roof);
  k.box(14, 30, 50, 22, 0, 0, stone, { glow: true });
  k.frustum(19, 19, 30, 62, 0, 0, stone, 10, { glow: true });
  k.cone(19.5, 16, 62, 30, 0, roof, 10);
  // The west front and its two square towers.
  k.box(16, 44, 44, -50, 0, 0, stone, { glow: true });
  for (const z of [-14, 14]) k.box(15, 69, 15, -50, 0, z, stone, { glow: true });
  const rose = new THREE.CircleGeometry(6, 18).rotateY(-Math.PI / 2).translate(-58.2, 30, 0);
  k.add(rose, '#ffd98a', true);
  // The spire over the crossing.
  k.cone(3.2, 50, 22, 44, 0, '#58626f', 8);
  return k.build();
}

function sacreCoeur() {
  const k = new Kit();
  const white = '#f8f5ec';
  k.box(44, 26, 70, 0, 0, 0, white, { glow: true });
  k.frustum(16, 16, 20, 0, 26, 0, white, 16, { glow: true });
  k.sphere(16, 0, 46, 0, white, { half: true, sy: 1.5, glow: true });
  k.frustum(3.4, 3, 8, 0, 70, 0, white, 10);
  k.cone(3, 7, 0, 78, 0, white, 10);
  for (const [x, z] of [
    [-16, 22],
    [16, 22],
    [-16, -22],
    [16, -22],
  ]) {
    k.frustum(6, 6, 8, x, 26, z, white, 12);
    k.sphere(6, x, 34, z, white, { half: true, sy: 1.5 });
  }
  k.box(30, 18, 10, 0, 0, 38, white);
  // The bell tower behind.
  k.box(11, 58, 11, 0, 0, -40, white, { glow: true });
  k.sphere(5.5, 0, 58, -40, white, { half: true, sy: 1.6 });
  return k.build();
}

function louvrePyramid() {
  const k = new Kit();
  k.cone(31, 28, 0, 0, 0, '#bfe4f4', 4, true);
  for (const [x, z] of [
    [0, -40],
    [-40, 0],
    [40, 0],
  ])
    k.cone(7, 6, x, 0, z, '#bfe4f4', 4, true);
  return k.build();
}

// --- Berlin ------------------------------------------------------------------
function fernsehturm() {
  const k = new Kit();
  const h = 0.62;
  const concrete = '#ece9e2';
  k.frustum(40, 34, 10, 0, 0, 0, '#d9d5cc', 8);
  k.frustum(12, 5.5, 200 * h, 0, 0, 0, concrete, 16, { glow: true });
  // The sphere: steel panels with a band of lit windows.
  k.sphere(19, 0, 213 * h, 0, '#c4ccd6');
  k.ring(19.3, 1.6, 0, 213 * h + 2, 0, '#fff0bd', true);
  k.ring(18, 0.9, 0, 213 * h + 8, 0, '#fff0bd', true);
  k.frustum(5.5, 4, 40 * h, 0, 230 * h, 0, concrete, 12);
  const bands = 8;
  for (let i = 0; i < bands; i++) {
    const y0 = 270 + (i * 98) / bands;
    k.frustum(3.4 - i * 0.3, 3.1 - i * 0.3, (98 / bands) * h, 0, y0 * h, 0, i % 2 ? '#f6f4ef' : '#e2463c', 8, { glow: true });
  }
  return k.build();
}

function brandenburgGate() {
  const k = new Kit();
  const s = 1.6;
  const stone = '#eadfc4';
  k.box(66 * s, 1.5 * s, 14 * s, 0, 0, 0, '#d6cab0');
  for (const x of [-27.5, -16.5, -5.5, 5.5, 16.5, 27.5]) {
    k.box(4 * s, 15 * s, 8 * s, x * s, 1.5 * s, 0, stone, { glow: true });
    for (const z of [-5, 5]) k.frustum(1.1 * s, 0.95 * s, 15 * s, x * s, 1.5 * s, z * s, stone, 8, { glow: true });
  }
  k.box(66 * s, 4 * s, 13 * s, 0, 16.5 * s, 0, stone, { glow: true });
  k.box(36 * s, 3.5 * s, 11 * s, 0, 20.5 * s, 0, '#e2d6ba', { glow: true });
  // The Quadriga, in verdigris.
  const verd = '#5f9c86';
  k.box(8 * s, 2.6 * s, 4 * s, 0, 24 * s, 0, verd);
  for (const x of [-3, -1, 1, 3]) k.box(1.2 * s, 1.6 * s, 1.2 * s, x * s, 26.6 * s, 1.4 * s, verd);
  k.frustum(0.7 * s, 0.5 * s, 4 * s, 0, 26.6 * s, -0.8 * s, verd, 6);
  k.box(0.3 * s, 2.4 * s, 2.4 * s, 0, 30 * s, -0.8 * s, verd);
  return k.build();
}

function reichstag() {
  const k = new Kit();
  const stone = '#e5dbc3';
  k.box(94, 24, 137, 0, 0, 0, stone, { glow: true });
  for (const x of [-40, 40]) for (const z of [-60, 60]) k.box(22, 33, 22, x, 0, z, '#ddd1b6', { glow: true });
  // West portico and pediment.
  k.box(10, 24, 40, -50, 0, 0, stone, { glow: true });
  k.hip(12, 42, 1, 42, 7, -50, 24, 0, '#d5c9ad');
  // Norman Foster's glass dome.
  k.frustum(21, 21, 3, 0, 24, 0, '#aeb9c2', 24);
  k.sphere(20, 0, 27, 0, '#c6ecfb', { half: true, sy: 1.0, glow: true });
  return k.build();
}

function siegessaule() {
  const k = new Kit();
  const s = 1.3;
  const gold = '#f0c64a';
  k.box(22 * s, 6 * s, 22 * s, 0, 0, 0, '#c68b76');
  k.frustum(10 * s, 10 * s, 11 * s, 0, 6 * s, 0, '#e3dccd', 16, { glow: true });
  k.frustum(3.3 * s, 2.8 * s, 32 * s, 0, 17 * s, 0, '#e8e1d0', 12, { glow: true });
  for (const y of [22, 30, 38]) k.ring(3.4 * s, 0.7 * s, 0, y * s, 0, gold);
  k.box(7 * s, 2 * s, 7 * s, 0, 49 * s, 0, '#e3dccd');
  // Victoria ("Goldelse") with her wings spread.
  k.frustum(1.6 * s, 0.8 * s, 7 * s, 0, 51 * s, 0, gold, 8, { glow: true });
  k.sphere(0.9 * s, 0, 58.6 * s, 0, gold, { glow: true });
  k.box(0.4 * s, 4 * s, 6 * s, 0, 53.5 * s, -1.2 * s, gold, { glow: true, rotY: 0.2 });
  return k.build();
}

function berlinerDom() {
  const k = new Kit();
  const stone = '#dcd2bb';
  const green = '#6fae96';
  k.box(73, 30, 114, 0, 0, 0, stone, { glow: true });
  k.frustum(23, 23, 18, 0, 30, 0, stone, 16, { glow: true });
  k.sphere(23, 0, 48, 0, green, { half: true, sy: 1.25 });
  k.frustum(4, 3.4, 9, 0, 76, 0, stone, 8);
  k.sphere(3, 0, 88, 0, '#e7c65b');
  for (const x of [-28, 28]) {
    for (const z of [-44, 44]) {
      k.box(12, 42, 12, x, 0, z, stone, { glow: true });
      k.sphere(6.5, x, 42, z, green, { half: true, sy: 1.6 });
    }
  }
  return k.build();
}

// --- Madrid ------------------------------------------------------------------
function puertaDeAlcala() {
  const k = new Kit();
  const s = 1.6;
  const granite = '#ecdfc5';
  k.box(43 * s, 1 * s, 10 * s, 0, 0, 0, '#d6c8ab');
  // Six piers leave five openings: square ones at the ends, round arches in the middle.
  const open = [3.2, 5.2, 5.2, 5.2, 3.2];
  const pier = (41 - open.reduce((a, b) => a + b, 0)) / 6;
  let x = -20.5;
  for (let i = 0; i < 6; i++) {
    k.box(pier * s, 12 * s, 9 * s, (x + pier / 2) * s, 1 * s, 0, granite, { glow: true });
    x += pier;
    if (i < 5) {
      if (i >= 1 && i <= 3) k.box(open[i] * s, 2.4 * s, 9 * s, (x + open[i] / 2) * s, 10.6 * s, 0, granite, { glow: true });
      x += open[i];
    }
  }
  k.box(42 * s, 3 * s, 10 * s, 0, 13 * s, 0, granite, { glow: true });
  k.box(16 * s, 5 * s, 8 * s, 0, 16 * s, 0, '#e6d8bb', { glow: true });
  k.hip(10 * s, 6 * s, 3 * s, 4 * s, 3 * s, 0, 21 * s, 0, '#d8c8a6');
  return k.build();
}

function torreKio() {
  // One of the Puerta de Europa towers, leaning 15° toward its twin (local +x).
  const k = new Kit();
  const h = 114 * 0.75;
  const lean = Math.tan((15 * Math.PI) / 180) * (114 / h);
  k.leanBox(36, h, 36, 0, 0, 0, '#a9bfd0', lean, true);
  k.leanBox(37, 1.2, 37, lean * h * 0.33, h * 0.33, 0, '#e25a4c', lean);
  k.leanBox(38, 3, 38, lean * h, h, 0, '#8ea4b5', 0);
  return k.build();
}

function metropolis() {
  const k = new Kit();
  const white = '#f4ecdb';
  // The rotunda on the corner of Gran Vía and Alcalá, with its slate dome and gilded trim.
  k.frustum(11, 11, 34, 0, 0, 0, white, 18, { glow: true });
  for (const y of [12, 22, 32]) k.ring(11.2, 0.6, 0, y, 0, '#dcc9a4');
  k.sphere(11.5, 0, 34, 0, '#2d3441', { half: true, sy: 1.3 });
  k.ring(11.6, 0.8, 0, 35, 0, '#e2b94c', true);
  k.frustum(2.4, 1.8, 5, 0, 48, 0, '#2d3441', 8);
  // The winged Victory on top.
  k.frustum(1.3, 0.6, 5, 0, 53, 0, '#f0c64a', 8, { glow: true });
  k.box(0.4, 3, 5.5, 0, 55, 0, '#f0c64a', { glow: true });
  // The two wings of the building, down each street.
  k.box(34, 30, 16, -18, 0, -12, white, { rotY: -0.4, glow: true });
  k.box(34, 30, 16, -18, 0, 12, white, { rotY: 0.4, glow: true });
  return k.build();
}

// --- Seoul -------------------------------------------------------------------
function namsanTower() {
  const k = new Kit();
  // Namsan is a 243 m hill; on a flat map it gets a little green knoll instead.
  k.frustum(120, 36, 34, 0, 0, 0, '#8fcf78', 20);
  k.frustum(36, 20, 8, 0, 34, 0, '#7cc267', 20);
  k.frustum(16, 14, 12, 0, 42, 0, '#eef0f2', 12, { glow: true });
  k.frustum(6.5, 5, 74, 0, 54, 0, '#f3f3ef', 12, { glow: true });
  k.frustum(10, 15, 6, 0, 112, 0, '#dfe7ef', 16);
  k.frustum(15, 15, 8, 0, 118, 0, '#bfe0ff', 16, { glow: true });
  k.frustum(15, 9, 5, 0, 126, 0, '#dfe7ef', 16);
  for (let i = 0; i < 8; i++) k.frustum(3.2 - i * 0.3, 2.9 - i * 0.3, 7, 0, 131 + i * 7, 0, i % 2 ? '#f6f4ef' : '#e2463c', 8, { glow: true });
  return k.build();
}

function lotteWorldTower() {
  const k = new Kit();
  const h = 0.62;
  const prof = [
    [0, 44],
    [120, 41],
    [240, 35],
    [340, 27],
    [430, 19],
    [500, 13],
  ];
  for (let i = 1; i < prof.length; i++) {
    const [y0, r0] = prof[i - 1];
    const [y1, r1] = prof[i];
    k.frustum(r0, r1, (y1 - y0) * h, 0, y0 * h, 0, '#dce9f2', 8, { glow: true });
  }
  // The open lantern at the top, split by its seam.
  k.frustum(13, 8, 55 * h, 0, 500 * h, 0, '#eef5fa', 8, { glow: true, open: true });
  k.box(1.2, 55 * h, 30, 0, 500 * h, 0, '#b7c7d4');
  return k.build();
}

/** A Korean fortress gate: stone base with arched tunnels, a wooden pavilion and tiled hip roofs. */
function koreanGate(o: { w: number; d: number; arches: number; storeys: number }) {
  const k = new Kit();
  const s = 1.5;
  const { w, d } = o;
  k.box(w * s, 9 * s, d * s, 0, 0, 0, '#d3cbba', { glow: true });
  for (let i = 0; i < o.arches; i++) {
    const x = (i - (o.arches - 1) / 2) * 8 * s;
    for (const z of [-1, 1]) k.box((i === (o.arches - 1) / 2 ? 5.5 : 4.2) * s, 6 * s, 0.6, x, 0, (z * d * s) / 2, '#4d4540');
  }
  const red = '#b8483b';
  const green = '#3f8f7a';
  const roof = '#565c66';
  let y = 9 * s;
  let bw = (w - 6) * s;
  let bd = (d - 3) * s;
  for (let i = 0; i < o.storeys; i++) {
    k.box(bw, 4.2 * s, bd, 0, y, 0, red, { glow: true });
    k.box(bw + 0.8 * s, 0.8 * s, bd + 0.8 * s, 0, y + 4.2 * s, 0, green);
    y += 5 * s;
    // Flared eaves, then the steeper upper roof.
    k.hip(bw + 6 * s, bd + 6 * s, bw + 1 * s, bd + 1 * s, 1.4 * s, 0, y - 0.4 * s, 0, roof);
    k.hip(bw + 1 * s, bd + 1 * s, bw * 0.55, 0.8 * s, 3.4 * s, 0, y + 1 * s, 0, roof);
    y += i === o.storeys - 1 ? 0 : 2.6 * s;
    bw *= 0.82;
    bd *= 0.82;
  }
  return k.build();
}

function building63() {
  const k = new Kit();
  const h = 0.62;
  k.hip(62, 32, 26, 28, 249 * h, 0, 0, 0, '#e9c25b', true);
  k.box(28, 6, 29, 0, 249 * h, 0, '#d9ae42');
  return k.build();
}

function ddp() {
  const k = new Kit();
  // Dongdaemun Design Plaza: a long, low silver pebble.
  k.add(new THREE.SphereGeometry(1, 28, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(62, 27, 118), '#cfd7df', true);
  k.add(new THREE.SphereGeometry(1, 20, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(40, 20, 44).translate(52, 0, 60), '#d6dde4', true);
  return k.build();
}

// --- Hong Kong ---------------------------------------------------------------
function bankOfChina() {
  const k = new Kit();
  const h = 0.62;
  const a = 26;
  const glass = '#a3c6e2';
  const white = '#f4f7fa';
  const c = [
    [a, a],
    [-a, a],
    [-a, -a],
    [a, -a],
  ] as [number, number][];
  // Four triangular shafts meet at the core and stop at different heights.
  const tops = [180, 240, 290, 315].map((m) => m * h);
  for (let i = 0; i < 4; i++) {
    const p = c[i];
    const q = c[(i + 1) % 4];
    k.prism([[0, 0], p, q], tops[i], 0, glass, true);
    // The white X-bracing on the outer face.
    const n = Math.max(2, Math.round(tops[i] / 36));
    const out = 0.8;
    const P = (pt: [number, number], y: number) => V(pt[0] * (1 + out / a), y, pt[1] * (1 + out / a));
    for (let j = 0; j < n; j++) {
      const y0 = (tops[i] * j) / n;
      const y1 = (tops[i] * (j + 1)) / n;
      k.rod(P(p, y0), P(q, y1), 0.7, white);
      k.rod(P(q, y0), P(p, y1), 0.7, white);
      k.rod(P(p, y1), P(q, y1), 0.5, white);
    }
    k.rod(P(p, 0), P(p, Math.max(tops[i], tops[(i + 3) % 4])), 0.8, white);
  }
  for (const x of [-3, 3]) k.rod(V(x, tops[3], x), V(x, tops[3] + 52 * h, x), 0.9, '#dfe3e8');
  return k.build();
}

function ifc2() {
  const k = new Kit();
  const h = 0.62;
  const glass = '#d3e3ee';
  const stages = [
    [0, 200, 33, 31],
    [200, 290, 31, 27],
    [290, 350, 27, 22],
    [350, 380, 22, 17],
  ];
  for (const [y0, y1, r0, r1] of stages) k.frustum(r0, r1, (y1 - y0) * h, 0, y0 * h, 0, glass, 8, { glow: true });
  // The crown of fins.
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2 + Math.PI / 8;
    k.box(2, 40 * h - (i % 2) * 8, 7, Math.cos(ang) * 14, 380 * h, Math.sin(ang) * 14, '#eef4f8', { rotY: -ang, glow: true });
  }
  return k.build();
}

function icc() {
  const k = new Kit();
  const h = 0.62;
  k.hip(66, 66, 58, 58, 440 * h, 0, 0, 0, '#b9cfe2', true);
  k.hip(58, 58, 50, 50, 44 * h, 0, 440 * h, 0, '#dce9f3', true);
  return k.build();
}

function tstClockTower() {
  const k = new Kit();
  const s = 1.3;
  const brick = '#c9674b';
  const granite = '#efe5d2';
  k.box(8 * s, 28 * s, 8 * s, 0, 0, 0, brick, { glow: true });
  for (const y of [7, 14, 21]) k.box(8.6 * s, 1.1 * s, 8.6 * s, 0, y * s, 0, granite);
  k.box(9 * s, 8 * s, 9 * s, 0, 28 * s, 0, granite, { glow: true });
  for (const [x, z, r] of [
    [4.55, 0, Math.PI / 2],
    [-4.55, 0, -Math.PI / 2],
    [0, 4.55, 0],
    [0, -4.55, Math.PI],
  ])
    k.add(new THREE.CircleGeometry(2.6 * s, 16).rotateY(r).translate(x * s, 32 * s, z * s), '#fff6d6', true);
  k.frustum(4.2 * s, 3.8 * s, 5 * s, 0, 36 * s, 0, brick, 8);
  k.cone(3.6 * s, 5 * s, 0, 41 * s, 0, '#3b6b72', 8);
  return k.build();
}

function starFerry() {
  const k = new Kit();
  const s = 1.5;
  const green = '#2f7a4d';
  const white = '#f6f4ec';
  // Double-ended, so it never turns around.
  k.box(30 * s, 2.6 * s, 9 * s, 0, 0, 0, green);
  for (const x of [-15, 15]) k.frustum(4.5 * s, 4.5 * s, 2.6 * s, x * s, 0, 0, green, 14);
  k.box(28 * s, 3 * s, 8.4 * s, 0, 2.6 * s, 0, white, { glow: true });
  k.box(31 * s, 0.6 * s, 9.6 * s, 0, 5.6 * s, 0, green);
  k.box(24 * s, 2.6 * s, 8 * s, 0, 6.2 * s, 0, white, { glow: true });
  k.box(26 * s, 0.6 * s, 8.8 * s, 0, 8.8 * s, 0, green);
  k.box(3 * s, 2 * s, 2.4 * s, 0, 9.4 * s, 0, white);
  return k.build();
}

// ---------------------------------------------------------------------------
// Placement
// ---------------------------------------------------------------------------

const LANDMARKS: Record<CityId, Placed[]> = {
  ...WORLD_LANDMARKS,

  paris: [
    { build: eiffelTower, at: [2.2945, 48.85826], rot: -0.75, clear: 90 },
    { build: arcDeTriomphe, at: [2.29504, 48.87378], rot: 1.13, clear: 40 },
    { build: notreDame, at: [2.35005, 48.85294], rot: -0.44, clear: 80 },
    { build: sacreCoeur, at: [2.34302, 48.88681], clear: 70 },
    { build: louvrePyramid, at: [2.33584, 48.86099], rot: -0.445, clear: 40 },
  ],
  berlin: [
    { build: fernsehturm, at: [13.40942, 52.52083], clear: 45 },
    { build: brandenburgGate, at: [13.3777, 52.51627], rot: Math.PI / 2, clear: 50 },
    { build: reichstag, at: [13.3761, 52.51865], clear: 95 },
    { build: siegessaule, at: [13.35011, 52.51451], clear: 25 },
    { build: berlinerDom, at: [13.40109, 52.51908], clear: 75 },
  ],
  madrid: [
    { build: puertaDeAlcala, at: [-3.68873, 40.41998], rot: 1.77, clear: 30 },
    { build: torreKio, at: [-3.69, 40.467], face: [-3.68823, 40.46669], clear: 32 },
    { build: torreKio, at: [-3.68823, 40.46669], face: [-3.69, 40.467], clear: 32 },
    { build: metropolis, at: [-3.69739, 40.41877], clear: 28 },
  ],
  seoul: [
    { build: namsanTower, at: [126.98828, 37.55127], clear: 130 },
    { build: lotteWorldTower, at: [127.10268, 37.51255], clear: 50 },
    { build: () => koreanGate({ w: 30, d: 13, arches: 1, storeys: 2 }), at: [126.97536, 37.55999], clear: 35 },
    { build: () => koreanGate({ w: 36, d: 14, arches: 3, storeys: 2 }), at: [126.97682, 37.57592], clear: 40 },
    { build: building63, at: [126.9403, 37.5198], rot: 0.5, clear: 45 },
    { build: ddp, at: [127.0099, 37.56707], rot: 0.35, clear: 130 },
  ],
  hongkong: [
    { build: bankOfChina, at: [114.16157, 22.27927], rot: 0.2, clear: 40 },
    { build: ifc2, at: [114.15928, 22.2853], clear: 42 },
    { build: icc, at: [114.16023, 22.30338], clear: 48 },
    { build: tstClockTower, at: [114.16954, 22.29359], clear: 12 },
    {
      build: () => wheel({ R: 28, hub: 32, cars: 42, legs: 'a', rim: '#ffffff', carColors: ['#f4f7fa', '#ffd23f'], glowCars: true }),
      at: [114.16177, 22.28532],
      rot: 0.15,
      clear: 35,
    },
    // The Star Ferry, Central to Tsim Sha Tsui.
    { build: starFerry, at: [114.1611, 22.2878], y: 0.2, sail: { to: [114.1681, 22.2929], period: 150, phase: 0 } },
    { build: starFerry, at: [114.1611, 22.2878], y: 0.2, sail: { to: [114.1681, 22.2929], period: 150, phase: 0.5 } },
  ],
  nyc: [
    { build: statueOfLiberty, at: [-74.04452, 40.68925], rot: 0.6 },
    { build: empireState, at: [-73.98566, 40.74844], rot: -0.51, clear: 75 },
    { build: brooklynBridge, at: [-73.99675, 40.70567], toward: [-73.99422, 40.70352], cutHalf: 520 },
    {
      build: () => wheel({ R: 22, hub: 26, cars: 24, legs: 'a', rim: '#ffffff', carColors: ['#ff5a5f', '#ffd23f', '#4cc3ff', '#2fd18b'], glowCars: true }),
      at: [-73.97866, 40.57382],
      rot: 0.1,
      clear: 40,
    },
  ],
  sf: [
    { build: goldenGate, at: [-122.47868, 37.82105], toward: [-122.48, 37.827], cutHalf: 985 },
    { build: transamerica, at: [-122.40279, 37.79519], clear: 45 },
    { build: salesforce, at: [-122.39699, 37.78968], clear: 45 },
    { build: coitTower, at: [-122.40582, 37.80239], clear: 25 },
  ],
  london: [
    { build: elizabethTower, at: [-0.12462, 51.50073], clear: 25 },
    { build: westminster, at: [-0.12457, 51.49905], rot: 0.26, clear: 140 },
    {
      build: () => wheel({ R: 60, hub: 68, cars: 32, legs: 'cantilever', rim: '#f4f6f8', carColors: ['#dff3ff'], glowCars: true }),
      at: [-0.1196, 51.5033],
      rot: -0.35,
      clear: 50,
    },
    { build: towerBridge, at: [-0.07536, 51.50546], rot: Math.PI / 2 - 0.08 },
    { build: shard, at: [-0.08649, 51.50452], clear: 45 },
    { build: stPauls, at: [-0.09836, 51.51383], rot: 0.02, clear: 90 },
  ],
  tokyo: [
    { build: tokyoTower, at: [139.74543, 35.65858], clear: 60 },
    { build: skytree, at: [139.8107, 35.71006], clear: 50 },
    { build: rainbowBridge, at: [139.7634, 35.6365], toward: [139.7705, 35.632], cutHalf: 470 },
    { build: pagoda, at: [139.79665, 35.71475], clear: 20 },
  ],
};

export class Landmarks implements Layer {
  readonly group = new THREE.Group();
  private wheels: THREE.Object3D[] = [];
  private rotors: { obj: THREE.Object3D; axis: 'x' | 'y' | 'z'; speed: number }[] = [];
  private boats: { g: THREE.Object3D; a: THREE.Vector3; b: THREE.Vector3; period: number; phase: number }[] = [];

  constructor(city: CityId, bounds: { minX: number; minY: number; maxX: number; maxY: number }) {
    const { project } = makeProjection(city);
    for (const l of LANDMARKS[city]) {
      const g = l.build();
      const [x, y] = project(l.at[0], l.at[1]);
      g.position.set(x, l.y ?? 0.5, -y);
      const aim = l.toward ?? l.face ?? l.sail?.to;
      if (aim) {
        const [tx, ty] = project(aim[0], aim[1]);
        g.rotation.y = Math.atan2(ty - y, tx - x);
      } else if (l.rot) g.rotation.y = l.rot;
      if (g.userData.spin) this.wheels.push(g);
      if (g.userData.rotor) this.rotors.push(g.userData.rotor);
      if (l.sail) {
        const [tx, ty] = project(l.sail.to[0], l.sail.to[1]);
        this.boats.push({ g, a: new THREE.Vector3(x, g.position.y, -y), b: new THREE.Vector3(tx, g.position.y, -ty), period: l.sail.period, phase: l.sail.phase });
      }
      this.group.add(g);
    }
    if (city === 'tokyo') {
      // Fuji-san floats on the clouds past the island's southwest corner, in its true direction.
      const cx = (bounds.minX + bounds.maxX) / 2;
      const cy = (bounds.minY + bounds.maxY) / 2;
      const [fx, fy] = project(138.7274, 35.3606);
      const d = Math.hypot(fx - cx, fy - cy);
      const ux = (fx - cx) / d;
      const uy = (fy - cy) / d;
      // Distance to the island's edge along Fuji's bearing, then clear the base.
      const hw = (bounds.maxX - bounds.minX) / 2;
      const hh = (bounds.maxY - bounds.minY) / 2;
      const edge = Math.min(hw / Math.max(1e-6, Math.abs(ux)), hh / Math.max(1e-6, Math.abs(uy)));
      const R = edge + 6200 + 6500;
      const f = fuji(1);
      f.position.set(cx + ux * R, -800, -(cy + uy * R));
      this.group.add(f);
    }
    void CITIES;
  }

  /** Oriented corridors (map meters) under bridge decks where ground-level road ribbons should be cut. */
  static roadCuts(city: CityId): { x: number; y: number; dx: number; dy: number; half: number; width: number }[] {
    const { project } = makeProjection(city);
    return LANDMARKS[city]
      .filter((l) => l.toward)
      .map((l) => {
        const [x, y] = project(l.at[0], l.at[1]);
        const [tx, ty] = project(l.toward![0], l.toward![1]);
        const d = Math.hypot(tx - x, ty - y) || 1;
        return { x, y, dx: (tx - x) / d, dy: (ty - y) / d, half: l.cutHalf ?? 900, width: 45 };
      });
  }

  /** Circles (map x, y, radius) where OSM buildings would clash with a landmark model. */
  static clearings(city: CityId): [number, number, number][] {
    const { project } = makeProjection(city);
    return LANDMARKS[city].filter((l) => l.clear).map((l) => [...project(l.at[0], l.at[1]), l.clear!] as [number, number, number]);
  }

  update(f: FrameInfo) {
    for (const r of this.rotors) r.obj.rotation[r.axis] = f.time * r.speed;
    // Ferries: dwell at each pier, then an eased crossing.
    for (const bt of this.boats) {
      const u = (((f.time / bt.period + bt.phase) % 1) + 1) % 1;
      const ease = (t: number) => t * t * (3 - 2 * t);
      const t = u < 0.1 ? 0 : u < 0.5 ? ease((u - 0.1) / 0.4) : u < 0.6 ? 1 : 1 - ease((u - 0.6) / 0.4);
      bt.g.position.lerpVectors(bt.a, bt.b, t);
      bt.g.position.y = bt.a.y + Math.sin(f.time * 1.3 + bt.phase * 9) * 0.35;
      bt.g.rotation.x = Math.sin(f.time * 0.9 + bt.phase * 5) * 0.025;
    }
    for (const w of this.wheels) {
      const { spinner, cars, R } = w.userData.spin as { spinner: THREE.Object3D; cars: THREE.Group; R: number };
      const a = f.time * 0.05;
      spinner.rotation.z = a;
      for (const c of cars.children) {
        const ca = c.userData.a + a;
        c.position.set(Math.cos(ca) * R, Math.sin(ca) * R, 0);
      }
    }
  }

  dispose() {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      (m.material as THREE.Material | undefined)?.dispose?.();
    });
  }
}
