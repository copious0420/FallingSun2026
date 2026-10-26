import { useEffect, useRef, useState } from "react";
// Leaflet reads `window` on import — this module must only load in the browser (index.tsx lazy-loads it).
import * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useNavigate } from "@tanstack/react-router";
import {
  DELHI_CENTER,
  addRestrictedZone,
  effectiveThreat,
  removeRestrictedZone,
  type Drone,
  type LatLng,
  type TrajectoryPrediction,
  type Zone,
} from "@/lib/simulator";
import { threatColor } from "@/components/ThreatBadge";
import { type GroqAssessment } from "@/lib/groq";

export type MapViewMode = "full" | "restricted";
export type ZoneDrawMode = "none" | "add" | "remove";

const CENTER: L.LatLngExpression = [DELHI_CENTER.lat, DELHI_CENTER.lng];
const DEFAULT_ZOOM = 12;

const DARK_TILES = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const DARK_ATTRIBUTION = '&copy; <a href="https://stadiamaps.com/">Stadia Maps</a>';
const SAT_TILES = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const SAT_ATTRIBUTION = "&copy; Esri";

const PANEL_STYLE = { background: "rgba(15,23,42,0.85)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" };

interface LeafletMapProps {
  drones: Drone[];
  zones: Zone[];
  predictions: TrajectoryPrediction[];
  breachAlert: TrajectoryPrediction | null;
  groqAssessment?: GroqAssessment | undefined;
  onAcknowledge: () => void;
  viewMode: MapViewMode;
  onViewModeChange: (mode: MapViewMode) => void;
  drawMode: ZoneDrawMode;
  onDrawModeChange: (mode: ZoneDrawMode) => void;
}

type DroneLayers = { marker: L.Marker; iconKey: string; hist: L.Polyline; drift: L.Polyline; breach: L.Polyline };
type ZoneLayers = { circle: L.Circle; label: L.Marker };

const toLatLngs = (pts: LatLng[]): L.LatLngExpression[] => pts.map((p) => [p.lat, p.lng]);

function droneColor(d: Drone): string {
  if (d.friendly) return "#22c55e";
  if (d.id === "MANUAL-01") return "#22d3ee";
  return threatColor(effectiveThreat(d)); // matches the legend under the map
}

function droneIcon(d: Drone, color: string, critical: boolean): L.DivIcon {
  const size = d.id === "MANUAL-01" ? 14 : 12;
  const shape = d.id === "MANUAL-01" ? "" : "border-radius:50%;";
  const html =
    `<div class="${critical ? "hud-pulse" : ""}" style="width:${size}px;height:${size}px;${shape}border:2px solid ${color};` +
    `background:color-mix(in oklab, ${color} 20%, transparent);box-shadow:0 0 6px ${color};"></div>` +
    `<div style="position:absolute;left:${size + 4}px;top:-3px;font-size:10px;color:${color};white-space:nowrap;` +
    `text-shadow:0 0 6px ${color};">${d.id}</div>`;
  return L.divIcon({ html, className: "skywatch-drone", iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
}

function zoneLabel(z: Zone): L.DivIcon {
  const color = z.restricted ? "#ef4444" : "#22c55e";
  const html =
    `<div style="transform:translate(-50%,-100%);text-align:center;font-size:11px;color:${color};font-weight:700;` +
    `letter-spacing:0.15em;text-shadow:0 0 8px ${color};white-space:nowrap;pointer-events:none;">ZONE ${z.name}<br/>` +
    `<span style="font-size:9px;opacity:0.6;">// ${z.restricted ? "RESTRICTED" : "PATROL"}</span></div>`;
  return L.divIcon({ html, className: "", iconSize: [0, 0] });
}

export function LeafletMap({
  drones,
  zones,
  predictions,
  breachAlert,
  groqAssessment,
  onAcknowledge,
  viewMode,
  onViewModeChange,
  drawMode,
  onDrawModeChange,
}: LeafletMapProps) {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const droneLayersRef = useRef<Map<string, DroneLayers>>(new Map());
  const zoneLayersRef = useRef<Map<string, ZoneLayers>>(new Map());
  const zonesRef = useRef(zones);
  zonesRef.current = zones;
  const [tileMode, setTileMode] = useState<"dark" | "satellite">("dark");
  const [zoomMode, setZoomMode] = useState(false);

  // Init map
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const map = L.map(el, {
      center: CENTER,
      zoom: DEFAULT_ZOOM,
      zoomControl: false,
      keyboard: false, // arrow keys steer MANUAL-01, not the map
      scrollWheelZoom: false, // off until the ZOOM button is toggled on, so page scrolling never zooms the map
    });
    mapRef.current = map;
    // The breach banner shows/hides above the map, which resizes it — keep Leaflet's tiles in sync.
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(el);
    const droneLayers = droneLayersRef.current;
    const zoneLayers = zoneLayersRef.current;
    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      tileLayerRef.current = null;
      droneLayers.clear();
      zoneLayers.clear();
    };
  }, []);

  // Tile mode switch
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    tileLayerRef.current?.remove();
    tileLayerRef.current = L.tileLayer(tileMode === "dark" ? DARK_TILES : SAT_TILES, {
      attribution: tileMode === "dark" ? DARK_ATTRIBUTION : SAT_ATTRIBUTION,
      maxZoom: 18,
    }).addTo(map);
  }, [tileMode]);

  // Zone circles + labels (built-in and operator-drawn)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const layers = zoneLayersRef.current;
    const seen = new Set<string>();
    for (const z of zones) {
      seen.add(z.id);
      if (layers.has(z.id)) continue;
      const color = z.restricted ? "#ef4444" : "#22c55e";
      const circle = L.circle([z.lat, z.lng], {
        radius: z.r,
        color,
        dashArray: "8 5",
        fillColor: color,
        fillOpacity: 0.08,
        weight: 1.5,
        interactive: false,
      }).addTo(map);
      const label = L.marker([z.lat + z.r / 111_320, z.lng], { icon: zoneLabel(z), interactive: false }).addTo(map);
      layers.set(z.id, { circle, label });
    }
    layers.forEach((l, id) => {
      if (seen.has(id)) return;
      l.circle.remove();
      l.label.remove();
      layers.delete(id);
    });
  }, [zones]);

  // Drone markers + track lines — created once per drone, then only moved
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const layers = droneLayersRef.current;
    const seen = new Set<string>();
    for (const d of drones) {
      seen.add(d.id);
      const color = droneColor(d);
      const critical = effectiveThreat(d) === "CRITICAL" && !d.friendly && d.id !== "MANUAL-01";
      const iconKey = `${color}|${critical}`;
      let l = layers.get(d.id);
      if (!l) {
        const marker = L.marker([d.lat, d.lng], { icon: droneIcon(d, color, critical), zIndexOffset: 1000 }).addTo(map);
        if (d.id !== "MANUAL-01") {
          marker.on("click", () => navigate({ to: "/drones/$id", params: { id: d.id } }));
        }
        l = {
          marker,
          iconKey,
          hist: L.polyline([], { color: "rgba(255,255,255,0.4)", weight: 1, interactive: false }).addTo(map),
          drift: L.polyline([], { color: "#22d3ee", weight: 1, dashArray: "4 4", opacity: 0.5, interactive: false }).addTo(map),
          breach: L.polyline([], { color: "#f97316", weight: 2, dashArray: "6 3", interactive: false }).addTo(map),
        };
        layers.set(d.id, l);
      } else {
        l.marker.setLatLng([d.lat, d.lng]);
        if (l.iconKey !== iconKey) {
          l.marker.setIcon(droneIcon(d, color, critical));
          l.iconKey = iconKey;
        }
      }

      const pred = predictions.find((p) => p.droneId === d.id);
      l.hist.setLatLngs(pred && pred.historicalPoints.length > 1 ? toLatLngs(pred.historicalPoints) : []);
      // Curved drift path only once a breach is plausible, as on the old radar
      l.drift.setLatLngs(pred && pred.breachProbability > 20 ? toLatLngs(pred.driftPoints) : []);
      l.breach.setLatLngs(pred?.breachZone && pred.points.length > 1 ? toLatLngs(pred.points) : []);
    }
    layers.forEach((l, id) => {
      if (seen.has(id)) return;
      l.marker.remove();
      l.hist.remove();
      l.drift.remove();
      l.breach.remove();
      layers.delete(id);
    });
  }, [drones, predictions, navigate]);

  // Draw / remove restricted zones
  useEffect(() => {
    const map = mapRef.current;
    if (!map || drawMode === "none") return;
    const el = map.getContainer();
    el.style.cursor = drawMode === "add" ? "crosshair" : "cell";
    if (drawMode === "add") map.dragging.disable(); // the drag draws the radius instead of panning

    let start: L.LatLng | null = null;
    let preview: L.Circle | null = null;

    const onDown = (e: L.LeafletMouseEvent) => {
      if (drawMode !== "add") return;
      start = e.latlng;
      preview = L.circle(start, { radius: 0, color: "#ef4444", dashArray: "6 4", fillColor: "#ef4444", fillOpacity: 0.15, weight: 2 }).addTo(map);
    };
    const onMove = (e: L.LeafletMouseEvent) => {
      if (start && preview) preview.setRadius(e.latlng.distanceTo(start));
    };
    const onUp = (e: L.LeafletMouseEvent) => {
      if (drawMode !== "add" || !start) return;
      const radius = e.latlng.distanceTo(start);
      if (radius > 100) addRestrictedZone(start.lat, start.lng, radius);
      onDrawModeChange("none");
    };
    const onClick = (e: L.LeafletMouseEvent) => {
      if (drawMode !== "remove") return;
      removeRestrictedZone(e.latlng.lat, e.latlng.lng);
      onDrawModeChange("none");
    };

    map.on("mousedown", onDown);
    map.on("mousemove", onMove);
    map.on("mouseup", onUp);
    map.on("click", onClick);
    return () => {
      map.off("mousedown", onDown);
      map.off("mousemove", onMove);
      map.off("mouseup", onUp);
      map.off("click", onClick);
      preview?.remove();
      el.style.cursor = "";
      map.dragging.enable();
    };
  }, [drawMode, onDrawModeChange]);

  // Scroll-wheel zoom only while ZOOM is toggled on
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (zoomMode) {
      map.scrollWheelZoom.enable();
      map.getContainer().style.cursor = "zoom-in";
    } else {
      map.scrollWheelZoom.disable();
      map.getContainer().style.cursor = "";
    }
  }, [zoomMode]);

  // Zone focus: blur only the tile pane — zones, drones and track lines live in other panes and stay sharp
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.getContainer().querySelectorAll<HTMLElement>(".leaflet-tile-pane, .leaflet-shadow-pane").forEach((pane) => {
      pane.style.filter = viewMode === "restricted" ? "blur(3px) brightness(0.7)" : "";
      pane.style.transition = "filter 0.3s ease";
    });
  }, [viewMode]);

  // View mode: ZONE FOCUS frames the restricted zones, FULL MAP returns to the default view
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (viewMode === "full") {
      map.setView(CENTER, DEFAULT_ZOOM);
      return;
    }
    const restricted = zonesRef.current.filter((z) => z.restricted);
    if (restricted.length === 0) return;
    const bounds = L.latLngBounds([]);
    for (const z of restricted) bounds.extend(L.latLng(z.lat, z.lng).toBounds(z.r * 2));
    map.fitBounds(bounds, { padding: [40, 40] });
  }, [viewMode]);

  return (
    <div className="relative flex h-full w-full flex-col font-mono">
      {/* Breach alert banner */}
      <div
        className={`relative z-20 transition-all duration-300 ${breachAlert?.breachZone ? "block" : "hidden"}`}
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          borderBottom: breachAlert?.breachZone ? (breachAlert.friendly ? "1px solid #22c55e" : "1px solid #f59e0b") : "none",
          background: "#0a0a0a",
        }}
      >
        {breachAlert?.breachZone && (
          <div className="flex items-center justify-between px-3 py-2 gap-4">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <span className={`animate-pulse text-sm ${breachAlert.friendly ? "text-green-400" : "text-amber-400"}`}>⚠</span>
              <span className={`text-[11px] font-bold tracking-widest ${breachAlert.friendly ? "text-green-400" : "text-amber-400"}`}>
                {breachAlert.friendly ? "FRIENDLY UNIT DETECTED" : "AREA BREACH PREDICTED"}
              </span>
              <span className="text-[11px] text-white">
                <span className={`font-bold ${breachAlert.friendly ? "text-green-400" : "text-amber-400"}`}>{breachAlert.droneId}</span>
                {breachAlert.friendly ? " entering " : " will enter "}
                <span className="text-red-400 font-bold">Zone {breachAlert.breachZone.name}</span>
                {!breachAlert.friendly && breachAlert.breachInSeconds ? (
                  <span className="text-amber-400 font-bold"> in ~{breachAlert.breachInSeconds}s</span>
                ) : null}
              </span>
              {groqAssessment && (
                <span className="text-[10px] text-gray-400 truncate hidden lg:block">AI: {groqAssessment.assessment}</span>
              )}
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className={`text-[11px] font-bold ${breachAlert.friendly ? "text-green-400" : "text-red-400"}`}>
                {breachAlert.breachProbability}%
              </span>
              <button
                onClick={onAcknowledge}
                className={`text-[10px] tracking-widest px-3 py-1 border transition-colors ${
                  breachAlert.friendly
                    ? "border-green-500 text-green-400 hover:bg-green-500/10"
                    : "border-amber-500 text-amber-400 hover:bg-amber-500/10"
                }`}
              >
                ACKNOWLEDGE
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="relative min-h-0 w-full flex-1">
        {/* z-0 isolates Leaflet's internal z-indexes (400–1000) so the overlays below sit on top */}
        <div ref={containerRef} className="skywatch-map absolute inset-0 z-0" />

        {drawMode !== "none" && (
          <div
            className="pointer-events-none absolute top-3 left-1/2 z-30 -translate-x-1/2 border border-amber-500/60 px-3 py-1.5 text-[10px] tracking-widest text-amber-400"
            style={PANEL_STYLE}
          >
            {drawMode === "add" ? "CLICK AND DRAG TO DRAW A RESTRICTED ZONE" : "CLICK INSIDE A DRAWN ZONE TO REMOVE IT"}
          </div>
        )}

        <div className="pointer-events-none absolute bottom-2 left-3 z-30 text-[9px] tracking-widest text-cyan-400/60 uppercase">
          ↑↓←→ MANUAL-01 · WASD FRIENDLY-01
        </div>

        {/* Bottom-right controls — raised above Leaflet's attribution line */}
        <div className="absolute bottom-6 right-3 z-30 flex flex-col items-end gap-2">
          <div className="flex gap-1">
            <button
              onClick={() => onViewModeChange("full")}
              className={`text-[9px] tracking-widest px-3 py-1.5 border transition-all ${viewMode === "full" ? "border-green-500 text-green-400 bg-green-500/10" : "border-white/20 text-white/40 hover:border-white/40"}`}
              style={PANEL_STYLE}
            >
              FULL MAP
            </button>
            <button
              onClick={() => onViewModeChange("restricted")}
              className={`text-[9px] tracking-widest px-3 py-1.5 border transition-all ${viewMode === "restricted" ? "border-amber-500 text-amber-400 bg-amber-500/10" : "border-white/20 text-white/40 hover:border-white/40"}`}
              style={PANEL_STYLE}
            >
              ZONE FOCUS
            </button>
          </div>

          <div className="flex gap-1">
            <button
              onClick={() => setTileMode("dark")}
              className={`text-[9px] tracking-widest px-3 py-1.5 border transition-all ${tileMode === "dark" ? "border-green-500 text-green-400" : "border-white/20 text-white/40"}`}
              style={PANEL_STYLE}
            >
              DARK
            </button>
            <button
              onClick={() => setTileMode("satellite")}
              className={`text-[9px] tracking-widest px-3 py-1.5 border transition-all ${tileMode === "satellite" ? "border-green-500 text-green-400" : "border-white/20 text-white/40"}`}
              style={PANEL_STYLE}
            >
              SATELLITE
            </button>
          </div>

          <button
            onClick={() => mapRef.current?.setView(CENTER, DEFAULT_ZOOM)}
            className="text-[9px] tracking-widest px-3 py-1.5 border border-white/25 text-white/50 hover:border-white/50 hover:text-white/80 transition-all"
            style={PANEL_STYLE}
          >
            ⊕ RECENTRE
          </button>

          <button
            onClick={() => setZoomMode((z) => !z)}
            className={`text-[9px] tracking-widest px-3 py-1.5 border transition-all ${
              zoomMode
                ? "border-cyan-400 text-cyan-400 bg-cyan-500/10"
                : "border-white/25 text-white/50 hover:border-white/50 hover:text-white/80"
            }`}
            style={{
              fontFamily: "'JetBrains Mono',monospace",
              ...(zoomMode ? {} : { background: "rgba(15,23,42,0.85)" }),
              backdropFilter: "blur(12px)",
            }}
          >
            {zoomMode ? "ZOOM ON" : "ZOOM"}
          </button>
        </div>
      </div>
    </div>
  );
}
