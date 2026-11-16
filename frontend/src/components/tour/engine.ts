// Tour engine: animates photo → square → numbers → model → map on the canvases inside the tour.
// mountTour() runs while the tour is open and returns a cleanup function.
import { BY, CELL, CLASSES, COLS, H, ROWS, W, clamp, labelCells, rng, scenePhoto, token, type ClassKey } from "@/lib/roadKit";

export const STAGES = [
  { name: "Photo", d: 1200, txt: "A phone or dashcam photo of the road comes in." },
  { name: "Grid", d: 1300, txt: "The photo is cut into an 8 × 5 grid of squares. Each square is checked on its own." },
  { name: "Crop", d: 1200, txt: "Take one square: 80 × 80 colour pixels." },
  { name: "Grayscale", d: 1100, txt: "Drop the colour. Cracks and holes stay as dark shapes." },
  { name: "Resize", d: 1400, txt: "Shrink to 32 × 32, so every square becomes the same 1,024 numbers." },
  { name: "Features", d: 2500, txt: "Flatten the 1,024 numbers, compress them with PCA, and add 5 measurements we compute ourselves." },
  { name: "Classify", d: 2000, txt: "Softmax regression, an SVM and a neural network each pick one of 5 classes." },
  { name: "Map", d: 3400, txt: "Every square gets a class. The damage adds up to a repair priority for the road." },
];
const HOLD = 1100;
const ease = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : 1 - Math.pow(1 - x, 3));
const pct = (v: number) => Math.round(v * 100) + "%";
type Probs = Record<ClassKey, number>;

function probsFor(t: ClassKey, r: () => number): Probs {
  const p = {} as Probs, top = t === "none" ? 0.82 + r() * 0.14 : 0.72 + r() * 0.22;
  const others = CLASSES.map(c => c.k).filter(k => k !== t), ws = others.map(() => r() + 0.15), sw = ws.reduce((a, b) => a + b, 0);
  others.forEach((k, i) => (p[k] = ((1 - top) * ws[i]) / sw)); p[t] = top; return p;
}

function buildScene(key: string) {
  const { S, dmg, photo } = scenePhoto(key), cells = labelCells(dmg);
  const pr = rng(S.seed + 99), probs = cells.map(row => row.map(t => probsFor(t, pr)));
  const [fc, fr] = S.focus;
  const colorP = document.createElement("canvas"); colorP.width = colorP.height = CELL;
  colorP.getContext("2d")!.drawImage(photo, fc * CELL, fr * CELL, CELL, CELL, 0, 0, CELL, CELL);
  const grayP = document.createElement("canvas"); grayP.width = grayP.height = CELL;
  const gg = grayP.getContext("2d")!; gg.drawImage(colorP, 0, 0);
  const gd = gg.getImageData(0, 0, CELL, CELL);
  for (let i = 0; i < gd.data.length; i += 4) { const y = 0.299 * gd.data[i] + 0.587 * gd.data[i + 1] + 0.114 * gd.data[i + 2]; gd.data[i] = gd.data[i + 1] = gd.data[i + 2] = y; }
  gg.putImageData(gd, 0, 0);
  const small: Record<number, HTMLCanvasElement> = {};
  for (const res of [64, 48, 40, 32]) {
    const c = document.createElement("canvas"); c.width = c.height = res; const g = c.getContext("2d")!;
    g.imageSmoothingQuality = "high"; g.drawImage(grayP, 0, 0, res, res); small[res] = c;
  }
  const sd = small[32].getContext("2d")!.getImageData(0, 0, 32, 32).data, px = new Float32Array(1024);
  for (let i = 0; i < 1024; i++) px[i] = sd[i * 4] / 255;
  let mean = 0; for (const v of px) mean += v; mean /= 1024;
  let vr = 0; for (const v of px) vr += (v - mean) ** 2; const std = Math.sqrt(vr / 1024);
  let gx = 0, gy = 0, dark = 0;
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const v = px[y * 32 + x]; if (v < 0.2) dark++;
    if (x < 31) gx += Math.abs(px[y * 32 + x + 1] - v);
    if (y < 31) gy += Math.abs(px[(y + 1) * 32 + x] - v);
  }
  gx /= 992; gy /= 992;
  const ratio = gx / Math.max(gy, 1e-6);
  const dir = ratio > 1.2 ? "vertical lines" : ratio < 0.83 ? "horizontal lines" : "no main direction";
  // low-frequency patterns of the square, standing in for what PCA keeps
  const pairs: [number, number][] = []; for (let s = 1; pairs.length < 20; s++) for (let u = 0; u <= s && pairs.length < 20; u++) pairs.push([u, s - u]);
  const comps = pairs.map(([u, v]) => { let s = 0; for (let y = 0; y < 32; y++) { const cy = Math.cos(((2 * y + 1) * v * Math.PI) / 64); for (let x = 0; x < 32; x++) s += (px[y * 32 + x] - mean) * Math.cos(((2 * x + 1) * u * Math.PI) / 64) * cy; } return s; });
  const cmax = Math.max(...comps.map(Math.abs), 1e-6);
  const fTrue = cells[fr][fc], fp = probs[fr][fc];
  const swap: Partial<Record<ClassKey, ClassKey>> = { D00: "D10", D10: "D00" };
  const models = [
    { n: "Softmax regression", sub: "baseline", guess: swap[fTrue] ?? fTrue, conf: swap[fTrue] ? 0.46 : clamp(fp[fTrue] - 0.18, 0.4, 0.9) },
    { n: "SVM (RBF kernel)", sub: "best on this square", guess: fTrue, conf: fp[fTrue] },
    { n: "Neural network (MLP)", sub: "2 hidden layers", guess: fTrue, conf: clamp(fp[fTrue] - 0.06, 0.4, 0.97) },
  ];
  let Ssum = 0; const counts: Partial<Record<ClassKey, number>> = {};
  cells.forEach((row, r) => row.forEach((t, c) => { if (t !== "none") { Ssum += BY[t].w * probs[r][c][t]; counts[t] = (counts[t] ?? 0) + 1; } }));
  return { photo, cells, focus: S.focus, colorP, grayP, small, px, comps, cmax,
    hand: { mean, std, edge: gx + gy, dark: dark / 1024, dir }, models, fTrue, fp, score: 10 * (1 - Math.exp(-Ssum / 6)), counts };
}

export function mountTour(root: HTMLElement, onClose: () => void, sceneKey = "pothole"): () => void {
  const q = <T extends HTMLElement = HTMLElement>(id: string) => root.querySelector<T>("#" + id)!;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const dialog = q("tourDialog");
  const view = q<HTMLCanvasElement>("t-view").getContext("2d")!;
  const patch = q<HTMLCanvasElement>("t-patch").getContext("2d")!;
  const feat = q<HTMLCanvasElement>("t-feat").getContext("2d")!;
  const scene = buildScene(sceneKey);
  const T: Record<string, string> = {};
  let step = 0, lt = 0, auto = !reduce, last = 0, dirty = true, holdT = 0, raf = 0, alive = true;

  const readTokens = () => {
    for (const k of ["--ink", "--muted", "--line", "--accent", "--surface-2"]) T[k] = token(k);
    for (const c of CLASSES) T[c.v] = token(c.v);
    dirty = true;
  };
  const setText = (id: string, v: string) => { const el = q(id); if (el.textContent !== v) el.textContent = v; };
  const setHTML = (id: string, v: string) => { const el = q(id); if (el.dataset.h !== v) { el.innerHTML = v; el.dataset.h = v; } };

  // static parts
  q("t-legend").innerHTML = CLASSES.map(c => `<span><i class="sw" style="background:var(${c.v})"></i>${c.n}</span>`).join("");
  q("t-probs").innerHTML = `<span class="hint">SVM class probabilities for this square</span>` + CLASSES.map(c =>
    `<div class="r"><span>${c.n}</span><span class="bar"><i class="fillbar" id="tpf-${c.k}" style="background:var(${c.v})"></i></span><span class="v" id="tpv-${c.k}">–</span></div>`).join("");
  q("t-models").innerHTML = [0, 1, 2].map(i => `<li id="tm-${i}"><span class="mn" id="tmn-${i}"></span><span class="mc" id="tmc-${i}">–</span><span class="mg" id="tmg-${i}"></span></li>`).join("");
  const rail = q("t-rail"); rail.innerHTML = "";
  const railBtns = STAGES.map((s, i) => {
    const b = document.createElement("button"); b.type = "button"; b.setAttribute("aria-label", `Step ${i + 1}: ${s.name}`);
    b.innerHTML = "<span><i></i></span>"; b.addEventListener("click", () => { setAuto(false); go(i); }); rail.appendChild(b); return b;
  });

  function drawView(s: number, p: number) {
    const g = view, [fc, fr] = scene.focus;
    g.drawImage(scene.photo, 0, 0);
    if (s === 0) {
      g.fillStyle = `rgba(255,255,255,${(1 - ease(p * 1.4)) * 0.92})`; g.fillRect(0, 0, W, H);
      g.strokeStyle = `rgba(255,255,255,${ease(p)})`; g.lineWidth = 3; const m = 18, L = 34;
      for (const [x, y, sx, sy] of [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]]) { g.beginPath(); g.moveTo(x, y + sy * L); g.lineTo(x, y); g.lineTo(x + sx * L, y); g.stroke(); }
      return;
    }
    const gp = s === 1 ? ease(p) : 1;
    if (s >= 2 && s < 7) { g.fillStyle = "rgba(10,10,10,.42)"; g.beginPath(); g.rect(0, 0, W, H); g.rect(fc * CELL + CELL, fr * CELL, -CELL, CELL); g.fill("evenodd"); }
    g.strokeStyle = "rgba(255,255,255,.5)"; g.lineWidth = 1;
    for (let i = 1; i < COLS; i++) { g.beginPath(); g.moveTo(i * CELL + 0.5, 0); g.lineTo(i * CELL + 0.5, H * gp); g.stroke(); }
    for (let j = 1; j < ROWS; j++) { g.beginPath(); g.moveTo(0, j * CELL + 0.5); g.lineTo(W * gp, j * CELL + 0.5); g.stroke(); }
    if (s === 7) {
      const shown = Math.floor(ease(p / 0.7) * COLS * ROWS + 0.001); let k = 0;
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++, k++) {
        if (k >= shown) continue;
        const cls = scene.cells[r][c]; if (cls === "none") continue;
        const col = T[BY[cls].v] || "#f00";
        g.globalAlpha = 0.42; g.fillStyle = col; g.fillRect(c * CELL, r * CELL, CELL, CELL);
        g.globalAlpha = 1; g.strokeStyle = col; g.lineWidth = 2.5; g.strokeRect(c * CELL + 2, r * CELL + 2, CELL - 4, CELL - 4);
        g.fillStyle = "rgba(0,0,0,.6)"; g.fillRect(c * CELL + 4, r * CELL + 4, 36, 16);
        g.fillStyle = "#fff"; g.font = "500 11px ui-monospace, monospace"; g.textBaseline = "middle"; g.fillText(cls, c * CELL + 8, r * CELL + 12.5);
      }
    }
    g.globalAlpha = s === 1 ? (0.5 + 0.5 * Math.sin(p * Math.PI * 4)) * gp : 1;
    g.strokeStyle = T["--accent"] || "#ff7759"; g.lineWidth = 4; g.strokeRect(fc * CELL + 2, fr * CELL + 2, CELL - 4, CELL - 4); g.globalAlpha = 1;
  }

  function drawPatch(s: number, p: number) {
    const g = patch, Z = 240; let cap: string;
    g.clearRect(0, 0, Z, Z); g.fillStyle = T["--surface-2"] || "#ddd"; g.fillRect(0, 0, Z, Z);
    if (s < 2) {
      g.strokeStyle = T["--line"]; g.setLineDash([6, 6]); g.lineWidth = 2; g.strokeRect(30, 30, 180, 180); g.setLineDash([]);
      g.fillStyle = T["--muted"]; g.font = "15px system-ui, sans-serif"; g.textAlign = "center"; g.fillText("Waiting for a square", Z / 2, Z / 2 + 5); g.textAlign = "left";
      cap = "One square of the photo appears here.";
    } else if (s === 2) {
      const w = Z * (0.33 + 0.67 * ease(p)); g.imageSmoothingEnabled = true; g.drawImage(scene.colorP, (Z - w) / 2, (Z - w) / 2, w, w); cap = "80 × 80 colour pixels";
    } else if (s === 3) {
      g.imageSmoothingEnabled = true; g.drawImage(scene.colorP, 0, 0, Z, Z); g.globalAlpha = ease(p); g.drawImage(scene.grayP, 0, 0, Z, Z); g.globalAlpha = 1;
      cap = "Grayscale: one brightness number per pixel";
    } else {
      const steps = [64, 48, 40, 32], res = s === 4 ? steps[Math.min(3, Math.floor(p * 4))] : 32;
      g.imageSmoothingEnabled = false; g.drawImage(scene.small[res], 0, 0, Z, Z); g.imageSmoothingEnabled = true;
      if (res === 32) { g.strokeStyle = "rgba(0,0,0,.18)"; g.lineWidth = 1; for (let i = 1; i < 32; i++) { const v = Math.round((i * Z) / 32) + 0.5; g.beginPath(); g.moveTo(v, 0); g.lineTo(v, Z); g.moveTo(0, v); g.lineTo(Z, v); g.stroke(); } }
      cap = res === 32 ? "32 × 32 = 1,024 numbers, each 0 (black) to 1 (white)" : `Shrinking… ${res} × ${res}`;
    }
    setText("t-patchCap", cap);
  }

  function drawFeat(s: number, p: number) {
    const g = feat, FW = 640, FH = 280;
    g.clearRect(0, 0, FW, FH); g.font = "22px system-ui, sans-serif"; g.textBaseline = "alphabetic";
    if (s < 5) { g.fillStyle = T["--muted"]; g.textAlign = "center"; g.fillText("Numbers appear here after the resize", FW / 2, FH / 2); g.textAlign = "left"; return; }
    const p1 = s === 5 ? clamp(p / 0.45, 0, 1) : 1, p2 = s === 5 ? clamp((p - 0.5) / 0.5, 0, 1) : 1, stripA = s === 5 ? 1 - ease(p2) : 0;
    if (stripA > 0.01) {
      const n = Math.floor(ease(p1) * 1024), cw = 600 / 256; g.globalAlpha = stripA;
      for (let i = 0; i < n; i++) { const row = Math.floor(i / 256), col = i % 256, v = Math.round(scene.px[i] * 255); g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(20 + col * cw, 46 + row * 46, Math.ceil(cw), 34); }
      g.fillStyle = T["--ink"]; g.fillText("1,024 pixel values in one row", 20, 30); g.globalAlpha = 1;
    }
    if (p2 > 0) {
      const a = ease(p2), base = 160, bw = 22, gap = 8.5; g.globalAlpha = a;
      g.fillStyle = T["--ink"]; g.fillText("Compressed by PCA: 50 numbers (first 20 shown)", 20, 30);
      g.strokeStyle = T["--line"]; g.lineWidth = 2; g.beginPath(); g.moveTo(16, base); g.lineTo(624, base); g.stroke();
      g.fillStyle = T["--accent"];
      scene.comps.forEach((v, i) => { const h = (v / scene.cmax) * 95 * a, x = 22 + i * (bw + gap); if (h >= 0) g.fillRect(x, base - h, bw, h); else g.fillRect(x, base, bw, -h); });
      g.fillStyle = T["--muted"]; g.font = "18px ui-monospace, monospace";
      g.fillText("PC1", 18, FH - 8); g.textAlign = "right"; g.fillText("PC20", 622, FH - 8); g.textAlign = "left"; g.globalAlpha = 1;
    }
  }

  function updatePanels(s: number, p: number) {
    const on = s > 5 || (s === 5 && p > 0.55), h = scene.hand;
    const rows: [string, string][] = [["Brightness", h.mean.toFixed(2)], ["Contrast", h.std.toFixed(2)], ["Edge strength", h.edge.toFixed(2)], ["Dark area", pct(h.dark)], ["Edge direction", h.dir]];
    setHTML("t-hand", rows.map(([k, v]) => `<dt>${k}</dt><dd>${on ? v : "–"}</dd>`).join(""));

    const active = s === 6 ? Math.min(2, Math.floor(p * 3.2)) : -1;
    scene.models.forEach((m, i) => {
      const shown = s > 6 || (s === 6 && i <= active);
      q("tm-" + i).classList.toggle("act", i === active);
      setText("tmn-" + i, m.n); setText("tmc-" + i, shown ? pct(m.conf) : "–");
      setText("tmg-" + i, shown ? `Guess: ${BY[m.guess].n} · ${m.sub}` : m.sub);
    });
    const k = s > 6 ? 1 : s === 6 ? ease(clamp((p - 0.3) / 0.6, 0, 1)) : 0;
    for (const c of CLASSES) {
      const v = scene.fp[c.k]; q("tpf-" + c.k).style.width = (v * 100 * k).toFixed(1) + "%";
      setText("tpv-" + c.k, k > 0 ? pct(v * k) : "–");
    }

    if (s !== 7) {
      setText("t-rLabel", "—"); setText("t-rConf", "Waiting for the model"); setText("t-rScore", "–"); setText("t-rAction", " ");
      q("t-rFill").style.width = "0%"; setHTML("t-rCounts", "");
    } else {
      const r = ease(clamp((p - 0.35) / 0.55, 0, 1));
      setText("t-rLabel", BY[scene.fTrue].n);
      setText("t-rConf", `Highlighted square: ${scene.fTrue} · ${pct(scene.fp[scene.fTrue])} (SVM)`);
      const sc = scene.score * r; setText("t-rScore", sc.toFixed(1) + " / 10"); q("t-rFill").style.width = (sc * 10).toFixed(1) + "%";
      setText("t-rAction", r < 1 ? " " : scene.score >= 7 ? "Repair within 1 week" : scene.score >= 4 ? "Schedule repair this month" : "Monitor; no repair needed yet");
      setHTML("t-rCounts", CLASSES.filter(c => scene.counts[c.k]).map(c => `<span class="pill"><i class="sw" style="background:var(${c.v})"></i>${scene.counts[c.k]} × ${c.n}</span>`).join(""));
    }
  }

  const PANEL = ["tp-photo", "tp-photo", "tp-patch", "tp-patch", "tp-patch", "tp-feat", "tp-model", "tp-result"];
  function render() {
    const s = step, p = clamp(lt / STAGES[s].d, 0, 1);
    drawView(s, p); drawPatch(s, p); drawFeat(s, p); updatePanels(s, p);
    railBtns.forEach((b, i) => {
      b.classList.toggle("done", i < s);
      b.querySelector("i")!.style.width = i === s ? (p * 100).toFixed(1) + "%" : "";
      if (i === s) b.setAttribute("aria-current", "step"); else b.removeAttribute("aria-current");
    });
    ["tp-photo", "tp-patch", "tp-feat", "tp-model", "tp-result"].forEach(id => q(id).classList.toggle("on", PANEL[s] === id || (s === 7 && id === "tp-photo")));
    setText("tourStep", `Step ${s + 1} of ${STAGES.length}`);
    setHTML("t-now", `<b>${STAGES[s].name}</b>${STAGES[s].txt}`);
    q<HTMLButtonElement>("t-back").disabled = s === 0;
    setText("t-next", s === STAGES.length - 1 ? "Finish tour" : "Next");
  }

  function frame(ts: number) {
    if (!alive) return;
    const dt = last ? Math.min(ts - last, 100) : 0; last = ts;
    const d = STAGES[step].d;
    if (lt < d) { lt = Math.min(d, lt + dt); dirty = true; }
    else if (auto && step < STAGES.length - 1) { holdT += dt; if (holdT > HOLD) { step++; lt = 0; holdT = 0; dirty = true; } }
    if (dirty) { render(); dirty = false; }
    raf = requestAnimationFrame(frame);
  }
  function go(i: number) { step = clamp(i, 0, STAGES.length - 1); lt = reduce ? STAGES[step].d : 0; holdT = 0; dirty = true; }
  function setAuto(v: boolean) { auto = v; setText("t-play", v ? "Pause" : "Play"); q("t-play").setAttribute("aria-label", v ? "Pause autoplay" : "Play automatically"); }

  const onNext = () => { if (step === STAGES.length - 1) onClose(); else { setAuto(false); go(step + 1); } };
  const onBack = () => { setAuto(false); go(step - 1); };
  const onPlay = () => { setAuto(!auto); if (auto && step === STAGES.length - 1 && lt >= STAGES[step].d) go(0); };
  const onBackdrop = (e: MouseEvent) => { if (e.target === root) onClose(); };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") onClose();
    else if (e.key === "ArrowRight") { setAuto(false); go(step + 1); }
    else if (e.key === "ArrowLeft") { setAuto(false); go(step - 1); }
    else if (e.key === "Tab") {
      const f = [...dialog.querySelectorAll<HTMLButtonElement>("button:not([disabled])")]; if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }
  };
  const mq = matchMedia("(prefers-color-scheme: dark)");
  const themeObs = new MutationObserver(readTokens);

  q("t-next").addEventListener("click", onNext);
  q("t-back").addEventListener("click", onBack);
  q("t-play").addEventListener("click", onPlay);
  q("t-skip").addEventListener("click", onClose);
  q("tourClose").addEventListener("click", onClose);
  root.addEventListener("click", onBackdrop);
  document.addEventListener("keydown", onKey);
  mq.addEventListener("change", readTokens);
  themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  const prevOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";
  readTokens(); go(0); setAuto(!reduce);
  dialog.focus({ preventScroll: true });
  raf = requestAnimationFrame(frame);

  return () => {
    alive = false; cancelAnimationFrame(raf);
    q("t-next").removeEventListener("click", onNext);
    q("t-back").removeEventListener("click", onBack);
    q("t-play").removeEventListener("click", onPlay);
    q("t-skip").removeEventListener("click", onClose);
    q("tourClose").removeEventListener("click", onClose);
    root.removeEventListener("click", onBackdrop);
    document.removeEventListener("keydown", onKey);
    mq.removeEventListener("change", readTokens);
    themeObs.disconnect();
    document.body.style.overflow = prevOverflow;
  };
}
