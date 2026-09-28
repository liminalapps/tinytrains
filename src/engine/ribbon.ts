import * as THREE from 'three';

// Screen-aware polyline ribbons. The geometry stores the centerline plus a unit miter per vertex;
// the vertex shader pushes vertices sideways by a width uniform so we can widen lines as the
// camera zooms out without rebuilding geometry.

export interface RibbonInput {
  pts: ArrayLike<number>; // flat x,y (map meters, y north)
  color?: THREE.Color;
  lane?: number; // lateral offset in lane units
  elev?: ArrayLike<number>; // per point, -1..1
  kind?: number; // free per-ribbon value passed to the shader (road class, tunnel flag...)
}

export function buildRibbons(list: RibbonInput[], y = 0): THREE.BufferGeometry {
  let nVerts = 0;
  let nIdx = 0;
  for (const r of list) {
    const n = r.pts.length / 2;
    if (n < 2) continue;
    nVerts += n * 2;
    nIdx += (n - 1) * 6;
  }
  const pos = new Float32Array(nVerts * 3);
  const miter = new Float32Array(nVerts * 2);
  const side = new Float32Array(nVerts);
  const lane = new Float32Array(nVerts);
  const dist = new Float32Array(nVerts);
  const elev = new Float32Array(nVerts);
  const kind = new Float32Array(nVerts);
  const col = new Float32Array(nVerts * 3);
  const idx = new Uint32Array(nIdx);
  let v = 0;
  let k = 0;
  for (const r of list) {
    const p = r.pts;
    const n = p.length / 2;
    if (n < 2) continue;
    const c = r.color ?? new THREE.Color(1, 1, 1);
    let d = 0;
    for (let i = 0; i < n; i++) {
      const x = p[i * 2];
      const z = -p[i * 2 + 1];
      // Directions of the incoming and outgoing edges (in x,z).
      let ax = 0;
      let az = 0;
      let bx = 0;
      let bz = 0;
      if (i > 0) {
        ax = x - p[i * 2 - 2];
        az = z + p[i * 2 - 1];
        const l = Math.hypot(ax, az) || 1;
        d += l;
        ax /= l;
        az /= l;
      }
      if (i < n - 1) {
        bx = p[i * 2 + 2] - x;
        bz = -p[i * 2 + 3] - z;
        const l = Math.hypot(bx, bz) || 1;
        bx /= l;
        bz /= l;
      }
      if (i === 0) {
        ax = bx;
        az = bz;
      }
      if (i === n - 1) {
        bx = ax;
        bz = az;
      }
      let tx = ax + bx;
      let tz = az + bz;
      const tl = Math.hypot(tx, tz);
      if (tl < 1e-6) {
        tx = bx;
        tz = bz;
      } else {
        tx /= tl;
        tz /= tl;
      }
      // Normal (left of travel direction) scaled by the miter length.
      let nx = -tz;
      let nz = tx;
      const cosHalf = Math.max(0.4, nx * -bz + nz * bx);
      nx /= cosHalf;
      nz /= cosHalf;
      for (let s = 0; s < 2; s++) {
        pos[v * 3] = x;
        pos[v * 3 + 1] = y;
        pos[v * 3 + 2] = z;
        miter[v * 2] = nx;
        miter[v * 2 + 1] = nz;
        side[v] = s === 0 ? -1 : 1;
        lane[v] = r.lane ?? 0;
        dist[v] = d;
        elev[v] = r.elev ? r.elev[i] : 0;
        kind[v] = r.kind ?? 0;
        col[v * 3] = c.r;
        col[v * 3 + 1] = c.g;
        col[v * 3 + 2] = c.b;
        v++;
      }
      if (i < n - 1) {
        const a = v - 2;
        idx[k++] = a;
        idx[k++] = a + 2;
        idx[k++] = a + 1;
        idx[k++] = a + 1;
        idx[k++] = a + 2;
        idx[k++] = a + 3;
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aMiter', new THREE.BufferAttribute(miter, 2));
  g.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
  g.setAttribute('aLane', new THREE.BufferAttribute(lane, 1));
  g.setAttribute('aDist', new THREE.BufferAttribute(dist, 1));
  g.setAttribute('aElev', new THREE.BufferAttribute(elev, 1));
  g.setAttribute('aKind', new THREE.BufferAttribute(kind, 1));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  return g;
}

/** GLSL for the vertex push; expects uniforms uHalfW, uLaneW, uElevH. */
export const RIBBON_VERT_PARS = /* glsl */ `
attribute vec2 aMiter;
attribute float aSide;
attribute float aLane;
attribute float aDist;
attribute float aElev;
attribute float aKind;
uniform float uHalfW;
uniform float uLaneW;
uniform float uElevH;
varying float vSide;
varying float vDist;
varying float vKind;
varying float vElev;
`;

export const RIBBON_VERT_MAIN = /* glsl */ `
vec3 rp = position;
rp.xz += aMiter * (aLane * uLaneW + aSide * uHalfW);
rp.y += max(aElev, 0.0) * uElevH;
vSide = aSide;
vDist = aDist;
vKind = aKind;
vElev = aElev;
`;
