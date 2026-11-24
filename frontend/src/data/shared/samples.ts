/* Sample photos are raw dataset files in public/samples/ (copied by backend/ml/scripts/pick_samples.py):
   no manifest, no precomputed frames. Picking one sends it like any upload. Both the API and the mock use them. */
import type { Sample } from "@/domain/sample";
import type { SampleCatalog } from "@/services/ports";

// RDD2022 image ids: the first five are test photos the models do well on, then one more road per country
const IDS = ["India_001251", "Japan_010413", "Czech_001216", "Czech_002795", "Japan_002991", "Czech_001512", "India_005619", "Japan_000613"];

export const SAMPLES: Sample[] = IDS.map((key) => ({ key, src: `/samples/${key}.jpg` }));

export const staticSamples: SampleCatalog = {
  list: async () => ({ samples: SAMPLES }),
};
