"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import ui from "@/components/ui/primitives/primitives.module.css";
import { cx } from "@/lib/cx";
import { averagePriority, classifyAll, type Results } from "@/lib/demo/classify";
import { thumbnail } from "@/lib/demo/images";
import { MODELS, type ModelId } from "@/lib/demo/models";
import { addReport, toResults } from "@/lib/demo/reports";
import { COLS, ROWS } from "@/lib/roadKit";
import { Analyzing } from "../Analyzing";
import { DamageBreakdown } from "../DamageBreakdown";
import { DamageLegend } from "../DamageLegend";
import { ModelTabs } from "../ModelTabs";
import { PhotoPicker, type PickedPhoto } from "../PhotoPicker";
import { PrepView } from "../PrepView";
import { PriorityCard } from "../PriorityCard";
import { RoadView } from "../RoadView";
import styles from "./NewReport.module.css";

type Phase = "pick" | "details" | "checking" | "done";

/** Photo → details → all three models (fake) → result. Only "Save record" adds it to the history below. */
export function NewReport({ onBusy }: { onBusy?: (busy: boolean) => void }) {
  const [phase, setPhase] = useState<Phase>("pick");
  const [photo, setPhoto] = useState<PickedPhoto | null>(null);
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [results, setResults] = useState<Results | null>(null);
  const [tab, setTab] = useState<ModelId>("mlp");
  const [saved, setSaved] = useState(false);
  const [view, setView] = useState({ step: -1, t: 0 });
  const side = useRef<HTMLDivElement>(null);

  // while details are filled in and the photo is checked, the page shows only that: no report list, no scrolling
  const focused = phase === "details" || phase === "checking";
  useEffect(() => onBusy?.(focused), [focused, onBusy]);

  const pick = (p: PickedPhoto) => {
    setPhoto(p);
    setPhase("details");
    window.scrollTo({ top: 0 });
  };

  const start = () => {
    if (!photo) return;
    setResults(classifyAll(photo.frame, photo.sample));
    setTab("mlp");
    setSaved(false);
    setView({ step: 0, t: 0 });
    setPhase("checking");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const finish = () => {
    setPhase("done");
    // on phones the result sits under the photo, so bring it into view
    if (window.innerWidth < 860) setTimeout(() => side.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
  };

  const save = () => {
    if (!photo || !results || saved) return;
    addReport({
      location: location.trim() || "Unnamed location",
      notes: notes.trim(),
      thumb: thumbnail(photo.frame),
      results: toResults(results),
      priority: averagePriority(results),
    });
    setSaved(true);
  };

  const restart = () => {
    setPhoto(null);
    setResults(null);
    setSaved(false);
    setLocation("");
    setNotes("");
    setPhase("pick");
    window.scrollTo({ top: 0 });
  };

  // what the photo shows while the checklist runs
  const all = COLS * ROWS;
  // during the check the photo fills in with the neural network's answer, then follows the chosen tab
  const shown = results ? results[phase === "done" ? tab : "mlp"] : null;
  // checklist steps: 0 crop, 1 resize, 2 squares, 3 grayscale, 4 features, 5 classify, 6 score
  const prepping = phase === "details" || (phase === "checking" && view.step <= 1);
  const revealed = phase === "done" ? all : view.step > 5 ? all : view.step === 5 ? Math.floor(view.t * all) : 0;

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
            <div className={styles.workInner}>
              <div className={styles.media}>
                <div className={styles.stage}>
                {prepping ? (
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
                  cells={phase === "checking" || phase === "done" ? shown?.cells : undefined}
                  confidence={shown?.confidence}
                  grid
                  revealed={revealed}
                  mono={phase === "checking" && (view.step === 3 || view.step === 4)}
                  scanning={phase === "checking" && view.step >= 3 && view.step <= 5}
                  interactive={phase === "done"}
                  numbers
                />
                )}
                </div>
                <div className={styles.under}>
                  {phase === "done" ? <DamageLegend /> : <span className={styles.file}>{photo.name}</span>}
                  {phase === "details" && (
                    <button className={ui.textBtn} onClick={restart}>
                      Change photo
                    </button>
                  )}
                </div>
              </div>

              <div className={styles.side} ref={side}>
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
                      <label className={ui.field}>
                        <span className={ui.label}>Location</span>
                        <input
                          className={ui.input}
                          value={location}
                          onChange={(e) => setLocation(e.target.value)}
                          placeholder="e.g. Street 271, Tuol Kork"
                          autoFocus
                        />
                      </label>
                      <label className={ui.field}>
                        <span className={ui.label}>
                          Notes <i className={styles.opt}>optional</i>
                        </span>
                        <textarea
                          className={ui.input}
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          placeholder="Anything the repair team should know"
                          rows={3}
                        />
                      </label>
                      <button type="submit" className={cx(ui.btn, ui.primary, styles.go)}>
                        Check this road
                      </button>
                    </motion.form>
                  )}

                  {phase === "checking" && (
                    <motion.div key="checking" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}>
                      <Analyzing onStep={(step, t) => setView({ step, t })} onDone={finish} />
                    </motion.div>
                  )}

                  {phase === "done" && results && shown && (
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
                          scores={{ mlp: results.mlp.priority, svm: results.svm.priority, softmax: results.softmax.priority }}
                        />
                      </motion.div>
                      <motion.div variants={item}>
                        <PriorityCard score={shown.priority} />
                      </motion.div>
                      <motion.div variants={item}>
                        <DamageBreakdown counts={shown.counts} />
                      </motion.div>
                      <motion.p className={styles.meta} variants={item}>
                        {Math.round((MODELS.find((m) => m.value === tab)?.accuracy ?? 0) * 100)}% accurate on the test photos · average confidence{" "}
                        {Math.round((shown.confidence.flat().reduce((a, b) => a + b, 0) / all) * 100)}%
                      </motion.p>
                      <motion.div className={styles.actions} variants={item}>
                        <button className={cx(ui.btn, ui.primary)} onClick={save} disabled={saved}>
                          {saved && (
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
                          {saved ? "Saved" : "Save record"}
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
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
            {phase === "done" && (
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
