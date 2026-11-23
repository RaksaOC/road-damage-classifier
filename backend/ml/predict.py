"""The only place the app touches the models: photo -> 40 squares -> features -> every frozen model.

Loads models/*.joblib once (they were frozen and tested in notebook 13) and checks them against
metrics.json, so the app can't silently run a model that differs from the tested one.
"""
import hashlib
import json
import time
from dataclasses import dataclass, field
from pathlib import Path

import joblib
import numpy as np
import sklearn
from PIL import Image
from sklearn.svm import SVC

from ml import config, features, photo


@dataclass(frozen=True)
class ModelPrediction:
    """One model's answer for the 40 squares, in square order (row by row)."""
    labels: list[str]  # class name per square
    confidence: list[float]  # probability of the chosen class
    probs: list[list[float]]  # 5 probabilities per square, in config.CLASSES order
    ms: float


@dataclass(frozen=True)
class PhotoPrediction:
    frame: Image.Image  # the 640 x 400 frame the models saw
    original_size: tuple[int, int]
    models: dict[str, ModelPrediction]
    timings_ms: dict[str, float] = field(default_factory=dict)  # crop, resize, squares, features, models


class ModelStore:
    """The frozen models in models/, loaded once."""

    def __init__(self, models_dir: Path = config.MODELS, verify: bool = True):
        self.dir = models_dir
        meta_path = models_dir / "metrics.json"
        if not meta_path.exists():
            raise FileNotFoundError(f"{meta_path} is missing: run notebook 13_final_test.ipynb first")
        self.metrics = json.loads(meta_path.read_text())
        trained = self.metrics["versions"]["scikit-learn"]
        if trained != sklearn.__version__:
            raise RuntimeError(f"models were saved with scikit-learn {trained}, this is {sklearn.__version__}: "
                               "run `uv sync` so both match")
        self.pipes = {}
        for name, card in self.metrics["models"].items():
            path = models_dir / card["file"]
            if verify and hashlib.sha256(path.read_bytes()).hexdigest() != card["sha256"]:
                raise RuntimeError(f"{path.name} is not the file tested in notebook 13 (SHA-256 differs)")
            self.pipes[name] = joblib.load(path)
        self.classes = self.metrics["classes"]
        assert self.classes == config.CLASSES

    @property
    def names(self) -> list[str]:
        return list(self.pipes)

    def features(self, frame: Image.Image) -> np.ndarray:
        """(40, 1769): the same extract() as training, with the photo's own average brightness."""
        mean = features.photo_brightness(frame)
        return np.stack([features.extract(sq, mean) for sq in photo.squares(frame)])

    def predict(self, img: Image.Image) -> PhotoPrediction:
        t, timings = time.perf_counter(), {}

        def lap(name):
            nonlocal t
            now = time.perf_counter()
            timings[name] = round((now - t) * 1000, 2)
            t = now

        cropped = photo.crop(img); lap("crop")
        frame = photo.resize(cropped); lap("resize")
        photo.squares(frame); lap("squares")  # timed on its own for the progress view; features() cuts again
        X = self.features(frame); lap("features")

        out = {}
        for name, pipe in self.pipes.items():
            p = pipe.predict_proba(X)
            # predict_proba's columns follow pipe.classes_ (integers 0-4); map them back to CLASSES order
            probs = np.zeros((len(X), len(self.classes)))
            probs[:, pipe.classes_] = p
            if isinstance(pipe[-1], SVC):
                # SVC: predict() uses the decision function, predict_proba() a calibrated estimate that can
                # disagree with it. The label must be the one notebook 13 tested, so it comes from predict().
                idx = pipe.predict(X)
            else:
                idx = probs.argmax(1)
            lap(f"model_{name}")
            out[name] = ModelPrediction(labels=[self.classes[i] for i in idx],
                                        confidence=[round(float(probs[k, i]), 4) for k, i in enumerate(idx)],
                                        probs=np.round(probs, 4).tolist(), ms=timings[f"model_{name}"])
        return PhotoPrediction(frame=frame, original_size=img.size, models=out, timings_ms=timings)
