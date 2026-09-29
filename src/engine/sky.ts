import * as THREE from 'three';
import { rng } from './raster.ts';
import type { FrameInfo, Layer, World } from './world.ts';

export interface Weather {
  code: number; // WMO weather code
  cloud: number; // 0..100 %
  wind: number; // km/h
  windDir: number; // degrees (from)
  temp: number; // °C
  precip: number; // mm
  isDay: boolean;
}

export type WeatherKind = 'clear' | 'cloudy' | 'fog' | 'drizzle' | 'rain' | 'snow' | 'storm';

export function weatherKind(code: number): WeatherKind {
  if (code >= 95) return 'storm';
  if (code >= 71 && code <= 77) return 'snow';
  if (code >= 85 && code <= 86) return 'snow';
  if (code >= 61 && code <= 67) return 'rain';
  if (code >= 80 && code <= 82) return 'rain';
  if (code >= 51 && code <= 57) return 'drizzle';
  if (code === 45 || code === 48) return 'fog';
  if (code >= 2) return 'cloudy';
  return 'clear';
}

function puffGeometry(seed: number) {
  // A cumulus: overlapping smooth blobs with a flattened base, lighter on top.
  const r = rng(seed);
  const pos: number[] = [];
  const col: number[] = [];
  const n = 7 + Math.floor(r() * 5);
  const top = new THREE.Color('#ffffff');
  const base = new THREE.Color('#dfe7f2');
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1) - 0.5;
    const s = (0.55 + r() * 0.5) * (1 - Math.abs(t) * 0.7);
    const g = new THREE.IcosahedronGeometry(s, 2).toNonIndexed();
    const x = t * 2.6 + (r() - 0.5) * 0.3;
    const y = s * 0.35 + r() * 0.15;
    const z = (r() - 0.5) * 0.8;
    const p = g.getAttribute('position');
    for (let k = 0; k < p.count; k++) {
      let py = p.getY(k);
      if (py < -s * 0.25) py = -s * 0.25 - (py + s * 0.25) * 0.15; // flat-ish bottom
      const wy = y + py * 0.8;
      pos.push(x + p.getX(k), wy, z + p.getZ(k));
      const c = base.clone().lerp(top, THREE.MathUtils.clamp((wy + 0.1) / 1.0, 0, 1));
      col.push(c.r, c.g, c.b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

const NIGHT_CLOUD = new THREE.Color('#4a5484');

/** Drifting cumulus over and below the island. */
export class Clouds implements Layer {
  readonly group = new THREE.Group();
  private above: THREE.InstancedMesh[] = [];
  private items: { mesh: THREE.InstancedMesh; i: number; x: number; z: number; y: number; s: number }[] = [];
  private mat: THREE.MeshLambertMaterial;
  private below: THREE.InstancedMesh;
  private bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  private windX = 1;
  private windZ = 0;
  private speed = 6;
  private m4 = new THREE.Matrix4();
  private dayColor = new THREE.Color('#ffffff');
  private belowMat!: THREE.MeshLambertMaterial;

  constructor(bounds: { minX: number; maxX: number; minY: number; maxY: number }, slabDepth: number) {
    this.bounds = { minX: bounds.minX, maxX: bounds.maxX, minZ: -bounds.maxY, maxZ: -bounds.minY };
    this.mat = new THREE.MeshLambertMaterial({ color: '#ffffff', vertexColors: true, emissive: '#dfe9ff', emissiveIntensity: 0.3, transparent: true, opacity: 0.96, depthWrite: false });
    const geos = [puffGeometry(1), puffGeometry(2), puffGeometry(3)];
    const W = bounds.maxX - bounds.minX;
    const H = bounds.maxY - bounds.minY;
    const r = rng(77);
    const perGeo = 22;
    for (const g of geos) {
      const mesh = new THREE.InstancedMesh(g, this.mat, perGeo);
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      this.above.push(mesh);
      this.group.add(mesh);
      for (let i = 0; i < perGeo; i++) {
        this.items.push({
          mesh,
          i,
          x: bounds.minX - W * 0.2 + r() * W * 1.4,
          z: -(bounds.minY - H * 0.2 + r() * H * 1.4),
          y: 1500 + r() * 1400,
          s: Math.max(W, H) * (0.014 + r() * 0.024),
        });
      }
    }
    // A sea of clouds under the floating island.
    const belowMat = new THREE.MeshLambertMaterial({ color: '#ffffff', vertexColors: true, emissive: '#e8f0ff', emissiveIntensity: 0.4 });
    this.belowMat = belowMat;
    this.below = new THREE.InstancedMesh(geos[0], belowMat, 60);
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cz = -(bounds.minY + bounds.maxY) / 2;
    for (let i = 0; i < 60; i++) {
      // A ring of cloud banks around (and well below) the island, never in front of it.
      const a = (i / 60) * Math.PI * 2 + r() * 0.1;
      const rad = 0.62 + r() * 0.35;
      const s = 2600 + r() * 3600;
      this.m4.compose(
        new THREE.Vector3(cx + Math.cos(a) * W * rad, -slabDepth * (4 + r() * 3), cz + Math.sin(a) * H * rad),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * 6),
        new THREE.Vector3(s, s * 0.6, s),
      );
      this.below.setMatrixAt(i, this.m4);
    }
    this.below.frustumCulled = false;
    this.group.add(this.below);
  }

  setWeather(w: Weather | null) {
    const cover = w ? w.cloud / 100 : 0.3;
    const kind = w ? weatherKind(w.code) : 'clear';
    const dark = kind === 'rain' || kind === 'storm' ? 0.5 : kind === 'drizzle' ? 0.3 : 0;
    this.dayColor.set('#ffffff').lerp(new THREE.Color('#9aa3b3'), dark);
    const wanted = Math.round(4 + cover * (this.items.length - 4));
    this.items.forEach((it, k) => (it.s = Math.abs(it.s) * (k < wanted ? 1 : -1)));
    if (w) {
      const a = ((w.windDir + 180) * Math.PI) / 180; // blowing toward
      this.windX = Math.sin(a);
      this.windZ = -Math.cos(a);
      this.speed = 4 + w.wind * 1.2;
    }
  }

  /** Themes without clouds hide the whole layer (the sea below the island too). */
  setShown(on: boolean) {
    this.group.visible = on;
  }

  update(f: FrameInfo) {
    if (!this.group.visible) {
      for (const m of this.above) m.castShadow = false;
      return;
    }
    const b = this.bounds;
    const W = b.maxX - b.minX;
    const H = b.maxZ - b.minZ;
    // Fade clouds out when zoomed in so they don't smother the city; shadows stay.
    const vis = THREE.MathUtils.smoothstep(f.mpp, 9, 22);
    this.mat.opacity = 0.97 * vis;
    // Fully faded in they're all but opaque: write depth so screen passes (cel's ink) see them over the city.
    this.mat.depthWrite = vis > 0.95;
    // Moonlit slate at night, bright white by day.
    this.mat.emissiveIntensity = 0.3 * (1 - f.night);
    this.mat.color.copy(this.dayColor).lerp(NIGHT_CLOUD, f.night * 0.75);
    this.belowMat.emissiveIntensity = 0.4 * (1 - f.night) + 0.05;
    this.belowMat.color.set('#ffffff').lerp(NIGHT_CLOUD, f.night * 0.7);
    for (const m of this.above) {
      m.castShadow = vis > 0.05;
      m.visible = vis > 0.01;
    }
    for (const it of this.items) {
      it.x += this.windX * this.speed * f.dt * 8;
      it.z += this.windZ * this.speed * f.dt * 8;
      if (it.x > b.maxX + W * 0.25) it.x -= W * 1.5;
      if (it.x < b.minX - W * 0.25) it.x += W * 1.5;
      if (it.z > b.maxZ + H * 0.25) it.z -= H * 1.5;
      if (it.z < b.minZ - H * 0.25) it.z += H * 1.5;
      const s = it.s > 0 ? it.s : 0.0001;
      this.m4.makeScale(s, s, s).setPosition(it.x, it.y, it.z);
      it.mesh.setMatrixAt(it.i, this.m4);
    }
    for (const m of this.above) m.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.group.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
  }
}

/** Rain / snow particles that follow the camera. */
export class Precipitation implements Layer {
  readonly object: THREE.LineSegments | THREE.Points;
  private kind: 'rain' | 'snow' | 'none' = 'none';
  private rain: THREE.LineSegments;
  private snow: THREE.Points;
  private seeds: Float32Array;
  private N = 5000;
  readonly group = new THREE.Group();
  private intensity = 0;

  constructor(private world: World) {
    const r = rng(5);
    this.seeds = new Float32Array(this.N * 3);
    for (let i = 0; i < this.seeds.length; i++) this.seeds[i] = r();
    const rp = new Float32Array(this.N * 6);
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(rp, 3).setUsage(THREE.DynamicDrawUsage));
    this.rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: '#cfe3ff', transparent: true, opacity: 0.55, depthWrite: false }));
    const sp = new Float32Array(this.N * 3);
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3).setUsage(THREE.DynamicDrawUsage));
    this.snow = new THREE.Points(sg, new THREE.PointsMaterial({ color: '#ffffff', size: 3, sizeAttenuation: false, transparent: true, opacity: 0.9, depthWrite: false }));
    this.rain.frustumCulled = false;
    this.snow.frustumCulled = false;
    this.rain.visible = false;
    this.snow.visible = false;
    this.object = this.rain;
    this.group.add(this.rain, this.snow);
  }

  set(kind: WeatherKind) {
    this.kind = kind === 'rain' || kind === 'storm' || kind === 'drizzle' ? 'rain' : kind === 'snow' ? 'snow' : 'none';
    this.intensity = kind === 'drizzle' ? 0.35 : kind === 'storm' ? 1 : 0.75;
    this.rain.visible = this.kind === 'rain';
    this.snow.visible = this.kind === 'snow';
  }

  update(f: FrameInfo) {
    if (this.kind === 'none') return;
    const R = Math.min(f.radius * 1.2, 30000);
    const top = Math.min(R * 0.8, 2500);
    const n = Math.floor(this.N * this.intensity);
    const t = f.time;
    const cx = f.focus.x;
    const cz = f.focus.z;
    if (this.kind === 'rain') {
      const a = this.rain.geometry.getAttribute('position') as THREE.BufferAttribute;
      const p = a.array as Float32Array;
      const len = Math.max(6, f.mpp * 14);
      for (let i = 0; i < n; i++) {
        const sx = this.seeds[i * 3];
        const sz = this.seeds[i * 3 + 1];
        const sy = this.seeds[i * 3 + 2];
        const x = cx + (sx - 0.5) * 2 * R;
        const z = cz + (sz - 0.5) * 2 * R;
        const y = top * (1 - ((sy + t * (0.9 + sx * 0.3) * (1400 / top)) % 1));
        p.set([x, y, z, x + len * 0.15, y + len, z], i * 6);
      }
      this.rain.geometry.setDrawRange(0, n * 2);
      a.needsUpdate = true;
    } else {
      const a = this.snow.geometry.getAttribute('position') as THREE.BufferAttribute;
      const p = a.array as Float32Array;
      for (let i = 0; i < n; i++) {
        const sx = this.seeds[i * 3];
        const sz = this.seeds[i * 3 + 1];
        const sy = this.seeds[i * 3 + 2];
        const x = cx + (sx - 0.5) * 2 * R + Math.sin(t * 0.8 + sy * 20) * f.mpp * 6;
        const z = cz + (sz - 0.5) * 2 * R;
        const y = top * (1 - ((sy + t * 0.06 * (250 / Math.max(top, 250)) * 4) % 1));
        p.set([x, y, z], i * 3);
      }
      this.snow.geometry.setDrawRange(0, n);
      a.needsUpdate = true;
    }
    void this.world;
  }
}
