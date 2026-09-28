// Metro de Madrid and Metro Ligero: neither publishes realtime data, so trains run on the CRTM timetable.
import type { TrainState } from '../../../shared/types.ts';
import type { Adapter } from '../types.ts';
import { fleetFor } from './lines.ts';
import { activeTrips, loadSchedule, windowTimeline } from './schedule.ts';

export function timetableAdapter(o: { id: string; name: string; schedule: string; prefix: string }): Adapter {
  const sched = loadSchedule(o.schedule);

  async function poll(nowMs: number): Promise<TrainState[]> {
    const now = nowMs / 1000;
    const trains: TrainState[] = [];
    for (const t of activeTrips(sched, o.prefix, now, 60, 90)) {
      const stops = windowTimeline(t.pat.st, t.times, now);
      if (!stops) continue;
      trains.push({ id: t.id, line: t.pat.line, dest: sched.heads[t.row[3]], dir: t.pat.dn, live: false, stops, ...fleetFor(t.pat.line, t.pat.v, t.id) });
    }
    return trains;
  }

  return { id: o.id, city: 'madrid', name: `${o.name} · timetable`, live: false, intervalMs: 30_000, poll };
}
