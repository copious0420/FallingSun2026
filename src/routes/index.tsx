import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { FileText } from "lucide-react";
import { TopBar } from "@/components/TopBar";
import type { MapViewMode, ZoneDrawMode } from "@/components/LeafletMap";
import { DroneList } from "@/components/DroneList";
import { DroneHistoryModal } from "@/components/DroneHistoryModal";
import { Panel } from "@/components/Panel";
import { useSimulator } from "@/hooks/useSimulator";
import {
  effectiveThreat,
  moveFriendlyDrone,
  moveManualDrone,
  predictTrajectory,
  type TrajectoryPrediction,
} from "@/lib/simulator";
import { getGroqAssessment, type GroqAssessment } from "@/lib/groq";

// Leaflet touches `window` as soon as it is imported, so the map is loaded in the browser only.
const LeafletMap = lazy(() => import("@/components/LeafletMap").then((m) => ({ default: m.LeafletMap })));

const KEY_STEP = 0.00025; // degrees per frame while a key is held (~28 m)

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SkyWatch — Live Operations Dashboard" },
      { name: "description", content: "Real-time counter-drone airspace picture: live tracks, threat levels and active alerts." },
    ],
  }),
  component: Index,
});

type BreachLogEntry = { droneId: string; zoneName: string; time: string; acknowledged: boolean };

// Shared with the report page, which reads it for the Groq intelligence summary.
function persistBreachLog(log: BreachLogEntry[]) {
  try {
    localStorage.setItem('skywatch_breach_log', JSON.stringify(log));
  } catch {
    // storage unavailable (private mode / blocked) — the in-memory log still works
  }
}

function Index() {
  const { drones, zones, version } = useSimulator();
  const predictions = useMemo(() => drones.map(predictTrajectory), [drones]);
  const [mapReady, setMapReady] = useState(false);
  const [viewMode, setViewMode] = useState<MapViewMode>("full");
  const [drawMode, setDrawMode] = useState<ZoneDrawMode>("none");
  const [activeBreachAlert, setActiveBreachAlert] = useState<TrajectoryPrediction | null>(null);
  const breachCooldowns = useRef<Map<string, number>>(new Map());
  const breachNotified = useRef<Map<string, number>>(new Map()); // drone+zone -> time until it may be logged again
  const breachSeen = useRef<Map<string, { start: number; last: number }>>(new Map()); // drone+zone -> when that breach began
  const [groqData, setGroqData] = useState<Record<string, GroqAssessment>>({}); // keyed by drone+zone
  const [historyOpen, setHistoryOpen] = useState(false);
  const [breachLog, setBreachLog] = useState<BreachLogEntry[]>([]);

  useEffect(() => setMapReady(true), []);

  // Arrow keys steer MANUAL-01, WASD steers FRIENDLY-01 (north = up)
  useEffect(() => {
    const keys = new Set<string>();
    let rafId: number;

    function loop() {
      let mLat = 0, mLng = 0, fLat = 0, fLng = 0;
      if (keys.has("ArrowUp")) mLat += KEY_STEP;
      if (keys.has("ArrowDown")) mLat -= KEY_STEP;
      if (keys.has("ArrowLeft")) mLng -= KEY_STEP;
      if (keys.has("ArrowRight")) mLng += KEY_STEP;
      if (keys.has("w")) fLat += KEY_STEP;
      if (keys.has("s")) fLat -= KEY_STEP;
      if (keys.has("a")) fLng -= KEY_STEP;
      if (keys.has("d")) fLng += KEY_STEP;
      if (mLat !== 0 || mLng !== 0) moveManualDrone(mLat, mLng);
      if (fLat !== 0 || fLng !== 0) moveFriendlyDrone(fLat, fLng);
      rafId = requestAnimationFrame(loop);
    }

    function onKeyDown(e: KeyboardEvent) {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        e.preventDefault();
        keys.add(e.key);
      } else if (["w", "a", "s", "d"].includes(e.key.toLowerCase())) {
        keys.add(e.key.toLowerCase());
      }
    }
    function onKeyUp(e: KeyboardEvent) {
      keys.delete(e.key);
      keys.delete(e.key.toLowerCase());
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    rafId = requestAnimationFrame(loop);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      cancelAnimationFrame(rafId);
    };
  }, []);

  useEffect(() => {
    const now = Date.now();
    const breaches = predictions
      .filter((p) => {
        if (!p.breachZone) return false;
        const key = p.droneId + "-" + p.breachZone.id;
        return (breachCooldowns.current.get(key) ?? 0) <= now;
      });
    // Remember when each drone+zone breach began. A breach that drops out of prediction for
    // under 3 s keeps its start time, so a borderline track flickering on/off doesn't keep "re-starting".
    const seen = breachSeen.current;
    const keyOf = (p: TrajectoryPrediction) => p.droneId + "-" + p.breachZone!.id;
    for (const p of breaches) {
      const s = seen.get(keyOf(p));
      seen.set(keyOf(p), { start: s ? s.start : now, last: now });
    }
    seen.forEach((s, key) => {
      if (now - s.last > 3000) seen.delete(key);
    });
    if (breaches.length === 0) {
      if (activeBreachAlert) setActiveBreachAlert(null);
      return;
    }
    // Show the latest breach; breaches that began together go most urgent first (soonest breachInSeconds).
    // Ranking by urgency alone pinned the banner on drones already inside a zone (ETA 0) indefinitely.
    breaches.sort(
      (a, b) =>
        seen.get(keyOf(b))!.start - seen.get(keyOf(a))!.start ||
        (a.breachInSeconds ?? 999) - (b.breachInSeconds ?? 999),
    );
    const topBreach = breaches[0]!;
    const sameAlert =
      activeBreachAlert?.droneId === topBreach.droneId && activeBreachAlert?.breachZone?.id === topBreach.breachZone?.id;
    setActiveBreachAlert(topBreach); // same drone+zone just refreshes timing/probability
    if (sameAlert) return;

    // New alert — log it and fetch Groq text at most once per drone+zone per 15s, so a breach
    // flickering in and out of prediction (or two drones trading places) can't spam the log or the API
    const notifyKey = topBreach.droneId + "-" + topBreach.breachZone!.id;
    if ((breachNotified.current.get(notifyKey) ?? 0) > now) return;
    breachNotified.current.set(notifyKey, now + 15000);
    setBreachLog(prev => {
      const updated = [...prev, {
        droneId: topBreach.droneId,
        zoneName: topBreach.breachZone?.name ?? topBreach.breachZone?.id ?? "UNKNOWN",
        time: new Date().toLocaleTimeString('en-GB', { hour12: false }),
        acknowledged: false
      }];
      persistBreachLog(updated);
      return updated;
    });
    const drone = drones.find((d) => d.id === topBreach.droneId);
    if (drone) {
      getGroqAssessment(
        drone.id,
        topBreach.breachZone!.name,
        Math.round(drone.speed),
        Math.round(drone.altitude),
        drone.friendly ?? false,
        topBreach.breachInSeconds ?? 10,
      ).then((assessment) => {
        setGroqData((prev) => ({ ...prev, [notifyKey]: assessment }));
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  const handleAcknowledge = () => {
    if (activeBreachAlert?.breachZone) {
      const key = activeBreachAlert.droneId + "-" + activeBreachAlert.breachZone.id;
      breachCooldowns.current.set(key, Date.now() + 15000);
    }
    setBreachLog(prev => {
      const copy = [...prev];
      const idx = [...copy].reverse().findIndex(e => e.droneId === activeBreachAlert?.droneId && !e.acknowledged);
      if (idx !== -1) copy[copy.length - 1 - idx] = { ...copy[copy.length - 1 - idx]!, acknowledged: true };
      persistBreachLog(copy);
      return copy;
    });
    setActiveBreachAlert(null);
  };

  const highRisk = drones.filter((d) => {
    const t = effectiveThreat(d);
    return t === "HIGH" || t === "CRITICAL";
  }).length;

  return (
    <div className="min-h-screen bg-background">
      <TopBar />

      <main className="mx-auto grid max-w-[1800px] gap-3 p-3 lg:grid-cols-[220px_minmax(0,1fr)]">
        {/* left — live tracks */}
        <Panel
          title={`Track Objects // ${drones.length}`}
          className="order-2 lg:order-1"
          bodyClassName="p-2"
          style={{
            background: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            borderRight: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <DroneList />
        </Panel>

        {/* center — radar */}
        <div className="order-1 space-y-3 lg:order-2">
          <div className="relative">
            {/* same frame the SVG radar used; the map fills it once it has loaded */}
            <div className="relative aspect-[16/10] w-full overflow-hidden border border-border bg-[#050505] lg:aspect-auto lg:h-[calc(100vh-120px)] lg:min-h-[360px]">
              {mapReady && (
                <Suspense fallback={null}>
                  <LeafletMap
                    drones={drones}
                    zones={zones}
                    predictions={predictions}
                    breachAlert={activeBreachAlert}
                    groqAssessment={
                      activeBreachAlert?.breachZone
                        ? groqData[activeBreachAlert.droneId + "-" + activeBreachAlert.breachZone.id]
                        : undefined
                    }
                    onAcknowledge={handleAcknowledge}
                    viewMode={viewMode}
                    onViewModeChange={setViewMode}
                    drawMode={drawMode}
                    onDrawModeChange={setDrawMode}
                  />
                </Suspense>
              )}
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[10px] tracking-widest text-muted-foreground uppercase">
              <span>Airspace Sector 7 // Top-Down Composite</span>
              <span className="flex items-center gap-3">
                <span className="flex items-center gap-1"><i className="inline-block h-1.5 w-1.5 rounded-full bg-hud-green" /> LOW/MED</span>
                <span className="flex items-center gap-1"><i className="inline-block h-1.5 w-1.5 rounded-full bg-hud-amber" /> MEDIUM</span>
                <span className="flex items-center gap-1"><i className="inline-block h-1.5 w-1.5 rounded-full bg-hud-red" /> HIGH/CRITICAL</span>
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-[10px] tracking-widest uppercase lg:hidden">
            <Link to="/report" className="border border-border px-3 py-2 text-muted-foreground hover:border-primary/50 hover:text-primary">
              <FileText className="mr-1 inline h-3.5 w-3.5" /> Intelligence Report
            </Link>
          </div>
        </div>

        {/* footer strip */}
        <footer
          className="order-4 col-span-full flex items-center justify-between gap-4 px-4 py-0 h-10 border-t border-white/10"
          style={{ background: 'rgba(15, 23, 42, 0.8)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}
        >
          {/* Left: status text */}
          <span className="min-w-0 truncate text-white/30 text-[10px] tracking-widest uppercase">
            {highRisk > 0
              ? `${highRisk} track${highRisk > 1 ? "s" : ""} flagged HIGH or above — ROE brief on standby`
              : "All tracks nominal — patrol corridors clear"}
          </span>

          {/* Right: buttons side by side, larger */}
          <div className="flex shrink-0 items-center gap-0">
            <button
              onClick={() => setDrawMode((m) => (m === "add" ? "none" : "add"))}
              aria-pressed={drawMode === "add"}
              className="h-10 px-6 text-[11px] font-semibold tracking-[0.15em] text-amber-400 border-l border-r border-amber-500/50 hover:bg-amber-500/10 transition-all duration-200"
              style={{ background: drawMode === "add" ? 'rgba(217,119,6,0.22)' : 'rgba(217,119,6,0.05)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', minWidth: '180px', fontFamily: "'JetBrains Mono',monospace" }}
            >
              SELECT RESTRICTED
            </button>
            <button
              onClick={() => setDrawMode((m) => (m === "remove" ? "none" : "remove"))}
              aria-pressed={drawMode === "remove"}
              className="h-10 px-6 text-[11px] font-semibold tracking-[0.15em] text-red-300 border-r border-red-400/40 hover:bg-red-500/10 transition-all duration-200"
              style={{ background: drawMode === "remove" ? 'rgba(239,68,68,0.2)' : 'rgba(239,68,68,0.04)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', minWidth: '180px', fontFamily: "'JetBrains Mono',monospace" }}
            >
              REMOVE RESTRICTED
            </button>
            <button
              onClick={() => setHistoryOpen(true)}
              className="h-10 px-8 text-[11px] font-semibold tracking-[0.18em] text-red-400 border-l border-r border-red-500/50 hover:bg-red-500/10 hover:border-red-400 transition-all duration-200"
              style={{ background: 'rgba(239,68,68,0.05)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', minWidth: '180px' }}
            >
              DRONE HISTORY
            </button>
            <Link
              to="/report"
              className="hidden h-10 items-center justify-center px-8 text-[11px] font-semibold tracking-[0.18em] text-green-400 border-r border-green-500/40 hover:bg-green-500/10 hover:border-green-400 transition-all duration-200 lg:inline-flex"
              style={{ background: 'rgba(52,211,153,0.04)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', minWidth: '200px' }}
            >
              INTELLIGENCE REPORT
            </Link>
          </div>
        </footer>

        {/* controls strip — full width under the bottom bar */}
        <div
          className="order-5 col-span-full flex min-h-10 flex-wrap items-center justify-around gap-x-6 gap-y-1 border border-pink-400/30 px-4 py-2 text-[11px] tracking-widest uppercase"
          style={{ fontFamily: "'JetBrains Mono', monospace", background: 'rgba(15, 23, 42, 0.8)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}
        >
          {[
            ["↑ ↓ ← →", "Steer MANUAL-01"],
            ["W A S D", "Steer FRIENDLY-01"],
            ["Select Restricted", "Click + drag on map"],
            ["Remove Restricted", "Click inside a drawn zone"],
            ["Zoom", "Toggle scroll-wheel zoom"],
            ["Click a track", "Open its profile"],
          ].map(([key, action]) => (
            <span key={key} className="flex items-center gap-2 whitespace-nowrap">
              <span className="font-bold" style={{ color: '#f472b6' }}>{key}</span>
              <span className="text-white/50">{action}</span>
            </span>
          ))}
        </div>
      </main>

      <DroneHistoryModal
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        breachLog={breachLog}
      />
    </div>
  );
}
