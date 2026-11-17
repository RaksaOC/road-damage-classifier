"use client";

import { PriorityBadge } from "@/components/report/PriorityBadge";
import { RoadView } from "@/components/report/RoadView";
import { when } from "@/lib/format";
import { mainIssue } from "@/lib/demo/priority";
import { reportCode, type Report } from "@/lib/demo/reports";
import { BY } from "@/lib/roadKit";
import styles from "./ReportCard.module.css";

export function ReportCard({ report, onOpen }: { report: Report; onOpen: () => void }) {
  const issue = mainIssue(report.results.mlp.cells);
  return (
    <article className={styles.card}>
      <RoadView src={report.thumb} cells={report.results.mlp.cells} grid={false} className={styles.thumb} alt="" />
      <div className={styles.body}>
        <div className={styles.meta}>
          <span className={styles.code}>{reportCode(report.number)}</span>
          <span>{when(report.createdAt)}</span>
        </div>
        <h3 className={styles.title}>
          <button onClick={onOpen}>{report.location}</button>
        </h3>
        <p className={styles.issue}>{issue ? `Mostly ${BY[issue].n.toLowerCase()}` : "No damage found"}</p>
        <div className={styles.foot}>
          <PriorityBadge score={report.priority} showScore />
          <span className={styles.model}>average of 3 models</span>
        </div>
      </div>
    </article>
  );
}
