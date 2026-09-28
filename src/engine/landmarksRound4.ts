import * as THREE from 'three';
import { Kit, V, suspensionBridge, type C, type Placed } from './landmarkKit.ts';

// Landmarks for Budapest, Milan, Rome and Philadelphia. Local +x is along `face`/`toward` (or east when
// unrotated), +y up, and +z to the right of +x (south when unrotated). Sizes are real, in meters.

/** A wall of boxes around an ellipse (semi-axes a along x, b along z); `h(θ)` sets the height per segment. */
function ellipseWall(k: Kit, a: number, b: number, thick: number, y: number, color: C, h: (t: number) => number, n = 48, glow = false) {
  for (let i = 0; i < n; i++) {
    const t = ((i + 0.5) / n) * Math.PI * 2;
    const x = a * Math.cos(t);
    const z = b * Math.sin(t);
    const tx = -a * Math.sin(t);
    const tz = b * Math.cos(t);
    const len = (Math.hypot(tx, tz) * Math.PI * 2) / n + 0.6;
    const hh = h(t);
    if (hh > 0) k.box(len, hh, thick, x, y, z, color, { rotY: Math.atan2(-tz, tx), glow });
  }
}

/** A flattened cylinder (an oval) from y to y + h. */
function oval(k: Kit, a: number, b: number, h: number, x: number, y: number, z: number, color: C, glow = false) {
  return k.add(new THREE.CylinderGeometry(1, 1, h, 40).scale(a, 1, b).translate(x, y + h / 2, z), color, glow);
}

/** A row of columns along z at x, from y0 to y1. */
function colonnade(k: Kit, x: number, z0: number, z1: number, n: number, y0: number, y1: number, r: number, color: C) {
  for (let i = 0; i < n; i++) {
    const z = z0 + ((z1 - z0) * i) / Math.max(1, n - 1);
    k.frustum(r, r * 0.88, y1 - y0, x, y0, z, color, 8);
  }
}

// --- Budapest -----------------------------------------------------------------------------
function parliament() {
  const k = new Kit();
  const stone = '#eee1c4';
  const roof = '#b64a3c';
  k.box(268, 22, 72, 0, 0, 0, stone, { glow: true });
  k.hip(268, 72, 250, 18, 14, 0, 22, 0, roof);
  // End pavilions and the two tall towers on the city side.
  for (const x of [-124, 124]) {
    k.box(22, 30, 76, x, 0, 0, stone, { glow: true });
    k.hip(22, 76, 6, 60, 10, x, 30, 0, roof);
  }
  for (const x of [-34, 34]) {
    k.box(10, 62, 10, x, 0, 30, stone, { glow: true });
    k.cone(6.5, 12, x, 62, 30, stone, 8);
  }
  // The dome: a sixteen-sided drum, a ribbed red dome and a lantern spire to 96 m.
  k.frustum(21, 21, 20, 0, 22, 0, stone, 16, { glow: true });
  k.sphere(20, 0, 42, 0, roof, { half: true, sy: 1.35 });
  k.frustum(4, 3, 8, 0, 68, 0, stone, 8);
  k.frustum(3, 0.3, 20, 0, 76, 0, stone, 8);
  // Pinnacles along the Danube front.
  for (let x = -120; x <= 120; x += 12) k.cone(1.3, 9, x, 36, -36, stone, 6);
  return k.build();
}

function chainBridge() {
  const stone = '#cdbd9c';
  return suspensionBridge({
    span: 202,
    side: 86,
    towerH: 48,
    deckH: 10,
    width: 16,
    color: stone,
    cableColor: '#56655a',
    deckColor: '#8c8b84',
    hangers: 7,
    glowTowers: true,
    tower: (k, x) => {
      // Triumphal-arch towers: two piers, a lintel and a cornice.
      for (const z of [-9, 9]) k.box(14, 40, 6, x, 0, z, stone, { glow: true });
      k.box(14, 10, 24, x, 34, 0, stone, { glow: true });
      k.box(16, 3, 26, x, 44, 0, '#bfae8c');
    },
  });
}

function basilica() {
  const k = new Kit();
  const stone = '#e9dcbc';
  const dome = '#5c7a6c';
  k.box(87, 30, 30, 0, 0, 0, stone, { glow: true });
  k.box(30, 30, 56, 0, 0, 0, stone, { glow: true });
  k.frustum(14, 14, 20, 0, 30, 0, stone, 16, { glow: true });
  k.sphere(14, 0, 50, 0, dome, { half: true, sy: 1.4 });
  k.frustum(3.4, 2.6, 12, 0, 69, 0, stone, 8);
  k.cone(2.8, 14, 0, 81, 0, dome, 8);
  // Two bell towers on the west front (+x).
  for (const z of [-20, 20]) {
    k.box(12, 58, 12, 38, 0, z, stone, { glow: true });
    k.sphere(5.5, 38, 58, z, dome, { half: true, sy: 1.6 });
    k.cone(1.4, 8, 38, 66, z, dome, 6);
  }
  return k.build();
}

function budaCastle() {
  const k = new Kit();
  const stone = '#e3d7bd';
  k.box(290, 30, 110, 0, 0, 0, '#bdb196');
  k.box(200, 22, 60, 0, 30, 0, stone, { glow: true });
  k.hip(200, 60, 190, 10, 8, 0, 52, 0, '#6a7b74');
  k.frustum(12, 12, 14, 0, 52, 0, stone, 16, { glow: true });
  k.sphere(12, 0, 66, 0, '#6d9c86', { half: true, sy: 1.5 });
  k.frustum(2.2, 1.6, 8, 0, 84, 0, stone, 8);
  k.cone(1.8, 6, 0, 92, 0, '#6d9c86', 8);
  return k.build();
}

// --- Milan --------------------------------------------------------------------------------
function duomo() {
  const k = new Kit();
  const marble = '#f1e7dc';
  k.box(158, 45, 66, 0, 0, 0, marble, { glow: true });
  k.box(42, 45, 92, -12, 0, 0, marble, { glow: true });
  k.hip(158, 66, 150, 14, 10, 0, 45, 0, '#e5dbcd');
  // The west front (+x): a gable and its pinnacles.
  k.hip(4, 66, 4, 2, 20, 79, 45, 0, marble);
  // A forest of spires along both flanks and the transept.
  for (let x = -72; x <= 72; x += 9) for (const z of [-33, -20, 20, 33]) {
    k.rod(V(x, 45, z), V(x, 60, z), 0.6, marble);
    k.cone(0.9, 4, x, 60, z, marble, 6);
  }
  for (let z = -44; z <= 44; z += 11) {
    k.rod(V(-12, 45, z), V(-12, 62, z), 0.6, marble);
    k.cone(0.9, 4, -12, 62, z, marble, 6);
  }
  // The crossing lantern, the main spire and the gilded Madonnina at 108 m.
  k.frustum(9, 7, 18, -12, 55, 0, marble, 8, { glow: true });
  k.frustum(3.2, 0.5, 30, -12, 73, 0, marble, 8, { glow: true });
  k.sphere(1.6, -12, 105, 0, '#e8b830', { glow: true, sy: 1.8 });
  return k.build();
}

function castelloSforzesco() {
  const k = new Kit();
  const brick = '#b85f45';
  for (const z of [-96, 96]) k.box(200, 18, 8, 0, 0, z, brick);
  for (const x of [-96, 96]) k.box(8, 18, 200, x, 0, 0, brick);
  // Round towers on the city front (+x), square ones at the back.
  for (const z of [-96, 96]) {
    k.frustum(16, 15, 32, 96, 0, z, '#c9b8a0', 20);
    k.box(22, 26, 22, -96, 0, z, brick);
  }
  // The Filarete tower over the main gate.
  k.box(20, 40, 20, 96, 0, 0, brick, { glow: true });
  k.box(14, 14, 14, 96, 40, 0, brick);
  k.box(9, 10, 9, 96, 54, 0, '#d8c8b0');
  k.sphere(4.5, 96, 64, 0, '#8f9aa0', { half: true, sy: 1.3 });
  return k.build();
}

function boscoVerticale() {
  const k = new Kit();
  const tower = (x: number, z: number, h: number) => {
    k.box(30, h, 30, x, 0, z, '#6f6862', { glow: true });
    // Staggered planted balconies on every floor.
    for (let f = 1, y = 6; y < h - 2; f++, y += 3.6) {
      for (let s = 0; s < 4; s++) {
        const off = ((f + s) % 3) * 8 - 8;
        const g = f % 2 ? '#5f9b4a' : '#4c8a3e';
        if (s === 0) k.box(8, 2.6, 3, x + off, y, z - 16, g);
        if (s === 1) k.box(8, 2.6, 3, x - off, y, z + 16, g);
        if (s === 2) k.box(3, 2.6, 8, x + 16, y, z + off, g);
        if (s === 3) k.box(3, 2.6, 8, x - 16, y, z - off, g);
      }
    }
  };
  tower(0, 0, 111);
  tower(48, 44, 78);
  return k.build();
}

function unicredit() {
  const k = new Kit();
  k.frustum(24, 19, 146, 0, 0, 0, '#9db6cc', 24, { glow: true });
  k.frustum(19, 12, 16, 0, 146, 0, '#b8cad8', 24);
  k.frustum(2.4, 0.3, 69, 0, 162, 0, '#dfe6ec', 8, { glow: true });
  return k.build();
}

// --- Rome ---------------------------------------------------------------------------------
function colosseum() {
  const k = new Kit();
  const trav = '#d8c49c';
  const dark = '#8a7658';
  // The outer ring stands to its full 48 m only on the north side; elsewhere the second ring shows.
  const outer = (t: number) => {
    const s = Math.sin(t); // +z is south
    return s < -0.15 ? 48 : s < 0.05 ? 40 : 0;
  };
  ellipseWall(k, 94, 78, 6, 0, trav, outer, 56, true);
  ellipseWall(k, 86, 70, 7, 0, trav, () => 36, 56, true);
  ellipseWall(k, 72, 56, 14, 0, '#cbb68e', () => 26, 48);
  ellipseWall(k, 58, 42, 12, 0, '#bfa983', () => 14, 40);
  oval(k, 46, 28, 1, 0, 0, 0, '#bca77f');
  // Arch openings in three tiers on the standing outer wall.
  for (let i = 0; i < 56; i++) {
    const t = ((i + 0.5) / 56) * Math.PI * 2;
    const s = Math.sin(t);
    const tiers = s < -0.15 ? 3 : s < 0.05 ? 2 : 0;
    const tx = -94 * s;
    const tz = 78 * Math.cos(t);
    for (let j = 0; j < tiers; j++) k.box(4.2, 7, 0.6, 97.2 * Math.cos(t), 3 + j * 11.5, 81.2 * s, dark, { rotY: Math.atan2(-tz, tx) });
  }
  return k.build();
}

function stPeters() {
  const k = new Kit();
  const stone = '#e4dcc8';
  const lead = '#9aa4a8';
  // The basilica: the crossing at the origin, the nave running east (+x) to the facade.
  k.box(80, 45, 140, 0, 0, 0, stone, { glow: true });
  k.box(96, 45, 64, 70, 0, 0, stone, { glow: true });
  k.box(8, 50, 116, 120, 0, 0, stone, { glow: true });
  colonnade(k, 125, -50, 50, 10, 0, 28, 1.6, '#f0e9da');
  // Drum, dome and lantern to 136 m.
  k.frustum(26, 26, 27, 0, 45, 0, stone, 24, { glow: true });
  k.sphere(24, 0, 72, 0, lead, { half: true, sy: 1.45 });
  k.frustum(5, 4, 14, 0, 106, 0, stone, 8);
  k.cone(4.2, 12, 0, 120, 0, lead, 8);
  k.box(0.6, 4, 0.6, 0, 132, 0, '#e8b830');
  // Bernini's colonnade: two curved arms around the oval piazza, and the obelisk.
  const cx = 330;
  for (let i = 0; i < 26; i++) {
    for (const sgn of [-1, 1]) {
      const t = (0.18 + (i / 25) * 0.64) * Math.PI;
      const x = cx + 100 * Math.cos(t) * 0.98;
      const z = sgn * 120 * Math.sin(t);
      const tx = -100 * Math.sin(t);
      const tz = sgn * 120 * Math.cos(t);
      k.box(15, 16, 17, x, 0, z, '#efe7d6', { rotY: Math.atan2(-tz, tx), glow: true });
    }
  }
  for (const sgn of [-1, 1]) k.box(120, 14, 10, 185, 0, sgn * 70, '#efe7d6');
  k.frustum(1.8, 1.2, 25, cx, 0, 0, '#d8cdb8', 4);
  k.cone(1.3, 3, cx, 25, 0, '#d8cdb8', 4);
  return k.build();
}

function pantheon() {
  const k = new Kit();
  const stone = '#cbbb98';
  k.frustum(22, 22, 22, 0, 0, 0, stone, 32, { glow: true });
  k.sphere(22, 0, 22, 0, '#b9b2a4', { half: true, sy: 0.72 });
  k.frustum(4.5, 4.5, 1, 0, 37.5, 0, '#6f6a62', 16);
  // The portico faces north (+x).
  k.box(16, 20, 34, 30, 0, 0, stone);
  colonnade(k, 37, -15, 15, 8, 0, 14, 0.9, '#e2d8c2');
  k.hip(16, 34, 16, 1, 7, 30, 20, 0, stone);
  return k.build();
}

function vittoriano() {
  const k = new Kit();
  const w = '#f3f0e8';
  const bronze = '#556b5f';
  // Facing north (+x): terraces, the long curved-looking colonnade and the two propylaea with quadrigas.
  k.box(70, 12, 135, -8, 0, 0, '#ebe6da', { glow: true });
  k.box(40, 10, 125, -14, 12, 0, w, { glow: true });
  k.box(24, 22, 116, -20, 22, 0, w, { glow: true });
  colonnade(k, -7, -54, 54, 16, 22, 40, 1, w);
  k.box(28, 4, 120, -18, 42, 0, w);
  for (const z of [-60, 60]) {
    k.box(24, 30, 24, -18, 22, z, w, { glow: true });
    k.box(8, 7, 11, -18, 52, z, bronze);
  }
  k.box(8, 12, 6, 24, 12, 0, bronze);
  return k.build();
}

function castelSantAngelo() {
  const k = new Kit();
  k.box(88, 12, 88, 0, 0, 0, '#b39473');
  k.frustum(33, 33, 22, 0, 12, 0, '#c4a683', 32, { glow: true });
  k.box(34, 14, 34, 0, 34, 0, '#cfb48f', { glow: true });
  k.box(10, 6, 10, 0, 48, 0, '#d9c29e');
  k.frustum(1.2, 0.8, 5, 0, 54, 0, '#6f8a7a', 8);
  k.sphere(1, 0, 60, 0, '#6f8a7a');
  return k.build();
}

// --- Philadelphia -------------------------------------------------------------------------
function cityHall() {
  const k = new Kit();
  const stone = '#d8cfbc';
  const slate = '#6b6f73';
  // The courtyard block, with mansard roofs and corner pavilions.
  for (const z of [-60, 60]) {
    k.box(146, 34, 22, 0, 0, z, stone, { glow: true });
    k.hip(146, 22, 140, 12, 8, 0, 34, z, slate);
  }
  for (const x of [-62, 62]) {
    k.box(22, 34, 137, x, 0, 0, stone, { glow: true });
    k.hip(22, 137, 12, 130, 8, x, 34, 0, slate);
  }
  for (const x of [-62, 62]) for (const z of [-60, 60]) {
    k.box(28, 44, 28, x, 0, z, stone, { glow: true });
    k.hip(28, 28, 8, 8, 10, x, 44, z, slate);
  }
  // The tower on the north side (−z), with its clocks and William Penn on top at 167 m.
  const tz = -60;
  k.box(28, 102, 28, 0, 0, tz, stone, { glow: true });
  k.box(25, 18, 25, 0, 102, tz, '#e6ddca', { glow: true });
  for (const [dx, dz] of [[0, -12.7], [0, 12.7], [-12.7, 0], [12.7, 0]]) k.box(dz ? 7 : 0.4, 7, dz ? 0.4 : 7, dx, 108, tz + dz, '#fff4d6', { glow: true });
  k.frustum(10, 9, 16, 0, 120, tz, '#e6ddca', 8, { glow: true });
  k.frustum(9, 3, 14, 0, 136, tz, '#8f9a98', 8);
  k.frustum(1.6, 1.2, 12, 0, 150, tz, '#7d6c48', 8);
  k.sphere(1.2, 0, 163, tz, '#7d6c48');
  return k.build();
}

function comcastTechnologyCenter() {
  const k = new Kit();
  k.box(46, 326, 46, 0, 0, 0, '#a7b9c8', { glow: true });
  k.box(42, 16, 42, 0, 326, 0, '#e2e8ec', { glow: true });
  return k.build();
}

function comcastCenter() {
  const k = new Kit();
  k.frustum(26, 20, 286, 0, 0, 0, '#9cb3c4', 4, { glow: true });
  k.frustum(20, 16, 11, 0, 286, 0, '#d6e0e6', 4);
  return k.build();
}

function oneLibertyPlace() {
  const k = new Kit();
  const glass = '#6f90b2';
  k.box(46, 150, 46, 0, 0, 0, glass, { glow: true });
  k.box(40, 50, 40, 0, 150, 0, glass, { glow: true });
  k.box(32, 30, 32, 0, 200, 0, glass, { glow: true });
  k.frustum(16, 3, 42, 0, 230, 0, '#8aa6c2', 4, { glow: true });
  k.frustum(2, 0.3, 18, 0, 272, 0, '#dfe6ec', 6);
  return k.build();
}

function benFranklinBridge() {
  const blue = '#3f6ea8';
  return suspensionBridge({
    span: 533,
    side: 219,
    towerH: 116,
    deckH: 41,
    width: 39,
    color: blue,
    cableColor: blue,
    deckColor: '#7c828a',
    hangers: 14,
    tower: (k, x) => {
      for (const z of [-18, 18]) k.box(8, 116, 7, x, 0, z, blue, { glow: true });
      for (const y of [30, 60, 86, 110]) k.box(6, 5, 36, x, y, 0, blue);
    },
  });
}

function artMuseum() {
  const k = new Kit();
  const stone = '#dfc591';
  const pediment = '#3f6fa4';
  // The U-shaped temple faces the Parkway (+x): a central block and two wings, each with a portico.
  k.box(34, 28, 170, -40, 0, 0, stone, { glow: true });
  for (const z of [-72, 72]) k.box(90, 26, 30, 0, 0, z, stone, { glow: true });
  k.hip(34, 170, 20, 160, 8, -40, 28, 0, '#c9a878');
  for (const [x, z, w] of [[-20, 0, 60], [48, -72, 26], [48, 72, 26]] as const) {
    colonnade(k, x + 4, z - w / 2 + 3, z + w / 2 - 3, 6, 0, 22, 1.1, '#efe2c4');
    k.hip(8, w, 8, 1, 7, x, 22, z, pediment);
  }
  // The steps down to Eakins Oval.
  for (let i = 0; i < 5; i++) k.box(12, 4 - i * 0.8, 56, 30 + i * 12, 0, 0, '#d8d0c0');
  return k.build();
}

function independenceHall() {
  const k = new Kit();
  const brick = '#a6533f';
  const white = '#f4f1ea';
  k.box(33, 14, 14, 0, 0, 0, brick, { glow: true });
  k.hip(33, 14, 30, 2, 5, 0, 14, 0, '#5d5a58');
  // The tower and steeple on the south (+z) side.
  k.box(9, 22, 9, 0, 0, 10, brick, { glow: true });
  k.box(7.5, 8, 7.5, 0, 22, 10, white, { glow: true });
  k.frustum(3.4, 3.2, 8, 0, 30, 10, white, 8);
  k.frustum(2.6, 0.2, 12, 0, 38, 10, white, 8);
  return k.build();
}

export const ROUND4_LANDMARKS: Record<'budapest' | 'milan' | 'rome' | 'philadelphia' | 'prague' | 'naples' | 'barcelona' | 'lisbon' | 'istanbul' | 'montreal' | 'dubai', Placed[]> = {
  prague: [],
  naples: [],
  barcelona: [],
  lisbon: [],
  istanbul: [],
  montreal: [],
  dubai: [],

  budapest: [
    { build: parliament, at: [19.04573, 47.50706], face: [19.0472, 47.5125], clear: 90 },
    { build: chainBridge, at: [19.0436, 47.49893], toward: [19.0477, 47.49955], cutHalf: 200 },
    { build: basilica, at: [19.05387, 47.50083], face: [19.0498, 47.50083], clear: 50 },
    { build: budaCastle, at: [19.03937, 47.49613], face: [19.0450, 47.49613], clear: 130 },
  ],
  milan: [
    { build: duomo, at: [9.19192, 45.46421], face: [9.1880, 45.46421], clear: 90 },
    { build: castelloSforzesco, at: [9.17917, 45.47049], face: [9.1847, 45.4668], clear: 120 },
    { build: boscoVerticale, at: [9.19036, 45.48568], rot: 0.3, clear: 40 },
    { build: unicredit, at: [9.19018, 45.48393], clear: 30 },
  ],
  rome: [
    { build: colosseum, at: [12.49223, 41.89021], rot: 0.26, clear: 100 },
    { build: stPeters, at: [12.45334, 41.90222], face: [12.4600, 41.90222], clear: 90 },
    { build: pantheon, at: [12.47687, 41.89861], face: [12.47687, 41.9020], clear: 35 },
    { build: vittoriano, at: [12.48278, 41.89461], face: [12.48278, 41.8990], clear: 70 },
    { build: castelSantAngelo, at: [12.46632, 41.90306], clear: 55 },
  ],
  philadelphia: [
    { build: cityHall, at: [-75.16358, 39.9524], clear: 90 },
    { build: comcastTechnologyCenter, at: [-75.1708, 39.9549], clear: 30 },
    { build: comcastCenter, at: [-75.1683, 39.9547], clear: 25 },
    { build: oneLibertyPlace, at: [-75.16797, 39.95237], clear: 30 },
    { build: benFranklinBridge, at: [-75.1357, 39.952], toward: [-75.1223, 39.9479], cutHalf: 500 },
    { build: artMuseum, at: [-75.18099, 39.96557], face: [-75.1765, 39.962], clear: 110 },
    { build: independenceHall, at: [-75.15, 39.94887], clear: 25 },
  ],
};
