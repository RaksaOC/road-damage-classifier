// Draws sample road photos (used by the tour and the "sample road" buttons) and shared class info.
(() => {
  const W = 640, H = 400, CELL = 80, COLS = 8, ROWS = 5;
  const CLASSES = [
    { k: "D00", n: "Longitudinal crack", w: 0.4, v: "--c-d00" },
    { k: "D10", n: "Transverse crack", w: 0.5, v: "--c-d10" },
    { k: "D20", n: "Alligator crack", w: 0.8, v: "--c-d20" },
    { k: "D40", n: "Pothole", w: 1.0, v: "--c-d40" },
    { k: "none", n: "No damage", w: 0, v: "--c-none" },
  ];
  const BY = Object.fromEntries(CLASSES.map(c => [c.k, c]));
  const RANK = { none: 0, D00: 1, D10: 2, D20: 3, D40: 4 };
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  function rng(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function walk(r, x0, y0, x1, y1, n, j) {
    const pts = []; let off = 0; const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy), nx = -dy / len, ny = dx / len;
    for (let i = 0; i <= n; i++) { const f = i / n; off += (r() - 0.5) * j; off *= 0.9; pts.push([x0 + dx * f + nx * off, y0 + dy * f + ny * off]); }
    return pts;
  }

  const SCENES = {
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
  };

  function strokePts(g, pts, w) {
    g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]));
    g.lineWidth = w; g.lineJoin = "round"; g.lineCap = "round"; g.stroke();
  }
  function drawHole(g, r, h) {
    const n = 26, rad = []; for (let i = 0; i < n; i++) rad.push(h.rad * (0.82 + r() * 0.3));
    const path = s => { g.beginPath(); for (let i = 0; i <= n; i++) { const a = i / n * Math.PI * 2, rr = rad[i % n] * s; const x = h.x + Math.cos(a) * rr * 1.25, y = h.y + Math.sin(a) * rr * 0.9; i ? g.lineTo(x, y) : g.moveTo(x, y); } g.closePath(); };
    path(1.14); g.fillStyle = "rgba(122,119,112,.55)"; g.fill();
    path(1); const gr = g.createRadialGradient(h.x, h.y + h.rad * 0.25, 2, h.x, h.y, h.rad * 1.3); gr.addColorStop(0, "#181715"); gr.addColorStop(1, "#383631"); g.fillStyle = gr; g.fill();
    g.save(); path(1); g.clip();
    g.fillStyle = "rgba(0,0,0,.38)"; g.beginPath(); g.ellipse(h.x, h.y - h.rad * 0.6, h.rad * 1.4, h.rad * 0.55, 0, 0, Math.PI * 2); g.fill();
    for (let i = 0; i < h.rad * 1.6; i++) { const v = 140 + r() * 70 | 0; g.fillStyle = `rgba(${v},${v - 6},${v - 14},.75)`; g.fillRect(h.x + (r() - 0.5) * h.rad * 2.2, h.y + (r() - 0.5) * h.rad * 1.5, 1 + r() * 3, 1 + r() * 2); }
    g.restore();
  }
  function drawCrack(g, r, c) {
    g.strokeStyle = "rgba(160,158,150,.45)"; strokePts(g, c.pts.map(p => [p[0] + 1.2, p[1] + 1.2]), 3.4);
    g.strokeStyle = "#141413"; strokePts(g, c.pts, 2.3);
    for (let b = 0; b < 7; b++) {
      const p = c.pts[(r() * c.pts.length) | 0], ang = r() * Math.PI * 2, br = [p]; let x = p[0], y = p[1];
      for (let k = 0; k < 7; k++) { x += Math.cos(ang + (r() - 0.5)) * 5; y += Math.sin(ang + (r() - 0.5)) * 5; br.push([x, y]); }
      g.strokeStyle = "#1b1b1a"; strokePts(g, br, 1.2);
    }
  }
  function drawWeb(g, r, w) {
    g.fillStyle = "rgba(0,0,0,.14)"; g.fillRect(w.x0, w.y0, w.x1 - w.x0, w.y1 - w.y0);
    const s = 20, pts = [];
    for (let y = w.y0; y <= w.y1; y += s) { const row = []; for (let x = w.x0; x <= w.x1; x += s) row.push([x + (r() - 0.5) * 12, y + (r() - 0.5) * 12]); pts.push(row); }
    g.strokeStyle = "#161615";
    for (let i = 0; i < pts.length; i++) for (let j = 0; j < pts[i].length; j++) {
      const p = pts[i][j];
      if (j + 1 < pts[i].length && r() > 0.1) strokePts(g, [p, pts[i][j + 1]], 1.7);
      if (i + 1 < pts.length && r() > 0.1) strokePts(g, [p, pts[i + 1][j]], 1.7);
    }
  }
  function drawRoad(S, dmg, r) {
    const c = document.createElement("canvas"); c.width = W; c.height = H; const g = c.getContext("2d");
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
    for (const d of dmg) { if (d.kind === "hole") drawHole(g, r, d); else if (d.kind === "web") drawWeb(g, r, d); else drawCrack(g, r, d); }
    const id = g.getImageData(0, 0, W, H), px = id.data;
    for (let i = 0; i < px.length; i += 4) {
      const n = (r() - 0.5) * 34, s = r() < 0.012 ? 40 + r() * 45 : 0;
      px[i] += n + s; px[i + 1] += n + s; px[i + 2] += n + s * 0.95;
    }
    g.putImageData(id, 0, 0);
    return c;
  }
  function labelCells(dmg) {
    const cells = Array.from({ length: ROWS }, () => Array(COLS).fill("none"));
    const set = (c, r, t) => { if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return; if (RANK[t] > RANK[cells[r][c]]) cells[r][c] = t; };
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
  function scenePhoto(key) {
    const S = SCENES[key], r = rng(S.seed), dmg = S.build(r);
    return { S, dmg, photo: drawRoad(S, dmg, r) };
  }
  function token(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

  window.RoadKit = { W, H, CELL, COLS, ROWS, CLASSES, BY, RANK, SCENES, rng, clamp, labelCells, scenePhoto, token };
})();
