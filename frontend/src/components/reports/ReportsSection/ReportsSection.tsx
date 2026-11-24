"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Select } from "@/components/ui/Select";
import ui from "@/components/ui/primitives/primitives.module.css";
import type { ReportSort } from "@/domain/report";
import { useReports } from "@/hooks/useReports";
import { cx } from "@/lib/cx";
import { ReportCard } from "../ReportCard";
import { ReportDetail } from "../ReportDetail";
import styles from "./ReportsSection.module.css";

const SORTS: { value: ReportSort; label: string }[] = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "priority", label: "Highest priority" },
];
const PAGE = 8;

/** Report history under the upload box. Search, sort and paging happen in the repository (server or mock). */
export function ReportsSection() {
  const [openId, onOpen] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<ReportSort>("newest");
  const { items: shown, total, hasMore: more, status, error, loadMore, retry } = useReports(q, sort);
  const loading = status === "more";
  const sentinel = useRef<HTMLDivElement>(null);

  // infinite scroll: when the sentinel under the grid comes into view, load the next page
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !more || status !== "ready") return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && loadMore(), { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, [more, status, loadMore]);

  const skeletons = (n: number) =>
    Array.from({ length: n }, (_, i) => (
      <motion.div key={`sk${i}`} className={styles.skeleton} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} aria-hidden="true">
        <span />
        <i />
        <i />
      </motion.div>
    ));

  return (
    <section id="reports" className={styles.section} aria-labelledby="reports-title">
      <h2 id="reports-title" className={styles.title}>
        Reports
      </h2>

      <div className={styles.toolbar}>
        <label className={styles.search}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="6.5" />
            <path d="m20 20-4-4" />
          </svg>
          <input className={ui.input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by place or report number" aria-label="Search reports" />
        </label>
        <Select value={sort} options={SORTS} onChange={setSort} label="Sort reports" prefix="Sort" className={styles.sort} />
      </div>

      {status === "loading" && shown.length === 0 ? (
        <div className={styles.grid} aria-busy="true" aria-label="Loading reports">
          {skeletons(4)}
        </div>
      ) : status === "error" && shown.length === 0 ? (
        <div className={styles.empty} role="alert">
          <b>Reports couldn&apos;t be loaded</b>
          <span>{error}</span>
          <button className={cx(ui.btn, ui.ghost)} onClick={retry}>
            Try again
          </button>
        </div>
      ) : shown.length > 0 ? (
        <>
          <div className={cx(styles.grid, status === "loading" && styles.stale)}>
            <AnimatePresence initial={false}>
              {shown.map((r, i) => (
                <motion.div
                  key={r.id}
                  layout
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0, transition: { delay: (i % 8) * 0.04 } }}
                  exit={{ opacity: 0, scale: 0.96 }}
                >
                  <ReportCard report={r} onOpen={() => onOpen(r.id)} />
                </motion.div>
              ))}
              {loading && skeletons(Math.min(4, total - shown.length))}
            </AnimatePresence>
          </div>
          <div ref={sentinel} className={styles.end} aria-live="polite">
            {status === "error" ? (
              <>
                {error}{" "}
                <button className={ui.textBtn} onClick={retry}>
                  Try again
                </button>
              </>
            ) : more ? (
              loading ? "Loading more reports…" : ""
            ) : (
              `That's all ${total} report${total === 1 ? "" : "s"}.`
            )}
          </div>
        </>
      ) : (
        <div className={styles.empty}>
          <b>{q ? "No reports match" : "No reports yet"}</b>
          <span>{q ? "Try another place or report number." : "Check a road above and save it: it will show up here."}</span>
          {q && (
            <button className={cx(ui.btn, ui.ghost)} onClick={() => setQ("")}>
              Clear search
            </button>
          )}
        </div>
      )}

      <ReportDetail id={openId} onClose={() => onOpen(null)} />
    </section>
  );
}
