-- Applied at startup; every statement is safe to run again.

-- One photo checked by all models. Kept even before it is saved as a report, so a report can only
-- ever point at predictions the server really made (unsaved ones are cleaned up after a day).
CREATE TABLE IF NOT EXISTS analyses (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at  timestamptz NOT NULL DEFAULT now(),
    filename    text NOT NULL,
    source      text NOT NULL,                 -- 'upload' or 'sample:<key>'
    original_w  integer NOT NULL,
    original_h  integer NOT NULL,
    frame_key    text,                          -- object storage: the 640 x 400 frame the models saw
    original_key text,                          -- object storage: the photo as taken
    priority    real NOT NULL,                 -- average of the models
    timings_ms  jsonb NOT NULL
);

-- One model's run on one analysis, with the fingerprint of the exact .joblib file used.
CREATE TABLE IF NOT EXISTS model_runs (
    analysis_id   uuid NOT NULL REFERENCES analyses (id) ON DELETE CASCADE,
    model         text NOT NULL,
    model_sha256  text NOT NULL,
    priority      real NOT NULL,
    predict_ms    real NOT NULL,
    PRIMARY KEY (analysis_id, model)
);

-- 40 rows per model run: what the model said about each square.
CREATE TABLE IF NOT EXISTS predictions (
    analysis_id  uuid NOT NULL,
    model        text NOT NULL,
    sq_row       smallint NOT NULL CHECK (sq_row BETWEEN 0 AND 4),
    sq_col       smallint NOT NULL CHECK (sq_col BETWEEN 0 AND 7),
    label        text NOT NULL CHECK (label IN ('D00', 'D10', 'D20', 'D40', 'none')),
    confidence   real NOT NULL,
    probs        real[] NOT NULL,              -- D00, D10, D20, D40, none
    PRIMARY KEY (analysis_id, model, sq_row, sq_col),
    FOREIGN KEY (analysis_id, model) REFERENCES model_runs (analysis_id, model) ON DELETE CASCADE
);

-- A saved record: an analysis plus where it is. Records are permanent (the API has no delete).
CREATE TABLE IF NOT EXISTS reports (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    number       integer GENERATED ALWAYS AS IDENTITY UNIQUE,   -- shown as RD-0001
    analysis_id  uuid NOT NULL UNIQUE REFERENCES analyses (id) ON DELETE CASCADE,
    created_at   timestamptz NOT NULL DEFAULT now(),
    location     text NOT NULL CHECK (length(location) BETWEEN 1 AND 200),
    notes        text NOT NULL DEFAULT '' CHECK (length(notes) <= 2000)
);

CREATE INDEX IF NOT EXISTS reports_created_at ON reports (created_at DESC);
CREATE INDEX IF NOT EXISTS analyses_created_at ON analyses (created_at);

-- A user's correction: the damage they drew on the frame. Kept as training data (ml/scripts/export_corrections.py).
CREATE TABLE IF NOT EXISTS corrections (
    analysis_id  uuid PRIMARY KEY REFERENCES analyses (id) ON DELETE CASCADE,
    updated_at   timestamptz NOT NULL DEFAULT now(),
    boxes        jsonb NOT NULL,      -- [{cls, xmin, ymin, xmax, ymax}] in frame pixels (640 x 400)
    labels       text[] NOT NULL      -- the 40 square labels those boxes give (training rule: 10% cover, worst wins)
);

-- Where the road is: the pin on the map (the location name is looked up from it).
ALTER TABLE reports ADD COLUMN IF NOT EXISTS lat double precision CHECK (lat BETWEEN -90 AND 90);
ALTER TABLE reports ADD COLUMN IF NOT EXISTS lng double precision CHECK (lng BETWEEN -180 AND 180);

-- Photos moved to object storage (app/storage.py): older databases get the key columns here, and
-- db.move_frames_to_storage() copies their frames out of Postgres, then drops frame_jpeg.
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS frame_key text;
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS original_key text;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'analyses' AND column_name = 'frame_jpeg') THEN
        ALTER TABLE analyses ALTER COLUMN frame_jpeg DROP NOT NULL;
    END IF;
END $$;
