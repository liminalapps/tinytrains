import * as THREE from 'three';
import { buildRibbons } from './ribbon.ts';
import { netUniforms, TRACK_Y } from './network.ts';
import type { LiveTrain } from './trains.ts';
import type { FrameInfo, Layer } from './world.ts';

/** An animated dashed ribbon along the selected train's track ahead. */
export class RouteHint implements Layer {
  readonly mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;
  private train: LiveTrain | null = null;
  private sig = '';

  constructor() {
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color() },
        uTime: { value: 0 },
        uHalfW: { value: 4 },
        uElevH: netUniforms.uElevH,
        uDash: { value: 30 },
        uStart: { value: 0 },
      },
      vertexShader: /* glsl */ `
        attribute vec2 aMiter; attribute float aSide; attribute float aDist; attribute float aElev;
        uniform float uHalfW; uniform float uElevH;
        varying float vDist; varying float vSide;
        void main() {
          vec3 p = position;
          p.xz += aMiter * aSide * uHalfW;
          p.y += max(aElev, 0.0) * uElevH;
          vDist = aDist; vSide = aSide;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; uniform float uTime; uniform float uDash; uniform float uStart;
        varying float vDist; varying float vSide;
        void main() {
          if (vDist < uStart) discard;
          float d = fract((vDist - uTime * uDash * 1.2) / uDash);
          float dash = smoothstep(0.0, 0.08, d) * (1.0 - smoothstep(0.5, 0.58, d));
          float edge = 1.0 - smoothstep(0.7, 1.0, abs(vSide));
          vec3 c = mix(vec3(1.0), uColor, 0.35);
          gl_FragColor = vec4(c, dash * edge * 0.95);
        }`,
      transparent: true,
      depthWrite: false,
      depthTest: false,
    });
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.mat);
    this.mesh.renderOrder = 15;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  set(t: LiveTrain | null) {
    this.train = t;
    if (!t) {
      this.mesh.visible = false;
      this.sig = '';
    }
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }

  update(f: FrameInfo) {
    const t = this.train;
    if (!t || t.dying !== null) {
      this.mesh.visible = false;
      return;
    }
    // Rebuild when the train's path changes.
    const sig = t.path.sig;
    if (sig !== this.sig) {
      this.sig = sig;
      const p = t.path;
      const pts: number[] = [];
      const el: number[] = [];
      for (let i = 0; i < p.x.length; i++) {
        pts.push(p.x[i], -p.z[i]);
        el.push(p.el[i]);
      }
      this.mesh.geometry.dispose();
      this.mesh.geometry = buildRibbons([{ pts, elev: el }], TRACK_Y + 2.5);
      this.mat.uniforms.uColor.value.set(t.line.color);
    }
    this.mesh.visible = true;
    this.mat.uniforms.uTime.value = f.time;
    this.mat.uniforms.uStart.value = t.disp ?? 0;
    this.mat.uniforms.uHalfW.value = Math.max(2, f.mpp * 2.2);
    this.mat.uniforms.uDash.value = Math.max(12, f.mpp * 22);
  }
}
