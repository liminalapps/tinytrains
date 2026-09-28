// GTFS kit, runtime side. See docs/KIT_GTFS.md.
export { gtfsAdapters, type GtfsAdapterSpec } from './adapter.ts';
export { gtfsRealtime, politeFetch, decodeFeed, type GtfsRealtimeOptions, type RealtimeSource, type RtStopTime, type RtTrip, type TripDescriptor } from './realtime.ts';
export { GtfsSchedule, type ActiveTrip, type GtfsScheduleData, type StockMix } from './schedule.ts';
