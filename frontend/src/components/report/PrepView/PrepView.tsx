"use client";

import { motion } from "motion/react";
import { cx } from "@/lib/cx";
import { CROP_KEEP, H, W, cropTop } from "@/domain/frame";
import styles from "./PrepView.module.css";

export type PrepStage = "original" | "crop" | "resize";

interface PrepViewProps {
  /** the photo as taken */
  original: string;
  size: { w: number; h: number };
  /** the same photo after crop + resize (640 × 400) */
  frame: string;
  stage: PrepStage;
  className?: string;
}

const pct = (x: number) => `${x}%`;
const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * Shows how a new photo is prepared before any model sees it (Phase 6.1, same rule as the backend):
 * original → crop off the top 3/8 → stretch the bottom 5/8 to 640 × 400.
 */
export function PrepView({ original, size, frame, stage, className }: PrepViewProps) {
  const { w, h } = size;
  const top = cropTop(h); // pixels dropped from the top
  const keptH = h - top;

  // where the original sits inside the 640 × 400 box (fit, centred), in % of the box
  const box = W / H;
  const a = w / h;
  const dw = Math.min(1, a / box) * 100;
  const dh = Math.min(1, box / a) * 100;
  const dl = (100 - dw) / 2;
  const dt = (100 - dh) / 2;
  const cut = dt + dh * (top / h); // the crop line, % from the top of the box

  const resized = stage === "resize";
  const keptBox = resized
    ? { left: "0%", top: "0%", width: "100%", height: "100%" }
    : { left: pct(dl), top: pct(cut), width: pct(dw), height: pct(dt + dh - cut) };

  const chip =
    stage === "original"
      ? `${w} × ${h} px · as taken`
      : stage === "crop"
        ? `keep bottom ${Math.round(CROP_KEEP * 8)}/8 → ${w} × ${keptH} px`
        : `${w} × ${keptH} → resized to ${W} × ${H} px`;

  return (
    <figure className={cx(styles.view, className)}>
      {/* the photo as taken */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <motion.img
        src={original}
        alt=""
        className={styles.abs}
        style={{ left: pct(dl), top: pct(dt), width: pct(dw), height: pct(dh) }}
        animate={{ opacity: resized ? 0 : 1 }}
        transition={{ duration: 0.5 }}
        draggable={false}
      />

      {/* the part that is dropped */}
      <motion.div
        className={cx(styles.abs, styles.drop)}
        style={{ left: pct(dl), top: pct(dt), width: pct(dw), height: pct(cut - dt) }}
        initial={false}
        animate={{ opacity: stage === "crop" ? 1 : 0 }}
        transition={{ duration: 0.6, delay: stage === "crop" ? 0.5 : 0 }}
      >
        <span>top 3/8 dropped (sky, horizon)</span>
      </motion.div>

      {/* the part that is kept: sits exactly over the original, then grows to fill the frame */}
      {stage !== "original" && (
        // eslint-disable-next-line @next/next/no-img-element
        <motion.img
          src={frame}
          alt=""
          className={cx(styles.abs, styles.kept, resized && styles.filled)}
          initial={false}
          animate={keptBox}
          transition={{ duration: 1.1, delay: resized ? 0.5 : 0, ease: EASE }}
          draggable={false}
        />
      )}

      {/* crop line */}
      <motion.div
        className={styles.line}
        style={{ top: pct(cut), left: pct(dl), width: pct(dw) }}
        initial={false}
        animate={{ opacity: stage === "crop" ? 1 : 0, scaleX: stage === "original" ? 0 : 1 }}
        transition={{ duration: 0.7, ease: EASE }}
      />

      <motion.figcaption key={stage} className={styles.chip} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}>
        {chip}
      </motion.figcaption>
    </figure>
  );
}
