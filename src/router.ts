import { isReady } from './ready.ts';
import type { CityId } from '../shared/types.ts';

// Shareable URLs. The path names what's selected; the hash (#@lat,lon,span,azimuth) holds the camera.
//   /tokyo                          a city
//   /tokyo/line/JY                  a line, highlighted with all its trains
//   /nyc/line/L/train/<id>          riding along with one train (the line is the fallback when it's gone)
//   /tokyo/station/<id>             a station and its departures
//   /london/stock/london-1972       a kind of train: ride one that's running now

export interface View {
  lat: number;
  lon: number;
  span: number;
  az?: number;
}

export interface Route {
  city: CityId;
  line?: string;
  train?: string;
  station?: string;
  stock?: string;
  view?: View;
}

const isCity = (s: string | undefined): s is CityId => !!s && isReady(s);

function parseView(s: string | undefined): View | undefined {
  if (!s) return undefined;
  const [lat, lon, span, az] = s.split(',').map(Number);
  if (![lat, lon, span].every(Number.isFinite)) return undefined;
  return { lat, lon, span, az: Number.isFinite(az) ? az : undefined };
}

export function parseRoute(loc: { pathname: string; hash: string }): Route | null {
  const parts = loc.pathname
    .split('/')
    .filter(Boolean)
    .map((p) => {
      try {
        return decodeURIComponent(p);
      } catch {
        return p;
      }
    });
  const hash = loc.hash.replace(/^#/, '');
  let city = parts[0];
  let view: View | undefined;
  if (!parts.length && hash) {
    // Legacy links: #nyc/40.7,-73.9,2400,-0.52
    const [hc, hv] = hash.split('/');
    if (isCity(hc)) {
      city = hc;
      view = parseView(hv);
    }
  } else if (hash.startsWith('@')) view = parseView(hash.slice(1));
  if (!isCity(city)) return null;
  const r: Route = { city };
  for (let i = 1; i + 1 < parts.length; i += 2) {
    const [k, v] = [parts[i], parts[i + 1]];
    if (k === 'line') r.line = v;
    else if (k === 'train') r.train = v;
    else if (k === 'station') r.station = v;
    else if (k === 'stock') r.stock = v;
  }
  if (view) r.view = view;
  return r;
}

export function routePath(r: Route): string {
  const e = encodeURIComponent;
  let p = `/${r.city}`;
  if (r.line) p += `/line/${e(r.line)}`;
  if (r.train) p += `/train/${e(r.train)}`;
  if (r.station && !r.line) p += `/station/${e(r.station)}`;
  if (r.stock && !r.line && !r.station) p += `/stock/${e(r.stock)}`;
  return p;
}

export function viewHash(v: View): string {
  return `#@${v.lat.toFixed(4)},${v.lon.toFixed(4)},${Math.round(v.span)}${v.az !== undefined ? `,${v.az.toFixed(2)}` : ''}`;
}

export function sameSelection(a: Route | null, b: Route | null) {
  return !!a && !!b && a.city === b.city && a.line === b.line && a.train === b.train && a.station === b.station && a.stock === b.stock;
}
