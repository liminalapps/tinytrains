import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Adapters read their static data through here. Under Node it comes from the repo; on Cloudflare
// (no filesystem) the Durable Object fetches the files from static assets and provides them first.

const provided = new Map<string, string>();

/** Register a file's contents under its repo-relative path, e.g. 'server/data/nyc/schedule.json'. */
export function provideData(rel: string, text: string) {
  provided.set(rel, text);
}

export function readJson<T>(rel: string): T {
  const text = provided.get(rel);
  if (text !== undefined) {
    // Each file is parsed once; drop the raw text so it doesn't sit in memory next to the objects.
    provided.delete(rel);
    return JSON.parse(text) as T;
  }
  return JSON.parse(readFileSync(join(import.meta.dirname, '..', rel), 'utf8')) as T;
}

/** Files each city's adapters read, relative to the repo root. */
export const CITY_DATA: Record<string, string[]> = {
  nyc: ['public/data/nyc/transit.json', 'server/data/nyc/schedule.json'],
  sf: ['server/data/sf/bart.json', 'server/data/sf/muni.json', 'server/data/sf/caltrain.json'],
  london: ['public/data/london/transit.json', 'server/data/london/routes.json'],
  tokyo: ['server/data/tokyo/schedule.json'],
  paris: ['server/data/paris/schedule.json'],
  berlin: ['server/data/berlin/schedule.json'],
  hongkong: ['server/data/hongkong/network.json'],
  seoul: ['server/data/seoul/network.json', 'server/data/seoul/timetable.json'],
  madrid: ['public/data/madrid/transit.json', 'server/data/madrid/metro.json', 'server/data/madrid/ml.json', 'server/data/madrid/cercanias.json'],
  moscow: ['server/data/moscow/sim.json'],
  singapore: ['server/data/singapore/sim.json'],
  vienna: ['server/data/vienna/schedule.json', 'server/data/vienna/rbl.json'],
  mexicocity: ['server/data/mexicocity/schedule.json'],
  chongqing: ['server/data/chongqing/sim.json'],
  washington: ['server/data/washington/schedule.json'],
  chengdu: ['server/data/chengdu/sim.json'],
  delhi: ['server/data/delhi/sim.json'],
  saopaulo: ['server/data/saopaulo/sim.json'],
  cairo: ['server/data/cairo/sim.json'],
  boston: ['server/data/boston/schedule.json'],
  chicago: ['server/data/chicago/schedule.json'],
  stockholm: ['server/data/stockholm/schedule.json'],
  taipei: ['server/data/taipei/schedule.json', 'server/data/taipei/names.json'],
  osaka: ['server/data/osaka/sim.json'],
  wuhan: ['server/data/wuhan/sim.json'],
  hangzhou: ['server/data/hangzhou/sim.json'],
  shanghai: ['server/data/shanghai/sim.json'],
  beijing: ['server/data/beijing/sim.json'],
  sydney: ['server/data/sydney/schedule.json'],
  guangzhou: ['server/data/guangzhou/sim.json'],
  shenzhen: ['server/data/shenzhen/sim.json'],
  oslo: ['server/data/oslo/schedule.json'],
  helsinki: ['server/data/helsinki/schedule.json'],
  budapest: ['server/data/budapest/schedule.json'],
  philadelphia: ['server/data/philadelphia/schedule.json'],
  milan: ['server/data/milan/schedule.json'],
  rome: ['server/data/rome/schedule.json', 'server/data/rome/sim.json'],
  prague: ['server/data/prague/schedule.json'],
  dubai: ['server/data/dubai/schedule.json', 'server/data/dubai/sim.json'],
  montreal: ['server/data/montreal/schedule.json', 'server/data/montreal/sim.json'],
  lisbon: ['server/data/lisbon/schedule.json'],
};
