import { lazy, Suspense, useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  BatteryMedium,
  Flag,
  Gauge,
  Radio,
  ShieldCheck,
  Siren,
  Compass,
} from "lucide-react";
import { toast } from "sonner";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Area,
  AreaChart,
} from "recharts";
import { Panel } from "@/components/Panel";
import { ThreatBadge, threatColor } from "@/components/ThreatBadge";
import { useSimulator } from "@/hooks/useSimulator";
import {
  dispatchAlert,
  effectiveThreat,
  flagDrone,
  fmtHeading,
  getAllZones,
  gridRef,
  haversineMeters,
  HISTORY_LEN,
  nextZoneEta,
  etaText,
  predictTrajectory,
  zoneAt,
} from "@/lib/simulator";
import { ZONES } from "@/lib/simulator";

// Leaflet touches `window` as soon as it is imported, so the mini map is loaded in the browser only.
const DroneMiniMap = lazy(() => import("@/components/DroneMiniMap").then((m) => ({ default: m.DroneMiniMap })));

export const Route = createFileRoute("/drones/$id")({
  head: () => ({
    meta: [
      { title: "SkyWatch — Drone Track Profile" },
      { name: "description", content: "Full track profile: telemetry vitals, trajectory prediction and operator controls." },
    ],
  }),
  component: DroneDetail,
});

function DroneDetail() {
  const { id } = Route.useParams();
  const { drones } = useSimulator();
  const navigate = useNavigate();
  const drone = drones.find((d) => d.id === id);
  const [mapReady, setMapReady] = useState(false);
  useEffect(() => setMapReady(true), []);

  if (!drone) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background">
        <p className="text-sm tracking-widest text-muted-foreground uppercase">Track {id} not found — signal lost</p>
        <Link to="/" className="border border-border px-4 py-2 text-xs tracking-widest text-primary uppercase hover:bg-accent">
          Return to operations
        </Link>
      </div>
    );
  }

  const level = effectiveThreat(drone);
  const color = threatColor(level);
  const eta = nextZoneEta(drone);
  const prediction = predictTrajectory(drone);
  const inZone = zoneAt(drone.lat, drone.lng);
  const chartData = drone.speedHistory.map((speed, i) => ({
    t: i - (HISTORY_LEN - 1),
    speed,
    altitude: drone.altitudeHistory[i],
  }));
  const nearbyZones = getAllZones().filter((z) => haversineMeters(drone.lat, drone.lng, z.lat, z.lng) < 5000);

  return (
    // Desktop: fixed to the viewport, no page scroll. Mobile stacks and scrolls.
    <div className="flex min-h-screen flex-col bg-background lg:h-screen lg:overflow-hidden">
      <header className="sticky top-0 z-20 shrink-0 border-b border-border bg-background/95 px-4 py-2.5 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] items-center gap-4">
          <button
            onClick={() => navigate({ to: "/" })}
            className="flex items-center gap-2 border border-border px-3 py-1.5 text-[11px] tracking-widest text-muted-foreground uppercase transition-colors hover:border-primary/50 hover:text-primary"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Ops Floor
          </button>
          <h1 className="font-mono text-lg font-bold tracking-[0.3em] text-foreground">{drone.id}</h1>
          <ThreatBadge level={level} />
          {drone.flagged && (
            <span className="border border-primary/50 px-2 py-0.5 text-[10px] tracking-widest text-primary uppercase">
              Operator: {drone.flagged}
            </span>
          )}
          <span suppressHydrationWarning className="ml-auto hidden font-mono text-[11px] tabular-nums text-muted-foreground sm:block">
            {gridRef(drone.lat, drone.lng)}
          </span>
        </div>
      </header>

      {/* trajectory prediction — full width */}
      <div className="mx-auto w-full max-w-[1400px] shrink-0 px-3 pt-3">
        <Panel title="Trajectory Prediction">
          <div className="flex flex-wrap items-center gap-4">
            <Compass className="h-8 w-8 shrink-0" style={{ color }} />
            <p className="text-sm font-bold tracking-wider" style={{ color }}>
              {etaText(eta)}
            </p>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] tracking-widest text-muted-foreground uppercase sm:grid-cols-4">
            {ZONES.map((z) => (
              <div key={z.id} className="border border-border px-2 py-1.5">
                <div className="text-foreground">ZONE {z.name}</div>
                <div>{z.restricted ? "RESTRICTED" : "PATROL"}</div>
              </div>
            ))}
          </div>

          <div className="mt-4" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
            <div className="text-[10px] tracking-widest text-muted-foreground mb-2">TRAJECTORY ANALYSIS</div>

            <div className="flex justify-between mb-1">
              <span className="text-xs text-red-400">BREACH PROBABILITY</span>
              <span className="text-xs font-bold text-red-400">{prediction.breachProbability}%</span>
            </div>
            <div className="w-full bg-gray-800 h-1 mb-3">
              <div className="bg-red-500 h-1 transition-all duration-500" style={{ width: `${prediction.breachProbability}%` }} />
            </div>

            <div className="flex justify-between mb-1">
              <span className="text-xs text-green-400">SAFE CORRIDOR</span>
              <span className="text-xs font-bold text-green-400">{prediction.safeProbability}%</span>
            </div>
            <div className="w-full bg-gray-800 h-1">
              <div className="bg-green-500 h-1 transition-all duration-500" style={{ width: `${prediction.safeProbability}%` }} />
            </div>

            {prediction.breachZone && (
              <div className="mt-3 text-[10px] text-amber-400 tracking-widest">
                PREDICTED ZONE: {prediction.breachZone.name} — ETA {prediction.breachInSeconds}s
              </div>
            )}
          </div>
        </Panel>
      </div>

      {/* middle row — profile + actions | mini map | speed | altitude */}
      <div className="mx-auto mt-3 flex w-full max-w-[1400px] flex-col border-t border-white/10 lg:min-h-0 lg:flex-1 lg:flex-row">
        {/* Left panel — Track Profile + Operator Actions; scrolls inside itself if the screen is short */}
        <div className="flex shrink-0 flex-col gap-3 border-white/10 p-3 lg:w-[220px] lg:overflow-y-auto lg:border-r">
          <Panel title="Track Profile">
            <dl className="space-y-2.5 text-[11px] tracking-wider uppercase">
              {[
                ["Airframe", drone.model],
                ["Velocity", `${Math.round(drone.speed)} KM/H`],
                ["Altitude", `${Math.round(drone.altitude)} M AGL`],
                ["Heading", fmtHeading(drone.heading)],
                ["Grid", gridRef(drone.lat, drone.lng)],
                ["Battery", `${Math.round(drone.battery)}%`],
                ["Signal", `${Math.round(drone.signal)}% LINK`],
              ].map(([k, v]) => (
                <div key={k} className="flex items-center justify-between border-b border-border/60 pb-1.5">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="font-mono font-bold text-foreground">{v}</dd>
                </div>
              ))}
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Airspace</dt>
                <dd className="font-bold" style={{ color: inZone ? "var(--hud-red)" : "var(--hud-green)" }}>
                  {inZone ? `INSIDE ZONE ${inZone.name}` : "OPEN CORRIDOR"}
                </dd>
              </div>
            </dl>
          </Panel>

          <Panel title="Operator Actions">
            <div className="grid gap-2">
              <button
                onClick={() => {
                  flagDrone(drone.id, "THREAT");
                  toast.error(`${drone.id} flagged as hostile threat`);
                }}
                className="flex items-center justify-center gap-2 border border-hud-red/60 bg-hud-red/10 px-3 py-2.5 text-xs font-bold tracking-widest text-hud-red uppercase transition-colors hover:bg-hud-red/20"
              >
                <Flag className="h-4 w-4" /> Flag as Threat
              </button>
              <button
                onClick={() => {
                  flagDrone(drone.id, "SAFE");
                  toast.success(`${drone.id} marked safe — assessment reset`);
                }}
                className="flex items-center justify-center gap-2 border border-hud-green/50 bg-hud-green/5 px-3 py-2.5 text-xs font-bold tracking-widest text-hud-green uppercase transition-colors hover:bg-hud-green/15"
              >
                <ShieldCheck className="h-4 w-4" /> Mark Safe
              </button>
              <button
                onClick={() => {
                  dispatchAlert(drone.id);
                  toast.warning(`Alert dispatched — units vectoring to ${drone.id}`);
                }}
                className="flex items-center justify-center gap-2 border border-hud-amber/60 bg-hud-amber/10 px-3 py-2.5 text-xs font-bold tracking-widest text-hud-amber uppercase transition-colors hover:bg-hud-amber/20"
              >
                <Siren className="h-4 w-4" /> Dispatch Alert
              </button>
            </div>
          </Panel>
        </div>

        {/* Right: 3 equal squares */}
        <div className="flex h-[220px] min-w-0 flex-1 lg:h-auto">
          {/* Mini Map */}
          <div className="relative min-w-0 flex-1 border-r border-white/10">
            {mapReady && (
              <Suspense fallback={null}>
                <DroneMiniMap drone={drone} />
              </Suspense>
            )}
          </div>

          {/* Speed Chart */}
          <div className="flex min-w-0 flex-1 flex-col border-r border-white/10">
            <div className="flex shrink-0 items-center justify-between px-3 pt-2 text-[9px] tracking-widest text-white/40" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              VITALS // SPEED
              <Gauge className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <div className="min-h-0 flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 6, right: 8, bottom: 0, left: -18 }}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                  <XAxis dataKey="t" tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={{ stroke: "var(--border)" }} />
                  <YAxis tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={{ stroke: "var(--border)" }} />
                  <Tooltip
                    contentStyle={{
                      background: "var(--card)",
                      border: "1px solid var(--border)",
                      fontSize: 11,
                      fontFamily: "var(--font-mono)",
                    }}
                    labelFormatter={(t) => `T${Number(t) >= 0 ? "+" : ""}${t}s`}
                    formatter={(v) => [`${v} km/h`, "Speed"]}
                  />
                  <Line type="monotone" dataKey="speed" stroke="var(--hud-green)" strokeWidth={2} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Altitude Chart */}
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex shrink-0 items-center justify-between px-3 pt-2 text-[9px] tracking-widest text-white/40" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              VITALS // ALTITUDE
              <BatteryMedium className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <div className="min-h-0 flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 6, right: 8, bottom: 0, left: -18 }}>
                  <defs>
                    <linearGradient id="altFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--hud-green)" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="var(--hud-green)" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                  <XAxis dataKey="t" tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={{ stroke: "var(--border)" }} />
                  <YAxis tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={{ stroke: "var(--border)" }} />
                  <Tooltip
                    contentStyle={{
                      background: "var(--card)",
                      border: "1px solid var(--border)",
                      fontSize: 11,
                      fontFamily: "var(--font-mono)",
                    }}
                    labelFormatter={(t) => `T${Number(t) >= 0 ? "+" : ""}${t}s`}
                    formatter={(v) => [`${v} m`, "Altitude"]}
                  />
                  <Area type="monotone" dataKey="altitude" stroke="var(--hud-green)" strokeWidth={2} fill="url(#altFill)" dot={false} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

      {/* live telemetry — full width, pinned to the bottom */}
      <div className="mx-auto w-full max-w-[1400px] shrink-0 px-3 pb-3">
        <Panel title="Live Telemetry">
          <div className="grid grid-cols-2 gap-2 text-center text-[11px] tracking-widest uppercase sm:grid-cols-4">
            <div className="border border-border py-2">
              <Radio className="mx-auto h-3.5 w-3.5 text-muted-foreground" />
              <div className="mt-1 font-mono font-bold text-foreground tabular-nums">{Math.round(drone.speed)} KM/H</div>
              <div className="text-[9px] text-muted-foreground">Velocity</div>
            </div>
            <motion.div
              key={Math.round(drone.altitude)}
              initial={{ opacity: 0.4 }}
              animate={{ opacity: 1 }}
              className="border border-border py-2"
            >
              <div className="font-mono font-bold text-foreground tabular-nums">{Math.round(drone.altitude)} M</div>
              <div className="text-[9px] text-muted-foreground">Altitude</div>
            </motion.div>
            <div className="border border-border py-2">
              <div className="font-mono font-bold text-foreground tabular-nums">{fmtHeading(drone.heading)}</div>
              <div className="text-[9px] text-muted-foreground">Heading</div>
            </div>
            <div className="flex flex-col justify-center border border-border px-4 py-2 text-left">
              <div className="mb-2 text-[9px] tracking-widest text-white/35" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                NEARBY ZONES
              </div>
              <div className="flex flex-col gap-1">
                {nearbyZones.map((zone) => (
                  <div key={zone.id} className="flex items-center gap-2">
                    <span className={`h-1.5 w-1.5 rounded-full ${zone.restricted ? 'bg-red-400' : 'bg-green-400'}`} />
                    <span className="text-[11px] font-bold text-white/80" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                      {zone.name}
                    </span>
                  </div>
                ))}
                {nearbyZones.length === 0 && (
                  <span className="text-[10px] text-white/25" style={{ fontFamily: "'JetBrains Mono', monospace" }}>NONE IN RANGE</span>
                )}
              </div>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}
