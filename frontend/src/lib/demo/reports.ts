"use client";

/* Report history for the demo, kept in this browser's localStorage. The first visit is seeded
   with a few sample reports so the Reports page has something to show. */
import { useSyncExternalStore } from "react";
import type { ClassKey } from "@/lib/roadKit";
import { averagePriority, classifyAll, type Results } from "./classify";
import { sampleFrame, thumbnail, type SampleKey } from "./images";
import type { ModelId } from "./models";

/** One model's verdict on the photo. */
export interface ModelResult {
  cells: ClassKey[][];
  confidence: number[][];
  priority: number;
}


export interface Report {
  id: string;
  number: number;
  createdAt: string; // ISO
  location: string;
  notes: string;
  thumb: string; // JPEG data URL, 480 × 300
  results: Record<ModelId, ModelResult>; // all three models
  priority: number; // average of the three
}

const KEY = "rdc-reports-v3";
let cache: Report[] | null = null;
const listeners = new Set<() => void>();

/* 24 made-up past reports, so the history has something to scroll through. */
const PLACES: [string, string][] = [
  ["Russian Blvd, near the airport roundabout", "Two potholes in the right lane. Motorbikes swerving."],
  ["Street 271, Tuol Kork", "Surface breaking up after the rains."],
  ["Norodom Blvd at Street 240", ""],
  ["Monivong Blvd and Street 2004", "Cracks across the junction."],
  ["Sisowath Quay, river side", "Resurfaced last year. Routine check."],
  ["Mao Tse Toung Blvd, Boeung Keng Kang", "Long crack along the lane marking."],
  ["National Road 1, km 6", "Heavy trucks. Edge of the lane is crumbling."],
  ["Street 63 near Psar Thmei", ""],
  ["Hun Sen Blvd, Chbar Ampov", "Water pools here after rain."],
  ["Street 2011, Toul Sangke", "Reported by a delivery rider."],
  ["Kampuchea Krom Blvd at Street 163", ""],
  ["Preah Sihanouk Blvd, outside the school", "Kids cross here. Please check soon."],
  ["Veng Sreng Blvd, factory gate", "Many trucks every morning."],
  ["Street 51, Daun Penh", ""],
  ["Chroy Changvar bridge approach", "Joint between bridge and road is cracked."],
  ["Street 598, Russey Keo", ""],
  ["Neak Banh Teuk Park, east side", "Small cracks only."],
  ["Street 310, Boeung Keng Kang 1", ""],
  ["National Road 4, km 12", "Shoulder sinking near the culvert."],
  ["Street 13, near the Royal Palace", "Tourist area. Looks fine."],
  ["Ou Baek K'am roundabout", ""],
  ["Street 371, Stueng Mean Chey", "Patched last month, cracking again."],
  ["Kim Il Sung Blvd, Toul Kork", ""],
  ["Street 154, Psar Kandal", "Gutter edge broken."],
];
const SAMPLE_CYCLE: SampleKey[] = ["pothole", "worn", "cracked", "junction", "fresh"];

function seed(): Report[] {
  const frames = Object.fromEntries(SAMPLE_CYCLE.map((k) => [k, sampleFrame(k)])) as Record<SampleKey, HTMLCanvasElement>;
  const thumbs = Object.fromEntries(SAMPLE_CYCLE.map((k) => [k, thumbnail(frames[k])])) as Record<SampleKey, string>;
  let days = 0;
  return PLACES.map(([location, notes], i) => {
    const sample = SAMPLE_CYCLE[i % SAMPLE_CYCLE.length];
    const res = classifyAll(frames[sample], sample);
    days += i === 0 ? 1 : 1 + (i % 4);
    return {
      id: `seed-${i}`,
      number: PLACES.length - i,
      createdAt: new Date(Date.now() - days * 864e5 - i * 37e5).toISOString(),
      location,
      notes,
      thumb: thumbs[sample],
      results: toResults(res),
      priority: averagePriority(res),
    };
  });
}

/** Keeps only what a saved report needs from each model's analysis. */
export function toResults(res: Results): Record<ModelId, ModelResult> {
  const pick = (m: ModelId) => ({ cells: res[m].cells, confidence: res[m].confidence, priority: res[m].priority });
  return { mlp: pick("mlp"), svm: pick("svm"), softmax: pick("softmax") };
}

function read(): Report[] {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    cache = raw ? (JSON.parse(raw) as Report[]) : null;
  } catch {
    cache = null;
  }
  if (!cache) {
    cache = seed();
    write(cache);
  }
  return cache;
}

function write(list: Report[]) {
  cache = list;
  // drop the oldest reports if the browser's storage is full
  for (let keep = list.length; keep > 0; keep--) {
    try {
      localStorage.setItem(KEY, JSON.stringify(list.slice(0, keep)));
      break;
    } catch {}
  }
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => (listeners.add(l), () => listeners.delete(l));
const EMPTY: Report[] = [];

/** All reports, newest first. Empty during server rendering. */
export function useReports() {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

export function addReport(r: Omit<Report, "id" | "number" | "createdAt">): Report {
  const list = read();
  const report: Report = {
    ...r,
    id: crypto.randomUUID(),
    number: Math.max(0, ...list.map((x) => x.number)) + 1,
    createdAt: new Date().toISOString(),
  };
  write([report, ...list]);
  return report;
}

export const deleteReport = (id: string) => write(read().filter((r) => r.id !== id));

export const reportCode = (n: number) => `RD-${String(n).padStart(4, "0")}`;
