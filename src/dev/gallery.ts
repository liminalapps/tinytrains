import * as THREE from 'three';
import type { StockSpec } from '../../shared/types.ts';
import { STOCK } from '../../shared/stock/index.ts';
import { carModel, consist, trainUniforms } from '../engine/stockModel.ts';

// Dev-only: renders every rolling stock spec as a short train, catalog style.

const SAMPLES: StockSpec[] = [
  { id: 't-r160', name: 'R160', maker: 'Alstom/Kawasaki', introduced: 2006, blurb: '', length: 18.4, width: 3.05, height: 3.7, doors: 4, profile: 'box', nose: 'flat', body: '#c9ced6', finish: 'stainless', roof: '#9ea4ac', front: '#1d2026', doorColor: '#c3c8d0', pantograph: false },
  { id: 't-1972', name: '1972 Stock', maker: 'Metro-Cammell', introduced: 1972, blurb: '', length: 16, width: 2.64, height: 2.88, doors: 2, profile: 'tube', nose: 'flat', body: '#f4f4f2', finish: 'paint', roof: '#e9e9e6', front: '#dc241f', doorColor: '#dc241f', skirt: '#0019a8', pantograph: false },
  { id: 't-bart', name: 'D car', maker: 'Bombardier', introduced: 2018, blurb: '', length: 21.3, width: 3.2, height: 3.3, doors: 3, profile: 'rounded', nose: 'slant', body: '#e8ebef', finish: 'paint', roof: '#c7ccd3', front: '#0099d8', doorColor: '#d9dde2', stripes: [{ color: '#0099d8', from: 0.04, to: 0.1 }], pantograph: false },
  { id: 't-maru', name: '2000 series', maker: 'Nippon Sharyo', introduced: 2019, blurb: '', length: 18, width: 2.83, height: 3.5, doors: 3, profile: 'rounded', nose: 'rounded', body: '#e60012', finish: 'paint', roof: '#c0c0c0', front: '#e60012', doorColor: '#c9ced6', pattern: 'sinewave', pantograph: false },
  { id: 't-e235', name: 'E235', maker: 'J-TREC', introduced: 2015, blurb: '', length: 20, width: 2.95, height: 3.65, doors: 4, profile: 'rounded', nose: 'flat', body: '#d4d8dd', finish: 'stainless', roof: '#9aa0a8', front: '#111111', doorColor: '#9acd32', stripes: [{ color: 'line', from: 0.9, to: 0.97 }], pantograph: true },
  { id: 't-cable', name: 'Cable car', maker: 'SFMTA', introduced: 1873, blurb: '', length: 8.3, width: 2.44, height: 3.2, doors: 0, profile: 'cablecar', nose: 'flat', body: '#8b1a1a', finish: 'paint', roof: '#f2e6c8', front: '#8b1a1a', doorColor: '#d8b45a', skirt: '#1f3f73', pantograph: false },
  { id: 't-pcc', name: 'PCC', maker: 'St. Louis Car', introduced: 1948, blurb: '', length: 14.2, width: 2.6, height: 3.2, doors: 2, profile: 'streetcar', nose: 'rounded', body: '#f0e2b8', finish: 'paint', roof: '#e4d6ae', front: '#1f6b3a', doorColor: '#1f6b3a', stripes: [{ color: '#1f6b3a', from: 0, to: 0.38 }], pantograph: false, trolleyPole: true },
  { id: 't-lrv', name: 'S200 SF', maker: 'Siemens', introduced: 2017, blurb: '', length: 23, width: 2.65, height: 3.4, doors: 2, profile: 'tram', nose: 'slant', body: '#e9ecef', finish: 'paint', roof: '#bfc4c9', front: '#c8102e', doorColor: '#c8102e', stripes: [{ color: '#c8102e', from: 0.0, to: 0.22 }], pantograph: true, sections: 2 },
  { id: 't-mono', name: '10000', maker: 'Hitachi', introduced: 2014, blurb: '', length: 16, width: 2.98, height: 3.3, doors: 2, profile: 'monorail', nose: 'bullet', body: '#f2f4f6', finish: 'paint', roof: '#dfe3e8', front: '#1b3d8f', doorColor: '#c9ced6', stripes: [{ color: '#1b3d8f', from: 0.1, to: 0.3 }, { color: '#e2231a', from: 0.3, to: 0.34 }], pantograph: false },
];

const specs = Object.values(STOCK).length ? Object.values(STOCK) : SAMPLES;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);
document.body.style.margin = '0';
document.body.style.background = 'linear-gradient(#bfe6f7,#fff6e6)';
renderer.setClearColor(0x000000, 0);

const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight(0xeef8ff, 0xb0a48a, 1.8));
const sun = new THREE.DirectionalLight(0xfff4e0, 2.6);
sun.position.set(40, 80, 60);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
Object.assign(sun.shadow.camera, { left: -150, right: 150, top: 150, bottom: -150, far: 400 });
scene.add(sun);

const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshLambertMaterial({ color: '#eef0d5' }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const cols = 2;
specs.forEach((spec, i) => {
  const m = carModel(spec);
  const cars = spec.profile === 'cablecar' || spec.profile === 'streetcar' ? 1 : 3;
  const bodies = consist(spec, cars);
  const col = i % cols;
  const row = Math.floor(i / cols);
  const z = row * 9 - 40;
  let x = col * 75 - 50;
  for (const b of bodies) {
    const mesh = new THREE.Mesh(m.geometry(b.variant), m.material);
    mesh.position.set(x, 0, z);
    if (b.flip) mesh.rotation.y = Math.PI;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    x -= m.bodyLength + 0.7;
  }
  const div = document.createElement('div');
  div.textContent = `${spec.id} · ${spec.name}`;
  div.dataset.x = String(col * 75 - 50);
  div.dataset.z = String(z);
  Object.assign(div.style, { position: 'absolute', font: '600 12px Nunito, sans-serif', color: '#234', pointerEvents: 'none' });
  document.body.appendChild(div);
});

const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 2000);
const qs = new URLSearchParams(location.search);
let az = Number(qs.get('az') ?? -0.7);
let span = Number(qs.get('span') ?? 90);
const target = new THREE.Vector3(Number(qs.get('x') ?? -10), 0, Number(qs.get('z') ?? 0));
addEventListener('wheel', (e) => (span *= Math.exp(e.deltaY * 0.001)));
let drag = false;
let lx = 0;
let ly = 0;
addEventListener('pointerdown', (e) => ((drag = true), (lx = e.clientX), (ly = e.clientY)));
addEventListener('pointerup', () => (drag = false));
addEventListener('pointermove', (e) => {
  if (!drag) return;
  if (e.shiftKey) az -= (e.clientX - lx) * 0.01;
  else {
    target.x -= (e.clientX - lx) * (span / innerHeight) * Math.cos(az);
    target.z -= (e.clientY - ly) * (span / innerHeight) * 1.5;
  }
  lx = e.clientX;
  ly = e.clientY;
});
const night = new URLSearchParams(location.search).has('night');
trainUniforms.uNight.value = night ? 1 : 0;
if (night) {
  document.body.style.background = 'linear-gradient(#0d1240,#2c2f78)';
  sun.intensity = 0.4;
}

function frame() {
  const a = innerWidth / innerHeight;
  Object.assign(cam, { left: (-span * a) / 2, right: (span * a) / 2, top: span / 2, bottom: -span / 2 });
  cam.position.set(target.x + Math.sin(az) * 300, 250, target.z + Math.cos(az) * 300);
  cam.lookAt(target);
  cam.updateProjectionMatrix();
  renderer.render(scene, cam);
  for (const div of document.querySelectorAll<HTMLDivElement>('div[data-x]')) {
    const p = new THREE.Vector3(Number(div.dataset.x) + 4, 5, Number(div.dataset.z)).project(cam);
    div.style.left = `${((p.x + 1) / 2) * innerWidth}px`;
    div.style.top = `${((1 - p.y) / 2) * innerHeight}px`;
  }
  requestAnimationFrame(frame);
}
frame();
