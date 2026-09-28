import { existsSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import { CITY_ORDER } from './shared/cities.ts';

/** Deep links like /nyc/line/1/train/0931_1..N03R contain dots; serve the app for them in dev too. */
function cityRoutes(): Plugin {
  const re = new RegExp(`^/(${CITY_ORDER.join('|')})(/|$)`);
  return {
    name: 'city-routes',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (req.url && re.test(req.url.split('?')[0])) req.url = '/index.html';
        next();
      });
    },
  };
}

// A city ships once it has network data and a Worker for its trains (dev only needs the data).
const ready = (dev: boolean) => CITY_ORDER.filter((c) => existsSync(`public/data/${c}/transit.json`) && (dev || existsSync(`worker/cities/${c}.jsonc`)));

export default defineConfig(({ command }) => ({
  // Dev shows every city (agents test theirs before it ships); production only the ready ones.
  define: command === 'build' ? { __CITIES_READY__: JSON.stringify(ready(false)) } : {},
  plugins: [cityRoutes()],
  server: {
    port: 5173,
    proxy: { '/api': `http://localhost:${process.env.API_PORT ?? 8787}` },
  },
  build: { outDir: 'dist', chunkSizeWarningLimit: 2000 },
}));
