"use client";

import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { cx } from "@/lib/cx";
import styles from "./Analyzing.module.css";

export const ANALYSIS_STEPS = [
  { title: "Cropping off the top 3/8", detail: "sky and horizon go, the bottom 5/8 with the road stays" },
  { title: "Resizing to 640 × 400", detail: "the same size every training photo was" },
  { title: "Cutting the photo into 40 squares", detail: "8 across, 5 down, 80 × 80 pixels each" },
  { title: "Preparing each square", detail: "grayscale, shrunk to 32 × 32 = 1,024 numbers" },
  { title: "Measuring features", detail: "PCA plus brightness, contrast, edges, dark area, edge direction" },
  { title: "Classifying every square", detail: "with all 3 models: neural network, SVM and softmax regression" },
  { title: "Scoring the repair priority", detail: "damage weights added up to a 0–10 score" },
];
const STEP_MS = [2000, 2000, 1000, 1000, 1000, 1700, 900];

/**
 * The fake "model is running" checklist. Calls onStep as it moves on, so the photo next to it
 * can follow along, and onDone at the end.
 */
export function Analyzing({ onStep, onDone }: { onStep: (i: number, t: number) => void; onDone: () => void }) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (step >= ANALYSIS_STEPS.length) {
      onDone();
      return;
    }
    const start = performance.now();
    let raf = 0;
    const tick = () => {
      const t = Math.min(1, (performance.now() - start) / STEP_MS[step]);
      onStep(step, t);
      if (t < 1) raf = requestAnimationFrame(tick);
      else setStep((s) => s + 1);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const total = STEP_MS.reduce((a, b) => a + b, 0);
  const done = STEP_MS.slice(0, step).reduce((a, b) => a + b, 0);

  return (
    <div className={styles.box} role="status" aria-live="polite">
      <div className={styles.head}>
        <span className={styles.spinner} aria-hidden="true" />
        <div>
          <b>Checking the road</b>
          <span>3 models</span>
        </div>
      </div>
      <div className={styles.progress} aria-hidden="true">
        <motion.span animate={{ width: `${(done / total) * 100}%` }} transition={{ duration: 0.4 }} />
      </div>
      <ol className={styles.steps}>
        {ANALYSIS_STEPS.map((s, i) => (
          <li key={s.title} className={cx(i < step && styles.done, i === step && styles.now)}>
            <span className={styles.mark} aria-hidden="true">
              {i < step ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                  <path d="m5 12.5 4.5 4.5L19 7.5" />
                </svg>
              ) : (
                i + 1
              )}
            </span>
            <div>
              <b>{s.title}</b>
              <span>{s.detail}</span>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
