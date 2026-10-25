import { Radar, Satellite, TriangleAlert } from "lucide-react";
import { useSimulator } from "@/hooks/useSimulator";
import { effectiveThreat, fmtClock } from "@/lib/simulator";

export function TopBar() {
  const { drones, clock, version } = useSimulator();
  const threatCount = drones.filter((d) => {
    const t = effectiveThreat(d);
    return t === "HIGH" || t === "CRITICAL";
  }).length;
  const critical = drones.filter((d) => effectiveThreat(d) === "CRITICAL").length;

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1800px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2.5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center border border-primary/60 bg-primary/10">
            <Radar className="h-5 w-5 text-primary" />
          </div>
          <div>
            <div className="text-sm font-bold tracking-[0.35em] text-primary glow-green">SKYWATCH</div>
            <div className="text-[10px] tracking-[0.2em] text-muted-foreground uppercase">
              C-UAS Operations // Sector 7
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px] tracking-widest uppercase">
          <div className="flex items-center gap-2">
            <Satellite className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">Tracked</span>
            <span className="font-bold text-foreground">{drones.length}</span>
          </div>
          <div className="flex items-center gap-2">
            <TriangleAlert className="h-3.5 w-3.5 text-hud-amber" />
            <span className="text-muted-foreground">Threats</span>
            <span className={threatCount > 0 ? "font-bold text-hud-red" : "font-bold text-hud-green"}>
              {threatCount}
            </span>
          </div>
          <div className="hidden items-center gap-2 sm:flex">
            <span className="text-muted-foreground">Critical</span>
            <span className={critical > 0 ? "font-bold text-hud-red glow-red" : "font-bold text-foreground"}>
              {critical}
            </span>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-5 text-[11px] tracking-widest uppercase">
          <div className="flex items-center gap-2">
            <span className="hud-blink inline-block h-2 w-2 rounded-full bg-primary" />
            <span className="text-hud-green">SYS Operational</span>
          </div>
          <div className="hidden border-l border-border pl-5 sm:block">
            <span suppressHydrationWarning className="font-bold text-foreground tabular-nums">
              {fmtClock(clock)}
            </span>
            <span className="ml-2 text-muted-foreground">UTC+5:30</span>
          </div>
          <span className="hidden text-muted-foreground tabular-nums md:inline">T+{version}s</span>
        </div>
      </div>
    </header>
  );
}
