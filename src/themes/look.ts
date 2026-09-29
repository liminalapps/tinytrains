import * as THREE from 'three';

// The look: every material in the scene reads its palette and treatment from these shared uniforms, so an
// theme is a set of values (plus a few style branches), not a filter over the finished image. Defaults
// are the Toy look.

const c = (hex: string) => new THREE.Color(hex);

/** Style ids used by shader branches. */
export const STYLE = { toy: 0, clay: 1, blueprint: 2, neon: 3, pixel: 4, voxel: 5, subway: 6, monet: 7, cubism: 8, noir: 9, circuit: 10, cel: 11 } as const;

export interface LookConfig {
  style: number;
  // Ground
  land: string;
  land2: string;
  park: string;
  green: string;
  sand: string;
  airport: string;
  runway: string;
  waterDeep: string;
  waterShallow: string;
  foam: string;
  road: string;
  motorway: string;
  rail: string;
  shore: string;
  /** 0 = flat fills; 1 = the full toy texture (land mottling, caustics, ripples, glints). */
  detail: number;
  /** How much the ground follows the real time of day (toy 1; styles with their own palette 0). */
  nightK: number;
  /** Street lights at night: color and strength. */
  roadGlow: string;
  roadGlowK: number;
  /** A ruled grid on the land: color, alpha, spacing in CSS pixels at the current zoom. */
  grid: string;
  gridK: number;
  /** Coastlines traced with light (neon). */
  coastGlow: string;
  coastGlowK: number;
  /** Voxel size in meters (0 = off). */
  voxel: number;
  /** Painterly brushstrokes on the ground and water (Monet): strokes stay ~14 px wide at every zoom. */
  brushK: number;
  /** Cubist facets on the ground and water: angular planes ~70 px across with a hairline edge. */
  facetK: number;
  facetEdge: string;
  // Buildings
  bTint: string;
  bTintK: number;
  bRoof: string;
  bRoofK: number;
  /** Day windows (0..1), and the chance / color / strength of lit windows after dark. */
  bWin: number;
  bLit: number;
  bLitCol: string;
  bLitK: number;
  /** Silhouette edges drawn in the building shader: color, strength, width in pixels. */
  bEdge: string;
  bEdgeK: number;
  bEdgePx: number;
  /** Saturation of buildings and houses (1 = as painted; voxel pushes it up). */
  bSat: number;
  /** Repaint buildings in a bold cartoon palette (cel). */
  bPop: number;
  // Everything else
  suburbWall: string;
  suburbRoof: string;
  suburbK: number;
  tree: string;
  treeK: number;
  landmark: string;
  landmarkK: number;
  slab: string;
  slabK: number;
  /** Lines: lift toward white (pencil), glow regardless of time, keep ballast detail up close. */
  lineWhite: number;
  lineGlow: number;
  lineDetail: number;
  /** Line color saturation (1 = true color; noir drains it so only the trains carry color). */
  lineSat: number;
  /** A casing along both edges of every line (the white gaps between parallel routes on a transit diagram). */
  lineCase: string;
  lineCaseK: number;
  /** Cel shading: lighting snaps to flat bands (lit, shade, shadow) on every lit surface. */
  toon: number;
  /** Trains glow (neon). */
  trainGlow: number;
}

export const TOY_LOOK: LookConfig = {
  style: STYLE.toy,
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
  shore: '#e9f9fc',
  detail: 1,
  nightK: 1,
  roadGlow: '#ff9a3d',
  roadGlowK: 1,
  grid: '#ffffff',
  gridK: 0,
  coastGlow: '#ff2fb3',
  coastGlowK: 0,
  voxel: 0,
  brushK: 0,
  facetK: 0,
  facetEdge: '#3a2f25',
  bTint: '#ffffff',
  bTintK: 0,
  bRoof: '#ffffff',
  bRoofK: 0,
  bWin: 1,
  bLit: 1,
  bLitCol: '#ffcc7a',
  bLitK: 1,
  bEdge: '#000000',
  bEdgeK: 0,
  bEdgePx: 1,
  bSat: 1,
  bPop: 0,
  suburbWall: '#ffffff',
  suburbRoof: '#ffffff',
  suburbK: 0,
  tree: '#ffffff',
  treeK: 0,
  landmark: '#ffffff',
  landmarkK: 0,
  slab: '#ffffff',
  slabK: 0,
  lineWhite: 0,
  lineGlow: 0,
  lineDetail: 1,
  lineSat: 1,
  lineCase: '#ffffff',
  lineCaseK: 0,
  toon: 0,
  trainGlow: 0,
};

type Uniforms = Record<string, { value: number | THREE.Color }>;

/** Uniform name for each config key (colors become THREE.Color in linear space). */
const U = (k: keyof LookConfig) => `uLk_${k}`;

export const lookUniforms: Uniforms = Object.fromEntries(
  (Object.keys(TOY_LOOK) as (keyof LookConfig)[]).map((k) => [U(k), { value: typeof TOY_LOOK[k] === 'string' ? c(TOY_LOOK[k] as string) : (TOY_LOOK[k] as number) }]),
);

/** GLSL declarations for every look uniform. */
export const LOOK_PARS = (Object.keys(TOY_LOOK) as (keyof LookConfig)[])
  .map((k) => `uniform ${typeof TOY_LOOK[k] === 'string' ? 'vec3' : 'float'} ${U(k)};`)
  .join('\n');

let current: LookConfig = TOY_LOOK;
let target: LookConfig = TOY_LOOK;

/** Switch looks. Colors and amounts ease over ~0.6 s (see tickLook); the style id switches at once. */
export function setLook(cfg: Partial<LookConfig>, instant = false) {
  target = { ...TOY_LOOK, ...cfg };
  lookUniforms[U('style')].value = target.style;
  if (instant) {
    current = target;
    for (const k of Object.keys(target) as (keyof LookConfig)[]) {
      const u = lookUniforms[U(k)];
      if (u.value instanceof THREE.Color) u.value.set(target[k] as string);
      else u.value = target[k] as number;
    }
  }
}

export const activeLook = () => target;

const tmp = new THREE.Color();
/** Ease the uniforms toward the target look; call once per frame. */
export function tickLook(dt: number) {
  if (current === target) return;
  const k = 1 - Math.exp(-dt * 7);
  let settled = true;
  for (const key of Object.keys(target) as (keyof LookConfig)[]) {
    if (key === 'style') continue;
    const u = lookUniforms[U(key)];
    if (u.value instanceof THREE.Color) {
      tmp.set(target[key] as string);
      u.value.lerp(tmp, k);
      if (Math.abs(u.value.r - tmp.r) + Math.abs(u.value.g - tmp.g) + Math.abs(u.value.b - tmp.b) > 0.002) settled = false;
      else u.value.copy(tmp);
    } else {
      const t = target[key] as number;
      const v = u.value + (t - u.value) * k;
      u.value = Math.abs(v - t) < 0.002 ? t : v;
      if (u.value !== t) settled = false;
    }
  }
  if (settled) current = target;
}

/**
 * Cel shading for lit materials: the lit color's brightness relative to the flat color picks one of three flat
 * bands (sun, shade, shadow), so cast shadows and shaded faces become hard-edged areas of flat color. Hook it in
 * with applyToon(shader) from onBeforeCompile (the shader must declare LOOK_PARS).
 */
export const TOON_GLSL = /* glsl */ `#include <opaque_fragment>
if (uLk_toon > 0.001) {
  float tBase = max(dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11)), 1e-3);
  float tLit = dot(outgoingLight - totalEmissiveRadiance, vec3(0.3, 0.59, 0.11)) / tBase;
  float tBand = tLit > 0.95 ? 1.08 : tLit > 0.58 ? 0.8 : 0.56;
  gl_FragColor.rgb = mix(gl_FragColor.rgb, diffuseColor.rgb * tBand + totalEmissiveRadiance, uLk_toon);
}`;
export function applyToon(sh: { fragmentShader: string }) {
  sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', TOON_GLSL);
}
