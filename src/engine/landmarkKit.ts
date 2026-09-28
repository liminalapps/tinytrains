import * as THREE from 'three';
import { groundUniforms } from './island.ts';
import { LOOK_PARS, lookUniforms } from '../themes/look.ts';

// The toy-landmark modeling kit: primitives in a local frame (x east, y up, z south, meters), merged into one
// solid mesh plus one that glows at night.

export type C = string;

export class Kit {
  private solid: { g: THREE.BufferGeometry; c: THREE.Color }[] = [];
  private glow: { g: THREE.BufferGeometry; c: THREE.Color }[] = [];
  add(g: THREE.BufferGeometry, color: C, glow = false) {
    (glow ? this.glow : this.solid).push({ g: g.index ? g.toNonIndexed() : g, c: new THREE.Color(color) });
    return this;
  }
  box(w: number, h: number, d: number, x: number, y: number, z: number, color: C, o: { rotY?: number; glow?: boolean } = {}) {
    const g = new THREE.BoxGeometry(w, h, d);
    if (o.rotY) g.rotateY(o.rotY);
    return this.add(g.translate(x, y + h / 2, z), color, o.glow);
  }
  /** Tapered prism/cylinder from y to y+h. seg 4 = square (rotated to face the axes). */
  frustum(rBot: number, rTop: number, h: number, x: number, y: number, z: number, color: C, seg = 16, o: { glow?: boolean; open?: boolean } = {}) {
    const g = new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, !!o.open);
    if (seg === 4) g.rotateY(Math.PI / 4);
    return this.add(g.translate(x, y + h / 2, z), color, o.glow);
  }
  sphere(r: number, x: number, y: number, z: number, color: C, o: { glow?: boolean; sy?: number; half?: boolean } = {}) {
    const g = new THREE.SphereGeometry(r, 14, 10, 0, Math.PI * 2, 0, o.half ? Math.PI / 2 : Math.PI);
    g.scale(1, o.sy ?? 1, 1);
    return this.add(g.translate(x, y, z), color, o.glow);
  }
  cone(r: number, h: number, x: number, y: number, z: number, color: C, seg = 12, glow = false) {
    const g = new THREE.ConeGeometry(r, h, seg);
    if (seg === 4) g.rotateY(Math.PI / 4);
    return this.add(g.translate(x, y + h / 2, z), color, glow);
  }
  rod(a: THREE.Vector3, b: THREE.Vector3, r: number, color: C, glow = false) {
    const dir = b.clone().sub(a);
    const len = dir.length();
    if (len < 1e-3) return this;
    const g = new THREE.CylinderGeometry(r, r, len, 5);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()));
    const m = a.clone().add(b).multiplyScalar(0.5);
    return this.add(g.translate(m.x, m.y, m.z), color, glow);
  }
  /** A polyline of rods (cables). */
  cable(pts: THREE.Vector3[], r: number, color: C, glow = false) {
    for (let i = 1; i < pts.length; i++) this.rod(pts[i - 1], pts[i], r, color, glow);
    return this;
  }
  torus(R: number, r: number, color: C, glow = false, seg = 48) {
    return this.add(new THREE.TorusGeometry(R, r, 6, seg), color, glow);
  }
  /** A horizontal ring (torus lying flat) at height y. */
  ring(R: number, r: number, x: number, y: number, z: number, color: C, glow = false) {
    return this.add(new THREE.TorusGeometry(R, r, 6, 32).rotateX(Math.PI / 2).translate(x, y, z), color, glow);
  }
  /** A box whose top is pushed sideways along +x by `lean` meters per meter of height (a leaning tower). */
  leanBox(w: number, h: number, d: number, x: number, y: number, z: number, color: C, lean: number, glow = false) {
    const g = new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0);
    g.applyMatrix4(new THREE.Matrix4().set(1, lean, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1));
    return this.add(g.translate(x, y, z), color, glow);
  }
  /** A hipped roof (or any rectangular frustum): wBot × dBot at y, wTop × dTop at y + h. */
  hip(wBot: number, dBot: number, wTop: number, dTop: number, h: number, x: number, y: number, z: number, color: C, glow = false) {
    const g = new THREE.CylinderGeometry(1, 1, h, 4, 1).rotateY(Math.PI / 4);
    const p = g.getAttribute('position');
    const k = Math.SQRT2;
    for (let i = 0; i < p.count; i++) {
      const top = p.getY(i) > 0;
      p.setX(i, p.getX(i) * k * (top ? wTop : wBot) * 0.5);
      p.setZ(i, p.getZ(i) * k * (top ? dTop : dBot) * 0.5);
    }
    return this.add(g.translate(x, y + h / 2, z), color, glow);
  }
  /** A flat polygon (x, z pairs) extruded upward from y by h. */
  prism(pts: [number, number][], h: number, y: number, color: C, glow = false) {
    const s = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
    return this.add(new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false }).rotateX(-Math.PI / 2).translate(0, y, 0), color, glow);
  }
  build(): THREE.Group {
    const group = new THREE.Group();
    const make = (list: { g: THREE.BufferGeometry; c: THREE.Color }[], glow: boolean) => {
      if (!list.length) return;
      const pos: number[] = [];
      const col: number[] = [];
      for (const { g, c } of list) {
        const p = g.getAttribute('position').array;
        for (let i = 0; i < p.length; i += 3) {
          pos.push(p[i], p[i + 1], p[i + 2]);
          col.push(c.r, c.g, c.b);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      geo.computeVertexNormals();
      const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
      mat.onBeforeCompile = (sh) => {
        sh.uniforms.uNight = groundUniforms.uNight;
        Object.assign(sh.uniforms, lookUniforms);
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', `#include <common>\nuniform float uNight;\n${LOOK_PARS}`)
          .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, uLk_landmark * (0.55 + 0.6 * dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11))), uLk_landmarkK);')
          .replace(
            '#include <emissivemap_fragment>',
            glow ? '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * max(uNight, uLk_lineGlow * 0.6) * 0.95;' : '#include <emissivemap_fragment>',
          );
      };
      mat.customProgramCacheKey = () => (glow ? 'landmark-glow' : 'landmark-solid');
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    };
    make(this.solid, false);
    make(this.glow, true);
    return group;
  }
}

export const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);


export function suspensionBridge(o: {
  span: number; // distance between towers
  towerH: number;
  deckH: number;
  width: number;
  side: number; // side span to each anchorage
  color: C;
  cableColor: C;
  tower: (k: Kit, x: number) => void;
  stays?: boolean; // Brooklyn Bridge style diagonal stays
  hangers?: number; // spacing
  deckColor?: C;
  glowTowers?: boolean;
}) {
  const k = new Kit();
  const half = o.span / 2;
  const L = half + o.side;
  k.box(L * 2, 3, o.width, 0, o.deckH, 0, o.deckColor ?? o.color);
  for (const x of [-half, half]) o.tower(k, x);
  for (const z of [-o.width / 2 + 1.5, o.width / 2 - 1.5]) {
    const pts: THREE.Vector3[] = [];
    const N = 36;
    for (let i = 0; i <= N; i++) {
      const x = -half + (o.span * i) / N;
      const t = x / half;
      pts.push(V(x, o.deckH + 4 + (o.towerH - o.deckH - 4) * t * t, z));
    }
    k.cable(pts, 0.9, o.cableColor);
    for (const sgn of [-1, 1]) k.rod(V(sgn * half, o.towerH, z), V(sgn * L, o.deckH + 2, z), 0.9, o.cableColor);
    if (o.hangers) {
      for (let x = -half + o.hangers; x < half; x += o.hangers) {
        const t = x / half;
        k.rod(V(x, o.deckH + 3, z), V(x, o.deckH + 4 + (o.towerH - o.deckH - 4) * t * t, z), 0.25, o.cableColor);
      }
    }
    if (o.stays) {
      for (const sgn of [-1, 1]) {
        for (let i = 1; i <= 8; i++) {
          const x = sgn * half - sgn * i * (o.span / 2 / 9);
          k.rod(V(sgn * half, o.towerH * 0.82, z), V(x, o.deckH + 3, z), 0.3, o.cableColor);
          const xo = sgn * half + sgn * i * (o.side / 9);
          k.rod(V(sgn * half, o.towerH * 0.82, z), V(xo, o.deckH + 3, z), 0.3, o.cableColor);
        }
      }
    }
  }
  return k.build();
}

export function wheel(o: { R: number; hub: number; cars: number; legs: 'a' | 'cantilever'; rim: C; carColors: C[]; glowCars?: boolean }) {
  // Returns { group, spinner } so the rim can turn.
  const base = new Kit();
  const R = o.R;
  if (o.legs === 'a') {
    for (const z of [-6, 6]) {
      base.rod(V(-R * 0.55, 0, z), V(0, o.hub, z), 1.4, '#d8d8d8');
      base.rod(V(R * 0.55, 0, z), V(0, o.hub, z), 1.4, '#d8d8d8');
    }
  } else {
    base.rod(V(0, 0, -R * 0.45), V(0, o.hub, 0), 2.2, '#dfe3e8');
    base.rod(V(0, 0, R * 0.1 - R * 0.45), V(0, o.hub, 0), 2.2, '#dfe3e8');
  }
  base.box(4, 4, 14, 0, o.hub - 2, 0, '#b8bec6');
  const spin = new Kit();
  spin.torus(R, 1.1, o.rim);
  spin.torus(R * 0.93, 0.5, o.rim);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    spin.rod(V(0, 0, 0), V(Math.cos(a) * R, Math.sin(a) * R, 0), 0.35, '#e8ecf0');
  }
  const group = base.build();
  const spinner = spin.build();
  spinner.position.set(0, o.hub, 0);
  // Cars stay upright: separate objects counter-rotated each frame.
  const cars = new THREE.Group();
  for (let i = 0; i < o.cars; i++) {
    const ck = new Kit();
    const c = o.carColors[i % o.carColors.length];
    ck.sphere(o.R > 40 ? 3.6 : 2.6, 0, -1.6, 0, c, { sy: 0.8, glow: o.glowCars });
    const car = ck.build();
    car.userData.a = (i / o.cars) * Math.PI * 2;
    cars.add(car);
  }
  cars.position.set(0, o.hub, 0);
  group.add(spinner, cars);
  group.userData.spin = { spinner, cars, R };
  return group;
}


/** A landmark placed at real coordinates. */
export interface Placed {
  build: () => THREE.Group;
  at: [number, number]; // lon, lat
  /** Align local +x toward this point (bridges: roads under the deck are cut) or rotate by `rot` radians. */
  toward?: [number, number];
  /** Align local +x toward this point without cutting roads. */
  face?: [number, number];
  rot?: number;
  /** Shuttle back and forth to this point (ferries): a round trip every `period` seconds. */
  sail?: { to: [number, number]; period: number; phase: number };
  y?: number;
  clear?: number; // meters of buildings to clear around it
  cutHalf?: number; // half-length of the road corridor to hide under a bridge deck
}
