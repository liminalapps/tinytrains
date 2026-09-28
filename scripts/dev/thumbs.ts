// Dev tool: small city thumbnails for the city picker, cropped from the raw share-image renders that
// scripts/dev/og.ts leaves in .cache/og/ (the published public/og/ images carry a caption card).
// usage: npx tsx scripts/dev/thumbs.ts [city ...]   (macOS: uses sips)
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { CITY_ORDER } from '../../shared/cities.ts';

const ROOT = resolve(import.meta.dirname, '..', '..');
const OUT = join(ROOT, 'public', 'thumbs');
mkdirSync(OUT, { recursive: true });
const cities = process.argv.slice(2).length ? process.argv.slice(2) : CITY_ORDER;
for (const c of cities) {
  const src = join(ROOT, '.cache', 'og', `${c}.png`);
  if (!existsSync(src)) {
    console.warn(`skip ${c}: no .cache/og/${c}.png (run scripts/dev/og.ts ${c})`);
    continue;
  }
  const out = join(OUT, `${c}.jpg`);
  // The 1200×630 render's central 800×480 (the city's heart), scaled to 240×144.
  // Two passes: sips applies a resize before a crop when both are in one call.
  const tmp = join(ROOT, '.cache', 'og', `${c}.crop.png`);
  execFileSync('sips', ['-c', '480', '800', '--cropOffset', '60', '200', src, '--out', tmp], { stdio: 'ignore' });
  execFileSync('sips', ['-Z', '240', '-s', 'format', 'jpeg', '-s', 'formatOptions', '80', tmp, '--out', out], { stdio: 'ignore' });
  console.log(`${c}.jpg ${(statSync(out).size / 1024).toFixed(0)} KB`);
}
