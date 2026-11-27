"use client";

import { PriorityBadge } from "@/components/report/PriorityBadge";
import { RoadView } from "@/components/report/RoadView";
import { BY } from "@/domain/damage";
import { reportCode, type ReportSummary } from "@/domain/report";
import { when } from "@/lib/format";
import styles from "./ReportCard.module.css";

export function ReportCard({ report, onOpen }: { report: ReportSummary; onOpen: () => void }) {
  const issue = report.mainIssue;
  return (
    <article className={styles.card}>
      <RoadView src={report.imageUrl} cells={report.preview.labels} grid={false} className={styles.thumb} alt="" />
      <div className={styles.body}>
        <div className={styles.meta}>
          <span className={styles.code}>{reportCode(report.number)}</span>
          <span>{when(report.createdAt)}</span>
          {report.corrected && <span className={styles.tag}>Corrected</span>}
        </div>
        <h3 className={styles.title}>
          <button onClick={onOpen}>{report.location}</button>
        </h3>
        <p className={styles.issue}>
          {issue ? `Worst: ${BY[issue].n.toLowerCase()}` : "No damage found"}
        </p>
        <div className={styles.foot}>
          <PriorityBadge score={report.priority} showScore />
        </div>
      </div>
    </article>
  );
}
