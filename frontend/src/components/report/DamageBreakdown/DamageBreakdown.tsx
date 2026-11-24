"use client";

import { motion } from "motion/react";
import { CLASSES, type ClassKey } from "@/domain/damage";
import styles from "./DamageBreakdown.module.css";

/** Squares per damage type, as bars out of all 40 squares. */
export function DamageBreakdown({ counts }: { counts: Record<ClassKey, number> }) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const damaged = total - counts.none;
  return (
    <section className={styles.box} aria-label="Damage found">
      <div className={styles.head}>
        <span className={styles.label}>Damage found</span>
        <span className={styles.sum}>
          {damaged} of {total} squares
        </span>
      </div>
      <ul className={styles.rows}>
        {CLASSES.filter((c) => c.k !== "none").map((c, i) => (
          <li key={c.k} className={counts[c.k] ? undefined : styles.zero}>
            <span className={styles.name}>
              <span className={styles.sw} style={{ background: `var(${c.v})` }} />
              {c.n}
            </span>
            <span className={styles.bar}>
              <motion.span
                style={{ background: `var(${c.v})` }}
                initial={{ width: 0 }}
                animate={{ width: `${(counts[c.k] / total) * 100}%` }}
                transition={{ duration: 0.7, delay: 0.1 + i * 0.06 }}
              />
            </span>
            <span className={styles.n}>{counts[c.k]}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
