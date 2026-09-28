import * as THREE from 'three';
import { moonPosition, skyDir, sunPosition } from './astro.ts';
import { LOW } from './quality.ts';
import type { SkyStyle } from '../themes/themes.ts';

const DEG = Math.PI / 180;

interface Stop {
  at: number; // sun altitude in degrees
  top: string;
  bottom: string;
  sun: string;
  sunI: number;
  hemiSky: string;
  hemiGround: string;
  hemiI: number;
}

// Keyframes by sun altitude: whimsical, never gloomy.
const STOPS: Stop[] = [
  { at: -18, top: '#0b1238', bottom: '#243070', sun: '#b8c8ff', sunI: 0.75, hemiSky: '#aebcff', hemiGround: '#343a66', hemiI: 1.3 },
  { at: -8, top: '#16215e', bottom: '#51408f', sun: '#c4c0ff', sunI: 0.75, hemiSky: '#b4b8ff', hemiGround: '#40396a', hemiI: 1.3 },
  { at: -3, top: '#3b4ea0', bottom: '#f09aa0', sun: '#ff9a7a', sunI: 0.8, hemiSky: '#d6c8f4', hemiGround: '#6b4f6a', hemiI: 1.45 },
  { at: 2, top: '#6fa9e6', bottom: '#ffc49a', sun: '#ffb070', sunI: 1.6, hemiSky: '#cfd8ff', hemiGround: '#8c7466', hemiI: 1.5 },
  { at: 10, top: '#7cc3f2', bottom: '#fde6c4', sun: '#ffe2b8', sunI: 2.4, hemiSky: '#e6f2ff', hemiGround: '#a39478', hemiI: 1.7 },
  { at: 30, top: '#78c6f4', bottom: '#dff4ff', sun: '#fff6e8', sunI: 2.8, hemiSky: '#eef8ff', hemiGround: '#b0a48a', hemiI: 1.8 },
];

function lerpStop(alt: number) {
  let i = 0;
  while (i < STOPS.length - 2 && alt > STOPS[i + 1].at) i++;
  const a = STOPS[i];
  const b = STOPS[i + 1];
  const k = THREE.MathUtils.clamp((alt - a.at) / (b.at - a.at), 0, 1);
  const c = (x: string, y: string) => new THREE.Color(x).lerp(new THREE.Color(y), k);
  return {
    top: c(a.top, b.top),
    bottom: c(a.bottom, b.bottom),
    sun: c(a.sun, b.sun),
    sunI: a.sunI + (b.sunI - a.sunI) * k,
    hemiSky: c(a.hemiSky, b.hemiSky),
    hemiGround: c(a.hemiGround, b.hemiGround),
    hemiI: a.hemiI + (b.hemiI - a.hemiI) * k,
  };
}

export interface AtmosphereState {
  night: number; // 0 day .. 1 full night
  sunAlt: number; // degrees
  moonPhase: number;
  moonLit: number;
  cloudiness: number; // 0..1 from weather
}

/** Drives the key light, hemisphere light and the CSS sky from the real sun position of the city. */
export class Atmosphere {
  readonly key: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  readonly state: AtmosphereState = { night: 0, sunAlt: 45, moonPhase: 0, moonLit: 1, cloudiness: 0 };
  lat = 40;
  lon = -74;
  /** Optional override for testing: hours offset added to the real clock. */
  timeWarp = 0;
  /** Force a look regardless of the real sun. */
  forced: null | 'day' | 'night' = null;
  /** A theme's own sky and lights (replaces the real sky's colors; the sun still sets the light's direction). */
  style: SkyStyle | null = null;
  /** The current backdrop gradient, as sRGB components (for themes that paint their own sky). */
  readonly skyTop = new THREE.Color();
  readonly skyBottom = new THREE.Color();
  /** Camera azimuth (radians), so the sun and moon sit in the right part of the backdrop. */
  cameraAzimuth = 0;
  private sunEl = document.getElementById('sun');
  private moonEl = document.getElementById('moon') as SVGSVGElement | null;
  private moonLit = document.getElementById('moon-lit');
  private blendAlt: number | null = null;
  private skyEl: HTMLElement;
  private starsEl: HTMLCanvasElement;
  private lastCss = '';

  constructor(scene: THREE.Scene) {
    this.key = new THREE.DirectionalLight(0xffffff, 2.5);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(LOW ? 2048 : 4096, LOW ? 2048 : 4096);
    this.key.shadow.bias = -0.0004;
    this.key.shadow.normalBias = 0.6;
    this.key.shadow.radius = 3;
    scene.add(this.key, this.key.target);
    this.hemi = new THREE.HemisphereLight(0xeef8ff, 0xb0a48a, 1.8);
    scene.add(this.hemi);
    this.skyEl = document.getElementById('sky')!;
    this.starsEl = document.getElementById('stars') as HTMLCanvasElement;
    this.drawStars();
    addEventListener('resize', () => this.drawStars());
  }

  now() {
    return Date.now() + this.timeWarp * 3600_000;
  }

  update(focus: THREE.Vector3, footprintRadius: number) {
    const t = this.now();
    const sun = sunPosition(t, this.lat, this.lon);
    const moon = moonPosition(t, this.lat, this.lon);
    let target = sun.alt / DEG;
    if (this.forced === 'night') target = -24;
    if (this.forced === 'day') target = 38;
    // Ease between looks when switching modes or cities.
    this.blendAlt = this.blendAlt === null ? target : this.blendAlt + (target - this.blendAlt) * 0.06;
    const sunAlt = this.blendAlt;
    if (this.forced) {
      sun.alt = Math.max(sunAlt, 20) * DEG;
      if (this.forced === 'day') sun.az = 200 * DEG;
    }
    const p = lerpStop(sunAlt);
    const st = this.style;
    if (st) {
      p.top.set(st.top);
      p.bottom.set(st.bottom);
      p.sun.set(st.sun);
      p.sunI = st.sunI;
      p.hemiSky.set(st.hemiSky);
      p.hemiGround.set(st.hemiGround);
      p.hemiI = st.hemiI;
    }
    const cloud = st ? 0 : this.state.cloudiness;
    const night = 1 - THREE.MathUtils.smoothstep(sunAlt, -6.5, 1.5);
    this.state.night = night;
    this.state.sunAlt = sunAlt;
    this.state.moonPhase = moon.phase;
    this.state.moonLit = moon.lit;

    // Key light: the sun by day, the moon (or a soft high "moonlight") by night.
    let dir: [number, number, number];
    if (sunAlt > -4) {
      const s = { ...sun, alt: Math.max(sun.alt, 9 * DEG) };
      dir = skyDir(s);
    } else if (moon.alt > 0.1) {
      dir = skyDir({ ...moon, alt: Math.max(moon.alt, 25 * DEG) });
    } else {
      dir = skyDir({ alt: 50 * DEG, az: 200 * DEG });
    }
    const gray = new THREE.Color('#c9d3e6');
    this.key.color.copy(p.sun).lerp(gray, cloud * 0.5);
    this.key.intensity = p.sunI * (1 - cloud * 0.45);
    this.hemi.color.copy(p.hemiSky);
    this.hemi.groundColor.copy(p.hemiGround);
    this.hemi.intensity = p.hemiI * (1 + cloud * 0.12);

    const d = footprintRadius * 2.2 + 3000;
    this.key.position.set(focus.x + dir[0] * d, dir[1] * d, focus.z + dir[2] * d);
    this.key.target.position.copy(focus);
    const cam = this.key.shadow.camera;
    const r = footprintRadius * 1.08;
    cam.left = -r;
    cam.right = r;
    cam.top = r;
    cam.bottom = -r;
    cam.near = 1;
    cam.far = d * 2.2;
    cam.updateProjectionMatrix();

    this.key.castShadow = st ? st.shadows : true;
    this.placeDiscs(sun.alt, sun.az, moon.alt, moon.az, moon.phase, night, cloud, !st);
    const top = p.top.clone().lerp(new THREE.Color('#9aa6b8'), cloud * 0.45 * (1 - night));
    const bottom = p.bottom.clone().lerp(new THREE.Color('#d7dde6'), cloud * 0.45 * (1 - night));
    this.skyTop.copy(top).convertLinearToSRGB();
    this.skyBottom.copy(bottom).convertLinearToSRGB();
    const css = `linear-gradient(180deg, ${top.getStyle()} 0%, ${bottom.getStyle()} 100%)`;
    if (css !== this.lastCss) {
      this.skyEl.style.background = css;
      this.lastCss = css;
      this.starsEl.style.opacity = st ? (st.stars ? '0.55' : '0') : String(Math.max(0, night - 0.25) * 1.3 * (1 - cloud * 0.7));
      document.documentElement.style.setProperty('--night', night.toFixed(3));
    }
  }

  /** Sun glow and a phase-accurate moon in the backdrop, placed by bearing relative to the camera. */
  private placeDiscs(sunAlt: number, sunAz: number, moonAlt: number, moonAz: number, phase: number, night: number, cloud: number, discs: boolean) {
    // The camera looks toward azimuth (cameraAzimuth + PI) in compass terms: camera az 0 looks north.
    const lookAz = -this.cameraAzimuth;
    const place = (el: HTMLElement | SVGSVGElement, alt: number, az: number, show: boolean) => {
      const rel = Math.atan2(Math.sin(az - lookAz), Math.cos(az - lookAz));
      const visible = show && alt > -0.05 && Math.abs(rel) < 1.4;
      el.style.opacity = visible ? String(1 - cloud * 0.6) : '0';
      if (!visible) return;
      const x = 50 + (rel / 1.4) * 46;
      const y = 6 + (1 - Math.min(alt, 1.2) / 1.2) * 22;
      el.style.left = `${x.toFixed(2)}%`;
      el.style.top = `${y.toFixed(2)}%`;
    };
    if (this.sunEl) place(this.sunEl, sunAlt, sunAz, discs && night < 0.6);
    if (this.moonEl && this.moonLit) {
      place(this.moonEl, moonAlt, moonAz, discs && night > 0.3);
      // Terminator: an ellipse whose width follows the phase (0 new, 0.5 full).
      const k = Math.cos(phase * 2 * Math.PI); // 1 new .. -1 full .. 1 new
      const waxing = phase < 0.5;
      const rx = Math.abs(k);
      const sweepOuter = waxing ? 1 : 0;
      const sweepInner = k > 0 === waxing ? 0 : 1;
      this.moonLit.setAttribute('d', `M0,-1 A1,1 0 0 ${sweepOuter} 0,1 A${rx.toFixed(3)},1 0 0 ${sweepInner} 0,-1 Z`);
    }
  }

  private drawStars() {
    const c = this.starsEl;
    const dpr = Math.min(devicePixelRatio, 2);
    c.width = innerWidth * dpr;
    c.height = innerHeight * dpr;
    const g = c.getContext('2d')!;
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 420; i++) {
      const x = rnd() * c.width;
      const y = rnd() * c.height;
      const r = (rnd() ** 3 * 1.6 + 0.35) * dpr;
      g.globalAlpha = 0.35 + rnd() * 0.65;
      g.fillStyle = rnd() > 0.85 ? '#ffe9b0' : '#ffffff';
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
      if (r > 1.5 * dpr) {
        g.globalAlpha *= 0.5;
        g.fillRect(x - r * 3, y - 0.35 * dpr, r * 6, 0.7 * dpr);
        g.fillRect(x - 0.35 * dpr, y - r * 3, 0.7 * dpr, r * 6);
      }
    }
  }
}
