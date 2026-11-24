"use client";

import type { ModelId, ModelInfo } from "@/domain/model";
import { services } from "@/services";
import { useAsync } from "./useAsync";

export const useSamples = () => useAsync(() => services.samples.list());
export const useHealth = () => useAsync(() => services.health.check());

/** The model facts (test scores) by id; empty while loading or if the server is down. */
export function useModels(): Partial<Record<ModelId, ModelInfo>> {
  const m = useAsync(() => services.models.list());
  return m.status === "ready" ? Object.fromEntries(m.data.map((x) => [x.id, x])) : {};
}
