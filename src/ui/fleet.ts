import * as THREE from 'three';
import type { StockSpec } from '../../shared/types.ts';
import { carModel, consist, trainUniforms } from '../engine/stockModel.ts';

/** Renders small "portrait" images of rolling stock, once per spec, with a shared offscreen renderer. */
export class StockPortraits {
  private renderer: THREE.WebGLRenderer | null = null;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 600);
  private cache = new Map<string, string>();
  private w = 300;
  private h = 120;

  private ensure() {
    if (this.renderer) return this.renderer;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(2);
    this.renderer.setSize(this.w, this.h, false);
    this.renderer.setClearColor(0, 0);
    this.scene.add(new THREE.HemisphereLight(0xf4fbff, 0xb9a98c, 2.1));
    const sun = new THREE.DirectionalLight(0xfff4e0, 2.3);
    sun.position.set(30, 50, 40);
    this.scene.add(sun);
    return this.renderer;
  }

  get(spec: StockSpec, lineColor: string): string {
    const key = `${spec.id}|${lineColor}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    const r = this.ensure();
    const holder = new THREE.Group();
    const m = carModel(spec);
    const n = spec.profile === 'cablecar' || spec.profile === 'streetcar' ? 1 : 2;
    const bodies = consist(spec, n).slice(0, spec.sections && spec.sections > 1 ? spec.sections : n);
    let x = 0;
    const color = new THREE.Color(lineColor);
    for (const b of bodies) {
      const mesh = new THREE.InstancedMesh(m.geometry(b.variant), m.material, 1);
      mesh.setMatrixAt(0, new THREE.Matrix4().makeRotationY(b.flip ? Math.PI : 0).setPosition(x, 0, 0));
      mesh.setColorAt(0, color);
      holder.add(mesh);
      x -= m.bodyLength + 0.7;
    }
    const len = -x;
    holder.position.x = len / 2 - m.bodyLength / 2;
    this.scene.add(holder);
    const span = Math.max(len * 0.34, spec.height * 2.2);
    const a = this.w / this.h;
    Object.assign(this.camera, { left: (-span * a) / 2, right: (span * a) / 2, top: span / 2 + span * 0.08, bottom: -span / 2 + span * 0.08 });
    this.camera.updateProjectionMatrix();
    this.camera.position.set(70, 38, 75);
    this.camera.lookAt(m.bodyLength * 0.15, spec.height * 0.45, 0);
    const night = trainUniforms.uNight.value;
    const far = trainUniforms.uFar.value;
    trainUniforms.uNight.value = 0;
    trainUniforms.uFar.value = 0;
    r.render(this.scene, this.camera);
    trainUniforms.uNight.value = night;
    trainUniforms.uFar.value = far;
    const url = r.domElement.toDataURL('image/png');
    this.scene.remove(holder);
    this.cache.set(key, url);
    return url;
  }
}
