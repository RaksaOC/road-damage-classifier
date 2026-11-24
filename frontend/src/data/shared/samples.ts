/* Sample photos are static files in public/samples/ (written by backend/ml/scripts/pick_samples.py),
   so both the API and the mock use them. */
import type { Sample } from "@/domain/sample";
import { ServiceError, type SampleCatalog } from "@/services/ports";

let cache: Promise<{ note: string; samples: Sample[] }> | null = null;

export const staticSamples: SampleCatalog = {
  list() {
    cache ??= fetch("/samples/samples.json")
      .then((r) => {
        if (!r.ok) throw new ServiceError("not_found", "The sample photos are missing (public/samples/samples.json).");
        return r.json();
      })
      .catch((e) => {
        cache = null; // try again next time
        throw e instanceof ServiceError ? e : new ServiceError("offline", "The sample photos couldn't be loaded.");
      });
    return cache;
  },
};
