import type { ClassKey, Grid } from "./damage";
import type { ModelId } from "./model";

/** A ready-made road photo from the test set (picked by backend/ml/scripts/pick_samples.py). */
export interface Sample {
  key: string;
  label: string;
  imageId: string; // RDD2022 id, e.g. India_001251
  country: string;
  size: { w: number; h: number };
  src: string; // the photo as taken
  frame: string; // the 640 × 400 frame
  truth: Grid<ClassKey>; // the dataset's labels for the 40 squares
  correct: Record<ModelId, number>; // squares each model got right, of 40
}
