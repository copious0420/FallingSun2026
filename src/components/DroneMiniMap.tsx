import { useEffect, useRef } from "react";
// Leaflet reads `window` on import — this module must only load in the browser (drones.$id.tsx lazy-loads it).
import * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import { getAllZones, type Drone } from "@/lib/simulator";

const MINI_ZOOM = 14;

/** Read-only map that stays centred on one drone. */
export function DroneMiniMap({ drone }: { drone: Drone }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  // Init once — no interaction, just follows the drone
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const map = L.map(el, {
      center: [drone.lat, drone.lng],
      zoom: MINI_ZOOM,
      zoomControl: false,
      attributionControl: false,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      touchZoom: false,
      boxZoom: false,
      keyboard: false,
    });
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}", { maxZoom: 18 }).addTo(map);

    for (const zone of getAllZones()) {
      const zc = zone.restricted ? "#ef4444" : "#22c55e";
      L.circle([zone.lat, zone.lng], {
        radius: zone.r,
        color: zc,
        dashArray: "6 4",
        fillColor: zc,
        fillOpacity: 0.08,
        weight: 1.5,
        interactive: false,
      }).addTo(map);
    }

    const color = drone.friendly ? "#22c55e" : drone.id === "MANUAL-01" ? "#22d3ee" : "#f97316";
    const icon = L.divIcon({
      html: `<div style="width:10px;height:10px;border-radius:50%;border:2px solid ${color};background:${color}44;box-shadow:0 0 8px ${color};"></div>`,
      className: "",
      iconSize: [10, 10],
      iconAnchor: [5, 5],
    });
    markerRef.current = L.marker([drone.lat, drone.lng], { icon, interactive: false }).addTo(map);
    mapRef.current = map;

    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(el);
    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- created once; the effect below follows the drone
  }, []);

  // Follow the drone. Positions update every 50 ms, so recentre without animation (an animated pan would restart each tick).
  useEffect(() => {
    markerRef.current?.setLatLng([drone.lat, drone.lng]);
    mapRef.current?.setView([drone.lat, drone.lng], MINI_ZOOM, { animate: false });
  }, [drone.lat, drone.lng]);

  return <div ref={containerRef} className="skywatch-map h-full w-full" />;
}
