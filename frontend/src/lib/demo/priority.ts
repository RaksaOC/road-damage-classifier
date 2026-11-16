import { BY, CLASSES, type ClassKey } from "@/lib/roadKit";

export type PriorityLevel = "good" | "low" | "medium" | "high" | "urgent";

export const PRIORITY: Record<PriorityLevel, { label: string; min: number }> = {
  urgent: { label: "Urgent", min: 8 },
  high: { label: "High", min: 6 },
  medium: { label: "Medium", min: 3.5 },
  low: { label: "Low", min: 1.5 },
  good: { label: "Good", min: 0 },
};
export const PRIORITY_ORDER: PriorityLevel[] = ["urgent", "high", "medium", "low", "good"];

export const levelOf = (score: number): PriorityLevel => PRIORITY_ORDER.find((l) => score >= PRIORITY[l].min) ?? "good";

/** Squares of each class, in the order of CLASSES. */
export function countCells(cells: ClassKey[][]) {
  const counts = Object.fromEntries(CLASSES.map((c) => [c.k, 0])) as Record<ClassKey, number>;
  cells.flat().forEach((k) => counts[k]++);
  return counts;
}

/**
 * 0–10 repair priority = 10 × (0.55 × worst + 1.6 × spread), capped at 10.
 *   worst  = weight of the most serious damage found (pothole 1.0, alligator 0.8,
 *            transverse 0.5, longitudinal 0.4, none 0)
 *   spread = sum of all square weights ÷ number of squares (how much of the road is damaged)
 * So one pothole already makes a road at least "medium", and wide damage pushes it higher.
 */
export function priorityScore(cells: ClassKey[][]) {
  const all = cells.flat();
  const worst = Math.max(0, ...all.map((k) => BY[k].w));
  const spread = all.reduce((s, k) => s + BY[k].w, 0) / all.length;
  return Math.min(10, Math.round(10 * (0.55 * worst + 1.6 * spread) * 10) / 10);
}

/** The most serious damage type found, if any. */
export function mainIssue(cells: ClassKey[][]): ClassKey | null {
  const counts = countCells(cells);
  const found = CLASSES.filter((c) => c.k !== "none" && counts[c.k] > 0).sort((a, b) => b.w - a.w);
  return found[0]?.k ?? null;
}
