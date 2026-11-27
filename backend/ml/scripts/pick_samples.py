"""Pick the frontend's sample photos: test photos (never trained on) where all three frozen models do well,
plus a few more dataset photos (EXTRA) so every country and damage type shows up.

run:  uv run python -m ml.scripts.pick_samples
writes: frontend/public/samples/<image_id>.jpg, the raw dataset files, nothing else. The app sends a sample
exactly like a user's own photo. Paste the list it prints into frontend/src/data/shared/samples.ts.

These are chosen BECAUSE the models do well on them, so the app says so: a typical photo scores lower
(see notebook 13: test macro F1 0.22-0.25).
"""
import shutil

import numpy as np
import pandas as pd

from ml import config
from ml.predict import ModelStore
from ml.training import load_test

OUT = config.BACKEND.parent / "frontend" / "public" / "samples"
C = config.CLASS_TO_ID

# key, label shown on the button, which photos qualify (truth = the 40 dataset labels), the class it is about
CATEGORIES = [
    ("pothole", "Pothole", lambda t: (t == C["D40"]).sum() >= 2, "D40"),
    ("alligator", "Alligator cracks", lambda t: (t == C["D20"]).sum() >= 4 and not (t == C["D40"]).any(), "D20"),
    ("longitudinal", "Long cracks", lambda t: (t == C["D00"]).sum() >= 3 and not np.isin(t, [C["D20"], C["D40"]]).any(), "D00"),
    ("transverse", "Cross cracks", lambda t: (t == C["D10"]).sum() >= 2 and not np.isin(t, [C["D20"], C["D40"]]).any(), "D10"),
    ("clean", "Clean road", lambda t: (t == C["none"]).all(), "none"),
]
# more raw photos, one damaged road per country (picked from images_clean.csv; train/val photos are fine here)
EXTRA = ["Czech_001512", "India_005619", "Japan_000613"]


def main():
    store, test = ModelStore(), load_test()
    print("predicting", len(test.y), "test squares with", store.names)
    pred = {n: p.predict(test.X) for n, p in store.pipes.items()}

    images = pd.read_csv(config.PROCESSED / "04_clean" / "images_clean.csv").set_index("image_id")
    photos = pd.unique(test.image_id)
    rows = []
    for iid in photos:
        idx = np.flatnonzero(test.image_id == iid)
        t = test.y[idx]
        correct = {n: int((pred[n][idx] == t).sum()) for n in store.names}
        rows.append({"image_id": iid, "truth": t, "correct": correct, "idx": idx,
                     "mean_correct": np.mean(list(correct.values()))})

    OUT.mkdir(parents=True, exist_ok=True)
    picked, used = [], set()
    for key, label, qualifies, cls in CATEGORIES:
        k = C[cls]
        best = None
        for r in rows:
            if r["image_id"] in used or not qualifies(r["truth"]):
                continue
            # damage photos: the models must find the damage itself, not just the clean squares around it
            hit = np.mean([(pred[n][r["idx"]][r["truth"] == k] == k).mean() for n in store.names])
            score = r["mean_correct"] / 40 + (hit if cls != "none" else 0)
            if best is None or score > best[0]:
                best = (score, r, hit)
        score, r, hit = best
        used.add(r["image_id"])
        picked.append(r["image_id"])
        print(f"{key:13s} {r['image_id']:14s} correct of 40: {r['correct']} | {cls} found by the models: {hit:.0%}")

    for iid in picked + EXTRA:
        shutil.copyfile(config.RAW / images.loc[iid, "path"], OUT / f"{iid}.jpg")  # byte for byte, as taken
    print("wrote", OUT)
    print("for samples.ts:", ", ".join(f'"{iid}"' for iid in picked + EXTRA))

if __name__ == "__main__":
    main()
