"use client";

import { useRef, useState } from "react";
import ui from "@/components/ui/primitives/primitives.module.css";
import type { Sample } from "@/domain/sample";
import { useHealth, useSamples } from "@/hooks/useCatalog";
import { cx } from "@/lib/cx";
import { ACCEPT, pickFile, pickSample, type PickedPhoto } from "@/lib/photo";
import styles from "./PhotoPicker.module.css";

export type { PickedPhoto };

/** Drop zone + file chooser, with sample road photos from the test set underneath. */
export function PhotoPicker({ onPick }: { onPick: (p: PickedPhoto) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null); // "file" or a sample key
  const samples = useSamples();
  const health = useHealth();

  const open = async (what: string, load: () => Promise<PickedPhoto>) => {
    setError(null);
    setOpening(what);
    try {
      onPick(await load());
    } catch (e) {
      setError(e instanceof Error ? e.message : "That photo couldn't be opened.");
    } finally {
      setOpening(null);
    }
  };
  const openFile = (file: File | undefined) => file && open("file", () => pickFile(file));
  const openSample = (s: Sample) => open(s.key, () => pickSample(s));

  return (
    <div className={styles.wrap}>
      {health.status === "ready" && !health.data.ok && (
        <div className={styles.banner} role="alert">
          <span>
            <b>The analysis server isn&apos;t ready.</b> {health.data.message}
          </span>
          <button className={ui.textBtn} onClick={health.reload}>
            Check again
          </button>
        </div>
      )}

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
        disabled={!!opening}
        aria-busy={opening === "file"}
      >
        <span className={styles.icon} aria-hidden="true">
          {opening === "file" ? (
            <span className={styles.spin} />
          ) : (
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 16.5V18a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1.5" />
              <path d="M12 15V4m0 0L7.5 8.5M12 4l4.5 4.5" />
            </svg>
          )}
        </span>
        <strong>{opening === "file" ? "Opening the photo…" : drag ? "Drop the photo here" : "Add a photo of the road"}</strong>
        <span className={styles.hint}>Drag it in or click to choose · JPG, PNG or WebP up to 10 MB · taken from the driver&apos;s view works best</span>
        {error && <span className={styles.error}>{error}</span>}
      </button>
      <input ref={input} type="file" accept={ACCEPT} hidden onChange={(e) => (openFile(e.target.files?.[0]), (e.target.value = ""))} />

      <div className={styles.samples}>
        <span className={styles.label}>No photo handy? Try a sample road</span>
        {samples.status === "error" ? (
          <p className={styles.note}>
            {samples.error}{" "}
            <button className={ui.textBtn} onClick={samples.reload}>
              Try again
            </button>
          </p>
        ) : (
          <>
            <div className={styles.row}>
              {samples.status === "loading"
                ? Array.from({ length: 8 }, (_, i) => (
                    <span key={i} className={cx(styles.sample, styles.photoOnly, styles.loading)} aria-hidden="true">
                      <span className={styles.ph} />
                    </span>
                  ))
                : samples.data.samples.map((s, i) => (
                    <button
                      key={s.key}
                      type="button"
                      className={cx(styles.sample, styles.photoOnly)}
                      onClick={() => openSample(s)}
                      disabled={!!opening}
                      aria-busy={opening === s.key}
                      aria-label={`Sample road ${i + 1}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={s.src} alt="" loading="lazy" />
                      {opening === s.key && <span className={styles.opening}>Opening…</span>}
                    </button>
                  ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
