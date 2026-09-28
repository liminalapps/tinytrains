// Overpass queries with an on-disk cache, mirror rotation and backoff (the main instance often times out).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export interface OsmElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  tags?: Record<string, string>;
  nodes?: number[];
  geometry?: { lat: number; lon: number }[];
  members?: { type: string; ref: number; role: string }[];
}

export interface OsmResponse {
  elements: OsmElement[];
}

const UA = 'TinyTrains/0.1 (transit diorama data build)';
const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
let next = 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Run an Overpass query, or read its cached answer from `file`. */
export async function overpass(file: string, query: string): Promise<OsmResponse> {
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8')) as OsmResponse;
  let lastErr = '';
  for (let attempt = 0; attempt < 8; attempt++) {
    const url = MIRRORS[next++ % MIRRORS.length];
    try {
      const res = await fetch(url, {
        method: 'POST',
        body: `data=${encodeURIComponent(query)}`,
        headers: { 'user-agent': UA, 'content-type': 'application/x-www-form-urlencoded' },
        signal: AbortSignal.timeout(300_000),
      });
      const text = res.ok ? await res.text() : '';
      // Overpass answers some failures with 200 and a 'remark' instead of data.
      if (res.ok && text.trimStart().startsWith('{') && !/"remark":\s*"runtime error/.test(text)) {
        const data = JSON.parse(text) as OsmResponse;
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, text);
        await sleep(1000);
        return data;
      }
      lastErr = `${res.status} ${url}`;
    } catch (err) {
      lastErr = `${err instanceof Error ? err.message : err} ${url}`;
    }
    console.warn(`  overpass retry (${lastErr})`);
    await sleep(Math.min(60_000, 3000 * 2 ** Math.floor(attempt / MIRRORS.length)));
  }
  throw new Error(`overpass failed: ${lastErr}`);
}
