"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Select } from "@/components/ui/Select";
import ui from "@/components/ui/primitives/primitives.module.css";
import { cx } from "@/lib/cx";
import { reportCode, useReports } from "@/lib/demo/reports";
import { ReportCard } from "../ReportCard";
import { ReportDetail } from "../ReportDetail";
import styles from "./ReportsSection.module.css";

type Sort = "newest" | "oldest" | "priority";

const SORTS: { value: Sort; label: string }[] = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "priority", label: "Highest priority" },
];
const PAGE = 8;

/** Report history under the upload box. More cards load as you reach the end of the list. */
export function ReportsSection() {
  const reports = useReports();
  const [openId, onOpen] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("newest");
  const [limit, setLimit] = useState(PAGE);
  const [loading, setLoading] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    const list = reports.filter(
      (r) => !t || r.location.toLowerCase().includes(t) || reportCode(r.number).toLowerCase().includes(t),
    );
    const time = (iso: string) => new Date(iso).getTime();
    return [...list].sort((a, b) => (sort === "priority" ? b.priority - a.priority : sort === "oldest" ? time(a.createdAt) - time(b.createdAt) : time(b.createdAt) - time(a.createdAt)));
  }, [reports, q, sort]);

  // a new search or sort starts again from the first page
  useEffect(() => setLimit(PAGE), [q, sort]);

  const more = limit < shown.length;

  // infinite scroll: when the sentinel under the grid comes into view, load the next page
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !more || loading) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        setLoading(true);
        // a short pause, as if the next page were coming from a server
        setTimeout(() => {
          setLimit((l) => l + PAGE);
          setLoading(false);
        }, 550);
      },
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [more, loading]);

  const current = reports.find((r) => r.id === openId) ?? null;

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

      {shown.length > 0 ? (
        <>
          <div className={styles.grid}>
            <AnimatePresence initial={false}>
              {shown.slice(0, limit).map((r, i) => (
                <motion.div
                  key={r.id}
                  layout
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0, transition: { delay: (i % PAGE) * 0.04 } }}
                  exit={{ opacity: 0, scale: 0.96 }}
                >
                  <ReportCard report={r} onOpen={() => onOpen(r.id)} />
                </motion.div>
              ))}
              {loading &&
                Array.from({ length: Math.min(4, shown.length - limit) }, (_, i) => (
                  <motion.div key={`sk${i}`} className={styles.skeleton} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} aria-hidden="true">
                    <span />
                    <i />
                    <i />
                  </motion.div>
                ))}
            </AnimatePresence>
          </div>
          <div ref={sentinel} className={styles.end} aria-live="polite">
            {more ? (loading ? "Loading more reports…" : "") : `That's all ${shown.length} report${shown.length === 1 ? "" : "s"}.`}
          </div>
        </>
      ) : (
        <div className={styles.empty}>
          <b>{reports.length ? "No reports match" : "No reports yet"}</b>
          <span>{reports.length ? "Try another place or report number." : "Check a road above and it will show up here."}</span>
          {reports.length > 0 && (
            <button className={cx(ui.btn, ui.ghost)} onClick={() => setQ("")}>
              Clear search
            </button>
          )}
        </div>
      )}

      <ReportDetail report={current} onClose={() => onOpen(null)} />
    </section>
  );
}
