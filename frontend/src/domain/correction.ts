/* A user's correction: the damage they drew on the 640 × 400 frame (Pascal VOC boxes, like the RDD2022 labels).
   Stored as training data. The 40 square labels follow the training rule (backend: app/domain.py labels_from_boxes,
   tested against notebook 06): a box labels a square when it covers ≥ 10% of it; the most serious class wins. */
import type { ClassKey, Grid } from "./damage";
import { CELL, COLS, ROWS } from "./frame";

export type DamageKey = Exclude<ClassKey, "none">;

export interface Box {
  cls: DamageKey;
  xmin: number;
  ymin: number;
  xmax: number;
  ymax: number;
}

export interface Correction {
  boxes: Box[];
  labels: Grid<ClassKey>;
  counts: Record<ClassKey, number>;
  updatedAt: string; // ISO
}

const LABEL_ORDER: DamageKey[] = ["D00", "D10", "D20", "D40"]; // least → most serious
export const MIN_COVER = 0.1; // backend/ml/config.py LABEL_MIN_OVERLAP

export function labelsFromBoxes(boxes: Box[]): Grid<ClassKey> {
  const labels: Grid<ClassKey> = Array.from({ length: ROWS }, () => Array<ClassKey>(COLS).fill("none"));
  for (const cls of LABEL_ORDER)
    for (const b of boxes.filter((x) => x.cls === cls))
      for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++) {
          const ow = Math.max(0, Math.min(b.xmax, (c + 1) * CELL) - Math.max(b.xmin, c * CELL));
          const oh = Math.max(0, Math.min(b.ymax, (r + 1) * CELL) - Math.max(b.ymin, r * CELL));
          if ((ow * oh) / (CELL * CELL) >= MIN_COVER) labels[r][c] = cls;
        }
  return labels;
}
