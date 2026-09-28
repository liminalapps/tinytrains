// Dev tool: a contact sheet of art styles × zoom levels for one city, as a single PNG.
// usage: npx tsx scripts/dev/contact.ts <city> <out.png> [--themes toy,neon,...] [--views "lon,lat,span;..."]
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { CITIES } from '../../shared/cities.ts';
import type { CityId } from '../../shared/types.ts';

const ROOT = resolve(import.meta.dirname, '..', '..');
const args = process.argv.slice(2);
const opt = (n: string, d: string) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const [city, out] = args as [CityId, string];
const themes = opt('themes', 'toy,clay,blueprint,neon,pixel,voxel').split(',');
const [lon, lat] = CITIES[city].view.center;
const views = opt('views', `${lon},${lat},450;${lon},${lat},2600;${lon},${lat},14000`).split(';');
const tmp = join(ROOT, '.cache', 'contact');
mkdirSync(tmp, { recursive: true });
const tsx = join(ROOT, 'node_modules', '.bin', 'tsx');
for (const t of themes) {
  execFileSync(tsx, [join(ROOT, 'scripts/dev/views.ts'), city, join(tmp, `${city}-${t}`), ...views, '--w', '640', '--h', '400', '--theme', t], { stdio: 'ignore' });
}
const img = (f: string) => `data:image/png;base64,${readFileSync(f).toString('base64')}`;
const html = `<!doctype html><style>body{margin:0;background:#222;font:600 14px system-ui;color:#fff}table{border-spacing:4px}td{padding:0}img{width:640px;height:400px;display:block}th{text-align:left;padding:2px 6px}</style>
<table><tr><th></th>${views.map((v) => `<th>span ${v.split(',')[2]} m</th>`).join('')}</tr>${themes
  .map((t) => `<tr><th>${t}</th>${views.map((_, i) => `<td><img src="${img(join(tmp, `${city}-${t}-${i}.png`))}"></td>`).join('')}</tr>`)
  .join('')}</table>`;
writeFileSync(join(tmp, 'sheet.html'), html);
execFileSync(tsx, [join(ROOT, 'scripts/dev/shot.ts'), `file://${join(tmp, 'sheet.html')}`, out, '--w', String(80 + views.length * 648), '--h', String(30 + themes.length * 408), '--wait', '1500'], { stdio: 'ignore' });
console.log('saved', out);
