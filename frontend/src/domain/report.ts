import type { Analysis } from "./analysis";
import type { ClassKey, Grid } from "./damage";
import type { ModelId } from "./model";

/** A saved record as the report list shows it. */
export interface ReportSummary {
  id: string;
  number: number;
  createdAt: string; // ISO
  location: string; // place name looked up from the map
  lat: number | null;
  lng: number | null;
  priority: number; // average of the models
  imageUrl: string;
  preview: { model: ModelId; labels: Grid<ClassKey> };
  mainIssue: ClassKey | null;
  corrected: boolean;
}

export interface Report extends ReportSummary {
  analysis: Analysis;
}

export interface NewReport {
  analysisId: string;
  location: string; // from the map's address lookup, never typed
  lat: number;
  lng: number;
}

export type ReportSort = "newest" | "oldest" | "priority";

export interface ReportQuery {
  q: string;
  sort: ReportSort;
  limit: number;
  offset: number;
}

export interface Page<T> {
  items: T[];
  total: number;
  nextOffset: number | null;
}

export const reportCode = (n: number) => `RD-${String(n).padStart(4, "0")}`;
