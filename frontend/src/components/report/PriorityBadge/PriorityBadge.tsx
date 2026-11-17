import { cx } from "@/lib/cx";
import { PRIORITY, levelOf } from "@/lib/demo/priority";
import styles from "./PriorityBadge.module.css";

/** Coloured pill with the priority level, optionally with the 0–10 score. */
export function PriorityBadge({ score, showScore, size = "md" }: { score: number; showScore?: boolean; size?: "md" | "lg" }) {
  const level = levelOf(score);
  return (
    <span className={cx(styles.badge, size === "lg" && styles.lg)} data-level={level}>
      <span className={styles.dot} />
      {PRIORITY[level].label}
      {showScore && <span className={styles.score}>{score.toFixed(1)}</span>}
    </span>
  );
}
