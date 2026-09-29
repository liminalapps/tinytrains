import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { CITY_ORDER } from '../shared/cities.ts';
import type { CityId } from '../shared/types.ts';
import { Hub } from './hub.ts';
import type { Adapter, AdapterEnv, AdapterFactory } from './adapters/types.ts';
import { fetchPlanes, fetchRoute, type FlightRoute, type PlanesResponse } from './planes.ts';

const ROOT = resolve(import.meta.dirname, '..');
if (existsSync(join(ROOT, '.env'))) process.loadEnvFile(join(ROOT, '.env'));

// Every optional key in AdapterEnv comes straight from the environment (empty strings count as unset).
const env: AdapterEnv = Object.fromEntries(Object.entries(process.env).filter(([k, v]) => /^[A-Z0-9_]+$/.test(k) && v)) as AdapterEnv;

async function loadAdapters(): Promise<Adapter[]> {
  const all: Adapter[] = [];
  for (const city of CITY_ORDER) {
    try {
      const mod = (await import(`./adapters/${city}/index.ts`)) as { createAdapters: AdapterFactory };
      const list = mod.createAdapters(env);
      all.push(...list);
      console.log(`[server] ${city}: ${list.map((a) => `${a.id}${a.live ? '' : ' (scheduled)'}`).join(', ')}`);
    } catch (err) {
      console.warn(`[server] ${city}: no adapters (${err instanceof Error ? err.message : err})`);
    }
  }
  return all;
}

// Dev only: TT_SHIFT_HOURS runs every clock this many hours ahead (e.g. to capture a city's daytime
// rush for the share images while it's night there). Timetable cities only; live feeds stay live.
const SHIFT_MS = Number(process.env.TT_SHIFT_HOURS ?? 0) * 3_600_000;
const hub = new Hub(await loadAdapters(), { shiftMs: SHIFT_MS });
const PROD = process.env.NODE_ENV === 'production';
const DIST = join(ROOT, 'dist');
const PORT = Number(process.env.PORT ?? 8787);

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.bin': 'application/octet-stream',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

const staticCache = new Map<string, { raw: Buffer; gz?: Buffer; mtime: number }>();
function staticBody(file: string, gz: boolean): Buffer {
  const mtime = statSync(file).mtimeMs;
  let hit = staticCache.get(file);
  if (!hit || hit.mtime !== mtime) {
    hit = { raw: readFileSync(file), mtime };
    staticCache.set(file, hit);
  }
  if (!gz) return hit.raw;
  hit.gz ??= gzipSync(hit.raw, { level: 9 });
  return hit.gz;
}

createServer((req, res) => {
  handle(req, res).catch((err) => {
    console.warn('[server] request failed:', err);
    if (!res.headersSent) res.writeHead(500);
    res.end();
  });
}).listen(PORT, () => console.log(`[server] listening on http://localhost:${PORT}${PROD ? '' : ' (api only; vite serves the app on :5173)'}`));

const planeCache = new Map<CityId, { at: number; body: PlanesResponse }>();
const routeCache = new Map<string, FlightRoute | null>();

async function handle(req: IncomingMessage, res: ServerResponse) {
  const recv = Date.now();
  const url = new URL(req.url ?? '/', 'http://localhost');
  const m = url.pathname.match(/^\/api\/([a-z]+)\/trains$/);
  if (m && !(CITY_ORDER as string[]).includes(m[1])) {
    res.writeHead(404);
    res.end('unknown city');
    return;
  }
  if (m) {
    try {
      const snap = await hub.snapshot(m[1] as CityId);
      // recv lets the client compute its clock offset NTP-style, excluding our wait for a first poll.
      const body = JSON.stringify({ ...snap, recv: recv + SHIFT_MS, now: Date.now() + SHIFT_MS });
      const gz = (req.headers['accept-encoding'] ?? '').includes('gzip');
      res.writeHead(200, {
        'content-type': 'application/json',
        'cache-control': 'no-store',
        'access-control-allow-origin': '*',
        ...(gz ? { 'content-encoding': 'gzip' } : {}),
      });
      res.end(gz ? gzipSync(body) : body);
    } catch (err) {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: String(err) }));
    }
    return;
  }
  const pm = url.pathname.match(/^\/api\/([a-z]+)\/planes$/);
  if (pm && (CITY_ORDER as string[]).includes(pm[1])) {
    const city = pm[1] as CityId;
    const hit = planeCache.get(city);
    let body: PlanesResponse | { error: string };
    if (hit && Date.now() - hit.at < 8000) body = hit.body;
    else {
      try {
        body = await fetchPlanes(city);
        planeCache.set(city, { at: Date.now(), body });
      } catch (err) {
        body = { error: String(err) };
      }
    }
    res.writeHead('error' in body ? 502 : 200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify(body));
    return;
  }
  const rm = url.pathname.match(/^\/api\/route\/([A-Z0-9]{2,8})$/);
  if (rm) {
    let r = routeCache.get(rm[1]);
    if (r === undefined) {
      r = await fetchRoute(rm[1]).catch(() => null);
      routeCache.set(rm[1], r);
    }
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify(r));
    return;
  }
  if (url.pathname === '/api/summary') {
    const out: Record<string, { trains: number; live: number }> = {};
    await Promise.all(
      CITY_ORDER.map(async (c) => {
        const snap = await hub.snapshot(c);
        out[c] = { trains: snap.trains.length, live: snap.trains.filter((t) => t.live).length };
      }),
    );
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify(out));
    return;
  }
  if (url.pathname === '/api/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, keys: Object.fromEntries(Object.entries(env).map(([k, v]) => [k, !!v])) }));
    return;
  }
  if (PROD) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(url.pathname);
    } catch {
      res.writeHead(400);
      res.end('bad request');
      return;
    }
    const path = normalize(decoded).replace(/^(\.\.[/\\])+/, '');
    let file = join(DIST, path);
    if (!file.startsWith(DIST) || !existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html');
    const type = MIME[extname(file)] ?? 'application/octet-stream';
    const wantGz = (req.headers['accept-encoding'] ?? '').includes('gzip') && /json|javascript|css|html|svg|octet/.test(type);
    const body = staticBody(file, wantGz);
    res.writeHead(200, {
      'content-type': type,
      'cache-control': file.includes('/assets/') ? 'public, max-age=31536000, immutable' : file.includes('/data/') ? 'public, max-age=3600' : 'no-cache',
      ...(wantGz ? { 'content-encoding': 'gzip' } : {}),
    });
    res.end(body);
    return;
  }
  res.writeHead(404);
  res.end('not found');
}
