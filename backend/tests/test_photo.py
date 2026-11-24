"""The app must cut photos exactly like training did: same frame, same squares, same 1,769 numbers."""
import numpy as np
import pandas as pd
import pytest

from ml import config, photo
from ml.predict import ModelStore

FEAT = config.PROCESSED / "09_features"
needs_data = pytest.mark.skipif(not (FEAT / "X.npy").exists() or not (config.MODELS / "metrics.json").exists(),
                                reason="needs data/processed and models/ (not in git)")


@pytest.fixture(scope="module")
def store():
    return ModelStore()


@needs_data
@pytest.mark.parametrize("country", config.COUNTRIES)
def test_app_features_match_training(store, country):
    """One test photo per country through the app's code path == its 40 rows in X.npy."""
    meta = np.load(FEAT / "meta.npz", allow_pickle=True)
    idx = np.flatnonzero((meta["split"] == "test") & np.char.startswith(meta["image_id"].astype(str), country))[:40]
    image_id = meta["image_id"][idx[0]]
    assert (meta["image_id"][idx] == image_id).all()
    path = pd.read_csv(config.PROCESSED / "04_clean" / "images_clean.csv").set_index("image_id").loc[image_id, "path"]

    img = photo.load((config.RAW / path).read_bytes())
    X_app = store.features(photo.crop_resize(img))
    X_train = np.load(FEAT / "X.npy", mmap_mode="r")[idx]
    assert np.allclose(X_app, X_train, atol=1e-5), f"{image_id}: the app prepares squares differently from training"

    pred = store.predict(img)
    for name, pipe in store.pipes.items():
        want = [config.CLASSES[i] for i in pipe.predict(X_train)]
        assert pred.models[name].labels == want, name


def test_crop_keeps_bottom_five_eighths():
    from PIL import Image
    img = Image.new("RGB", (600, 600))
    assert photo.crop_top(600) == 225 and photo.crop(img).size == (600, 375)
    frame = photo.crop_resize(img)
    assert frame.size == (640, 400) and len(photo.squares(frame)) == 40


def test_rejects_non_images():
    with pytest.raises(photo.PhotoError):
        photo.load(b"not an image")
