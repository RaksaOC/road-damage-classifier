// Draws the synthetic road pictures for the onboarding tour. Class info lives in src/domain.
import { BY, CLASSES, RANK, type ClassInfo, type ClassKey } from "@/domain/damage";
import { CELL, COLS, H, ROWS, W } from "@/domain/frame";

export { BY, CELL, CLASSES, COLS, H, RANK, ROWS, W, type ClassInfo, type ClassKey };
export const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

export type Rng = () => number;
export function rng(seed: number): Rng {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Pt = [number, number];
function walk(r: Rng, x0: number, y0: number, x1: number, y1: number, n: number, j: number): Pt[] {
  const pts: Pt[] = []; let off = 0;
  const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy), nx = -dy / len, ny = dx / len;
  for (let i = 0; i <= n; i++) { const f = i / n; off += (r() - 0.5) * j; off *= 0.9; pts.push([x0 + dx * f + nx * off, y0 + dy * f + ny * off]); }
  return pts;
}

export type Damage =
  | { t: ClassKey; kind: "hole"; x: number; y: number; rad: number }
  | { t: ClassKey; kind: "crack"; pts: Pt[] }
  | { t: ClassKey; kind: "web"; x0: number; y0: number; x1: number; y1: number };
type Scene = { seed: number; base: string; paint: number; focus: [number, number]; build: (r: Rng) => Damage[] };

export const SCENES: Record<string, Scene> = {
  pothole: { seed: 11, base: "#56585a", paint: 0.7, focus: [5, 3], build: r => [
    { t: "D40", kind: "hole", x: 432, y: 262, rad: 50 },
    { t: "D40", kind: "hole", x: 148, y: 118, rad: 22 },
    { t: "D00", kind: "crack", pts: walk(r, 252, -10, 268, 410, 60, 7) },
  ] },
  cracked: { seed: 29, base: "#5b5c5d", paint: 0.6, focus: [5, 1], build: r => [
    { t: "D20", kind: "web", x0: 405, y0: 40, x1: 575, y1: 178 },
    { t: "D10", kind: "crack", pts: walk(r, 335, 300, 630, 286, 60, 7) },
    { t: "D00", kind: "crack", pts: walk(r, 188, -10, 206, 410, 60, 7) },
  ] },
  fresh: { seed: 5, base: "#3d3f42", paint: 1, focus: [1, 4], build: r => [
    { t: "D10", kind: "crack", pts: walk(r, 70, 350, 240, 338, 30, 6) },
  ] },
  /* extra sample roads for the app's sample photos and seeded reports */
  worn: { seed: 41, base: "#4f5153", paint: 0.45, focus: [2, 2], build: r => [
    { t: "D20", kind: "web", x0: 60, y0: 150, x1: 300, y1: 330 },
    { t: "D40", kind: "hole", x: 500, y: 110, rad: 30 },
    { t: "D10", kind: "crack", pts: walk(r, 330, 360, 630, 350, 50, 6) },
  ] },
  junction: { seed: 73, base: "#58595a", paint: 0.8, focus: [6, 2], build: r => [
    { t: "D00", kind: "crack", pts: walk(r, 470, -10, 488, 410, 60, 8) },
    { t: "D10", kind: "crack", pts: walk(r, -10, 210, 300, 196, 50, 7) },
  ] },
};

type G = CanvasRenderingContext2D;
function strokePts(g: G, pts: Pt[], w: number) {
  g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
  g.lineWidth = w; g.lineJoin = "round"; g.lineCap = "round"; g.stroke();
}
function drawHole(g: G, r: Rng, h: { x: number; y: number; rad: number }) {
  const n = 26, rad: number[] = []; for (let i = 0; i < n; i++) rad.push(h.rad * (0.82 + r() * 0.3));
  const path = (s: number) => {
    g.beginPath();
    for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI * 2, rr = rad[i % n] * s; const x = h.x + Math.cos(a) * rr * 1.25, y = h.y + Math.sin(a) * rr * 0.9; if (i) g.lineTo(x, y); else g.moveTo(x, y); }
    g.closePath();
  };
  path(1.14); g.fillStyle = "rgba(122,119,112,.55)"; g.fill();
  path(1); const gr = g.createRadialGradient(h.x, h.y + h.rad * 0.25, 2, h.x, h.y, h.rad * 1.3); gr.addColorStop(0, "#181715"); gr.addColorStop(1, "#383631"); g.fillStyle = gr; g.fill();
  g.save(); path(1); g.clip();
  g.fillStyle = "rgba(0,0,0,.38)"; g.beginPath(); g.ellipse(h.x, h.y - h.rad * 0.6, h.rad * 1.4, h.rad * 0.55, 0, 0, Math.PI * 2); g.fill();
  for (let i = 0; i < h.rad * 1.6; i++) { const v = (140 + r() * 70) | 0; g.fillStyle = `rgba(${v},${v - 6},${v - 14},.75)`; g.fillRect(h.x + (r() - 0.5) * h.rad * 2.2, h.y + (r() - 0.5) * h.rad * 1.5, 1 + r() * 3, 1 + r() * 2); }
  g.restore();
}
function drawCrack(g: G, r: Rng, pts: Pt[]) {
  g.strokeStyle = "rgba(160,158,150,.45)"; strokePts(g, pts.map(p => [p[0] + 1.2, p[1] + 1.2] as Pt), 3.4);
  g.strokeStyle = "#141413"; strokePts(g, pts, 2.3);
  for (let b = 0; b < 7; b++) {
    const p = pts[(r() * pts.length) | 0], ang = r() * Math.PI * 2, br: Pt[] = [p]; let x = p[0], y = p[1];
    for (let k = 0; k < 7; k++) { x += Math.cos(ang + (r() - 0.5)) * 5; y += Math.sin(ang + (r() - 0.5)) * 5; br.push([x, y]); }
    g.strokeStyle = "#1b1b1a"; strokePts(g, br, 1.2);
  }
}
function drawWeb(g: G, r: Rng, w: { x0: number; y0: number; x1: number; y1: number }) {
  g.fillStyle = "rgba(0,0,0,.14)"; g.fillRect(w.x0, w.y0, w.x1 - w.x0, w.y1 - w.y0);
  const s = 20, pts: Pt[][] = [];
  for (let y = w.y0; y <= w.y1; y += s) { const row: Pt[] = []; for (let x = w.x0; x <= w.x1; x += s) row.push([x + (r() - 0.5) * 12, y + (r() - 0.5) * 12]); pts.push(row); }
  g.strokeStyle = "#161615";
  for (let i = 0; i < pts.length; i++) for (let j = 0; j < pts[i].length; j++) {
    const p = pts[i][j];
    if (j + 1 < pts[i].length && r() > 0.1) strokePts(g, [p, pts[i][j + 1]], 1.7);
    if (i + 1 < pts.length && r() > 0.1) strokePts(g, [p, pts[i + 1][j]], 1.7);
  }
}
function drawRoad(S: Scene, dmg: Damage[], r: Rng): HTMLCanvasElement {
  const c = document.createElement("canvas"); c.width = W; c.height = H; const g = c.getContext("2d")!;
  g.fillStyle = S.base; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 16; i++) {
    const x = r() * W, y = r() * H, rad = 60 + r() * 170, gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, r() < 0.5 ? "rgba(255,255,255,.05)" : "rgba(0,0,0,.09)"); gr.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
  }
  g.globalAlpha = S.paint;
  g.fillStyle = "#dcd8cc"; g.fillRect(24, 0, 8, H); g.fillRect(608, 0, 8, H);
  g.fillStyle = "#d9b23b"; for (let y = -20; y < H; y += 100) g.fillRect(316, y, 9, 56);
  g.globalAlpha = 1;
  for (const d of dmg) { if (d.kind === "hole") drawHole(g, r, d); else if (d.kind === "web") drawWeb(g, r, d); else drawCrack(g, r, d.pts); }
  const id = g.getImageData(0, 0, W, H), px = id.data;
  for (let i = 0; i < px.length; i += 4) {
    const n = (r() - 0.5) * 34, s = r() < 0.012 ? 40 + r() * 45 : 0;
    px[i] += n + s; px[i + 1] += n + s; px[i + 2] += n + s * 0.95;
  }
  g.putImageData(id, 0, 0);
  return c;
}

export function labelCells(dmg: Damage[]): ClassKey[][] {
  const cells: ClassKey[][] = Array.from({ length: ROWS }, () => Array<ClassKey>(COLS).fill("none"));
  const set = (c: number, r: number, t: ClassKey) => { if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return; if (RANK[t] > RANK[cells[r][c]]) cells[r][c] = t; };
  for (const d of dmg) {
    if (d.kind === "hole") {
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        const cx = clamp(d.x, c * CELL, (c + 1) * CELL), cy = clamp(d.y, r * CELL, (r + 1) * CELL);
        if (Math.hypot((cx - d.x) / 1.25, (cy - d.y) / 0.9) < d.rad * 0.75) set(c, r, d.t);
      }
    } else if (d.kind === "crack") {
      for (const p of d.pts) set(Math.floor(p[0] / CELL), Math.floor(p[1] / CELL), d.t);
    } else {
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        const ox = Math.max(0, Math.min(d.x1, (c + 1) * CELL) - Math.max(d.x0, c * CELL));
        const oy = Math.max(0, Math.min(d.y1, (r + 1) * CELL) - Math.max(d.y0, r * CELL));
        if (ox * oy > CELL * CELL * 0.25) set(c, r, d.t);
      }
    }
  }
  return cells;
}

export function scenePhoto(key: string) {
  const S = SCENES[key], r = rng(S.seed), dmg = S.build(r);
  return { S, dmg, photo: drawRoad(S, dmg, r) };
}

export const token = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
