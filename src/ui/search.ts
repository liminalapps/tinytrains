import { CITIES } from '../../shared/cities.ts';
import { READY } from '../ready.ts';
import type { CityId, LineDef } from '../../shared/types.ts';
import type { App } from '../app.ts';

// A quick finder for stations, lines, kinds of train and cities (press / or ⌘K).

export interface Hit {
  kind: 'station' | 'line' | 'stock' | 'city';
  label: string;
  sub: string;
  keys: string[]; // normalized search strings
  weight?: number; // importance bonus (busy interchanges first)
  badge: string; // html
  run: () => void;
}

const norm = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

export function buildIndex(app: App, bullet: (l: LineDef, city: CityId, size?: number) => string, esc: (s: unknown) => string): Hit[] {
  const c = app.city;
  const hits: Hit[] = [];
  if (c?.network && c.transit) {
    for (const l of c.transit.lines) {
      hits.push({
        kind: 'line',
        label: l.name,
        sub: `Line · ${c.transit.systems.find((s) => s.id === l.system)?.name ?? ''}`,
        keys: [norm(l.name), norm(l.short), norm(l.nameLocal ?? ''), norm(`${l.short} line`), norm(`${l.short} train`)].filter(Boolean),
        badge: bullet(l, c.id, 26),
        run: () => app.focusLine(l.id),
      });
    }
    const seen = new Map<string, Hit>();
    for (const s of c.network.stations.values()) {
      const key = norm(s.name);
      const prev = seen.get(key);
      if (prev) {
        prev.weight = (prev.weight ?? 0) + s.lines.length * 2;
        continue;
      }
      const lines = s.lines.map((id) => c.network!.lines.get(id)).filter(Boolean) as LineDef[];
      const h: Hit = {
        kind: 'station',
        label: s.name,
        sub: s.nameLocal && s.nameLocal !== s.name ? s.nameLocal : 'Station',
        keys: [key, norm(s.nameLocal ?? '')].filter(Boolean),
        weight: 0,
        badge: `<span class="sr-dots">${lines
          .slice(0, 5)
          .map((l) => `<i style="background:${esc(l.color)}"></i>`)
          .join('')}</span>`,
        run: () => app.ui.openStation(s.id, true),
      };
      h.weight = s.lines.length * 2;
      seen.set(key, h);
      hits.push(h);
    }
    const running = new Map<string, { name: string; maker: string; n: number }>();
    for (const t of c.trains?.trains.values() ?? []) {
      if (t.dying !== null) continue;
      const r = running.get(t.spec.id);
      if (r) r.n++;
      else running.set(t.spec.id, { name: t.spec.name, maker: t.spec.maker, n: 1 });
    }
    for (const [id, r] of running) {
      hits.push({
        kind: 'stock',
        label: r.name,
        sub: `${r.maker} · ${r.n} running now`,
        keys: [norm(r.name), norm(r.maker), norm(id.replace(/^[a-z]+-/, ''))],
        badge: '<span class="sr-kind">🚆</span>',
        run: () => void app.go({ city: c.id, stock: id }),
      });
    }
  }
  for (const id of READY) {
    const cfg = CITIES[id];
    hits.push({
      kind: 'city',
      label: cfg.name,
      sub: cfg.tagline,
      keys: [norm(cfg.name), norm(cfg.nameLocal ?? ''), id].filter(Boolean),
      badge: '<span class="sr-kind">🌍</span>',
      run: () => void app.go({ city: id }),
    });
  }
  return hits;
}

export function search(index: Hit[], q: string, limit = 12): Hit[] {
  const nq = norm(q);
  if (!nq) return [];
  const words = nq.split(' ');
  const scored: [number, Hit][] = [];
  for (const h of index) {
    let best = 0;
    for (const k of h.keys) {
      if (!k) continue;
      let sc = 0;
      if (k === nq) sc = 100;
      else if (k.startsWith(nq)) sc = 80 - Math.min(8, (k.length - nq.length) / 2);
      else if (k.split(' ').some((w) => w.startsWith(nq))) sc = 60;
      else if (words.every((w) => k.includes(w))) sc = 40;
      else if (k.includes(nq)) sc = 30;
      best = Math.max(best, sc);
    }
    if (best) scored.push([best + Math.min(16, h.weight ?? 0) + (h.kind === 'line' ? 6 : h.kind === 'city' ? 3 : h.kind === 'station' ? 2 : 0), h]);
  }
  scored.sort((a, b) => b[0] - a[0] || a[1].label.localeCompare(b[1].label));
  return scored.slice(0, limit).map((x) => x[1]);
}
