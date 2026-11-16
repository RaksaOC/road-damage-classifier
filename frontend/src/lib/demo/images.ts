/* Image helpers. Everything is cropped to the model's 640 × 400 frame (8 × 5 squares of 80 px). */
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

/** Draws the image into the 640 × 400 frame, cropping to fill (like object-fit: cover). */
export function toFrame(img: HTMLImageElement | HTMLCanvasElement) {
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  const iw = img.width, ih = img.height;
  const s = Math.max(W / iw, H / ih);
  g.drawImage(img, (W - iw * s) / 2, (H - ih * s) / 2, iw * s, ih * s);
  return c;
}

export async function fileToFrame(file: File) {
  if (!file.type.startsWith("image/")) throw new Error("Please choose an image file (JPG, PNG or HEIC).");
  const url = URL.createObjectURL(file);
  try {
    return toFrame(await loadImage(url));
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function sampleFrame(key: SampleKey) {
  return scenePhoto(key).photo;
}

/** Small JPEG for storing in the report history. */
export function thumbnail(frame: HTMLCanvasElement, width = 480) {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = Math.round((width * H) / W);
  c.getContext("2d")!.drawImage(frame, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.72);
}
