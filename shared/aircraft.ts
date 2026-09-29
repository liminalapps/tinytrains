// Aircraft types (by ICAO type designator) and airline liveries (by ICAO callsign prefix), for drawing the live
// planes as their real models. Dimensions are the manufacturers' published length and wingspan in meters.

export type Layout =
  | 'jet' // low wing, engines under the wings
  | 'jet4' // four engines under the wings
  | 'jumbo' // 747: four engines and the hump
  | 'a380' // double deck, four engines
  | 'trijet' // two under the wings and one in the tail
  | 'aft' // engines on the rear fuselage, T-tail (CRJ, ERJ, business jets, MD-80)
  | 'turboprop' // high wing, two props, T-tail (ATR, Dash 8)
  | 'twinprop' // low wing, two props (King Air, Saab 340)
  | 'single' // single prop, high wing (Cessna)
  | 'singlelow' // single prop, low wing (Piper, Cirrus)
  | 'heli' // helicopter
  | 'lifter'; // military high-wing jet or four-prop transport (C-17, C-130)

export interface AircraftType {
  name: string;
  len: number;
  span: number;
  layout: Layout;
}

const T = (name: string, len: number, span: number, layout: Layout): AircraftType => ({ name, len, span, layout });

export const AIRCRAFT: Record<string, AircraftType> = {
  // Airbus
  A318: T('Airbus A318', 31.4, 34.1, 'jet'),
  A319: T('Airbus A319', 33.8, 35.8, 'jet'),
  A320: T('Airbus A320', 37.6, 35.8, 'jet'),
  A321: T('Airbus A321', 44.5, 35.8, 'jet'),
  A19N: T('Airbus A319neo', 33.8, 35.8, 'jet'),
  A20N: T('Airbus A320neo', 37.6, 35.8, 'jet'),
  A21N: T('Airbus A321neo', 44.5, 35.8, 'jet'),
  BCS1: T('Airbus A220-100', 35.0, 35.1, 'jet'),
  BCS3: T('Airbus A220-300', 38.7, 35.1, 'jet'),
  A306: T('Airbus A300-600', 54.1, 44.8, 'jet'),
  A30B: T('Airbus A300', 53.6, 44.8, 'jet'),
  A310: T('Airbus A310', 46.7, 43.9, 'jet'),
  A332: T('Airbus A330-200', 58.8, 60.3, 'jet'),
  A333: T('Airbus A330-300', 63.7, 60.3, 'jet'),
  A338: T('Airbus A330-800neo', 58.8, 64.0, 'jet'),
  A339: T('Airbus A330-900neo', 63.7, 64.0, 'jet'),
  A342: T('Airbus A340-200', 59.4, 60.3, 'jet4'),
  A343: T('Airbus A340-300', 63.7, 60.3, 'jet4'),
  A345: T('Airbus A340-500', 67.9, 63.5, 'jet4'),
  A346: T('Airbus A340-600', 75.4, 63.5, 'jet4'),
  A359: T('Airbus A350-900', 66.8, 64.8, 'jet'),
  A35K: T('Airbus A350-1000', 73.8, 64.8, 'jet'),
  A388: T('Airbus A380', 72.7, 79.8, 'a380'),
  // Boeing
  B712: T('Boeing 717', 37.8, 28.5, 'aft'),
  B732: T('Boeing 737-200', 30.5, 28.4, 'jet'),
  B733: T('Boeing 737-300', 33.4, 28.9, 'jet'),
  B734: T('Boeing 737-400', 36.4, 28.9, 'jet'),
  B735: T('Boeing 737-500', 31.0, 28.9, 'jet'),
  B736: T('Boeing 737-600', 31.2, 35.8, 'jet'),
  B737: T('Boeing 737-700', 33.6, 35.8, 'jet'),
  B738: T('Boeing 737-800', 39.5, 35.8, 'jet'),
  B739: T('Boeing 737-900', 42.1, 35.8, 'jet'),
  B37M: T('Boeing 737 MAX 7', 35.6, 35.9, 'jet'),
  B38M: T('Boeing 737 MAX 8', 39.5, 35.9, 'jet'),
  B39M: T('Boeing 737 MAX 9', 42.2, 35.9, 'jet'),
  B3XM: T('Boeing 737 MAX 10', 43.8, 35.9, 'jet'),
  B752: T('Boeing 757-200', 47.3, 38.1, 'jet'),
  B753: T('Boeing 757-300', 54.4, 38.1, 'jet'),
  B762: T('Boeing 767-200', 48.5, 47.6, 'jet'),
  B763: T('Boeing 767-300', 54.9, 47.6, 'jet'),
  B764: T('Boeing 767-400', 61.4, 51.9, 'jet'),
  B772: T('Boeing 777-200', 63.7, 60.9, 'jet'),
  B77L: T('Boeing 777-200LR', 63.7, 64.8, 'jet'),
  B773: T('Boeing 777-300', 73.9, 60.9, 'jet'),
  B77W: T('Boeing 777-300ER', 73.9, 64.8, 'jet'),
  B778: T('Boeing 777-8', 70.9, 71.8, 'jet'),
  B779: T('Boeing 777-9', 76.7, 71.8, 'jet'),
  B788: T('Boeing 787-8', 56.7, 60.1, 'jet'),
  B789: T('Boeing 787-9', 62.8, 60.1, 'jet'),
  B78X: T('Boeing 787-10', 68.3, 60.1, 'jet'),
  B742: T('Boeing 747-200', 70.6, 59.6, 'jumbo'),
  B744: T('Boeing 747-400', 70.7, 64.4, 'jumbo'),
  B748: T('Boeing 747-8', 76.3, 68.4, 'jumbo'),
  MD11: T('McDonnell Douglas MD-11', 61.6, 51.7, 'trijet'),
  DC10: T('McDonnell Douglas DC-10', 55.5, 50.4, 'trijet'),
  MD82: T('McDonnell Douglas MD-82', 45.1, 32.9, 'aft'),
  MD83: T('McDonnell Douglas MD-83', 45.1, 32.9, 'aft'),
  MD88: T('McDonnell Douglas MD-88', 45.1, 32.9, 'aft'),
  MD90: T('McDonnell Douglas MD-90', 46.5, 32.9, 'aft'),
  // Embraer, Bombardier, regional
  E135: T('Embraer ERJ 135', 26.3, 20.0, 'aft'),
  E145: T('Embraer ERJ 145', 29.9, 20.0, 'aft'),
  E45X: T('Embraer ERJ 145XR', 29.9, 20.0, 'aft'),
  E170: T('Embraer E170', 29.9, 26.0, 'jet'),
  E75L: T('Embraer E175', 31.7, 26.0, 'jet'),
  E75S: T('Embraer E175', 31.7, 26.0, 'jet'),
  E190: T('Embraer E190', 36.2, 28.7, 'jet'),
  E195: T('Embraer E195', 38.7, 28.7, 'jet'),
  E290: T('Embraer E190-E2', 36.2, 33.7, 'jet'),
  E295: T('Embraer E195-E2', 41.5, 35.1, 'jet'),
  CRJ1: T('Bombardier CRJ100', 26.8, 21.2, 'aft'),
  CRJ2: T('Bombardier CRJ200', 26.8, 21.2, 'aft'),
  CRJ7: T('Bombardier CRJ700', 32.5, 23.2, 'aft'),
  CRJ9: T('Bombardier CRJ900', 36.2, 24.9, 'aft'),
  CRJX: T('Bombardier CRJ1000', 39.1, 26.2, 'aft'),
  AT43: T('ATR 42', 22.7, 24.6, 'turboprop'),
  AT45: T('ATR 42-500', 22.7, 24.6, 'turboprop'),
  AT46: T('ATR 42-600', 22.7, 24.6, 'turboprop'),
  AT72: T('ATR 72', 27.2, 27.1, 'turboprop'),
  AT75: T('ATR 72-500', 27.2, 27.1, 'turboprop'),
  AT76: T('ATR 72-600', 27.2, 27.1, 'turboprop'),
  DH8A: T('De Havilland Dash 8-100', 22.3, 25.9, 'turboprop'),
  DH8B: T('De Havilland Dash 8-200', 22.3, 25.9, 'turboprop'),
  DH8C: T('De Havilland Dash 8-300', 25.7, 27.4, 'turboprop'),
  DH8D: T('De Havilland Dash 8-400', 32.8, 28.4, 'turboprop'),
  SF34: T('Saab 340', 19.7, 21.4, 'twinprop'),
  SB20: T('Saab 2000', 27.3, 24.8, 'twinprop'),
  B190: T('Beechcraft 1900', 17.6, 17.7, 'twinprop'),
  JS41: T('BAe Jetstream 41', 19.3, 18.3, 'twinprop'),
  SU95: T('Sukhoi Superjet 100', 29.9, 27.8, 'jet'),
  C919: T('COMAC C919', 38.9, 35.8, 'jet'),
  AJ27: T('COMAC C909', 33.5, 27.3, 'aft'),
  // Business jets
  C25A: T('Cessna Citation CJ2', 14.5, 15.1, 'aft'),
  C25B: T('Cessna Citation CJ3', 15.6, 16.3, 'aft'),
  C25C: T('Cessna Citation CJ4', 16.3, 15.5, 'aft'),
  C510: T('Cessna Citation Mustang', 12.4, 13.2, 'aft'),
  C525: T('Cessna CitationJet', 13.0, 14.3, 'aft'),
  C550: T('Cessna Citation II', 14.4, 15.9, 'aft'),
  C560: T('Cessna Citation V', 14.9, 15.9, 'aft'),
  C56X: T('Cessna Citation Excel', 15.8, 17.2, 'aft'),
  C650: T('Cessna Citation III', 16.9, 16.3, 'aft'),
  C680: T('Cessna Citation Sovereign', 19.4, 19.3, 'aft'),
  C68A: T('Cessna Citation Latitude', 19.4, 22.0, 'aft'),
  C700: T('Cessna Citation Longitude', 22.3, 20.9, 'aft'),
  C750: T('Cessna Citation X', 22.0, 19.4, 'aft'),
  LJ35: T('Learjet 35', 14.8, 12.0, 'aft'),
  LJ45: T('Learjet 45', 17.7, 14.6, 'aft'),
  LJ60: T('Learjet 60', 17.9, 13.4, 'aft'),
  LJ75: T('Learjet 75', 17.7, 15.5, 'aft'),
  CL30: T('Bombardier Challenger 300', 20.9, 19.5, 'aft'),
  CL35: T('Bombardier Challenger 350', 20.9, 21.0, 'aft'),
  CL60: T('Bombardier Challenger 600', 20.9, 19.6, 'aft'),
  GLEX: T('Bombardier Global Express', 30.3, 28.7, 'aft'),
  GL5T: T('Bombardier Global 5000', 29.5, 28.7, 'aft'),
  GL7T: T('Bombardier Global 7500', 33.8, 31.7, 'aft'),
  GLF4: T('Gulfstream IV', 26.9, 23.7, 'aft'),
  GLF5: T('Gulfstream V', 29.4, 28.5, 'aft'),
  GLF6: T('Gulfstream G650', 30.4, 30.4, 'aft'),
  G280: T('Gulfstream G280', 20.3, 19.2, 'aft'),
  GA7C: T('Gulfstream G700', 33.5, 31.4, 'aft'),
  FA7X: T('Dassault Falcon 7X', 23.2, 26.2, 'aft'),
  FA8X: T('Dassault Falcon 8X', 24.5, 26.3, 'aft'),
  F900: T('Dassault Falcon 900', 20.2, 19.3, 'aft'),
  F2TH: T('Dassault Falcon 2000', 20.2, 19.3, 'aft'),
  E55P: T('Embraer Phenom 300', 15.6, 16.2, 'aft'),
  E50P: T('Embraer Phenom 100', 12.8, 12.3, 'aft'),
  E545: T('Embraer Praetor 500', 19.7, 20.3, 'aft'),
  E550: T('Embraer Praetor 600', 20.7, 20.3, 'aft'),
  H25B: T('Hawker 800', 15.6, 15.7, 'aft'),
  PC24: T('Pilatus PC-24', 16.9, 17.0, 'aft'),
  HDJT: T('HondaJet', 12.9, 12.1, 'aft'),
  // Props and light aircraft
  C208: T('Cessna 208 Caravan', 11.5, 15.9, 'single'),
  PC12: T('Pilatus PC-12', 14.4, 16.3, 'singlelow'),
  TBM9: T('Daher TBM 900', 10.7, 12.8, 'singlelow'),
  TBM7: T('Daher TBM 700', 10.6, 12.7, 'singlelow'),
  BE20: T('Beechcraft King Air 200', 13.3, 16.6, 'twinprop'),
  BE9L: T('Beechcraft King Air 90', 10.8, 15.3, 'twinprop'),
  BE58: T('Beechcraft Baron', 9.1, 11.5, 'twinprop'),
  BE36: T('Beechcraft Bonanza', 8.4, 10.2, 'singlelow'),
  C152: T('Cessna 152', 7.3, 10.1, 'single'),
  C172: T('Cessna 172', 8.3, 11.0, 'single'),
  C182: T('Cessna 182', 8.8, 11.0, 'single'),
  C206: T('Cessna 206', 8.6, 11.0, 'single'),
  C210: T('Cessna 210', 8.6, 11.2, 'single'),
  P28A: T('Piper Cherokee', 7.3, 9.1, 'singlelow'),
  P28R: T('Piper Arrow', 7.5, 10.7, 'singlelow'),
  PA46: T('Piper Malibu', 8.7, 13.1, 'singlelow'),
  SR20: T('Cirrus SR20', 7.9, 11.7, 'singlelow'),
  SR22: T('Cirrus SR22', 7.9, 11.7, 'singlelow'),
  SR22T: T('Cirrus SR22T', 7.9, 11.7, 'singlelow'),
  DA40: T('Diamond DA40', 8.1, 11.9, 'singlelow'),
  DA42: T('Diamond DA42', 8.6, 13.4, 'twinprop'),
  M20P: T('Mooney M20', 7.5, 11.0, 'singlelow'),
  // Helicopters
  EC35: T('Airbus H135', 10.2, 10.2, 'heli'),
  EC45: T('Airbus H145', 11.6, 11.0, 'heli'),
  EC30: T('Airbus H130', 10.7, 10.7, 'heli'),
  EC55: T('Airbus H155', 12.7, 12.6, 'heli'),
  EC75: T('Airbus H175', 15.7, 14.8, 'heli'),
  AS50: T('Airbus AS350 Écureuil', 10.9, 10.7, 'heli'),
  AS55: T('Airbus AS355', 10.9, 10.7, 'heli'),
  AS65: T('Airbus AS365 Dauphin', 11.6, 11.9, 'heli'),
  A109: T('Leonardo AW109', 11.4, 11.0, 'heli'),
  A139: T('Leonardo AW139', 13.8, 13.8, 'heli'),
  A169: T('Leonardo AW169', 12.4, 12.1, 'heli'),
  B06: T('Bell 206', 9.5, 10.2, 'heli'),
  B407: T('Bell 407', 10.6, 10.7, 'heli'),
  B429: T('Bell 429', 11.0, 11.0, 'heli'),
  B412: T('Bell 412', 12.7, 14.0, 'heli'),
  S76: T('Sikorsky S-76', 13.2, 13.4, 'heli'),
  H60: T('Sikorsky UH-60 Black Hawk', 15.3, 16.4, 'heli'),
  R44: T('Robinson R44', 8.9, 10.1, 'heli'),
  R22: T('Robinson R22', 6.3, 7.7, 'heli'),
  R66: T('Robinson R66', 9.0, 10.1, 'heli'),
  // Military and special
  C17: T('Boeing C-17 Globemaster III', 53.0, 51.8, 'lifter'),
  C130: T('Lockheed C-130 Hercules', 29.8, 40.4, 'lifter'),
  C30J: T('Lockheed C-130J Super Hercules', 29.8, 40.4, 'lifter'),
  A400: T('Airbus A400M', 45.1, 42.4, 'lifter'),
  K35R: T('Boeing KC-135', 41.5, 39.9, 'jet4'),
  E3TF: T('Boeing E-3 Sentry', 46.6, 44.4, 'jet4'),
  P8: T('Boeing P-8 Poseidon', 39.5, 37.6, 'jet'),
};

/** A stand-in when the type isn't known: from the ADS-B emitter category. */
export function aircraftFor(t: string, cat?: string): AircraftType {
  const k = AIRCRAFT[t];
  if (k) return k;
  switch (cat) {
    case 'A1':
      return T(t || 'Light aircraft', 8.3, 11, 'single');
    case 'A2':
      return T(t || 'Small aircraft', 16, 16, 'aft');
    case 'A4':
      return T(t || 'Airliner', 47, 38, 'jet');
    case 'A5':
      return T(t || 'Wide-body airliner', 64, 62, 'jet');
    case 'A7':
      return T(t || 'Helicopter', 11, 11, 'heli');
    default:
      return T(t || 'Airliner', 37.6, 35.8, 'jet');
  }
}

export interface Livery {
  name: string;
  body: string;
  tail: string;
  /** Belly, engines and cheatline. */
  accent: string;
  /** The whole fuselage in the tail color (Southwest, KLM, Spirit, UPS…). */
  full?: boolean;
}

const L = (name: string, body: string, tail: string, accent: string, full = false): Livery => ({ name, body, tail, accent, full });

/** By the three-letter ICAO airline code that starts a callsign (UAL123 → United). */
export const LIVERIES: Record<string, Livery> = {
  // North America
  AAL: L('American Airlines', '#c9ced4', '#0078d2', '#c30019'),
  UAL: L('United Airlines', '#f4f5f7', '#0033a0', '#0033a0'),
  DAL: L('Delta Air Lines', '#f7f7f8', '#c01933', '#003366'),
  SWA: L('Southwest Airlines', '#304cb2', '#304cb2', '#ffbf27', true),
  JBU: L('JetBlue', '#f5f6f8', '#1a2b57', '#0033a0'),
  ASA: L('Alaska Airlines', '#f5f6f8', '#01426a', '#48a9c5'),
  NKS: L('Spirit Airlines', '#ffec00', '#ffec00', '#1a1a1a', true),
  FFT: L('Frontier Airlines', '#f5f6f8', '#248168', '#248168'),
  HAL: L('Hawaiian Airlines', '#f5f6f8', '#5b2c83', '#e0457b'),
  SCX: L('Sun Country', '#f5f6f8', '#f26b21', '#1c2f5b'),
  AAY: L('Allegiant', '#f5f6f8', '#f4a81d', '#0b3a73'),
  BRZ: L('Breeze Airways', '#f5f6f8', '#0a2240', '#5fb4e5'),
  MXY: L('Breeze Airways', '#f5f6f8', '#0a2240', '#5fb4e5'),
  ENY: L('American Eagle', '#c9ced4', '#0078d2', '#c30019'),
  PDT: L('American Eagle', '#c9ced4', '#0078d2', '#c30019'),
  JIA: L('American Eagle', '#c9ced4', '#0078d2', '#c30019'),
  EDV: L('Delta Connection', '#f7f7f8', '#c01933', '#003366'),
  ASH: L('United Express', '#f4f5f7', '#0033a0', '#0033a0'),
  GJS: L('United Express', '#f4f5f7', '#0033a0', '#0033a0'),
  SKW: L('SkyWest', '#f4f5f7', '#0033a0', '#0033a0'),
  RPA: L('Republic Airways', '#f4f5f7', '#0033a0', '#0033a0'),
  QXE: L('Horizon Air', '#f5f6f8', '#01426a', '#48a9c5'),
  ACA: L('Air Canada', '#f5f6f8', '#111111', '#d22630'),
  JZA: L('Air Canada Express', '#f5f6f8', '#111111', '#d22630'),
  WJA: L('WestJet', '#f5f6f8', '#00303f', '#6fd3e0'),
  TSC: L('Air Transat', '#f5f6f8', '#172a52', '#00a3e0'),
  POE: L('Porter Airlines', '#f5f6f8', '#0b1f3a', '#0b1f3a'),
  AMX: L('Aeroméxico', '#f5f6f8', '#0b2343', '#0b2343'),
  VIV: L('Viva Aerobus', '#f5f6f8', '#00a850', '#00a850'),
  VOI: L('Volaris', '#f5f6f8', '#a7007e', '#a7007e'),
  FDX: L('FedEx', '#f5f6f8', '#4d148c', '#ff6600'),
  UPS: L('UPS', '#351c15', '#351c15', '#ffb500', true),
  GTI: L('Atlas Air', '#f5f6f8', '#123b6d', '#c8102e'),
  // Latin America
  GLO: L('Gol', '#f5f6f8', '#ff6600', '#ff6600'),
  TAM: L('LATAM', '#f5f6f8', '#1b0088', '#e8114b'),
  LAN: L('LATAM', '#f5f6f8', '#1b0088', '#e8114b'),
  AZU: L('Azul', '#f5f6f8', '#0033a0', '#0033a0'),
  AVA: L('Avianca', '#da291c', '#da291c', '#f5f6f8', true),
  CMP: L('Copa Airlines', '#f5f6f8', '#0a2d6e', '#c8a95a'),
  // Europe
  BAW: L('British Airways', '#f5f6f8', '#1b2c5a', '#c8102e'),
  VIR: L('Virgin Atlantic', '#e9eaee', '#c8102e', '#5e2f6f'),
  EZY: L('easyJet', '#f5f6f8', '#ff6600', '#ff6600'),
  EJU: L('easyJet', '#f5f6f8', '#ff6600', '#ff6600'),
  EZS: L('easyJet', '#f5f6f8', '#ff6600', '#ff6600'),
  RYR: L('Ryanair', '#f5f6f8', '#073590', '#f1c933'),
  RUK: L('Ryanair', '#f5f6f8', '#073590', '#f1c933'),
  WZZ: L('Wizz Air', '#f5f6f8', '#c6007e', '#2c1a5c'),
  AFR: L('Air France', '#f5f6f8', '#002157', '#e4002b'),
  DLH: L('Lufthansa', '#f5f6f8', '#05164d', '#ffad00'),
  CLH: L('Lufthansa CityLine', '#f5f6f8', '#05164d', '#ffad00'),
  EWG: L('Eurowings', '#f5f6f8', '#8a0b52', '#8a0b52'),
  KLM: L('KLM', '#00a1de', '#00a1de', '#f5f6f8', true),
  KLC: L('KLM Cityhopper', '#00a1de', '#00a1de', '#f5f6f8', true),
  TRA: L('Transavia', '#f5f6f8', '#00d66c', '#00d66c'),
  IBE: L('Iberia', '#f5f6f8', '#d7192d', '#fecb00'),
  IBS: L('Iberia Express', '#f5f6f8', '#d7192d', '#fecb00'),
  VLG: L('Vueling', '#f5f6f8', '#ffcc00', '#333333'),
  AEA: L('Air Europa', '#f5f6f8', '#005eb8', '#005eb8'),
  SWR: L('Swiss', '#f5f6f8', '#e2001a', '#f5f6f8'),
  AUA: L('Austrian Airlines', '#f5f6f8', '#e1001a', '#e1001a'),
  SAS: L('SAS', '#f5f6f8', '#000f64', '#000f64'),
  FIN: L('Finnair', '#f5f6f8', '#0b1560', '#0b1560'),
  NOZ: L('Norwegian', '#f5f6f8', '#d81939', '#1a2a3a'),
  TAP: L('TAP Air Portugal', '#f5f6f8', '#2c9f58', '#ea1c24'),
  ITY: L('ITA Airways', '#f5f6f8', '#004c9b', '#1dab4d'),
  THY: L('Turkish Airlines', '#f5f6f8', '#e81932', '#e81932'),
  PGT: L('Pegasus', '#f5f6f8', '#ffc20e', '#231f20'),
  LOT: L('LOT Polish Airlines', '#f5f6f8', '#11397e', '#11397e'),
  CSA: L('Czech Airlines', '#f5f6f8', '#d7141a', '#1c3f94'),
  SXS: L('SunExpress', '#f5f6f8', '#f8a800', '#1e3a6e'),
  AEE: L('Aegean', '#f5f6f8', '#0a2e6d', '#6fbe44'),
  EIN: L('Aer Lingus', '#f5f6f8', '#006272', '#6ab023'),
  BEL: L('Brussels Airlines', '#f5f6f8', '#d11241', '#0a2240'),
  AFL: L('Aeroflot', '#f5f6f8', '#0c4ea2', '#e3001b'),
  SDM: L('Rossiya', '#f5f6f8', '#e3001b', '#0c4ea2'),
  // Middle East, Africa, South Asia
  UAE: L('Emirates', '#f5f6f8', '#d71a21', '#b8a15b'),
  FDB: L('flydubai', '#f5f6f8', '#e05206', '#1c3f94'),
  QTR: L('Qatar Airways', '#f5f6f8', '#5c0632', '#5c0632'),
  ETD: L('Etihad', '#d8cfc1', '#bd8b13', '#6f5b3e'),
  SVA: L('Saudia', '#f5f6f8', '#006c35', '#b9975b'),
  MSR: L('EgyptAir', '#f5f6f8', '#0a2d6e', '#c8a95a'),
  ETH: L('Ethiopian Airlines', '#f5f6f8', '#fcdd09', '#078930'),
  RAM: L('Royal Air Maroc', '#f5f6f8', '#c1272d', '#1d6f42'),
  AIC: L('Air India', '#f5f6f8', '#8a1538', '#c9a227'),
  IGO: L('IndiGo', '#f5f6f8', '#001b94', '#001b94'),
  AKJ: L('Akasa Air', '#f5f6f8', '#ff6f00', '#6d1f6e'),
  // East Asia and Oceania
  JAL: L('Japan Airlines', '#f5f6f8', '#f5f6f8', '#cc0000'),
  ANA: L('All Nippon Airways', '#f5f6f8', '#13448f', '#00a4e4'),
  APJ: L('Peach', '#f5f6f8', '#d3006b', '#d3006b'),
  SKY: L('Skymark', '#f5f6f8', '#0064b0', '#0064b0'),
  KAL: L('Korean Air', '#9fcdea', '#f5f6f8', '#0064b5', true),
  AAR: L('Asiana Airlines', '#e4e0d8', '#c59a46', '#c59a46'),
  JJA: L('Jeju Air', '#f5f6f8', '#ff5a00', '#ff5a00'),
  CCA: L('Air China', '#f5f6f8', '#f5f6f8', '#e40012'),
  CES: L('China Eastern', '#f5f6f8', '#c8102e', '#003a8c'),
  CSN: L('China Southern', '#f5f6f8', '#008bd0', '#e60012'),
  CHH: L('Hainan Airlines', '#f5f6f8', '#d91e18', '#e6b422'),
  CSZ: L('Shenzhen Airlines', '#f5f6f8', '#d71920', '#d71920'),
  CXA: L('Xiamen Airlines', '#f5f6f8', '#1f5aa6', '#1f5aa6'),
  CSC: L('Sichuan Airlines', '#f5f6f8', '#d4a017', '#1a3a6e'),
  CQH: L('Spring Airlines', '#f5f6f8', '#00a651', '#00a651'),
  CPA: L('Cathay Pacific', '#f5f6f8', '#005d63', '#005d63'),
  HKE: L('HK Express', '#f5f6f8', '#6d2077', '#6d2077'),
  CAL: L('China Airlines', '#f5f6f8', '#e7a4be', '#003a70'),
  EVA: L('EVA Air', '#f5f6f8', '#00754a', '#f08c00'),
  SIA: L('Singapore Airlines', '#f5f6f8', '#1d3c85', '#f7b418'),
  TGW: L('Scoot', '#f5f6f8', '#ffd100', '#1a1a1a'),
  AXM: L('AirAsia', '#f5f6f8', '#ff0000', '#ff0000'),
  MAS: L('Malaysia Airlines', '#f5f6f8', '#0a2d6e', '#d71920'),
  THA: L('Thai Airways', '#f5f6f8', '#5d2a8e', '#c8a349'),
  GIA: L('Garuda Indonesia', '#f5f6f8', '#0a5f7c', '#6fbf45'),
  PAL: L('Philippine Airlines', '#f5f6f8', '#0a2d6e', '#d71920'),
  QFA: L('Qantas', '#f5f6f8', '#e40000', '#e40000'),
  QLK: L('QantasLink', '#f5f6f8', '#e40000', '#e40000'),
  JST: L('Jetstar', '#f5f6f8', '#ff5a00', '#ff5a00'),
  VOZ: L('Virgin Australia', '#f5f6f8', '#c8102e', '#5e2f6f'),
  ANZ: L('Air New Zealand', '#f5f6f8', '#111111', '#111111'),
};

/** Airline colors from a callsign, or a plain white airframe with an accent derived from the address. */
export function liveryFor(callsign: string, hex: string): Livery {
  const pre = callsign.slice(0, 3).toUpperCase();
  if (/^[A-Z]{3}\d/.test(callsign) && LIVERIES[pre]) return LIVERIES[pre];
  const n = parseInt(hex.slice(-3), 16) || 0;
  const accents = ['#2b6cb0', '#c53030', '#2f855a', '#6b46c1', '#b7791f', '#2c7a7b', '#4a5568'];
  return L('', '#f4f4f2', '#f4f4f2', accents[n % accents.length]);
}
