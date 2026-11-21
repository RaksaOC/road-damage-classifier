/* Image helpers. Every photo goes through the same crop + resize as the backend, into the 640 × 400 frame (8 × 5 squares of 80 px). */
import { H, W, scenePhoto } from "@/lib/roadKit";

export const SAMPLES = [
  { key: "pothole", label: "Potholes" },
  { key: "worn", label: "Worn lane" },
  { key: "cracked", label: "Cracked lane" },
  { key: "junction", label: "Junction" },
  { key: "fresh", label: "New asphalt" },
] as const;
export type SampleKey = (typeof SAMPLES)[number]["key"];

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("This file couldn't be read as an image."));
    img.src = src;
  });
}

/* Phase 6.1 rule, the same as backend/ml (config.CROP_KEEP, IMG_W, IMG_H):
   1. crop: drop the top 3/8 (sky, horizon), keep the bottom 5/8 where the road is
   2. resize: stretch what is left to exactly 640 × 400 */
export const CROP_KEEP = 5 / 8;
export const cropTop = (h: number) => h - Math.round(h * CROP_KEEP);

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

/** What the picker hands on: the photo as taken (for the crop animation) and the 640 × 400 frame the model sees. */
export interface Prepared {
  frame: HTMLCanvasElement;
  original: string;
  size: { w: number; h: number };
}

/** Smaller copy of the original, only for showing it on screen. */
function preview(img: HTMLImageElement | HTMLCanvasElement, max = 1280) {
  const s = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * s);
  c.height = Math.round(img.height * s);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.88);
}

const prepare = (img: HTMLImageElement | HTMLCanvasElement): Prepared => ({
  frame: toFrame(img),
  original: preview(img),
  size: { w: img.width, h: img.height },
});

export async function filePrepared(file: File) {
  if (!file.type.startsWith("image/")) throw new Error("Please choose an image file (JPG, PNG or HEIC).");
  const url = URL.createObjectURL(file);
  try {
    return prepare(await loadImage(url));
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** The sample road as the 640 × 400 frame (thumbnails, seeded reports). */
export function sampleFrame(key: SampleKey) {
  return scenePhoto(key).photo;
}

/** The sample road "as taken": a 640 × 640 square like the RDD photos, with sky on the top 3/8.
    Cropping and resizing it gives back exactly the sample frame. */
export function samplePrepared(key: SampleKey): Prepared {
  const road = sampleFrame(key);
  const c = document.createElement("canvas");
  c.width = W;
  c.height = W;
  const g = c.getContext("2d")!;
  const top = cropTop(W); // 240
  const sky = g.createLinearGradient(0, 0, 0, top);
  sky.addColorStop(0, "#8fb0c9");
  sky.addColorStop(1, "#dfe7ec");
  g.fillStyle = sky;
  g.fillRect(0, 0, W, top);
  g.fillStyle = "#56645a"; // far trees along the horizon
  for (let x = -20; x < W + 20; x += 34) {
    g.beginPath();
    g.ellipse(x, top - 6, 26, 18 + ((x * 7) % 13), 0, Math.PI, 0);
    g.fill();
  }
  g.fillRect(0, top - 8, W, 8);
  g.drawImage(road, 0, top);
  return prepare(c);
}

/** Small JPEG for storing in the report history. */
export function thumbnail(frame: HTMLCanvasElement, width = 480) {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = Math.round((width * H) / W);
  c.getContext("2d")!.drawImage(frame, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.72);
}
