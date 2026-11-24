"use client";

import { motion } from "motion/react";
import { levelOf } from "@/domain/priority";
import { PriorityBadge } from "../PriorityBadge";
import styles from "./PriorityCard.module.css";

/** Big 0–10 score with a meter. */
export function PriorityCard({ score }: { score: number }) {
  const level = levelOf(score);
  return (
    <section className={styles.card} data-level={level} aria-label="Repair priority">
      <div className={styles.top}>
        <div>
          <span className={styles.label}>Repair priority</span>
          <p className={styles.score}>
            {score.toFixed(1)}
            <small>/ 10</small>
          </p>
        </div>
        <PriorityBadge score={score} size="lg" />
      </div>
      <div className={styles.meter} aria-hidden="true">
        <motion.span initial={{ width: 0 }} animate={{ width: `${score * 10}%` }} transition={{ duration: 0.9, delay: 0.15 }} />
      </div>
    </section>
  );
}
