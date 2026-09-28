// Dev tool: load a city once and screenshot several camera views (for checking landmarks, framing, etc.).
// usage: npx tsx scripts/dev/views.ts <city> <outPrefix> "lon,lat,span[,azimuth]" ... [--w 900] [--h 640] [--night]
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { makeProjection } from '../../shared/geo.ts';
import type { CityId } from '../../shared/types.ts';

const args = process.argv.slice(2);
const opt = (name: string, def: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const flags = new Set(['--w', '--h', '--base', '--theme']);
const pos = args.filter((a, i) => !a.startsWith('--') && !flags.has(args[i - 1]));
const [city, prefix, ...views] = pos as [CityId, string, ...string[]];
const W = Number(opt('w', '900'));
const H = Number(opt('h', '640'));
const BASE = opt('base', 'http://[::1]:5173'); // IPv6: another local app can hold 127.0.0.1:5173
const PORT = 9333;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

async function up() {
  try {
    return (await fetch(`http://127.0.0.1:${PORT}/json/version`)).ok;
  } catch {
    return false;
  }
}
if (!(await up())) {
  mkdirSync('.cache/chrome-profile', { recursive: true });
  spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, '--user-data-dir=.cache/chrome-profile', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal', '--no-first-run', '--hide-scrollbars', 'about:blank'], {
    detached: true,
    stdio: 'ignore',
  }).unref();
  for (let i = 0; i < 50 && !(await up()); i++) await new Promise((r) => setTimeout(r, 200));
}

const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0;
const pending = new Map<number, (v: any) => void>();
ws.addEventListener('message', (e) => {
  const m = JSON.parse(String(e.data));
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)!(m);
    pending.delete(m.id);
  }
});
const send = (method: string, params: object = {}) =>
  new Promise<any>((r) => {
    const i = ++id;
    pending.set(i, r);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const js = (expression: string) => send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });

await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
const theme = opt('theme', 'toy');
await send('Page.navigate', { url: `${BASE}/${city}?og&theme=${theme}` });
await sleep(12000);
// Toy follows the real sky, so pin it to day (or --night) for repeatable shots; other themes set their own sky.
const sky = args.includes('--night') ? "'night'" : theme === 'toy' ? "'day'" : 'app.world.atmosphere.forced';
await js(`document.querySelector('.og-card')?.remove(); app.world.atmosphere.forced=${sky}; 1`);
const { project } = makeProjection(city);
for (let i = 0; i < views.length; i++) {
  const [lon, lat, span, az] = views[i].split(',').map(Number);
  const [x, y] = project(lon, lat);
  await js(`(() => { const r = app.world.rig; r.pose = { x: ${x}, z: ${-y}, span: ${span}, azimuth: ${Number.isFinite(az) ? az : 'r.azimuth'}, elevation: r.elevation }; return 1; })()`);
  await sleep(2500);
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  const out = `${prefix}-${i}.png`;
  writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
  console.log('saved', out, views[i]);
}
await fetch(`http://127.0.0.1:${PORT}/json/close/${target.id}`);
ws.close();
