/* The 5 classes every model answers with, and how serious each is. Same order as backend/ml/config.py CLASSES. */
export type ClassKey = "D00" | "D10" | "D20" | "D40" | "none";
export type ClassInfo = { k: ClassKey; n: string; w: number; v: string };

/** n: name, w: weight in the repair priority (backend: app/domain.py WEIGHT), v: colour token */
export const CLASSES: ClassInfo[] = [
  { k: "D00", n: "Longitudinal crack", w: 0.4, v: "--c-d00" },
  { k: "D10", n: "Transverse crack", w: 0.5, v: "--c-d10" },
  { k: "D20", n: "Alligator crack", w: 0.8, v: "--c-d20" },
  { k: "D40", n: "Pothole", w: 1.0, v: "--c-d40" },
  { k: "none", n: "No damage", w: 0, v: "--c-none" },
];
export const CLASS_KEYS = CLASSES.map((c) => c.k);
export const BY = Object.fromEntries(CLASSES.map((c) => [c.k, c])) as Record<ClassKey, ClassInfo>;
export const RANK: Record<ClassKey, number> = { none: 0, D00: 1, D10: 2, D20: 3, D40: 4 };

/** 5 rows × 8 columns, row 0 = far away, col 0 = left (same as patches_split.csv). */
export type Grid<T> = T[][];
