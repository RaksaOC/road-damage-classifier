"use client";

import { useEffect, useState } from "react";
import { DamageBreakdown } from "@/components/report/DamageBreakdown";
import { DamageLegend } from "@/components/report/DamageLegend";
import { ModelTabs } from "@/components/report/ModelTabs";
import { Annotator, BoxOverlay } from "@/components/report/Annotator";
import { MapPreview } from "@/components/report/LocationPicker";
import { PriorityCard } from "@/components/report/PriorityCard";
import { RoadView } from "@/components/report/RoadView";
import { Drawer } from "@/components/ui/Drawer";
import ui from "@/components/ui/primitives/primitives.module.css";
import { DEFAULT_MODEL, MODEL_ORDER, type ModelId } from "@/domain/model";
import { reportCode } from "@/domain/report";
import { useAsync } from "@/hooks/useAsync";
import { reportsChanged } from "@/hooks/useReports";
import { cx } from "@/lib/cx";
import { fullDate } from "@/lib/format";
import { osmLink } from "@/lib/maps";
import { services } from "@/services";
import styles from "./ReportDetail.module.css";

/** One report in a side drawer: the photo and what each of the three models found. Loaded by id. */
export function ReportDetail({ id, onClose }: { id: string | null; onClose: () => void }) {
  const [correcting, setCorrecting] = useState(false);
  const [tab, setTab] = useState<ModelId>(DEFAULT_MODEL);
  const loaded = useAsync(() => (id ? services.reports.get(id) : Promise.resolve(null)), [id]);
  const report = loaded.status === "ready" ? loaded.data : null;

  useEffect(() => {
    setCorrecting(false);
    setTab(DEFAULT_MODEL);
  }, [id]);

  const res = report?.analysis.results[tab];

  return (
    <Drawer
      open={!!id}
      onClose={onClose}
      title={
        report ? (
          <>
            <span className={styles.code}>{reportCode(report.number)}</span>
            <h2 className={styles.h}>{report.location}</h2>
          </>
        ) : (
          <h2 className={styles.h}>{loaded.status === "error" ? "Report" : "Loading report…"}</h2>
        )
      }
      footer={
        <button className={cx(ui.btn, ui.ghost)} onClick={onClose}>
          Close
        </button>
      }
    >
      {loaded.status === "loading" && id && (
        <div className={styles.loading} aria-busy="true">
          <span className={styles.skPhoto} />
          <span className={styles.skLine} />
          <span className={styles.skLine} />
        </div>
      )}
      {loaded.status === "error" && (
        <div className={styles.failed} role="alert">
          <p>{loaded.error}</p>
          <button className={cx(ui.btn, ui.ghost)} onClick={loaded.reload}>
            Try again
          </button>
        </div>
      )}
      {report && res && (
        <>
          <ModelTabs
            value={tab}
            onChange={setTab}
            scores={Object.fromEntries(MODEL_ORDER.map((m) => [m, report.analysis.results[m].priority])) as Record<ModelId, number>}
          />
          {correcting ? (
            <Annotator
              src={report.imageUrl}
              analysisId={report.analysis.id}
              initial={report.analysis.correction?.boxes ?? []}
              onSaved={() => (setCorrecting(false), loaded.reload(), reportsChanged())}
              onCancel={() => setCorrecting(false)}
            />
          ) : (
            <>
              <RoadView src={report.imageUrl} cells={res.labels} confidence={res.confidence} interactive />
              <div className={styles.under}>
                <DamageLegend />
                {!report.analysis.correction && (
                  <button className={ui.textBtn} onClick={() => setCorrecting(true)}>
                    Incorrect?
                  </button>
                )}
              </div>
            </>
          )}
          {!correcting && (
            <>
              <PriorityCard score={res.priority} />
              <DamageBreakdown counts={res.counts} />
            </>
          )}
          <section className={styles.facts}>
            <dl>
              <dt>Reported</dt>
              <dd>{fullDate(report.createdAt)}</dd>
              <dt>Average</dt>
              <dd>{report.priority.toFixed(1)} / 10 across 3 models</dd>
            </dl>
            {report.lat !== null && report.lng !== null && (
              <div className={styles.where}>
                <MapPreview at={{ lat: report.lat, lng: report.lng }} />
                <a href={osmLink({ lat: report.lat, lng: report.lng })} target="_blank" rel="noreferrer">
                  Open in OpenStreetMap ↗
                </a>
              </div>
            )}
          </section>
          {report.analysis.correction && !correcting && (
            <section className={styles.corrected} aria-label="Corrected version">
              <div className={styles.correctedHead}>
                <span className={styles.label}>Corrected version</span>
                <button className={ui.textBtn} onClick={() => setCorrecting(true)}>
                  Edit
                </button>
              </div>
              <RoadView src={report.imageUrl}>
                <BoxOverlay boxes={report.analysis.correction.boxes} />
              </RoadView>
              <p className={styles.small}>
                {report.analysis.correction.boxes.length
                  ? `${report.analysis.correction.boxes.length} box${report.analysis.correction.boxes.length === 1 ? "" : "es"}`
                  : "Marked as no damage"}{" "}
                · {fullDate(report.analysis.correction.updatedAt)}
              </p>
            </section>
          )}
        </>
      )}
    </Drawer>
  );
}
