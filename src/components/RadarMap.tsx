import { motion } from "framer-motion";
import { useNavigate } from "@tanstack/react-router";
import { useSimulator } from "@/hooks/useSimulator";
import { MAP_SIZE, ZONES, effectiveThreat } from "@/lib/simulator";
import { threatColor } from "@/components/ThreatBadge";

const GRID = 10;

export function RadarMap() {
  const { drones } = useSimulator();
  const navigate = useNavigate();

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[860px] overflow-hidden border border-border bg-[#050505]">
      {/* radar sweep */}
      <div
        aria-hidden
        className="radar-sweep absolute inset-0"
        style={{
          background:
            "conic-gradient(from 0deg, color-mix(in oklab, var(--hud-green) 22%, transparent) 0deg, color-mix(in oklab, var(--hud-green) 6%, transparent) 28deg, transparent 60deg, transparent 360deg)",
        }}
      />
      <div aria-hidden className="scan-sweep" />
      <div aria-hidden className="scanline-overlay absolute inset-0" />

      {/* grid + zones */}
      <svg viewBox={`0 0 ${MAP_SIZE} ${MAP_SIZE}`} className="absolute inset-0 h-full w-full" aria-label="Tactical airspace map">
        {/* grid */}
        {Array.from({ length: GRID + 1 }, (_, i) => {
          const p = (i * MAP_SIZE) / GRID;
          return (
            <g key={i} stroke="var(--hud-dim)" strokeOpacity={0.22} strokeWidth={0.15}>
              <line x1={p} y1={0} x2={p} y2={MAP_SIZE} />
              <line x1={0} y1={p} x2={MAP_SIZE} y2={p} />
            </g>
          );
        })}
        {/* range rings */}
        {[20, 35, 50].map((r) => (
          <circle
            key={r}
            cx={MAP_SIZE / 2}
            cy={MAP_SIZE / 2}
            r={r}
            fill="none"
            stroke="var(--hud-dim)"
            strokeOpacity={0.35}
            strokeWidth={0.18}
            strokeDasharray="1.5 1.5"
          />
        ))}
        {/* crosshair */}
        <g stroke="var(--hud-dim)" strokeOpacity={0.5} strokeWidth={0.2}>
          <line x1={MAP_SIZE / 2} y1={44} x2={MAP_SIZE / 2} y2={56} />
          <line x1={44} y1={MAP_SIZE / 2} x2={56} y2={MAP_SIZE / 2} />
        </g>

        {/* zones */}
        {ZONES.map((z) => (
          <g key={z.id}>
            <circle
              cx={z.cx}
              cy={z.cy}
              r={z.r}
              fill={z.restricted ? "color-mix(in oklab, var(--hud-red) 6%, transparent)" : "color-mix(in oklab, var(--hud-green) 4%, transparent)"}
              stroke={z.restricted ? "var(--hud-red)" : "var(--hud-green)"}
              strokeOpacity={z.restricted ? 0.55 : 0.4}
              strokeWidth={0.3}
              strokeDasharray={z.restricted ? "2 1" : "0.8 1.2"}
            />
            <text
              x={z.cx}
              y={z.cy - z.r - 1.4}
              textAnchor="middle"
              fontSize={2.6}
              fill={z.restricted ? "var(--hud-red)" : "var(--hud-green)"}
              fillOpacity={0.85}
              letterSpacing={0.3}
            >
              ZONE {z.name}
            </text>
            <text
              x={z.cx}
              y={z.cy - z.r + 1.8}
              textAnchor="middle"
              fontSize={1.9}
              fill={z.restricted ? "var(--hud-red)" : "var(--hud-green)"}
              fillOpacity={0.6}
            >
              {z.restricted ? "// RESTRICTED" : "// PATROL"}
            </text>
          </g>
        ))}

        {/* drone blips */}
        {drones.map((d) => {
          const level = effectiveThreat(d);
          const color = threatColor(level);
          const critical = level === "CRITICAL";
          return (
            <motion.g
              key={d.id}
              initial={false}
              animate={{ x: d.x, y: d.y }}
              transition={{ duration: 0.95, ease: "linear" }}
              className="cursor-pointer"
              onClick={() => navigate({ to: "/drones/$id", params: { id: d.id } })}
              role="button"
              aria-label={`Open ${d.id} detail`}
            >
              <circle r={3.4} fill="transparent" />
              {critical && (
                <motion.circle
                  r={2}
                  fill="none"
                  stroke={color}
                  strokeWidth={0.35}
                  animate={{ r: [2, 5], opacity: [0.9, 0] }}
                  transition={{ duration: 1.2, repeat: Infinity, ease: "easeOut" }}
                />
              )}
              <circle r={2.1} fill="none" stroke={color} strokeWidth={0.32} strokeOpacity={0.9} />
              <circle r={0.85} fill={color} />
              <text y={-3.1} textAnchor="middle" fontSize={2.3} fill={color} letterSpacing={0.2}>
                {d.id.replace("DRONE-", "D-")}
              </text>
            </motion.g>
          );
        })}
      </svg>

      {/* corner telemetry */}
      <div className="pointer-events-none absolute top-2 left-2 text-[9px] tracking-widest text-muted-foreground uppercase">
        Grid 100×100 // 0.5 KM/DIV
      </div>
      <div className="pointer-events-none absolute right-2 bottom-2 text-[9px] tracking-widest text-muted-foreground uppercase">
        Click track for full profile
      </div>
    </div>
  );
}
