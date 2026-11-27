/* The one switch between the mock and the real backend.

   NEXT_PUBLIC_DATA_SOURCE=api   (default) FastAPI + Postgres through /api/*
   NEXT_PUBLIC_DATA_SOURCE=mock  everything in the browser: fake classifier, reports in localStorage

   It is read at build time (next dev / next build), so restart the dev server after changing it. */
import { createApiServices } from "@/data/api";
import { createMockServices } from "@/data/mock";
import type { DataSource, Services } from "./ports";

export * from "./ports";

// must be written out in full: Next.js only inlines literal process.env.NEXT_PUBLIC_* references
const source: DataSource = process.env.NEXT_PUBLIC_DATA_SOURCE === "mock" ? "mock" : "api";

export const services: Services = source === "mock" ? createMockServices() : createApiServices();
