import * as THREE from 'three';
import type { AircraftType, Livery } from '../../shared/aircraft.ts';
import { buildModel, glowMaterial } from '../engine/planes.ts';

/** A little turntable for the selected aircraft: its type's model in its airline's colors, banking gently. */
export class PlanePreview {
  readonly canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
  private holder = new THREE.Group();
  private key = '';
  private span = 40;
  private running = false;
  private mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  private lightMat = glowMaterial(9);
  private strobeMat = glowMaterial(13);

  constructor(w: number, h: number) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'stock-canvas';
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(w, h, false);
    this.renderer.setClearColor(0, 0);
    this.scene.add(new THREE.HemisphereLight(0xf4fbff, 0xb9a98c, 2.1));
    const sun = new THREE.DirectionalLight(0xfff4e0, 2.3);
    sun.position.set(30, 60, 40);
    this.scene.add(sun, this.holder);
  }

  show(type: AircraftType, livery: Livery) {
    const key = `${type.name}|${livery.body}|${livery.tail}|${livery.accent}`;
    if (key !== this.key) {
      this.key = key;
      for (const c of this.holder.children) (c as THREE.Mesh | THREE.Points).geometry.dispose();
      this.holder.clear();
      const m = buildModel(type, livery);
      this.holder.add(new THREE.Mesh(m.body, this.mat), new THREE.Points(m.lights, this.lightMat), new THREE.Points(m.strobe, this.strobeMat));
      this.span = Math.max(type.len, type.span) * 0.95;
    }
    if (!this.running) {
      this.running = true;
      requestAnimationFrame(this.tick);
    }
  }

  stop() {
    this.running = false;
  }

  private tick = () => {
    if (!this.running) return;
    if (!this.canvas.isConnected) {
      this.running = false;
      return;
    }
    const t = performance.now() / 1000;
    const w = this.canvas.clientWidth || 300;
    const h = this.canvas.clientHeight || 130;
    const a = w / h;
    const s = this.span;
    Object.assign(this.camera, { left: (-s * a) / 2, right: (s * a) / 2, top: s / 2, bottom: -s / 2 });
    this.camera.updateProjectionMatrix();
    // A slow orbit from a three-quarter view above, the model banking gently as if in a turn.
    const ang = 0.7 + t * 0.35;
    this.camera.position.set(Math.cos(ang) * 200, 110, Math.sin(ang) * 200);
    this.camera.lookAt(0, 0, 0);
    this.holder.rotation.set(Math.sin(t * 0.8) * 0.12, 0, Math.sin(t * 0.6) * 0.05);
    const strobe = this.holder.children[2];
    if (strobe) strobe.visible = t % 1.2 < 0.08;
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(this.tick);
  };
}
