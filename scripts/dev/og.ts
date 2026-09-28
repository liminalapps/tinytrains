// Dev tool: capture the OpenGraph share images. Needs the dev server (`npm run dev`) running.
//   public/og/<city>.png   the poster for each city (the ?og card over a close-up of the diorama)
//   public/og/default.png  a postcard mosaic of every city, for the home page
// usage: npx tsx scripts/dev/og.ts [city ...]   (no cities: all of them, then the mosaic)
//        npx tsx scripts/dev/og.ts --mosaic     (just rebuild the mosaic from the last captures)
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { CITIES, CITY_ORDER } from '../../shared/cities.ts';
import type { CityId } from '../../shared/types.ts';

const ROOT = resolve(import.meta.dirname, '..', '..');
const CACHE = join(ROOT, '.cache', 'og');
const BASE = process.env.OG_BASE ?? 'http://localhost:5173';
const tsx = join(ROOT, 'node_modules', '.bin', 'tsx');

// Close enough to see buildings and trains, framed so the card (bottom left) covers little of interest.
const VIEWS: Partial<Record<CityId, string>> = {
  nyc: '40.7160,-74.0010,1300',
  sf: '37.7905,-122.4000,1400',
  london: '51.5085,-0.0950,1400',
  paris: '48.8612,2.2880,1350',
  berlin: '52.5190,13.3950,1500',
  madrid: '40.4190,-3.6960,1400',
  tokyo: '35.6790,139.7640,1500',
  seoul: '37.5610,126.9800,1500',
  hongkong: '22.2818,114.1605,1250',
  moscow: '55.7525,37.6205,1400',
  singapore: '1.2850,103.8570,1500',
  vienna: '48.2080,16.3715,1300',
  mexicocity: '19.4335,-99.1395,1300',
  chongqing: '29.5625,106.5800,1500',
  washington: '38.8895,-77.0230,1600',
  chengdu: '30.6575,104.0700,1400',
  delhi: '28.6315,77.2195,1500',
  boston: '42.3560,-71.0600,1400',
  chicago: '41.8830,-87.6300,1400',
  saopaulo: '-23.5480,-46.6360,1400',
  cairo: '30.0445,31.2360,1500',
  stockholm: '59.3270,18.0640,1400',
  taipei: '25.0400,121.5400,1700',
  osaka: '34.6865,135.5160,1500',
  shanghai: '31.2380,121.4950,1700',
  beijing: '39.9060,116.3960,1800',
  wuhan: '30.5480,114.2930,1600',
  hangzhou: '30.2560,120.1700,1800',  sydney: '-33.8620,151.2100,1500',
  budapest: '47.5020,19.0450,1500', milan: '45.4650,9.1900,1400', rome: '41.8960,12.4850,1600', philadelphia: '39.9530,-75.1600,1600',
  guangzhou: '23.1120,113.3230,1700',
  shenzhen: '22.5400,114.0550,1700',  oslo: '59.9110,10.7450,1400',
  helsinki: '60.1700,24.9450,1400',
};

mkdirSync(CACHE, { recursive: true });
const args = process.argv.slice(2);
const mosaicOnly = args.includes('--mosaic');
const only = args.filter((a) => !a.startsWith('--')) as CityId[];
const cities = mosaicOnly ? [] : only.length ? only : CITY_ORDER;

for (const city of cities) {
  const out = join(ROOT, 'public', 'og', `${city}.png`);
  execFileSync(
    tsx,
    [
      join(ROOT, 'scripts', 'dev', 'shot.ts'),
      `${BASE}/${city}?og&theme=toy#@${VIEWS[city] ?? `${CITIES[city].view.center[1]},${CITIES[city].view.center[0]},1400`}`,
      out,
      '--w', '1200',
      '--h', '630',
      '--wait', '15000',
      '--eval', "app.world.atmosphere.forced='day'; 1",
      '--wait2', '2500',
      '--then', "document.querySelector('.og-card')?.remove(); 1",
      '--out2', join(CACHE, `${city}.png`),
    ],
    { stdio: 'inherit' },
  );
}

if (only.length && !mosaicOnly) process.exit(0);

// The mosaic: every city as a postcard, in a row above and a row below the title band.
const have = CITY_ORDER.filter((c) => existsSync(join(CACHE, `${c}.png`)));
const split = Math.ceil(have.length / 2);
const img = (c: CityId) => `data:image/png;base64,${readFileSync(join(CACHE, `${c}.png`)).toString('base64')}`;
const tile = (c: CityId) =>
  `<div class="tile" style="background-image:url(${img(c)})"><span>${CITIES[c].name}${CITIES[c].nameLocal ? `<small>${CITIES[c].nameLocal}</small>` : ''}</span></div>`;
const html = `<!doctype html><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&family=Nunito:wght@700;800&family=M+PLUS+Rounded+1c:wght@700&display=swap" rel="stylesheet">
<style>
  html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; background: linear-gradient(#bfe6ff, #d9f1ff); }
  .wrap { position: absolute; inset: 12px; display: grid; grid-template-rows: 1fr auto 1fr; gap: 12px; }
  .row { display: flex; gap: 12px; }
  .tile { flex: 1; position: relative; border-radius: 18px; overflow: hidden; background-size: cover; background-position: 62% 30%; box-shadow: 0 6px 18px rgba(28,48,86,.18); }
  .tile span { position: absolute; left: 10px; top: 10px; padding: 4px 11px 5px; border-radius: 999px; background: rgba(255,255,255,.95); font: 600 17px 'Fredoka', 'M PLUS Rounded 1c', sans-serif; color: #22324a; box-shadow: 0 3px 8px rgba(28,48,86,.18); white-space: nowrap; }
  .row.bottom .tile span { top: auto; bottom: 10px; }
  .tile small { font: 700 13px 'M PLUS Rounded 1c', sans-serif; color: #6b7a90; margin-left: 5px; }
  .card { display: flex; align-items: center; justify-content: center; gap: 26px; padding: 18px 32px; border-radius: 26px; background: #fff; box-shadow: 0 14px 40px rgba(28,48,86,.22); }
  .card svg { width: 118px; height: 74px; flex: none; }
  .logo { font: 700 30px 'Fredoka', sans-serif; color: #ff5a5f; text-shadow: 0 2px 0 #ffd23f; }
  h1 { margin: 2px 0 6px; font: 600 52px/1.02 'Fredoka', sans-serif; letter-spacing: -0.02em; color: #22324a; }
  h1 em { font-style: normal; color: #ff5a5f; }
  p { margin: 0; font: 800 17px/1.35 'Nunito', sans-serif; color: #6b7a90; }
</style>
<div class="wrap">
  <div class="row">${have.slice(0, split).map(tile).join('')}</div>
  <div class="card">
    <svg viewBox="0 0 64 40"><rect x="3" y="5" width="58" height="26" rx="9" fill="#ff5a5f"/><rect x="3" y="21" width="58" height="5" fill="#ffd23f"/><rect x="9" y="10" width="11" height="8" rx="2.5" fill="#e6f7ff"/><rect x="24" y="10" width="11" height="8" rx="2.5" fill="#e6f7ff"/><rect x="39" y="10" width="11" height="8" rx="2.5" fill="#e6f7ff"/><rect x="53" y="10" width="6" height="12" rx="2" fill="#e6f7ff"/><circle cx="15" cy="34" r="4.5" fill="#34495e"/><circle cx="49" cy="34" r="4.5" fill="#34495e"/></svg>
    <div>
      <div class="logo">Tiny Trains</div>
      <h1>Every train in the city, <em>live</em></h1>
      <p>Real trains, real positions, the real rolling stock · tinytrains.app</p>
    </div>
  </div>
  <div class="row bottom">${have.slice(split).map(tile).join('')}</div>
</div>`;
const page = join(CACHE, 'default.html');
writeFileSync(page, html);
execFileSync(tsx, [join(ROOT, 'scripts', 'dev', 'shot.ts'), `file://${page}`, join(ROOT, 'public', 'og', 'default.png'), '--w', '1200', '--h', '630', '--wait', '2500'], {
  stdio: 'inherit',
});
