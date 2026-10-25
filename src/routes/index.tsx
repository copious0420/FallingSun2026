import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Activity, FileText } from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { RadarMap } from "@/components/RadarMap";
import { DroneList } from "@/components/DroneList";
import { AlertsFeed } from "@/components/AlertsFeed";
import { Panel } from "@/components/Panel";
import { useSimulator } from "@/hooks/useSimulator";
import { TrajectoryAlertModal } from "@/components/TrajectoryAlertModal";
import { effectiveThreat, predictTrajectory, type TrajectoryPrediction } from "@/lib/simulator";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SkyWatch — Live Operations Dashboard" },
      { name: "description", content: "Real-time counter-drone airspace picture: live tracks, threat levels and active alerts." },
    ],
  }),
  component: Index,
});

function Index() {
  const { alerts, drones, version } = useSimulator();
  const [activeBreachAlert, setActiveBreachAlert] = useState<TrajectoryPrediction | null>(null);
  const acknowledgedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (activeBreachAlert) return;
    const breaches = drones
      .map(predictTrajectory)
      .filter((p) => p.breachZone !== null && !acknowledgedRef.current.has(p.droneId + "-" + p.breachZone?.id));
    if (breaches.length > 0) {
      breaches.sort((a, b) => (a.breachInSeconds ?? 999) - (b.breachInSeconds ?? 999));
      setActiveBreachAlert(breaches[0]!);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  const highRisk = drones.filter((d) => {
    const t = effectiveThreat(d);
    return t === "HIGH" || t === "CRITICAL";
  }).length;

  return (
    <div className="min-h-screen bg-background">
      <TopBar />

      <main className="mx-auto grid max-w-[1800px] gap-3 p-3 lg:grid-cols-[300px_minmax(0,1fr)_340px]">
        {/* left — live tracks */}
        <Panel
          title={`Track Objects // ${drones.length}`}
          className="order-2 lg:order-1"
          bodyClassName="p-2"
        >
          <DroneList />
        </Panel>

        {/* center — radar */}
        <div className="order-1 space-y-3 lg:order-2">
          <div className="relative">
            <RadarMap />
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

        {/* right — alerts */}
        <Panel
          title="Active Alerts"
          right={
            <span className="flex items-center gap-1.5 text-[10px] tracking-widest text-muted-foreground uppercase">
              <Activity className="h-3.5 w-3.5 text-primary" />
              {alerts.length} events
            </span>
          }
          className="order-3"
          bodyClassName="p-2"
        >
          <AlertsFeed />
        </Panel>

        {/* footer strip */}
        <footer className="order-4 col-span-full flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3 text-[10px] tracking-widest text-muted-foreground uppercase">
          <span>
            {highRisk > 0
              ? `${highRisk} track${highRisk > 1 ? "s" : ""} flagged HIGH or above — ROE brief on standby`
              : "All tracks nominal — patrol corridors clear"}
          </span>
          <Link to="/report" className="hidden items-center gap-1.5 border border-border px-3 py-1.5 transition-colors hover:border-primary/50 hover:text-primary lg:inline-flex">
            <FileText className="h-3.5 w-3.5" /> Intelligence Report
          </Link>
        </footer>
      </main>

      <TrajectoryAlertModal
        prediction={activeBreachAlert}
        onAcknowledge={() => {
          if (activeBreachAlert?.breachZone) {
            acknowledgedRef.current.add(activeBreachAlert.droneId + "-" + activeBreachAlert.breachZone.id);
          }
          setActiveBreachAlert(null);
        }}
      />
    </div>
  );
}
