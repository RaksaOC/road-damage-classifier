"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import { FALLBACK, MAP_STYLE, currentPosition, placeName, type LatLng } from "@/lib/maps";
import styles from "./LocationPicker.module.css";

export interface Place extends LatLng {
  name: string; // always from the map, never typed
}

type Status = "locating" | "naming" | "ready" | "error";

/**
 * Map for "where is this road?" (OpenFreeMap + MapLibre). Starts at the user's position (or Phnom Penh if they
 * say no); click the map or drag the pin to move it. The place name is looked up from the pin.
 */
export function LocationPicker({ onChange }: { onChange: (p: Place | null) => void }) {
  const el = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<Status>("locating");
  const [place, setPlace] = useState<Place | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    let live = true;
    let map: import("maplibre-gl").Map | null = null;
    let lookup: AbortController | null = null; // only the latest lookup may set the name

    (async () => {
      const { default: maplibregl } = await import("maplibre-gl"); // browser only
      if (!live || !el.current) return;

      map = new maplibregl.Map({ container: el.current, style: MAP_STYLE, center: [FALLBACK.lng, FALLBACK.lat], zoom: 16, attributionControl: { compact: true } });
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
      map.on("error", () => live && setNote("The map tiles couldn't load. Check your connection."));
      const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#ff7759";
      const marker = new maplibregl.Marker({ draggable: true, color: accent }).setLngLat([FALLBACK.lng, FALLBACK.lat]).addTo(map);

      const moveTo = async (p: LatLng, fly: boolean) => {
        lookup?.abort();
        const ctl = (lookup = new AbortController());
        marker.setLngLat([p.lng, p.lat]);
        if (fly) map!.jumpTo({ center: [p.lng, p.lat] });
        setStatus("naming");
        onChangeRef.current(null); // no checking until the new name is in
        try {
          const name = await placeName(p, ctl.signal);
          if (!live) return;
          const next = { ...p, name };
          setPlace(next);
          onChangeRef.current(next);
          setStatus("ready");
        } catch {
          /* a newer pin replaced this lookup */
        }
      };

      map.on("click", (e) => moveTo({ lat: e.lngLat.lat, lng: e.lngLat.lng }, false));
      marker.on("dragend", () => {
        const p = marker.getLngLat();
        moveTo({ lat: p.lat, lng: p.lng }, false);
      });

      const here = await currentPosition();
      if (!live) return;
      if (!here) setNote("Location is off, so the map starts in Phnom Penh. Tap the map to place the pin.");
      moveTo(here ?? FALLBACK, true);
    })().catch(() => live && (setStatus("error"), setNote("The map couldn't be loaded.")));

    return () => {
      live = false;
      lookup?.abort();
      map?.remove();
    };
  }, []);

  return (
    <div className={styles.wrap}>
      <div ref={el} className={styles.map} aria-label="Map: tap or drag the pin to where the road is" />
      <p className={styles.place} aria-live="polite">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M12 21s7-6.1 7-11.5A7 7 0 0 0 5 9.5C5 14.9 12 21 12 21z" />
          <circle cx="12" cy="9.5" r="2.5" />
        </svg>
        {status === "locating" ? "Finding your location…" : status === "naming" ? "Looking up the address…" : status === "error" ? "Location unavailable" : place?.name}
      </p>
      {note && <p className={styles.note}>{note}</p>}
    </div>
  );
}
