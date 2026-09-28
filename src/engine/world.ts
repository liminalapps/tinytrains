import * as THREE from 'three';
import { CameraRig } from './rig.ts';
import { Atmosphere } from './atmosphere.ts';
import { LOW } from './quality.ts';
import { Post } from '../themes/post.ts';
import { tickLook } from '../themes/look.ts';
import type { Theme } from '../themes/themes.ts';

export interface FrameInfo {
  dt: number;
  time: number; // seconds since start
  now: number; // corrected epoch ms (server clock + time warp)
  mpp: number; // meters per CSS pixel
  focus: THREE.Vector3;
  radius: number; // rough radius of the visible ground footprint
  night: number; // 0 day .. 1 night
}

export interface Layer {
  update?(f: FrameInfo): void;
}

/** Renderer + scene + camera rig + frame loop. */
export class World {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly rig: CameraRig;
  readonly atmosphere: Atmosphere;
  readonly layers = new Set<Layer>();
  /** ms to add to Date.now() to get the server's clock. */
  clockOffset = 0;
  private last = performance.now();
  private start = performance.now();
  private el: HTMLElement;
  fps = 60;
  /** Adaptive resolution: steps down when frames get slow, back up when there's headroom. */
  private dprSteps = [2, 1.5, 1.25, 1];
  private dprIdx = 0;
  private slowFor = 0;
  private fastFor = 0;
  private maxDpr = Math.min(devicePixelRatio, LOW ? 1.5 : 2);
  /** What the renderer was last sized to; checked every frame so a missed resize event can't strand it. */
  private sized = { w: 0, h: 0, dpr: 0 };
  private failed = new Set<Layer>();
  /** The active theme's post-processing (null: draw straight to the screen). */
  private post: Post | null = null;
  private lastInfo: FrameInfo | null = null;
  /** Set if the GPU ever handed back a smaller drawing buffer than asked for. */
  private bufferCap = Infinity;

  constructor(el: HTMLElement) {
    this.el = el;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, stencil: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(this.maxDpr);
    this.dprIdx = this.dprSteps.findIndex((d) => d <= this.maxDpr);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.NoToneMapping;
    el.appendChild(this.renderer.domElement);
    this.rig = new CameraRig(this.renderer.domElement);
    this.atmosphere = new Atmosphere(this.scene);
    addEventListener('resize', () => this.resize());
    const canvas = this.renderer.domElement;
    canvas.addEventListener('webglcontextlost', () => console.warn('[world] WebGL context lost'));
    canvas.addEventListener('webglcontextrestored', () => {
      console.warn('[world] WebGL context restored');
      this.resize();
    });
    this.resize();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  now() {
    return Date.now() + this.clockOffset + this.atmosphere.timeWarp * 3600_000;
  }

  /** Switch post-processing for a theme (instant; nothing in the scene is rebuilt). */
  setPost(kind: Theme['post']) {
    if (this.post?.kind === kind) return;
    this.post?.dispose();
    this.post = kind ? new Post(this.renderer, kind) : null;
    this.resize();
  }

  /** Draw one frame of the scene (through the theme's post-processing, if any). */
  draw() {
    const cam = this.rig.camera;
    if (!this.post) return this.renderer.render(this.scene, cam);
    const f = this.lastInfo;
    this.post.render(this.scene, cam, {
      time: f?.time ?? 0,
      mpp: this.rig.mpp,
      night: this.atmosphere.state.night,
      skyTop: this.atmosphere.skyTop,
      skyBottom: this.atmosphere.skyBottom,
    });
  }

  resize() {
    const w = this.el.clientWidth || innerWidth;
    const h = this.el.clientHeight || innerHeight;
    // Pixel budget: a big Retina window at 2× asks for a ~9-megapixel antialiased buffer, which is slow and
    // can exhaust GPU memory (the browser then silently hands back a smaller buffer). Cap the pixel count.
    const cap = Math.sqrt((LOW ? 2.5e6 : 5e6) / Math.max(1, w * h));
    const maxDpr = Math.min(this.bufferCap, Math.max(1, Math.min(devicePixelRatio, LOW ? 1.5 : 2, cap)));
    if (devicePixelRatio !== this.sized.dpr || Math.abs(maxDpr - this.maxDpr) > 0.01) {
      // First sizing, a screen with a different pixel density, a page zoom, or a much bigger window.
      this.maxDpr = maxDpr;
      this.dprIdx = this.dprSteps.findIndex((d) => d <= this.maxDpr);
      if (this.dprIdx < 0) this.dprIdx = this.dprSteps.length - 1;
      this.renderer.setPixelRatio(Math.min(this.dprSteps[this.dprIdx], this.maxDpr));
    }
    this.renderer.setSize(w, h);
    this.rig.resize(w, h);
    this.post?.setSize(w, h, this.renderer.getPixelRatio());
    this.sized = { w, h, dpr: devicePixelRatio };
    // Under GPU memory pressure the browser may hand back a smaller drawing buffer than the canvas asks for,
    // and three.js would keep drawing into a viewport bigger than the buffer (only part of the map shows).
    // Drop the pixel ratio until the buffer fits.
    const gl = this.renderer.getContext();
    const c = this.renderer.domElement;
    if (gl.drawingBufferWidth < c.width - 1 || gl.drawingBufferHeight < c.height - 1) {
      const k = Math.min(gl.drawingBufferWidth / c.width, gl.drawingBufferHeight / c.height);
      const pr = Math.max(0.5, this.renderer.getPixelRatio() * k * 0.98);
      console.warn(`[world] drawing buffer is ${gl.drawingBufferWidth}×${gl.drawingBufferHeight} for a ${c.width}×${c.height} canvas; pixel ratio → ${pr.toFixed(2)}`);
      this.maxDpr = this.bufferCap = pr;
      this.renderer.setPixelRatio(pr);
    }
  }

  private adapt(dt: number) {
    if (document.hidden) return;
    if (this.fps < 40) {
      this.slowFor += dt;
      this.fastFor = 0;
    } else if (this.fps > 57) {
      this.fastFor += dt;
      this.slowFor = 0;
    }
    if (this.slowFor > 2 && this.dprIdx < this.dprSteps.length - 1) {
      this.dprIdx++;
      this.slowFor = 0;
      this.renderer.setPixelRatio(this.dprSteps[this.dprIdx]);
      if (this.dprIdx >= 2) this.atmosphere.key.shadow.mapSize.set(2048, 2048);
      this.atmosphere.key.shadow.map?.dispose();
      this.atmosphere.key.shadow.map = null;
      this.resize();
    } else if (this.fastFor > 8 && this.dprSteps[this.dprIdx - 1] !== undefined && this.dprSteps[this.dprIdx - 1] <= this.maxDpr) {
      this.dprIdx--;
      this.fastFor = 0;
      this.renderer.setPixelRatio(this.dprSteps[this.dprIdx]);
      this.resize();
    }
  }

  private frame() {
    if (this.el.clientWidth !== this.sized.w || this.el.clientHeight !== this.sized.h || devicePixelRatio !== this.sized.dpr) this.resize();
    const t = performance.now();
    const dt = Math.min(0.1, (t - this.last) / 1000);
    this.last = t;
    this.fps = this.fps * 0.95 + (1 / Math.max(dt, 1e-3)) * 0.05;
    this.adapt(dt);
    tickLook(dt);
    this.rig.update(dt);
    const fp = this.rig.footprint();
    const focus = this.rig.target.clone();
    let radius = 0;
    for (const p of fp) radius = Math.max(radius, p.distanceTo(focus));
    radius = Math.min(radius, this.rig.span * 3);
    this.atmosphere.cameraAzimuth = this.rig.azimuth;
    this.atmosphere.update(focus, radius);
    const info: FrameInfo = { dt, time: (t - this.start) / 1000, now: this.now(), mpp: this.rig.mpp, focus, radius, night: this.atmosphere.state.night };
    // One failing layer must not stop the whole map from drawing.
    for (const l of this.layers) {
      try {
        l.update?.(info);
      } catch (err) {
        if (!this.failed.has(l)) console.error('[world] layer update failed', err);
        this.failed.add(l);
      }
    }
    this.lastInfo = info;
    this.draw();
  }
}
