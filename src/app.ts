import { activeTheme, themeQuery } from './themes/themes.ts';
import * as THREE from 'three';
import { CITIES, CITY_ORDER } from '../shared/cities.ts';
import { cityBounds, makeProjection } from '../shared/geo.ts';
import type { CityId, GeoData, TrainsResponse, TransitData } from '../shared/types.ts';
import { Buildings } from './engine/buildings.ts';
import { Island } from './engine/island.ts';
import { Landmarks } from './engine/landmarks.ts';
import { Suburbs } from './engine/suburbs.ts';
import { geoLabelSpecs, Labels, type LabelSpec } from './engine/labels.ts';
import { Network } from './engine/network.ts';
import { Clouds, Precipitation, weatherKind, type Weather } from './engine/sky.ts';
import { TrainLayer, type LiveTrain } from './engine/trains.ts';
import { World } from './engine/world.ts';
import { esc as escapeHtml, UI } from './ui/ui.ts';
import { parseRoute, routePath, sameSelection, viewHash, type Route, type View } from './router.ts';

// Tokyo is viewed from the east, like the classic skyline-with-Fuji postcard.
const DEFAULT_AZ: Record<CityId, number> = { nyc: -0.52, sf: -0.35, london: -0.55, paris: -0.5, berlin: -0.45, madrid: -0.5, tokyo: 1.92, seoul: -0.4, hongkong: 2.6,
  washington: -0.5, chicago: -0.45, boston: -0.5, mexicocity: -0.5, saopaulo: -0.45, moscow: -0.5, stockholm: -0.45, vienna: -0.5, helsinki: -0.45, amsterdam: -0.5, oslo: -0.4, cairo: -0.5, delhi: -0.5, shanghai: 1.95, beijing: -0.4, guangzhou: -0.35, shenzhen: -0.4, chengdu: -0.45, hangzhou: -0.5, wuhan: -0.45, chongqing: -0.5, osaka: -0.45, taipei: -0.45, singapore: -0.35, sydney: 2.8,
  budapest: -0.45, milan: -0.5, rome: -0.5, philadelphia: -0.5,
};
const POLL_MS = 15_000;

interface CityScene {
  id: CityId;
  transit: TransitData | null;
  geo: GeoData;
  island: Island;
  network: Network | null;
  trains: TrainLayer | null;
  buildings: Buildings | null;
  clouds: Clouds;
  landmarks: Landmarks;
  suburbs: Suburbs;
  group: THREE.Group;
  lastResp: TrainsResponse | null;
}

export class App {
  readonly world: World;
  readonly labels: Labels;
  readonly precip: Precipitation;
  readonly ui: UI;
  city: CityScene | null = null;
  weather: Partial<Record<CityId, Weather>> = {};
  private loadToken = 0;
  private pollTimer = 0;
  private hoverFrame = 0;
  private stationLabels: LabelSpec[] = [];
  private geoLabels: LabelSpec[] = [];

  constructor() {
    this.world = new World(document.getElementById('stage')!);
    this.labels = new Labels(this.world, document.getElementById('labels')!);
    this.world.layers.add(this.labels);
    this.precip = new Precipitation(this.world);
    this.world.scene.add(this.precip.group);
    this.world.layers.add(this.precip);
    this.ui = new UI(this);
    this.world.layers.add({ update: (f) => this.ui.frame(f) });
    this.world.rig.onTap = (x, y) => this.tap(x, y);
    this.world.rig.onInteract = () => {
      this.ui.dismissHint();
      this.poke();
    };
    const canvas = this.world.renderer.domElement;
    canvas.addEventListener('pointerdown', this.poke);
    canvas.addEventListener('wheel', this.poke, { passive: true });
    addEventListener('keydown', (e) => {
      if (e.key.toLowerCase() !== 't') this.poke();
    });
    this.poke();
    this.world.renderer.domElement.addEventListener('pointermove', (e) => this.hover(e));
    this.world.renderer.domElement.addEventListener('pointerleave', () => this.ui.hoverTrain(null, 0, 0));
    void this.fetchWeather();
    setInterval(() => void this.fetchWeather(), 10 * 60_000);
    // Keep the URL shareable: it tracks the camera a moment after it settles.
    let hashTimer = 0;
    let lastKey = '';
    this.world.layers.add({
      update: () => {
        const r = this.world.rig;
        const key = `${r.target.x.toFixed(0)},${r.target.z.toFixed(0)},${r.span.toFixed(0)},${r.azimuth.toFixed(2)}`;
        if (key === lastKey || document.querySelector('.loader.on')) return;
        lastKey = key;
        clearTimeout(hashTimer);
        hashTimer = window.setTimeout(() => this.syncUrl(), 900);
      },
    });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) void this.poll();
    });
  }

  // -------------------------------------------------------------------------
  // City lifecycle
  // -------------------------------------------------------------------------
  /** What's selected right now, as a shareable route (camera excluded). */
  currentRoute(): Route | null {
    const c = this.city;
    if (!c) return null;
    const t = c.trains?.selected;
    if (t) return { city: c.id, line: t.line.id, train: t.id };
    if (c.trains?.focusLine) return { city: c.id, line: c.trains.focusLine };
    if (this.ui.openStationId) return { city: c.id, station: this.ui.openStationId };
    return { city: c.id };
  }

  currentView(): View | null {
    const c = this.city;
    if (!c) return null;
    const rig = this.world.rig;
    const [lon, lat] = makeProjection(c.id).unproject(rig.target.x, -rig.target.z);
    return { lat, lon, span: rig.span, az: rig.azimuth };
  }

  /** Mirror the selection into the URL. New selections push history, so Back closes them. */
  syncUrl(push = false) {
    const r = this.currentRoute();
    if (!r || this.applying || document.querySelector('.loader.on')) return;
    const path = routePath(r);
    const view = this.currentView();
    // Only plain city views carry the camera; selections frame themselves.
    const hash = !r.line && !r.station && view ? viewHash(view) : '';
    const url = path + themeQuery() + hash;
    if (location.pathname + location.search + location.hash === url) return;
    const selectionChanged = !sameSelection(parseRoute(location), r);
    if (push && selectionChanged) history.pushState(null, '', url);
    else history.replaceState(null, '', url);
    this.ui.urlChanged();
  }

  private applying = false;
  private pendingRoute: Route | null = null;

  /** Open whatever a route names: city first, then the selection once live trains are in. */
  async go(route: Route, intro = true) {
    if (route.city !== this.city?.id) {
      this.pendingRoute = route;
      await this.load(route.city, intro && !route.view && !route.line && !route.station && !route.train && !route.stock, route.view);
      return;
    }
    if (route.view) this.flyToView(route.view);
    this.applySelection(route);
  }

  private applySelection(r: Route) {
    const c = this.city;
    if (!c?.trains) return;
    this.applying = true;
    try {
      if (r.train) {
        const t = c.trains.trains.get(r.train);
        if (t && t.dying === null) {
          this.selectTrain(t, true);
          return;
        }
        if (r.line && c.network?.lines.has(r.line)) {
          this.focusLine(r.line);
          this.ui.toast(`That train has finished its run. Here's the whole ${c.network.lines.get(r.line)!.name.replace(/ line$/i, '')} line, live.`);
          return;
        }
      }
      if (r.line) {
        this.selectTrain(null);
        this.focusLine(r.line);
        return;
      }
      if (r.station && c.network?.stations.has(r.station)) {
        this.selectTrain(null);
        this.focusLine(null, false);
        this.ui.openStation(r.station, true);
        return;
      }
      if (r.stock) {
        const list = [...c.trains.trains.values()].filter((t) => t.dying === null && t.spec.id === r.stock);
        if (list.length) this.selectTrain(list[Math.floor(Math.random() * list.length)], true);
        else {
          this.ui.toggleFleet(true);
          this.ui.toast('None of those are running right now. Here is everything that is.');
        }
        return;
      }
      // Plain city: clear any selection.
      this.selectTrain(null);
      this.focusLine(null, false);
      this.ui.closeStation();
    } finally {
      this.applying = false;
      this.syncUrl();
    }
  }

  async load(id: CityId, intro = true, view?: { lat: number; lon: number; span: number; az?: number }) {
    const token = ++this.loadToken;
    this.ui.loading(id, true);
    clearTimeout(this.pollTimer);
    const ok = (r: Response) => r.ok && !(r.headers.get('content-type') ?? '').includes('html');
    // Binary layers ship gzipped; inflate them in the browser (raw .bin is a dev fallback). Some servers
    // (Vite's dev server) label .gz files as Content-Encoding: gzip, so the browser has already inflated
    // them. Check the gzip magic bytes rather than trusting headers.
    const bin = async (name: string): Promise<ArrayBuffer | null> => {
      try {
        const gz = await fetch(`/data/${id}/${name}.gz`);
        if (ok(gz)) {
          const buf = await gz.arrayBuffer();
          const b = new Uint8Array(buf, 0, Math.min(2, buf.byteLength));
          if (b[0] !== 0x1f || b[1] !== 0x8b) return buf;
          return await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
        }
        const raw = await fetch(`/data/${id}/${name}`);
        return ok(raw) ? await raw.arrayBuffer() : null;
      } catch {
        return null;
      }
    };
    const [transit, geo, bldg, density] = await Promise.all([
      fetchJson<TransitData>(`/data/${id}/transit.json`),
      fetchJson<GeoData>(`/data/${id}/geo.json`),
      bin('buildings.bin'),
      bin('density.bin'),
    ]);
    if (token !== this.loadToken) return;
    this.unload();
    const b = cityBounds(id);
    const geoData: GeoData = geo ?? { city: id, bounds: b, water: [], parks: [], roads: [], labels: [] };
    const group = new THREE.Group();
    const island = new Island(id, geoData, Landmarks.roadCuts(id));
    group.add(island.group);
    const clouds = new Clouds(geoData.bounds, Math.min(b.maxX - b.minX, b.maxY - b.minY) * 0.035);
    group.add(clouds.group);
    let network: Network | null = null;
    let trains: TrainLayer | null = null;
    if (transit) {
      network = new Network(id, transit);
      group.add(network.group);
      trains = new TrainLayer(this.world, network);
      trains.onChange = () => this.ui.trainsChanged();
      trains.onDeselect = () => {
        this.world.rig.setFollow(null);
        this.ui.showTrain(null);
      };
      group.add(trains.group);
    }
    let buildings: Buildings | null = null;
    if (bldg && bldg.byteLength > 12) {
      buildings = new Buildings(id, new Int16Array(bldg), transit?.segments.map((s) => s.pts) ?? [], Landmarks.clearings(id));
      group.add(buildings.group);
    }
    const landmarks = new Landmarks(id, geoData.bounds);
    group.add(landmarks.group);
    const suburbs = new Suburbs(id, geoData, bldg && bldg.byteLength > 12 ? new Int16Array(bldg) : null, density, transit?.segments.map((s) => s.pts) ?? []);
    group.add(suburbs.group);
    this.world.scene.add(group);
    const layers = [island, clouds, buildings, network, trains, landmarks, suburbs].filter(Boolean) as unknown as { update?: () => void }[];
    for (const l of layers) this.world.layers.add(l as never);
    this.city = { id, transit, geo: geoData, island, network, trains, buildings, clouds, landmarks, suburbs, group, lastResp: null };
    this.applySceneTheme();

    const cfg = CITIES[id];
    const [lon, lat] = cfg.view.center;
    const { project } = makeProjection(id);
    const [vx, vy] = project(lon, lat);
    this.world.atmosphere.lat = lat;
    this.world.atmosphere.lon = lon;
    const rig = this.world.rig;
    rig.bounds = { minX: b.minX, maxX: b.maxX, minZ: -b.maxY, maxZ: -b.minY };
    rig.maxSpan = Math.max(b.maxX - b.minX, b.maxY - b.minY) * 1.6;
    // Tall phone screens show less width for the same height, so they start a little further out.
    const portrait = innerHeight > innerWidth * 1.2 ? 1.6 : 1;
    const home = { x: vx, z: -vy, span: cfg.view.span * portrait, azimuth: DEFAULT_AZ[id], elevation: 0.74 };
    if (view) {
      const [x, y] = makeProjection(id).project(view.lon, view.lat);
      rig.pose = { x, z: -y, span: view.span, azimuth: view.az ?? DEFAULT_AZ[id], elevation: 0.74 };
      intro = false;
    } else if (intro) {
      rig.pose = { x: (b.minX + b.maxX) / 2, z: -(b.minY + b.maxY) / 2, span: rig.maxSpan * 0.85, azimuth: DEFAULT_AZ[id] - 0.5, elevation: 0.7 };
      rig.apply();
    } else rig.pose = home;
    this.buildLabels();
    this.applyWeather();
    this.ui.cityLoaded();
    await this.poll(true);
    if (token !== this.loadToken) return;
    this.ui.loading(id, false);
    if (intro) setTimeout(() => token === this.loadToken && rig.flyTo(home, 3.2), 250);
    const pending = this.pendingRoute;
    this.pendingRoute = null;
    if (pending && pending.city === id) this.applySelection(pending);
    else this.syncUrl(true);
  }

  /** The parts of the active theme that live on a city's scene objects (tree shape, clouds). */
  applySceneTheme() {
    const t = activeTheme();
    this.city?.island.setTreeShape(t.trees);
    this.city?.clouds.setShown(t.clouds);
    this.city?.suburbs?.setRoofs(t.roofs ?? true);
  }

  private unload() {
    const c = this.city;
    if (!c) return;
    this.world.scene.remove(c.group);
    for (const l of [c.island, c.clouds, c.buildings, c.network, c.trains, c.landmarks, c.suburbs]) if (l) this.world.layers.delete(l as never);
    c.trains?.dispose();
    c.network?.dispose();
    c.buildings?.dispose();
    c.island.dispose();
    c.clouds.dispose();
    c.landmarks.dispose();
    c.suburbs.dispose();
    this.labels.clear();
    this.world.rig.setFollow(null);
    this.city = null;
  }

  private buildLabels() {
    const c = this.city!;
    this.geoLabels = geoLabelSpecs(c.geo.labels ?? [], c.id);
    this.stationLabels = [];
    if (c.network) {
      // One label per station complex: same name within a short walk (NYC lists each platform group
      // separately; Tokyo's JR and subway stations of one name are separate stations).
      const clusters: { name: string; x: number; z: number; ids: string[]; lines: Set<string> }[] = [];
      for (const s of c.network.stations.values()) {
        const key = s.name.toLowerCase().replace(/[^a-z0-9]/g, '');
        let cl = clusters.find((o) => o.name === key && Math.hypot(o.x - s.pos.x, o.z - s.pos.z) < 500);
        if (!cl) clusters.push((cl = { name: key, x: s.pos.x, z: s.pos.z, ids: [], lines: new Set() }));
        cl.ids.push(s.id);
        for (const l of s.lines) cl.lines.add(l);
      }
      const order = new Map(c.transit!.lines.map((l, i) => [l.id, i]));
      for (const cl of clusters) {
        const s = c.network.stations.get(cl.ids[0])!;
        const lines = [...cl.lines].map((id) => c.network!.lines.get(id)!).filter(Boolean).sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
        // Same-colored lines (A/C/E) show as separate letters; bar-style lines (London) as dots.
        const dots = lines
          .slice(0, 10)
          .map((l) => {
            const txt = c.id === 'london' || !l.short || l.short.length > 3 ? '' : escapeHtml(l.short);
            return `<i class="${c.id === 'tokyo' ? 'ring' : ''}" style="--c:${escapeHtml(l.color)};--t:${escapeHtml(l.textColor)}">${txt}</i>`;
          })
          .join('');
        const more = lines.length > 10 ? `<em>+${lines.length - 10}</em>` : '';
        const local = c.id === 'tokyo' && s.nameLocal ? `<small>${escapeHtml(s.nameLocal)}</small>` : '';
        const n = lines.length;
        this.stationLabels.push({
          id: `st:${s.id}`,
          text: s.name,
          html: `<span class="st-name">${escapeHtml(s.name)}</span>${local}<span class="st-lines">${dots}${more}</span>`,
          pos: s.pos.clone().setY(s.pos.y + 8),
          cls: 'station',
          rank: 100 - Math.min(n, 8) * 10 + (s.name.length % 7) * 0.1,
          minMpp: 0,
          maxMpp: n >= 4 ? 5.5 : n >= 2 ? 3.2 : 2.2,
          onClick: () => this.ui.openStation(s.id),
        });
      }
    }
    this.labels.set([...this.stationLabels, ...this.geoLabels]);
  }

  // -------------------------------------------------------------------------
  // Live data
  // -------------------------------------------------------------------------
  async poll(first = false) {
    clearTimeout(this.pollTimer);
    const c = this.city;
    if (!c) return;
    const id = c.id;
    const t0 = Date.now();
    try {
      const r = await fetch(`/api/${id}/trains`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const resp = (await r.json()) as TrainsResponse;
      if (this.city?.id !== id) return;
      const t1 = Date.now();
      // NTP-style: the server's own wait (e.g. the first poll of an idle city) cancels out. At the
      // edge the body can be a few seconds old, so its timestamps come in headers instead.
      const recv = Number(r.headers.get('x-recv') ?? resp.recv ?? NaN);
      const sent = Number(r.headers.get('x-now') ?? resp.now);
      const offset = Number.isFinite(recv) ? (recv - t0 + (sent - t1)) / 2 : sent + (t1 - t0) / 2 - t1;
      this.world.clockOffset = first || Math.abs(offset - this.world.clockOffset) > 5000 ? offset : this.world.clockOffset * 0.8 + offset * 0.2;
      c.lastResp = resp;
      c.trains?.setData(resp);
      this.ui.sourcesChanged(resp);
    } catch (err) {
      console.warn('poll failed', err);
      this.ui.sourcesChanged(null);
    }
    if (this.city?.id === id) this.pollTimer = window.setTimeout(() => void this.poll(), document.hidden ? POLL_MS * 6 : POLL_MS);
  }

  async fetchWeather() {
    const lats = CITY_ORDER.map((c) => CITIES[c].view.center[1]).join(',');
    const lons = CITY_ORDER.map((c) => CITIES[c].view.center[0]).join(',');
    try {
      const r = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}&current=temperature_2m,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,precipitation,is_day`,
      );
      const j = await r.json();
      const arr = Array.isArray(j) ? j : [j];
      arr.forEach((x, i) => {
        const cur = x.current;
        if (!cur) return;
        this.weather[CITY_ORDER[i]] = {
          code: cur.weather_code,
          cloud: cur.cloud_cover,
          wind: cur.wind_speed_10m,
          windDir: cur.wind_direction_10m,
          temp: cur.temperature_2m,
          precip: cur.precipitation,
          isDay: !!cur.is_day,
        };
      });
      this.applyWeather();
      this.ui.weatherChanged();
    } catch (err) {
      console.warn('weather failed', err);
    }
  }

  private applyWeather() {
    const c = this.city;
    if (!c) return;
    const w = this.weather[c.id] ?? null;
    c.clouds.setWeather(w);
    const kind = w ? weatherKind(w.code) : 'clear';
    this.precip.set(kind);
    this.world.atmosphere.state.cloudiness = w ? Math.min(1, (w.cloud / 100) * (kind === 'clear' ? 0.4 : 0.9)) : 0;
    document.body.dataset.weather = kind;
  }

  // -------------------------------------------------------------------------
  // Interaction
  // -------------------------------------------------------------------------
  private tap(x: number, y: number) {
    const c = this.city;
    if (!c?.trains) return;
    const t = c.trains.pick(x, y, 22);
    if (t) {
      this.selectTrain(t);
      return;
    }
    const g = this.world.rig.groundAt(x, y);
    const st = c.network?.nearestStation(g.x, g.z, this.world.rig.mpp * 16);
    if (st) {
      this.ui.openStation(st.id);
      return;
    }
    this.selectTrain(null);
    this.ui.closeStation();
  }

  private hover(e: PointerEvent) {
    if (++this.hoverFrame % 2) return;
    const c = this.city;
    if (!c?.trains || e.buttons) return;
    const r = this.world.renderer.domElement.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const t = c.trains.pick(x, y, 16);
    this.ui.hoverTrain(t, e.clientX, e.clientY);
    this.world.renderer.domElement.style.cursor = t ? 'pointer' : '';
  }

  selectTrain(t: LiveTrain | null, follow = false) {
    const c = this.city;
    if (!c?.trains) return;
    queueMicrotask(() => this.syncUrl(!this.touring));
    if (t && (c.trains.trains.get(t.id) !== t || t.dying !== null)) t = null;
    if (t && c.trains.focusLine) {
      c.trains.focusLine = null;
      this.ui.showLine(null);
    }
    c.trains.select(t);
    if (!t) {
      this.world.rig.setFollow(null);
    } else if (follow) {
      this.follow(true);
    }
    this.ui.showTrain(t);
  }

  follow(on: boolean) {
    const c = this.city;
    const t = c?.trains?.selected;
    if (!on || !t) {
      this.world.rig.setFollow(null);
      this.ui.followChanged(false);
      return;
    }
    const rig = this.world.rig;
    rig.flyTo({ x: t.pos.x, z: t.pos.z, span: Math.min(rig.span, 650) }, 1.2, () => {
      rig.setFollow(
        () => (c?.trains?.selected === t && t.dying === null ? t.pos : null),
        () => (c?.trains?.selected === t && t.status.kind === 'moving' ? t.heading : null),
      );
    });
    this.ui.followChanged(true);
  }

  /** Highlight one line: its tracks and trains stay bright, the rest fade, and the camera frames it. */
  focusLine(id: string | null, fly = true) {
    const c = this.city;
    if (!c?.trains || !c.network) return;
    queueMicrotask(() => this.syncUrl(true));
    if (id && !c.network.lines.has(id)) id = null;
    if (id) {
      c.trains.select(null);
      this.world.rig.setFollow(null);
      this.ui.showTrain(null);
      this.ui.closeStation();
    }
    c.trains.focusLine = id;
    c.trains.refreshFocus();
    this.ui.showLine(id);
    if (id && fly) {
      const b = c.network.lineBounds(id);
      if (b) {
        const span = THREE.MathUtils.clamp(Math.max(b.maxX - b.minX, b.maxZ - b.minZ) * 0.8, 1800, this.world.rig.maxSpan * 0.7);
        this.world.rig.flyTo({ x: (b.minX + b.maxX) / 2, z: (b.minZ + b.maxZ) / 2, span }, 1.6);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Tour: ride along with a random live train, hopping to another every so often. Starts by itself
  // after a while without input; any touch, click, key or scroll stops it.
  touring = false;
  private tourTimer = 0;
  private idleTimer = 0;
  private lastTourLine = '';

  toggleTour(on = !this.touring) {
    this.touring = on;
    clearTimeout(this.tourTimer);
    if (on) this.tourStep();
    else this.ui.tourChanged(false);
  }

  private tourStep() {
    const c = this.city;
    if (!this.touring || !c?.trains) return;
    const [lon, lat] = CITIES[c.id].view.center;
    const [cx, cy] = makeProjection(c.id).project(lon, lat);
    const all = [...c.trains.trains.values()].filter((t) => t.dying === null && t.status.kind === 'moving');
    const near = all.filter((t) => Math.hypot(t.pos.x - cx, t.pos.z + cy) < 9000 && t.line.id !== this.lastTourLine);
    const pool = near.length ? near : all;
    if (pool.length) {
      const t = pool[Math.floor(Math.random() * pool.length)];
      this.lastTourLine = t.line.id;
      this.selectTrain(t, true);
      this.ui.tourChanged(true, `Touring ${CITIES[c.id].name} · ${t.line.short || t.line.name} to ${t.state.dest}`);
    } else this.ui.tourChanged(true, `Touring ${CITIES[c.id].name}`);
    this.tourTimer = window.setTimeout(() => this.tourStep(), 20_000);
  }

  /** Any real user input: stop touring and restart the idle countdown. */
  private poke = () => {
    if (this.touring) this.toggleTour(false);
    clearTimeout(this.idleTimer);
    this.idleTimer = window.setTimeout(() => {
      if (!document.hidden && !this.touring && !this.city?.trains?.selected && !document.querySelector('.picker.shown, .search.shown, .fleet.shown')) this.toggleTour(true);
    }, 120_000);
  };

  flyToView(view: { lat: number; lon: number; span: number; az?: number }) {
    const c = this.city;
    if (!c) return;
    const [x, y] = makeProjection(c.id).project(view.lon, view.lat);
    this.world.rig.setFollow(null);
    this.world.rig.flyTo({ x, z: -y, span: view.span, ...(view.az !== undefined ? { azimuth: view.az } : {}) }, 1.6);
  }

  flyToStation(id: string) {
    const s = this.city?.network?.stations.get(id);
    if (!s) return;
    this.world.rig.setFollow(null);
    this.world.rig.flyTo({ x: s.pos.x, z: s.pos.z, span: Math.min(this.world.rig.span, 1800) }, 1.4);
  }

  home() {
    const c = this.city;
    if (!c) return;
    const cfg = CITIES[c.id];
    const [vx, vy] = makeProjection(c.id).project(...cfg.view.center);
    this.world.rig.setFollow(null);
    this.world.rig.flyTo({ x: vx, z: -vy, span: cfg.view.span, azimuth: DEFAULT_AZ[c.id], elevation: 0.74 }, 2);
  }
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url);
    if (!r.ok || (r.headers.get('content-type') ?? '').includes('html')) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}
