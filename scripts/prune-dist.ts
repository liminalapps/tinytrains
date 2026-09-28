// The site only fetches the .bin.gz copies; drop the raw .bin files from the deploy.
import { readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..', 'dist', 'data');
for (const city of readdirSync(root)) for (const f of readdirSync(join(root, city))) if (f.endsWith('.bin')) rmSync(join(root, city, f));
