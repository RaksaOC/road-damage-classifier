/* Browser-side photo handling. The server does the real crop + resize (backend/ml/photo.py); the browser
   makes the same 640 × 400 frame only to show the crop animation and the grid while the server works. */
import type { PhotoInput } from "@/domain/analysis";
import { H, W, cropTop } from "@/domain/frame";
import type { Sample } from "@/domain/sample";

export const ACCEPT = "image/jpeg,image/png,image/webp";
const MAX_MB = 10; // same limit as the backend (MAX_UPLOAD_MB)

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("This file couldn't be read as an image."));
    img.src = src;
  });
}

/** Keep the bottom 5/8, stretch to 640 × 400: the frame the models see. */
export function toFrame(img: HTMLImageElement | HTMLCanvasElement) {
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  g.imageSmoothingQuality = "high";
  const top = cropTop(img.height);
  g.drawImage(img, 0, top, img.width, img.height - top, 0, 0, W, H);
  return c;
}

/** Smaller copy of the original, only for showing it on screen. */
function preview(img: HTMLImageElement, max = 1280) {
  const s = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * s);
  c.height = Math.round(img.height * s);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.88);
}

/** Small JPEG of a frame (the mock stores these instead of uploading). */
export function thumbnail(frame: HTMLCanvasElement, width = 480) {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = Math.round((width * H) / W);
  c.getContext("2d")!.drawImage(frame, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.72);
}

/** A chosen photo: what goes to the AnalysisService, plus what the screen shows while it works. */
export interface PickedPhoto extends PhotoInput {
  name: string;
  src: string; // the 640 × 400 frame as an image URL
  original: string; // the photo as taken, for the crop animation
  size: { w: number; h: number };
  sample: Sample | null;
}

async function pick(blob: Blob, name: string, source: PhotoInput["source"], sample: Sample | null): Promise<PickedPhoto> {
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadImage(url);
    const frame = toFrame(img);
    return {
      file: blob, filename: name, source, frame, truth: null,
      name: sample ? "Sample road" : name, src: frame.toDataURL("image/jpeg", 0.88),
      original: preview(img), size: { w: img.width, h: img.height }, sample,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function pickFile(file: File) {
  if (!ACCEPT.split(",").includes(file.type)) throw new Error("Please choose a JPG, PNG or WebP photo.");
  if (file.size > MAX_MB * 1024 * 1024) throw new Error(`That photo is ${(file.size / 1e6).toFixed(1)} MB. The limit is ${MAX_MB} MB.`);
  return pick(file, file.name, "upload", null);
}

/** Downloads the raw sample photo; from here on it is handled exactly like a photo the user uploaded. */
export async function pickSample(s: Sample) {
  const res = await fetch(s.src);
  if (!res.ok) throw new Error("That sample photo couldn't be loaded.");
  return pick(await res.blob(), `${s.key}.jpg`, `sample:${s.key}`, s);
}
