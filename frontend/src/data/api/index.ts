/* The real backend: FastAPI (backend/app/api.py) + Postgres, reached through Next's /api rewrite.
   The DTO types mirror backend/app/domain.py; the mappers turn them into the frontend's domain types. */
import type { Analysis, ModelResult, StageTimings } from "@/domain/analysis";
import type { Box, Correction } from "@/domain/correction";
import type { ClassKey, Grid } from "@/domain/damage";
import type { Metrics, ModelId, ModelInfo } from "@/domain/model";
import type { Page, Report, ReportSummary } from "@/domain/report";
import { staticSamples } from "@/data/shared/samples";
import type { Services } from "@/services/ports";
import { http } from "./http";

// ---- what the API sends ---------------------------------------------------------------------
interface MetricsDto { macro_f1: number; pothole_recall: number; clean_road_flagged: number }
interface ModelInfoDto { id: ModelId; title: string; description: string; status: string; validation: MetricsDto; test: MetricsDto | null }
interface ModelResultDto {
  model: ModelId; labels: Grid<ClassKey>; confidence: Grid<number>; probs: Grid<number[]>;
  counts: Record<ClassKey, number>; priority: number; predict_ms: number;
}
interface AnalysisDto {
  id: string; created_at: string; filename: string; source: string; original_size: { w: number; h: number };
  image_url: string; results: Record<ModelId, ModelResultDto>; priority: number; timings_ms: Record<string, number>;
  correction: CorrectionDto | null;
}
interface CorrectionDto { boxes: Box[]; labels: Grid<ClassKey>; counts: Record<ClassKey, number>; updated_at: string }
interface ReportSummaryDto {
  id: string; number: number; created_at: string; location: string; lat: number | null; lng: number | null; priority: number;
  image_url: string; preview_model: ModelId; preview_labels: Grid<ClassKey>; main_issue: ClassKey | null; corrected: boolean;
}
interface ReportDto extends ReportSummaryDto { analysis: AnalysisDto }
interface PageDto { items: ReportSummaryDto[]; total: number; next_offset: number | null }
interface HealthDto { model_loaded: boolean; database: boolean; error: string | null }

// ---- mappers --------------------------------------------------------------------------------
const metrics = (m: MetricsDto): Metrics => ({ macroF1: m.macro_f1, potholeRecall: m.pothole_recall, cleanRoadFlagged: m.clean_road_flagged });

const modelResult = (r: ModelResultDto): ModelResult => ({
  model: r.model, labels: r.labels, confidence: r.confidence, probs: r.probs, counts: r.counts, priority: r.priority, predictMs: r.predict_ms,
});

function timings(t: Record<string, number>): StageTimings {
  const models: StageTimings["models"] = {};
  for (const [k, v] of Object.entries(t)) if (k.startsWith("model_")) models[k.slice(6) as ModelId] = v;
  return { crop: t.crop, resize: t.resize, squares: t.squares, features: t.features, models };
}

const correction = (c: CorrectionDto): Correction => ({ boxes: c.boxes, labels: c.labels, counts: c.counts, updatedAt: c.updated_at });

const analysis = (a: AnalysisDto): Analysis => ({
  id: a.id,
  createdAt: a.created_at,
  imageUrl: a.image_url,
  originalSize: a.original_size,
  results: Object.fromEntries(Object.entries(a.results).map(([k, v]) => [k, modelResult(v)])) as Record<ModelId, ModelResult>,
  priority: a.priority,
  timings: timings(a.timings_ms),
  correction: a.correction && correction(a.correction),
});

const summary = (r: ReportSummaryDto): ReportSummary => ({
  id: r.id, number: r.number, createdAt: r.created_at, location: r.location, lat: r.lat, lng: r.lng, priority: r.priority,
  imageUrl: r.image_url, preview: { model: r.preview_model, labels: r.preview_labels }, mainIssue: r.main_issue, corrected: r.corrected,
});

const report = (r: ReportDto): Report => ({ ...summary(r), analysis: analysis(r.analysis) });

const json = (body: unknown): RequestInit => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

// ---- the adapter ----------------------------------------------------------------------------
export function createApiServices(): Services {
  return {
    source: "api",
    analysis: {
      async analyze(input, opts) {
        const form = new FormData();
        form.append("photo", input.file, input.filename);
        form.append("source", input.source);
        return analysis(await http<AnalysisDto>("/api/analyze", { method: "POST", body: form, signal: opts?.signal }));
      },
      async correct(id, boxes) {
        const round = (b: Box): Box => ({ cls: b.cls, xmin: Math.round(b.xmin), ymin: Math.round(b.ymin), xmax: Math.round(b.xmax), ymax: Math.round(b.ymax) });
        return correction(await http<CorrectionDto>(`/api/analyses/${id}/correction`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ boxes: boxes.map(round) }) }));
      },
    },
    reports: {
      async list(q, opts) {
        const params = new URLSearchParams({ q: q.q, sort: q.sort, limit: String(q.limit), offset: String(q.offset) });
        const page = await http<PageDto>(`/api/reports?${params}`, { signal: opts?.signal });
        return { items: page.items.map(summary), total: page.total, nextOffset: page.next_offset } satisfies Page<ReportSummary>;
      },
      get: async (id) => report(await http<ReportDto>(`/api/reports/${id}`)),
      create: async (r) => report(await http<ReportDto>("/api/reports", json({ analysis_id: r.analysisId, location: r.location, lat: r.lat, lng: r.lng }))),
    },
    models: {
      list: async () => (await http<ModelInfoDto[]>("/api/models")).map((m) => ({ ...m, validation: metrics(m.validation), test: m.test && metrics(m.test) }) satisfies ModelInfo),
    },
    samples: staticSamples,
    health: {
      async check() {
        try {
          const h = await http<HealthDto>("/api/health");
          if (!h.model_loaded) return { ok: false, message: h.error ?? "The models aren't loaded on the server." };
          if (!h.database) return { ok: false, message: "The server can't reach its database (Postgres), so reports can't be saved." };
          return { ok: true, message: null };
        } catch {
          return { ok: false, message: "Can't reach the analysis server. Start the backend (port 8600) and try again." };
        }
      },
    },
  };
}
