import { readJson } from '../../data.ts';
import { LINES, type HkLine } from './lines.ts';

export type Dir = 'UP' | 'DOWN';

interface NetworkFile {
  names: Record<string, [string, string]>;
  patterns: Record<string, { dir: Dir; via?: string; stops: string[] }[]>;
  len: Record<string, number>;
}

/** One stopping pattern of a line in one direction, with modeled run times. */
export interface Pattern {
  line: HkLine;
  dir: Dir;
  via?: string;
  stops: string[];
  /** run[i]: modeled seconds from leaving stops[i - 1] to arriving at stops[i] (run[0] = 0). */
  run: number[];
}

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** Run time over `len` meters with a trapezoidal speed profile. */
function runTime(l: HkLine, len: number): number {
  return len >= (l.v * l.v) / l.acc ? len / l.v + l.v / l.acc : 2 * Math.sqrt(len / l.acc);
}

/** Static MTR network: station names and the stopping patterns of every line. */
export class Network {
  names = new Map<string, [string, string]>();
  /** Patterns per `${line}|${dir}`; the first one is the full-length main line. */
  patterns = new Map<string, Pattern[]>();

  constructor() {
    const data = readJson<NetworkFile>('server/data/hongkong/network.json');
    for (const [code, n] of Object.entries(data.names)) this.names.set(code, n);
    for (const l of LINES) {
      for (const p of data.patterns[l.id] ?? []) {
        const run = p.stops.map((s, i) => (i ? runTime(l, data.len[pairKey(p.stops[i - 1], s)] ?? 1500) : 0));
        const k = `${l.id}|${p.dir}`;
        this.patterns.set(k, [...(this.patterns.get(k) ?? []), { line: l, dir: p.dir, via: p.via, stops: p.stops, run }]);
      }
    }
  }

  main(line: string, dir: Dir): Pattern | undefined {
    return this.patterns.get(`${line}|${dir}`)?.[0];
  }

  /**
   * The pattern a train runs on and the index of its destination in it. It must pass the observed
   * stations in order; `via` picks the Racecourse variants of the East Rail Line. Patterns failing
   * `plausible` (the train would have shown up on a board it is missing from) are only used as a last resort.
   */
  pattern(
    line: string,
    dir: Dir,
    dest: string,
    via: string | undefined,
    seen: string[],
    plausible: (p: Pattern) => boolean = () => true,
  ): { p: Pattern; end: number } | undefined {
    const list = this.patterns.get(`${line}|${dir}`) ?? [];
    const fits = (p: Pattern, needDest: boolean) => {
      let at = -1;
      for (const s of seen) {
        const i = p.stops.indexOf(s, at + 1);
        if (i < 0) return -1;
        at = i;
      }
      const end = p.stops.indexOf(dest, Math.max(at, 0));
      if (end >= 0) return end;
      return needDest ? -1 : p.stops.length - 1;
    };
    const tries: [(p: Pattern) => boolean, boolean][] = [
      [(p) => (p.via ?? '') === (via ?? '') && p.stops[p.stops.length - 1] === dest, true],
      [(p) => (p.via ?? '') === (via ?? ''), true],
      [() => true, true],
      [(p) => !p.via, false],
    ];
    for (const strict of [true, false]) {
      for (const [ok, needDest] of tries) {
        for (const p of list) {
          if (!ok(p) || (strict && !plausible(p))) continue;
          const end = fits(p, needDest);
          if (end > 0) return { p, end };
        }
      }
    }
    return undefined;
  }
}
