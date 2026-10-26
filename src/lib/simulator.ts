import { supabase } from "@/integrations/supabase/client";

export type ThreatLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type DroneFlag = "THREAT" | "SAFE" | null;

export interface Zone {
  id: string;
  name: string;
  cx: number;
  cy: number;
  r: number;
  restricted: boolean;
}

export interface Drone {
  id: string;
  model: string;
  x: number;
  y: number;
  tx: number;
  ty: number;
  heading: number;
  speed: number;
  cruise: number;
  altitude: number;
  battery: number;
  signal: number;
  threat: ThreatLevel;
  flagged: DroneFlag;
  speedHistory: number[];
  altitudeHistory: number[];
  waypointTicks: number;
  positionHistory: Array<{ x: number; y: number }>;
}

export interface Alert {
  id: string;
  droneId: string;
  level: ThreatLevel;
  message: string;
  timestamp: number;
  coords: { x: number; y: number };
}

export interface SimSnapshot {
  drones: Drone[];
  alerts: Alert[];
  clock: number;
  version: number;
}

export const MAP_SIZE = 100;
export const TICK_MS = 1000;
export const HISTORY_LEN = 60;

export const ZONES: Zone[] = [
  { id: "alpha", name: "ALPHA", cx: 30, cy: 34, r: 8, restricted: true },
  { id: "bravo", name: "BRAVO", cx: 72, cy: 28, r: 7, restricted: true },
  { id: "charlie", name: "CHARLIE", cx: 62, cy: 72, r: 6, restricted: true },
  { id: "delta", name: "DELTA", cx: 22, cy: 76, r: 9, restricted: false },
];

const RESTRICTED = ZONES.filter((z) => z.restricted);

const THREAT_RANK: Record<ThreatLevel, number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
  CRITICAL: 3,
};

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

const CRUISES = [38, 62, 74, 96, 122, 47, 88, 108, 56];
const MODELS = [
  "QUAD-4X",
  "FIXED-WING RQ-11",
  "VTOL-X2",
  "ROTOR-6",
  "SWARM-U3",
  "QUAD-4X",
  "FIXED-WING RQ-11",
  "VTOL-X2",
  "ROTOR-6",
];

function dist(x1: number, y1: number, x2: number, y2: number) {
  return Math.hypot(x2 - x1, y2 - y1);
}

function zoneAt(x: number, y: number): Zone | null {
  return RESTRICTED.find((z) => dist(x, y, z.cx, z.cy) <= z.r) ?? null;
}
export { zoneAt };

function threatFor(x: number, y: number, speed: number): ThreatLevel {
  const z = zoneAt(x, y);
  if (z && speed > 80) return "CRITICAL";
  if (z) return "HIGH";
  if (speed > 100) return "HIGH";
  const approaching = RESTRICTED.some((zz) => dist(x, y, zz.cx, zz.cy) <= zz.r + 16);
  if (approaching || speed > 85) return "MEDIUM";
  return "LOW";
}

/* ---------- store ---------- */
const drones: Drone[] = [];
const zoneCooldowns = new Map<string, number>(); // key: droneId+zoneId, value: timestamp when cooldown expires
const alerts: Alert[] = [];
let listeners = new Set<() => void>();
let intervalId: ReturnType<typeof setInterval> | null = null;
let version = 0;
let snapshot: SimSnapshot | null = null;

function makeDrone(i: number): Drone {
  const x = 5 + rand() * 90;
  const y = 5 + rand() * 90;
  const tx = 5 + rand() * 90;
  const ty = 5 + rand() * 90;
  const speed = (CRUISES[i] ?? 60) + (rand() - 0.5) * 14;
  const alt0 = 70 + rand() * 340;
  let altWalk = alt0;
  let spdWalk = Math.max(10, Math.round(speed + (rand() - 0.5) * 12));
  return {
    id: `DRONE-00${i + 1}`,
    model: MODELS[i] ?? "QUAD-4X",
    x,
    y,
    tx,
    ty,
    heading: (Math.atan2(ty - y, tx - x) * 180) / Math.PI,
    speed,
    cruise: CRUISES[i] ?? 60,
    altitude: alt0,
    battery: 58 + rand() * 40,
    signal: 70 + rand() * 28,
    threat: threatFor(x, y, speed),
    flagged: null,
    speedHistory: Array.from({ length: HISTORY_LEN }, () => {
      spdWalk = Math.min(160, Math.max(10, spdWalk + (rand() - 0.5) * 14));
      return Math.round(spdWalk);
    }),
    altitudeHistory: Array.from({ length: HISTORY_LEN }, () => {
      altWalk = Math.min(540, Math.max(50, altWalk + (rand() - 0.5) * 26));
      return Math.round(altWalk);
    }),
    waypointTicks: 8 + Math.floor(rand() * 18),
    positionHistory: [{ x, y }],
  };
}

for (let i = 0; i < 3; i++) drones.push(makeDrone(i));

// Manual drone — controlled by arrow keys
drones.push({
  id: "MANUAL-01",
  model: "OPERATOR-CTRL",
  x: 50,
  y: 85,
  tx: 50,
  ty: 85,
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
  positionHistory: Array.from({ length: 8 }, () => ({ x: 50, y: 85 })),
  waypointTicks: 999,
});

let alertSeq = 0;
function makeAlert(
  level: ThreatLevel,
  droneId: string,
  message: string,
  coords: { x: number; y: number },
  timestamp = Date.now(),
): Alert {
  return { id: `ALERT-${String(++alertSeq).padStart(4, "0")}`, droneId, level, message, timestamp, coords };
}

/* seed the feed with plausible prior activity so the ops floor opens live */
const t0 = Date.now();
alerts.push(
  makeAlert("HIGH", "DRONE-004", "DRONE-004 inside restricted Zone BRAVO — sustained track", { x: 71.2, y: 27.4 }, t0 - 412000),
  makeAlert("MEDIUM", "DRONE-007", "DRONE-007 approaching Zone ALPHA perimeter — 14.2 km out", { x: 38.1, y: 33.9 }, t0 - 267000),
  makeAlert("LOW", "DRONE-002", "DRONE-002 cleared Zone DELTA corridor — returning patrol", { x: 21.8, y: 74.6 }, t0 - 98000),
);

function persistAlert(alert: Alert) {
  if (typeof window === "undefined") return;
  supabase
    .from("drone_alerts")
    .insert({
      drone_id: alert.droneId,
      threat_level: alert.level,
      timestamp: new Date(alert.timestamp).toISOString(),
      coordinates: { x: Math.round(alert.coords.x * 10) / 10, y: Math.round(alert.coords.y * 10) / 10 },
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

function tick() {
  for (const d of drones) {
    if (d.id === "MANUAL-01") continue; // moved only by operator input
    const dx = d.tx - d.x;
    const dy = d.ty - d.y;
    const travel = Math.hypot(dx, dy);
    const prevX = d.x;
    const prevY = d.y;

    // Check if current target zone is on cooldown
    const targetZone = RESTRICTED.find((z) => Math.hypot(d.tx - z.cx, d.ty - z.cy) <= z.r + 2);
    const onCooldown = !!targetZone && (zoneCooldowns.get(d.id + targetZone.id) ?? 0) > Date.now();

    if (travel < 1.5 || d.waypointTicks <= 0 || onCooldown) {
      // Pick new waypoint — bias toward restricted zones but respect cooldowns
      const availableZones = RESTRICTED.filter((z) => (zoneCooldowns.get(d.id + z.id) ?? 0) <= Date.now());
      if (availableZones.length > 0 && Math.random() > 0.3) {
        const z = availableZones[Math.floor(Math.random() * availableZones.length)]!;
        const angle = Math.random() * Math.PI * 2;
        d.tx = z.cx + Math.cos(angle) * z.r * 0.5;
        d.ty = z.cy + Math.sin(angle) * z.r * 0.5;
      } else {
        d.tx = 5 + Math.random() * 90;
        d.ty = 5 + Math.random() * 90;
      }
      d.waypointTicks = 12 + Math.floor(Math.random() * 20);
    } else {
      const step = Math.min(travel, d.speed / 120);
      d.x += (dx / travel) * step;
      d.y += (dy / travel) * step;
      d.waypointTicks -= 1;
    }

    // When a drone exits a restricted zone, set a 15s cooldown for that zone
    for (const z of RESTRICTED) {
      if (dist(prevX, prevY, z.cx, z.cy) <= z.r && dist(d.x, d.y, z.cx, z.cy) > z.r) {
        zoneCooldowns.set(d.id + z.id, Date.now() + 15000);
      }
    }
    d.positionHistory.push({ x: d.x, y: d.y });
    if (d.positionHistory.length > 10) d.positionHistory.shift();
    d.heading = (((Math.atan2(d.ty - d.y, d.tx - d.x) * 180) / Math.PI) + 360) % 360;
    d.speed = Math.min(165, Math.max(12, d.speed + (d.cruise - d.speed) * 0.06 + (Math.random() - 0.5) * 5));
    d.altitude = Math.min(560, Math.max(40, d.altitude + (Math.random() - 0.5) * 14));
    d.signal = Math.min(99, Math.max(38, d.signal + (Math.random() - 0.5) * 6));
    d.battery = Math.max(11, d.battery - 0.012);

    d.speedHistory.push(Math.round(d.speed));
    if (d.speedHistory.length > HISTORY_LEN) d.speedHistory.shift();
    d.altitudeHistory.push(Math.round(d.altitude));
    if (d.altitudeHistory.length > HISTORY_LEN) d.altitudeHistory.shift();

    const prev = d.threat;
    const next = threatFor(d.x, d.y, d.speed);
    d.threat = next;
    if (THREAT_RANK[next] > THREAT_RANK[prev] && THREAT_RANK[next] >= 2) {
      const z = zoneAt(d.x, d.y);
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
      pushAlert(makeAlert(next, d.id, message, { x: d.x, y: d.y }), true);
    }
  }
  version += 1;
  publish();
}

function publish() {
  snapshot = {
    drones: drones.map((d) => ({ ...d })),
    alerts: [...alerts],
    clock: Date.now(),
    version,
  };
  listeners.forEach((cb) => cb());
}

function buildInitial(): SimSnapshot {
  return { drones: drones.map((d) => ({ ...d })), alerts: [...alerts], clock: Date.now(), version };
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
      makeAlert("CRITICAL", d.id, `OPERATOR FLAG — ${d.id} designated hostile threat, weapons coordinate standby`, { x: d.x, y: d.y }),
      true,
    );
  } else {
    pushAlert(
      makeAlert("LOW", d.id, `OPERATOR CLEAR — ${d.id} marked safe, threat assessment reset`, { x: d.x, y: d.y }),
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
    makeAlert("CRITICAL", d.id, `DISPATCH — rapid-response unit vectoring to ${d.id} grid position`, { x: d.x, y: d.y }),
    true,
  );
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
  const unitsPerTick = Math.max(d.speed, 12) / 120;
  for (const z of RESTRICTED) {
    const dd = dist(d.x, d.y, z.cx, z.cy);
    if (dd <= z.r) {
      insideZone = z;
      break;
    }
    const seconds = Math.round((dd - z.r) / unitsPerTick);
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
  points: Array<{ x: number; y: number }>; // straight-line projection used for the breach test
  driftPoints: Array<{ x: number; y: number }>; // curved projection if the drone keeps its current turn rate
  historicalPoints: Array<{ x: number; y: number }>; // last actual positions (the path it came from)
  breachZone: Zone | null;
  breachInSeconds: number | null;
  breachProbability: number; // 0-100, dynamic — recalculated every tick
  safeProbability: number; // 100 - breachProbability
  inside?: boolean; // drone is already inside the restricted zone
}

export function predictTrajectory(d: Drone): TrajectoryPrediction {
  const history = d.positionHistory;
  const historicalPoints = history.slice();
  const current = zoneAt(d.x, d.y);
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
    };
  }

  // Smoothed velocity vector — weighted average of the last 8 steps, recent steps weighted more.
  const samples = history.slice(-8);
  let vx = 0;
  let vy = 0;
  let weightSum = 0;
  for (let i = 1; i < samples.length; i++) {
    const w = i; // more recent deltas get a larger weight
    vx += (samples[i]!.x - samples[i - 1]!.x) * w;
    vy += (samples[i]!.y - samples[i - 1]!.y) * w;
    weightSum += w;
  }
  if (weightSum > 0) {
    vx /= weightSum;
    vy /= weightSum;
  }

  // MANUAL-01 history is sampled at ~60fps, not 1-tick intervals
  // Scale up velocity to match autonomous drone projection scale
  const isManual = d.id === "MANUAL-01";
  if (isManual) {
    const scale = 8; // approximate frames-per-tick ratio
    vx *= scale;
    vy *= scale;
  }

  // Nearest restricted zone — the reference for every probability factor below.
  let nearest: Zone | null = null;
  let nearestDist = Infinity;
  for (const z of RESTRICTED) {
    const dd = dist(d.x, d.y, z.cx, z.cy);
    if (dd < nearestDist) {
      nearestDist = dd;
      nearest = z;
    }
  }

  // Alignment of a vector toward the nearest zone centre, normalised to 0..1 (1 = aimed straight at it).
  const alignTo = (ax: number, ay: number): number => {
    if (!nearest) return 0;
    const toX = nearest.cx - d.x;
    const toY = nearest.cy - d.y;
    const aMag = Math.hypot(ax, ay);
    const toMag = Math.hypot(toX, toY);
    if (aMag === 0 || toMag === 0) return 0;
    const cos = (ax * toX + ay * toY) / (aMag * toMag); // -1..1
    return Math.max(0, Math.min(1, cos));
  };

  // Raw early vs recent step vectors (unscaled — magnitude cancels in the ratios below).
  const earlyVx = samples[1]!.x - samples[0]!.x;
  const earlyVy = samples[1]!.y - samples[0]!.y;
  const lastVx = samples[samples.length - 1]!.x - samples[samples.length - 2]!.x;
  const lastVy = samples[samples.length - 1]!.y - samples[samples.length - 2]!.y;

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

  // Curved ("drift") projection — rotate the velocity vector by the observed turn rate each step.
  const earlyAng = Math.atan2(earlyVy, earlyVx);
  const lastAng = Math.atan2(lastVy, lastVx);
  let dAng = lastAng - earlyAng;
  while (dAng > Math.PI) dAng -= 2 * Math.PI;
  while (dAng < -Math.PI) dAng += 2 * Math.PI;
  const turnSteps = samples.length - 1;
  const angVel = turnSteps > 0 ? dAng / turnSteps : 0;

  const driftPoints: Array<{ x: number; y: number }> = [];
  let dvx = vx;
  let dvy = vy;
  let dcx = d.x;
  let dcy = d.y;
  const cosA = Math.cos(angVel);
  const sinA = Math.sin(angVel);
  for (let i = 0; i < 30; i++) {
    const nvx = dvx * cosA - dvy * sinA;
    const nvy = dvx * sinA + dvy * cosA;
    dvx = nvx;
    dvy = nvy;
    dcx += dvx;
    dcy += dvy;
    driftPoints.push({ x: dcx, y: dcy });
  }

  // Straight-line projection used for the amber breach line and the breach modal.
  const points: Array<{ x: number; y: number }> = [];
  let cx = d.x;
  let cy = d.y;
  for (let i = 0; i < 40; i++) {
    cx += vx;
    cy += vy;
    points.push({ x: cx, y: cy });
  }

  let breachZone: Zone | null = null;
  let breachInSeconds: number | null = null;
  for (let i = 0; i < points.length && !breachZone; i++) {
    const p = points[i]!;
    for (const z of RESTRICTED) {
      if (dist(p.x, p.y, z.cx, z.cy) <= z.r) {
        breachZone = z;
        breachInSeconds = isManual ? Math.round((i + 1) / 8) : (i + 1) * (TICK_MS / 1000);
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
  };
}

export function moveManualDrone(dx: number, dy: number) {
  const d = drones.find((x) => x.id === "MANUAL-01");
  if (!d) return;
  const step = 0.06; // ~3.6 units/sec at 60fps
  d.x = Math.max(1, Math.min(99, d.x + dx * step));
  d.y = Math.max(1, Math.min(99, d.y + dy * step));
  d.tx = d.x;
  d.ty = d.y;
  if (dx !== 0 || dy !== 0) {
    d.heading = (((Math.atan2(dy, dx) * 180) / Math.PI) + 360) % 360;
  }
  d.positionHistory.push({ x: d.x, y: d.y });
  if (d.positionHistory.length > 8) d.positionHistory.shift();
  const prev = d.threat;
  const next = threatFor(d.x, d.y, d.speed);
  d.threat = next;
  if (THREAT_RANK[next] > THREAT_RANK[prev] && THREAT_RANK[next] >= 2) {
    const z = zoneAt(d.x, d.y);
    const message = z
      ? `${d.id} BREACH — entered restricted Zone ${z.name} at ${Math.round(d.speed)} km/h`
      : `${d.id} track escalation — monitoring`;
    pushAlert(makeAlert(next, d.id, message, { x: d.x, y: d.y }), true);
  }
  version += 1;
  publish();
}

export function gridRef(x: number, y: number): string {
  const lat = 27.1 + (y / MAP_SIZE) * 0.5;
  const lon = 77.1 + (x / MAP_SIZE) * 0.5;
  return `${lat.toFixed(4)}N ${lon.toFixed(4)}E`;
}

export function fmtClock(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString("en-GB", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function fmtHeading(deg: number): string {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return `${String(Math.round(deg)).padStart(3, "0")}° ${dirs[Math.round(deg / 45) % 8]}`;
}
