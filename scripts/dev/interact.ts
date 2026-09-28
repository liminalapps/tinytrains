// Dev test: drive the page with REAL browser input events (CDP Input.*), not JS calls.
// usage: tsx scripts/dev/interact.ts <url> <out.png>
import { writeFileSync } from 'node:fs';

const [url, out] = process.argv.slice(2);
const PORT = 9333;
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
const js = async (expr: string) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const mouse = (type: string, x: number, y: number, extra: object = {}) =>
  send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, pointerType: 'mouse', ...extra });

await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url });
await sleep(13000);
const pose = () => js(`JSON.stringify((({x,z,span,azimuth})=>({x:Math.round(x),z:Math.round(z),span:Math.round(span),az:+azimuth.toFixed(2)}))(window.app.world.rig.pose))`);
const results: Record<string, unknown> = {};
results.top = await js(`(()=>{const e=document.elementFromPoint(720,450); return e.tagName+'.'+e.className})()`);
results.start = await pose();

// Drag to pan.
await mouse('mouseMoved', 700, 450, { button: 'none' });
await mouse('mousePressed', 700, 450);
for (let i = 1; i <= 10; i++) await mouse('mouseMoved', 700 + i * 25, 450 + i * 10);
await mouse('mouseReleased', 950, 550);
await sleep(600);
results.afterDrag = await pose();

// Wheel to zoom in.
await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 720, y: 450, deltaX: 0, deltaY: -600 });
await sleep(400);
results.afterWheel = await pose();

// Right-drag to rotate.
await mouse('mousePressed', 720, 450, { button: 'right' });
for (let i = 1; i <= 6; i++) await mouse('mouseMoved', 720 + i * 20, 450, { button: 'right', buttons: 2 });
await mouse('mouseReleased', 840, 450, { button: 'right' });
await sleep(900);
results.afterRotate = await pose();

// Click a train at its projected screen position.
const tp = await js(`(()=>{const T=window.app.city.trains; const v=[...T.trains.values()].filter(t=>t.dying===null&&t.centers[0]).map(t=>({t,s:window.app.world.rig.toScreen(t.centers[0])})).find(o=>o.s.x>380&&o.s.x<1000&&o.s.y>150&&o.s.y<780); return v?JSON.stringify({x:v.s.x,y:v.s.y,id:v.t.id}):null})()`);
if (tp) {
  const { x, y } = JSON.parse(tp);
  await mouse('mouseMoved', x, y, { button: 'none' });
  await mouse('mousePressed', x, y);
  await mouse('mouseReleased', x, y);
  await sleep(1200);
  results.clickedTrain = JSON.parse(tp).id;
  results.cardOpen = await js(`!document.querySelector('.train-card').hidden`);
} else results.clickedTrain = 'no train on screen';

// Open the city picker with the header switch, then click London's ticket, all with real clicks.
const click = async (sel: string) => {
  const r = await js(`(()=>{const e=document.querySelector(${JSON.stringify(sel)}); if(!e) return null; const r=e.getBoundingClientRect(); return JSON.stringify({x:r.x+r.width/2,y:r.y+r.height/2})})()`);
  if (!r) return false;
  const { x, y } = JSON.parse(r);
  await mouse('mouseMoved', x, y, { button: 'none' });
  await mouse('mousePressed', x, y);
  await mouse('mouseReleased', x, y);
  return true;
};
if (results.cardOpen) {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await sleep(500);
}
results.pickerButton = await click('.city-switch');
await sleep(700);
results.pickerOpen = await js(`!document.querySelector('.picker').hidden`);
results.ticket = await click('.picker [data-city=london]');
await sleep(9000);
results.cityAfterTicket = await js(`window.app.city?.id`);
results.path = await js(`location.pathname`);
results.londonPose = await pose();
const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
console.log(JSON.stringify(results, null, 1));
await fetch(`http://127.0.0.1:${PORT}/json/close/${target.id}`);
ws.close();
