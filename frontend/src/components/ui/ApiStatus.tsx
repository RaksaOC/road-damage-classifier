"use client";

import { useEffect, useState } from "react";

type Health = { state: "checking" } | { state: "offline" } | { state: "online"; modelLoaded: boolean };

/* Shows whether the FastAPI backend (/api/health) is reachable. */
export function ApiStatus() {
  const [health, setHealth] = useState<Health>({ state: "checking" });

  useEffect(() => {
    let alive = true;
    const check = () =>
      fetch("/api/health", { cache: "no-store" })
        .then(r => (r.ok ? r.json() : Promise.reject()))
        .then(d => alive && setHealth({ state: "online", modelLoaded: !!d.model_loaded }))
        .catch(() => alive && setHealth({ state: "offline" }));
    check();
    const id = setInterval(check, 15000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const label =
    health.state === "online" ? `API online · ${health.modelLoaded ? "model loaded" : "no model yet"}`
    : health.state === "offline" ? "API offline"
    : "Checking API…";
  const dot = health.state === "online" ? "dot on" : health.state === "offline" ? "dot off" : "dot";
  return (
    <span className="status" aria-live="polite"><span className={dot} />{label}</span>
  );
}
