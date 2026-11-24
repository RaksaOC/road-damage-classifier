/* The three frozen models (notebook 13). Every photo is checked by all three. */
export type ModelId = "mlp" | "svm" | "softmax";

/** Tab order in the app. The first one is the default view (and the report card preview). */
export const MODEL_ORDER: ModelId[] = ["mlp", "svm", "softmax"];
export const DEFAULT_MODEL: ModelId = "mlp";
export const SHORT_NAME: Record<ModelId, string> = { mlp: "Neural network", svm: "SVM", softmax: "Softmax" };

/** Scores on a whole data split, 0–1. */
export interface Metrics {
  macroF1: number;
  potholeRecall: number; // share of real potholes found
  cleanRoadFlagged: number; // share of clean squares wrongly called damage
}

export interface ModelInfo {
  id: ModelId;
  title: string;
  description: string;
  status: string; // "first pass", "tuned + Phase 12"
  validation: Metrics;
  test: Metrics | null; // null until the final test (Phase 13) has run
}
