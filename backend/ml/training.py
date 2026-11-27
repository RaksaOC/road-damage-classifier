"""Shared training helpers for Phase 11 (softmax, SVM, MLP).

All three model notebooks import these, so every model sees the same rows, the same
pipeline and the same evaluation. The notebooks only add the model itself.
Change this file only as a team: a change here changes all three results.
"""
import json
from pathlib import Path
from typing import NamedTuple

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from sklearn.decomposition import PCA
from sklearn.metrics import (ConfusionMatrixDisplay, accuracy_score, classification_report,
                             confusion_matrix, f1_score, precision_recall_fscore_support)
from sklearn.model_selection import GroupKFold
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from ml import config

FEATURES = config.PROCESSED / "09_features"
BALANCED = config.PROCESSED / "08_balance" / "train_balanced.csv"

# Agreed for all three models (build guide, Phase 11.1). On the balanced training squares,
# 60 components keep about 50% of the variance (20: 36%, 120: 62%).
N_PCA = 60

# Folds split by photo (groups=image_id), so the squares of one photo never sit in two folds.
CV = GroupKFold(n_splits=5)

LABELS = list(range(len(config.CLASSES)))  # models train on integer labels 0-4
NAMES = ["D00 · Longitudinal crack", "D10 · Transverse crack", "D20 · Alligator crack",
         "D40 · Pothole", "none · No damage"]


class Data(NamedTuple):
    """Balanced training squares (Phase 8) and validation squares (real mix). No test squares."""
    X_tr: np.ndarray
    y_tr: np.ndarray
    groups_tr: np.ndarray  # image_id of each training square, for GroupKFold
    X_va: np.ndarray
    y_va: np.ndarray


def _features():
    X = np.load(FEATURES / "X.npy", mmap_mode="r")  # 240,000 x 1,769, read lazily
    meta = np.load(FEATURES / "meta.npz", allow_pickle=True)
    return X, meta


def load_data() -> Data:
    """The agreed rows: the balanced training squares and all validation squares.

    The test squares are never loaded here; they stay untouched until Phase 13.
    """
    X, meta = _features()
    y, split, image_id, patch_id = meta["y"], meta["split"], meta["image_id"], meta["patch_id"]
    balanced = pd.read_csv(BALANCED)
    tr = np.flatnonzero(pd.Index(patch_id).isin(balanced["patch_id"]))
    va = np.flatnonzero(split == "val")
    assert len(tr) == len(balanced), "some balanced squares are missing from X.npy: re-check 08_balance vs 09_features"
    assert set(split[tr]) == {"train"}, "a balanced square is not in the training split"
    return Data(np.asarray(X[tr]), y[tr], image_id[tr], np.asarray(X[va]), y[va])


class TestData(NamedTuple):
    """The locked test squares (real mix), with the photo and country of each square."""
    X: np.ndarray
    y: np.ndarray
    image_id: np.ndarray
    country: np.ndarray


def load_test() -> TestData:
    """Phase 13 only: the 36,000 test squares, never used for training or tuning.

    Call it once, after the models are frozen in models/. Everything before Phase 13 uses load_data().
    """
    X, meta = _features()
    idx = np.flatnonzero(meta["split"] == "test")
    image_id = meta["image_id"][idx]
    country = np.array([i.split("_")[0] for i in image_id])  # image_id looks like "Czech_000123"
    return TestData(np.asarray(X[idx]), meta["y"][idx], image_id, country)


def load_unbalanced_train():
    """All training squares before Phase 8's balancing, for the balancing test (hypothesis H3)."""
    X, meta = _features()
    idx = np.flatnonzero(meta["split"] == "train")
    return np.asarray(X[idx]), meta["y"][idx]


def output_dir(name: str) -> Path:
    """data/processed/<name>/: each notebook writes only into its own folder."""
    out = config.PROCESSED / name
    out.mkdir(parents=True, exist_ok=True)
    return out


def make_pipeline(clf, n_components: int = N_PCA) -> Pipeline:
    """The agreed pipeline: StandardScaler -> PCA(60) -> clf.

    Scaler and PCA are fitted inside the pipeline, so they only ever see the rows the model is
    trained on (in GridSearchCV: the training folds), never the validation rows.
    """
    return Pipeline([("scale", StandardScaler()),
                     ("pca", PCA(n_components=n_components, random_state=config.SEED)),
                     ("clf", clf)])


def search_table(gs, out: Path):
    """Save a fitted GridSearchCV's results to out/cv_results.csv; return (table, best row).

    The best row has "params", "mean_test_score" and "std_test_score" (macro F1 over the 5 folds).
    """
    cv = pd.DataFrame(gs.cv_results_)
    cv.to_csv(out / "cv_results.csv", index=False)
    return cv, cv.loc[cv["mean_test_score"].idxmax()]


def floor_macro_f1(y_va) -> float:
    """Macro F1 of always answering "none": the score to beat (Phase 10.1)."""
    none = config.CLASS_TO_ID["none"]
    return f1_score(y_va, np.full_like(y_va, none), labels=LABELS, average="macro", zero_division=0)


def report(pipe, data: Data, out: Path, model: str, best, train_seconds: float) -> dict:
    """Same evaluation for every model, on validation. Writes results.json + confusion_matrix.png into out.

    best: the best row from search_table() (or any dict with params, mean_test_score, std_test_score).
    results.json is what the team plan's results sheet imports.
    """
    pred_va, pred_tr = pipe.predict(data.X_va), pipe.predict(data.X_tr)
    p, r, f, _ = precision_recall_fscore_support(data.y_va, pred_va, labels=LABELS, zero_division=0)
    cm = confusion_matrix(data.y_va, pred_va, labels=LABELS)
    res = {
        "model": model,
        "best_params": {k.replace("clf__", ""): str(v) for k, v in best["params"].items()},
        "cv_macro_f1_mean": round(float(best["mean_test_score"]), 4),
        "cv_macro_f1_std": round(float(best["std_test_score"]), 4),
        "val_accuracy": round(float(accuracy_score(data.y_va, pred_va)), 4),
        "val_macro_f1": round(float(f1_score(data.y_va, pred_va, labels=LABELS, average="macro", zero_division=0)), 4),
        "train_macro_f1": round(float(f1_score(data.y_tr, pred_tr, labels=LABELS, average="macro", zero_division=0)), 4),
        "train_seconds": round(float(train_seconds), 1),
        "per_class": {c: {"precision": round(float(p[i]), 4), "recall": round(float(r[i]), 4),
                          "f1": round(float(f[i]), 4)} for i, c in enumerate(config.CLASSES)},
        "confusion_matrix": cm.tolist(),
    }
    (out / "results.json").write_text(json.dumps(res, indent=2))

    fig, ax = plt.subplots(figsize=(7, 6))
    ConfusionMatrixDisplay(cm, display_labels=NAMES).plot(ax=ax, cmap="Blues", values_format="d", colorbar=False)
    ax.set(title=f"{model}: validation confusion matrix", xlabel="Predicted", ylabel="True")
    plt.setp(ax.get_xticklabels(), rotation=30, ha="right")
    fig.savefig(out / "confusion_matrix.png", dpi=150, bbox_inches="tight")

    print(classification_report(data.y_va, pred_va, labels=LABELS, target_names=NAMES, digits=3, zero_division=0))
    print(f"val macro F1 {res['val_macro_f1']} | train macro F1 {res['train_macro_f1']} "
          f"| floor {floor_macro_f1(data.y_va):.3f}")
    return res
