// Taipei Metro's keyless train-arrival feed (data.taipei "臺北捷運列車到站站名"): every ~30 s it lists the trains
// entering a platform right now on the BR, R, G, O and BL lines, with their destination. Each sighting is matched to
// the timetable trip heading there that is due at that station closest to that moment, and pins its delay.
import { readJson } from '../../data.ts';
import { politeFetch, type RealtimeSource, type RtTrip } from '../gtfs/realtime.ts';
import type { GtfsSchedule } from '../gtfs/schedule.ts';

const FEED = 'https://tcgmetro.blob.core.windows.net/stationnames/stations.json';
const EVERY_MS = 25_000;
/** Sightings older than this stop shaping their train (its later stops keep the delay until then). */
const KEEP_S = 900;
/**
 * How early or late a train may be and still match a timetable trip, seconds. Wenhu line trips are spaced by its
 * published headways rather than timed, so a sighting takes the nearest one within half a headway.
 */
const WINDOW: Record<string, [number, number]> = { BR: [150, 150] };
const EARLY = 120;
const LATE = 240;

interface FeedRow {
  Station: string;
  Destination: string;
  UpdateTime: string; // yyyyMMddHHmmss, Taipei time
}

interface Sighting {
  stations: number[]; // schedule station indices named like the platform
  dest: Set<string>; // station ids named like the destination
  t: number; // epoch s
  key?: string; // matched trip key
}

const nameKey = (s: string) => s.replace(/臺/g, '台').replace(/站$/, '').replace(/\s+/g, '');

export class TaipeiArrivals implements RealtimeSource {
  readonly name = 'train arrivals';
  private names?: Map<string, string[]>;
  private sightings = new Map<string, Sighting>();
  private fetched = 0;
  private fresh = 0;
  private rt: RtTrip[] = [];

  async refresh(nowMs: number, sched: GtfsSchedule): Promise<void> {
    if (nowMs - this.fetched < EVERY_MS) return;
    this.fetched = nowMs;
    this.names ??= new Map(Object.entries(readJson<Record<string, string[]>>('server/data/taipei/names.json')));
    const res = await politeFetch(FEED, { headers: { accept: 'application/json' } }, { perMinute: 4 });
    const list = JSON.parse((await res.text()).replace(/^\uFEFF/, '')) as FeedRow[];
    const now = nowMs / 1000;
    for (const r of list) {
      const m = r.UpdateTime?.match(/^(\d{4})(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)$/);
      if (!m) continue;
      const t = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4] - 8, +m[5], +m[6]) / 1000;
      if (now - t > KEEP_S || t - now > 120) continue;
      const at = this.names.get(nameKey(r.Station)), dest = this.names.get(nameKey(r.Destination));
      if (!at || !dest) continue;
      const id = `${r.Station}|${r.Destination}|${t}`;
      if (!this.sightings.has(id))
        this.sightings.set(id, { stations: at.map((s) => sched.stationIndex(s)!).filter((i) => i != null), dest: new Set(dest), t });
    }
    for (const [id, s] of this.sightings) if (now - s.t > KEEP_S) this.sightings.delete(id);
    this.match(sched, now);
    this.fresh = nowMs;
  }

  trips(nowMs: number): RtTrip[] | undefined {
    return nowMs - this.fresh < 180_000 && this.rt.length ? this.rt : undefined;
  }

  /**
   * Pair sightings with timetable trips, closest in time first. A trip can take several sightings (the same train
   * seen at successive stations) when they agree with its run times; a sighting keeps its trip once matched.
   */
  private match(sched: GtfsSchedule, now: number) {
    const lines = new Set(sched.data.lines.flatMap((l, i) => (l.system === 'trtc' ? [i] : [])));
    const active = sched.active(now, lines, KEEP_S + LATE, 600);
    const byKey = new Map(active.map((t) => [sched.key(t.row)!, t]));
    const claims = new Map<string, { s: Sighting; i: number }[]>();
    const indexIn = (s: Sighting, st: string[]) => st.findIndex((id) => s.stations.includes(sched.stationIndex(id)!));
    const fits = (key: string, s: Sighting, i: number) => {
      const t = byKey.get(key)!;
      return (claims.get(key) ?? []).every((c) => c.i !== i && Math.sign(c.i - i) === Math.sign(c.s.t - s.t) && Math.abs(c.s.t - s.t - (t.times[2 * c.i] - t.times[2 * i])) < 180);
    };
    const claim = (key: string, s: Sighting, i: number) => {
      s.key = key;
      (claims.get(key) ?? claims.set(key, []).get(key)!).push({ s, i });
    };
    const pending: Sighting[] = [];
    for (const s of this.sightings.values()) {
      const t = s.key ? byKey.get(s.key) : undefined;
      const i = t ? indexIn(s, t.st) : -1;
      if (t && i >= 0) claim(s.key!, s, i);
      else {
        s.key = undefined;
        pending.push(s);
      }
    }
    const pairs: { s: Sighting; key: string; i: number; diff: number }[] = [];
    for (const s of pending)
      for (const [key, t] of byKey) {
        if (!s.dest.has(t.st.at(-1)!)) continue;
        const i = indexIn(s, t.st);
        if (i < 0) continue;
        const diff = s.t - t.times[2 * i];
        const [early, late] = WINDOW[t.line] ?? [EARLY, LATE];
        if (diff >= -early && diff <= late) pairs.push({ s, key, i, diff });
      }
    pairs.sort((a, b) => Math.abs(a.diff) - Math.abs(b.diff));
    for (const p of pairs) if (!p.s.key && fits(p.key, p.s, p.i)) claim(p.key, p.s, p.i);
    this.rt = [...claims].map(([key, list]) => {
      const last = list.reduce((a, b) => (b.s.t > a.s.t ? b : a));
      return { key, stops: [{ station: sched.stationIndex(byKey.get(key)!.st[last.i])!, a: last.s.t }] };
    });
  }
}
