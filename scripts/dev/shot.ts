// Dev tool: screenshot a page in headless Chrome via the DevTools protocol.
// usage: npx tsx scripts/dev/shot.ts <url> <out.png> [--w 1440] [--h 900] [--wait 4000] [--eval "js"] [--console]
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (name: string, def: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const url = args[0];
const out = args[1];
const W = Number(opt('w', '1440'));
const H = Number(opt('h', '900'));
const wait = Number(opt('wait', '4000'));
const evalJs = opt('eval', '');
const evalAfter = opt('after', '');
const PORT = 9333;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

async function up() {
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
    return r.ok;
  } catch {
    return false;
  }
}

if (!(await up())) {
  mkdirSync('.cache/chrome-profile', { recursive: true });
  const p = spawn(
    CHROME,
    [
      '--headless=new',
      `--remote-debugging-port=${PORT}`,
      '--user-data-dir=.cache/chrome-profile',
      '--enable-gpu',
      '--ignore-gpu-blocklist',
      '--use-angle=metal',
      '--no-first-run',
      '--hide-scrollbars',
      'about:blank',
    ],
    { detached: true, stdio: 'ignore' },
  );
  p.unref();
  for (let i = 0; i < 50 && !(await up()); i++) await new Promise((r) => setTimeout(r, 200));
}

const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0;
const pending = new Map<number, (v: any) => void>();
const logs: string[] = [];
ws.addEventListener('message', (e) => {
  const m = JSON.parse(String(e.data));
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)!(m);
    pending.delete(m.id);
  } else if (m.method === 'Runtime.consoleAPICalled') {
    logs.push(`[${m.params.type}] ${m.params.args.map((a: any) => a.value ?? a.description ?? '').join(' ')}`);
  } else if (m.method === 'Runtime.exceptionThrown') {
    logs.push(`[exception] ${m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text}`);
  }
});
const send = (method: string, params: object = {}) =>
  new Promise<any>((r) => {
    const i = ++id;
    pending.set(i, r);
    ws.send(JSON.stringify({ id: i, method, params }));
  });

await send('Runtime.enable');
await send('Page.enable');
const MOBILE = args.includes('--mobile');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: MOBILE ? 3 : 1, mobile: MOBILE });
if (MOBILE) {
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await send('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
  await send('Emulation.setEmitTouchEventsForMouse', { enabled: true, configuration: 'mobile' });
}
await send('Page.navigate', { url });
await new Promise((r) => setTimeout(r, wait));
if (evalJs) {
  const res = await send('Runtime.evaluate', { expression: evalJs, awaitPromise: true, returnByValue: true });
  console.log('eval:', JSON.stringify(res.result?.result?.value ?? res.result?.exceptionDetails?.exception?.description));
  await new Promise((r) => setTimeout(r, Number(opt('wait2', '1500'))));
}
if (evalAfter) {
  const res = await send('Runtime.evaluate', { expression: evalAfter, awaitPromise: true, returnByValue: true });
  console.log('after:', JSON.stringify(res.result?.result?.value ?? res.result?.exceptionDetails?.exception?.description));
  await new Promise((r) => setTimeout(r, Number(opt('wait3', '1200'))));
}
const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
// --then "js" --out2 b.png: run more JS on the same page and take a second shot (saves a reload).
const out2 = opt('out2', '');
if (out2) {
  await send('Runtime.evaluate', { expression: opt('then', '1'), awaitPromise: true, returnByValue: true });
  await new Promise((r) => setTimeout(r, 400));
  const shot2 = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(out2, Buffer.from(shot2.result.data, 'base64'));
  console.log('saved', out2);
}
if (args.includes('--console')) console.log(logs.slice(-40).join('\n'));
await fetch(`http://127.0.0.1:${PORT}/json/close/${target.id}`);
ws.close();
console.log('saved', out);
