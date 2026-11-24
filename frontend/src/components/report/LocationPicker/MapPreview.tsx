"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";
import { MAP_STYLE, type LatLng } from "@/lib/maps";
import styles from "./LocationPicker.module.css";

/** A small, still map with the report's pin (no panning or zooming). */
export function MapPreview({ at, className }: { at: LatLng; className?: string }) {
  const el = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    let map: import("maplibre-gl").Map | null = null;
    (async () => {
      const { default: maplibregl } = await import("maplibre-gl");
      if (!live || !el.current) return;
      map = new maplibregl.Map({ container: el.current, style: MAP_STYLE, center: [at.lng, at.lat], zoom: 16, interactive: false, attributionControl: { compact: true } });
      const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#ff7759";
      new maplibregl.Marker({ color: accent }).setLngLat([at.lng, at.lat]).addTo(map);
    })();
    return () => {
      live = false;
      map?.remove();
    };
  }, [at.lat, at.lng]);

  return <div ref={el} className={`${styles.preview} ${className ?? ""}`} role="img" aria-label="Map of where the road is" />;
}
