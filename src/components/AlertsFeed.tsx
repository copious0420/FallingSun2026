import { Link } from "@tanstack/react-router";
import { useSimulator } from "@/hooks/useSimulator";
import { fmtClock } from "@/lib/simulator";
import { threatColor } from "@/components/ThreatBadge";
import { cn } from "@/lib/utils";

export function AlertsFeed() {
  const { alerts } = useSimulator();

  return (
    <div className="flex h-full flex-col">
      <div className="max-h-[420px] flex-1 space-y-1.5 overflow-y-auto pr-1 lg:max-h-[calc(100vh-190px)]">
        {alerts.length === 0 ? (
          <p className="py-8 text-center text-[11px] tracking-widest text-muted-foreground uppercase">
            No active alerts — airspace clear
          </p>
        ) : (
          alerts.map((a) => (
            <article
              key={a.id}
              className={cn(
                "relative border border-border bg-secondary/30 py-2 pr-3 pl-4",
                a.level === "CRITICAL" && "border-hud-red/50 bg-hud-red/5",
              )}
            >
              <span
                aria-hidden
                className="absolute top-0 bottom-0 left-0 w-[3px]"
                style={{ background: threatColor(a.level) }}
              />
              <div className="flex items-center justify-between gap-2 text-[10px] tracking-widest uppercase">
                <span className={cn("font-bold", a.level === "CRITICAL" && "text-hud-red")}>
                  {a.level}
                </span>
                <span suppressHydrationWarning className="tabular-nums text-muted-foreground">
                  {fmtClock(a.timestamp)}
                </span>
              </div>
              <p className="mt-1 text-[11px] leading-snug text-foreground">{a.message}</p>
              <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
                <span className="tabular-nums">{a.id}</span>
                <Link
                  to="/drones/$id"
                  params={{ id: a.droneId }}
                  className="text-primary hover:underline"
                >
                  VIEW TRACK ▸
                </Link>
              </div>
            </article>
          ))
        )}
      </div>
    </div>
  );
}
