/* FAKE classifier for the demo. No model runs here. It looks at simple pixel statistics of each
   80 × 80 square (darkness, contrast, edge direction) and turns them into a plausible label,
   so real photos get a believable overlay. Sample photos use their known labels with a little
   noise, standing in for a model that is right most of the time. */
import { COLS, ROWS, CELL, labelCells, rng, SCENES, type ClassKey } from "@/lib/roadKit";
import type { ModelId } from "./models";
import { countCells, priorityScore } from "./priority";
import type { SampleKey } from "./images";

export interface Analysis {
  cells: ClassKey[][];
  confidence: number[][]; // 0–1 per square
  counts: Record<ClassKey, number>;
  priority: number;
  model: ModelId;
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
          const v = lum(x, y);
          if (v < mean * 0.62) dark++;
          gx += Math.abs(lum(x + 2, y) - lum(x - 2, y));
          gy += Math.abs(lum(x, y + 2) - lum(x, y - 2));
          k++;
        }
      return { dark: dark / k, edge: (gx + gy) / k, gx: gx / k, gy: gy / k };
    }),
  );
}

function fromPixels(frame: HTMLCanvasElement, r: () => number): ClassKey[][] {
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

/** What a perfect model would say: the known labels for sample roads, pixel guesses for uploads. */
function baseLabels(frame: HTMLCanvasElement, sample: SampleKey | null, r: () => number): ClassKey[][] {
  if (!sample) return fromPixels(frame, r);
  const S = SCENES[sample];
  return labelCells(S.build(rng(S.seed)));
}

/** Each model gets some squares wrong, the weaker ones more often. */
const ERROR_RATE: Record<ModelId, number> = { mlp: 0.03, svm: 0.06, softmax: 0.11 };
const CONFIDENCE: Record<ModelId, number> = { mlp: 0.74, svm: 0.7, softmax: 0.62 };
const OTHERS: ClassKey[] = ["D00", "D10", "D20", "none"];

function asModel(base: ClassKey[][], model: ModelId, r: () => number): Analysis {
  const cells = base.map((row) => row.map((k) => (r() < ERROR_RATE[model] ? OTHERS[Math.floor(r() * OTHERS.length)] : k)));
  const confidence = cells.map((row) => row.map((k) => Math.min(0.99, CONFIDENCE[model] + r() * 0.25 + (k === "none" ? 0.05 : 0))));
  return { cells, confidence, counts: countCells(cells), priority: priorityScore(cells), model };
}

export type Results = Record<ModelId, Analysis>;

/** Runs all three models on the photo (fake: one shared guess, then model-specific mistakes). */
export function classifyAll(frame: HTMLCanvasElement, sample: SampleKey | null): Results {
  const r = rng(Math.floor(Math.random() * 1e9));
  const base = baseLabels(frame, sample, r);
  return { mlp: asModel(base, "mlp", r), svm: asModel(base, "svm", r), softmax: asModel(base, "softmax", r) };
}

/** The three priorities averaged: the single number shown on a report card. */
export const averagePriority = (res: Results) => Math.round(((res.mlp.priority + res.svm.priority + res.softmax.priority) / 3) * 10) / 10;
