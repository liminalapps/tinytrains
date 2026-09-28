import * as THREE from 'three';
import type { GeoLabel } from '../../shared/types.ts';
import type { FrameInfo, Layer, World } from './world.ts';

export interface LabelSpec {
  id: string;
  text: string;
  sub?: string; // secondary line, e.g. Japanese name
  pos: THREE.Vector3;
  cls: string; // css class
  rank: number; // lower = more important
  minMpp: number; // visible when mpp >= minMpp
  maxMpp: number; // ... and mpp <= maxMpp
  onClick?: () => void;
  html?: string; // optional custom inner html
}

interface Live {
  spec: LabelSpec;
  el: HTMLDivElement | null;
  w: number;
  h: number;
  shown: boolean;
}

/** HTML labels over the canvas with greedy collision culling by rank. */
export class Labels implements Layer {
  private root: HTMLElement;
  private items: Live[] = [];
  private frame = 0;
  private v = new THREE.Vector2();
  private lastKey = '';
  /** Label ids to hide (e.g. stations covered by ETA flags). */
  suppress = new Set<string>();

  constructor(
    private world: World,
    root: HTMLElement,
  ) {
    this.root = root;
  }

  set(list: LabelSpec[]) {
    this.clear();
    this.items = list.map((spec) => ({ spec, el: null, w: 0, h: 0, shown: false })).sort((a, b) => a.spec.rank - b.spec.rank);
  }

  clear() {
    for (const it of this.items) it.el?.remove();
    this.items = [];
  }

  private ensureEl(it: Live) {
    if (it.el) return it.el;
    const el = document.createElement('div');
    el.className = `lbl ${it.spec.cls}`;
    if (it.spec.html) el.innerHTML = it.spec.html;
    else {
      el.textContent = it.spec.text;
      if (it.spec.sub) {
        const s = document.createElement('small');
        s.textContent = it.spec.sub;
        el.appendChild(s);
      }
    }
    if (it.spec.onClick) {
      el.classList.add('clickable');
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        it.spec.onClick!();
      });
    }
    this.root.appendChild(el);
    const r = el.getBoundingClientRect();
    it.w = r.width;
    it.h = r.height;
    it.el = el;
    return el;
  }

  update(f: FrameInfo) {
    const rig = this.world.rig;
    const key = `${rig.target.x.toFixed(0)},${rig.target.z.toFixed(0)},${rig.span.toFixed(0)},${rig.azimuth.toFixed(3)},${rig.elevation.toFixed(3)}`;
    const moved = key !== this.lastKey;
    this.lastKey = key;
    this.frame++;
    // Re-run collision when the camera settles or every ~10 frames while moving.
    const relayout = !moved || this.frame % 10 === 0;
    const W = innerWidth;
    const H = innerHeight;
    const placed: [number, number, number, number][] = [];
    for (const it of this.items) {
      const s = it.spec;
      const inZoom = f.mpp >= s.minMpp && f.mpp <= s.maxMpp && !this.suppress.has(s.id);
      if (!inZoom) {
        if (it.shown) this.hide(it);
        continue;
      }
      rig.toScreen(s.pos, this.v);
      const x = this.v.x;
      const y = this.v.y;
      if (x < -200 || y < -60 || x > W + 200 || y > H + 60) {
        if (it.shown) this.hide(it);
        continue;
      }
      if (relayout) {
        const el = this.ensureEl(it);
        const box: [number, number, number, number] = [x - it.w / 2 - 3, y - it.h - 3, x + it.w / 2 + 3, y + 3];
        const hit = placed.some((p) => box[0] < p[2] && box[2] > p[0] && box[1] < p[3] && box[3] > p[1]);
        if (hit) {
          if (it.shown) this.hide(it);
          continue;
        }
        placed.push(box);
        if (!it.shown) {
          it.shown = true;
          el.classList.add('on');
        }
      }
      if (it.shown && it.el) it.el.style.transform = `translate(${(x - it.w / 2).toFixed(1)}px, ${(y - it.h).toFixed(1)}px)`;
    }
  }

  private hide(it: Live) {
    it.shown = false;
    it.el?.classList.remove('on');
  }
}

/** Cities whose local names are in another script; their map labels carry the local name underneath. */
const LOCAL_SCRIPT = new Set(['tokyo', 'osaka', 'seoul', 'hongkong', 'taipei', 'shanghai', 'beijing', 'guangzhou', 'shenzhen', 'chengdu', 'hangzhou', 'wuhan', 'chongqing', 'moscow', 'cairo', 'delhi']);

export function geoLabelSpecs(labels: GeoLabel[], city: string): LabelSpec[] {
  return labels.map((l, i) => {
    const pos = new THREE.Vector3(l.x, 2, -l.y);
    let minMpp = 2.5;
    let maxMpp = 30;
    let cls = 'geo';
    switch (l.kind) {
      case 'city':
        minMpp = 14;
        maxMpp = l.rank <= 1 ? 400 : 90;
        cls = 'geo city';
        break;
      case 'borough':
        minMpp = 8;
        maxMpp = 90;
        cls = 'geo borough';
        break;
      case 'neighborhood':
        minMpp = 1.6;
        maxMpp = l.rank <= 3 ? 16 : 9;
        cls = 'geo hood';
        break;
      case 'water':
        minMpp = 2;
        maxMpp = l.rank <= 1 ? 140 : l.rank <= 2 ? 45 : l.rank <= 3 ? 18 : 7;
        cls = 'geo water';
        break;
      case 'park':
        minMpp = 0.6;
        maxMpp = 10;
        cls = 'geo park';
        break;
      case 'island':
        minMpp = 3;
        maxMpp = 60;
        cls = 'geo island';
        break;
      case 'airport':
        minMpp = 2;
        maxMpp = 60;
        cls = 'geo airport';
        break;
    }
    return {
      id: `geo${i}`,
      text: l.text,
      sub: LOCAL_SCRIPT.has(city) && l.local && l.local !== l.text ? l.local : undefined,
      pos,
      cls,
      rank: 1000 + l.rank * 10 + i * 0.001,
      minMpp,
      maxMpp,
    };
  });
}
