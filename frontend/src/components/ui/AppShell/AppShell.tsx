"use client";

import { MotionConfig } from "motion/react";
import { useState, type ReactNode } from "react";
import { Tour } from "@/components/tour/Tour";
import { SiteFooter } from "../SiteFooter";
import { SiteHeader } from "../SiteHeader";
import styles from "./AppShell.module.css";

const EASE = [0.22, 1, 0.36, 1] as const;

/** Header, page, footer, and the "How it works" tour (opened from the footer). */
export function AppShell({ children, onBrand }: { children: ReactNode; onBrand?: () => void }) {
  const [tour, setTour] = useState(false);
  return (
    <MotionConfig reducedMotion="user" transition={{ duration: 0.4, ease: EASE }}>
      <div className={styles.shell}>
        <SiteHeader onBrand={onBrand} />
        <main className={styles.main}>{children}</main>
        <SiteFooter onTour={() => setTour(true)} />
      </div>
      {tour && <Tour onClose={() => setTour(false)} />}
    </MotionConfig>
  );
}
