"use client";

import { useEffect, useRef } from "react";
import { mountTour } from "./engine";
import "./tour.css";

/* Onboarding tour: the whole pipeline animated in 8 steps. The markup lives here; the canvases
   and live numbers are driven by engine.ts while the tour is open. */
export function Tour({ onClose }: { onClose: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    if (!root.current) return;
    const before = document.activeElement as HTMLElement | null;
    const cleanup = mountTour(root.current, () => close.current());
    return () => { cleanup(); before?.focus?.(); };
  }, []);

  return (
    <div className="tour" ref={root}>
      <div className="tour-dialog" role="dialog" aria-modal="true" aria-labelledby="tourTitle" tabIndex={-1} id="tourDialog">
        <div className="tour-head">
          <div className="t">
            <span className="label" id="tourStep">Step 1 of 8</span>
            <h2 id="tourTitle">From road photo to repair priority</h2>
          </div>
          <button className="btn icon-btn" id="tourClose" aria-label="Close tour">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>

        <div className="tour-body">
          <div className="stage-grid">
            <figure className="panel p-photo" id="tp-photo">
              <div className="phead"><span className="label">Input → Output</span><h3>Road photo</h3></div>
              <canvas id="t-view" width={640} height={400} role="img" aria-label="Road photo split into a grid, coloured by the damage found in each square" />
              <div className="legend" id="t-legend" />
            </figure>
            <figure className="panel p-patch" id="tp-patch">
              <div className="phead"><span className="label">Preprocess</span><h3>One square</h3></div>
              <canvas id="t-patch" width={240} height={240} role="img" aria-label="One square, turned grayscale and shrunk to 32 by 32 pixels" />
              <p className="cap" id="t-patchCap" />
            </figure>
            <figure className="panel p-feat" id="tp-feat">
              <div className="phead"><span className="label">Features</span><h3>Numbers the model sees</h3></div>
              <canvas id="t-feat" width={640} height={280} role="img" aria-label="1,024 pixel values compressed by PCA" />
              <dl className="meas" id="t-hand" />
            </figure>
            <div className="panel p-model" id="tp-model">
              <div className="phead"><span className="label">Model</span><h3>Which class is this square?</h3></div>
              <div className="cols">
                <ul className="models" id="t-models" />
                <div className="probs" id="t-probs" />
              </div>
            </div>
            <div className="panel p-result t-result" id="tp-result">
              <div className="phead"><span className="label">Output</span><h3>Result</h3></div>
              <span className="big" id="t-rLabel">—</span>
              <span className="hint" id="t-rConf">Waiting for the model</span>
              <div className="gauge">
                <div className="row"><span className="label">Damage priority</span><span className="score" id="t-rScore">–</span></div>
                <div className="track"><div className="fill" id="t-rFill" /></div>
                <span className="action" id="t-rAction">&nbsp;</span>
              </div>
              <div className="counts" id="t-rCounts" />
            </div>
          </div>
          <p className="tour-now" id="t-now" />
          <p className="tour-note">Tour photos are drawn by code and the model outputs are illustrative. Grayscale, resize and the 5 measurements are computed live.</p>
        </div>

        <div className="tour-foot">
          <div className="rail" id="t-rail" aria-label="Tour steps" />
          <div className="tour-actions">
            <div className="grp">
              <button className="btn" id="t-back">Back</button>
              <button className="btn" id="t-play" aria-label="Pause autoplay">Pause</button>
            </div>
            <div className="grp">
              <button className="btn" id="t-skip">Skip tour</button>
              <button className="btn primary" id="t-next">Next</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
