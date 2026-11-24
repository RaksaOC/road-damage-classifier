"use client";

import { motion } from "motion/react";
import { useId } from "react";
import { cx } from "@/lib/cx";
import { MODEL_ORDER, SHORT_NAME, type ModelId } from "@/domain/model";
import { levelOf } from "@/domain/priority";
import styles from "./ModelTabs.module.css";

/** One tab per model, each with that model's priority score, so the three can be compared. */
export function ModelTabs({ value, onChange, scores }: { value: ModelId; onChange: (m: ModelId) => void; scores: Record<ModelId, number> }) {
  const id = useId();
  return (
    <div className={styles.tabs} role="tablist" aria-label="Model">
      {MODEL_ORDER.map((m) => {
        const on = m === value;
        return (
          <button key={m} type="button" role="tab" aria-selected={on} className={cx(styles.tab, on && styles.on)} onClick={() => onChange(m)}>
            {on && <motion.span layoutId={`model-pill-${id}`} className={styles.pill} transition={{ type: "spring", damping: 30, stiffness: 380 }} />}
            <span className={styles.name}>{SHORT_NAME[m]}</span>
            <span className={styles.score} data-level={levelOf(scores[m])}>
              <i />
              {scores[m].toFixed(1)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
