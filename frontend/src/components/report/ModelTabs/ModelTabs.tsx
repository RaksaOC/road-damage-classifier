"use client";

import { motion } from "motion/react";
import { useId } from "react";
import { cx } from "@/lib/cx";
import { MODELS, type ModelId } from "@/lib/demo/models";
import { levelOf } from "@/lib/demo/priority";
import styles from "./ModelTabs.module.css";

/** One tab per model, each with that model's priority score, so the three can be compared. */
export function ModelTabs({ value, onChange, scores }: { value: ModelId; onChange: (m: ModelId) => void; scores: Record<ModelId, number> }) {
  const id = useId();
  return (
    <div className={styles.tabs} role="tablist" aria-label="Model">
      {MODELS.map((m) => {
        const on = m.value === value;
        return (
          <button key={m.value} type="button" role="tab" aria-selected={on} className={cx(styles.tab, on && styles.on)} onClick={() => onChange(m.value)} title={`${m.label}: ${m.description}`}>
            {on && <motion.span layoutId={`model-pill-${id}`} className={styles.pill} transition={{ type: "spring", damping: 30, stiffness: 380 }} />}
            <span className={styles.name}>{m.short}</span>
            <span className={styles.score} data-level={levelOf(scores[m.value])}>
              <i />
              {scores[m.value].toFixed(1)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
