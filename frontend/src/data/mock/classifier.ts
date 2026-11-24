/* FAKE classifier for mock mode. No model runs here. It reads simple pixel statistics of each
   80 × 80 square (darkness, edges, edge direction) and turns them into a plausible label. Sample
   photos start from their dataset labels instead, then each "model" makes its own mistakes. */
import type { ModelResult } from "@/domain/analysis";
import type { ClassKey, Grid } from "@/domain/damage";
import { CELL, COLS, ROWS } from "@/domain/frame";
import type { ModelId } from "@/domain/model";
import { countCells, priorityScore } from "@/domain/priority";

export type Rng = () => number;
export function rng(seed: number): Rng {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface CellStats {
  dark: number; // share of pixels much darker than the photo's average
  edge: number; // mean gradient strength
  gx: number; // horizontal change (vertical lines)
  gy: number; // vertical change (horizontal lines)
}

function stats(frame: HTMLCanvasElement): CellStats[][] {
  const g = frame.getContext("2d", { willReadFrequently: true })!;
  const { data, width } = g.getImageData(0, 0, frame.width, frame.height);
  const lum = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  };
  let sum = 0, n = 0;
  for (let y = 0; y < frame.height; y += 4) for (let x = 0; x < width; x += 4) (sum += lum(x, y)), n++;
  const mean = sum / n;

  return Array.from({ length: ROWS }, (_, r) =>
    Array.from({ length: COLS }, (_, c) => {
      let dark = 0, gx = 0, gy = 0, k = 0;
      for (let y = r * CELL + 2; y < (r + 1) * CELL - 2; y += 3)
        for (let x = c * CELL + 2; x < (c + 1) * CELL - 2; x += 3) {
          if (lum(x, y) < mean * 0.62) dark++;
          gx += Math.abs(lum(x + 2, y) - lum(x - 2, y));
          gy += Math.abs(lum(x, y + 2) - lum(x, y - 2));
          k++;
        }
      return { dark: dark / k, edge: (gx + gy) / k, gx: gx / k, gy: gy / k };
    }),
  );
}

/** A plausible guess from pixels, for uploaded photos. */
export function fromPixels(frame: HTMLCanvasElement, r: Rng): Grid<ClassKey> {
  const s = stats(frame);
  const edges = s.flat().map((x) => x.edge).sort((a, b) => a - b);
  const q = (p: number) => edges[Math.floor(p * (edges.length - 1))];
  const busy = q(0.72), veryBusy = q(0.9);
  return s.map((row) =>
    row.map((x): ClassKey => {
      if (x.dark > 0.32 && x.edge > q(0.4)) return "D40";
      if (x.edge >= veryBusy && r() < 0.8) return "D20";
      if (x.edge >= busy) return x.gx > x.gy * 1.15 ? "D00" : x.gy > x.gx * 1.15 ? "D10" : r() < 0.5 ? "D00" : "D10";
      return "none";
    }),
  );
}

/** Each "model" gets some squares wrong, the weaker ones more often. */
const ERROR_RATE: Record<ModelId, number> = { mlp: 0.03, svm: 0.06, softmax: 0.11 };
const CONFIDENCE: Record<ModelId, number> = { mlp: 0.74, svm: 0.7, softmax: 0.62 };
const OTHERS: ClassKey[] = ["D00", "D10", "D20", "none"];

export function asModel(base: Grid<ClassKey>, model: ModelId, r: Rng): ModelResult {
  const labels = base.map((row) => row.map((k) => (r() < ERROR_RATE[model] ? OTHERS[Math.floor(r() * OTHERS.length)] : k)));
  const confidence = labels.map((row) => row.map((k) => Math.min(0.99, CONFIDENCE[model] + r() * 0.25 + (k === "none" ? 0.05 : 0))));
  return { model, labels, confidence, probs: null, counts: countCells(labels), priority: priorityScore(labels), predictMs: null };
}

export function classifyAll(base: Grid<ClassKey>, r: Rng): Record<ModelId, ModelResult> {
  return { mlp: asModel(base, "mlp", r), svm: asModel(base, "svm", r), softmax: asModel(base, "softmax", r) };
}

export const averagePriority = (res: Record<ModelId, ModelResult>) =>
  Math.round(((res.mlp.priority + res.svm.priority + res.softmax.priority) / 3) * 10) / 10;
