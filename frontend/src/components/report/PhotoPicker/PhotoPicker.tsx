"use client";

import { useEffect, useRef, useState } from "react";
import { cx } from "@/lib/cx";
import { SAMPLES, filePrepared, sampleFrame, samplePrepared, type Prepared, type SampleKey } from "@/lib/demo/images";
import styles from "./PhotoPicker.module.css";

/** frame/src: the 640 × 400 frame the model sees. original/size: the photo as taken, for the crop animation. */
export interface PickedPhoto extends Prepared {
  src: string;
  sample: SampleKey | null;
  name: string;
}

/** Drop zone + file chooser, with sample road photos underneath. */
export function PhotoPicker({ onPick }: { onPick: (p: PickedPhoto) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [thumbs, setThumbs] = useState<Partial<Record<SampleKey, string>>>({});

  useEffect(() => {
    // drawn in the browser: the sample roads are generated on a canvas
    setThumbs(Object.fromEntries(SAMPLES.map((s) => [s.key, sampleFrame(s.key).toDataURL("image/jpeg", 0.7)])));
  }, []);

  const openFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      const p = await filePrepared(file);
      onPick({ ...p, src: p.frame.toDataURL("image/jpeg", 0.88), sample: null, name: file.name });
    } catch (e) {
      setError(e instanceof Error ? e.message : "That file couldn't be opened.");
    }
  };

  const pickSample = (key: SampleKey, label: string) => {
    const p = samplePrepared(key);
    onPick({ ...p, src: p.frame.toDataURL("image/jpeg", 0.88), sample: key, name: `Sample: ${label}` });
  };

  return (
    <div className={styles.wrap}>
      <button
        type="button"
        className={cx(styles.drop, drag && styles.drag, error && styles.bad)}
        onClick={() => input.current?.click()}
        onDragOver={(e) => (e.preventDefault(), setDrag(true))}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          openFile(e.dataTransfer.files[0]);
        }}
      >
        <span className={styles.icon} aria-hidden="true">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 16.5V18a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1.5" />
            <path d="M12 15V4m0 0L7.5 8.5M12 4l4.5 4.5" />
          </svg>
        </span>
        <strong>{drag ? "Drop the photo here" : "Add a photo of the road"}</strong>
        <span className={styles.hint}>Drag it in or click to choose · JPG, PNG or HEIC · taken from the driver's view works best</span>
        {error && <span className={styles.error}>{error}</span>}
      </button>
      <input ref={input} type="file" accept="image/*" hidden onChange={(e) => (openFile(e.target.files?.[0]), (e.target.value = ""))} />

      <div className={styles.samples}>
        <span className={styles.label}>No photo handy? Try a sample road</span>
        <div className={styles.row}>
          {SAMPLES.map((s) => (
            <button key={s.key} type="button" className={styles.sample} onClick={() => pickSample(s.key, s.label)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {thumbs[s.key] ? <img src={thumbs[s.key]} alt="" /> : <span className={styles.ph} />}
              <span>{s.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
