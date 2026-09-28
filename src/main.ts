import './style.css';
import { parseRoute } from './router.ts';
import type { CityId } from '../shared/types.ts';
import { App } from './app.ts';
import { initialTheme } from './themes/themes.ts';

// ?og renders a clean poster (used to capture the OpenGraph preview images).
if (new URLSearchParams(location.search).has('og')) document.body.classList.add('og');
const app = new App();
app.ui.applyTheme(initialTheme(), false, true);
const start = parseRoute(location) ?? { city: 'nyc' as CityId };
void app.go(start);
// Back/forward and pasted links: apply whatever the URL now names.
addEventListener('popstate', () => {
  const r = parseRoute(location);
  if (r) void app.go(r, false);
});
addEventListener('hashchange', () => {
  const r = parseRoute(location);
  if (r && r.city !== app.city?.id) void app.go(r);
  else if (r?.view) app.flyToView(r.view);
});
// Handy for debugging from the console.
(window as unknown as { app: App }).app = app;
