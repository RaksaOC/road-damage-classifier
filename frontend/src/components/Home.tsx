"use client";

import { useEffect, useState } from "react";
import { Tour } from "./tour/Tour";
import { ApiStatus } from "./ui/ApiStatus";
import { ThemeToggle } from "./ui/ThemeToggle";

const STEPS = [
  ["Photo", "A phone or dashcam photo of the road."],
  ["Grid", "Cut into square cells, each checked on its own."],
  ["Preprocess", "Grayscale, resized to 32 × 32 = 1,024 numbers."],
  ["Features", "PCA plus 5 measurements: brightness, contrast, edge strength, dark area, edge direction."],
  ["Classify", "Softmax regression, SVM and a neural network pick one of 5 classes."],
  ["Priority", "The damage adds up to a 0–10 repair priority."],
];

export function Home() {
  const [tourOpen, setTourOpen] = useState(false);

  // open the tour on the first visit
  useEffect(() => {
    let seen = false;
    try { seen = localStorage.getItem("rdc-tour-seen") === "1"; } catch {}
    if (!seen) setTourOpen(true);
  }, []);

  const closeTour = () => {
    setTourOpen(false);
    try { localStorage.setItem("rdc-tour-seen", "1"); } catch {}
  };

  return (
    <>
      <div className="shell">
        <header className="top">
          <div className="brand">
            <span className="mark" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M8 2 6 22M16 2l2 20" stroke="currentColor" strokeWidth="1.8" /><path d="M12 4v3m0 4v3m0 4v3" stroke="#ff7759" strokeWidth="2" /></svg>
            </span>
            Road Damage Classifier
          </div>
          <nav>
            <button className="btn" onClick={() => setTourOpen(true)}>How it works</button>
            <ThemeToggle />
          </nav>
        </header>

        <section className="intro">
          <span className="label">ML project · Fundamentals of Machine Learning</span>
          <h1>Find road damage, square by square</h1>
          <p>Upload a road photo. The model checks every square, names the damage it sees, and gives the road a repair priority.</p>
          <button className="btn primary" onClick={() => setTourOpen(true)}>Take the tour</button>
        </section>

        <div className="grid2">
          <section className="card" aria-labelledby="stepsTitle">
            <h2 id="stepsTitle">The pipeline</h2>
            <ol className="steps">
              {STEPS.map(([t, d]) => <li key={t}><b>{t}</b><span>{d}</span></li>)}
            </ol>
          </section>
          <section className="card" aria-labelledby="checkTitle">
            <h2 id="checkTitle">Check a road</h2>
            <div className="upload">
              <strong>Photo upload</strong>
              <span>Arrives once the model is trained.</span>
            </div>
          </section>
        </div>

        <footer className="foot">
          <ApiStatus />
          <span>Data: RDD2022 road damage dataset · Models: softmax regression, SVM, neural network</span>
        </footer>
      </div>

      {tourOpen && <Tour onClose={closeTour} />}
    </>
  );
}
