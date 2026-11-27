"""Export users' corrections from Postgres as training data, in the same shapes as the RDD pipeline.

run:  uv run python -m ml.scripts.export_corrections      (DATABASE_URL and the S3_* settings, as for the API)
writes data/processed/corrections/:
    frames/<analysis_id>.jpg   the 640 x 400 frame the models saw
    boxes.csv                  analysis_id, cls, xmin, xmax, ymin, ymax   (like 06_squares/boxes_640x400.csv)
    squares.csv                analysis_id, row, col, label, model labels (what each model had said)
    X.npy, y.npy               1,769 features + class id per square, ready to add to the training rows

The labels come from the boxes with the training rule (app/domain.py labels_from_boxes, tested against notebook 06).
These photos were never in train/val/test, so they can join the training set; keep them out of the locked test set.
"""
import numpy as np
import pandas as pd
import psycopg
from PIL import Image
from psycopg.rows import dict_row

from app.settings import Settings
from app.storage import MinioStore
from ml import config, features, photo

OUT = config.PROCESSED / "corrections"


def main():
    s = Settings()
    files = MinioStore(s.s3_endpoint, s.s3_public_url, s.s3_access_key, s.s3_secret_key, s.s3_bucket, s.s3_region)
    with psycopg.connect(s.database_url, row_factory=dict_row) as conn:
        rows = conn.execute("""SELECT c.analysis_id, c.boxes, c.labels, a.frame_key
                               FROM corrections c JOIN analyses a ON a.id = c.analysis_id ORDER BY c.updated_at""").fetchall()
        preds = conn.execute("""SELECT p.analysis_id, p.model, p.sq_row, p.sq_col, p.label FROM predictions p
                                WHERE p.analysis_id IN (SELECT analysis_id FROM corrections)""").fetchall()
    if not rows:
        print("no corrections yet")
        return

    (OUT / "frames").mkdir(parents=True, exist_ok=True)
    boxes, squares, X = [], [], []
    said = pd.DataFrame(preds).pivot_table(index=["analysis_id", "sq_row", "sq_col"], columns="model", values="label", aggfunc="first")
    for r in rows:
        aid = str(r["analysis_id"])
        path = OUT / "frames" / f"{aid}.jpg"
        path.write_bytes(files.get(r["frame_key"]))  # frames live in object storage (app/storage.py)
        frame = Image.open(path).convert("RGB")
        mean = features.photo_brightness(frame)
        X.extend(features.extract(sq, mean) for sq in photo.squares(frame))
        boxes += [{"analysis_id": aid, **{k: b[k] for k in ("cls", "xmin", "xmax", "ymin", "ymax")}} for b in r["boxes"]]
        for i, label in enumerate(r["labels"]):
            row, col = divmod(i, photo.COLS)
            model = said.loc[(r["analysis_id"], row, col)].to_dict() if (r["analysis_id"], row, col) in said.index else {}
            squares.append({"analysis_id": aid, "row": row, "col": col, "label": label, **{f"said_{k}": v for k, v in model.items()}})

    pd.DataFrame(boxes, columns=["analysis_id", "cls", "xmin", "xmax", "ymin", "ymax"]).to_csv(OUT / "boxes.csv", index=False)
    sq = pd.DataFrame(squares)
    sq.to_csv(OUT / "squares.csv", index=False)
    np.save(OUT / "X.npy", np.asarray(X, dtype=np.float32))
    np.save(OUT / "y.npy", sq.label.map(config.CLASS_TO_ID).to_numpy())
    print(f"{len(rows)} corrected photos -> {len(sq)} squares ({(sq.label != 'none').sum()} damaged), {len(boxes)} boxes -> {OUT}")


if __name__ == "__main__":
    main()
