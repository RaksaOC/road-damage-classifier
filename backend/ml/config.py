"""Shared settings: one place for paths, the random seed and the fixed choices from the build guide."""
from pathlib import Path

SEED = 42  # use everywhere something is random: sampling, splitting, training

BACKEND = Path(__file__).resolve().parent.parent
RAW = BACKEND / "data" / "raw"  # the original RDD2022 dataset, never edited
PROCESSED = BACKEND / "data" / "processed"  # everything we generate (CSVs, features)
MODELS = BACKEND / "models"  # saved pipelines and metrics.json

COUNTRIES = ["Japan", "India", "Czech"]  # subset (guide, Phase 2)
CLASSES = ["D00", "D10", "D20", "D40", "none"]
# Train on integer labels (0-4), not the text names: MLPClassifier(early_stopping=True) crashes on
# text labels in scikit-learn 1.7 and 1.8. Convert back to names only for display.
CLASS_TO_ID = {c: i for i, c in enumerate(CLASSES)}
ID_TO_CLASS = dict(enumerate(CLASSES))

# Image → squares (guide, Phase 6)
CROP_KEEP = 5 / 8  # keep the bottom 5/8 of each square photo (drops the sky)
IMG_W, IMG_H = 640, 400
SQUARE = 80  # 8 columns x 5 rows = 40 squares
LABEL_MIN_OVERLAP = 0.10  # a box must cover at least 10% of a square to label it
# (started at 0.15; Phase 6.2 found that lost 24% of the potholes, so lowered to 0.10)
