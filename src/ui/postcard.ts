import { CITIES } from '../../shared/cities.ts';
import type { App } from '../app.ts';

/** Snapshot the map as a little postcard PNG: sky backdrop, the scene, a stamp and a caption. */
export async function makePostcard(app: App): Promise<Blob | null> {
  const c = app.city;
  if (!c) return null;
  const world = app.world;
  // Grab the frame right after a render so the drawing buffer is intact.
  const shot = await new Promise<HTMLCanvasElement>((resolve) => {
    requestAnimationFrame(() => {
      world.draw();
      const src = world.renderer.domElement;
      const copy = document.createElement('canvas');
      copy.width = src.width;
      copy.height = src.height;
      copy.getContext('2d')!.drawImage(src, 0, 0);
      resolve(copy);
    });
  });
  const W = 1600;
  const H = Math.round((W * shot.height) / shot.width);
  const pad = 36;
  const out = document.createElement('canvas');
  out.width = W + pad * 2;
  out.height = H + pad * 2 + 92;
  const g = out.getContext('2d')!;
  // Card.
  g.fillStyle = '#fffdf6';
  g.fillRect(0, 0, out.width, out.height);
  // Sky: the live CSS gradient's colors, re-drawn.
  const sky = getComputedStyle(document.getElementById('sky')!).backgroundImage;
  const cols = sky.match(/rgba?\([^)]+\)/g) ?? ['#78c6f4', '#dff4ff'];
  const grad = g.createLinearGradient(0, pad, 0, pad + H);
  grad.addColorStop(0, cols[0]);
  grad.addColorStop(1, cols[cols.length - 1]);
  g.save();
  g.beginPath();
  g.roundRect(pad, pad, W, H, 18);
  g.clip();
  g.fillStyle = grad;
  g.fillRect(pad, pad, W, H);
  g.drawImage(shot, pad, pad, W, H);
  g.restore();
  // Stamp.
  const sx = pad + W - 176;
  const sy = pad + 22;
  g.save();
  g.translate(sx + 77, sy + 92);
  g.rotate(0.06);
  g.fillStyle = '#ffffff';
  g.shadowColor = 'rgba(0,0,0,0.18)';
  g.shadowBlur = 12;
  g.fillRect(-77, -92, 154, 184);
  g.shadowBlur = 0;
  g.strokeStyle = '#ff5a5f';
  g.setLineDash([6, 5]);
  g.lineWidth = 3;
  g.strokeRect(-68, -83, 136, 166);
  g.setLineDash([]);
  g.fillStyle = '#ff5a5f';
  g.textAlign = 'center';
  const title = CITIES[c.id].nameLocal ?? CITIES[c.id].name.toUpperCase();
  let fs = 22;
  do g.font = `600 ${fs}px Fredoka, sans-serif`;
  while (g.measureText(title).width > 124 && --fs > 10);
  g.fillText(title, 0, -40);
  g.font = '700 44px Fredoka, sans-serif';
  g.fillStyle = '#22324a';
  const n = c.trains?.count() ?? 0;
  g.fillText(String(n), 0, 18);
  g.font = '700 14px Nunito, sans-serif';
  g.fillStyle = '#6b7a90';
  g.fillText('TRAINS LIVE', 0, 42);
  g.font = '600 16px Fredoka, sans-serif';
  g.fillStyle = '#22324a';
  g.fillText(new Intl.DateTimeFormat('en-US', { timeZone: CITIES[c.id].tz, hour: 'numeric', minute: '2-digit' }).format(Date.now()), 0, 70);
  g.restore();
  // Caption.
  g.textAlign = 'left';
  g.fillStyle = '#ff5a5f';
  g.font = '700 38px Fredoka, sans-serif';
  g.fillText('Tiny Trains', pad + 4, pad + H + 60);
  g.fillStyle = '#22324a';
  g.font = '600 24px Fredoka, sans-serif';
  const when = new Intl.DateTimeFormat('en-US', { timeZone: CITIES[c.id].tz, weekday: 'long', hour: 'numeric', minute: '2-digit' }).format(Date.now());
  g.fillText(`Greetings from ${CITIES[c.id].name}! · ${when}`, pad + 240, pad + H + 58);
  return await new Promise((resolve) => out.toBlob((b) => resolve(b), 'image/png'));
}
