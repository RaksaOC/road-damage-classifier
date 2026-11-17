"use client";

import { useState } from "react";
import { cx } from "@/lib/cx";
import { BY, COLS, ROWS, type ClassKey } from "@/lib/roadKit";
import styles from "./RoadView.module.css";

interface RoadViewProps {
  src: string;
  alt?: string;
  cells?: ClassKey[][];
  confidence?: number[][];
  /** How many squares (row by row) already show their colour. Defaults to all. */
  revealed?: number;
  grid?: boolean;
  mono?: boolean;
  scanning?: boolean;
  /** Hover or tap a square to see what the model said about it. */
  interactive?: boolean;
  className?: string;
}

const squareName = (r: number, c: number) => `${"ABCDEFGH"[c]}${r + 1}`;

/** The road photo with the 8 × 5 grid on top, each square tinted by the damage found in it. */
export function RoadView({ src, alt = "Road photo", cells, confidence, revealed = COLS * ROWS, grid = !!cells, mono, scanning, interactive, className }: RoadViewProps) {
  const [hover, setHover] = useState<number | null>(null);
  const picked = hover !== null && cells ? { r: Math.floor(hover / COLS), c: hover % COLS } : null;
  const pickedKey = picked && cells ? cells[picked.r][picked.c] : null;

  return (
    <figure className={cx(styles.view, className)} onMouseLeave={() => setHover(null)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className={cx(styles.photo, mono && styles.mono)} draggable={false} />
      {(grid || cells) && (
        <div className={cx(styles.grid, grid && styles.lines)} aria-hidden={!interactive}>
          {Array.from({ length: ROWS * COLS }, (_, i) => {
            const k = cells?.[Math.floor(i / COLS)][i % COLS];
            const show = !!k && k !== "none" && i < revealed;
            const style = show ? ({ "--c": `var(${BY[k].v})` } as React.CSSProperties) : undefined;
            return (
              <div
                key={i}
                className={cx(styles.cell, show && styles.hit, interactive && styles.live, hover === i && styles.on)}
                style={style}
                onMouseEnter={interactive ? () => setHover(i) : undefined}
                onClick={interactive ? () => setHover(i) : undefined}
              />
            );
          })}
        </div>
      )}
      {scanning && <div className={styles.scan} aria-hidden="true" />}
      {picked && pickedKey && (
        <figcaption className={styles.tip}>
          <b>{squareName(picked.r, picked.c)}</b>
          <span className={styles.sw} style={{ background: `var(${BY[pickedKey].v})` }} />
          {BY[pickedKey].n}
          {confidence && <span className={styles.conf}>{Math.round(confidence[picked.r][picked.c] * 100)}% sure</span>}
        </figcaption>
      )}
    </figure>
  );
}
