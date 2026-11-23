"""Photo -> 640 x 400 frame -> 40 squares (guide, Phase 6.1). Used by the app; notebooks 06 and 09 did the same.

Training cut every photo this way, so the app must too: any difference here and the models see
squares they were never trained on. tests/test_photo.py checks the app's numbers against X.npy.
"""
import io

import numpy as np
from PIL import Image, ImageOps

from ml import config

ROWS, COLS = config.IMG_H // config.SQUARE, config.IMG_W // config.SQUARE  # 5 x 8 = 40 squares

# Pillow can't open everything a phone makes (HEIC needs an extra plugin), so we say up front what works.
FORMATS = {"JPEG", "PNG", "WEBP", "BMP"}


class PhotoError(ValueError):
    """The upload is not a photo we can use; the message is safe to show to the user."""


def load(data: bytes) -> Image.Image:
    """Uploaded bytes -> RGB photo, turned upright (phones store rotation in EXIF; the RDD photos have none)."""
    try:
        img = Image.open(io.BytesIO(data))
        img.load()
    except Exception as e:
        raise PhotoError("This file couldn't be read as an image.") from e
    if img.format not in FORMATS:
        raise PhotoError(f"{img.format or 'This'} files aren't supported. Use JPG, PNG or WebP.")
    img = ImageOps.exif_transpose(img).convert("RGB")
    if min(img.size) < 100:
        raise PhotoError(f"The photo is too small ({img.width} x {img.height}). Use one at least 100 px on each side.")
    return img


def crop_top(height: int) -> int:
    """The row where the crop starts: we keep the bottom 5/8 of the photo (the road)."""
    return height - round(height * config.CROP_KEEP)


def crop(img: Image.Image) -> Image.Image:
    """Drop the top 3/8 (sky, horizon)."""
    w, h = img.size
    return img.crop((0, crop_top(h), w, h))


def resize(img: Image.Image) -> Image.Image:
    """Stretch to 640 x 400, the size of every training frame."""
    return img.resize((config.IMG_W, config.IMG_H), Image.BILINEAR)


def crop_resize(img: Image.Image) -> Image.Image:
    """Photo -> 640 x 400 frame. Exactly notebook 06/09's crop_resize."""
    return resize(crop(img))


def squares(frame: Image.Image) -> list[Image.Image]:
    """The 40 squares of a frame, row by row (row 0 = far away, col 0 = left), like patches_split.csv."""
    s = config.SQUARE
    return [frame.crop((c * s, r * s, (c + 1) * s, (r + 1) * s)) for r in range(ROWS) for c in range(COLS)]


def jpeg(img: Image.Image, quality: int = 88) -> bytes:
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=quality)
    return buf.getvalue()


def grid(values) -> list[list]:
    """40 values in square order -> 5 rows of 8."""
    v = np.asarray(values).tolist()
    return [v[r * COLS:(r + 1) * COLS] for r in range(ROWS)]
