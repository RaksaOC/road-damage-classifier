/* The frame every model sees (Phase 6.1, backend/ml/photo.py): keep the bottom 5/8, resize to 640 × 400, cut 8 × 5 squares of 80 px. */
export const W = 640, H = 400, CELL = 80, COLS = 8, ROWS = 5;
export const SQUARES = COLS * ROWS;
export const CROP_KEEP = 5 / 8;
/** The row where the crop starts. */
export const cropTop = (h: number) => h - Math.round(h * CROP_KEEP);
