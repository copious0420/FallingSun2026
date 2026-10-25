import { cn } from "@/lib/utils";
import type { ThreatLevel } from "@/lib/simulator";

const STYLES: Record<ThreatLevel, string> = {
  LOW: "border-hud-green/40 text-hud-green",
  MEDIUM: "border-hud-amber/50 text-hud-amber",
  HIGH: "border-hud-red/60 text-hud-red bg-hud-red/10",
  CRITICAL: "border-hud-red text-hud-red bg-hud-red/20",
};

export function threatColor(level: ThreatLevel): string {
  switch (level) {
    case "MEDIUM":
      return "var(--hud-amber)";
    case "HIGH":
    case "CRITICAL":
      return "var(--hud-red)";
    default:
      return "var(--hud-green)";
  }
}

export function ThreatBadge({ level, className }: { level: ThreatLevel; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 border px-1.5 py-0.5 text-[10px] font-bold tracking-widest uppercase",
        STYLES[level],
        level === "CRITICAL" && "hud-blink",
      )}
    >
      <span className="inline-block h-1 w-1 rounded-full bg-current" />
      {level}
    </span>
  );
}
