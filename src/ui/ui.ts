import { setLook } from '../themes/look.ts';
import { activeTheme, loadFonts, rememberTheme, setActiveTheme, themeById, themeQuery, THEMES, type Theme } from '../themes/themes.ts';
import { CITIES, CITY_ORDER } from '../../shared/cities.ts';
import { READY } from '../ready.ts';
import { STOCK } from '../../shared/stock/index.ts';
import type { CityId, LineDef, TrainsResponse } from '../../shared/types.ts';
import type { App } from '../app.ts';
import { weatherKind, type Weather } from '../engine/sky.ts';
import type { LiveTrain } from '../engine/trains.ts';
import type { FrameInfo } from '../engine/world.ts';
import * as THREE from 'three';
import { StockPreview } from './stockPreview.ts';
import { StockPortraits } from './fleet.ts';
import { makePostcard } from './postcard.ts';
import { routePath, viewHash, type Route } from '../router.ts';
import { restoreSound, setSound, sfx, soundOn } from './sound.ts';
import { Soundscape } from './soundscape.ts';
import { isPhone, makeSheet, TOUCH } from './sheet.ts';
import { replay, reveal, shown, tweenNumber } from './anim.ts';
import { buildIndex, search, type Hit } from './search.ts';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function bullet(line: LineDef, city: CityId, size = 26, express = false) {
  const style = `--c:${line.color};--t:${line.textColor};--s:${size}px`;
  const txt = esc(line.short);
  if (city === 'tokyo') return `<span class="b b-tokyo" style="${style}"><b>${txt}</b></span>`;
  switch (express ? 'diamond' : line.bullet) {
    case 'diamond':
      return `<span class="b b-diamond" style="${style}"><i></i><b>${txt}</b></span>`;
    case 'roundel':
      return `<span class="b b-roundel" style="${style}"><i></i><em></em></span>`;
    case 'bar':
      return `<span class="b b-bar" style="${style}">${esc(line.name.replace(/ line$/i, ''))}</span>`;
    case 'square':
      return `<span class="b b-square" style="${style}"><b>${txt}</b></span>`;
    case 'pill':
      return `<span class="b b-pill" style="${style}"><b>${txt || esc(line.name)}</b></span>`;
    default:
      return `<span class="b b-circle" style="${style}"><b>${txt}</b></span>`;
  }
}

function wxIcon(w: Weather | undefined, night: boolean) {
  const k = w ? weatherKind(w.code) : 'clear';
  const sun = night
    ? '<path d="M15 4a8 8 0 1 0 5 13A9 9 0 0 1 15 4z" fill="#ffe28a"/>'
    : '<circle cx="12" cy="12" r="5" fill="#ffc83d"/><g stroke="#ffc83d" stroke-width="2" stroke-linecap="round"><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></g>';
  const cloud = (x = 0, y = 0, c = '#fff') => `<path transform="translate(${x} ${y})" d="M7 18h10a4 4 0 0 0 0-8 5.5 5.5 0 0 0-10.6 1.5A3.3 3.3 0 0 0 7 18z" fill="${c}" stroke="#9fb6c9" stroke-width="1.2"/>`;
  let body = sun;
  if (k === 'cloudy') body = `<g transform="translate(-4 -4) scale(.8)">${sun}</g>${cloud(2, 2)}`;
  if (k === 'fog') body = `${cloud(0, -3)}<g stroke="#b9c7d3" stroke-width="2" stroke-linecap="round"><path d="M4 19h16M6 22h12"/></g>`;
  if (k === 'drizzle' || k === 'rain' || k === 'storm')
    body = `${cloud(0, -4, k === 'storm' ? '#dfe4ec' : '#fff')}<g stroke="#5bb3f0" stroke-width="2" stroke-linecap="round"><path d="M8 17l-1 3M12 17l-1 3M16 17l-1 3"/></g>${k === 'storm' ? '<path d="M12 13l-2 4h3l-2 4" stroke="#ffc83d" stroke-width="1.8" fill="none"/>' : ''}`;
  if (k === 'snow') body = `${cloud(0, -4)}<g fill="#a7d5f5"><circle cx="8" cy="19" r="1.3"/><circle cx="12" cy="21" r="1.3"/><circle cx="16" cy="19" r="1.3"/></g>`;
  return `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">${body}</svg>`;
}

function localTime(city: CityId, ms: number) {
  return new Intl.DateTimeFormat('en-US', { timeZone: CITIES[city].tz, hour: 'numeric', minute: '2-digit' }).format(ms);
}

function localHour(city: CityId, ms: number) {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: CITIES[city].tz, hour: '2-digit', hour12: false }).format(ms));
}

function fmtEta(sec: number) {
  if (sec < 25) return 'now';
  if (sec < 60) return `${Math.round(sec)}s`;
  const m = Math.round(sec / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

const PALETTE_SVG = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M12 3a9 9 0 1 0 0 18c1.2 0 1.8-.8 1.8-1.7 0-.6-.3-1-.6-1.4-.3-.4-.5-.8-.5-1.3 0-1 .8-1.8 1.8-1.8H17a4 4 0 0 0 4-4C21 6.4 17 3 12 3z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="7.5" cy="11" r="1.5" fill="#ff5a5f"/><circle cx="10" cy="7" r="1.5" fill="#ffd23f"/><circle cx="14.5" cy="7" r="1.5" fill="#2fd18b"/><circle cx="17" cy="11" r="1.5" fill="#4cc3ff"/></svg>';
const SEARCH_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M15.5 15.5L21 21" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';
const PLAY_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/></svg>';
const LINES_SVG = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><circle cx="8" cy="7" r="2" fill="#ff5a5f"/><circle cx="15" cy="12" r="2" fill="#2fa5ff"/><circle cx="10" cy="17" r="2" fill="#2fd18b"/></svg>';
const FLEET_SVG = '<svg viewBox="0 0 24 24" width="18" height="18"><rect x="3" y="5" width="18" height="11" rx="4" fill="currentColor"/><rect x="6" y="8" width="4" height="3" rx="1" fill="#fff"/><rect x="11" y="8" width="4" height="3" rx="1" fill="#fff"/><circle cx="8" cy="18.5" r="1.8" fill="currentColor"/><circle cx="16" cy="18.5" r="1.8" fill="currentColor"/></svg>';
const CHEV = '<svg class="chev" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M2 4l4 4 4-4" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round"/></svg>';

export const SHARE_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 3v12M7 8l5-5 5 5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 12v6.5A2.5 2.5 0 0 0 7.5 21h9a2.5 2.5 0 0 0 2.5-2.5V12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';

const TRAIN_SVG = `<svg viewBox="0 0 64 40" aria-hidden="true"><rect x="3" y="5" width="58" height="26" rx="9" fill="#ff5a5f"/><rect x="3" y="21" width="58" height="5" fill="#ffd23f"/><rect x="9" y="10" width="11" height="8" rx="2.5" fill="#e6f7ff"/><rect x="24" y="10" width="11" height="8" rx="2.5" fill="#e6f7ff"/><rect x="39" y="10" width="11" height="8" rx="2.5" fill="#e6f7ff"/><rect x="53" y="10" width="6" height="12" rx="2" fill="#e6f7ff"/><circle cx="15" cy="34" r="4.5" fill="#34495e"/><circle cx="49" cy="34" r="4.5" fill="#34495e"/></svg>`;

/** Roughly when each city's first trains leave (local hours). New York runs all night. Between 1 AM and
 * this hour an empty map means the network is asleep; any other time it means the feed is quiet. */
const FIRST_TRAIN: Record<CityId, number> = { nyc: 0, sf: 5, london: 5, paris: 5.5, berlin: 4.5, madrid: 6, tokyo: 5, seoul: 5.5, hongkong: 6,
  washington: 5, chicago: 0, boston: 5, mexicocity: 5, saopaulo: 4.67, moscow: 5.5, stockholm: 0, vienna: 5, helsinki: 5.5, amsterdam: 6, oslo: 5.5, cairo: 5, delhi: 5.5, shanghai: 5.5, beijing: 5, guangzhou: 6, shenzhen: 6.5, chengdu: 6, hangzhou: 6, wuhan: 6, chongqing: 6.5, osaka: 5, taipei: 6, singapore: 5.5, sydney: 4.5,
  budapest: 4.5, milan: 5.5, rome: 5.5, philadelphia: 5,
};
const asleepNow = (city: CityId) => {
  const h = localHour(city, Date.now());
  return h >= 1 && h < FIRST_TRAIN[city];
};

export class UI {
  private root = document.getElementById('ui')!;
  private $ = <T extends HTMLElement = HTMLElement>(sel: string) => this.root.querySelector(sel) as T;
  private preview = new StockPreview(320, 128);
  private tipEl!: HTMLDivElement;
  private lastSec = 0;
  private stationId: string | null = null;
  private resp: TrainsResponse | null = null;
  private hintShown = true;
  private skyMode: 'live' | 'night' | 'day' = 'live';
  private etaEls: HTMLDivElement[] = [];
  private portraits = new StockPortraits();
  private soundscape: Soundscape;

  constructor(private app: App) {
    this.soundscape = new Soundscape(app);
    this.root.innerHTML = `
      <header class="brand">
        <button class="logo" aria-label="Tiny Trains: back to the city overview">${TRAIN_SVG}<div><h1>Tiny&nbsp;Trains</h1><p class="tagline"></p></div></button>
        <div class="style-wrap">
          <div class="style-bar" role="radiogroup" aria-label="Theme"></div>
          <div class="themes panel" hidden role="dialog" aria-label="Themes"></div>
        </div>
        <div class="pills">
          <button class="live" title="Data sources"><i></i><span class="live-text">connecting…</span></button>
          <button class="fleet-btn pill-btn" title="Meet the fleet (G)">${FLEET_SVG}<span>Fleet</span></button>
          <button class="search-btn pill-btn" title="Search stations, lines & trains (/)">${SEARCH_SVG}<span>Search</span><kbd>/</kbd></button>
        </div>
        <div class="sources" hidden></div>
      </header>
      <button class="city-switch" aria-haspopup="dialog" title="Change city (C)"></button>
      <div class="picker" hidden role="dialog" aria-label="Choose a city"><div class="picker-inner panel"></div></div>
      <div class="search" hidden role="dialog" aria-label="Search"><div class="search-inner panel">
        <div class="search-field">${SEARCH_SVG}<input type="search" placeholder="Search stations, lines, trains, cities…" autocomplete="off" spellcheck="false" /><button class="search-close" aria-label="Close">Esc</button></div>
        <ol class="search-results"></ol>
      </div></div>
      <section class="legend panel" aria-label="Lines">
        <button class="legend-toggle"><span>Lines</span>${CHEV}</button>
        <div class="legend-body"></div>
      </section>
      <aside class="card train-card panel" hidden></aside>
      <aside class="card station-card panel" hidden></aside>
      <aside class="card line-card panel" hidden></aside>
      <div class="controls">
        <button data-act="tour" class="tour-btn" title="Tour: ride along with random trains (T)">${PLAY_SVG}</button>
        <button data-act="zin" class="zoom" title="Zoom in (+)">+</button>
        <button data-act="zout" class="zoom" title="Zoom out (−)">−</button>
        <button data-act="compass" class="compass" title="Reset view (N)"><svg viewBox="0 0 24 24"><path d="M12 3l4 9h-8z" fill="#ff5a5f"/><path d="M12 21l-4-9h8z" fill="#9fb3c8"/></svg></button>
        <button data-act="rotl" class="rot" title="Rotate (Q)">⟲</button>
        <button data-act="rotr" class="rot" title="Rotate (E)">⟳</button>
        <button data-act="sky" class="sky-btn" title="Sky: live / night / day (L)"></button>
        <button data-act="sound" class="sound-btn" title="Sound (M)"></button>
        <button data-act="share" class="share-btn" title="Share this view (S)">${SHARE_SVG}</button>
        <button data-act="postcard" class="postcard-btn" title="Save a postcard (P)"><svg viewBox="0 0 24 24" width="20" height="20"><rect x="3" y="6" width="18" height="13" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12.5" r="3.2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 6l1.5-2h5L16 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg></button>
      </div>
      <nav class="dock" aria-label="Tools">
        <button data-dock="lines">${LINES_SVG}<span>Lines</span></button>
        <button data-dock="fleet">${FLEET_SVG}<span>Fleet</span></button>
        <button data-dock="tour" class="tour-btn">${PLAY_SVG}<span>Tour</span></button>
        <button data-dock="search">${SEARCH_SVG}<span>Search</span></button>
        <button data-dock="share">${SHARE_SVG}<span>Share</span></button>
      </nav>
      <div class="tour-pill" hidden><span class="tp-dot"></span><span class="tp-text">Touring</span><button class="tp-stop">Stop</button></div>
      <div class="clock"></div>
      <div class="notice" hidden></div>
      <div class="hint"></div>
      <footer class="credits"><button class="about-btn">About & data</button><span class="credit-line"></span></footer>
      <div class="about panel" hidden></div>
      <div class="fleet panel" hidden></div>
      <div class="tip" hidden></div>
      <div class="loader"><div class="loader-inner"><div class="loop"><div class="toy">${TRAIN_SVG}</div></div><p class="loader-text"></p></div></div>
    `;
    this.tipEl = this.$<HTMLDivElement>('.tip');
    this.renderTickets();
    this.$('.style-bar').addEventListener('click', (e) => {
      const el = e.target as HTMLElement;
      const chip = el.closest<HTMLElement>('[data-style]');
      if (chip) {
        if (chip.dataset.style !== activeTheme().id) this.applyTheme(themeById(chip.dataset.style));
        if (soundOn()) sfx.pop();
      } else if (el.closest('.sb-name, .sb-label')) this.toggleThemes();
    });
    this.$('.city-switch').addEventListener('click', () => this.togglePicker());
    this.$('.picker').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-city]');
      if (b) {
        this.togglePicker(false);
        if (b.dataset.city !== app.city?.id) void app.go({ city: b.dataset.city as CityId });
      } else if (e.target === e.currentTarget || (e.target as HTMLElement).closest('.picker-close')) this.togglePicker(false);
    });
    this.$('.logo').addEventListener('click', () => {
      app.selectTrain(null);
      app.focusLine(null, false);
      this.closeStation();
      app.home();
    });
    this.$('.search-btn').addEventListener('click', () => this.openSearch());
    this.$('.dock').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-dock]');
      if (!b) return;
      this.dismissHint();
      const act = b.dataset.dock;
      if (act === 'lines') this.toggleLegendSheet();
      else if (act === 'fleet') this.toggleFleet();
      else if (act === 'tour') app.toggleTour();
      else if (act === 'search') this.openSearch();
      else if (act === 'share') void this.share();
    });
    this.$('.tp-stop').addEventListener('click', () => app.toggleTour(false));
    this.$('.hint').innerHTML = TOUCH
      ? 'Pinch to zoom · twist to rotate · <b>tap any train</b>'
      : 'Drag to pan · scroll to zoom · right-drag to rotate · <b>click any train</b>';
    this.setupSearch();
    for (const card of this.root.querySelectorAll<HTMLElement>('.card')) makeSheet(card, () => this.closeCard(card));
    this.$('.controls').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
      if (!b) return;
      this.dismissHint();
      const rig = app.world.rig;
      switch (b.dataset.act) {
        case 'zin':
          rig.zoomBy(1 / 1.6);
          break;
        case 'zout':
          rig.zoomBy(1.6);
          break;
        case 'rotl':
          rig.rotateBy(Math.PI / 4);
          break;
        case 'rotr':
          rig.rotateBy(-Math.PI / 4);
          break;
        case 'compass':
          app.home();
          break;
        case 'sky':
          this.cycleSky();
          break;
        case 'postcard':
          void this.postcard();
          break;
        case 'sound':
          this.toggleSound();
          break;
        case 'share':
          void this.share();
          break;
        case 'tour':
          app.toggleTour();
          break;
      }
    });
    this.$('.legend-toggle').addEventListener('click', () => {
      if (isPhone()) this.toggleLegendSheet(false);
      else this.$('.legend').classList.toggle('collapsed');
    });
    this.$('.live').addEventListener('click', () => {
      const s = this.$('.sources');
      reveal(s, !shown(s));
    });
    this.$('.about-btn').addEventListener('click', () => this.toggleAbout());
    this.$('.fleet-btn').addEventListener('click', () => this.toggleFleet());
    this.renderSkyBtn();
    restoreSound();
    this.renderSoundBtn();
    addEventListener('keydown', (e) => this.key(e));
    if (isPhone()) this.$('.legend').classList.add('collapsed');
    void TOUCH;
  }

  // -------------------------------------------------------------------------
  private key(e: KeyboardEvent) {
    if ((e.target as HTMLElement).closest('input,textarea')) return;
    const app = this.app;
    const rig = app.world.rig;
    const k = e.key.toLowerCase();
    const n = Number(e.key);
    if (n >= 1 && n <= CITY_ORDER.length) void app.go({ city: CITY_ORDER[n - 1] });
    else if (k === 'escape') {
      if (shown(this.$('.themes'))) return this.toggleThemes(false);
      if (shown(this.$('.picker'))) return this.togglePicker(false);
      if (shown(this.$('.fleet'))) return this.toggleFleet(false);
      if (shown(this.$('.about'))) return reveal(this.$('.about'), false);
      app.selectTrain(null);
      this.closeStation();
      app.focusLine(null, false);
    } else if (k === '+' || k === '=') rig.zoomBy(1 / 1.5);
    else if (k === '-' || k === '_') rig.zoomBy(1.5);
    else if (k === 'q') rig.rotateBy(Math.PI / 4);
    else if (k === 'e') rig.rotateBy(-Math.PI / 4);
    else if (k === 'n') app.home();
    else if (k === 'f') app.follow(!rig.following);
    else if (k === 'l') this.cycleSky();
    else if (k === 'v') this.cycleTheme();
    else if (k === 'r') this.randomTrain();
    else if (k === 'g') this.toggleFleet();
    else if (k === 'p') void this.postcard();
    else if (k === 'm') this.toggleSound();
    else if (k === 's') void this.share();
    else if (k === 't') this.app.toggleTour();
    else if (k === '/' || (k === 'k' && (e.metaKey || e.ctrlKey))) {
      e.preventDefault();
      this.openSearch();
    } else if (k === 'c') this.togglePicker();
  }

  private randomTrain() {
    const t = this.app.city?.trains;
    if (!t) return;
    const list = [...t.trains.values()].filter((x) => x.dying === null);
    if (!list.length) return;
    this.app.selectTrain(list[Math.floor(Math.random() * list.length)], true);
  }

  // -------------------------------------------------------------------------
  // Themes

  /** Switch the whole look: rendering, ground, sky and UI skin. Nothing is reloaded. */
  applyTheme(t: Theme, announce = false, instant = false) {
    setActiveTheme(t);
    loadFonts(t);
    rememberTheme(t.id);
    this.app.world.setPost(t.post);
    setLook(t.look, instant);
    this.app.world.atmosphere.style = t.skyStyle;
    this.app.world.atmosphere.key.shadow.radius = t.shadowRadius ?? 3;
    // Themes with their own sky skip the real weather's rain and snow.
    this.app.precip.group.visible = !t.skyStyle;
    this.app.applySceneTheme();
    this.skyMode = t.sky ?? 'live';
    this.app.world.atmosphere.forced = t.sky;
    this.renderSkyBtn();
    document.body.dataset.theme = t.id;
    this.renderStyleBar();
    if (shown(this.$('.themes'))) this.renderThemes();
    this.app.syncUrl();
    if (announce) this.toast(`${t.name}: ${t.blurb}`);
  }

  private cycleTheme() {
    const i = THEMES.indexOf(activeTheme());
    this.applyTheme(THEMES[(i + 1) % THEMES.length], true);
  }

  /** The header's theme switcher: one swatch per theme (one click to switch) and the current name (opens the gallery). */
  private renderStyleBar() {
    const cur = activeTheme();
    this.$('.style-bar').innerHTML = `<span class="sb-label">${PALETTE_SVG}<span>Theme</span></span>${THEMES.map(
      (t) =>
        `<button class="sb-chip ${t.id === cur.id ? 'on' : ''}" role="radio" aria-checked="${t.id === cur.id}" data-style="${t.id}" title="${esc(t.name)}: ${esc(t.blurb)}" aria-label="${esc(t.name)}"><i style="background:${t.swatch}"></i></button>`,
    ).join('')}<button class="sb-name" aria-haspopup="dialog" title="All themes (V)">${esc(cur.name)}${CHEV}</button>`;
  }

  private toggleThemes(open?: boolean) {
    const p = this.$('.themes');
    const show = open ?? !shown(p);
    if (show) this.renderThemes();
    reveal(p, show);
  }

  private renderThemes() {
    const cur = activeTheme().id;
    const p = this.$('.themes');
    p.innerHTML = `<h3>Themes <kbd>V</kbd></h3><div class="theme-grid">${THEMES.map(
      (t, i) => `<button class="theme-card ${t.id === cur ? 'on' : ''}" data-theme-id="${t.id}" style="--i:${i}">
        <span class="th-swatch" style="background:${t.swatch}"></span>
        <span class="th-name">${esc(t.name)}</span>
        <span class="th-blurb">${esc(t.blurb)}</span>
      </button>`,
    ).join('')}</div>`;
    p.querySelectorAll<HTMLElement>('[data-theme-id]').forEach((b) =>
      b.addEventListener('click', () => {
        this.applyTheme(themeById(b.dataset.themeId));
        if (isPhone()) this.toggleThemes(false);
      }),
    );
  }

  private cycleSky() {
    this.skyMode = this.skyMode === 'live' ? 'night' : this.skyMode === 'night' ? 'day' : 'live';
    this.app.world.atmosphere.forced = this.skyMode === 'live' ? null : this.skyMode;
    this.renderSkyBtn();
  }

  private toggleSound() {
    setSound(!soundOn());
    this.renderSoundBtn();
    if (soundOn()) sfx.pop();
  }

  private renderSoundBtn() {
    const b = this.$('.sound-btn');
    const on = soundOn();
    b.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/>${
      on
        ? '<path d="M15.5 9a4.2 4.2 0 0 1 0 6M18 6.5a7.8 7.8 0 0 1 0 11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
        : '<path d="M16 9.5l5 5M21 9.5l-5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
    }</svg>`;
    b.title = `Sound ${on ? 'on' : 'off'} (M)`;
  }

  private renderSkyBtn() {
    const b = this.$('.sky-btn');
    b.innerHTML = this.skyMode === 'live' ? '<span class="dot"></span>' : this.skyMode === 'night' ? '☾' : '☀';
    b.title = `Sky: ${this.skyMode === 'live' ? 'live (matches the real sky)' : this.skyMode} · press L`;
  }

  dismissHint() {
    if (!this.hintShown) return;
    this.hintShown = false;
    this.$('.hint').classList.add('gone');
  }

  // -------------------------------------------------------------------------
  loading(city: CityId, on: boolean) {
    const l = this.$('.loader');
    if (on) {
      const phrases = ['Laying tiny tracks', 'Polishing the rails', 'Waking up the drivers', 'Counting the carriages', 'Painting the stripes'];
      this.$('.loader-text').innerHTML = `${esc(phrases[Math.floor(Math.random() * phrases.length)])} in <b>${esc(CITIES[city].name)}</b>…`;
      l.classList.add('on');
    } else {
      l.classList.remove('on');
      setTimeout(() => document.body.classList.add('ui-ready'), 150);
    }
    this.renderTickets();
  }

  cityLoaded() {
    const c = this.app.city!;
    reveal(this.$('.fleet'), false);
    reveal(this.$('.about'), false);
    this.showLine(null);
    this.$('.tagline').textContent = CITIES[c.id].tagline;
    const lead = c.transit?.attribution.find((a) => /TfL|MTA|BART|ODPT|Île-de-France|IDFM|VBB|BVG|CRTM|Metro de Madrid|Renfe|Seoul|Korail|MTR/.test(a));
    this.$('.credit-line').textContent = [lead, '© OpenStreetMap contributors'].filter(Boolean).join(' · ');
    this.app.selectTrain(null);
    this.closeStation();
    this.renderLegend();
    this.renderTickets();
    document.body.dataset.city = c.id;
    if (document.body.classList.contains('og')) this.renderPoster();
  }

  /** The OpenGraph poster overlay (?og). */
  private renderPoster() {
    const c = this.app.city!;
    let el = document.querySelector<HTMLElement>('.og-card');
    if (!el) {
      el = document.createElement('div');
      el.className = 'og-card';
      document.body.appendChild(el);
    }
    const lines = (c.transit?.lines ?? []).slice(0, 14).map((l) => bullet(l, c.id, 30)).join('');
    el.innerHTML = `<div class="og-logo">${TRAIN_SVG}<span>Tiny Trains</span></div>
      <h1>Every train in ${esc(CITIES[c.id].name)}, <em>live</em></h1>
      <div class="og-lines">${lines}</div>
      <p>tinytrains.app</p>`;
  }

  weatherChanged() {
    this.renderTickets();
  }

  /** The current-city button in the header, and the picker's tickets. */
  private shownCity = '';

  private renderTickets() {
    const now = Date.now();
    const cur = this.app.city?.id ?? CITY_ORDER[0];
    if (this.shownCity && this.shownCity !== cur) replay(this.$('.city-switch'), 'flip');
    this.shownCity = cur;
    const cfg = CITIES[cur];
    const w = this.app.weather[cur];
    const h = localHour(cur, now);
    this.$('.city-switch').innerHTML = `<span class="cs-name">${esc(cfg.name)}${cfg.nameLocal ? ` <small>${esc(cfg.nameLocal)}</small>` : ''}</span>
      <span class="cs-meta">${wxIcon(w, h < 6 || h >= 19)}<span>${esc(localTime(cur, now))}</span>${w ? `<span class="t-temp">${Math.round(w.temp)}°</span>` : ''}</span>${CHEV}`;
    if (shown(this.$('.picker'))) this.renderPicker();
  }

  private summary: Record<string, { trains: number; live: number }> = {};

  // -------------------------------------------------------------------------
  // Search
  private hits: Hit[] = [];
  private index: Hit[] = [];
  private active = 0;

  private setupSearch() {
    const box = this.$('.search');
    const input = box.querySelector('input')!;
    input.addEventListener('input', () => this.runSearch(input.value));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        this.active = (this.active + (e.key === 'ArrowDown' ? 1 : -1) + this.hits.length) % Math.max(1, this.hits.length);
        this.paintResults();
      } else if (e.key === 'Enter') this.pick(this.hits[this.active]);
      else if (e.key === 'Escape') this.closeSearch();
    });
    box.addEventListener('click', (e) => {
      const li = (e.target as HTMLElement).closest<HTMLElement>('[data-i]');
      if (li) this.pick(this.hits[Number(li.dataset.i)]);
      else if (e.target === box || (e.target as HTMLElement).closest('.search-close')) this.closeSearch();
    });
  }

  openSearch() {
    this.togglePicker(false);
    const box = this.$('.search');
    reveal(box, true);
    document.body.classList.add('search-open');
    this.index = buildIndex(this.app, bullet, esc);
    const input = box.querySelector('input')!;
    input.value = '';
    this.runSearch('');
    setTimeout(() => input.focus(), 30);
  }

  closeSearch() {
    reveal(this.$('.search'), false);
    document.body.classList.remove('search-open');
  }

  private runSearch(q: string) {
    this.active = 0;
    if (q.trim()) this.hits = search(this.index, q);
    else {
      // Suggestions: the city's lines, then other cities.
      this.hits = [...this.index.filter((h) => h.kind === 'line').slice(0, 8), ...this.index.filter((h) => h.kind === 'city' && h.label !== CITIES[this.app.city?.id ?? 'nyc'].name).slice(0, 4)];
    }
    this.paintResults(q.trim() ? '' : '<li class="sr-head">Lines here · other cities</li>');
  }

  private paintResults(head = '') {
    const list = this.$('.search-results');
    list.innerHTML =
      head +
      (this.hits.length
        ? this.hits
            .map(
              (h, i) =>
                `<li data-i="${i}" style="--i:${i}" class="${i === this.active ? 'on' : ''}"><span class="sr-badge">${h.badge}</span><span class="sr-text"><b>${esc(h.label)}</b><small>${esc(h.sub)}</small></span><span class="sr-kindlabel">${h.kind}</span></li>`,
            )
            .join('')
        : '<li class="sr-empty">Nothing here by that name. Try a station, a line or a city.</li>');
    list.querySelector('li.on')?.scrollIntoView({ block: 'nearest' });
  }

  private pick(h: Hit | undefined) {
    if (!h) return;
    this.closeSearch();
    h.run();
  }

  // -------------------------------------------------------------------------
  // Phone layout helpers
  private toggleLegendSheet(open?: boolean) {
    const l = this.$('.legend');
    const show = open ?? !l.classList.contains('sheet-open');
    l.classList.toggle('sheet-open', show);
    document.body.classList.toggle('legend-open', show);
  }

  private closeCard(card: HTMLElement) {
    card.classList.remove('full');
    if (card.classList.contains('train-card')) this.app.selectTrain(null);
    else if (card.classList.contains('station-card')) this.closeStation();
    else if (card.classList.contains('line-card')) this.app.focusLine(null);
  }

  tourChanged(on: boolean, text = '') {
    reveal(this.$('.tour-pill'), on);
    this.$('.tp-text').textContent = text || 'Touring';
    this.root.querySelectorAll('.tour-btn').forEach((b) => b.classList.toggle('on', on));
    document.body.classList.toggle('touring', on);
  }

  togglePicker(open?: boolean) {
    const p = this.$('.picker');
    const show = open ?? !shown(p);
    reveal(p, show);
    document.body.classList.toggle('picker-open', show);
    if (!show) return;
    this.pickerFilter = '';
    const list = p.querySelector<HTMLElement>('.picker-list');
    if (list) list.dataset.shown = '';
    const input = p.querySelector<HTMLInputElement>('.picker-filter input');
    if (input) input.value = '';
    this.renderPicker();
    // On desktop, typing goes straight into the filter.
    if (!TOUCH) setTimeout(() => p.querySelector<HTMLInputElement>('.picker-filter input')?.focus(), 60);
    fetch('/api/summary')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!j) return;
        this.summary = j;
        if (shown(p)) this.renderPicker();
      })
      .catch(() => {});
  }

  private pickerFilter = '';

  private renderPicker() {
    const inner = this.$('.picker-inner');
    if (!inner.querySelector('.picker-list')) {
      // Header is built once so the filter keeps its focus while live counts refresh the list below it.
      inner.innerHTML = `<button class="picker-close" aria-label="Close">×</button>
        <h2>Where to?</h2>
        <p class="world-count"></p>
        <label class="picker-filter">${SEARCH_SVG}<input type="text" placeholder="Find a city" autocomplete="off" spellcheck="false" aria-label="Find a city" /></label>
        <div class="picker-list"></div>`;
      const input = inner.querySelector('input')!;
      input.addEventListener('input', () => {
        this.pickerFilter = input.value;
        this.renderPicker();
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') inner.querySelector<HTMLElement>('.picker-list .ticket')?.click();
        else if (e.key === 'Escape') this.togglePicker(false);
      });
    }
    const now = Date.now();
    const cur = this.app.city?.id;
    const regions: [string, CityId[]][] = [
      ['Americas', ['nyc', 'sf', 'washington', 'chicago', 'boston', 'philadelphia', 'mexicocity', 'saopaulo']],
      ['Europe', ['london', 'paris', 'berlin', 'madrid', 'moscow', 'stockholm', 'vienna', 'helsinki', 'amsterdam', 'oslo', 'budapest', 'milan', 'rome']],
      ['Asia', ['tokyo', 'osaka', 'seoul', 'taipei', 'hongkong', 'shanghai', 'beijing', 'guangzhou', 'shenzhen', 'chengdu', 'hangzhou', 'wuhan', 'chongqing', 'singapore', 'delhi']],
      ['Africa & Oceania', ['cairo', 'sydney']],
    ];
    const total = Object.values(this.summary).reduce((n, x) => n + x.trains, 0);
    inner.querySelector('.world-count')!.innerHTML = total
      ? `<b>${total.toLocaleString()}</b> trains moving across ${READY.length} cities right now`
      : `${READY.length} cities, every train live`;
    const fold = (t: string) => t.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const q = fold(this.pickerFilter.trim());
    // Prefix matches on any word of the name ("sh" → Shanghai, Shenzhen), or anywhere in the local name.
    const match = (id: CityId) => {
      const c = CITIES[id];
      if (!q) return true;
      const words = fold(`${c.name} ${id}`).split(/[^\p{L}\p{N}]+/u);
      return words.some((w) => w.startsWith(q)) || fold(c.name).startsWith(q) || (!!c.nameLocal && c.nameLocal.includes(this.pickerFilter.trim()));
    };
    let n = 0;
    const ticket = (id: CityId) => {
      const cfg = CITIES[id];
      const w = this.app.weather[id];
      const h = localHour(id, now);
      const sum = this.summary[id];
      const idx = CITY_ORDER.indexOf(id);
      const count = !sum
        ? '<span class="t-count muted">…</span>'
        : sum.trains === 0 && asleepNow(id)
          ? '<span class="t-count sleep">asleep</span>'
          : `<span class="t-count"><i class="${sum.live ? 'is-live' : 'is-sched'}"></i>${sum.trains.toLocaleString()} trains</span>`;
      return `<button class="ticket ${id === cur ? 'active' : ''}" style="--i:${Math.min(n++, 14)}" data-city="${id}">
        ${idx < 9 ? `<span class="t-key">${idx + 1}</span>` : ''}
        <span class="t-name">${esc(cfg.name)}${cfg.nameLocal ? ` <small>${esc(cfg.nameLocal)}</small>` : ''}</span>
        <span class="t-meta">${wxIcon(w, h < 6 || h >= 19)}<span>${esc(localTime(id, now))}</span>${w ? `<span class="t-temp">${Math.round(w.temp)}°</span>` : ''}</span>
        ${count}
      </button>`;
    };
    const html = regions
      .map(([name, ids]) => [name, ids.filter((id) => READY.includes(id) && match(id))] as const)
      .filter(([, ids]) => ids.length)
      .map(([name, ids]) => `<h3>${name}</h3><div class="picker-row">${ids.map(ticket).join('')}</div>`)
      .join('');
    const list = inner.querySelector<HTMLElement>('.picker-list')!;
    // Only the first render after opening plays the entrance; refreshes and filtering swap cards quietly.
    list.classList.toggle('quiet', list.dataset.shown === '1');
    list.dataset.shown = '1';
    list.innerHTML = html || `<p class="muted picker-none">No city called “${esc(this.pickerFilter)}” yet.</p>`;
  }

  // -------------------------------------------------------------------------
  private renderLegend() {
    const c = this.app.city;
    const body = this.$('.legend-body');
    if (!c?.transit) {
      body.innerHTML = '<p class="muted">No network data yet.</p>';
      return;
    }
    const counts = this.lineCounts();
    const focus = c.trains?.focusLine ?? null;
    body.innerHTML = c.transit.systems
      .map((sys) => {
        const lines = c.transit!.lines.filter((l) => l.system === sys.id);
        if (!lines.length) return '';
        // Live if this system's trains on the map right now come from a realtime feed. With none running,
        // fall back to the matching source (or the network's own claim, if any source is live at all).
        const running = [...(c.trains?.trains.values() ?? [])].filter((t) => t.dying === null && t.line.system === sys.id);
        const src = this.resp?.sources.find((s) => s.id.startsWith(c.id) && s.name.toLowerCase().includes(sys.name.split(' ')[0].toLowerCase()));
        const anyLive = this.resp ? this.resp.sources.some((s) => s.live) : true;
        const live = running.length ? running.some((t) => t.state.live) : src ? src.live && src.ok : anyLive && sys.live === 'realtime';
        return `<div class="sys"><h3>${esc(sys.name)} <span class="badge ${live ? 'live' : 'sched'}">${live ? 'live' : 'scheduled'}</span></h3>
          <div class="chips">${lines
            .map(
              (l) =>
                `<button class="chip ${focus === l.id ? 'focus' : focus ? 'dim' : ''}" data-line="${esc(l.id)}" title="${esc(l.name)} · ${counts.get(l.id) ?? 0} trains · click to highlight">${bullet(l, c.id, 22)}<span class="cnt">${counts.get(l.id) ?? 0}</span></button>`,
            )
            .join('')}</div></div>`;
      })
      .join('');
    body.querySelectorAll<HTMLElement>('.chip').forEach((el) => {
      // Hover previews the line's tracks; click highlights the line and all its trains.
      el.addEventListener('pointerenter', () => {
        const tl = this.app.city?.trains;
        if (tl && !tl.selected && !tl.focusLine) this.app.city!.network!.setFocus([el.dataset.line!]);
      });
      el.addEventListener('pointerleave', () => this.app.city?.trains?.refreshFocus());
      el.addEventListener('click', () => {
        const id = el.dataset.line!;
        if (isPhone()) this.toggleLegendSheet(false);
        this.app.focusLine(this.app.city?.trains?.focusLine === id ? null : id);
      });
    });
  }

  private lineCounts() {
    const m = new Map<string, number>();
    const t = this.app.city?.trains;
    if (t) for (const x of t.trains.values()) if (x.dying === null) m.set(x.line.id, (m.get(x.line.id) ?? 0) + 1);
    return m;
  }

  trainsChanged() {
    this.renderLegendCounts();
  }

  private renderLegendCounts() {
    const counts = this.lineCounts();
    this.root.querySelectorAll<HTMLElement>('.chip').forEach((el) => {
      const c = el.querySelector('.cnt');
      if (c) c.textContent = String(counts.get(el.dataset.line!) ?? 0);
    });
  }

  sourcesChanged(resp: TrainsResponse | null) {
    this.resp = resp;
    const live = this.$('.live');
    const txt = this.$('.live-text');
    const n = this.app.city?.trains?.count() ?? 0;
    if (!resp) {
      live.className = 'live err';
      txt.textContent = 'reconnecting…';
    } else {
      const anyLive = resp.sources.some((s) => s.live && s.ok);
      live.className = `live ${anyLive ? 'ok' : 'sched'}`;
      if (n === 0) txt.innerHTML = this.sleepyText();
      else {
        let num = txt.querySelector<HTMLElement>('b.num');
        const tail = `${n === 1 ? 'train' : 'trains'} ${anyLive ? 'live now' : 'running'}`;
        if (!num) {
          txt.innerHTML = `<b class="num" data-value="0">0</b> <span class="tail"></span>`;
          num = txt.querySelector<HTMLElement>('b.num')!;
        }
        txt.querySelector('.tail')!.textContent = tail;
        tweenNumber(num, n);
      }
      this.renderNotice(n);
      this.$('.sources').innerHTML = resp.sources
        .map(
          (s) =>
            `<div class="src ${s.ok ? 'ok' : 'bad'}"><i></i><span>${esc(s.name)}</span><span class="badge ${s.live ? 'live' : 'sched'}">${s.live ? 'live' : 'timetable'}</span><span class="muted">${s.trains} · ${s.updated ? `${Math.max(0, Math.round((Date.now() - s.updated) / 1000))}s ago` : 'waiting'}</span></div>`,
        )
        .join('');
    }
    this.renderLegend();
  }

  private renderNotice(n: number) {
    const el = this.$('.notice');
    const c = this.app.city;
    if (!c || n > 0) {
      reveal(el, false);
      return;
    }
    const first = FIRST_TRAIN[c.id];
    el.innerHTML = asleepNow(c.id)
      ? `<svg viewBox="0 0 24 24" width="22" height="22"><path d="M15 3a8.5 8.5 0 1 0 6 14.5A9.5 9.5 0 0 1 15 3z" fill="#ffd23f"/></svg><span>Shh — ${esc(CITIES[c.id].name)}'s trains are tucked in for the night. First departures are around <b>${Math.floor(first)}:${first % 1 ? '30' : '00'}</b> local time.</span>`
      : `<span>Waiting for the first live positions…</span>`;
    reveal(el, true);
  }

  private sleepyText() {
    const c = this.app.city;
    if (!c) return 'no trains';
    return asleepNow(c.id) ? '<b>zzz</b> the trains are asleep' : 'no trains reported';
  }

  // -------------------------------------------------------------------------
  hoverTrain(t: LiveTrain | null, x: number, y: number) {
    if (!t || t === this.app.city?.trains?.selected) {
      this.tipEl.classList.remove('shown');
      return;
    }
    const c = this.app.city!;
    this.tipEl.hidden = false;
    this.tipEl.classList.add('shown');
    this.tipEl.innerHTML = `${bullet(t.line, c.id, 20, t.state.service === 'Express' && c.id === 'nyc')}<span>to <b>${esc(t.state.dest)}</b></span><small>${esc(t.spec.name)}</small>`;
    this.tipEl.style.transform = `translate(${x + 14}px, ${y + 12}px)`;
  }

  showTrain(t: LiveTrain | null) {
    const card = this.$('.train-card');
    this.tipEl.classList.remove('shown');
    if (!t) {
      reveal(card, false);
      setTimeout(() => !shown(card) && this.preview.stop(), 360);
      if (!this.stationId) document.body.classList.remove('card-open');
      return;
    }
    this.closeStation();
    if (soundOn()) sfx.pop();
    const c = this.app.city!;
    const st = t.state;
    const spec = t.spec;
    const express = st.service === 'Express' && c.id === 'nyc';
    card.style.setProperty('--line', t.line.color);
    card.style.setProperty('--line-text', t.line.textColor);
    card.innerHTML = `
      <div class="tc-head">
        <button class="x" aria-label="Close">×</button>
        <div class="tc-line">${bullet(t.line, c.id, 34, express)}<div><div class="tc-linename">${esc(t.line.name)}${t.line.nameLocal ? ` <small>${esc(t.line.nameLocal)}</small>` : ''}</div>
        <div class="tc-sub">${[st.service, st.dir].filter(Boolean).map(esc).join(' · ')} <span class="badge ${st.live ? 'live' : 'sched'}">${st.live ? '● live' : 'timetable'}</span></div></div></div>
        <div class="tc-dest"><span>to</span> ${esc(st.dest)}${st.destLocal ? ` <small>${esc(st.destLocal)}</small>` : ''}</div>
      </div>
      <div class="tc-stock"></div>
      <div class="tc-spec"><b>${esc(spec.name)}</b><span>${esc(spec.maker)}${spec.introduced ? ` · ${spec.introduced}` : ''}</span></div>
      ${spec.blurb ? `<p class="tc-blurb">${esc(spec.blurb)}</p>` : ''}
      <div class="tc-facts">
        <div><b>${st.cars}</b><span>${spec.sections && spec.sections > 1 ? 'vehicles' : st.cars === 1 ? 'car' : 'cars'}</span></div>
        <div class="tc-delay"><b>—</b><span>status</span></div>
        ${st.label ? `<div><b class="mono">${esc(st.label)}</b><span>train</span></div>` : ''}
      </div>
      ${soundOn() ? '' : '<button class="sound-pill"><svg viewBox="0 0 24 24" width="18" height="18"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6M18 6.5a7.8 7.8 0 0 1 0 11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>Hear its announcements &amp; chimes</button>'}
      <div class="tc-now"></div>
      <ol class="tc-stops"></ol>
      <div class="tc-actions"><button class="follow">Follow</button><button class="share" title="Share this train">${SHARE_SVG}<span>Share</span></button><button class="random" title="R">Surprise me</button></div>
    `;
    card.querySelector('.tc-stock')!.appendChild(this.preview.canvas);
    this.preview.show(spec, t.line.color);
    card.querySelector('.x')!.addEventListener('click', () => this.app.selectTrain(null));
    card.querySelector('.follow')!.addEventListener('click', () => this.app.follow(!this.app.world.rig.following));
    card.querySelector('.random')!.addEventListener('click', () => this.randomTrain());
    card.querySelector('.share')!.addEventListener('click', () => void this.share());
    card.querySelector('.sound-pill')?.addEventListener('click', (e) => {
      (e.currentTarget as HTMLElement).remove();
      if (!soundOn()) this.toggleSound();
    });
    // Swapping from one train to another: the content springs in instead of the card re-sliding.
    if (shown(card)) replay(card, 'swap');
    reveal(card, true);
    document.body.classList.add('card-open');
    this.followChanged(this.app.world.rig.following);
    this.updateTrainCard(true);
  }

  followChanged(on: boolean) {
    const b = this.root.querySelector('.train-card .follow');
    if (b) {
      b.classList.toggle('on', on);
      b.textContent = on ? 'Following' : 'Follow';
    }
  }


  private updateTrainCard(force = false) {
    const t = this.app.city?.trains?.selected;
    const card = this.$('.train-card');
    if (!t || !shown(card)) return;

    const net = this.app.city!.network!;
    const now = this.app.world.now() / 1000;
    const st = t.state;
    const status = t.status;
    if (!st.stops[status.idx]) return;
    const name = (id: string) => net.stations.get(id)?.name ?? id;
    const local = (id: string) => (this.app.city!.id === 'tokyo' ? net.stations.get(id)?.nameLocal : undefined);
    let nowHtml = '';
    const at = st.stops[status.idx];
    if (status.kind === 'dwell') {
      const left = at.d - now;
      nowHtml = status.idx === st.stops.length - 1 && st.stops.length > 1 ? `Arrived at <b>${esc(name(at.s))}</b>` : `At <b>${esc(name(at.s))}</b>${left > 3 ? ` · departs in ${fmtEta(left)}` : ' · doors closing'}`;
    } else {
      const prev = st.stops[status.idx - 1];
      const eta = at.a - now;
      nowHtml = eta < 40 ? `Arriving at <b>${esc(name(at.s))}</b>` : `Between <b>${esc(name(prev.s))}</b> and <b>${esc(name(at.s))}</b>`;
    }
    const nowEl = card.querySelector('.tc-now')!;
    nowEl.innerHTML = `<span class="pulse"></span>${nowHtml}`;
    const d = st.delay;
    const delayEl = card.querySelector('.tc-delay b')!;
    if (!st.live) delayEl.textContent = 'Scheduled';
    else if (d === undefined || d === null) delayEl.textContent = 'Live';
    else if (d < 90) delayEl.textContent = 'On time';
    else delayEl.textContent = `${Math.round(d / 60)} min late`;
    const list = card.querySelector('.tc-stops')!;
    const from = status.kind === 'dwell' ? status.idx : status.idx;
    const upcoming = st.stops.slice(from).slice(0, 9);
    const html = upcoming
      .map((s, i) => {
        const isAt = i === 0 && status.kind === 'dwell';
        const eta = s.a - now;
        const l = local(s.s);
        return `<li class="${isAt ? 'at' : ''}" data-st="${esc(s.s)}"><i></i><span class="nm">${esc(name(s.s))}${l ? ` <small>${esc(l)}</small>` : ''}</span><span class="eta">${isAt ? 'here' : fmtEta(eta)}</span></li>`;
      })
      .join('');
    if (force || list.getAttribute('data-sig') !== html) {
      list.innerHTML = html;
      list.setAttribute('data-sig', html);
      list.querySelectorAll<HTMLElement>('li').forEach((li) => li.addEventListener('click', () => this.openStation(li.dataset.st!, true)));
    }
  }

  // -------------------------------------------------------------------------
  /** Stations sharing a name within a short walk act as one complex (e.g. JR and Toei Yoyogi). */
  private complexOf(id: string): string[] {
    const net = this.app.city?.network;
    const s = net?.stations.get(id);
    if (!net || !s) return [id];
    const key = s.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    const out: string[] = [];
    for (const o of net.stations.values()) {
      if (o.name.toLowerCase().replace(/[^a-z0-9]/g, '') !== key) continue;
      if (Math.hypot(o.pos.x - s.pos.x, o.pos.z - s.pos.z) < 500) out.push(o.id);
    }
    return out.length ? out : [id];
  }

  get openStationId() {
    return this.stationId;
  }

  /** The URL changed (selection or city); nothing to do yet beyond keeping share state fresh. */
  urlChanged() {}

  private stationFilter: string | null = null;
  private complex: string[] = [];

  openStation(id: string, fly = false) {
    const c = this.app.city;
    const s = c?.network?.stations.get(id);
    if (!c || !s) return;
    this.stationId = id;
    this.stationFilter = null;
    this.complex = this.complexOf(id);
    if (c.trains?.selected) this.app.selectTrain(null);
    if (c.trains?.focusLine) this.app.focusLine(null, false);
    const ids = new Set<string>();
    for (const sid of this.complex) for (const l of c.network!.stations.get(sid)?.lines ?? []) ids.add(l);
    const lines = c.transit!.lines.filter((l) => ids.has(l.id));
    const card = this.$('.station-card');
    card.style.setProperty('--line', lines[0]?.color ?? '#888');
    card.innerHTML = `
      <div class="sc-head"><button class="x" aria-label="Close">×</button><button class="head-share" aria-label="Share this station">${SHARE_SVG}</button>
        <div class="sc-name">${esc(s.name)}${s.nameLocal && c.id === 'tokyo' ? ` <small>${esc(s.nameLocal)}</small>` : ''}</div>
        <div class="sc-sub">${lines.length} ${lines.length === 1 ? 'line' : 'lines'} · tap one to filter</div>
        <div class="sc-lines">${lines.length > 1 ? '<button class="sc-line all on" data-line="">All</button>' : ''}${lines
          .map((l) => `<button class="sc-line" data-line="${esc(l.id)}" title="${esc(l.name)}">${bullet(l, c.id, 26)}</button>`)
          .join('')}</div>
      </div>
      <div class="board"><div class="board-title">Next trains</div><ol class="sc-arr"></ol></div>
      <button class="sc-seeline" hidden></button>`;
    card.querySelector('.x')!.addEventListener('click', () => this.closeStation());
    card.querySelector('.head-share')!.addEventListener('click', () => void this.share());
    card.querySelectorAll<HTMLElement>('.sc-line').forEach((el) =>
      el.addEventListener('click', () => {
        const id = el.dataset.line || null;
        this.stationFilter = this.stationFilter === id ? null : id;
        card.querySelectorAll<HTMLElement>('.sc-line').forEach((b) => b.classList.toggle('on', (b.dataset.line || null) === this.stationFilter));
        const see = card.querySelector<HTMLButtonElement>('.sc-seeline')!;
        const line = this.stationFilter ? c.network!.lines.get(this.stationFilter) : null;
        see.hidden = !line;
        if (line) {
          see.innerHTML = `See every ${esc(line.short || line.name)} train →`;
          see.style.setProperty('--line', line.color);
        }
        if (c.trains) {
          c.trains.stationLines = this.stationFilter ? [this.stationFilter] : [...ids];
          c.trains.refreshFocus();
        }
        this.updateStation(true);
      }),
    );
    card.querySelector('.sc-seeline')!.addEventListener('click', () => {
      if (this.stationFilter) this.app.focusLine(this.stationFilter);
    });
    if (c.trains) {
      c.trains.stationLines = [...ids];
      c.trains.refreshFocus();
    }
    if (shown(card)) replay(card, 'swap');
    reveal(card, true);
    document.body.classList.add('card-open');
    this.updateStation(true);
    if (fly) this.app.flyToStation(id);
    this.app.syncUrl(true);
  }

  closeStation() {
    this.stationId = null;
    const card = this.$('.station-card');
    reveal(card, false);
    const tl = this.app.city?.trains;
    if (tl?.stationLines) {
      tl.stationLines = null;
      tl.refreshFocus();
    }
    if (!tl?.selected && !tl?.focusLine) document.body.classList.remove('card-open');
    this.app.syncUrl(true);
  }

  private updateStation(force = false) {
    const c = this.app.city;
    if (!this.stationId || !c?.trains) return;
    const now = this.app.world.now() / 1000;
    const here = new Set(this.complex);
    const rows: { t: LiveTrain; eta: number }[] = [];
    for (const t of c.trains.trains.values()) {
      if (t.dying !== null) continue;
      if (this.stationFilter && t.line.id !== this.stationFilter) continue;
      const st = t.state.stops;
      for (let i = t.status.idx; i < st.length; i++) {
        if (here.has(st[i].s)) {
          const eta = st[i].a - now;
          if (eta > -40 && !(i === st.length - 1 && st.length > 1 && eta < 0)) rows.push({ t, eta });
          break;
        }
      }
    }
    rows.sort((a, b) => a.eta - b.eta);
    const html = rows
      .slice(0, 14)
      .map(
        ({ t, eta }) =>
          `<li data-id="${esc(t.id)}">${bullet(t.line, c.id, 22, t.state.service === 'Express' && c.id === 'nyc')}<span class="nm">${esc(t.state.dest)}</span><span class="eta">${eta <= 30 ? '<b class="blink">due</b>' : fmtEta(eta)}</span></li>`,
      )
      .join('');
    const list = this.root.querySelector('.station-card .sc-arr');
    if (!list) return;
    const out = html || '<li class="muted">No trains due right now</li>';
    if (force || list.getAttribute('data-sig') !== out) {
      list.innerHTML = out;
      list.setAttribute('data-sig', out);
      list.querySelectorAll<HTMLElement>('li[data-id]').forEach((li) =>
        li.addEventListener('click', () => {
          const t = c.trains!.trains.get(li.dataset.id!);
          if (t) this.app.selectTrain(t, true);
        }),
      );
    }
  }

  // -------------------------------------------------------------------------
  // Line focus: a card listing every train on the line, plus a floating pin over each one.
  private lineId: string | null = null;
  private pins: HTMLDivElement[] = [];

  showLine(id: string | null) {
    this.lineId = id;
    const card = this.$('.line-card');
    this.renderLegend();
    if (!id) {
      reveal(card, false);
      const tl = this.app.city?.trains;
      if (!tl?.selected && !this.stationId) document.body.classList.remove('card-open');
      return;
    }
    const c = this.app.city!;
    const line = c.network!.lines.get(id)!;
    card.style.setProperty('--line', line.color);
    card.style.setProperty('--line-text', line.textColor);
    card.innerHTML = `
      <div class="tc-head"><button class="x" aria-label="Close">×</button><button class="head-share" aria-label="Share this line">${SHARE_SVG}</button>
        <div class="tc-line">${bullet(line, c.id, 34)}<div><div class="tc-linename">${esc(line.name)}${line.nameLocal ? ` <small>${esc(line.nameLocal)}</small>` : ''}</div>
        <div class="tc-sub lc-count"></div></div></div>
      </div>
      <div class="lc-body"></div>`;
    card.querySelector('.x')!.addEventListener('click', () => this.app.focusLine(null));
    card.querySelector('.head-share')!.addEventListener('click', () => void this.share());
    if (shown(card)) replay(card, 'swap');
    reveal(card, true);
    document.body.classList.add('card-open');
    this.updateLine(true);
  }

  private updateLine(force = false) {
    const c = this.app.city;
    const id = this.lineId;
    if (!id || !c?.trains || !c.network) return;
    const now = this.app.world.now() / 1000;
    const name = (sid: string) => c.network!.stations.get(sid)?.name ?? sid;
    const trains = [...c.trains.trains.values()].filter((t) => t.dying === null && t.line.id === id);
    const groups = new Map<string, LiveTrain[]>();
    for (const t of trains) {
      const k = t.state.dest;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(t);
    }
    const eta = (t: LiveTrain) => (t.state.stops[t.status.idx]?.a ?? now) - now;
    const html = [...groups.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .map(([dest, list]) => {
        list.sort((a, b) => eta(a) - eta(b));
        return `<h4>To ${esc(dest)} <span>${list.length}</span></h4><ol>${list
          .map((t) => {
            const at = t.state.stops[t.status.idx];
            if (!at) return '';
            const where = t.status.kind === 'dwell' ? `At <b>${esc(name(at.s))}</b>` : `Next <b>${esc(name(at.s))}</b>`;
            const e = t.status.kind === 'dwell' ? 'boarding' : eta(t) < 25 ? 'arriving' : fmtEta(eta(t));
            return `<li data-id="${esc(t.id)}"><i></i><span class="nm">${where}</span><span class="eta">${e}</span></li>`;
          })
          .join('')}</ol>`;
      })
      .join('');
    const card = this.$('.line-card');
    const cnt = card.querySelector('.lc-count');
    if (cnt) cnt.textContent = `${trains.length} ${trains.length === 1 ? 'train' : 'trains'} running now`;
    const body = card.querySelector('.lc-body');
    if (!body) return;
    const out = html || '<p class="muted lc-empty">No trains on this line right now.</p>';
    if (force || body.getAttribute('data-sig') !== out) {
      body.innerHTML = out;
      body.setAttribute('data-sig', out);
      body.querySelectorAll<HTMLElement>('li[data-id]').forEach((li) =>
        li.addEventListener('click', () => {
          const t = c.trains!.trains.get(li.dataset.id!);
          if (t) this.app.selectTrain(t, true);
        }),
      );
    }
  }

  /** Floating bullets over every train of the focused line. */
  private placePins() {
    const c = this.app.city;
    const id = c?.trains?.focusLine ?? null;
    const layer = document.getElementById('labels')!;
    const list = id && c?.trains ? [...c.trains.trains.values()].filter((t) => t.dying === null && t.line.id === id) : [];
    while (this.pins.length < list.length) {
      const el = document.createElement('div');
      el.className = 'train-pin';
      el.addEventListener('click', () => {
        const t = el.dataset.id ? c?.trains?.trains.get(el.dataset.id) : null;
        if (t) this.app.selectTrain(t, true);
      });
      layer.appendChild(el);
      this.pins.push(el);
    }
    const v = new THREE.Vector2();
    const lift = new THREE.Vector3();
    this.pins.forEach((el, i) => {
      const t = list[i];
      if (!t) {
        el.classList.remove('on');
        return;
      }
      if (el.dataset.line !== t.line.id) {
        el.dataset.line = t.line.id;
        el.innerHTML = bullet(t.line, c!.id, 20);
      }
      el.dataset.id = t.id;
      this.app.world.rig.toScreen(lift.copy(t.mid).setY(t.mid.y + 4), v);
      el.style.transform = `translate(${v.x.toFixed(1)}px, ${v.y.toFixed(1)}px)`;
      el.classList.add('on');
    });
  }

  // -------------------------------------------------------------------------
  private async postcard() {
    const c = this.app.city;
    if (!c) return;
    const blob = await makePostcard(this.app);
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `tiny-trains-${c.id}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '')}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    this.toast('Postcard saved');
  }

  /** Share the current selection: the native share sheet where there is one, else copy the link. */
  async share(route?: Route, extra?: { title?: string; text?: string }) {
    const r = route ?? this.app.currentRoute();
    if (!r) return;
    const view = this.app.currentView();
    const url = location.origin + routePath(r) + themeQuery() + (!r.line && !r.station && !r.stock && view ? viewHash(view) : '');
    const { title, text } = { ...this.shareCopy(r), ...extra };
    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
    if (nav.share && (matchMedia('(pointer: coarse)').matches || /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent))) {
      try {
        await nav.share({ title, text, url });
        return;
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      this.toast('Link copied — paste it anywhere');
    } catch {
      window.prompt('Copy this link', url);
    }
  }

  private shareCopy(r: Route): { title: string; text: string } {
    const c = this.app.city;
    const city = CITIES[r.city].name;
    const line = r.line ? c?.network?.lines.get(r.line) : null;
    const lname = line ? (line.short && line.short.length <= 3 && r.city !== 'london' ? `the ${line.short}` : `the ${line.name.replace(/ line$/i, '')}`) : '';
    if (r.train) {
      const t = c?.trains?.trains.get(r.train);
      const dest = t ? ` to ${t.state.dest}` : '';
      return { title: `${cap(lname)} train${dest}, live · Tiny Trains`, text: `Riding along with ${lname} train${dest} in ${city}, right now 🚆` };
    }
    if (line) return { title: `Every ${line.name.replace(/ line$/i, '')} train, live · Tiny Trains`, text: `Every ${lname} train in ${city}, moving in real time 🚆` };
    if (r.station) {
      const st = c?.network?.stations.get(r.station);
      return { title: `${st?.name ?? 'Station'} · live departures · Tiny Trains`, text: `Trains arriving at ${st?.name} in ${city}, live 🚉` };
    }
    if (r.stock) {
      const spec = STOCK[r.stock];
      return { title: `${spec?.name ?? 'A train'}, live · Tiny Trains`, text: `Find a ${spec?.name} running in ${city} right now 🚆` };
    }
    const n = c?.trains?.count() ?? 0;
    return { title: `Every train in ${city}, live · Tiny Trains`, text: `${n ? `${n.toLocaleString()} trains` : 'Every train'} moving through ${city} right now, on a tiny toy map 🚆` };
  }

  toast(text: string) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = text;
    this.root.appendChild(t);
    setTimeout(() => t.classList.add('gone'), 1800);
    setTimeout(() => t.remove(), 2400);
  }

  // -------------------------------------------------------------------------
  toggleFleet(force?: boolean) {
    const f = this.$('.fleet');
    const open = force ?? !shown(f);
    if (!open) {
      reveal(f, false);
      return;
    }
    const c = this.app.city;
    if (!c?.trains) return;
    const groups = new Map<string, { spec: LiveTrain['spec']; trains: LiveTrain[]; lines: Map<string, LineDef> }>();
    for (const t of c.trains.trains.values()) {
      if (t.dying !== null) continue;
      let g = groups.get(t.spec.id);
      if (!g) groups.set(t.spec.id, (g = { spec: t.spec, trains: [], lines: new Map() }));
      g.trains.push(t);
      g.lines.set(t.line.id, t.line);
    }
    const list = [...groups.values()].sort((a, b) => b.trains.length - a.trains.length);
    const cars = list.reduce((n, g) => n + g.trains.reduce((m, t) => m + t.state.cars, 0), 0);
    f.innerHTML = `<button class="x" aria-label="Close">×</button>
      <h2>Meet the fleet</h2>
      <p class="muted">${list.length} kinds of train · ${cars.toLocaleString()} cars rolling around ${esc(CITIES[c.id].name)} right now. Tap one to ride along.</p>
      <div class="fleet-grid">${list
        .map((g, i) => {
          const line = [...g.lines.values()][0];
          const img = this.portraits.get(g.spec, line.color);
          return `<button class="fleet-card" style="--i:${i}" data-stock="${esc(g.spec.id)}">
            <img src="${img}" alt="${esc(g.spec.name)}" />
            <div class="fc-body"><div class="fc-name">${esc(g.spec.name)}</div>
            <div class="fc-meta">${esc(g.spec.maker)}${g.spec.introduced ? ` · ${g.spec.introduced}` : ''}</div>
            ${g.spec.blurb ? `<p>${esc(g.spec.blurb)}</p>` : ''}
            <div class="fc-lines"><b>${g.trains.length}</b> running on ${[...g.lines.values()].slice(0, 8).map((l) => bullet(l, c.id, 18)).join('')}</div></div>
            <span class="fc-share" role="button" tabindex="0" aria-label="Share ${esc(g.spec.name)}" data-stock="${esc(g.spec.id)}">${SHARE_SVG}</span>
          </button>`;
        })
        .join('')}</div>`;
    f.querySelector('.x')!.addEventListener('click', () => reveal(f, false));
    f.querySelectorAll<HTMLElement>('.fc-share').forEach((el) =>
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        void this.share({ city: c.id, stock: el.dataset.stock! });
      }),
    );
    f.querySelectorAll<HTMLElement>('.fleet-card').forEach((el) =>
      el.addEventListener('click', () => {
        reveal(f, false);
        // Pick from the trains running now: the panel may have been open a while.
        const layer = this.app.city?.trains;
        const live = layer ? [...layer.trains.values()].filter((t) => t.dying === null && t.spec.id === el.dataset.stock) : [];
        if (live.length) this.app.selectTrain(live[Math.floor(Math.random() * live.length)], true);
      }),
    );
    reveal(f, true);
  }

  private toggleAbout() {
    const a = this.$('.about');
    if (shown(a)) {
      reveal(a, false);
      return;
    }
    const c = this.app.city;
    const attr = c?.transit?.attribution ?? [];
    a.innerHTML = `<button class="x" aria-label="Close">×</button>
      <h2>Tiny Trains</h2>
      <p>Every dot is a real train, placed from live arrival predictions and vehicle feeds and animated along the actual track. The sky, sun, moon and weather match each city right now.</p>
      <p><b>Keys:</b> 1–9 cities · C city picker · / search · Q/E rotate · +/− zoom · F follow · T tour · R surprise train · G fleet · L sky · V theme · M sound · S share · P postcard · Esc close</p>
      <h3>Data</h3><ul>${attr.map((x) => `<li>${esc(x)}</li>`).join('')}<li>Map data © OpenStreetMap contributors · OpenMapTiles · OpenFreeMap</li><li>Weather: Open-Meteo</li></ul>
      <p class="muted">Schedules marked "timetable" are simulated from official timetables where no public live feed exists (or an API key isn't configured).</p>`;
    a.querySelector('.x')!.addEventListener('click', () => reveal(a, false));
    reveal(a, true);
  }

  // -------------------------------------------------------------------------
  /** Little ETA flags over the selected train's next stations. */
  private placeEtas() {
    const c = this.app.city;
    const t = c?.trains?.selected;
    const layer = document.getElementById('labels')!;
    while (this.etaEls.length < 4) {
      const el = document.createElement('div');
      el.className = 'eta-flag';
      layer.appendChild(el);
      this.etaEls.push(el);
    }
    const stops = t && t.dying === null ? t.state.stops.slice(t.status.kind === 'dwell' ? t.status.idx + 1 : t.status.idx, (t.status.kind === 'dwell' ? t.status.idx + 1 : t.status.idx) + 4) : [];
    const now = this.app.world.now() / 1000;
    const v = new THREE.Vector2();
    this.app.labels.suppress = new Set(stops.map((x) => `st:${x.s}`));
    this.etaEls.forEach((el, i) => {
      const s = stops[i];
      const st = s && c?.network?.stations.get(s.s);
      if (!st || !t) {
        el.classList.remove('on');
        return;
      }
      this.app.world.rig.toScreen(st.pos, v);
      const txt = `${st.name} · ${fmtEta(s.a - now)}`;
      if (el.dataset.txt !== txt) {
        el.dataset.txt = txt;
        el.innerHTML = `<b>${esc(fmtEta(s.a - now))}</b>${esc(st.name)}`;
        el.style.setProperty('--c', t.line.color);
      }
      el.classList.add('on');
      el.style.transform = `translate(${v.x.toFixed(1)}px, ${v.y.toFixed(1)}px)`;
    });
  }

  frame(f: FrameInfo) {
    this.soundscape.update(f);
    // On phones, keep whatever you're looking at centered in the map area above an open sheet.
    let shift = 0;
    if (isPhone()) {
      for (const card of this.root.querySelectorAll<HTMLElement>('.card:not([hidden])')) shift = Math.max(shift, card.getBoundingClientRect().height / 2);
    }
    this.app.world.rig.shiftY = shift;
    this.placeEtas();
    this.placePins();
    const rig = this.app.world.rig;
    const compass = this.root.querySelector<HTMLElement>('.compass svg');
    if (compass) compass.style.transform = `rotate(${rig.azimuth}rad)`;
    const sec = Math.floor(f.time * 4);
    if (sec !== this.lastSec) {
      this.lastSec = sec;
      this.updateTrainCard();
      this.updateStation();
      if (sec % 4 === 0) this.updateLine();
      if (sec % 4 === 0) this.renderClock();
      if (sec % 120 === 0) this.renderTickets();
    }
  }

  private renderClock() {
    const c = this.app.city;
    if (!c) return;
    const w = this.app.weather[c.id];
    const a = this.app.world.atmosphere.state;
    const kind = w ? weatherKind(w.code) : null;
    const words: Record<string, string> = { clear: a.night > 0.5 ? 'Clear night' : 'Sunny', cloudy: 'Cloudy', fog: c.id === 'sf' ? 'Karl the Fog' : 'Foggy', drizzle: 'Drizzle', rain: 'Rain', snow: 'Snow', storm: 'Thunderstorms' };
    this.$('.clock').innerHTML = `${wxIcon(w, a.night > 0.5)}<span><b>${esc(localTime(c.id, Date.now()))}</b> in ${esc(CITIES[c.id].name)}${kind ? ` · ${words[kind]}` : ''}${w ? ` · ${Math.round(w.temp)}°C` : ''}</span>`;
  }
}
