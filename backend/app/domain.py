"""Domain: the shapes the API returns and the rules that don't depend on HTTP or SQL.

The frontend has the same shapes in src/domain/. Keep them in step.
"""
import math
from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

from ml import config

ClassKey = Literal["D00", "D10", "D20", "D40", "none"]
DamageKey = Literal["D00", "D10", "D20", "D40"]
CLASSES: list[str] = config.CLASSES
ROWS, COLS = 5, 8

# How serious each class is, for the repair priority (frontend: src/domain/damage.ts)
WEIGHT = {"D00": 0.4, "D10": 0.5, "D20": 0.8, "D40": 1.0, "none": 0.0}
SEVERITY = sorted((c for c in CLASSES if c != "none"), key=WEIGHT.get, reverse=True)  # D40 first

# The model a report card shows when there is room for only one (the frontend's default tab)
PREVIEW_MODEL = "mlp"


def priority_score(labels: list[str]) -> float:
    """0-10 repair priority = 10 x (0.55 x worst + 1.6 x spread), capped at 10.

    worst  = weight of the most serious damage found (pothole 1.0 ... none 0)
    spread = sum of all square weights / number of squares (how much of the road is damaged)
    One pothole already makes a road at least "medium"; wide damage pushes it higher.
    Same formula as src/domain/priority.ts (used by the frontend's mock mode).
    """
    w = [WEIGHT[k] for k in labels]
    score = 10 * (0.55 * max(w, default=0) + 1.6 * sum(w) / len(w))
    return min(10.0, math.floor(score * 10 + 0.5) / 10)  # round half up, like JavaScript's Math.round


# Boxes -> square labels, exactly as notebook 06 labelled the training squares
SQUARE = config.SQUARE  # 80
LABEL_ORDER = ["D00", "D10", "D20", "D40"]  # least -> most serious: the last one wins a square


def labels_from_boxes(boxes: list["Box"]) -> list[str]:
    """A box labels a square when it covers at least LABEL_MIN_OVERLAP (10%) of it; the most serious class wins.

    Boxes are in frame pixels (640 x 400), like data/processed/06_squares/boxes_640x400.csv.
    """
    labels = ["none"] * (ROWS * COLS)
    for cls in LABEL_ORDER:  # least serious first, so a more serious class overwrites it
        for b in (b for b in boxes if b.cls == cls):
            for i in range(ROWS * COLS):
                x0, y0 = (i % COLS) * SQUARE, (i // COLS) * SQUARE
                ow = max(0.0, min(b.xmax, x0 + SQUARE) - max(b.xmin, x0))
                oh = max(0.0, min(b.ymax, y0 + SQUARE) - max(b.ymin, y0))
                if ow * oh / (SQUARE * SQUARE) >= config.LABEL_MIN_OVERLAP:
                    labels[i] = cls
    return labels


def counts(labels: list[str]) -> dict[str, int]:
    return {c: labels.count(c) for c in CLASSES}


def main_issue(labels: list[str]) -> str | None:
    """The most serious damage found, if any."""
    return next((c for c in SEVERITY if c in labels), None)


# ---- API shapes -----------------------------------------------------------------------------

class Size(BaseModel):
    w: int
    h: int


class Metrics(BaseModel):
    macro_f1: float
    pothole_recall: float
    clean_road_flagged: float


class ModelInfo(BaseModel):
    id: str
    title: str
    description: str
    status: str
    validation: Metrics
    test: Metrics | None  # None until notebook 13 has scored the test set


class ModelResult(BaseModel):
    """One model's verdict on the 40 squares. Grids are 5 rows x 8 columns, row 0 = far away."""
    model: str
    labels: list[list[ClassKey]]
    confidence: list[list[float]]  # probability of the chosen class, 0-1
    probs: list[list[list[float]]]  # 5 probabilities per square, in CLASSES order
    counts: dict[str, int]
    priority: float
    predict_ms: float


class Box(BaseModel):
    """A damage box drawn by a user, in frame pixels (640 x 400), Pascal VOC style like the RDD2022 labels."""
    cls: DamageKey
    xmin: float = Field(ge=0, le=640)
    ymin: float = Field(ge=0, le=400)
    xmax: float = Field(ge=0, le=640)
    ymax: float = Field(ge=0, le=400)

    @model_validator(mode="after")
    def _ordered(self):
        if self.xmax - self.xmin < 2 or self.ymax - self.ymin < 2:
            raise ValueError("a box needs xmin < xmax and ymin < ymax (at least 2 px)")
        return self


class CorrectionIn(BaseModel):
    boxes: list[Box] = Field(max_length=200)  # no boxes = "there is no damage on this road"


class Correction(BaseModel):
    """What the user says is really on the photo: their boxes and the 40 square labels they give."""
    boxes: list[Box]
    labels: list[list[ClassKey]]
    counts: dict[str, int]
    updated_at: datetime


class Analysis(BaseModel):
    id: UUID
    created_at: datetime
    filename: str
    source: str  # "upload" or "sample:<key>"
    original_size: Size
    image_url: str  # the 640 x 400 frame the models saw
    results: dict[str, ModelResult]
    priority: float  # average of the models
    timings_ms: dict[str, float]  # crop, resize, squares, features, model_<name>
    correction: Correction | None = None


class ReportCreate(BaseModel):
    analysis_id: UUID
    location: str = Field(min_length=1, max_length=200)  # place name from the map's address lookup
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)


class ReportSummary(BaseModel):
    id: UUID
    number: int
    created_at: datetime
    location: str
    lat: float | None  # None for records made before the map
    lng: float | None
    priority: float
    image_url: str
    preview_model: str
    preview_labels: list[list[ClassKey]]
    main_issue: ClassKey | None
    corrected: bool  # a user has drawn the real damage on it


class Report(ReportSummary):
    analysis: Analysis


class ReportPage(BaseModel):
    items: list[ReportSummary]
    total: int
    next_offset: int | None


Sort = Literal["newest", "oldest", "priority"]
