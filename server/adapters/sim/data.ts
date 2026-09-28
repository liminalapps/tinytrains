// server/data/<city>/sim.json: what the sim kit's build writes and its runtime reads.

/** One day type's service: times are seconds after the service day's midnight (local time). */
export interface SimDay {
  first: number;
  last: number;
  hw: [number, number][]; // [from, headway seconds], sorted; 0: no departures until the next band
  terminals?: Record<string, { first?: number; last?: number }>; // by departure terminal key
}

/** Weekday, Saturday, Sunday/holiday. */
export type SimWeek = [SimDay, SimDay, SimDay];

export interface SimPattern {
  id: string;
  group: string; // departure sequence: patterns of a group (and direction) take turns
  share: number;
  from: string; // terminal key the train departs from (for per-terminal first/last)
  st: number[]; // station indices inside the map, in travel order
  stop?: number[]; // 1 stops, 0 passes (expresses, incl. where one leaves the map); absent: stops everywhere
  t: number[]; // [a0, d0, a1, d1, ...] seconds after the departure from the terminal (which may lie outside the map)
  dest: [string, string]; // destination [English, local]
  dir?: string; // direction label
  service?: [string, string];
  stock?: SimStock[]; // overrides the line's mix
  align?: number; // seconds from the terminal to the station where the group's departures are evenly spaced
}

export interface SimStock {
  stock: string;
  share: number;
  cars: number;
}

export interface SimLine {
  service: SimWeek;
  groups?: Record<string, SimWeek>;
  patterns: SimPattern[];
  stock: SimStock[];
}

export interface SimData {
  city: string;
  built: string;
  stations: string[];
  calendar: { holidays: string[]; workdays: string[]; weekend: number[]; dayStart: number };
  lines: Record<string, SimLine>;
}
