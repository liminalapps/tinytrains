// Pre-compress the binary data files (the CDN won't compress application/octet-stream on its own).
// The client fetches `<name>.bin.gz` and inflates it with the browser's DecompressionStream.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const root = join(import.meta.dirname, '..', 'public', 'data');
for (const city of readdirSync(root)) {
  for (const f of readdirSync(join(root, city))) {
    if (!f.endsWith('.bin')) continue;
    const src = join(root, city, f);
    const dst = `${src}.gz`;
    try {
      if (statSync(dst).mtimeMs >= statSync(src).mtimeMs) continue;
    } catch {
      /* not built yet */
    }
    writeFileSync(dst, gzipSync(readFileSync(src), { level: 9 }));
    console.log(`gzip ${city}/${f}`);
  }
}
