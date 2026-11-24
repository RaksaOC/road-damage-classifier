import type { Correction } from "./correction";
import type { ClassKey, Grid } from "./damage";
import type { ModelId } from "./model";

/** One model's verdict on the 40 squares. */
export interface ModelResult {
  model: ModelId;
  labels: Grid<ClassKey>;
  confidence: Grid<number>; // probability of the chosen class, 0–1
  probs: Grid<number[]> | null; // 5 probabilities per square in CLASSES order (null in mock mode)
  counts: Record<ClassKey, number>;
  priority: number; // 0–10
  predictMs: number | null;
}

/** Real time each step took on the server, in ms. */
export interface StageTimings {
  crop: number;
  resize: number;
  squares: number;
  features: number;
  models: Partial<Record<ModelId, number>>;
}

/** One photo checked by every model. Saving it turns it into a report. */
export interface Analysis {
  id: string;
  createdAt: string; // ISO
  imageUrl: string; // the 640 × 400 frame the models saw
  originalSize: { w: number; h: number };
  results: Record<ModelId, ModelResult>;
  priority: number; // average of the models
  timings: StageTimings | null; // null when nothing really ran (mock mode)
  correction: Correction | null; // what a user says is really there
}

/** What the app hands to an AnalysisService. */
export interface PhotoInput {
  file: Blob; // the photo as taken; the server does its own crop + resize
  filename: string;
  source: "upload" | `sample:${string}`;
  frame: HTMLCanvasElement; // the browser's 640 × 400 copy (the mock reads pixels from it)
  truth: Grid<ClassKey> | null; // dataset labels, for sample photos
}
