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
      <div className="max-h-[420px] flex-1 space-y-3 overflow-y-auto pr-1 lg:max-h-[calc(100vh-190px)]">
        {sorted.map((d) => {
          const level = effectiveThreat(d);
          const rows: Array<[string, string]> = [
            ["Model", d.model],
            ["Spd", `${Math.round(d.speed)} KM/H`],
            ["Alt", `${Math.round(d.altitude)} M`],
            ["Hdg", fmtHeading(d.heading)],
            ["Grid", gridRef(d.lat, d.lng)],
          ];
          return (
            <button
              key={d.id}
              onClick={() => navigate({ to: "/drones/$id", params: { id: d.id } })}
              className={cn(
                // glass card — kept as classes (not inline style) so the hover background still applies
                "group relative block w-full border border-white/[0.07] bg-[rgba(15,23,42,0.6)] px-3 py-3 text-left leading-relaxed backdrop-blur-[8px] transition-colors hover:border-primary/50 hover:bg-accent/60",
              )}
            >
              <span
                aria-hidden
                className="absolute top-0 bottom-0 left-0 w-[3px]"
                style={{ background: threatColor(level) }}
              />
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="font-mono text-[12px] font-bold tracking-wider text-foreground">{d.id}</span>
                <ThreatBadge level={level} />
              </div>
              <div className="border-t border-white/8 mt-2 pt-2" />
              <div className="space-y-1.5 text-[10px] tracking-wider">
                {rows.map(([label, value], i) => (
                  <div key={label} className="flex items-center justify-between gap-2">
                    <span className="text-white/35 uppercase">{label}</span>
                    <span className="flex items-center gap-1 font-mono tabular-nums text-white/80">
                      {value}
                      {i === 0 && (
                        <ChevronsRight className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100 text-primary" />
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
