"use client";

import Link from "next/link";
import { services } from "@/services";
import { ThemeToggle } from "../ThemeToggle";
import styles from "./SiteHeader.module.css";

/** onBrand: what clicking the name does on the current page (e.g. go back to the empty upload screen). */
export function SiteHeader({ onBrand }: { onBrand?: () => void }) {
  return (
    <header className={styles.header}>
      <Link href="/" className={styles.brand} onClick={onBrand ? (e) => (e.preventDefault(), onBrand()) : undefined}>
        <BrandMark />
        <span>Road Damage Classifier</span>
      </Link>
      <div className={styles.end}>
        {services.source === "mock" && (
          <span className={styles.mock} title="NEXT_PUBLIC_DATA_SOURCE=mock: a stand-in classifier and reports in this browser">
            Mock data
          </span>
        )}
        <ThemeToggle />
      </div>
    </header>
  );
}

/** Same style as the other projects' marks: accent outline with an ink detail. A road in perspective. */
export function BrandMark() {
  return (
    <svg viewBox="0 0 28 28" width="26" height="26" aria-hidden="true">
      <path d="M5.5 25 11.5 3.5M22.5 25 16.5 3.5" fill="none" stroke="var(--accent)" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M14 6v2.6M14 12.2v3.2M14 19.4v3.8" stroke="var(--ink)" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}
