"use client";

import { useEffect, useState } from "react";
import { DamageBreakdown } from "@/components/report/DamageBreakdown";
import { DamageLegend } from "@/components/report/DamageLegend";
import { ModelTabs } from "@/components/report/ModelTabs";
import { PriorityCard } from "@/components/report/PriorityCard";
import { RoadView } from "@/components/report/RoadView";
import { Drawer } from "@/components/ui/Drawer";
import ui from "@/components/ui/primitives/primitives.module.css";
import { cx } from "@/lib/cx";
import { fullDate } from "@/lib/format";
import { MODELS, type ModelId } from "@/lib/demo/models";
import { countCells } from "@/lib/demo/priority";
import { deleteReport, reportCode, type Report } from "@/lib/demo/reports";
import styles from "./ReportDetail.module.css";

/** One report in a side drawer: the photo and what each of the three models found. */
export function ReportDetail({ report, onClose }: { report: Report | null; onClose: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const [tab, setTab] = useState<ModelId>("mlp");
  useEffect(() => {
    setConfirm(false);
    setTab("mlp");
  }, [report?.id]);
  const res = report?.results[tab];

  return (
    <Drawer
      open={!!report}
      onClose={onClose}
      title={
        report && (
          <>
            <span className={styles.code}>{reportCode(report.number)}</span>
            <h2 className={styles.h}>{report.location}</h2>
          </>
        )
      }
      footer={
        report && (
          <>
            <button
              className={cx(ui.textBtn, confirm && styles.danger)}
              onClick={() => {
                if (!confirm) return setConfirm(true);
                deleteReport(report.id);
                onClose();
              }}
            >
              {confirm ? "Click again to delete" : "Delete report"}
            </button>
            <button className={cx(ui.btn, ui.ghost)} onClick={onClose}>
              Close
            </button>
          </>
        )
      }
    >
      {report && res && (
        <>
          <ModelTabs
            value={tab}
            onChange={setTab}
            scores={{ mlp: report.results.mlp.priority, svm: report.results.svm.priority, softmax: report.results.softmax.priority }}
          />
          <RoadView src={report.thumb} cells={res.cells} confidence={res.confidence} interactive />
          <DamageLegend />
          <PriorityCard score={res.priority} />
          <DamageBreakdown counts={countCells(res.cells)} />
          <section className={styles.facts}>
            <dl>
              <dt>Reported</dt>
              <dd>{fullDate(report.createdAt)}</dd>
              <dt>Average</dt>
              <dd>
                {report.priority.toFixed(1)} / 10 across {MODELS.length} models
              </dd>
              {report.notes && (
                <>
                  <dt>Notes</dt>
                  <dd>{report.notes}</dd>
                </>
              )}
            </dl>
          </section>
        </>
      )}
    </Drawer>
  );
}
