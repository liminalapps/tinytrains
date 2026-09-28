import { PbfReader } from 'pbf';

// Minimal GTFS-realtime decoder that keeps the NYCT extensions (field 1001), which
// gtfs-realtime-bindings drops: train_id, is_assigned, direction and tracks.

export interface RtTrip {
  tripId: string;
  startTime?: string;
  startDate?: string;
  routeId?: string;
  schedRel?: number;
  trainId?: string;
  assigned?: boolean;
  nyctDir?: number; // 1 north, 2 east, 3 south, 4 west
}

export interface RtStopTime {
  seq?: number;
  stopId: string;
  arr?: number;
  dep?: number;
  track?: string;
}

export interface RtTripUpdate {
  trip: RtTrip;
  stops: RtStopTime[];
  timestamp?: number;
}

export interface RtVehicle {
  trip: RtTrip;
  seq?: number;
  status?: number; // 0 INCOMING_AT, 1 STOPPED_AT, 2 IN_TRANSIT_TO
  timestamp?: number;
  stopId?: string;
}

export interface RtFeed {
  timestamp: number;
  updates: RtTripUpdate[];
  vehicles: RtVehicle[];
}

type R = PbfReader;

function readNyctTrip(tag: number, t: RtTrip, pbf: R) {
  if (tag === 1) t.trainId = pbf.readString();
  else if (tag === 2) t.assigned = pbf.readBoolean();
  else if (tag === 3) t.nyctDir = pbf.readVarint();
}

function readTrip(tag: number, t: RtTrip, pbf: R) {
  if (tag === 1) t.tripId = pbf.readString();
  else if (tag === 2) t.startTime = pbf.readString();
  else if (tag === 3) t.startDate = pbf.readString();
  else if (tag === 4) t.schedRel = pbf.readVarint();
  else if (tag === 5) t.routeId = pbf.readString();
  else if (tag === 1001) pbf.readMessage(readNyctTrip, t);
}

function readEvent(tag: number, e: { time?: number }, pbf: R) {
  if (tag === 2) e.time = pbf.readVarint(true);
}

function readNyctStop(tag: number, s: RtStopTime, pbf: R) {
  if (tag === 2) s.track = pbf.readString();
  else if (tag === 1 && !s.track) s.track = pbf.readString();
}

function readStopTime(tag: number, s: RtStopTime, pbf: R) {
  if (tag === 1) s.seq = pbf.readVarint();
  else if (tag === 2) s.arr = pbf.readMessage(readEvent, {} as { time?: number }).time;
  else if (tag === 3) s.dep = pbf.readMessage(readEvent, {} as { time?: number }).time;
  else if (tag === 4) s.stopId = pbf.readString();
  else if (tag === 1001) pbf.readMessage(readNyctStop, s);
}

function readTripUpdate(tag: number, u: RtTripUpdate, pbf: R) {
  if (tag === 1) pbf.readMessage(readTrip, u.trip);
  else if (tag === 2) u.stops.push(pbf.readMessage(readStopTime, { stopId: '' } as RtStopTime));
  else if (tag === 4) u.timestamp = pbf.readVarint();
}

function readVehicle(tag: number, v: RtVehicle, pbf: R) {
  if (tag === 1) pbf.readMessage(readTrip, v.trip);
  else if (tag === 3) v.seq = pbf.readVarint();
  else if (tag === 4) v.status = pbf.readVarint();
  else if (tag === 5) v.timestamp = pbf.readVarint();
  else if (tag === 7) v.stopId = pbf.readString();
}

function readEntity(tag: number, f: RtFeed, pbf: R) {
  if (tag === 3) f.updates.push(pbf.readMessage(readTripUpdate, { trip: { tripId: '' }, stops: [] } as RtTripUpdate));
  else if (tag === 4) {
    const v = pbf.readMessage(readVehicle, { trip: { tripId: '' } } as RtVehicle);
    if (v.status === undefined) v.status = 2;
    f.vehicles.push(v);
  }
}

function readHeader(tag: number, f: RtFeed, pbf: R) {
  if (tag === 3) f.timestamp = pbf.readVarint();
}

function readFeed(tag: number, f: RtFeed, pbf: R) {
  if (tag === 1) pbf.readMessage(readHeader, f);
  else if (tag === 2) pbf.readMessage(readEntity, f);
}

export function decodeFeed(buf: Uint8Array): RtFeed {
  return new PbfReader(buf).readFields(readFeed, { timestamp: 0, updates: [], vehicles: [] } as RtFeed);
}
