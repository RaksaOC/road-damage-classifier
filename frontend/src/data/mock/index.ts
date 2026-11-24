/* Mock mode: no backend. Uses the fake classifier, keeps reports in this browser's localStorage and
   seeds a history from the sample photos, so the whole app can be clicked through offline.
   It waits a little on every call, so loading states look like they do against the real API. */
import type { Analysis } from "@/domain/analysis";
import { labelsFromBoxes } from "@/domain/correction";
import type { ModelInfo } from "@/domain/model";
import { countCells, mainIssue } from "@/domain/priority";
import type { Report, ReportSummary } from "@/domain/report";
import { staticSamples } from "@/data/shared/samples";
import { thumbnail } from "@/lib/photo";
import { ServiceError, type Services } from "@/services/ports";
import { averagePriority, classifyAll, fromPixels, rng } from "./classifier";

const KEY = "rdc-mock-reports-v1";

function wait(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => (clearTimeout(t), reject(new DOMException("Aborted", "AbortError"))));
  });
}
const latency = (signal?: AbortSignal) => wait(250 + Math.random() * 350, signal);

/* Numbers copied from notebook 13 (backend/models/metrics.json), so the mock shows the same model facts. */
const MODELS: ModelInfo[] = [
  { id: "softmax", title: "Softmax regression", description: "Linear baseline: logistic regression, C = 10", status: "first pass",
    validation: { macroF1: 0.2094, potholeRecall: 0.5085, cleanRoadFlagged: 0.4802 }, test: { macroF1: 0.2164, potholeRecall: 0.4361, cleanRoadFlagged: 0.466 } },
  { id: "svm", title: "SVM (RBF kernel)", description: "RBF kernel, C = 10, gamma = scale", status: "first pass",
    validation: { macroF1: 0.2571, potholeRecall: 0.2591, cleanRoadFlagged: 0.3795 }, test: { macroF1: 0.2528, potholeRecall: 0.2306, cleanRoadFlagged: 0.3659 } },
  { id: "mlp", title: "MLP neural network", description: "Neural network: 2 hidden layers of 256 and 128 units", status: "tuned + Phase 12",
    validation: { macroF1: 0.2234, potholeRecall: 0.6102, cleanRoadFlagged: 0.4643 }, test: { macroF1: 0.224, potholeRecall: 0.5361, cleanRoadFlagged: 0.4499 } },
];

/* Made-up places for the seeded history. */
const PLACES: string[] = [
  "Russian Blvd, near the airport roundabout",
  "Street 271, Tuol Kork",
  "Norodom Blvd at Street 240",
  "Monivong Blvd and Street 2004",
  "Sisowath Quay, river side",
  "Mao Tse Toung Blvd, Boeung Keng Kang",
  "National Road 1, km 6",
  "Street 63 near Psar Thmei",
  "Hun Sen Blvd, Chbar Ampov",
  "Street 2011, Toul Sangke",
  "Kampuchea Krom Blvd at Street 163",
  "Preah Sihanouk Blvd, outside the school",
];

const toSummary = (r: Report): ReportSummary => {
  const { analysis: _, ...s } = r;
  return s;
};

export function createMockServices(): Services {
  const analyses = new Map<string, Analysis>(); // checked but not saved yet

  let cache: Report[] | null = null;
  const save = (list: Report[]) => {
    cache = list;
    for (let keep = list.length; keep > 0; keep--) {
      try {
        localStorage.setItem(KEY, JSON.stringify(list.slice(0, keep))); // drop the oldest if storage is full
        break;
      } catch {}
    }
  };

  async function seed(): Promise<Report[]> {
    const { samples } = await staticSamples.list();
    let days = 0;
    return PLACES.map((location, i) => {
      const s = samples[i % samples.length];
      const results = classifyAll(s.truth, rng(i + 1));
      days += i === 0 ? 1 : 1 + (i % 4);
      const createdAt = new Date(Date.now() - days * 864e5 - i * 37e5).toISOString();
      return {
        id: `seed-${i}`, number: PLACES.length - i, createdAt, location, lat: null, lng: null,
        priority: averagePriority(results), imageUrl: s.frame,
        preview: { model: "mlp", labels: results.mlp.labels }, mainIssue: mainIssue(results.mlp.labels), corrected: false,
        analysis: { id: `seed-a${i}`, createdAt, imageUrl: s.frame, originalSize: s.size, results, priority: averagePriority(results), timings: null, correction: null },
      };
    });
  }

  async function all(): Promise<Report[]> {
    if (cache) return cache;
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return (cache = JSON.parse(raw) as Report[]);
    } catch {}
    const seeded = await seed();
    save(seeded);
    return seeded;
  }

  return {
    source: "mock",
    analysis: {
      async analyze(input, opts) {
        await wait(900 + Math.random() * 600, opts?.signal); // roughly what the real server takes
        const r = rng(Math.floor(Math.random() * 1e9));
        const results = classifyAll(input.truth ?? fromPixels(input.frame, r), r);
        const a: Analysis = {
          id: crypto.randomUUID(), createdAt: new Date().toISOString(), imageUrl: thumbnail(input.frame),
          originalSize: { w: input.frame.width, h: input.frame.height }, results, priority: averagePriority(results), timings: null, correction: null,
        };
        analyses.set(a.id, a);
        return a;
      },
      async correct(id, boxes) {
        await latency();
        const labels = labelsFromBoxes(boxes);
        const c = { boxes, labels, counts: countCells(labels), updatedAt: new Date().toISOString() };
        const a = analyses.get(id);
        const list = await all();
        const saved = list.find((r) => r.analysis.id === id);
        if (!a && !saved) throw new ServiceError("not_found", "That check no longer exists.");
        if (a) a.correction = c;
        if (saved) save(list.map((r) => (r === saved ? { ...r, corrected: true, analysis: { ...r.analysis, correction: c } } : r)));
        return c;
      },
    },
    reports: {
      async list(q, opts) {
        await latency(opts?.signal);
        const t = q.q.trim().toLowerCase();
        const time = (iso: string) => new Date(iso).getTime();
        const code = (n: number) => `rd-${String(n).padStart(4, "0")}`;
        const found = (await all())
          .filter((r) => !t || r.location.toLowerCase().includes(t) || code(r.number).includes(t))
          .sort((a, b) => (q.sort === "priority" ? b.priority - a.priority : q.sort === "oldest" ? time(a.createdAt) - time(b.createdAt) : time(b.createdAt) - time(a.createdAt)));
        const items = found.slice(q.offset, q.offset + q.limit).map(toSummary);
        const next = q.offset + items.length;
        return { items, total: found.length, nextOffset: next < found.length ? next : null };
      },
      async get(id) {
        await latency();
        const r = (await all()).find((x) => x.id === id);
        if (!r) throw new ServiceError("not_found", "No such report.");
        return r;
      },
      async create({ analysisId, location, lat, lng }) {
        await latency();
        const a = analyses.get(analysisId);
        if (!a) throw new ServiceError("not_found", "That check no longer exists. Check the photo again.");
        const list = await all();
        if (list.some((r) => r.analysis.id === analysisId)) throw new ServiceError("conflict", "This check is already saved as a report.");
        const report: Report = {
          id: crypto.randomUUID(), number: Math.max(0, ...list.map((x) => x.number)) + 1, createdAt: new Date().toISOString(),
          location, lat, lng, priority: a.priority, imageUrl: a.imageUrl,
          preview: { model: "mlp", labels: a.results.mlp.labels }, mainIssue: mainIssue(a.results.mlp.labels), corrected: !!a.correction, analysis: a,
        };
        save([report, ...list]);
        return report;
      },
    },
    models: { list: async () => MODELS },
    samples: staticSamples,
    health: { check: async () => ({ ok: true, message: null }) },
  };
}
