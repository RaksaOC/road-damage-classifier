/** A ready-made road photo: a raw file from the RDD2022 dataset in public/samples/ (see src/data/shared/samples.ts).
 *  Choosing one sends it exactly like a photo the user uploads. */
export interface Sample {
  key: string; // the dataset image id, e.g. India_001251
  src: string; // the photo as taken
}
