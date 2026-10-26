import { supabase } from "@/integrations/supabase/client";

export type ThreatLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type DroneFlag = "THREAT" | "SAFE" | null;

export interface LatLng {
  lat: number;
  lng: number;
}

export interface Zone {
  id: string;
  name: string;
  lat: number;
  lng: number;
  r: number; // radius in metres
  restricted: boolean;
}

/** A track sample. `t` is the wall-clock time (ms) it was recorded, so velocity is measured per real second. */
export interface TrackPoint extends LatLng {
  t: number;
}

export interface Drone {
  id: string;
  model: string;
  lat: number;
  lng: number;
  tlat: number; // current waypoint
  tlng: number;
  heading: number; // compass bearing, 0 = north
  speed: number;
  cruise: number;
  altitude: number;
  battery: number;
  signal: number;
  threat: ThreatLevel;
  flagged: DroneFlag;
  speedHistory: number[];
  altitudeHistory: number[];
  positionHistory: TrackPoint[];
  friendly?: boolean;
}

export interface Alert {
  id: string;
  droneId: string;
  level: ThreatLevel;
  message: string;
  timestamp: number;
  coords: LatLng;
}

export interface SimSnapshot {
  drones: Drone[];
  alerts: Alert[];
  zones: Zone[];
  clock: number;
  version: number;
  elapsed: number; // whole seconds the simulation has been running
}

export const TICK_MS = 50; // movement step — 20 Hz keeps tracks smooth on the map
const TICKS_PER_SEC = 1000 / TICK_MS;
export const HISTORY_LEN = 60; // vitals samples, one per second
const TRACK_LEN = 20; // position samples kept per drone
const KEYBOARD_SAMPLE_MS = 100; // operator drones move every frame; their track is sampled at 10 Hz
/** Simulated time runs this much faster than real time — at true speed a 60 km/h track crawls ~0.5 px/s at city zoom. */
export const SIM_SPEEDUP = 10;
const APPROACH_M = 2500; // within this far of a restricted perimeter rates MEDIUM

export const DELHI_CENTER: LatLng = { lat: 28.59, lng: 77.15 };
/** Operating area — auto drones roam inside it and operator drones are clamped to it. */
export const REGION = { minLat: 28.45, maxLat: 28.8, minLng: 77.05, maxLng: 77.4 };

export const ZONES: Zone[] = [
  { id: "alpha", name: "ALPHA", lat: 28.5562, lng: 77.1, r: 1800, restricted: true }, // IGI Airport
  { id: "bravo", name: "BRAVO", lat: 28.6143, lng: 77.199, r: 1500, restricted: true }, // Rashtrapati Bhavan
  { id: "charlie", name: "CHARLIE", lat: 28.6129, lng: 77.2295, r: 1400, restricted: true }, // India Gate
  { id: "delta", name: "DELTA", lat: 28.648, lng: 77.2167, r: 1800, restricted: false }, // north of Connaught Place (patrol) — clear of BRAVO/CHARLIE
];

const THREAT_RANK: Record<ThreatLevel, number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
  CRITICAL: 3,
};

/* ---------- geo helpers ---------- */
const M_PER_DEG_LAT = 111_320;
const mPerDegLng = (lat: number) => M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
/** Compass bearing (0 = north, 90 = east) of an east/north vector. */
const bearing = (east: number, north: number) => ((Math.atan2(east, north) * 180) / Math.PI + 360) % 360;

export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/* ---------- zones (built-in + operator-drawn) ---------- */
const CUSTOM_ZONE_NAMES = ["ECHO", "FOXTROT", "HOTEL", "INDIA", "JULIET", "KILO", "LIMA", "MIKE"];
let customZones: Zone[] = [];
let customZoneSeq = 0; // never reused, so ids stay unique after removals

export function getAllZones(): Zone[] {
  return [...ZONES, ...customZones];
}

const restrictedZones = () => getAllZones().filter((z) => z.restricted);

function zoneAt(lat: number, lng: number): Zone | null {
  return restrictedZones().find((z) => haversineMeters(lat, lng, z.lat, z.lng) <= z.r) ?? null;
}
export { zoneAt };

function threatFor(lat: number, lng: number, speed: number): ThreatLevel {
  const z = zoneAt(lat, lng);
  if (z && speed > 80) return "CRITICAL";
  if (z) return "HIGH";
  if (speed > 100) return "HIGH";
  const approaching = restrictedZones().some((zz) => haversineMeters(lat, lng, zz.lat, zz.lng) <= zz.r + APPROACH_M);
  if (approaching || speed > 85) return "MEDIUM";
  return "LOW";
}

/* ---------- deterministic PRNG so SSR and client hydrate identically ---------- */
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(1337);

const MODELS = ["QUAD-4X", "FIXED-WING RQ-11", "VTOL-X2", "ROTOR-6", "SWARM-U3"];

/** Auto drones spawn scattered within ~3 km of a zone. */
const SPAWNS: Array<{ zone: string; cruise: number; heading: number }> = [
  { zone: "alpha", cruise: 42, heading: 45 },
  { zone: "alpha", cruise: 61, heading: 180 },
  { zone: "bravo", cruise: 67, heading: 270 },
  { zone: "charlie", cruise: 55, heading: 90 },
  { zone: "charlie", cruise: 48, heading: 135 },
];

function randomNear(c: LatLng, radiusKm: number): LatLng {
  const dLat = ((rand() - 0.5) * 2 * radiusKm) / 111;
  const dLng = ((rand() - 0.5) * 2 * radiusKm) / (111 * Math.cos((c.lat * Math.PI) / 180));
  return { lat: c.lat + dLat, lng: c.lng + dLng };
}

/** Seed points share t = 0 — the prediction ignores them, so a fresh track has no fake velocity. */
const seedTrack = (lat: number, lng: number): TrackPoint[] => Array.from({ length: 8 }, () => ({ lat, lng, t: 0 }));

/* ---------- store ---------- */
const drones: Drone[] = [];
const alerts: Alert[] = [];
const listeners = new Set<() => void>();
let intervalId: ReturnType<typeof setInterval> | null = null;
let version = 0;
let tickCount = 0;
let snapshot: SimSnapshot | null = null;

function makeDrone(i: number, spawn: (typeof SPAWNS)[number]): Drone {
  const zone = ZONES.find((z) => z.id === spawn.zone) ?? ZONES[0]!;
  const { lat, lng } = randomNear(zone, 3);
  const alt0 = 70 + rand() * 340;
  let altWalk = alt0;
  let spdWalk = spawn.cruise;
  return {
    id: `DRONE-00${i + 1}`,
    model: MODELS[i] ?? "QUAD-4X",
    lat,
    lng,
    tlat: lat, // first tick picks a real waypoint
    tlng: lng,
    heading: spawn.heading,
    speed: spawn.cruise,
    cruise: spawn.cruise,
    altitude: alt0,
    battery: 58 + rand() * 40,
    signal: 70 + rand() * 28,
    threat: threatFor(lat, lng, spawn.cruise),
    flagged: null,
    speedHistory: Array.from({ length: HISTORY_LEN }, () => {
      spdWalk = Math.min(160, Math.max(10, spdWalk + (rand() - 0.5) * 14));
      return Math.round(spdWalk);
    }),
    altitudeHistory: Array.from({ length: HISTORY_LEN }, () => {
      altWalk = Math.min(540, Math.max(50, altWalk + (rand() - 0.5) * 26));
      return Math.round(altWalk);
    }),
    positionHistory: seedTrack(lat, lng),
  };
}

SPAWNS.forEach((spawn, i) => drones.push(makeDrone(i, spawn)));

// Manual drone — controlled by arrow keys
drones.push({
  id: "MANUAL-01",
  model: "OPERATOR-CTRL",
  lat: 28.57,
  lng: 77.18,
  tlat: 28.57,
  tlng: 77.18,
  heading: 0,
  speed: 28,
  cruise: 28,
  altitude: 120,
  battery: 100,
  signal: 99,
  threat: "LOW",
  flagged: null,
  speedHistory: Array(60).fill(28),
  altitudeHistory: Array(60).fill(120),
  positionHistory: seedTrack(28.57, 77.18),
});

// Friendly drone — controlled by WASD
drones.push({
  id: "FRIENDLY-01",
  model: "ALLY-UNIT",
  lat: 28.6,
  lng: 77.22,
  tlat: 28.6,
  tlng: 77.22,
  heading: 0,
  speed: 28,
  cruise: 28,
  altitude: 150,
  battery: 100,
  signal: 99,
  threat: "LOW",
  flagged: null,
  friendly: true,
  speedHistory: Array(60).fill(28),
  altitudeHistory: Array(60).fill(150),
  positionHistory: seedTrack(28.6, 77.22),
});

let alertSeq = 0;
function makeAlert(
  level: ThreatLevel,
  droneId: string,
  message: string,
  coords: LatLng,
  timestamp = Date.now(),
): Alert {
  return { id: `ALERT-${String(++alertSeq).padStart(4, "0")}`, droneId, level, message, timestamp, coords };
}

/* seed the feed with plausible prior activity so the ops floor opens live */
const t0 = Date.now();
alerts.push(
  makeAlert("HIGH", "DRONE-004", "DRONE-004 inside restricted Zone BRAVO — sustained track", { lat: 28.615, lng: 77.1975 }, t0 - 412000),
  makeAlert("MEDIUM", "DRONE-007", "DRONE-007 approaching Zone ALPHA perimeter — 14.2 km out", { lat: 28.569, lng: 77.135 }, t0 - 267000),
  makeAlert("LOW", "DRONE-002", "DRONE-002 cleared Zone DELTA corridor — returning patrol", { lat: 28.646, lng: 77.214 }, t0 - 98000),
);

function persistAlert(alert: Alert) {
  if (typeof window === "undefined") return;
  const round5 = (v: number) => Math.round(v * 1e5) / 1e5; // ~1 m precision
  supabase
    .from("drone_alerts")
    .insert({
      drone_id: alert.droneId,
      threat_level: alert.level,
      timestamp: new Date(alert.timestamp).toISOString(),
      coordinates: { lat: round5(alert.coords.lat), lng: round5(alert.coords.lng) },
    })
    .then(({ error }) => {
      if (error) console.warn("[skywatch] alert log failed:", error.message);
    });
}

function pushAlert(alert: Alert, persist: boolean) {
  alerts.unshift(alert);
  if (alerts.length > 60) alerts.length = 60;
  if (persist) persistAlert(alert);
}

function pushTrack(d: Drone, now: number) {
  d.positionHistory = [...d.positionHistory.slice(-(TRACK_LEN - 1)), { lat: d.lat, lng: d.lng, t: now }];
}

/* Auto drones cycle around the restricted zones: loiter outside a while → fly into a zone → leave → repeat. */
const LOITER_MIN_MS = 10_000; // real time spent wandering outside before the next incursion
const LOITER_MAX_MS = 25_000;
const patrol = new Map<string, { phase: "outside" | "inbound"; holdUntil: number }>();

function offsetFrom(c: LatLng, distM: number, angle: number): LatLng {
  return {
    lat: clamp(c.lat + (Math.sin(angle) * distM) / M_PER_DEG_LAT, REGION.minLat, REGION.maxLat),
    lng: clamp(c.lng + (Math.cos(angle) * distM) / mPerDegLng(c.lat), REGION.minLng, REGION.maxLng),
  };
}

const pickZone = (zones: Zone[]) => zones[Math.floor(Math.random() * zones.length)]!;

/** A point 0.6–3 km beyond a restricted perimeter that isn't inside any restricted zone. */
function pointOutsideZones(zones: Zone[]): LatLng {
  let p: LatLng = DELHI_CENTER;
  for (let tries = 0; tries < 12; tries++) {
    const z = pickZone(zones);
    p = offsetFrom(z, z.r + 600 + Math.random() * 2400, Math.random() * Math.PI * 2);
    if (!zones.some((zz) => haversineMeters(p.lat, p.lng, zz.lat, zz.lng) <= zz.r + 200)) break;
  }
  return p;
}

function nextWaypoint(d: Drone): LatLng {
  const zones = restrictedZones();
  const now = Date.now();
  const s = patrol.get(d.id) ?? { phase: "outside" as const, holdUntil: now + Math.random() * LOITER_MAX_MS };
  if (s.phase === "outside" && now >= s.holdUntil && zones.length > 0) {
    // Head for a point inside a random restricted zone
    s.phase = "inbound";
    patrol.set(d.id, s);
    const z = pickZone(zones);
    return offsetFrom(z, Math.sqrt(Math.random()) * z.r * 0.6, Math.random() * Math.PI * 2);
  }
  if (s.phase === "inbound") {
    // Reached the zone — leave and stay out for a while
    s.phase = "outside";
    s.holdUntil = now + LOITER_MIN_MS + Math.random() * (LOITER_MAX_MS - LOITER_MIN_MS);
  }
  patrol.set(d.id, s);
  return zones.length > 0 ? pointOutsideZones(zones) : DELHI_CENTER;
}

function stepTowardWaypoint(d: Drone) {
  const kx = mPerDegLng(d.lat);
  const east = (d.tlng - d.lng) * kx;
  const north = (d.tlat - d.lat) * M_PER_DEG_LAT;
  const remaining = Math.hypot(east, north);
  if (remaining < 100) {
    const next = nextWaypoint(d);
    d.tlat = next.lat;
    d.tlng = next.lng;
    return;
  }
  const step = Math.min(remaining, (d.speed / 3.6) * SIM_SPEEDUP * (TICK_MS / 1000)); // metres this tick
  d.lat += ((north / remaining) * step) / M_PER_DEG_LAT;
  d.lng += ((east / remaining) * step) / kx;
  d.heading = bearing(east, north);
}

function tick() {
  tickCount += 1;
  const vitalsTick = tickCount % TICKS_PER_SEC === 0; // vitals and track samples stay at 1 Hz
  const now = Date.now();
  for (const d of drones) {
    if (d.id === "MANUAL-01" || d.friendly) continue; // moved only by operator input
    stepTowardWaypoint(d);

    if (vitalsTick) {
      pushTrack(d, now);
      d.speed = Math.min(165, Math.max(12, d.speed + (d.cruise - d.speed) * 0.06 + (Math.random() - 0.5) * 5));
      d.altitude = Math.min(560, Math.max(40, d.altitude + (Math.random() - 0.5) * 14));
      d.signal = Math.min(99, Math.max(38, d.signal + (Math.random() - 0.5) * 6));
      d.battery = Math.max(11, d.battery - 0.012);

      d.speedHistory.push(Math.round(d.speed));
      if (d.speedHistory.length > HISTORY_LEN) d.speedHistory.shift();
      d.altitudeHistory.push(Math.round(d.altitude));
      if (d.altitudeHistory.length > HISTORY_LEN) d.altitudeHistory.shift();
    }

    const prev = d.threat;
    const next = threatFor(d.lat, d.lng, d.speed);
    d.threat = next;
    if (THREAT_RANK[next] > THREAT_RANK[prev] && THREAT_RANK[next] >= 2) {
      const z = zoneAt(d.lat, d.lng);
      const spd = Math.round(d.speed);
      let message: string;
      if (next === "CRITICAL" && z) {
        message = `${d.id} BREACH — entered restricted Zone ${z.name} at ${spd} km/h`;
      } else if (z) {
        message = `${d.id} inside restricted Zone ${z.name} — sustained track`;
      } else if (spd > 100) {
        message = `${d.id} velocity ${spd} km/h — erratic vector, tracking`;
      } else {
        message = `${d.id} track escalation — monitoring`;
      }
      pushAlert(makeAlert(next, d.id, message, { lat: d.lat, lng: d.lng }), true);
    }
  }
  version += 1;
  publish();
}

function publish() {
  snapshot = {
    drones: drones.map((d) => ({ ...d })),
    alerts: [...alerts],
    zones: getAllZones(),
    clock: Date.now(),
    version,
    elapsed: Math.floor(tickCount / TICKS_PER_SEC),
  };
  listeners.forEach((cb) => cb());
}

function buildInitial(): SimSnapshot {
  return {
    drones: drones.map((d) => ({ ...d })),
    alerts: [...alerts],
    zones: getAllZones(),
    clock: Date.now(),
    version,
    elapsed: Math.floor(tickCount / TICKS_PER_SEC),
  };
}

export function subscribe(cb: () => void) {
  listeners.add(cb);
  if (intervalId === null && typeof window !== "undefined") {
    intervalId = setInterval(tick, TICK_MS);
  }
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0 && intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
  };
}

export function getSnapshot(): SimSnapshot {
  if (!snapshot) snapshot = buildInitial();
  return snapshot;
}

export function getSimulatorState() {
  const { drones, zones } = getSnapshot();
  return { drones, zones };
}

/* ---------- operator actions ---------- */
export function effectiveThreat(d: Drone): ThreatLevel {
  if (d.flagged === "THREAT") return "CRITICAL";
  if (d.flagged === "SAFE") return "LOW";
  return d.threat;
}

export function flagDrone(id: string, flag: Exclude<DroneFlag, null>) {
  const d = drones.find((x) => x.id === id);
  if (!d) return;
  d.flagged = flag;
  if (flag === "THREAT") {
    pushAlert(
      makeAlert("CRITICAL", d.id, `OPERATOR FLAG — ${d.id} designated hostile threat, weapons coordinate standby`, { lat: d.lat, lng: d.lng }),
      true,
    );
  } else {
    pushAlert(
      makeAlert("LOW", d.id, `OPERATOR CLEAR — ${d.id} marked safe, threat assessment reset`, { lat: d.lat, lng: d.lng }),
      true,
    );
  }
  version += 1;
  publish();
}

export function dispatchAlert(id: string) {
  const d = drones.find((x) => x.id === id);
  if (!d) return;
  pushAlert(
    makeAlert("CRITICAL", d.id, `DISPATCH — rapid-response unit vectoring to ${d.id} grid position`, { lat: d.lat, lng: d.lng }),
    true,
  );
  version += 1;
  publish();
}

export function addRestrictedZone(lat: number, lng: number, radiusMeters: number) {
  const name = CUSTOM_ZONE_NAMES[customZoneSeq % CUSTOM_ZONE_NAMES.length]!;
  customZones = [...customZones, { id: `custom-${customZoneSeq}`, name, lat, lng, r: radiusMeters, restricted: true }];
  customZoneSeq += 1;
  version += 1;
  publish();
}

/** Removes any operator-drawn zone containing the point. Built-in zones can't be removed. */
export function removeRestrictedZone(lat: number, lng: number) {
  const before = customZones.length;
  customZones = customZones.filter((z) => haversineMeters(lat, lng, z.lat, z.lng) > z.r);
  if (customZones.length === before) return;
  version += 1;
  publish();
}

/* ---------- prediction & formatting ---------- */
export interface ZoneEta {
  zone: Zone;
  seconds: number;
  inside: boolean;
}

export function nextZoneEta(d: Drone): ZoneEta | null {
  let insideZone: Zone | null = null;
  let best: ZoneEta | null = null;
  const metresPerSec = (Math.max(d.speed, 12) / 3.6) * SIM_SPEEDUP;
  for (const z of restrictedZones()) {
    const dd = haversineMeters(d.lat, d.lng, z.lat, z.lng);
    if (dd <= z.r) {
      insideZone = z;
      break;
    }
    const seconds = Math.round((dd - z.r) / metresPerSec);
    if (!best || seconds < best.seconds) best = { zone: z, seconds, inside: false };
  }
  if (insideZone) return { zone: insideZone, seconds: 0, inside: true };
  return best;
}

export function etaText(eta: ZoneEta | null): string {
  if (!eta) return "No restricted-zone vector on current heading";
  if (eta.inside) return `Currently inside Zone ${eta.zone.name} — restricted airspace`;
  const m = Math.floor(eta.seconds / 60);
  const s = eta.seconds % 60;
  return `Estimated to reach Zone ${eta.zone.name} in ${m}m ${String(s).padStart(2, "0")}s`;
}

export interface TrajectoryPrediction {
  droneId: string;
  points: LatLng[]; // straight-line projection used for the breach test
  driftPoints: LatLng[]; // curved projection if the drone keeps its current turn rate
  historicalPoints: LatLng[]; // last actual positions (the path it came from)
  breachZone: Zone | null;
  breachInSeconds: number | null;
  breachProbability: number; // 0-100, dynamic — recalculated every tick
  safeProbability: number; // 100 - breachProbability
  inside?: boolean; // drone is already inside the restricted zone
  friendly: boolean; // verified allied unit
}

const PREDICTION_HORIZON_S = 40; // look this far ahead…
const PREDICTION_MAX_M = 5000; // …but no more than 5 km, so fast keyboard drones don't project across the city

export function predictTrajectory(d: Drone): TrajectoryPrediction {
  const history = d.positionHistory;
  const historicalPoints = history.map(({ lat, lng }) => ({ lat, lng }));
  const current = zoneAt(d.lat, d.lng);
  if (current) {
    return {
      droneId: d.id,
      points: [],
      driftPoints: [],
      historicalPoints,
      breachZone: current,
      breachInSeconds: 0,
      breachProbability: 100,
      safeProbability: 0,
      inside: true,
      friendly: d.friendly ?? false,
    };
  }
  if (history.length < 3) {
    return {
      droneId: d.id,
      points: [],
      driftPoints: [],
      historicalPoints,
      breachZone: null,
      breachInSeconds: null,
      breachProbability: 0,
      safeProbability: 100,
      friendly: d.friendly ?? false,
    };
  }

  // Work in a flat east/north metre frame centred on the drone — accurate at city scale, and it lets
  // the original planar vector maths run unchanged.
  const kx = mPerDegLng(d.lat);
  const toLocal = (p: LatLng) => ({ x: (p.lng - d.lng) * kx, y: (p.lat - d.lat) * M_PER_DEG_LAT });
  const toGeo = (x: number, y: number): LatLng => ({ lat: d.lat + y / M_PER_DEG_LAT, lng: d.lng + x / kx });

  // Smoothed velocity (m/s) — weighted average of the last 8 steps, recent steps weighted more.
  // Each step is divided by its own time gap, so 1 Hz auto tracks and 10 Hz keyboard tracks compare directly.
  const samples = history.slice(-8);
  const local = samples.map(toLocal);
  let vx = 0;
  let vy = 0;
  let weightSum = 0;
  for (let i = 1; i < samples.length; i++) {
    const dt = (samples[i]!.t - samples[i - 1]!.t) / 1000;
    if (dt <= 0 || samples[i - 1]!.t === 0) continue; // skip seed points
    const w = i; // more recent deltas get a larger weight
    vx += ((local[i]!.x - local[i - 1]!.x) / dt) * w;
    vy += ((local[i]!.y - local[i - 1]!.y) / dt) * w;
    weightSum += w;
  }
  if (weightSum > 0) {
    vx /= weightSum;
    vy /= weightSum;
  }

  // Nearest restricted zone — the reference for every probability factor below.
  const zones = restrictedZones();
  let nearest: Zone | null = null;
  let nearestDist = Infinity;
  for (const z of zones) {
    const dd = haversineMeters(d.lat, d.lng, z.lat, z.lng);
    if (dd < nearestDist) {
      nearestDist = dd;
      nearest = z;
    }
  }
  const toNearest = nearest ? toLocal(nearest) : null;

  // Alignment of a vector toward the nearest zone centre, normalised to 0..1 (1 = aimed straight at it).
  const alignTo = (ax: number, ay: number): number => {
    if (!toNearest) return 0;
    const aMag = Math.hypot(ax, ay);
    const toMag = Math.hypot(toNearest.x, toNearest.y);
    if (aMag === 0 || toMag === 0) return 0;
    const cos = (ax * toNearest.x + ay * toNearest.y) / (aMag * toMag); // -1..1
    return Math.max(0, Math.min(1, cos));
  };

  // Raw early vs recent step vectors (magnitude cancels in the ratios below).
  const n = samples.length;
  const earlyVx = local[1]!.x - local[0]!.x;
  const earlyVy = local[1]!.y - local[0]!.y;
  const lastVx = local[n - 1]!.x - local[n - 2]!.x;
  const lastVy = local[n - 1]!.y - local[n - 2]!.y;

  // Factor A (50%) — is the current heading aimed at the zone?
  const factorA = alignTo(vx, vy) * 100;

  // Factor B (30%) — has the drone been curving toward the zone over the window?
  const earlyAlign = alignTo(earlyVx, earlyVy);
  const recentAlign = alignTo(lastVx, lastVy);
  const drift = recentAlign - earlyAlign; // >0 = turning toward the zone
  const factorB = Math.max(0, Math.min(1, recentAlign * 0.5 + ((drift + 1) / 2) * 0.5)) * 100;

  // Factor C (20%) — proximity to the zone boundary; nothing beyond 3x the radius.
  const boundaryDist = nearest ? nearestDist - nearest.r : Infinity;
  const maxDist = nearest ? nearest.r * 3 : 1;
  let factorC = 0;
  if (boundaryDist <= 0) factorC = 100;
  else if (boundaryDist < maxDist) factorC = (1 - boundaryDist / maxDist) * 100;

  const weighted = factorA * 0.5 + factorB * 0.3 + factorC * 0.2;
  const breachProbability = Math.round(Math.max(0, Math.min(100, weighted)));
  const safeProbability = 100 - breachProbability;

  // Look-ahead window in real seconds, capped by distance.
  const speedMps = Math.hypot(vx, vy);
  const horizonS = speedMps > 0 ? Math.min(PREDICTION_HORIZON_S, PREDICTION_MAX_M / speedMps) : PREDICTION_HORIZON_S;

  // Curved ("drift") projection — rotate the velocity vector by the observed turn rate each step.
  const earlyAng = Math.atan2(earlyVy, earlyVx);
  const lastAng = Math.atan2(lastVy, lastVx);
  let dAng = lastAng - earlyAng;
  while (dAng > Math.PI) dAng -= 2 * Math.PI;
  while (dAng < -Math.PI) dAng += 2 * Math.PI;
  const turnSpanS = (samples[n - 1]!.t + samples[n - 2]!.t - samples[1]!.t - samples[0]!.t) / 2000; // between step midpoints
  const canTurn = samples[0]!.t > 0 && turnSpanS > 0 && Math.hypot(earlyVx, earlyVy) > 0 && Math.hypot(lastVx, lastVy) > 0;
  const turnRate = canTurn ? dAng / turnSpanS : 0; // rad/s

  const driftPoints: LatLng[] = [];
  const driftStepS = horizonS / 30;
  const cosA = Math.cos(turnRate * driftStepS);
  const sinA = Math.sin(turnRate * driftStepS);
  let dvx = vx;
  let dvy = vy;
  let dcx = 0;
  let dcy = 0;
  for (let i = 0; i < 30; i++) {
    const nvx = dvx * cosA - dvy * sinA;
    const nvy = dvx * sinA + dvy * cosA;
    dvx = nvx;
    dvy = nvy;
    dcx += dvx * driftStepS;
    dcy += dvy * driftStepS;
    driftPoints.push(toGeo(dcx, dcy));
  }

  // Straight-line projection used for the breach line and the breach banner.
  const points: LatLng[] = [];
  const stepS = horizonS / 40;
  for (let i = 0; i < 40; i++) {
    const t = (i + 1) * stepS;
    points.push(toGeo(vx * t, vy * t));
  }

  let breachZone: Zone | null = null;
  let breachInSeconds: number | null = null;
  for (let i = 0; i < points.length && !breachZone; i++) {
    const p = points[i]!;
    for (const z of zones) {
      if (haversineMeters(p.lat, p.lng, z.lat, z.lng) <= z.r) {
        breachZone = z;
        breachInSeconds = Math.max(1, Math.round((i + 1) * stepS));
        break;
      }
    }
  }

  return {
    droneId: d.id,
    points,
    driftPoints,
    historicalPoints,
    breachZone,
    breachInSeconds,
    breachProbability,
    safeProbability,
    friendly: d.friendly ?? false,
  };
}

/** Shared by both keyboard drones: move, keep inside the region, and sample the track at 10 Hz. */
function moveOperatorDrone(id: string, dlat: number, dlng: number): Drone | null {
  const d = drones.find((x) => x.id === id);
  if (!d) return null;
  d.lat = clamp(d.lat + dlat, REGION.minLat, REGION.maxLat);
  d.lng = clamp(d.lng + dlng, REGION.minLng, REGION.maxLng);
  d.tlat = d.lat;
  d.tlng = d.lng;
  if (dlat !== 0 || dlng !== 0) {
    d.heading = bearing(dlng * mPerDegLng(d.lat), dlat * M_PER_DEG_LAT);
  }
  const now = Date.now();
  const last = d.positionHistory[d.positionHistory.length - 1];
  if (!last || now - last.t >= KEYBOARD_SAMPLE_MS) pushTrack(d, now);
  return d;
}

export function moveManualDrone(dlat: number, dlng: number) {
  const d = moveOperatorDrone("MANUAL-01", dlat, dlng);
  if (!d) return;
  const prev = d.threat;
  const next = threatFor(d.lat, d.lng, d.speed);
  d.threat = next;
  if (THREAT_RANK[next] > THREAT_RANK[prev] && THREAT_RANK[next] >= 2) {
    const z = zoneAt(d.lat, d.lng);
    const message = z
      ? `${d.id} BREACH — entered restricted Zone ${z.name} at ${Math.round(d.speed)} km/h`
      : `${d.id} track escalation — monitoring`;
    pushAlert(makeAlert(next, d.id, message, { lat: d.lat, lng: d.lng }), true);
  }
  version += 1;
  publish();
}

export function moveFriendlyDrone(dlat: number, dlng: number) {
  const d = moveOperatorDrone("FRIENDLY-01", dlat, dlng);
  if (!d) return;
  d.threat = "LOW";
  version += 1;
  publish();
}

export function gridRef(lat: number, lng: number): string {
  return `${lat.toFixed(4)}N ${lng.toFixed(4)}E`;
}

export function fmtClock(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString("en-GB", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function fmtHeading(deg: number): string {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return `${String(Math.round(deg)).padStart(3, "0")}° ${dirs[Math.round(deg / 45) % 8]}`;
}
