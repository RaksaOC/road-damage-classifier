"""One square (80 x 80 colour) -> one row of 1,769 numbers. Used in training AND in the app (guide, Phase 9.1).

If training and the app ever prepare squares differently, the app silently breaks, so this is the only copy.
"""
import numpy as np
from PIL import Image
from skimage.feature import canny, hog

SIZE = 64  # resize to 64 x 64: divides into 8 x 8 HOG cells exactly

# HOG settings: the standard values from the original HOG paper (Dalal & Triggs, 2005)
ORIENTATIONS = 9  # 9 direction bins of 20 degrees (0-180)
CELL = (8, 8)  # one histogram per 8 x 8 pixels -> 8 x 8 cells
BLOCK = (2, 2)  # normalise over 2 x 2 cells -> 7 x 7 blocks
# 7 x 7 blocks x (2 x 2 cells) x 9 bins = 1,764 numbers

# ASSUMPTION: "much darker" = at least 0.12 below the photo's average brightness (brightness 0-1,
# so about 30 of 255 grey levels). A starting value; Phase 9.3 checks whether dark share separates the classes.
DARK_BELOW = 0.12

N_HOG = 1764
SIMPLE = ["dark_share", "edge_density", "gx_share", "gy_share", "contrast"]
N_FEATURES = N_HOG + len(SIMPLE)  # 1,769


def gray64(square):
    """80 x 80 colour (PIL image or H x W x 3 array) -> 64 x 64 grayscale, brightness 0-1."""
    img = square if isinstance(square, Image.Image) else Image.fromarray(np.asarray(square, dtype=np.uint8))
    return np.asarray(img.convert("L").resize((SIZE, SIZE), Image.BILINEAR), dtype=np.float64) / 255


def photo_brightness(frame):
    """Average brightness (0-1) of the whole 640 x 400 photo; the reference for 'dark share'."""
    img = frame if isinstance(frame, Image.Image) else Image.fromarray(np.asarray(frame, dtype=np.uint8))
    return float(np.asarray(img.convert("L"), dtype=np.float64).mean() / 255)


def simple_measures(g, photo_mean):
    """The 5 simple measures of a 64 x 64 grayscale square (see SIMPLE for the order)."""
    dark_share = (g < photo_mean - DARK_BELOW).mean()
    edge_density = canny(g).mean()
    gy, gx = np.gradient(g)  # gx: change left -> right (strong at vertical lines), gy: change top -> bottom
    ax, ay = np.abs(gx).sum(), np.abs(gy).sum()
    total = ax + ay
    gx_share = ax / total if total > 0 else 0.5  # a perfectly flat square has no direction: call it 50/50
    gy_share = ay / total if total > 0 else 0.5
    contrast = g.std()
    return np.array([dark_share, edge_density, gx_share, gy_share, contrast])


def extract(square, photo_mean=None):
    """One 80 x 80 colour square -> 1,769 numbers: 1,764 HOG + 5 simple measures.

    photo_mean: average brightness of the photo the square came from (photo_brightness(frame)).
    If not given, the square's own average is used.
    """
    g = gray64(square)
    if photo_mean is None:
        photo_mean = g.mean()
    h = hog(g, orientations=ORIENTATIONS, pixels_per_cell=CELL, cells_per_block=BLOCK, feature_vector=True)
    return np.concatenate([h, simple_measures(g, photo_mean)])
