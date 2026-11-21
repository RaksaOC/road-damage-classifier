import json

import matplotlib

matplotlib.use("Agg")  # no windows during tests

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import GridSearchCV

from ml.training import CV, N_PCA, Data, floor_macro_f1, make_pipeline, report, search_table


def tiny_data():
    """Random rows with enough columns for PCA(60) and every class present."""
    rng = np.random.default_rng(42)
    n, d = 300, N_PCA + 10
    y = np.arange(n) % 5
    X = rng.normal(size=(n, d)) + y[:, None] * 0.5  # a little signal per class
    groups = np.arange(n) // 6  # 6 "squares" per "photo"
    return Data(X[:200], y[:200], groups[:200], X[200:], y[200:])


def test_pipeline_is_scale_pca_model():
    pipe = make_pipeline(LogisticRegression())
    assert [name for name, _ in pipe.steps] == ["scale", "pca", "clf"]
    assert pipe.named_steps["pca"].n_components == N_PCA


def test_search_and_report_write_results(tmp_path):
    data = tiny_data()
    gs = GridSearchCV(make_pipeline(LogisticRegression(max_iter=500)), {"clf__C": [0.1, 1]},
                      cv=CV, scoring="f1_macro")
    gs.fit(data.X_tr, data.y_tr, groups=data.groups_tr)
    cv, best = search_table(gs, tmp_path)
    assert (tmp_path / "cv_results.csv").exists() and len(cv) == 2

    res = report(gs.best_estimator_, data, tmp_path, "test model", best, gs.refit_time_)
    saved = json.loads((tmp_path / "results.json").read_text())
    assert saved == res
    assert set(saved["per_class"]) == {"D00", "D10", "D20", "D40", "none"}
    assert np.array(saved["confusion_matrix"]).sum() == len(data.y_va)
    assert (tmp_path / "confusion_matrix.png").exists()


def test_floor_is_always_none():
    y = np.array([4] * 88 + [0, 1, 2, 3] * 3)
    # "none" F1 = 2 * 0.88 / 1.88, the 4 damage classes score 0
    assert np.isclose(floor_macro_f1(y), (2 * 0.88 / 1.88) / 5)
