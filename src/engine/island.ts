import * as THREE from 'three';
import type { CityId, GeoData, Polygon } from '../../shared/types.ts';
import { buildRibbons, RIBBON_VERT_PARS } from './ribbon.ts';
import { makeGrid, rasterize, rng, sampleMask, signedDistance, type Grid } from './raster.ts';
import type { FrameInfo, Layer } from './world.ts';
import { LOW } from './quality.ts';
import { LOOK_PARS, lookUniforms, STYLE } from '../themes/look.ts';

/** Shared, per-frame uniforms for all ground materials. */
export const groundUniforms = {
  uTime: { value: 0 },
  uNight: { value: 0 },
  uMpp: { value: 1 },
  uSdf: { value: null as THREE.Texture | null },
  uSdfBox: { value: new THREE.Vector4(0, 0, 1, 1) }, // minX, minY, sizeX, sizeY (map meters)
  uSdfCell: { value: 20 },
  /** Parks and woods as a mask over the same grid as uSdf (voxel ground reads it per cell). */
  uGreenMask: { value: null as THREE.Texture | null },
};

export const PALETTE = {
  land: '#eef0cf',
  land2: '#e3ecc2',
  park: '#a9dc85',
  green: '#95d27c',
  sand: '#f6e4a6',
  airport: '#e2e8d4',
  runway: '#b9bec7',
  waterDeep: '#56b9e0',
  waterShallow: '#8fe1ee',
  foam: '#f4feff',
  road: '#fffdf6',
  motorway: '#fff0c4',
  rail: '#c9bfae',
  grassLip: '#9ed06f',
  soil: ['#d59a61', '#bf8250', '#a46c43'],
  rock: ['#8f7563', '#7a6454', '#665548'],
};

/** Night palette: the ground shifts to these as the sun goes down. */
const NIGHT = {
  land: '#2b3a60',
  park: '#214b4c',
  green: '#1f4545',
  sand: '#4a4c68',
  airport: '#2f3b5c',
  runway: '#4a5270',
  water: '#15265c',
};
const glslColor = (hex: string) => `vec3(${new THREE.Color(hex).toArray().map((v) => v.toFixed(4)).join(',')})`;
const nightMix = (hex: string, k = 0.82) => `\ndiffuseColor.rgb = mix(diffuseColor.rgb, ${glslColor(hex)}, uNight * ${k.toFixed(2)} * uLk_nightK);`;

/**
 * Flat map layers are drawn in this fixed order without writing depth, like a 2D map renderer:
 * later layers paint over earlier ones deterministically, so coplanar overlaps (roads crossing,
 * parks over woods) can never z-fight. Only the land surface writes depth for the 3D objects.
 */
export const LAYER = { land: -20, green: -19, airport: -18, sand: -17, park: -16, runway: -15, water: -14, shore: -13, rail: -12, road: -11 };

const Y = { green: 0.3, airport: 0.35, park: 0.5, sand: 0.45, runway: 0.7, water: 0.9, shore: 1.1, rail: 1.25, road: 1.4 };

// ---------------------------------------------------------------------------
// Polygon meshes
// ---------------------------------------------------------------------------
function polyGeometry(polys: Polygon[], y: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  for (const poly of polys) {
    const rings = poly.map((r) => {
      const v: THREE.Vector2[] = [];
      for (let i = 0; i < r.length; i += 2) v.push(new THREE.Vector2(r[i], r[i + 1]));
      return v;
    });
    if (rings[0].length < 3) continue;
    let tris: number[][];
    try {
      tris = THREE.ShapeUtils.triangulateShape(rings[0], rings.slice(1).filter((h) => h.length >= 3));
    } catch {
      continue;
    }
    const all = rings[0].concat(...rings.slice(1).filter((h) => h.length >= 3));
    const base = pos.length / 3;
    for (const p of all) pos.push(p.x, y, -p.y);
    for (const t of tris) {
      const a = all[t[0]];
      const b = all[t[1]];
      const c = all[t[2]];
      const ccw = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x) > 0;
      if (ccw) idx.push(base + t[0], base + t[1], base + t[2]);
      else idx.push(base + t[0], base + t[2], base + t[1]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const nor = new Float32Array(pos.length);
  for (let i = 1; i < nor.length; i += 3) nor[i] = 1;
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

/** Flat ground/ribbons: light as if facing up no matter which way the triangle winds. */
export const NORMAL_UP = '#include <normal_fragment_begin>\nnormal = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);';

const WORLD_VARY_VERT = [
  '#include <common>\nvarying vec3 vWorld;',
  '#include <worldpos_vertex>\nvWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;',
];

const NOISE_GLSL = /* glsl */ `
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), f.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), f.x), f.y);
}
uniform sampler2D uSdf;
uniform vec4 uSdfBox;
uniform float uSdfCell;
uniform float uTime;
uniform float uNight;
uniform float uMpp;
uniform sampler2D uGreenMask;
${LOOK_PARS}
float sdfAt(vec3 w) {
  vec2 uv = vec2((w.x - uSdfBox.x) / uSdfBox.z, (-w.z - uSdfBox.y) / uSdfBox.w);
  return texture2D(uSdf, uv).r * 1500.0;
}
float greenAt(vec3 w) {
  vec2 uv = vec2((w.x - uSdfBox.x) / uSdfBox.z, (-w.z - uSdfBox.y) / uSdfBox.w);
  return texture2D(uGreenMask, uv).r;
}
bool lkVoxel() { return uLk_voxel > 0.8; }
/** A ruled grid whose spacing follows the zoom (about 44 px apart, crossfading between powers of two). */
float lkGrid(vec3 w) {
  float lv = log2(max(uMpp, 0.05) * 44.0);
  float s0 = exp2(floor(lv));
  float f = fract(lv);
  vec2 g0 = abs(fract(w.xz / s0 - 0.5) - 0.5) * s0 / uMpp;
  vec2 g1 = abs(fract(w.xz / (s0 * 2.0) - 0.5) - 0.5) * s0 * 2.0 / uMpp;
  float l0 = 1.0 - smoothstep(0.3, 1.1, min(g0.x, g0.y));
  float l1 = 1.0 - smoothstep(0.3, 1.1, min(g1.x, g1.y));
  return max(l0 * (1.0 - f), l1);
}
/** Brushstrokes: overlapping elongated dabs laid along a slowly turning flow; returns the top dab's tone (0..1). */
float lkBrushAt(vec2 p) {
  vec2 g = floor(p);
  float flow = vnoise(p * 0.07) * 3.1416;
  float best = 0.0, tone = 0.5;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 o = vec2(float(x), float(y));
    vec2 c = g + o + vec2(hash12(g + o), hash12(g + o + 5.3));
    float a = flow + (hash12(g + o + 9.1) - 0.5) * 0.9;
    vec2 d = mat2(cos(a), -sin(a), sin(a), cos(a)) * (p - c);
    float w = 1.0 - smoothstep(0.35, 0.75, length(d * vec2(0.55, 1.7)));
    w *= 0.6 + 0.4 * hash12(g + o + 2.2);
    if (w > best) { best = w; tone = hash12(g + o + 4.4); }
  }
  return mix(0.5, tone, smoothstep(0.0, 0.3, best));
}
/** Strokes about 24 px across at any zoom, crossfading between powers of two. */
float lkBrush(vec3 w) {
  float lv = log2(max(uMpp, 0.05) * 24.0);
  float s0 = exp2(floor(lv));
  float f = smoothstep(0.0, 1.0, fract(lv));
  return mix(lkBrushAt(w.xz / s0), lkBrushAt(w.xz / (s0 * 2.0) + 31.7), f);
}
/** Cubist planes: jittered cells; returns a per-plane shade (-1..1) and an edge weight (0..1). */
vec2 lkFacetAt(vec2 p, float px) {
  vec2 g = floor(p);
  vec2 f = fract(p);
  float d1 = 8.0, d2 = 8.0, id = 0.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 o = vec2(float(x), float(y));
    vec2 h = vec2(hash12(g + o), hash12(g + o + 7.31));
    vec2 r = o + 0.1 + h * 0.8 - f;
    float d = max(abs(r.x * 0.87 + r.y * 0.5), max(abs(r.x * 0.87 - r.y * 0.5), abs(r.y)));
    if (d < d1) { d2 = d1; d1 = d; id = hash12(g + o + 3.7); }
    else if (d < d2) d2 = d;
  }
  return vec2(id * 2.0 - 1.0, 1.0 - smoothstep(0.6 * px, 1.4 * px, (d2 - d1) * 0.5));
}
vec2 lkFacet(vec3 w) {
  float lv = log2(max(uMpp, 0.05) * 70.0);
  float s0 = exp2(floor(lv));
  float f = smoothstep(0.0, 1.0, fract(lv));
  float px0 = uMpp / s0;
  vec2 a = lkFacetAt(w.xz / s0, px0);
  vec2 b = lkFacetAt(w.xz / (s0 * 2.0) + 13.1, px0 * 0.5);
  return mix(a, b, f);
}
/** The painterly and cubist treatments, blending a surface's color toward an alternate tone. */
vec3 lkPaint(vec3 col, vec3 alt, vec3 w) {
  if (uLk_brushK > 0.001) {
    float b = lkBrush(w);
    col = mix(col, alt, smoothstep(0.45, 0.8, b) * 0.9 * uLk_brushK);
    // Impressionist shade: cool lilac dabs rather than darker paint.
    col = mix(col, col * vec3(0.9, 0.86, 1.06), smoothstep(0.38, 0.12, b) * 0.9 * uLk_brushK);
  }
  if (uLk_facetK > 0.001) {
    vec2 fc = lkFacet(w);
    col = mix(col, alt, (fc.x * 0.5 + 0.5) * 0.6 * uLk_facetK);
    col *= 1.0 + fc.x * 0.08 * uLk_facetK;
    col = mix(col, uLk_facetEdge, fc.y * 0.3 * uLk_facetK);
  }
  return col;
}
/** Voxel ground at block size V: every cell takes one material (water, beach, park or land) from its center. */
vec3 voxelCell(vec3 w, float V, out float isWater) {
  vec2 cell = floor(w.xz / V);
  vec3 cc = vec3((cell.x + 0.5) * V, 0.0, (cell.y + 0.5) * V);
  float d = sdfAt(cc);
  float h = hash12(cell + V * 0.137);
  vec2 f = fract(w.xz / V);
  float px = V / max(uMpp, 1e-3);
  vec3 col;
  isWater = step(d, 0.0);
  if (d < 0.0) {
    col = mix(uLk_waterShallow, uLk_waterDeep, sqrt(smoothstep(0.0, 900.0, -d)));
    // A slow shimmer, block by block.
    col *= 0.975 + 0.05 * h + 0.03 * sin(uTime * 0.9 + h * 40.0) * smoothstep(0.5, 0.9, h);
    // Water sits a block below the land: the land's side face shows along the far edges of the cell.
    float lip = 0.0;
    if (sdfAt(cc + vec3(0.0, 0.0, -V)) > 0.0) lip = max(lip, 1.0 - step(0.28, f.y));
    if (sdfAt(cc + vec3(-V, 0.0, 0.0)) > 0.0) lip = max(lip, (1.0 - step(0.2, f.x)) * 0.8);
    col = mix(col, uLk_sand * 0.72, lip);
  } else {
    bool park = greenAt(cc) > 0.5;
    if (d < min(V * 1.3, 36.0) && !park) col = uLk_sand * (0.95 + 0.07 * h);
    else if (park) col = uLk_park * (0.86 + 0.22 * h);
    else col = uLk_land * (0.92 + 0.13 * h);
    // A lit top-left edge and a shaded bottom-right edge on each block.
    col *= 1.0 + 0.08 * (1.0 - step(0.1, f.y)) - 0.07 * step(0.9, f.x);
  }
  float e = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)) * px;
  col *= 1.0 - 0.1 * (1.0 - smoothstep(0.4, 1.4, e));
  return col;
}
/** Voxel ground whose blocks grow with the zoom (never under ~8 px), crossfading between powers of two. */
vec3 voxelGround(vec3 w, out float isWater) {
  float base = uLk_voxel;
  float lv = max(0.0, log2(8.0 * max(uMpp, 1e-3) / base));
  float k0 = floor(lv);
  float f = smoothstep(0.75, 1.0, fract(lv));
  float wa, wb;
  vec3 a = voxelCell(w, base * exp2(k0), wa);
  if (f < 0.001) { isWater = wa; return a; }
  vec3 b = voxelCell(w, base * exp2(k0 + 1.0), wb);
  isWater = mix(wa, wb, f);
  return mix(a, b, f);
}
`;

// Every patched material needs its own program cache key: three.js keys programs by the
// onBeforeCompile source, which is identical for all materials built by these factories.
let programSeq = 0;

function groundMaterial(color: string, patch: (sh: THREE.WebGLProgramParametersWithUniforms) => void, opts: THREE.MeshLambertMaterialParameters = {}) {
  const m = new THREE.MeshLambertMaterial({ color, ...opts });
  const key = `ground-${programSeq++}`;
  m.customProgramCacheKey = () => key;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, groundUniforms, lookUniforms);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', WORLD_VARY_VERT[0]).replace('#include <worldpos_vertex>', WORLD_VARY_VERT[1]);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWorld;\n${NOISE_GLSL}`)
      .replace('#include <normal_fragment_begin>', NORMAL_UP);
    patch(sh);
  };
  return m;
}

function landMaterial() {
  return groundMaterial(PALETTE.land, (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <color_fragment>',
      /* glsl */ `
      float gridGlow = 0.0;
      if (lkVoxel()) {
        float wet;
        diffuseColor.rgb = voxelGround(vWorld, wet);
      } else {
        diffuseColor.rgb = uLk_land;
        float n = vnoise(vWorld.xz / 2600.0) * 0.6 + vnoise(vWorld.xz / 700.0) * 0.4;
        diffuseColor.rgb = mix(diffuseColor.rgb, uLk_land2, smoothstep(0.35, 0.75, n) * uLk_detail);
        diffuseColor.rgb = lkPaint(diffuseColor.rgb, uLk_land2, vWorld);
        float d = sdfAt(vWorld);
        float beach = max(50.0, uMpp * 5.0);
        diffuseColor.rgb = mix(uLk_sand, diffuseColor.rgb, smoothstep(beach * 0.25, beach, d));
        ${nightMix(NIGHT.land)}
        float g = lkGrid(vWorld) * uLk_gridK;
        diffuseColor.rgb = mix(diffuseColor.rgb, uLk_grid, g);
        gridGlow = g * uLk_lineGlow;
      }
      `,
    );
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\ntotalEmissiveRadiance += uLk_grid * gridGlow * 0.6;',
    );
  });
}

const WATER_GLSL = /* glsl */ `
// Moving cell edges read as the bright web of light on a shallow sea floor.
float causticWeb(vec2 p, float t) {
  vec2 g = floor(p);
  vec2 f = fract(p);
  float d1 = 8.0;
  float d2 = 8.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 o = vec2(float(x), float(y));
      vec2 h = vec2(hash12(g + o), hash12(g + o + 19.19));
      vec2 r = o + 0.5 + 0.4 * sin(t + 6.2831 * h) - f;
      float dd = dot(r, r);
      if (dd < d1) { d2 = d1; d1 = dd; } else if (dd < d2) { d2 = dd; }
    }
  }
  float e = sqrt(d2) - sqrt(d1);
  return 1.0 - smoothstep(0.0, 0.28, e);
}
`;

function waterMaterial() {
  const mat = groundMaterial(PALETTE.waterDeep, (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('void main() {', `${WATER_GLSL}\nvoid main() {`).replace(
      '#include <color_fragment>',
      /* glsl */ `
      float d = -sdfAt(vWorld); // meters offshore
      float px = uMpp; // meters per CSS pixel
      float fd = max(fwidth(d), 1e-3);
      float K = uLk_detail;
      // 1. Depth: shallows easing into deep water, with a slow drifting tint so open water isn't flat.
      float deepK = smoothstep(0.0, max(700.0, px * 80.0), d);
      vec3 col = mix(uLk_waterShallow, uLk_waterDeep, sqrt(deepK));
      float drift = vnoise(vWorld.xz / 3200.0 + vec2(uTime * 0.004, -uTime * 0.003));
      col = mix(col, col * vec3(0.9, 0.97, 1.04), drift * 0.8 * K);
      // 2. Caustic shimmer in the shallows, only when close enough to read it.
      float close = (1.0 - smoothstep(1.0, 4.0, px)) * K;
      float caust = 0.0;
      if (close > 0.001) {
        float c = causticWeb(vWorld.xz / 52.0, uTime * 0.45);
        float shallowK = 1.0 - smoothstep(0.0, 180.0, d);
        caust = c * c * close * shallowK;
        col = mix(col, vec3(0.93, 1.0, 1.0), caust * 0.15);
      }
      // 3. Ripple lines tracing the coast, drifting slowly outward and fading.
      float sp = max(uSdfCell * 1.6, px * 16.0);
      float wob = (vnoise(vWorld.xz / (sp * 2.2) + vec2(uTime * 0.04)) - 0.5) * sp * 0.7;
      float ph = (d + wob) / sp - uTime * 0.12;
      float lw = fwidth(ph);
      float line = 1.0 - smoothstep(lw * 0.6, lw * 1.6, abs(fract(ph) - 0.5));
      float rings = line * smoothstep(sp * 3.4, sp * 0.9, d) * smoothstep(sp * 0.3, sp * 0.75, d);
      col = mix(col, uLk_foam, rings * 0.6 * K);
      // 4. Foam hugging the shore, with a lacy, breathing edge.
      float fw = max(uSdfCell * 0.55, px * 3.2);
      float lace = mix(0.6, vnoise(vWorld.xz / (fw * 1.3) + vec2(uTime * 0.35, -uTime * 0.22)), K);
      float edge = fw * (0.45 + 0.55 * lace) * (0.85 + 0.15 * sin(uTime * 1.1) * K);
      float foamAmt = 1.0 - smoothstep(edge - fd, edge + fd, d);
      col = mix(col, uLk_foam, foamAmt * 0.92);
      // 5. Sun glints: a few soft dots on open water that wink in and out.
      float gs = max(10.0, px * 11.0);
      vec2 gq = vWorld.xz / gs;
      vec2 gc = floor(gq);
      float gh = hash12(gc);
      vec2 gp = fract(gq) - (0.25 + 0.5 * vec2(hash12(gc + 7.13), hash12(gc + 3.71)));
      float glint = step(0.94, gh) * (1.0 - smoothstep(0.03, 0.12, length(gp))) * pow(max(0.0, sin(uTime * 1.3 + gh * 57.0)), 6.0);
      glint *= smoothstep(sp * 1.5, sp * 4.0, d) * K;
      col = mix(col, vec3(1.0), glint * 0.75);
      // Night: ink-blue water; the coast lines and glints pick up moonlight.
      vec3 nightCol = ${glslColor(NIGHT.water)} * (1.0 + 0.25 * (1.0 - deepK));
      nightCol += vec3(0.42, 0.55, 0.9) * (rings * 0.35 * K + foamAmt * 0.3 + glint * 0.8 + caust * 0.12);
      col = lkPaint(col, mix(uLk_waterShallow, uLk_foam, 0.45), vWorld);
      diffuseColor.rgb = mix(col, nightCol, uNight * 0.88 * uLk_nightK);
      // Neon traces only a thin band at the shore (the lacy foam would light up whole narrow rivers).
      float glowW = (rings * 0.5 * uLk_detail + 1.0 - smoothstep(fd, fw * 0.4, d)) * uLk_coastGlowK * mix(1.0, 0.45, smoothstep(4.0, 20.0, uMpp));
      if (lkVoxel()) {
        float wet;
        vec3 v = voxelGround(vWorld, wet);
        if (wet < 0.5) discard;
        diffuseColor.rgb = v;
        glowW = 0.0;
      }
      `,
    );
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      /* glsl */ `#include <emissivemap_fragment>
      totalEmissiveRadiance += vec3(0.02, 0.05, 0.12) * uNight * uLk_nightK + uLk_coastGlow * glowW;`,
    );
  });
  return mat;
}

/** Parks, woods, sand, airports, runways: a flat fill from the look, lightly mottled when detail is on. */
function flatMaterial(role: 'park' | 'green' | 'sand' | 'airport' | 'runway', night: string, noiseAmt = 0.06) {
  // Voxel ground paints parks, woods and beaches per cell itself.
  const voxelDiscard = role === 'park' || role === 'green' || role === 'sand' ? 'if (lkVoxel()) discard;' : '';
  return groundMaterial('#ffffff', (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <color_fragment>',
      `${voxelDiscard}
      diffuseColor.rgb = uLk_${role} * (1.0 - ${noiseAmt.toFixed(3)} * uLk_detail + ${(noiseAmt * 2).toFixed(3)} * uLk_detail * vnoise(vWorld.xz / 180.0));
      diffuseColor.rgb = lkPaint(diffuseColor.rgb, ${role === 'park' ? 'uLk_green' : role === 'green' ? 'uLk_park' : 'uLk_land2'}, vWorld);${nightMix(night)}`,
    );
  });
}

// ---------------------------------------------------------------------------
// Ribbons (roads, other rail, shorelines)
// ---------------------------------------------------------------------------
export const roadUniforms = {
  uRoadW: { value: new THREE.Vector4(12, 8, 6, 4) },
};

function ribbonMaterial(opts: { color?: string; vertexColors?: boolean; transparent?: boolean; opacity?: number }, widthExpr: string, frag = '') {
  const m = new THREE.MeshLambertMaterial({
    color: opts.color ?? '#ffffff',
    vertexColors: opts.vertexColors ?? false,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
    depthWrite: !opts.transparent,
    side: THREE.DoubleSide,
  });
  const key = `ribbon-${programSeq++}`;
  m.customProgramCacheKey = () => key;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, groundUniforms, roadUniforms, lookUniforms, { uHalfW: { value: 1 }, uLaneW: { value: 0 }, uElevH: { value: 0 } });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${RIBBON_VERT_PARS}\nuniform vec4 uRoadW;\nuniform float uMpp;`)
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3(0.0, 1.0, 0.0);')
      .replace('#include <begin_vertex>', `float halfW = ${widthExpr};\nvec3 rp = position;\nrp.xz += aMiter * aSide * halfW;\nvSide = aSide; vDist = aDist; vKind = aKind; vElev = aElev;\nvec3 transformed = rp;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying float vSide;\nvarying float vDist;\nvarying float vKind;\nvarying float vElev;\nuniform float uNight;\nuniform float uTime;\nuniform float uMpp;\n${LOOK_PARS}\nbool lkVoxelR() { return uLk_voxel > 0.8; }`)
      .replace('#include <normal_fragment_begin>', NORMAL_UP);
    if (frag) sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>\n${frag}`);
  };
  return m;
}

// ---------------------------------------------------------------------------
// Island
// ---------------------------------------------------------------------------
export class Island implements Layer {
  readonly group = new THREE.Group();
  readonly grid: Grid;
  readonly water: Uint8Array;
  readonly bounds: GeoData['bounds'];
  private trees: THREE.InstancedMesh[] = [];
  private shadowCasters: THREE.Object3D[] = [];
  private sdfTex: THREE.DataTexture;
  private greenTex: THREE.DataTexture;
  private treeGeos: { blob: THREE.BufferGeometry; cube: THREE.BufferGeometry } | null = null;

  constructor(
    readonly city: CityId,
    readonly geo: GeoData,
    private roadCuts: { x: number; y: number; dx: number; dy: number; half: number; width: number }[] = [],
  ) {
    const b = geo.bounds;
    this.bounds = b;
    // Water mask + signed distance field for shallows, beaches and foam.
    this.grid = makeGrid(b, 2048);
    this.water = rasterize(this.grid, geo.water);
    const sdf = signedDistance(this.grid, this.water);
    // Half floats keep the distance precise near the coast (8 bits over ±1.5 km gave 12 m steps, too coarse
    // for crisp shoreline ripples). DataTexture row 0 = first row of data; our grid row 0 is north, so flip.
    const { w, h } = this.grid;
    const flipped = new Uint16Array(sdf.length);
    for (let j = 0; j < h; j++) {
      const src = j * w;
      const dst = (h - 1 - j) * w;
      for (let i = 0; i < w; i++) flipped[dst + i] = THREE.DataUtils.toHalfFloat(Math.max(-1, Math.min(1, sdf[src + i] / 1500)));
    }
    this.sdfTex = new THREE.DataTexture(flipped, w, h, THREE.RedFormat, THREE.HalfFloatType);
    this.sdfTex.magFilter = THREE.LinearFilter;
    this.sdfTex.minFilter = THREE.LinearFilter;
    this.sdfTex.needsUpdate = true;
    groundUniforms.uSdf.value = this.sdfTex;
    groundUniforms.uSdfBox.value.set(this.grid.minX, this.grid.maxY - h * this.grid.cell, w * this.grid.cell, h * this.grid.cell);
    groundUniforms.uSdfCell.value = this.grid.cell;
    // Parks and woods on the same grid, so voxel ground can color whole cells.
    const greens = [...(geo.parks ?? []), ...(geo.green ?? [])];
    const gm = greens.length ? rasterize(this.grid, greens) : new Uint8Array(w * h);
    const gflip = new Uint8Array(w * h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) gflip[(h - 1 - j) * w + i] = gm[j * w + i] ? 255 : 0;
    this.greenTex = new THREE.DataTexture(gflip, w, h, THREE.RedFormat, THREE.UnsignedByteType);
    this.greenTex.magFilter = THREE.NearestFilter;
    this.greenTex.minFilter = THREE.NearestFilter;
    this.greenTex.needsUpdate = true;
    groundUniforms.uGreenMask.value = this.greenTex;

    this.buildSlab();
    this.buildSurfaces();
    this.buildRibbons();
    this.buildTrees();
  }

  /** Rounded-rect outline of the diorama (map meters, CCW). */
  outline(step = 120): [number, number][] {
    const b = this.bounds;
    const r = Math.min(b.maxX - b.minX, b.maxY - b.minY) * 0.06;
    const pts: [number, number][] = [];
    const corners: [number, number, number][] = [
      [b.maxX - r, b.minY + r, -Math.PI / 2],
      [b.maxX - r, b.maxY - r, 0],
      [b.minX + r, b.maxY - r, Math.PI / 2],
      [b.minX + r, b.minY + r, Math.PI],
    ];
    for (let c = 0; c < 4; c++) {
      const [cx, cy, a0] = corners[c];
      const nArc = 12;
      for (let i = 0; i <= nArc; i++) {
        const a = a0 + (i / nArc) * (Math.PI / 2);
        pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
      }
      const [nx, ny] = corners[(c + 1) % 4];
      const a1 = a0 + Math.PI / 2;
      const sx = cx + Math.cos(a1) * r;
      const sy = cy + Math.sin(a1) * r;
      const ex = nx + Math.cos(a1) * r;
      const ey = ny + Math.sin(a1) * r;
      const len = Math.hypot(ex - sx, ey - sy);
      const n = Math.max(1, Math.round(len / step));
      for (let i = 1; i < n; i++) pts.push([sx + ((ex - sx) * i) / n, sy + ((ey - sy) * i) / n]);
    }
    return pts;
  }

  private buildSlab() {
    const b = this.bounds;
    const out = this.outline();
    const size = Math.min(b.maxX - b.minX, b.maxY - b.minY);
    const T = size * 0.035;
    const cx = (b.minX + b.maxX) / 2;
    const cy = (b.minY + b.maxY) / 2;
    const rand = rng(1234);
    const isWater = out.map(([x, y]) => {
      // Probe slightly inside the edge.
      const dx = cx - x;
      const dy = cy - y;
      const l = Math.hypot(dx, dy);
      return sampleMask(this.grid, this.water, x + (dx / l) * 300, y + (dy / l) * 300) === 1;
    });
    interface Ring {
      y: number;
      s: number;
      wob: number;
      col: (i: number) => THREE.Color;
    }
    const C = (h: string) => new THREE.Color(h);
    const waterEdge = C('#7fd3ec');
    const waterDeep = C('#4aa7d4');
    const rings: Ring[] = [
      { y: 0, s: 1, wob: 0, col: (i) => (isWater[i] ? waterEdge : C(PALETTE.grassLip)) },
      { y: -T * 0.05, s: 1, wob: 0, col: (i) => (isWater[i] ? waterEdge : C(PALETTE.grassLip)) },
      { y: -T * 0.07, s: 1, wob: 0, col: (i) => (isWater[i] ? waterDeep : C(PALETTE.soil[0])) },
      { y: -T * 0.35, s: 1, wob: 0, col: (i) => (isWater[i] ? waterDeep.clone().lerp(C(PALETTE.soil[0]), 0.7) : C(PALETTE.soil[0])) },
      { y: -T * 0.37, s: 1, wob: 0, col: () => C(PALETTE.soil[1]) },
      { y: -T * 0.7, s: 1, wob: 0, col: () => C(PALETTE.soil[1]) },
      { y: -T * 0.72, s: 1, wob: 0, col: () => C(PALETTE.soil[2]) },
      { y: -T, s: 1, wob: 0, col: () => C(PALETTE.soil[2]) },
      { y: -T * 1.25, s: 0.96, wob: 0.01, col: () => C(PALETTE.rock[0]) },
      { y: -T * 2.1, s: 0.84, wob: 0.03, col: () => C(PALETTE.rock[1]) },
      { y: -T * 3.4, s: 0.62, wob: 0.05, col: () => C(PALETTE.rock[1]) },
      { y: -T * 4.8, s: 0.33, wob: 0.06, col: () => C(PALETTE.rock[2]) },
    ];
    const n = out.length;
    const ringPts = rings.map((r) =>
      out.map(([x, y]) => {
        const w = 1 + (rand() - 0.5) * 2 * r.wob * 4;
        const s = r.s * w;
        return new THREE.Vector3(cx + (x - cx) * s, r.y, -(cy + (y - cy) * s));
      }),
    );
    const pos: number[] = [];
    const col: number[] = [];
    const push = (v: THREE.Vector3, c: THREE.Color) => {
      pos.push(v.x, v.y, v.z);
      col.push(c.r, c.g, c.b);
    };
    for (let r = 0; r < rings.length - 1; r++) {
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const a = ringPts[r][i];
        const bq = ringPts[r][j];
        const c = ringPts[r + 1][j];
        const d = ringPts[r + 1][i];
        const ca = rings[r].col(i);
        const cb = rings[r + 1].col(i);
        push(a, ca);
        push(d, cb);
        push(bq, ca);
        push(bq, ca);
        push(d, cb);
        push(c, cb);
      }
    }
    // Bottom cap.
    const last = ringPts[ringPts.length - 1];
    const tip = new THREE.Vector3(cx, rings[rings.length - 1].y - T * 1.2, -cy);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const c = C(PALETTE.rock[2]);
      push(last[i], c);
      push(tip, c.clone().multiplyScalar(0.8));
      push(last[j], c);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    const slabMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });
    slabMat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, lookUniforms);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>\n${LOOK_PARS}`)
        .replace(
          '#include <color_fragment>',
          '#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, uLk_slab * (0.45 + 0.9 * dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11))), uLk_slabK);',
        );
    };
    slabMat.customProgramCacheKey = () => 'island-slab';
    const slab = new THREE.Mesh(g, slabMat);
    slab.receiveShadow = true;
    this.group.add(slab);

    // Top surface.
    const top = polyGeometry([[out.flat()]], 0);
    const land = new THREE.Mesh(top, landMaterial());
    land.receiveShadow = true;
    land.renderOrder = LAYER.land;
    this.group.add(land);
  }

  private buildSurfaces() {
    const add = (polys: Polygon[] | undefined, mat: THREE.Material, y: number, order: number) => {
      if (!polys?.length) return;
      mat.depthWrite = false;
      const m = new THREE.Mesh(polyGeometry(polys, y), mat);
      m.receiveShadow = true;
      m.renderOrder = order;
      this.group.add(m);
    };
    add(this.geo.green, flatMaterial('green', NIGHT.green, 0.08), Y.green, LAYER.green);
    add(this.geo.airports, flatMaterial('airport', NIGHT.airport, 0.03), Y.airport, LAYER.airport);
    add(this.geo.sand, flatMaterial('sand', NIGHT.sand, 0.05), Y.sand, LAYER.sand);
    add(this.geo.parks, flatMaterial('park', NIGHT.park, 0.08), Y.park, LAYER.park);
    add(this.geo.runways, flatMaterial('runway', NIGHT.runway, 0.02), Y.runway, LAYER.runway);
    add(this.geo.water, waterMaterial(), Y.water, LAYER.water);
  }

  private buildRibbons() {
    // Roads by class.
    const roadCols = [PALETTE.motorway, PALETTE.road, PALETTE.road, PALETTE.road].map((c) => new THREE.Color(c));
    // Split roads where they run under a modelled bridge deck.
    const cut = (x: number, y: number) =>
      this.roadCuts.some((c) => {
        const u = (x - c.x) * c.dx + (y - c.y) * c.dy;
        const v = -(x - c.x) * c.dy + (y - c.y) * c.dx;
        return Math.abs(u) < c.half && Math.abs(v) < c.width;
      });
    const pieces: { pts: number[]; kind: number; color: THREE.Color }[] = [];
    for (const r of this.geo.roads) {
      let cur: number[] = [];
      for (let i = 0; i < r.pts.length; i += 2) {
        if (this.roadCuts.length && cut(r.pts[i], r.pts[i + 1])) {
          if (cur.length >= 4) pieces.push({ pts: cur, kind: r.k, color: roadCols[r.k] });
          cur = [];
        } else cur.push(r.pts[i], r.pts[i + 1]);
      }
      if (cur.length >= 4) pieces.push({ pts: cur, kind: r.k, color: roadCols[r.k] });
    }
    // Minor roads first so motorways paint on top at interchanges.
    pieces.sort((a, b) => b.kind - a.kind);
    const roads = buildRibbons(pieces, Y.road);
    const roadMat = ribbonMaterial(
      { vertexColors: true },
      'aKind < 0.5 ? uRoadW.x : aKind < 1.5 ? uRoadW.y : aKind < 2.5 ? uRoadW.z : uRoadW.w',
      /* glsl */ `
      diffuseColor.rgb = vKind < 0.5 ? uLk_motorway : uLk_road;
      float edge = smoothstep(0.72, 1.0, abs(vSide));
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.9, edge);
      // Pixel (SimCity): dashed center lines, only once a road is wide enough on screen to carry them.
      if (abs(uLk_style - 4.0) < 0.5) {
        float halfPx = 1.0 / max(fwidth(vSide), 1e-3);
        float dash = step(abs(vSide), max(0.07, 0.6 / halfPx)) * step(fract(vDist / 9.0), 0.5) * smoothstep(3.0, 6.0, halfPx);
        diffuseColor.rgb = mix(diffuseColor.rgb, vKind < 0.5 ? vec3(0.95, 0.8, 0.25) : vec3(0.92, 0.92, 0.88), dash);
      }
      `,
    );
    roadMat.onBeforeCompile = ((orig) => (sh: THREE.WebGLProgramParametersWithUniforms, r: THREE.WebGLRenderer) => {
      orig(sh, r);
      sh.fragmentShader = sh.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.1, 0.12, 0.22), uNight * 0.9 * uLk_nightK);\ntotalEmissiveRadiance += uLk_roadGlow * uLk_roadGlowK * uNight * (vKind < 0.5 ? 0.62 : vKind < 1.5 ? 0.46 : vKind < 2.5 ? 0.3 : 0.18);',
      );
    })(roadMat.onBeforeCompile);
    roadMat.depthWrite = false;
    const roadMesh = new THREE.Mesh(roads, roadMat);
    roadMesh.receiveShadow = true;
    roadMesh.renderOrder = LAYER.road;
    this.group.add(roadMesh);

    if (this.geo.rail?.length) {
      const rail = buildRibbons(this.geo.rail.map((pts) => ({ pts })), Y.rail);
      const railMat = ribbonMaterial({ color: PALETTE.rail }, 'max(2.0, uMpp * 0.45)', 'diffuseColor.rgb = uLk_rail;');
      railMat.depthWrite = false;
      const m = new THREE.Mesh(rail, railMat);
      m.receiveShadow = true;
      m.renderOrder = LAYER.rail;
      this.group.add(m);
    }

    // Crisp shorelines: keep only outline edges with water on exactly one side. That drops tile and
    // bbox seams and the internal edges between adjacent (unmerged) water features.
    const off = this.grid.cell * 1.6;
    const isWater = (x: number, y: number) => sampleMask(this.grid, this.water, x, y) === 1;
    const lines: number[][] = [];
    for (const poly of this.geo.water) {
      for (const ring of poly) {
        const n = ring.length / 2;
        let cur: number[] = [];
        const flush = () => {
          if (cur.length >= 4) lines.push(cur);
          cur = [];
        };
        for (let i = 0; i < n; i++) {
          const k = (i + 1) % n;
          const x0 = ring[i * 2];
          const y0 = ring[i * 2 + 1];
          const x1 = ring[k * 2];
          const y1 = ring[k * 2 + 1];
          const len = Math.hypot(x1 - x0, y1 - y0) || 1;
          const nx = -(y1 - y0) / len;
          const ny = (x1 - x0) / len;
          const mx = (x0 + x1) / 2;
          const my = (y0 + y1) / 2;
          const shore = isWater(mx + nx * off, my + ny * off) !== isWater(mx - nx * off, my - ny * off);
          if (!shore) {
            flush();
            continue;
          }
          if (!cur.length) cur.push(x0, y0);
          cur.push(x1, y1);
        }
        flush();
      }
    }
    // Opaque (not transparent) so it stays in the ordered flat-layer stack, under roads and tracks.
    const shoreMat = ribbonMaterial({ color: '#e9f9fc' }, 'max(1.5, uMpp * 0.9)', 'if (lkVoxelR()) discard;\ndiffuseColor.rgb = uLk_shore;');
    shoreMat.depthWrite = false;
    const shore = new THREE.Mesh(buildRibbons(lines.map((pts) => ({ pts })), Y.shore), shoreMat);
    shore.renderOrder = LAYER.shore;
    this.group.add(shore);
  }

  private buildTrees() {
    const grid = makeGrid(this.bounds, 3072);
    const green = [...(this.geo.parks ?? []), ...(this.geo.green ?? [])];
    if (!green.length) return;
    const mask = rasterize(grid, green);
    const rand = rng(99);
    const month = new Date().getMonth();
    // Seasonal crowns: spring blossom in Tokyo, autumn tints from October.
    const base = ['#6cc46a', '#58b35f', '#83cf6b', '#4fa35a'];
    const autumn = ['#f2a541', '#e9793f', '#f6cf4a', '#d9583a'];
    const blossom = ['#ffc1d9', '#ffd6e6', '#ffb0cc'];
    const palette = base.slice();
    if (month >= 8 && month <= 10) for (let i = 0; i < (month - 7) * 2; i++) palette.push(autumn[i % autumn.length]);
    if (this.city === 'tokyo' && (month === 2 || month === 3)) palette.push(...blossom, ...blossom);
    const cols = palette.map((c) => new THREE.Color(c));

    // Tree geometry: trunk (brown) + two-blob crown (white; tinted per instance).
    const trunk = new THREE.CylinderGeometry(0.5, 0.7, 4, 5).translate(0, 2, 0);
    const crown = new THREE.IcosahedronGeometry(4.2, 0).translate(0, 7.2, 0);
    const crown2 = new THREE.IcosahedronGeometry(3, 0).translate(1.4, 9.6, 0.6);
    const paint = (g: THREE.BufferGeometry, c: THREE.Color) => {
      const n = g.getAttribute('position').count;
      const a = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
      g.setAttribute('color', new THREE.BufferAttribute(a, 3));
      return g.toNonIndexed();
    };
    const geo = mergeGeos([paint(trunk, new THREE.Color('#8a5a3b')), paint(crown, new THREE.Color(1, 1, 1)), paint(crown2, new THREE.Color(1, 1, 1))]);
    geo.computeVertexNormals();
    // Voxel trees: a square trunk under a stack of two blocks.
    const cube = mergeGeos([
      paint(new THREE.BoxGeometry(1.6, 4, 1.6).translate(0, 2, 0), new THREE.Color('#8a5a3b')),
      paint(new THREE.BoxGeometry(7, 5, 7).translate(0, 6.5, 0), new THREE.Color(1, 1, 1)),
      paint(new THREE.BoxGeometry(4.2, 3, 4.2).translate(0, 10.5, 0), new THREE.Color(1, 1, 1)),
    ]);
    cube.computeVertexNormals();
    this.treeGeos = { blob: geo, cube };
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, groundUniforms, lookUniforms);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>\nuniform float uTime;\n${LOOK_PARS}`)
        .replace(
          '#include <color_vertex>',
          `vColor = vec4(1.0);
          vColor.rgb *= color;
          #ifdef USE_INSTANCING_COLOR
          if (color.r > 0.99) vColor.rgb = instanceColor.rgb;
          #endif
          float tl = dot(vColor.rgb, vec3(0.3, 0.59, 0.11));
          vColor.rgb = mix(vColor.rgb, uLk_tree * (0.7 + 0.6 * tl), uLk_treeK);`,
        )
        .replace(
          '#include <begin_vertex>',
          `vec3 transformed = vec3(position);
          #ifdef USE_INSTANCING
          vec3 ip = instanceMatrix[3].xyz;
          float sway = sin(uTime * 1.2 + ip.x * 0.013 + ip.z * 0.017) * 0.35 * max(0.0, position.y - 3.0) / 8.0;
          transformed.x += sway;
          #endif`,
        );
    };

    // Sample points, chunked into 3 km cells for frustum culling.
    const area = grid.w * grid.h * grid.cell * grid.cell;
    const tries = Math.min(LOW ? 90000 : 260000, Math.round(area / 900));
    const cells = new Map<string, THREE.Matrix4[]>();
    const colorsBy = new Map<string, THREE.Color[]>();
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    for (let t = 0; t < tries; t++) {
      const x = this.bounds.minX + rand() * (this.bounds.maxX - this.bounds.minX);
      const y = this.bounds.minY + rand() * (this.bounds.maxY - this.bounds.minY);
      if (!sampleMask(grid, mask, x, y) || sampleMask(this.grid, this.water, x, y)) continue;
      // Thin out: ~1 tree per 1400 m²; keeps parks leafy without melting the GPU.
      if (rand() > 0.65) continue;
      const key = `${Math.floor(x / 3000)},${Math.floor(y / 3000)}`;
      const s = 1.2 + rand() * 0.9;
      e.set(0, rand() * Math.PI * 2, 0);
      q.setFromEuler(e);
      m4.compose(new THREE.Vector3(x, 0.5, -y), q, new THREE.Vector3(s, s * (0.85 + rand() * 0.35), s));
      if (!cells.has(key)) {
        cells.set(key, []);
        colorsBy.set(key, []);
      }
      cells.get(key)!.push(m4.clone());
      colorsBy.get(key)!.push(cols[Math.floor(rand() * cols.length)]);
    }
    for (const [key, list] of cells) {
      const mesh = new THREE.InstancedMesh(geo, mat, list.length);
      const cl = colorsBy.get(key)!;
      list.forEach((mm, i) => {
        mesh.setMatrixAt(i, mm);
        mesh.setColorAt(i, cl[i]);
      });
      mesh.computeBoundingSphere();
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.trees.push(mesh);
      this.group.add(mesh);
    }
    this.shadowCasters.push(...this.trees);
  }

  /** Tree silhouettes follow the theme (voxel worlds get block trees). */
  setTreeShape(shape: 'blob' | 'cube') {
    if (!this.treeGeos) return;
    for (const t of this.trees) t.geometry = this.treeGeos[shape];
  }

  update(f: FrameInfo) {
    groundUniforms.uTime.value = f.time;
    groundUniforms.uMpp.value = f.mpp;
    groundUniforms.uNight.value = f.night;
    const showTrees = f.mpp < 14;
    for (const t of this.trees) {
      t.visible = showTrees;
      t.castShadow = f.mpp < 5;
    }
    const w = roadUniforms.uRoadW.value;
    w.set(Math.max(11, f.mpp * 1.1), Math.max(7, f.mpp * 0.75), Math.max(5, f.mpp * 0.5), Math.max(3.5, f.mpp * 0.35));
    // Minor roads fade into the land when zoomed far out.
    if (f.mpp > 30) w.set(f.mpp * 0.9, f.mpp * 0.45, f.mpp * 0.2, 0);
  }

  dispose() {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose();
    });
    this.sdfTex.dispose();
    this.greenTex.dispose();
    this.treeGeos?.cube.dispose();
  }
}

export function mergeGeos(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const attrs = Object.keys(list[0].attributes);
  const out = new THREE.BufferGeometry();
  for (const name of attrs) {
    const size = list[0].getAttribute(name).itemSize;
    const total = list.reduce((s, g) => s + g.getAttribute(name).count * size, 0);
    const arr = new Float32Array(total);
    let o = 0;
    for (const g of list) {
      const a = g.getAttribute(name).array as Float32Array;
      arr.set(a, o);
      o += a.length;
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  return out;
}
