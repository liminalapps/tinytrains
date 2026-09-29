// Front Worker for tinytrains.app: static site from assets, /api/<city>/trains from each city's Worker,
// and per-URL OpenGraph tags so deep links unfurl nicely.
import { CITIES, CITY_ORDER } from '../shared/cities.ts';
import { STOCK } from '../shared/stock/index.ts';
import type { CityId, TransitData } from '../shared/types.ts';
import { fetchPlanes, fetchRoute } from '../server/planes.ts';

interface Env {
  ASSETS: Fetcher;
  [binding: string]: Fetcher;
}

/** Every visitor in a Cloudflare location shares one snapshot per city for this long. */
const EDGE_CACHE_S = 4;
const SITE = 'https://tinytrains.app';

const isCity = (s: string): s is CityId => (CITY_ORDER as string[]).includes(s);
const binding = (city: CityId) => city.toUpperCase();

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (url.hostname === 'www.tinytrains.app') return Response.redirect(`${SITE}${url.pathname}${url.search}`, 301);
    const m = url.pathname.match(/^\/api\/([a-z]+)\/trains$/);
    if (m && isCity(m[1])) return trains(m[1], url, env, ctx);
    const pm = url.pathname.match(/^\/api\/([a-z]+)\/planes$/);
    if (pm && isCity(pm[1])) return planes(pm[1], url, ctx);
    const rm = url.pathname.match(/^\/api\/route\/([A-Z0-9]{2,8})$/);
    if (rm) return route(rm[1], url, ctx);
    if (url.pathname === '/api/summary') return summary(url, env, ctx);
    if (url.pathname === '/api/health') return Response.json({ ok: true });
    if (url.pathname.startsWith('/api/')) return new Response('not found', { status: 404 });
    return page(req, url, env);
  },
} satisfies ExportedHandler<Env>;

async function cityTrains(city: CityId, url: URL, env: Env, ctx: ExecutionContext): Promise<Response> {
  const cache = caches.default;
  const key = new Request(`${url.origin}/__cache/trains/${city}`);
  let res = await cache.match(key);
  if (!res) {
    const svc = env[binding(city)] as Fetcher | undefined;
    if (!svc) return new Response(JSON.stringify({ error: `${city} is not deployed yet` }), { status: 503, headers: { 'content-type': 'application/json' } });
    const up = await svc.fetch('https://city.internal/trains');
    if (!up.ok) return new Response(await up.text(), { status: 502 });
    res = new Response(await up.text(), {
      headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${EDGE_CACHE_S}` },
    });
    ctx.waitUntil(cache.put(key, res.clone()));
  }
  return res;
}

async function trains(city: CityId, url: URL, env: Env, ctx: ExecutionContext): Promise<Response> {
  const recv = Date.now();
  const res = await cityTrains(city, url, env, ctx);
  // The body may be a few seconds old; x-recv / x-now let the client sync its clock regardless.
  const out = new Response(res.body, res);
  out.headers.set('cache-control', 'no-store');
  out.headers.set('x-recv', String(recv));
  out.headers.set('x-now', String(Date.now()));
  return out;
}

/** Live aircraft over a city: one upstream poll per Cloudflare location every 8 s, shared by all visitors. */
async function planes(city: CityId, url: URL, ctx: ExecutionContext): Promise<Response> {
  const cache = caches.default;
  const key = new Request(`${url.origin}/__cache/planes/${city}`);
  const hit = await cache.match(key);
  if (hit) return hit;
  try {
    const body = await fetchPlanes(city);
    const res = Response.json(body, { headers: { 'cache-control': 'public, max-age=8' } });
    ctx.waitUntil(cache.put(key, res.clone()));
    return res;
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 502, headers: { 'cache-control': 'no-store' } });
  }
}

/** Airline and origin/destination for a callsign (changes rarely: cache for 6 hours). */
async function route(callsign: string, url: URL, ctx: ExecutionContext): Promise<Response> {
  const cache = caches.default;
  const key = new Request(`${url.origin}/__cache/route/${callsign}`);
  const hit = await cache.match(key);
  if (hit) return hit;
  const body = await fetchRoute(callsign).catch(() => null);
  const res = Response.json(body, { headers: { 'cache-control': `public, max-age=${body ? 21600 : 1800}` } });
  ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}

/** Live train counts for every city (the city picker). */
async function summary(url: URL, env: Env, ctx: ExecutionContext): Promise<Response> {
  const cache = caches.default;
  const key = new Request(`${url.origin}/__cache/summary`);
  const hit = await cache.match(key);
  if (hit) return hit;
  const out: Record<string, { trains: number; live: number }> = {};
  await Promise.all(
    CITY_ORDER.map(async (city) => {
      try {
        const res = await cityTrains(city, url, env, ctx);
        const j = (await res.json()) as { trains: { live: boolean }[] };
        out[city] = { trains: j.trains.length, live: j.trains.filter((t) => t.live).length };
      } catch {
        out[city] = { trains: 0, live: 0 };
      }
    }),
  );
  const res = Response.json(out, { headers: { 'cache-control': 'public, max-age=20' } });
  ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}

// ---------------------------------------------------------------------------
// Pages: the SPA shell with OpenGraph tags for whatever the URL points at.
// ---------------------------------------------------------------------------
const transitCache = new Map<CityId, Promise<TransitData | null>>();
function transit(city: CityId, url: URL, env: Env) {
  let p = transitCache.get(city);
  if (!p) {
    p = env.ASSETS.fetch(new Request(new URL(`/data/${city}/transit.json`, url)))
      .then((r) => (r.ok ? (r.json() as Promise<TransitData>) : null))
      .catch(() => null);
    transitCache.set(city, p);
  }
  return p;
}

async function page(req: Request, url: URL, env: Env): Promise<Response> {
  const shell = await env.ASSETS.fetch(new Request(new URL('/', url), req));
  const parts = url.pathname.split('/').filter(Boolean).map((p) => {
    try {
      return decodeURIComponent(p);
    } catch {
      return p;
    }
  });
  const city = parts[0];
  if (!city || !isCity(city)) return shell;
  const cfg = CITIES[city];
  const kv: Record<string, string> = {};
  for (let i = 1; i + 1 < parts.length; i += 2) kv[parts[i]] = parts[i + 1];
  const data = await transit(city, url, env);
  const line = kv.line ? data?.lines.find((l) => l.id === kv.line) : undefined;
  const station = kv.station ? data?.stations.find((s) => s.id === kv.station) : undefined;
  const stock = kv.stock ? STOCK[kv.stock] : undefined;
  const lineName = line ? line.name.replace(/ line$/i, '') : '';
  let title = `Every train in ${cfg.name}, live · Tiny Trains`;
  let desc = `Watch every ${cfg.tagline} train in ${cfg.name} move in real time on a tiny isometric toy map. Tap any train to ride along.`;
  if (line && kv.train) {
    title = `Ride the ${lineName} live · Tiny Trains`;
    desc = `Follow this ${lineName} train through ${cfg.name} in real time, with its next stops and the train itself in 3D.`;
  } else if (line) {
    title = `Every ${lineName} train, live · Tiny Trains`;
    desc = `See every ${lineName} train in ${cfg.name} right now, where it is and where it's heading.`;
  } else if (station) {
    title = `${station.name} · live departures · Tiny Trains`;
    desc = `The next trains at ${station.name}, ${cfg.name}, and every one of them moving on the map in real time.`;
  } else if (stock) {
    title = `${stock.name} · Tiny Trains`;
    desc = `${stock.blurb || `A ${stock.name} in ${cfg.name}.`} Find one running right now.`;
  }
  const canonical = `${SITE}${url.pathname}`;
  const image = `${SITE}/og/${city}.png`;
  const set = (_sel: string, attr: string, value: string): HTMLRewriterElementContentHandlers => ({
    element: (el) => {
      el.setAttribute(attr, value);
    },
  });
  const res = new HTMLRewriter()
    .on('title', {
      element: (el) => {
        el.setInnerContent(title);
      },
    })
    .on('meta[name="description"]', set('', 'content', desc))
    .on('meta[property="og:title"]', set('', 'content', title))
    .on('meta[property="og:description"]', set('', 'content', desc))
    .on('meta[property="og:url"]', set('', 'content', canonical))
    .on('meta[property="og:image"]', set('', 'content', image))
    .on('meta[name="twitter:title"]', set('', 'content', title))
    .on('meta[name="twitter:description"]', set('', 'content', desc))
    .on('meta[name="twitter:image"]', set('', 'content', image))
    .on('link[rel="canonical"]', set('', 'href', canonical))
    .transform(shell);
  const out = new Response(res.body, res);
  out.headers.set('cache-control', 'public, max-age=0, must-revalidate');
  return out;
}
