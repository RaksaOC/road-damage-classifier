"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import ui from "@/components/ui/primitives/primitives.module.css";
import type { Analysis } from "@/domain/analysis";
import { SQUARES } from "@/domain/frame";
import { DEFAULT_MODEL, type ModelId } from "@/domain/model";
import { reportsChanged } from "@/hooks/useReports";
import { cx } from "@/lib/cx";
import { errorMessage, services } from "@/services";
import { Analyzing, CLASSIFY_STEP } from "../Analyzing";
import { Annotator } from "../Annotator";
import { LocationPicker, type Place } from "../LocationPicker";
import { DamageBreakdown } from "../DamageBreakdown";
import { DamageLegend } from "../DamageLegend";
import { ModelTabs } from "../ModelTabs";
import { PhotoPicker, type PickedPhoto } from "../PhotoPicker";
import { PrepView } from "../PrepView";
import { PriorityCard } from "../PriorityCard";
import { RoadView } from "../RoadView";
import styles from "./NewReport.module.css";

type Phase = "pick" | "details" | "checking" | "done";

type Request = { status: "running" | "done" | "error"; error: string | null };
type Save = { status: "idle" | "saving" | "saved" | "error"; error: string | null };

/** Photo → details → all three models (services.analysis) → result. Only "Save record" makes it a report. */
export function NewReport({ onBusy }: { onBusy?: (busy: boolean) => void }) {
  const [phase, setPhase] = useState<Phase>("pick");
  const [photo, setPhoto] = useState<PickedPhoto | null>(null);
  const [place, setPlace] = useState<Place | null>(null); // from the map only
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [req, setReq] = useState<Request>({ status: "running", error: null });
  const [saving, setSaving] = useState<Save>({ status: "idle", error: null });
  const [tab, setTab] = useState<ModelId>(DEFAULT_MODEL);
  const [view, setView] = useState({ step: -1, t: 0 });
  const [run, setRun] = useState(0); // remounts the checklist on "Try again"
  const [correcting, setCorrecting] = useState(false);
  const side = useRef<HTMLDivElement>(null);
  const inflight = useRef<AbortController | null>(null);

  useEffect(() => () => inflight.current?.abort(), []);

  // while details are filled in and the photo is checked, the page shows only that: no report list, no scrolling
  const focused = phase === "details" || phase === "checking";
  const hideReports = focused || correcting; // the correction tool also gets the page to itself
  useEffect(() => onBusy?.(hideReports), [hideReports, onBusy]);

  const pick = (p: PickedPhoto) => {
    setPhoto(p);
    setPhase("details");
    window.scrollTo({ top: 0 });
  };

  const start = async () => {
    if (!photo) return;
    inflight.current?.abort();
    const ctl = (inflight.current = new AbortController());
    setAnalysis(null);
    setReq({ status: "running", error: null });
    setSaving({ status: "idle", error: null });
    setTab(DEFAULT_MODEL);
    setCorrecting(false);
    setView({ step: 0, t: 0 });
    setRun((n) => n + 1);
    setPhase("checking");
    window.scrollTo({ top: 0, behavior: "smooth" });
    try {
      const a = await services.analysis.analyze(photo, { signal: ctl.signal });
      setAnalysis(a);
      setReq({ status: "done", error: null });
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setReq({ status: "error", error: errorMessage(e) });
    }
  };

  const finish = () => {
    setPhase("done");
    // on phones the result sits under the photo, so bring it into view
    if (window.innerWidth < 860) setTimeout(() => side.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
  };

  const save = async () => {
    if (!analysis || saving.status === "saving" || saving.status === "saved") return;
    setSaving({ status: "saving", error: null });
    try {
      if (!place) throw new Error("The location isn't known yet.");
      await services.reports.create({ analysisId: analysis.id, location: place.name, lat: place.lat, lng: place.lng });
      setSaving({ status: "saved", error: null });
      reportsChanged();
    } catch (e) {
      setSaving({ status: "error", error: errorMessage(e) });
    }
  };

  const restart = () => {
    inflight.current?.abort();
    setPhoto(null);
    setAnalysis(null);
    setSaving({ status: "idle", error: null });
    setPlace(null);
    setPhase("pick");
    window.scrollTo({ top: 0 });
  };

  // what the photo shows while the checklist runs
  const all = SQUARES;
  // during the check the photo fills in with the default model's answer, then follows the chosen tab
  const shown = analysis ? analysis.results[phase === "done" ? tab : DEFAULT_MODEL] : null;
  // checklist steps: 0 crop, 1 resize, 2 squares, 3 features, 4 classify, 5 priority
  const prepping = phase === "details" || (phase === "checking" && view.step <= 1 && req.status !== "error");
  const revealed = phase === "done" ? all : view.step > CLASSIFY_STEP ? all : view.step === CLASSIFY_STEP ? Math.floor(view.t * all) : 0;

  return (
    <div className={styles.page}>
      <AnimatePresence mode="wait" initial={false}>
        {phase === "pick" && (
          <motion.section key="pick" className={styles.pick} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
            <div className={styles.center}>
              <header className={styles.intro}>
                <h1>Check a road</h1>
                <p>Add a photo. Every square is checked for cracks and potholes, and the road gets a repair priority from 0 to 10.</p>
              </header>
              <PhotoPicker onPick={pick} />
            </div>
            <a className={styles.down} href="#reports">
              Past reports
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M12 5v14m-6-6 6 6 6-6" />
              </svg>
            </a>
          </motion.section>
        )}

        {phase !== "pick" && photo && (
          <motion.section
            key="work"
            className={cx(styles.work, focused && styles.fit)}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <div className={cx(styles.workInner, correcting && styles.solo)}>
              <div className={styles.media}>
                <div className={styles.stage}>
                {phase === "details" && (
                  <button type="button" className={styles.change} onClick={restart} aria-label="Change photo" title="Change photo">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M3 12a9 9 0 0 1 15.5-6.2L21 8M21 3v5h-5M21 12a9 9 0 0 1-15.5 6.2L3 16M3 21v-5h5" />
                    </svg>
                  </button>
                )}
                {correcting && analysis ? (
                  <Annotator
                    src={photo.src}
                    analysisId={analysis.id}
                    initial={analysis.correction?.boxes ?? []}
                    onSaved={(c) => (setAnalysis({ ...analysis, correction: c }), setCorrecting(false))}
                    onCancel={() => setCorrecting(false)}
                  />
                ) : prepping ? (
                  <PrepView
                    original={photo.original}
                    size={photo.size}
                    frame={photo.src}
                    stage={phase === "details" ? "original" : view.step === 0 ? "crop" : "resize"}
                  />
                ) : (
                <RoadView
                  src={photo.src}
                  alt={photo.name}
                  cells={phase === "checking" || phase === "done" ? shown?.labels : undefined}
                  confidence={shown?.confidence}
                  grid
                  revealed={revealed}
                  mono={phase === "checking" && view.step === 3}
                  scanning={phase === "checking" && req.status !== "error" && view.step >= 3 && view.step <= CLASSIFY_STEP}
                  interactive={phase === "done"}
                  numbers
                />
                )}
                </div>
                {!correcting && phase === "done" && (
                <div className={styles.under}>
                  <DamageLegend />
                  {analysis && (
                    <button className={cx(ui.textBtn, styles.fix)} onClick={() => setCorrecting(true)}>
                      {analysis.correction ? `Corrected (${analysis.correction.boxes.length} box${analysis.correction.boxes.length === 1 ? "" : "es"}) · Edit` : "Incorrect?"}
                    </button>
                  )}
                </div>
                )}
              </div>

              <div className={styles.side} ref={side} hidden={correcting}>
                <AnimatePresence mode="wait">
                  {phase === "details" && (
                    <motion.form
                      key="details"
                      className={styles.form}
                      initial={{ opacity: 0, x: 12 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -12 }}
                      onSubmit={(e) => (e.preventDefault(), start())}
                    >
                      <h2>Where is this road?</h2>
                      <LocationPicker onChange={setPlace} />
                      <button type="submit" className={cx(ui.btn, ui.primary, styles.go)} disabled={!place}>
                        {place ? "Check this road" : "Waiting for the location…"}
                      </button>
                    </motion.form>
                  )}

                  {phase === "checking" && (
                    <motion.div key="checking" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}>
                      <Analyzing
                        key={run}
                        status={req.status}
                        timings={analysis?.timings ?? null}
                        error={req.error}
                        onStep={(step, t) => setView({ step, t })}
                        onDone={finish}
                        onRetry={start}
                        onBack={restart}
                      />
                    </motion.div>
                  )}

                  {phase === "done" && analysis && shown && (
                    <motion.div
                      key="done"
                      className={styles.result}
                      initial="hide"
                      animate="show"
                      variants={{ show: { transition: { staggerChildren: 0.08 } } }}
                    >
                      <motion.div variants={item}>
                        <ModelTabs
                          value={tab}
                          onChange={setTab}
                          scores={{ mlp: analysis.results.mlp.priority, svm: analysis.results.svm.priority, softmax: analysis.results.softmax.priority }}
                        />
                      </motion.div>
                      <motion.div variants={item}>
                        <PriorityCard score={shown.priority} />
                      </motion.div>
                      <motion.div variants={item}>
                        <DamageBreakdown counts={shown.counts} />
                      </motion.div>
                      <motion.div className={styles.actions} variants={item}>
                        <button className={cx(ui.btn, ui.primary)} onClick={save} disabled={saving.status === "saving" || saving.status === "saved"} aria-busy={saving.status === "saving"}>
                          {saving.status === "saving" && <span className={styles.spin} aria-hidden="true" />}
                          {saving.status === "saved" && (
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="3"
                              strokeLinecap="round"
                              aria-hidden="true"
                            >
                              <path d="m5 12.5 4.5 4.5L19 7.5" />
                            </svg>
                          )}
                          {saving.status === "saved" ? "Saved" : saving.status === "saving" ? "Saving…" : saving.status === "error" ? "Try saving again" : "Save record"}
                        </button>
                        <div className={styles.again}>
                          <button className={cx(ui.btn, ui.ghost, styles.round)} onClick={start} aria-label="Run the check again" data-tip="Run the check again">
                            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M20 11a8 8 0 1 0-2.3 5.7" />
                              <path d="M20 4v7h-7" />
                            </svg>
                          </button>
                          <button className={cx(ui.btn, ui.ghost, styles.round)} onClick={restart} aria-label="Choose again" data-tip="Choose again">
                            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
                              <path d="M14 3v5h5" />
                            </svg>
                          </button>
                        </div>
                      </motion.div>
                      {saving.status === "error" && (
                        <p className={styles.saveError} role="alert">
                          {saving.error}
                        </p>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
            {phase === "done" && !correcting && (
              <a className={styles.down} href="#reports">
                Past reports
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M12 5v14m-6-6 6 6 6-6" />
                </svg>
              </a>
            )}
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}

const item = { hide: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } };
