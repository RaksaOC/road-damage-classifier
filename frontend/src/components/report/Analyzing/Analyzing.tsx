"use client";

import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import ui from "@/components/ui/primitives/primitives.module.css";
import type { StageTimings } from "@/domain/analysis";
import { cx } from "@/lib/cx";
import styles from "./Analyzing.module.css";

/* What backend/ml/predict.py does with the photo, in order. ms() picks the real time from the server's timings. */
export const ANALYSIS_STEPS: { title: string; ms?: (t: StageTimings) => number }[] = [
  { title: "Cropping off the top 3/8", ms: (t) => t.crop },
  { title: "Resizing to 640 × 400", ms: (t) => t.resize },
  { title: "Cutting the photo into 40 squares", ms: (t) => t.squares },
  { title: "Measuring every square", ms: (t) => t.features },
  { title: "Classifying with all 3 models", ms: (t) => Object.values(t.models).reduce((a, b) => a + (b ?? 0), 0) },
  { title: "Scoring the repair priority" },
];
/** Index of the step that waits for the server's answer. */
export const CLASSIFY_STEP = 4;
/* Minimum time on screen per step, so each one can be read. The server is usually done long before step 4. */
const STEP_MS = [1500, 1500, 800, 1000, 900, 600];

const fmt = (ms: number) => (ms < 10 ? `${ms.toFixed(1)} ms` : `${Math.round(ms)} ms`);

interface AnalyzingProps {
  /** where the request is: the checklist holds at "Classifying" until it is "done" */
  status: "running" | "done" | "error";
  timings: StageTimings | null;
  error: string | null;
  onStep: (i: number, t: number) => void;
  onDone: () => void;
  onRetry: () => void;
  onBack: () => void;
}

/** The "checking the road" checklist. Calls onStep as it moves on, so the photo next to it can follow along. */
export function Analyzing({ status, timings, error, onStep, onDone, onRetry, onBack }: AnalyzingProps) {
  const [step, setStep] = useState(0);
  const [waiting, setWaiting] = useState(false);
  const statusRef = useRef(status);
  statusRef.current = status;
  const failed = status === "error";

  useEffect(() => {
    if (failed) return;
    if (step >= ANALYSIS_STEPS.length) {
      onDone();
      return;
    }
    const start = performance.now();
    let raf = 0;
    const tick = () => {
      const t = Math.min(1, (performance.now() - start) / STEP_MS[step]);
      onStep(step, t);
      const held = step === CLASSIFY_STEP && statusRef.current !== "done";
      setWaiting(t >= 1 && held);
      if (t < 1 || held) raf = requestAnimationFrame(tick);
      else setStep((s) => s + 1);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, failed]);

  const total = STEP_MS.reduce((a, b) => a + b, 0);
  const done = STEP_MS.slice(0, step).reduce((a, b) => a + b, 0);

  return (
    <div className={cx(styles.box, failed && styles.failed)} role="status" aria-live="polite">
      <div className={styles.head}>
        {failed ? <span className={styles.bang} aria-hidden="true">!</span> : <span className={styles.spinner} aria-hidden="true" />}
        <div>
          <b>{failed ? "The check didn't finish" : waiting ? "Waiting for the models…" : "Checking the road"}</b>
        </div>
      </div>
      <div className={styles.progress} aria-hidden="true">
        <motion.span animate={{ width: `${(done / total) * 100}%` }} transition={{ duration: 0.4 }} />
      </div>

      {failed ? (
        <div className={styles.error}>
          <p>{error}</p>
          <div className={styles.errorActions}>
            <button className={cx(ui.btn, ui.primary)} onClick={onRetry}>
              Try again
            </button>
            <button className={cx(ui.btn, ui.ghost)} onClick={onBack}>
              Choose another photo
            </button>
          </div>
        </div>
      ) : (
        <ol className={styles.steps}>
          {ANALYSIS_STEPS.map((s, i) => {
            const ms = i < step && timings && s.ms ? s.ms(timings) : null;
            return (
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
                  <b>
                    {s.title}
                    {ms !== null && <em className={styles.ms}>{fmt(ms)}</em>}
                  </b>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
