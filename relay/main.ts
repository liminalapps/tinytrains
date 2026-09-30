// Plane relay: the ADS-B feeds rate-limit or block Cloudflare's shared network, so the front Worker reads live
// aircraft through this small server (on Fly.io) instead. It serves only the Worker: every request must carry
// the shared RELAY_TOKEN. One upstream poll per city every 8 s, however many visitors are watching.
import { createServer } from 'node:http';
import { CITY_ORDER } from '../shared/cities.ts';
import type { CityId } from '../shared/types.ts';
import { fetchPlanes, fetchRoute, PlaneHistory, type FlightRoute, type PlanesResponse } from '../server/planes.ts';

const TOKEN = process.env.RELAY_TOKEN ?? '';
const PORT = Number(process.env.PORT ?? 8080);
if (!TOKEN) throw new Error('RELAY_TOKEN is not set');

const planes = new Map<CityId, { at: number; body: Promise<PlanesResponse> }>();
const history = new PlaneHistory();
const routes = new Map<string, { at: number; body: Promise<FlightRoute | null> }>();

function cityPlanes(city: CityId) {
  const hit = planes.get(city);
  if (hit && Date.now() - hit.at < 8000) return hit.body;
  const body = fetchPlanes(city).then((r) => history.apply(r));
  planes.set(city, { at: Date.now(), body });
  body.catch(() => planes.delete(city));
  return body;
}

function flightRoute(cs: string) {
  const hit = routes.get(cs);
  if (hit && Date.now() - hit.at < 6 * 3600_000) return hit.body;
  const body = fetchRoute(cs).catch(() => null);
  routes.set(cs, { at: Date.now(), body });
  if (routes.size > 20_000) routes.clear();
  return body;
}

const json = (res: import('node:http').ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
};

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://relay');
  if (url.pathname === '/health') return json(res, 200, { ok: true });
  if (req.headers['x-relay-token'] !== TOKEN) return json(res, 401, { error: 'unauthorized' });
  const pm = url.pathname.match(/^\/planes\/([a-z]+)$/);
  if (pm && (CITY_ORDER as string[]).includes(pm[1])) {
    try {
      return json(res, 200, await cityPlanes(pm[1] as CityId));
    } catch (e) {
      return json(res, 502, { error: String(e) });
    }
  }
  const rm = url.pathname.match(/^\/route\/([A-Z0-9]{2,8})$/);
  if (rm) return json(res, 200, await flightRoute(rm[1]));
  return json(res, 404, { error: 'not found' });
}).listen(PORT, () => console.log(`[relay] listening on :${PORT}`));
