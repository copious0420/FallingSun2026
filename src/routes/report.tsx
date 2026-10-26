import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, BrainCircuit, Download, Database } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Panel } from "@/components/Panel";
import { useSimulator } from "@/hooks/useSimulator";
import { fmtClock, getSimulatorState, gridRef } from "@/lib/simulator";
import { threatColor } from "@/components/ThreatBadge";
import { generateIntelligenceReport } from "@/lib/groq";

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
  const { alerts } = useSimulator();
  const [dbCount, setDbCount] = useState<number | null>(null);
  const [report, setReport] = useState<{
    situation: string;
    assessment: string;
    recommendation: string;
    confidence: number;
    error?: string | undefined;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);

  const generateReport = async () => {
    setLoading(true);
    const state = getSimulatorState();
    // Breach log is persisted by the ops floor (index.tsx); empty if none recorded yet
    const breachLog = (() => {
      try { return JSON.parse(localStorage.getItem('skywatch_breach_log') ?? '[]'); } catch { return []; }
    })();
    const drones = state.drones.map(d => ({
      id: d.id,
      x: d.lat,
      y: d.lng,
      speed: d.speed ?? 0,
      heading: d.heading ?? 0,
      threat: d.threat ?? 'LOW',
      friendly: d.friendly
    }));
    const result = await generateIntelligenceReport(drones, breachLog.slice(-5));
    setReport(result);
    setGeneratedAt(new Date().toLocaleTimeString('en-GB', { hour12: false }));
    setLoading(false);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { generateReport(); }, []);

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
          <button
            onClick={generateReport}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-1.5 text-[10px] tracking-widest border border-green-500/50 text-green-400 hover:bg-green-500/10 disabled:opacity-40 transition-all"
            style={{ fontFamily: "'JetBrains Mono', monospace" }}
          >
            {loading ? '...' : '↻ REGENERATE'}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-[1200px] space-y-3 p-3">
        <Panel title="Intelligence Summary" className="mt-1">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] tracking-widest text-muted-foreground uppercase">
            <span className="font-mono">Report {REPORT_ID}</span>
            <span suppressHydrationWarning className="font-mono">Generated {fmtClock(Date.now())} // Sector 7</span>
          </div>

          <div className="mt-3 flex items-start gap-3 border border-primary/30 bg-primary/5 p-3">
            <BrainCircuit className="mt-0.5 h-6 w-6 shrink-0 text-primary" />
            <div>
              <div className="text-[10px] tracking-widest text-primary uppercase">SkyWatch AI // Threat Assessment (Groq analysis)</div>
              <div className="mt-2 space-y-2.5 text-[12px] leading-relaxed text-foreground">
                {loading ? (
                  <div className="flex items-center gap-3 py-8">
                    <div className="animate-spin w-4 h-4 border border-green-500 border-t-transparent rounded-full" />
                    <span className="text-green-400/60 text-[11px] tracking-widest" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                      SKYAI GENERATING REPORT...
                    </span>
                  </div>
                ) : report ? (
                  <>
                    <p><span className="font-bold text-primary">SITUATION.</span> {report.situation}</p>
                    <p><span className="font-bold text-primary">ASSESSMENT.</span> {report.assessment}</p>
                    <p><span className="font-bold text-primary">RECOMMENDATION.</span> {report.recommendation}</p>
                    {/* DEBUG — raw Groq error, remove once the report is generating */}
                    {report.error && (
                      <pre className="whitespace-pre-wrap break-all border border-red-500/50 bg-red-500/10 p-2 text-[10px] text-red-400">
                        GROQ ERROR: {report.error}
                      </pre>
                    )}
                  </>
                ) : null}
              </div>
              <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[10px] tracking-widest text-muted-foreground uppercase">
                <span>Confidence: {report && report.confidence > 0 ? `${report.confidence}%` : 'N/A'}</span>
                <span>Model: LLAMA-3.1-8B // GROQ</span>
                <span>Generated: {generatedAt ?? '--'}</span>
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
                    <td suppressHydrationWarning className="py-2 pr-3 font-mono tabular-nums text-muted-foreground">{fmtClock(a.timestamp)}</td>
                    <td className="py-2 pr-3 font-mono font-bold text-foreground">{a.droneId}</td>
                    <td className="py-2 pr-3">
                      <span className="font-bold tracking-widest uppercase" style={{ color: threatColor(a.level) }}>{a.level}</span>
                    </td>
                    <td className="py-2 pr-3 font-mono tabular-nums text-muted-foreground">{gridRef(a.coords.lat, a.coords.lng)}</td>
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
