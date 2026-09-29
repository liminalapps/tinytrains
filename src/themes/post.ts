import * as THREE from 'three';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import type { Theme } from './themes.ts';

// Renders the scene into an offscreen target (color + depth/stencil), then draws the screen with one theme
// shader that sees both. Themes mostly style the materials themselves (look.ts); post is kept to effects that
// can't live in a material: neon's bloom and pixel's low-resolution grid.

export interface PostFrame {
  time: number;
  mpp: number;
  night: number;
  skyTop: THREE.Color;
  skyBottom: THREE.Color;
}

const COMMON = /* glsl */ `
precision highp float;
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform vec2 uRes;      // target size in pixels
uniform float uPx;      // target pixels per CSS pixel
uniform float uTime;
uniform float uMpp;
uniform float uNight;
uniform float uNear;
uniform float uFar;
uniform vec3 uSkyTop;
uniform vec3 uSkyBottom;
varying vec2 vUv;

vec3 srgb(vec3 c) {
  c = max(c, 0.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
vec4 scene(vec2 uv) { vec4 c = texture2D(tColor, uv); return vec4(srgb(c.rgb), c.a); }
float depthM(vec2 uv) { return uNear + texture2D(tDepth, uv).r * (uFar - uNear); }
/** Silhouettes: where depth isn't locally planar (a Laplacian above a threshold in meters). */
float depthEdge(vec2 uv, float r, float thresh) {
  vec2 px = r / uRes;
  float z = depthM(uv);
  float l = abs(4.0 * z - depthM(uv + vec2(px.x, 0.0)) - depthM(uv - vec2(px.x, 0.0)) - depthM(uv + vec2(0.0, px.y)) - depthM(uv - vec2(0.0, px.y)));
  return smoothstep(thresh, thresh * 2.0, l);
}
/** Sobel on luminance: the edges of roads, water, parks and painted lines. */
float colorEdge(vec2 uv, float r) {
  vec2 px = r / uRes;
  float tl = luma(scene(uv + vec2(-px.x, px.y)).rgb), t = luma(scene(uv + vec2(0.0, px.y)).rgb), tr = luma(scene(uv + px).rgb);
  float l = luma(scene(uv - vec2(px.x, 0.0)).rgb), rr = luma(scene(uv + vec2(px.x, 0.0)).rgb);
  float bl = luma(scene(uv - px).rgb), b = luma(scene(uv - vec2(0.0, px.y)).rgb), br = luma(scene(uv + vec2(px.x, -px.y)).rgb);
  float gx = -tl - 2.0 * l - bl + tr + 2.0 * rr + br;
  float gy = -bl - 2.0 * b - br + tl + 2.0 * t + tr;
  return length(vec2(gx, gy));
}
float gridLine(vec2 p, float step, float w) {
  vec2 g = abs(fract(p / step - 0.5) - 0.5) * step;
  return 1.0 - smoothstep(0.0, w, min(g.x, g.y));
}
`;

const SHADERS: Record<NonNullable<Theme['post']>, string> = {
  // The scene already glows (emissive lines, trains, windows and coast); this pass only blooms it onto a
  // violet void. No scanlines or color fringing: they read as noise at a distance.
  neon: /* glsl */ `
void main() {
  vec4 s = scene(vUv);
  vec3 bg = mix(uSkyBottom, uSkyTop, smoothstep(0.0, 1.0, vUv.y));
  bg += vec3(0.9, 0.12, 0.6) * pow(1.0 - vUv.y, 6.0) * 0.18;
  vec3 c = bg * (1.0 - clamp(s.a, 0.0, 1.0)) + s.rgb;
  vec2 d = vUv - 0.5;
  c *= 1.0 - dot(d, d) * 0.6;
  gl_FragColor = vec4(c, 1.0);
}`,

  // Cel shading's ink: a dark line wherever depth jumps (silhouettes: buildings on the street, trains on the
  // track, the island against the sky), about 1.5 CSS px wide. It fades out at far zoom, where every building
  // is a few pixels and outlines would only add noise.
  cel: /* glsl */ `
void main() {
  vec4 t = texture2D(tColor, vUv);
  float a = clamp(t.a, 0.0, 1.0);
  vec3 c = a > 0.0 ? srgb(t.rgb / a) : vec3(0.0);
  vec2 px = uPx * 1.3 / uRes;
  float z = depthM(vUv);
  float zx0 = depthM(vUv - vec2(px.x, 0.0)), zx1 = depthM(vUv + vec2(px.x, 0.0));
  float zy0 = depthM(vUv - vec2(0.0, px.y)), zy1 = depthM(vUv + vec2(0.0, px.y));
  float jump = max(max(abs(zx1 - z), abs(z - zx0)), max(abs(zy1 - z), abs(z - zy0)));
  float thresh = 3.0 + uMpp * 7.0;
  float ink = smoothstep(thresh, thresh * 1.6, jump) * (1.0 - smoothstep(5.0, 12.0, uMpp));
  // Against the empty sky, the outline sits on the object's side only.
  float edgeA = max(a, ink * step(0.5, max(max(texture2D(tColor, vUv - vec2(px.x, 0.0)).a, texture2D(tColor, vUv + vec2(px.x, 0.0)).a), max(texture2D(tColor, vUv - vec2(0.0, px.y)).a, texture2D(tColor, vUv + vec2(0.0, px.y)).a))));
  vec3 inkCol = vec3(0.17, 0.08, 0.08);
  c = mix(c, inkCol, ink * 0.92);
  gl_FragColor = vec4(c * edgeA, edgeA);
}`,

  // Hi-fi pixel art: the scene drawn at one texel per two CSS pixels (antialiased inside each texel, so the
  // far view stays calm), scaled up with hard edges. Up close, sprites get a one-texel dark outline.
  pixel: /* glsl */ `
void main() {
  vec2 cell = floor(vUv * uRes);
  vec2 uv = (cell + 0.5) / uRes;
  vec4 t = texture2D(tColor, uv);
  float a = clamp(t.a, 0.0, 1.0);
  vec3 c = a > 0.0 ? srgb(t.rgb / a) : vec3(0.0);
  // Pixel-art color ramps: shade leans cool and violet, light leans warm, and each ramp is a few flat steps.
  float L = luma(c);
  c = mix(c, c * vec3(0.84, 0.88, 1.14), (1.0 - smoothstep(0.15, 0.6, L)) * 0.55);
  c = mix(c, c * vec3(1.04, 1.02, 0.95), smoothstep(0.65, 0.95, L) * 0.5);
  c = mix(vec3(luma(c)), c, 1.12);
  float L2 = max(luma(c), 1e-3);
  c *= (floor(L2 * 14.0 + 0.5) / 14.0) / L2;
  // Outline the near side of a depth step: the object in front keeps a crisp dark rim.
  vec2 px = 1.0 / uRes;
  float z = depthM(uv);
  float zn = max(max(depthM(uv + vec2(px.x, 0.0)), depthM(uv - vec2(px.x, 0.0))), max(depthM(uv + vec2(0.0, px.y)), depthM(uv - vec2(0.0, px.y))));
  float near = 1.0 - smoothstep(1.2, 3.0, uMpp);
  float rim = step(6.0 + uMpp * 8.0, zn - z) * near;
  c = mix(c, c * vec3(0.28, 0.26, 0.36), rim * 0.85);
  gl_FragColor = vec4(c * a, a);
}`,
};

export class Post {
  private target: THREE.WebGLRenderTarget;
  private quad: THREE.Mesh;
  private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private scene = new THREE.Scene();
  private mat: THREE.ShaderMaterial;
  private bloom: UnrealBloomPass | null = null;
  private checked = false;
  /** Called once if the GPU can't render to the offscreen buffer (the world then drops post-processing). */
  onFail: (() => void) | null = null;

  constructor(
    private renderer: THREE.WebGLRenderer,
    readonly kind: NonNullable<Theme['post']>,
  ) {
    const pixel = kind === 'pixel';
    const depth = new THREE.DepthTexture(1, 1, THREE.UnsignedInt248Type);
    depth.format = THREE.DepthStencilFormat;
    // Half-float keeps bloom's highlights, but not every GPU can render to it (or multisample it); fall back
    // to 8-bit rather than drawing nothing.
    const ext = renderer.extensions;
    const hdr = renderer.capabilities.isWebGL2 && (ext.has('EXT_color_buffer_float') || ext.has('EXT_color_buffer_half_float'));
    this.target = new THREE.WebGLRenderTarget(1, 1, {
      type: hdr ? THREE.HalfFloatType : THREE.UnsignedByteType,
      depthBuffer: true,
      stencilBuffer: true,
      depthTexture: depth,
      samples: pixel ? 4 : 2,
      minFilter: pixel ? THREE.NearestFilter : THREE.LinearFilter,
      magFilter: pixel ? THREE.NearestFilter : THREE.LinearFilter,
    });
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: this.target.texture },
        tDepth: { value: depth },
        uRes: { value: new THREE.Vector2(1, 1) },
        uPx: { value: 1 },
        uTime: { value: 0 },
        uMpp: { value: 1 },
        uNight: { value: 0 },
        uNear: { value: 1 },
        uFar: { value: 2 },
        uSkyTop: { value: new THREE.Color() },
        uSkyBottom: { value: new THREE.Color() },
      },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: COMMON + SHADERS[kind],
      depthTest: false,
      depthWrite: false,
      blending: THREE.NoBlending,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
    if (kind === 'neon') this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.7, 0.3, 0.62);
  }

  setSize(cssW: number, cssH: number, pr: number) {
    // Pixel art: one texel per two CSS pixels, scaled up with hard edges.
    // Neon's buffers (color, depth, bloom mips) are big: cap them at ~3 megapixels so phones don't run out of GPU memory.
    const k = this.kind === 'pixel' ? 0.5 : Math.min(pr, Math.sqrt(3e6 / Math.max(1, cssW * cssH)));
    const w = Math.max(1, Math.round(cssW * k));
    const h = Math.max(1, Math.round(cssH * k));
    this.target.setSize(w, h);
    this.mat.uniforms.uRes.value.set(w, h);
    this.mat.uniforms.uPx.value = k;
    this.bloom?.setSize(w, h);
  }

  render(scene: THREE.Scene, camera: THREE.OrthographicCamera, f: PostFrame) {
    const r = this.renderer;
    const u = this.mat.uniforms;
    u.uTime.value = f.time;
    u.uMpp.value = f.mpp;
    u.uNight.value = f.night;
    u.uNear.value = camera.near;
    u.uFar.value = camera.far;
    u.uSkyTop.value.copy(f.skyTop);
    u.uSkyBottom.value.copy(f.skyBottom);
    r.setRenderTarget(this.target);
    r.clear(true, true, true);
    r.render(scene, camera);
    if (!this.checked) {
      this.checked = true;
      const gl = r.getContext();
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        console.warn(`[post] ${this.kind}: offscreen buffer unsupported on this GPU; drawing without post-processing`);
        r.setRenderTarget(null);
        this.onFail?.();
        return;
      }
    }
    if (this.bloom) {
      // Zoomed out, lines crowd together and their glows sum toward white: bloom less so each keeps its color.
      this.bloom.strength = 0.7 - 0.38 * THREE.MathUtils.smoothstep(f.mpp, 3, 18);
      this.bloom.render(r, this.target, this.target, 0, false);
    }
    // The screen pass runs at canvas resolution (the pixel theme's target is smaller on purpose).
    r.setRenderTarget(null);
    r.render(this.scene, this.cam);
  }

  dispose() {
    this.target.depthTexture?.dispose();
    this.target.dispose();
    this.mat.dispose();
    this.quad.geometry.dispose();
    this.bloom?.dispose();
  }
}
