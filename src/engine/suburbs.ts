import * as THREE from 'three';
import { LOOK_PARS, lookUniforms, applyToon } from '../themes/look.ts';
import type { CityId, GeoData } from '../../shared/types.ts';
import { groundUniforms } from './island.ts';
import { makeGrid, rasterize, rng, sampleMask, type Grid } from './raster.ts';
import type { FrameInfo, Layer } from './world.ts';
import { LOW } from './quality.ts';
import { trackClearance, VOXEL_SNAP_GLSL, voxelDepthMaterial } from './buildings.ts';

// Outside the detailed building extract, fill the land with procedural toy houses. Density follows
// the real street network (lots of roads = lots of homes), and houses line up with the nearest road.

const ROOFS: Record<CityId, string[]> = {
  nyc: ['#d27a66', '#b07e6c', '#94a2b2', '#c9957a', '#8898a8'],
  sf: ['#e6a07a', '#d98f6a', '#c9b39a', '#b58b7a', '#e3c6a0'],
  london: ['#a8705e', '#8f7a78', '#b98068', '#7f8894', '#a8826f'],
  tokyo: ['#8fa6bf', '#a9b8c8', '#c99a82', '#9db7ae', '#b8aacb', '#d4c2a4'],
  paris: ['#8a96a8', '#7f8b9c', '#9aa5b3', '#b0765f', '#8e99aa'],
  berlin: ['#b0624c', '#9c5a48', '#8b95a3', '#c07a5e', '#a86a55'],
  madrid: ['#c8764f', '#b8643f', '#d08a5c', '#b97a5a', '#a86448'],
  seoul: ['#8fa9c4', '#a7b6c6', '#7fa39a', '#c29a86', '#9fb0c4'],
  hongkong: ['#a9b6c4', '#9fb4c0', '#c2b19c', '#b3a9c6', '#a5bfb2'],
  washington: ['#8a8f99', '#a0705e', '#7d8894', '#b07a62', '#95a0ab'],
  chicago: ['#7f858f', '#946a5c', '#6f7b88', '#a2745f', '#8a8f96'],
  boston: ['#6f7680', '#8c5f52', '#7a8490', '#9c6a58', '#838a93'],
  mexicocity: ['#c8764f', '#b5623e', '#d98e5f', '#c47a5c', '#a95e44'],
  saopaulo: ['#b86e4e', '#a8644a', '#c07e5c', '#8e949c', '#a37058'],
  moscow: ['#6f8a74', '#8a96a4', '#7e8a6a', '#a07a64', '#8a9aaa'],
  stockholm: ['#8c3f32', '#7a8088', '#9c4a38', '#6f7880', '#a35a44'],
  vienna: ['#b0624c', '#8a7a70', '#a86a55', '#7f8894', '#c07a5e'],
  helsinki: ['#6f7a84', '#8a4a3a', '#7d8690', '#5f6a74', '#9a5a46'],
  amsterdam: ['#5a4a44', '#6f5a50', '#7a6a62', '#4f4a4a', '#86705e'],
  oslo: ['#7a3f34', '#6f7880', '#8e4a3a', '#5f6a72', '#9c5a44'],
  cairo: ['#c9b08a', '#b89c78', '#d4bc98', '#a88e6c', '#c4a884'],
  delhi: ['#c07a5a', '#a8866a', '#b8704e', '#9c8a78', '#c9906a'],
  osaka: ['#8fa6bf', '#a9b8c8', '#c99a82', '#9db7ae', '#b8aacb'],
  taipei: ['#9aa6b2', '#b39a86', '#8fa39a', '#a8a0b8', '#c4a88a'],
  singapore: ['#c07a5a', '#9fb4c0', '#b8886a', '#a5bfb2', '#c9a080'],
  sydney: ['#b8643f', '#c87a50', '#8a95a0', '#a8583a', '#c98a62'],
  bangkok: ['#c0503a', '#8a95a0', '#b8604a', '#6f8a8f', '#c9704e'],
  toulouse: ['#b85a3a', '#c4694a', '#a85038', '#cf7a52', '#9a4a34'],
  manchester: ['#5f636a', '#6a5048', '#4f5458', '#7a5a4a', '#6a7078'],
  prague: ['#b0503a', '#c0604a', '#9a4a38', '#7f8894', '#c87050'],
  naples: ['#c06a48', '#b25e40', '#ca7c56', '#a8583c', '#8a8a8a'],
  barcelona: ['#b8664a', '#c07050', '#a85c44', '#8a8a8a', '#c47a5a'],
  lisbon: ['#c06a48', '#b25e40', '#ca7c56', '#a8583c', '#d08a60'],
  istanbul: ['#b8664a', '#a85c44', '#c07050', '#8a8a8a', '#9a6a54'],
  montreal: ['#5f636a', '#7a4a40', '#6a7078', '#8a5a4a', '#4f5458'],
  dubai: ['#c8a878', '#b89868', '#d4b888', '#a88a60', '#c0a478'],
  budapest: ['#a85a44', '#8a7a70', '#b86a50', '#7f8894', '#9c5a48'],
  milan: ['#b8664a', '#a85c44', '#8a8a8a', '#c47a5a', '#9a6a54'],
  rome: ['#c06a48', '#b25e40', '#ca7c56', '#a8583c', '#d08a60'],
  philadelphia: ['#5f636a', '#7a4a40', '#6a7078', '#8a5a4a', '#4f5458'],
  shanghai: ['#8fa2b8', '#a4b0bf', '#9aa89e', '#b8a08e', '#a0a8bc'],
  beijing: ['#7f8a96', '#9a8a7c', '#8a9aa0', '#a88a6c', '#8e96a6'],
  guangzhou: ['#8fa2b8', '#a4b0bf', '#9aa89e', '#b8a08e', '#a0a8bc'],
  shenzhen: ['#8fa2b8', '#a4b0bf', '#9aa89e', '#b8a08e', '#a0a8bc'],
  chengdu: ['#8fa2b8', '#a4b0bf', '#9aa89e', '#b8a08e', '#a0a8bc'],
  hangzhou: ['#8fa2b8', '#a4b0bf', '#9aa89e', '#b8a08e', '#a0a8bc'],
  wuhan: ['#8fa2b8', '#a4b0bf', '#9aa89e', '#b8a08e', '#a0a8bc'],
  chongqing: ['#8fa2b8', '#a4b0bf', '#9aa89e', '#b8a08e', '#a0a8bc'],
};
/** Walls for taller, flat-roofed blocks (apartments, mid-rise). */
const BLOCKS: Record<CityId, string[]> = {
  nyc: ['#c9765c', '#b8674f', '#d99a74', '#e0b48f', '#a85e4a', '#e9d8c0'],
  sf: ['#f4efe6', '#e6eef5', '#f6e7d8', '#ece3f1', '#fff4dc'],
  london: ['#c98a6a', '#b77a5e', '#e2cdb2', '#d6b394', '#efe6d6'],
  tokyo: ['#eeebe4', '#e2e7ed', '#ede6db', '#e6e3ec', '#dfe6e2'],
  paris: ['#efe6d3', '#e9dcc3', '#f3ecdd', '#e5dac6', '#ede3cf'],
  berlin: ['#eee6d8', '#e4dccd', '#dfe5ea', '#ece3d0', '#e7e2ec'],
  madrid: ['#f3e2c7', '#eed5b6', '#f5e9d6', '#e9d9c4', '#f1dcc2'],
  seoul: ['#eef0f3', '#e3e9ef', '#f0ebe3', '#e6e4ee', '#e1ebe6'],
  hongkong: ['#eceff2', '#f1e9de', '#e0eaf0', '#efe5eb', '#e4ede4'],
  washington: ['#e6ddcf', '#d7b49a', '#efe8dc', '#dfe2e6', '#e8d2bc'],
  chicago: ['#c98a6a', '#b8785e', '#e0cdb4', '#d8b89a', '#e9e2d6'],
  boston: ['#bd7a5e', '#a96a52', '#dcc6ae', '#cfa98c', '#e8dfd2'],
  mexicocity: ['#f1d3b0', '#e9b99a', '#f6e6c8', '#dbe7d2', '#f2d0d4'],
  saopaulo: ['#e7e3dc', '#d9dde2', '#ede3d4', '#dcd4c8', '#e9e6e1'],
  moscow: ['#efe2c2', '#e8d4cc', '#e0e8e0', '#f1ece2', '#e4dcea'],
  stockholm: ['#e6c27a', '#cf7c5c', '#efe0b6', '#e4ddcf', '#d9a384'],
  vienna: ['#efe2bc', '#ebe4d6', '#e6dac6', '#f1e6c8', '#e2dcd2'],
  helsinki: ['#ece0b8', '#e6e8e2', '#dfe2e4', '#efe4d2', '#e2d6c6'],
  amsterdam: ['#b27458', '#9c624c', '#d2b49a', '#c69476', '#e0d0bc'],
  oslo: ['#e4c68a', '#c87c60', '#eee0bc', '#e6e0d4', '#d8a886'],
  cairo: ['#e4d0ac', '#d6c09c', '#ecdcc0', '#cfb892', '#e2d6c0'],
  delhi: ['#ecd0b2', '#e2bea0', '#f2e2c8', '#e4d4c2', '#eec6b4'],
  osaka: ['#eeebe4', '#e2e7ed', '#ede6db', '#e6e3ec', '#dfe6e2'],
  taipei: ['#e8e6e0', '#dde2e6', '#e8ded2', '#e0e6de', '#ebe4d8'],
  singapore: ['#f2f0ea', '#e0ece8', '#f0e2d2', '#dee8f0', '#f2e8d4'],
  sydney: ['#ecd8bc', '#e4e2dc', '#e0c4a2', '#dce2e8', '#eee2ce'],
  bangkok: ['#ece4d4', '#e2e4e8', '#f0e0c2', '#d6dee4', '#ede7db'],
  toulouse: ['#e69e78', '#e0937a', '#ecb690', '#d68868', '#eed2b6'],
  manchester: ['#b6624a', '#c2785c', '#985848', '#d6d2ca', '#a66854'],
  prague: ['#eed8b4', '#e6d2ae', '#f0e2c8', '#dcc49e', '#e8e0d2'],
  naples: ['#eec496', '#e8b286', '#f0d4a6', '#e0a676', '#f0d8bc'],
  barcelona: ['#eed8bc', '#e6ccac', '#f0e0c8', '#e0c4a0', '#e8e2d8'],
  lisbon: ['#f2e6d2', '#eed8bc', '#e6d4c2', '#f4dcb0', '#e2e8ec'],
  istanbul: ['#eae0cc', '#e2d4be', '#eee2d0', '#d8c6ac', '#e4e0d8'],
  montreal: ['#c88a6c', '#d2a086', '#e6e0d6', '#b87a62', '#dcc8b2'],
  dubai: ['#ede2ca', '#e6dac2', '#dce6ec', '#f0e6d2', '#e2d2b6'],
  budapest: ['#ecdcb8', '#e6e0d2', '#e2cfaa', '#eee4ce', '#dcd6ca'],
  milan: ['#eed6b2', '#e8d0aa', '#e6e2da', '#f0dfc0', '#dccab0'],
  rome: ['#ecc698', '#e6b888', '#eed4a8', '#e0a878', '#f0dcb8'],
  philadelphia: ['#c88a6c', '#d2a086', '#e6e0d6', '#b87a62', '#dcc8b2'],
  shanghai: ['#eceef1', '#e1e7ec', '#efe9e0', '#e5e3ec', '#dfe9e4'],
  beijing: ['#eceef1', '#e1e7ec', '#efe9e0', '#e5e3ec', '#dfe9e4'],
  guangzhou: ['#eceef1', '#e1e7ec', '#efe9e0', '#e5e3ec', '#dfe9e4'],
  shenzhen: ['#eceef1', '#e1e7ec', '#efe9e0', '#e5e3ec', '#dfe9e4'],
  chengdu: ['#eceef1', '#e1e7ec', '#efe9e0', '#e5e3ec', '#dfe9e4'],
  hangzhou: ['#eceef1', '#e1e7ec', '#efe9e0', '#e5e3ec', '#dfe9e4'],
  wuhan: ['#eceef1', '#e1e7ec', '#efe9e0', '#e5e3ec', '#dfe9e4'],
  chongqing: ['#eceef1', '#e1e7ec', '#efe9e0', '#e5e3ec', '#dfe9e4'],
};
const WALLS: Record<CityId, string[]> = {
  nyc: ['#f3e2c8', '#e9cdb0', '#f6ecd9', '#e3d3c6', '#d9e3ea'],
  sf: ['#fde7ef', '#e3f4ff', '#fff4c9', '#e4f7e1', '#efe3ff', '#fff'],
  london: ['#efe3cf', '#e2c3a8', '#f4eee2', '#dcc1ab', '#e9dccb'],
  tokyo: ['#f6f3ec', '#ebeef2', '#f3ede3', '#e8e6ef', '#f1ece6'],
  paris: ['#f6f0e3', '#f1e7d4', '#faf5ea', '#ede3d0', '#f4ecdc'],
  berlin: ['#f1e9dc', '#e8ddcc', '#eef1f3', '#f4ecdf', '#e9e4ee'],
  madrid: ['#fbe7cc', '#f6dcbf', '#fbf0de', '#f1dcc6', '#f8e3c9'],
  seoul: ['#f6f7f9', '#ebf0f5', '#f5f0e8', '#eceaf3', '#e8f1ec'],
  hongkong: ['#f4f6f8', '#f7f0e6', '#e9f1f6', '#f5ecf1', '#ecf3ec'],
  washington: ['#f2e3cf', '#e7cdb4', '#f6efe3', '#e0d4c8', '#eae6df'],
  chicago: ['#e9cfb4', '#dcbfa4', '#f1e6d6', '#d9c7b8', '#e6ddd2'],
  boston: ['#e8c8ae', '#d9b59a', '#f2e7d8', '#dcc3ae', '#e7dccd'],
  mexicocity: ['#fbe1c4', '#f6c9a8', '#fdf0d6', '#e8f0dc', '#f9dcdf'],
  saopaulo: ['#f3efe8', '#e7eaee', '#f4ebdd', '#ebe3d7', '#f0ede8'],
  moscow: ['#f7eccb', '#f5e0d8', '#e8f0e8', '#f8f4ec', '#ede6f1'],
  stockholm: ['#f2d69a', '#e39a7c', '#f7ebc8', '#efe8dc', '#e8bc9c'],
  vienna: ['#f8edc8', '#f5f0e6', '#efe4d0', '#f8f0da', '#ebe6de'],
  helsinki: ['#f6ebc6', '#f0f2ee', '#e8ecee', '#f7eee0', '#ede2d4'],
  amsterdam: ['#c98f70', '#b37a60', '#e6cfb6', '#d6a888', '#eee0cc'],
  oslo: ['#f2d9a2', '#e0a080', '#f7ecd0', '#efeae0', '#e9c4a4'],
  cairo: ['#f0e0c0', '#e6d2ae', '#f5ead2', '#dcc8a4', '#ebe0cc'],
  delhi: ['#f8e2c8', '#f0d0b4', '#faeedc', '#ede0d0', '#f6d8c8'],
  osaka: ['#f6f3ec', '#ebeef2', '#f3ede3', '#e8e6ef', '#f1ece6'],
  taipei: ['#f2f0ea', '#e8ecef', '#f2e9de', '#eaeee8', '#f5eee4'],
  singapore: ['#fbf9f4', '#ecf6f2', '#faeee0', '#ebf2f8', '#fbf2e2'],
  sydney: ['#f7e8d2', '#f1efea', '#f0d8bc', '#e8eef2', '#f8eedf'],
  bangkok: ['#f6f0e2', '#eef0f2', '#f8ead0', '#e4eaee', '#f6f2ea'],
  toulouse: ['#f0b896', '#eeaa90', '#f6ccaa', '#e8a080', '#f6e0c8'],
  manchester: ['#c87a60', '#d28e72', '#aa6a58', '#e4e0da', '#b87a66'],
  prague: ['#f6e4c4', '#f2dcbc', '#f6ecd8', '#ead2ae', '#f0e8dc'],
  naples: ['#f6d4a8', '#f2c89a', '#f8e0b8', '#ecb88a', '#f8e4cc'],
  barcelona: ['#f6e4cc', '#f2dcc0', '#f6ecdc', '#eed4b4', '#f2ece4'],
  lisbon: ['#f8f0e2', '#f6e4cc', '#f0e2d4', '#f8e8c4', '#eef2f4'],
  istanbul: ['#f4ece0', '#f0e4d4', '#f6eee2', '#eadcc6', '#f0ece6'],
  montreal: ['#d8a084', '#e0b49a', '#f0ece4', '#c8907a', '#e8d8c6'],
  dubai: ['#f6eedc', '#f2e8d6', '#e8f0f4', '#f8f0e0', '#eee2cc'],
  budapest: ['#f6e8c6', '#f2ece0', '#eedcba', '#f6eedc', '#e8e2d8'],
  milan: ['#f6e2c2', '#f2dcba', '#f0ece6', '#f8e8cc', '#e8d8c0'],
  rome: ['#f4d4a8', '#f0c89a', '#f6e0b8', '#ecb88a', '#f8e6c8'],
  philadelphia: ['#d8a084', '#e0b49a', '#f0ece4', '#c8907a', '#e8d8c6'],
  shanghai: ['#f5f6f8', '#ebeff3', '#f5f0e8', '#eceaf2', '#e8f0ec'],
  beijing: ['#f5f6f8', '#ebeff3', '#f5f0e8', '#eceaf2', '#e8f0ec'],
  guangzhou: ['#f5f6f8', '#ebeff3', '#f5f0e8', '#eceaf2', '#e8f0ec'],
  shenzhen: ['#f5f6f8', '#ebeff3', '#f5f0e8', '#eceaf2', '#e8f0ec'],
  chengdu: ['#f5f6f8', '#ebeff3', '#f5f0e8', '#eceaf2', '#e8f0ec'],
  hangzhou: ['#f5f6f8', '#ebeff3', '#f5f0e8', '#eceaf2', '#e8f0ec'],
  wuhan: ['#f5f6f8', '#ebeff3', '#f5f0e8', '#eceaf2', '#e8f0ec'],
  chongqing: ['#f5f6f8', '#ebeff3', '#f5f0e8', '#eceaf2', '#e8f0ec'],
};

interface Raster {
  w: number;
  h: number;
  minX: number;
  maxY: number;
  cell: number;
  cov: Uint8Array;
  hgt: Uint8Array;
  ang: Uint8Array | null;
}

const NEAR_MPP = 2.6;
const TILE = 1200;

export class Suburbs implements Layer {
  readonly group = new THREE.Group();
  private meshes: THREE.InstancedMesh[] = [];
  private far = new THREE.Group();
  private near = new THREE.Group();
  private raster: Raster | null = null;
  private grid!: Grid;
  private blocked!: Uint8Array;
  private core!: Uint8Array;
  private walls: THREE.Color[] = [];
  private roofs: THREE.Color[] = [];
  private tiles = new Map<string, { group: THREE.Group; used: number }>();
  private geoBody = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  private geoRoof: THREE.BufferGeometry;
  private bodyMat = windowMaterial();
  private roofMat = roofMaterial();
  private depthMat = voxelDepthMaterial();
  private roofMeshes: THREE.InstancedMesh[] = [];
  private roofsShown = true;
  private frame = 0;

  private blocks: THREE.Color[] = [];
  private clear: (x: number, y: number, r: number) => boolean = () => false;

  constructor(city: CityId, geo: GeoData, coreBuildings: Int16Array | null, density: ArrayBuffer | null = null, tracks: ArrayLike<number>[] = []) {
    this.clear = trackClearance(tracks, 24);
    const roofShape = new THREE.Shape();
    roofShape.moveTo(-0.55, 0);
    roofShape.lineTo(0.55, 0);
    roofShape.lineTo(0, 0.42);
    roofShape.closePath();
    // Gable with its base at y = 0 and the ridge along x.
    this.geoRoof = new THREE.ExtrudeGeometry(roofShape, { depth: 1.04, bevelEnabled: false }).translate(0, 0, -0.52).rotateY(Math.PI / 2);
    this.group.add(this.far, this.near);
    const b = geo.bounds;
    const grid = makeGrid(b, 1400);
    const blocked = rasterize(grid, [...geo.water, ...(geo.parks ?? []), ...(geo.airports ?? []), ...(geo.green ?? [])]);
    // Road density field: count road length per cell, blurred; plus road direction per cell.
    const W = grid.w;
    const H = grid.h;
    const dens = new Float32Array(W * H);
    const dirX = new Float32Array(W * H);
    const dirY = new Float32Array(W * H);
    for (const r of geo.roads) {
      const w = r.k === 0 ? 0.3 : r.k === 1 ? 0.8 : 1;
      for (let i = 0; i + 3 < r.pts.length; i += 2) {
        const ax = r.pts[i];
        const ay = r.pts[i + 1];
        const bx = r.pts[i + 2];
        const by = r.pts[i + 3];
        const len = Math.hypot(bx - ax, by - ay);
        if (len < 1) continue;
        const steps = Math.ceil(len / grid.cell);
        // Direction doubled-angle so opposite directions reinforce.
        const a = Math.atan2(by - ay, bx - ax) * 2;
        for (let k = 0; k <= steps; k++) {
          const x = ax + ((bx - ax) * k) / steps;
          const y = ay + ((by - ay) * k) / steps;
          const ci = Math.floor((x - grid.minX) / grid.cell);
          const cj = Math.floor((grid.maxY - y) / grid.cell);
          if (ci < 0 || cj < 0 || ci >= W || cj >= H) continue;
          const idx = cj * W + ci;
          dens[idx] += (w * len) / steps;
          dirX[idx] += Math.cos(a) * w;
          dirY[idx] += Math.sin(a) * w;
        }
      }
    }
    const blurred = blur(dens, W, H, 2);
    // Core areas already have real buildings: mark them so we don't double up.
    const core = new Uint8Array(W * H);
    if (coreBuildings) {
      for (let i = 0; i < coreBuildings.length; i += 6) {
        const x = coreBuildings[i] * 2;
        const y = coreBuildings[i + 1] * 2;
        const ci = Math.floor((x - grid.minX) / grid.cell);
        const cj = Math.floor((grid.maxY - y) / grid.cell);
        for (let dj = -1; dj <= 1; dj++)
          for (let di = -1; di <= 1; di++) {
            const ii = ci + di;
            const jj = cj + dj;
            if (ii >= 0 && jj >= 0 && ii < W && jj < H) core[jj * W + ii] = 1;
          }
      }
    }
    const roofs = ROOFS[city].map((c) => new THREE.Color(c));
    const walls = WALLS[city].map((c) => new THREE.Color(c));
    const rand = rng(31337);
    this.grid = grid;
    this.blocked = blocked;
    this.core = core;
    this.walls = walls;
    this.roofs = roofs;
    this.blocks = BLOCKS[city].map((c) => new THREE.Color(c));
    if (density && density.byteLength > 20) {
      this.raster = parseRaster(density);
      this.build(this.generate(rand, null, LOW ? 30000 : 90000), this.far);
      return;
    }
    const cellArea = grid.cell * grid.cell;
    // Two scales: the wide field says "this is town" (even where only arterials are mapped),
    // the local field adds density along busy streets.
    const wide = blur(dens, W, H, 9);
    const want = new Float32Array(W * H);
    let total = 0;
    for (let idx = 0; idx < W * H; idx++) {
      if (blocked[idx] || core[idx]) continue;
      const town = THREE.MathUtils.clamp((wide[idx] / cellArea - 0.0011) * 420, 0, 1);
      const street = THREE.MathUtils.clamp((blurred[idx] / cellArea - 0.004) * 60, 0, 0.5);
      const v = town * (0.75 + street);
      want[idx] = v;
      total += v;
    }
    const MAX = LOW ? 25000 : 80000;
    const k = Math.min(1, MAX / Math.max(1, total));
    const items: Item[] = [];
    for (let j = 0; j < H; j++) {
      for (let i = 0; i < W; i++) {
        const idx = j * W + i;
        const v = want[idx] * k;
        if (v <= 0) continue;
        let n = Math.floor(v) + (rand() < v % 1 ? 1 : 0);
        if (!n) continue;
        // Align with the dominant street direction nearby (sampled a little wider for stability).
        let dx = 0;
        let dy = 0;
        for (let dj = -2; dj <= 2; dj++)
          for (let di = -2; di <= 2; di++) {
            const ii = Math.min(W - 1, Math.max(0, i + di));
            const jj = Math.min(H - 1, Math.max(0, j + dj));
            dx += dirX[jj * W + ii];
            dy += dirY[jj * W + ii];
          }
        const ang = Math.atan2(dy, dx) / 2;
        while (n--) {
          const x = grid.minX + (i + rand()) * grid.cell;
          const y = grid.maxY - (j + rand()) * grid.cell;
          if (sampleMask(grid, blocked, x, y)) continue;
          const big = rand() < 0.12;
          items.push({
            x,
            y,
            w: big ? 16 + rand() * 18 : 8 + rand() * 6,
            d: big ? 12 + rand() * 12 : 7 + rand() * 4,
            h: big ? 10 + rand() * 16 : 6 + rand() * 5,
            a: ang + (rand() < 0.5 ? 0 : Math.PI / 2) + (rand() - 0.5) * 0.08,
            wall: walls[Math.floor(rand() * walls.length)],
            roof: roofs[Math.floor(rand() * roofs.length)],
            flat: big,
          });
        }
      }
    }
    this.build(items, this.far);
  }

  private generate(rand: () => number, box: [number, number, number, number] | null, budget: number) {
    const items = fromDensity(this.raster!, this.grid, this.blocked, this.core, this.walls, this.roofs, rand, box, budget);
    const out: Item[] = [];
    for (const it of items) {
      if (this.clear(it.x, it.y, Math.max(it.w, it.d) / 2)) continue;
      if (it.flat) it.wall = this.blocks[Math.floor(rand() * this.blocks.length)];
      out.push(it);
    }
    return out;
  }

  private build(items: Item[], into: THREE.Group, cellSize = 3000) {
    // A house: box body (wall color) + gabled roof (roof color); flat roofs on taller blocks.
    const body = this.geoBody;
    const roof = this.geoRoof;
    const bodyMat = this.bodyMat;
    const roofMat = this.roofMat;
    const CELL = cellSize;
    const cells = new Map<string, typeof items>();
    for (const it of items) {
      const k = `${Math.floor(it.x / CELL)},${Math.floor(it.y / CELL)}`;
      let l = cells.get(k);
      if (!l) cells.set(k, (l = []));
      l.push(it);
    }
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    for (const list of cells.values()) {
      const pitched = list.filter((it) => !it.flat);
      const b = new THREE.InstancedMesh(body, bodyMat, list.length);
      const r = new THREE.InstancedMesh(roof, roofMat, Math.max(1, pitched.length));
      r.count = pitched.length;
      let ri = 0;
      list.forEach((it, i) => {
        q.setFromAxisAngle(up, it.a);
        m.compose(new THREE.Vector3(it.x, 0.4, -it.y), q, new THREE.Vector3(it.w, it.h, it.d));
        b.setMatrixAt(i, m);
        b.setColorAt(i, it.wall);
        if (!it.flat) {
          m.compose(new THREE.Vector3(it.x, 0.4 + it.h, -it.y), q, new THREE.Vector3(it.w, Math.min(it.w, it.d) * 0.9, it.d));
          r.setMatrixAt(ri, m);
          r.setColorAt(ri, it.roof);
          ri++;
        }
      });
      b.customDepthMaterial = this.depthMat;
      r.visible = this.roofsShown;
      this.roofMeshes.push(r);
      for (const mesh of [b, r]) {
        mesh.computeBoundingSphere();
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.meshes.push(mesh);
        into.add(mesh);
      }
    }
  }

  /** Pitched roofs on or off (the voxel style turns every house into a block). */
  setRoofs(on: boolean) {
    this.roofsShown = on;
    for (const r of this.roofMeshes) r.visible = on;
  }

  update(f: FrameInfo) {
    const show = f.mpp < 16;
    const nearOn = !!this.raster && f.mpp < NEAR_MPP;
    this.far.visible = show && !nearOn;
    this.near.visible = nearOn;
    for (const m of this.meshes) m.castShadow = f.mpp < 5;
    if (!nearOn || ++this.frame % 6) return;
    // Full-density tiles around the focus, nearest first.
    const R = Math.min(f.radius, LOW ? 2600 : 4200);
    const fx = f.focus.x;
    const fy = -f.focus.z;
    const want: [string, number, number, number][] = [];
    for (let tx = Math.floor((fx - R) / TILE); tx <= Math.floor((fx + R) / TILE); tx++)
      for (let ty = Math.floor((fy - R) / TILE); ty <= Math.floor((fy + R) / TILE); ty++) {
        const d = Math.hypot((tx + 0.5) * TILE - fx, (ty + 0.5) * TILE - fy);
        if (d < R + TILE * 0.7) want.push([`${tx},${ty}`, tx, ty, d]);
      }
    want.sort((a, b) => a[3] - b[3]);
    const now = performance.now();
    let built = 0;
    for (const [key, tx, ty] of want.slice(0, LOW ? 12 : 24)) {
      let t = this.tiles.get(key);
      if (!t) {
        if (built++ >= 2) continue; // spread generation over frames
        const g = new THREE.Group();
        const items = this.generate(rng(hash(key)), [tx * TILE, ty * TILE, (tx + 1) * TILE, (ty + 1) * TILE], Infinity);
        this.build(items, g, TILE);
        this.near.add(g);
        t = { group: g, used: now };
        this.tiles.set(key, t);
      }
      t.used = now;
      t.group.visible = true;
    }
    // Hide tiles we no longer want; evict the stalest beyond a cap.
    const wanted = new Set(want.slice(0, LOW ? 12 : 24).map((w) => w[0]));
    for (const [key, t] of this.tiles) if (!wanted.has(key)) t.group.visible = false;
    if (this.tiles.size > (LOW ? 24 : 48)) {
      const old = [...this.tiles.entries()].filter(([k]) => !wanted.has(k)).sort((a, b) => a[1].used - b[1].used);
      for (const [key, t] of old.slice(0, this.tiles.size - (LOW ? 24 : 48))) {
        this.near.remove(t.group);
        t.group.traverse((o) => {
          if ((o as THREE.InstancedMesh).isInstancedMesh) {
            (o as THREE.InstancedMesh).dispose();
            this.meshes.splice(this.meshes.indexOf(o as THREE.InstancedMesh), 1);
            const ri = this.roofMeshes.indexOf(o as THREE.InstancedMesh);
            if (ri >= 0) this.roofMeshes.splice(ri, 1);
          }
        });
        this.tiles.delete(key);
      }
    }
  }

  dispose() {
    for (const m of this.meshes) m.dispose();
    this.geoBody.dispose();
    this.geoRoof.dispose();
    this.bodyMat.dispose();
    this.roofMat.dispose();
  }
}

type Item = { x: number; y: number; w: number; d: number; h: number; a: number; wall: THREE.Color; roof: THREE.Color; flat?: boolean };

/** Place toy buildings from the real building-coverage raster (see scripts/build-geo.ts). */
function parseRaster(buf: ArrayBuffer): Raster {
  const dv = new DataView(buf);
  const w = dv.getInt32(0, true);
  const h = dv.getInt32(4, true);
  return {
    w,
    h,
    minX: dv.getFloat32(8, true),
    maxY: dv.getFloat32(12, true),
    cell: dv.getFloat32(16, true),
    cov: new Uint8Array(buf, 20, w * h),
    hgt: new Uint8Array(buf, 20 + w * h, w * h),
    ang: buf.byteLength >= 20 + 3 * w * h ? new Uint8Array(buf, 20 + 2 * w * h, w * h) : null,
  };
}

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * Toy buildings from the real building-coverage raster (see scripts/build-geo.ts).
 * `box` limits generation to a map-space rectangle; `budget` thins uniformly (and enlarges) to fit.
 */
function fromDensity(
  r: Raster,
  grid: Grid,
  blocked: Uint8Array,
  core: Uint8Array,
  walls: THREE.Color[],
  roofs: THREE.Color[],
  rand: () => number,
  box: [number, number, number, number] | null,
  budget: number,
): Item[] {
  const { w, h, minX, maxY, cell, cov, hgt, ang } = r;
  const inCore = (x: number, y: number) => sampleMask(grid, core, x, y) === 1;
  const i0 = box ? Math.max(0, Math.floor((box[0] - minX) / cell)) : 0;
  const i1 = box ? Math.min(w - 1, Math.floor((box[2] - minX) / cell)) : w - 1;
  const j0 = box ? Math.max(0, Math.floor((maxY - box[3]) / cell)) : 0;
  const j1 = box ? Math.min(h - 1, Math.floor((maxY - box[1]) / cell)) : h - 1;
  // Expected building count per cell: coverage area / typical footprint for that height.
  const want = new Float32Array(w * h);
  let total = 0;
  for (let j = j0; j <= j1; j++)
    for (let i = i0; i <= i1; i++) {
      const k = j * w + i;
      const c = cov[k] / 255;
      if (c < 0.02) continue;
      const x = minX + (i + 0.5) * cell;
      const y = maxY - (j + 0.5) * cell;
      if (inCore(x, y) || sampleMask(grid, blocked, x, y)) continue;
      const bh = Math.max(4, hgt[k]);
      const foot = bh > 20 ? 700 : bh > 12 ? 320 : 110;
      const v = (c * cell * cell) / foot;
      want[k] = v;
      total += v;
    }
  const scale = Math.min(1, budget / Math.max(1, total));
  const out: Item[] = [];
  for (let j = j0; j <= j1; j++)
    for (let i = i0; i <= i1; i++) {
      const k = j * w + i;
      const v = want[k] * scale;
      if (v <= 0) continue;
      let n = Math.floor(v) + (rand() < v % 1 ? 1 : 0);
      if (!n) continue;
      const c = cov[k] / 255;
      const bh = Math.max(4, hgt[k]);
      // When thinned by the budget, grow each building to keep the block's visual mass.
      const grow = Math.sqrt(1 / Math.max(scale, 0.2));
      const side = Math.sqrt((c * cell * cell) / Math.max(1, want[k])) * grow;
      const a = ang ? (ang[k] / 255) * (Math.PI / 2) : 0;
      while (n--) {
        const x = minX + (i + 0.15 + rand() * 0.7) * cell;
        const y = maxY - (j + 0.15 + rand() * 0.7) * cell;
        if (box && (x < box[0] || x >= box[2] || y < box[1] || y >= box[3])) continue;
        if (sampleMask(grid, blocked, x, y)) continue;
        const bw = THREE.MathUtils.clamp(side * (0.8 + rand() * 0.4), 6, cell * 0.9);
        const bd = THREE.MathUtils.clamp(side * (0.7 + rand() * 0.5), 6, cell * 0.9);
        out.push({
          x,
          y,
          w: bw,
          d: bd,
          h: bh * (0.8 + rand() * 0.4) * 0.6,
          a: a + (rand() < 0.5 ? 0 : Math.PI / 2),
          wall: walls[Math.floor(rand() * walls.length)],
          roof: roofs[Math.floor(rand() * roofs.length)],
          flat: bh >= 10,
        });
      }
    }
  return out;
}

function blur(src: Float32Array, W: number, H: number, r: number) {
  const tmp = new Float32Array(W * H);
  const out = new Float32Array(W * H);
  const n = 2 * r + 1;
  for (let j = 0; j < H; j++)
    for (let i = 0; i < W; i++) {
      let s = 0;
      for (let k = -r; k <= r; k++) s += src[j * W + Math.min(W - 1, Math.max(0, i + k))];
      tmp[j * W + i] = s / n;
    }
  for (let j = 0; j < H; j++)
    for (let i = 0; i < W; i++) {
      let s = 0;
      for (let k = -r; k <= r; k++) s += tmp[Math.min(H - 1, Math.max(0, j + k)) * W + i];
      out[j * W + i] = s / n;
    }
  return out;
}

function roofMaterial() {
  const m = new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, lookUniforms);
    applyToon(sh);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${LOOK_PARS}`)
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, uLk_suburbRoof * (0.8 + 0.4 * dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11))), uLk_suburbK);\ndiffuseColor.rgb = mix(vec3(dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11))), diffuseColor.rgb, uLk_bSat);');
  };
  m.customProgramCacheKey = () => 'suburb-roofs';
  return m;
}

function windowMaterial() {
  const m = new THREE.MeshLambertMaterial({ color: '#ffffff' });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uNight = groundUniforms.uNight;
    Object.assign(sh.uniforms, lookUniforms);
    applyToon(sh);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vLitSeed;\nvarying vec3 vLocal;')
      .replace('#include <common>', `#include <common>\n${LOOK_PARS}\n${VOXEL_SNAP_GLSL}`)
      .replace('#include <beginnormal_vertex>', 'mat4 bim = lkSnap(instanceMatrix);\n#define instanceMatrix bim\n#include <beginnormal_vertex>')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLocal = position;\nvLitSeed = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform float uNight;\nvarying float vLitSeed;\nvarying vec3 vLocal;\n${LOOK_PARS}`)
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, uLk_suburbWall * (0.8 + 0.4 * dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11))), uLk_suburbK);\ndiffuseColor.rgb = mix(vec3(dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11))), diffuseColor.rgb, uLk_bSat);')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float side = step(0.3, vLocal.y) * step(vLocal.y, 0.8) * step(0.001, abs(abs(vLocal.x) - 0.5) + abs(abs(vLocal.z) - 0.5) - 0.001);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.5, 0.56, 0.82), uNight * 0.65 * uLk_nightK);
        totalEmissiveRadiance += uLk_bLitCol * uLk_bLitK * uNight * side * step(1.0 - 0.55 * uLk_bLit, vLitSeed) * 0.55;`,
      );
  };
  m.customProgramCacheKey = () => 'suburb-walls';
  return m;
}

export type { Grid };
