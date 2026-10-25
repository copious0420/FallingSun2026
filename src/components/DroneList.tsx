import { useNavigate } from "@tanstack/react-router";
import { ChevronsRight } from "lucide-react";
import { useSimulator } from "@/hooks/useSimulator";
import { effectiveThreat, fmtHeading, gridRef } from "@/lib/simulator";
import { threatColor, ThreatBadge } from "@/components/ThreatBadge";
import { cn } from "@/lib/utils";

export function DroneList() {
  const { drones } = useSimulator();
  const navigate = useNavigate();

  const sorted = [...drones].sort((a, b) => {
    const rank = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 } as const;
    return rank[effectiveThreat(a)] - rank[effectiveThreat(b)];
  });

  return (
    <div className="flex h-full flex-col">
      <div className="max-h-[420px] flex-1 space-y-1.5 overflow-y-auto pr-1 lg:max-h-[calc(100vh-190px)]">
        {sorted.map((d) => {
          const level = effectiveThreat(d);
          return (
            <button
              key={d.id}
              onClick={() => navigate({ to: "/drones/$id", params: { id: d.id } })}
              className={cn(
                "group relative block w-full border border-border bg-secondary/30 px-3 py-2 text-left transition-colors hover:border-primary/50 hover:bg-accent/60",
              )}
            >
              <span
                aria-hidden
                className="absolute top-0 bottom-0 left-0 w-[3px]"
                style={{ background: threatColor(level) }}
              />
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold tracking-wider text-foreground">{d.id}</span>
                <ThreatBadge level={level} />
              </div>
              <div className="mt-1 flex items-center justify-between text-[10px] tracking-wider text-muted-foreground uppercase">
                <span>{d.model}</span>
                <span className="flex items-center gap-1">
                  {Math.round(d.speed)} KM/H
                  <ChevronsRight className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100 text-primary" />
                </span>
              </div>
              <div className="mt-0.5 flex items-center justify-between text-[10px] tabular-nums text-muted-foreground">
                <span>ALT {Math.round(d.altitude)}M</span>
                <span>{fmtHeading(d.heading)}</span>
                <span>{gridRef(d.x, d.y)}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
