import * as THREE from 'three';

/**
 * Orthographic "diorama" camera: looks down at a ground target from an azimuth/elevation,
 * with map-style grab panning, zoom-to-cursor, rotation and inertia. Ground plane is y = 0.
 * World axes: x = east, z = south, y = up.
 */
export class CameraRig {
  readonly camera: THREE.OrthographicCamera;
  target = new THREE.Vector3();
  azimuth = -0.6; // radians; 0 = looking north
  elevation = 0.74; // radians above the horizon
  /** Frustum height in meters. */
  span = 8000;
  /** Shift the scene up by this many CSS pixels (to keep the focus visible above a bottom sheet). */
  shiftY = 0;
  private shiftNow = 0;
  minSpan = 90;
  maxSpan = 160000;
  bounds = { minX: -1e5, maxX: 1e5, minZ: -1e5, maxZ: 1e5 };

  private el: HTMLElement;
  private width = 1;
  private height = 1;
  private velocity = new THREE.Vector2();
  private anim: null | { t: number; dur: number; from: RigPose; to: RigPose; done?: () => void } = null;
  private follow: null | (() => THREE.Vector3 | null) = null;
  private followHeading: null | (() => number | null) = null;
  private followOffset = new THREE.Vector3();
  private pointers = new Map<number, { x: number; y: number; button: number }>();
  private dragMode: 'pan' | 'rotate' | null = null;
  private grab = new THREE.Vector3();
  private last = { x: 0, y: 0, t: 0 };
  private pinch: null | { dist: number; angle: number; mid: THREE.Vector2; span: number; az: number } = null;
  private raycaster = new THREE.Raycaster();
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private moved = 0;
  /** Called on a click/tap that didn't drag. */
  onTap: (x: number, y: number) => void = () => {};
  onInteract: () => void = () => {};

  constructor(el: HTMLElement) {
    this.el = el;
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 10, 400000);
    this.bind();
  }

  get pose(): RigPose {
    return { x: this.target.x, z: this.target.z, span: this.span, azimuth: this.azimuth, elevation: this.elevation };
  }

  set pose(p: RigPose) {
    this.anim = null;
    this.target.set(p.x, 0, p.z);
    this.span = p.span;
    this.azimuth = p.azimuth;
    this.elevation = p.elevation;
  }

  /** Meters per CSS pixel at the current zoom. */
  get mpp() {
    return this.span / this.height;
  }

  resize(w: number, h: number) {
    this.width = w;
    this.height = h;
  }

  flyTo(to: Partial<RigPose>, dur = 1.6, done?: () => void) {
    const from = this.pose;
    const full = { ...from, ...to };
    // Rotate the short way around.
    let d = full.azimuth - from.azimuth;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    full.azimuth = from.azimuth + d;
    this.anim = { t: 0, dur, from, to: full, done };
    this.velocity.set(0, 0);
  }

  /** Track a moving point. With `heading` (map radians, 0 = east, CCW), the camera also swings round
   * to watch from the side and a little behind, like riding alongside. */
  setFollow(fn: null | (() => THREE.Vector3 | null), heading: null | (() => number | null) = null) {
    this.follow = fn;
    this.followHeading = fn ? heading : null;
    this.followOffset.set(0, 0, 0);
  }

  get following() {
    return this.follow !== null;
  }

  update(dt: number) {
    this.shiftNow += (this.shiftY - this.shiftNow) * (1 - Math.exp(-dt * 6));
    if (this.anim) {
      const a = this.anim;
      a.t += dt;
      const k = Math.min(1, a.t / a.dur);
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      // Zoom out-and-in feel: interpolate span in log space.
      const ls = Math.log(a.from.span) + (Math.log(a.to.span) - Math.log(a.from.span)) * e;
      this.span = Math.exp(ls);
      this.target.x = a.from.x + (a.to.x - a.from.x) * e;
      this.target.z = a.from.z + (a.to.z - a.from.z) * e;
      this.azimuth = a.from.azimuth + (a.to.azimuth - a.from.azimuth) * e;
      this.elevation = a.from.elevation + (a.to.elevation - a.from.elevation) * e;
      if (k >= 1) {
        const done = a.done;
        this.anim = null;
        done?.();
      }
    } else if (this.follow) {
      const p = this.follow();
      if (p) {
        const want = p.clone().add(this.followOffset);
        const k = 1 - Math.exp(-dt * 4);
        this.target.x += (want.x - this.target.x) * k;
        this.target.z += (want.z - this.target.z) * k;
        const h = this.followHeading?.();
        if (h !== null && h !== undefined) {
          // Camera behind the train (az = atan2(-cos h, sin h)), then swung ~65° to see its side.
          const wantAz = Math.atan2(-Math.cos(h), Math.sin(h)) + 1.15;
          const da = Math.atan2(Math.sin(wantAz - this.azimuth), Math.cos(wantAz - this.azimuth));
          this.azimuth += da * (1 - Math.exp(-dt * 0.6));
        }
      }
    } else if (this.pointers.size === 0 && this.velocity.lengthSq() > 1e-4) {
      this.target.x += this.velocity.x * dt;
      this.target.z += this.velocity.y * dt;
      this.velocity.multiplyScalar(Math.exp(-dt * 4.5));
    }
    this.clamp();
    this.apply();
  }

  private clamp() {
    const b = this.bounds;
    this.target.x = THREE.MathUtils.clamp(this.target.x, b.minX, b.maxX);
    this.target.z = THREE.MathUtils.clamp(this.target.z, b.minZ, b.maxZ);
    this.span = THREE.MathUtils.clamp(this.span, this.minSpan, this.maxSpan);
    this.elevation = THREE.MathUtils.clamp(this.elevation, 0.3, 1.35);
  }

  apply() {
    const cam = this.camera;
    const aspect = this.width / this.height;
    const shift = this.shiftNow * (this.span / this.height);
    cam.left = (-this.span * aspect) / 2;
    cam.right = (this.span * aspect) / 2;
    cam.top = this.span / 2 - shift;
    cam.bottom = -this.span / 2 - shift;
    const dist = 150000;
    const ce = Math.cos(this.elevation);
    cam.position.set(
      this.target.x + Math.sin(this.azimuth) * ce * dist,
      Math.sin(this.elevation) * dist,
      this.target.z + Math.cos(this.azimuth) * ce * dist,
    );
    cam.up.set(0, 1, 0);
    cam.lookAt(this.target);
    cam.near = dist - 120000;
    cam.far = dist + 160000;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
  }

  /** Ground point (y = 0) under a CSS pixel. */
  groundAt(px: number, py: number, out = new THREE.Vector3()): THREE.Vector3 {
    const ndc = new THREE.Vector2((px / this.width) * 2 - 1, -(py / this.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    return this.raycaster.ray.intersectPlane(this.plane, out) ?? out.copy(this.target);
  }

  /** Project a world point to CSS pixels. */
  toScreen(v: THREE.Vector3, out = new THREE.Vector2()): THREE.Vector2 {
    const p = v.clone().project(this.camera);
    return out.set(((p.x + 1) / 2) * this.width, ((1 - p.y) / 2) * this.height);
  }

  /** Ground-plane footprint corners of the view (for shadow fitting / culling). */
  footprint(): THREE.Vector3[] {
    return [
      this.groundAt(0, 0),
      this.groundAt(this.width, 0),
      this.groundAt(this.width, this.height),
      this.groundAt(0, this.height),
    ];
  }

  private zoomAt(px: number, py: number, factor: number) {
    this.apply();
    const before = this.groundAt(px, py);
    this.span = THREE.MathUtils.clamp(this.span * factor, this.minSpan, this.maxSpan);
    this.apply();
    const after = this.groundAt(px, py);
    if (!this.follow) {
      this.target.x += before.x - after.x;
      this.target.z += before.z - after.z;
    }
  }

  zoomBy(factor: number) {
    this.anim = null;
    this.zoomAt(this.width / 2, this.height / 2, factor);
  }

  rotateBy(rad: number) {
    this.flyTo({ azimuth: this.azimuth + rad }, 0.7);
  }

  private bind() {
    const el = this.el;
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.anim = null;
        this.onInteract();
        const r = el.getBoundingClientRect();
        let dy = e.deltaY;
        if (e.deltaMode === 1) dy *= 16;
        if (e.ctrlKey) dy *= 3; // trackpad pinch
        this.zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(dy * 0.0016));
      },
      { passive: false },
    );
    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture(e.pointerId);
      const r = el.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      this.pointers.set(e.pointerId, { x, y, button: e.button });
      this.anim = null;
      this.velocity.set(0, 0);
      this.moved = 0;
      if (this.pointers.size === 1) {
        this.dragMode = e.button === 2 || e.shiftKey || e.altKey ? 'rotate' : 'pan';
        this.apply();
        this.groundAt(x, y, this.grab);
        this.last = { x, y, t: performance.now() };
      } else if (this.pointers.size === 2) {
        this.startPinch();
      }
    });
    el.addEventListener('pointermove', (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      const r = el.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      this.moved += Math.hypot(x - p.x, y - p.y);
      p.x = x;
      p.y = y;
      if (this.moved > 4) this.onInteract();
      if (this.pointers.size === 2 && this.pinch) {
        this.updatePinch();
        return;
      }
      if (this.dragMode === 'pan') {
        if (this.follow && this.moved > 6) this.follow = null;
        this.apply();
        const now = this.groundAt(x, y);
        const dx = this.grab.x - now.x;
        const dz = this.grab.z - now.z;
        this.target.x += dx;
        this.target.z += dz;
        const t = performance.now();
        const dtt = Math.max(1, t - this.last.t) / 1000;
        this.velocity.lerp(new THREE.Vector2(dx / dtt, dz / dtt), 0.5);
        // Keep flicks gentle: at most ~1.2 screen-heights per second of glide.
        const vmax = this.span * 1.2;
        if (this.velocity.length() > vmax) this.velocity.setLength(vmax);
        this.last = { x, y, t };
      } else if (this.dragMode === 'rotate') {
        this.followHeading = null;
        const dx = x - this.last.x;
        const dy = y - this.last.y;
        this.azimuth -= dx * 0.006;
        this.elevation += dy * 0.004;
        this.last = { x, y, t: performance.now() };
      }
    });
    const up = (e: PointerEvent) => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      this.pointers.delete(e.pointerId);
      if (this.pointers.size === 0) {
        if (this.moved < 6 && this.dragMode) this.onTap(p.x, p.y);
        if (performance.now() - this.last.t > 80) this.velocity.set(0, 0);
        this.dragMode = null;
        this.pinch = null;
      } else if (this.pointers.size === 1) {
        this.pinch = null;
        const [q] = this.pointers.values();
        this.dragMode = 'pan';
        this.apply();
        this.groundAt(q.x, q.y, this.grab);
        this.last = { x: q.x, y: q.y, t: performance.now() };
      }
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }

  private startPinch() {
    const [a, b] = [...this.pointers.values()];
    this.pinch = {
      dist: Math.hypot(a.x - b.x, a.y - b.y),
      angle: Math.atan2(b.y - a.y, b.x - a.x),
      mid: new THREE.Vector2((a.x + b.x) / 2, (a.y + b.y) / 2),
      span: this.span,
      az: this.azimuth,
    };
    this.apply();
    this.groundAt(this.pinch.mid.x, this.pinch.mid.y, this.grab);
  }

  private updatePinch() {
    const [a, b] = [...this.pointers.values()];
    const pz = this.pinch!;
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    const mid = new THREE.Vector2((a.x + b.x) / 2, (a.y + b.y) / 2);
    this.span = THREE.MathUtils.clamp((pz.span * pz.dist) / Math.max(dist, 1), this.minSpan, this.maxSpan);
    this.azimuth = pz.az + (angle - pz.angle);
    this.apply();
    const now = this.groundAt(mid.x, mid.y);
    this.target.x += this.grab.x - now.x;
    this.target.z += this.grab.z - now.z;
  }
}

export interface RigPose {
  x: number;
  z: number;
  span: number;
  azimuth: number;
  elevation: number;
}
