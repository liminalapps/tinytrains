import * as THREE from 'three';
import type { StockSpec } from '../../shared/types.ts';
import { carModel, consist, trainUniforms } from '../engine/stockModel.ts';

/** A little turntable that shows the selected train's rolling stock in 3D. */
export class StockPreview {
  readonly canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 500);
  private holder = new THREE.Group();
  private spec: StockSpec | null = null;
  private color = new THREE.Color();
  private angle = 0;
  private running = false;
  private span = 10;

  constructor(w: number, h: number) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'stock-canvas';
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(w, h, false);
    this.renderer.setClearColor(0, 0);
    this.scene.add(new THREE.HemisphereLight(0xf4fbff, 0xb9a98c, 2.1));
    const sun = new THREE.DirectionalLight(0xfff4e0, 2.2);
    sun.position.set(20, 40, 30);
    this.scene.add(sun);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.08 }));
    disc.name = 'shadow';
    this.scene.add(this.holder, disc);
  }

  show(spec: StockSpec, lineColor: string) {
    this.color.set(lineColor);
    if (this.spec?.id === spec.id) {
      this.recolor();
      this.start();
      return;
    }
    this.spec = spec;
    this.holder.clear();
    const m = carModel(spec);
    const bodies = consist(spec, spec.profile === 'cablecar' || spec.profile === 'streetcar' ? 1 : 2).slice(0, spec.sections && spec.sections > 1 ? spec.sections : 2);
    let x = 0;
    for (const b of bodies) {
      const mesh = new THREE.InstancedMesh(m.geometry(b.variant), m.material, 1);
      const mat = new THREE.Matrix4().makeRotationY(b.flip ? Math.PI : 0).setPosition(x, 0, 0);
      mesh.setMatrixAt(0, mat);
      mesh.setColorAt(0, this.color);
      this.holder.add(mesh);
      x -= m.bodyLength + 0.7;
    }
    const len = -x;
    this.holder.position.x = len / 2 - m.bodyLength / 2;
    this.span = Math.max(len * 0.55, spec.height * 2.2);
    const shadow = this.scene.getObjectByName('shadow')!;
    shadow.scale.set(len * 0.6, 1, len * 0.6);
    this.angle = -0.5;
    this.start();
  }

  private start() {
    if (this.running) return;
    this.running = true;
    requestAnimationFrame(this.tick);
  }

  private recolor() {
    for (const c of this.holder.children) {
      const m = c as THREE.InstancedMesh;
      m.setColorAt(0, this.color);
      m.instanceColor!.needsUpdate = true;
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
    // Sway gently around a three-quarter view so the side and nose stay visible.
    this.angle = 0.85 + Math.sin(performance.now() / 2600) * 0.45;
    const w = this.canvas.clientWidth || 300;
    const h = this.canvas.clientHeight || 130;
    const a = w / h;
    const s = this.span;
    Object.assign(this.camera, { left: (-s * a) / 2, right: (s * a) / 2, top: s / 2 + s * 0.05, bottom: -s / 2 + s * 0.05 });
    this.camera.updateProjectionMatrix();
    const r = 100;
    this.camera.position.set(Math.sin(this.angle) * r * 0.8, r * 0.55, Math.cos(this.angle) * r * 0.8);
    this.camera.lookAt(0, (this.spec?.height ?? 3) * 0.45, 0);
    // The preview is a showroom shot: daylight, full color, whatever the map is doing.
    const night = trainUniforms.uNight.value;
    const far = trainUniforms.uFar.value;
    trainUniforms.uNight.value = 0;
    trainUniforms.uFar.value = 0;
    this.renderer.render(this.scene, this.camera);
    trainUniforms.uNight.value = night;
    trainUniforms.uFar.value = far;
    requestAnimationFrame(this.tick);
  };
}
