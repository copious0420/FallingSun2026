import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, BrainCircuit, Download, Database } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Panel } from "@/components/Panel";
import { useSimulator } from "@/hooks/useSimulator";
import { fmtClock, gridRef } from "@/lib/simulator";
import { threatColor } from "@/components/ThreatBadge";

export const Route = createFileRoute("/report")({
  head: () => ({
    meta: [
      { title: "SkyWatch — Intelligence Report" },
      { name: "description", content: "Session intelligence summary, incident log and persisted alert records." },
    ],
  }),
  component: Report,
});

const REPORT_ID = `SW-IR-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-042`;

function Report() {
  const { alerts, drones } = useSimulator();
  const [dbCount, setDbCount] = useState<number | null>(null);

  const refreshCount = () => {
    supabase
      .from("drone_alerts")
      .select("id", { count: "exact", head: true })
      .then(({ count, error }) => {
        if (!error) setDbCount(count ?? 0);
      });
  };

  useEffect(refreshCount, []);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 px-4 py-2.5 backdrop-blur">
        <div className="mx-auto flex max-w-[1200px] items-center gap-4">
          <Link
            to="/"
            className="flex items-center gap-2 border border-border px-3 py-1.5 text-[11px] tracking-widest text-muted-foreground uppercase transition-colors hover:border-primary/50 hover:text-primary"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Ops Floor
          </Link>
          <span className="border border-hud-amber/60 px-2 py-0.5 text-[10px] font-bold tracking-widest text-hud-amber uppercase">
            Exercise // Simulated Data
          </span>
          <button
            onClick={() => toast.success("Export queued — SW-IR report will download shortly")}
            className="ml-auto flex items-center gap-2 border border-primary/60 bg-primary/10 px-4 py-1.5 text-[11px] font-bold tracking-widest text-primary uppercase transition-colors hover:bg-primary/20"
          >
            <Download className="h-3.5 w-3.5" /> Export as PDF
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-[1200px] space-y-3 p-3">
        <Panel title="Intelligence Summary" className="mt-1">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] tracking-widest text-muted-foreground uppercase">
            <span>Report {REPORT_ID}</span>
            <span suppressHydrationWarning>Generated {fmtClock(Date.now())} // Sector 7</span>
          </div>

          <div className="mt-3 flex items-start gap-3 border border-primary/30 bg-primary/5 p-3">
            <BrainCircuit className="mt-0.5 h-6 w-6 shrink-0 text-primary" />
            <div>
              <div className="text-[10px] tracking-widest text-primary uppercase">SkyWatch AI // Threat Assessment (GPT analysis — placeholder output)</div>
              <div className="mt-2 space-y-2.5 text-[12px] leading-relaxed text-foreground">
                <p>
                  <span className="font-bold text-primary">SITUATION.</span> Nine airborne tracks are under continuous
                  surveillance in Sector 7. {drones.filter((d) => d.threat === "HIGH" || d.threat === "CRITICAL").length} tracks currently
                  rate HIGH or CRITICAL. Drone activity shows a bimodal pattern: slow quadcopter platforms loitering along the
                  Zone DELTA patrol corridor, and faster fixed-wing tracks transiting east toward the Zone BRAVO restricted
                  complex.
                </p>
                <p>
                  <span className="font-bold text-primary">ASSESSMENT.</span> Escalation risk is rated SUBSTANTIAL. The most
                  probable course of action over the next 30 minutes is a high-speed incursion into Zone ALPHA or Zone BRAVO
                  by a fixed-wing track exceeding 80 km/h — the exact signature that triggers CRITICAL classification. Swarm
                  behaviour is assessed UNLIKELY at this time; tracks maintain independent headings with no coordinated
                  spacing observed.
                </p>
                <p>
                  <span className="font-bold text-primary">RECOMMENDATION.</span> Keep the rapid-response unit on 2-minute
                  standby postured south of Zone ALPHA. Pre-clear engagement authority for any track breaching a restricted
                  perimeter above 80 km/h. Continue passive RF monitoring; a second intelligence cycle is scheduled at the
                  top of the hour.
                </p>
              </div>
              <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[10px] tracking-widest text-muted-foreground uppercase">
                <span>Confidence: MODERATE-HIGH (78%)</span>
                <span>Model: SkyAI-v2 // GPT placeholder</span>
                <span>Review: REQUIRED before dissemination</span>
              </div>
            </div>
          </div>
        </Panel>

        <Panel title="Incident Log // Current Session" right={<span className="text-[10px] tracking-widest text-muted-foreground uppercase">{alerts.length} incidents</span>}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-[11px]">
              <thead>
                <tr className="border-b border-border text-[10px] tracking-widest text-muted-foreground uppercase">
                  <th className="py-2 pr-3 font-medium">Time</th>
                  <th className="py-2 pr-3 font-medium">Drone</th>
                  <th className="py-2 pr-3 font-medium">Threat</th>
                  <th className="py-2 pr-3 font-medium">Grid</th>
                  <th className="py-2 font-medium">Event</th>
                </tr>
              </thead>
              <tbody>
                {alerts.length === 0 && (
                  <tr><td colSpan={5} className="py-6 text-center text-muted-foreground uppercase tracking-widest">No incidents this session</td></tr>
                )}
                {alerts.map((a) => (
                  <tr key={a.id} className="border-b border-border/50 align-top">
                    <td suppressHydrationWarning className="py-2 pr-3 tabular-nums text-muted-foreground">{fmtClock(a.timestamp)}</td>
                    <td className="py-2 pr-3 font-bold text-foreground">{a.droneId}</td>
                    <td className="py-2 pr-3">
                      <span className="font-bold tracking-widest uppercase" style={{ color: threatColor(a.level) }}>{a.level}</span>
                    </td>
                    <td className="py-2 pr-3 tabular-nums text-muted-foreground">{gridRef(a.coords.x, a.coords.y)}</td>
                    <td className="py-2 text-foreground">{a.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="Persistence">
          <div className="flex flex-wrap items-center justify-between gap-3 text-[11px] tracking-widest text-muted-foreground uppercase">
            <span className="flex items-center gap-2">
              <Database className="h-4 w-4 text-primary" />
              {dbCount === null ? "Querying alert database…" : `${dbCount} alert events persisted to drone_alerts`}
            </span>
            <button
              onClick={refreshCount}
              className="border border-border px-3 py-1.5 transition-colors hover:border-primary/50 hover:text-primary"
            >
              Sync Now
            </button>
          </div>
        </Panel>
      </main>
    </div>
  );
}
