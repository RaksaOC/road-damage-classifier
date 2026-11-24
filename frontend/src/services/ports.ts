/* Ports: what the UI needs from "the backend", as interfaces. Components and hooks only use these,
   so the mock (src/data/mock) and the real API (src/data/api) are interchangeable. */
import type { Analysis, PhotoInput } from "@/domain/analysis";
import type { Box, Correction } from "@/domain/correction";
import type { ModelInfo } from "@/domain/model";
import type { NewReport, Page, Report, ReportQuery, ReportSummary } from "@/domain/report";
import type { Sample } from "@/domain/sample";

export interface AnalysisService {
  /** Runs every model on the photo. Nothing is saved as a report yet. */
  analyze(input: PhotoInput, opts?: { signal?: AbortSignal }): Promise<Analysis>;
  /** Stores the user's own boxes for a checked photo (replaces earlier ones). No boxes = no damage. */
  correct(analysisId: string, boxes: Box[]): Promise<Correction>;
}

export interface ReportRepository {
  list(query: ReportQuery, opts?: { signal?: AbortSignal }): Promise<Page<ReportSummary>>;
  get(id: string): Promise<Report>;
  create(report: NewReport): Promise<Report>; // records are permanent: there is no remove
}

export interface ModelCatalog {
  list(): Promise<ModelInfo[]>;
}

export interface SampleCatalog {
  list(): Promise<{ samples: Sample[] }>;
}

export interface Health {
  ok: boolean; // everything needed to check a road is up
  message: string | null; // what is wrong, in words a user can act on
}

export interface HealthService {
  check(): Promise<Health>;
}

export type DataSource = "api" | "mock";

export interface Services {
  source: DataSource;
  analysis: AnalysisService;
  reports: ReportRepository;
  models: ModelCatalog;
  samples: SampleCatalog;
  health: HealthService;
}

/** Every adapter throws this, so the UI can show one kind of error. */
export type ErrorKind = "offline" | "invalid" | "not_found" | "conflict" | "unavailable" | "server";

export class ServiceError extends Error {
  constructor(
    public kind: ErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "ServiceError";
  }
}

/** A message for any thrown value. */
export const errorMessage = (e: unknown) =>
  e instanceof ServiceError ? e.message : e instanceof Error ? e.message : "Something went wrong. Please try again.";
