"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Select } from "@/components/ui/Select";
import ui from "@/components/ui/primitives/primitives.module.css";
import type { Box, Correction, DamageKey } from "@/domain/correction";
import { BY, CLASSES } from "@/domain/damage";
import { H, W } from "@/domain/frame";
import { cx } from "@/lib/cx";
import { errorMessage, services } from "@/services";
import styles from "./Annotator.module.css";

const DAMAGE = CLASSES.filter((c) => c.k !== "none");
const OPTIONS = DAMAGE.map((c) => ({ value: c.k as DamageKey, label: c.n, description: c.k }));
const MIN = 6; // frame px: smaller drags are treated as a click
const MAX_ZOOM = 8;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const pct = (v: number, of: number) => `${(v / of) * 100}%`;
const round = (v: number) => Math.round(v);

type Tool = "draw" | "pan";
type View = { s: number; tx: number; ty: number }; // zoom and pan of the photo layer, in viewport px
type Drag =
  | { kind: "draw"; x: number; y: number }
  | { kind: "move"; i: number; x: number; y: number; orig: Box }
  | { kind: "pan"; cx: number; cy: number; orig: View };

interface AnnotatorProps {
  src: string; // the 640 × 400 frame
  analysisId: string;
  initial: Box[];
  onSaved: (c: Correction) => void;
  onCancel: () => void;
}

/**
 * "Incorrect?": the user draws the real damage as free boxes (Pascal VOC, frame pixels) and picks each box's class.
 * Draw tool: drag on the photo to add a box, drag a box to move it. Pan tool (or hold Space): drag to move around.
 * Zoom with the wheel / pinch or the buttons. Turning boxes into square labels is our internal work (on save).
 */
export function Annotator({ src, analysisId, initial, onSaved, onCancel }: AnnotatorProps) {
  const [boxes, setBoxes] = useState<Box[]>(initial);
  const [cls, setCls] = useState<DamageKey>("D40");
  const [tool, setTool] = useState<Tool>("draw");
  const [space, setSpace] = useState(false); // Space held: pan for a moment
  const [view, setView] = useState<View>({ s: 1, tx: 0, ty: 0 });
  const [size, setSize] = useState({ w: 0, h: 0 }); // viewport size in px
  const [selected, setSelected] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [draft, setDraft] = useState<Box | null>(null);
  const [dragging, setDragging] = useState<Drag["kind"] | null>(null);
  const [save, setSave] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });
  const vp = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const viewRef = useRef(view);
  viewRef.current = view;
  const panning = tool === "pan" || space;

  // keep the viewport size for the zoom maths and the tooltip position
  useEffect(() => {
    const el = vp.current!;
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight });
      setView({ s: 1, tx: 0, ty: 0 }); // a resize would leave the pan offsets stale
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /** Pan limits: the photo always covers the viewport. */
  const fit = useCallback((v: View): View => {
    const el = vp.current!;
    const w = el.clientWidth, h = el.clientHeight;
    return { s: v.s, tx: clamp(v.tx, w * (1 - v.s), 0), ty: clamp(v.ty, h * (1 - v.s), 0) };
  }, []);

  /** Zoom by a factor around a point in the viewport (default: its centre). */
  const zoomAt = useCallback(
    (factor: number, px?: number, py?: number) => {
      const el = vp.current!;
      const v = viewRef.current;
      const x = px ?? el.clientWidth / 2, y = py ?? el.clientHeight / 2;
      const s = clamp(v.s * factor, 1, MAX_ZOOM);
      setView(fit({ s, tx: x - ((x - v.tx) * s) / v.s, ty: y - ((y - v.ty) * s) / v.s }));
    },
    [fit],
  );
  const reset = () => setView({ s: 1, tx: 0, ty: 0 });

  // wheel / trackpad pinch zooms around the pointer (a native listener, so it can stop the page scrolling)
  useEffect(() => {
    const el = vp.current!;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0025)), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, [zoomAt]);

  /** Pointer position -> frame pixels (0–640, 0–400), through the zoom and pan. */
  const toFrame = (e: React.PointerEvent) => {
    const r = vp.current!.getBoundingClientRect();
    const { s, tx, ty } = viewRef.current;
    return {
      x: clamp(((e.clientX - r.left - tx) / s / r.width) * W, 0, W),
      y: clamp(((e.clientY - r.top - ty) / s / r.height) * H, 0, H),
    };
  };

  const down = (e: React.PointerEvent, boxIndex?: number) => {
    if (e.button !== 0 && e.button !== 1) return;
    e.stopPropagation();
    vp.current!.setPointerCapture(e.pointerId);
    if (panning || e.button === 1) {
      drag.current = { kind: "pan", cx: e.clientX, cy: e.clientY, orig: viewRef.current };
    } else if (boxIndex !== undefined) {
      drag.current = { kind: "move", i: boxIndex, ...toFrame(e), orig: boxes[boxIndex] };
      setSelected(boxIndex);
    } else {
      drag.current = { kind: "draw", ...toFrame(e) };
      setSelected(null);
    }
    setDragging(drag.current.kind);
  };

  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (d.kind === "pan") {
      setView(fit({ s: d.orig.s, tx: d.orig.tx + e.clientX - d.cx, ty: d.orig.ty + e.clientY - d.cy }));
    } else if (d.kind === "move") {
      const p = toFrame(e);
      const { orig } = d;
      const dx = clamp(p.x - d.x, -orig.xmin, W - orig.xmax), dy = clamp(p.y - d.y, -orig.ymin, H - orig.ymax);
      setBoxes((xs) => xs.map((b, k) => (k === d.i ? { ...b, xmin: orig.xmin + dx, xmax: orig.xmax + dx, ymin: orig.ymin + dy, ymax: orig.ymax + dy } : b)));
    } else {
      const p = toFrame(e);
      setDraft({ cls, xmin: Math.min(d.x, p.x), ymin: Math.min(d.y, p.y), xmax: Math.max(d.x, p.x), ymax: Math.max(d.y, p.y) });
    }
  };

  const up = () => {
    if (drag.current?.kind === "draw" && draft && draft.xmax - draft.xmin >= MIN && draft.ymax - draft.ymin >= MIN) {
      setBoxes((xs) => [...xs, draft]);
    }
    drag.current = null;
    setDraft(null);
    setDragging(null);
  };

  const update = (i: number, patch: Partial<Box>) => setBoxes((xs) => xs.map((b, k) => (k === i ? { ...b, ...patch } : b)));
  const remove = (i: number) => {
    setBoxes((xs) => xs.filter((_, k) => k !== i));
    setSelected(null);
    setHover(null);
  };

  // keys: D draw, H pan, hold Space to pan, + / − / 0 zoom, Delete removes the selected box, Escape deselects
  useEffect(() => {
    const busy = (e: KeyboardEvent) => !!(e.target as HTMLElement).closest("input, select, textarea, button, [role=listbox], [role=combobox]");
    const keydown = (e: KeyboardEvent) => {
      if (busy(e)) return;
      if (e.key === " ") (e.preventDefault(), setSpace(true));
      else if (e.key === "d" || e.key === "D") setTool("draw");
      else if (e.key === "h" || e.key === "H") setTool("pan");
      else if (e.key === "+" || e.key === "=") zoomAt(1.25);
      else if (e.key === "-") zoomAt(0.8);
      else if (e.key === "0") reset();
      else if ((e.key === "Delete" || e.key === "Backspace") && selected !== null) remove(selected);
      else if (e.key === "Escape") setSelected(null);
    };
    const keyup = (e: KeyboardEvent) => e.key === " " && setSpace(false);
    window.addEventListener("keydown", keydown);
    window.addEventListener("keyup", keyup);
    return () => (window.removeEventListener("keydown", keydown), window.removeEventListener("keyup", keyup));
  }, [selected, zoomAt]);

  const submit = async () => {
    setSave({ busy: true, error: null });
    try {
      onSaved(await services.analysis.correct(analysisId, boxes.map((b) => ({ ...b, xmin: round(b.xmin), ymin: round(b.ymin), xmax: round(b.xmax), ymax: round(b.ymax) }))));
    } catch (e) {
      setSave({ busy: false, error: errorMessage(e) });
    }
  };

  const boxStyle = (b: Box) =>
    ({ left: pct(b.xmin, W), top: pct(b.ymin, H), width: pct(b.xmax - b.xmin, W), height: pct(b.ymax - b.ymin, H), "--c": `var(${BY[b.cls].v})` }) as React.CSSProperties;

  // the tooltip sits in the viewport (not the zoomed layer): above the box, or below it near the top edge
  const tip = hover !== null && !dragging ? boxes[hover] ?? null : null;
  const tipPos =
    tip && size.w
      ? (() => {
          const left = view.tx + (tip.xmin / W) * size.w * view.s;
          const top = view.ty + (tip.ymin / H) * size.h * view.s;
          const bottom = view.ty + (tip.ymax / H) * size.h * view.s;
          const below = top < 80;
          return { left: clamp(left, 6, Math.max(6, size.w - 200)), top: below ? Math.min(bottom + 8, size.h - 76) : top - 8, below };
        })()
      : null;

  return (
    <div className={styles.wrap}>
      <div className={styles.body}>
        <div
          ref={vp}
          className={cx(styles.viewport, panning && styles.panTool, dragging === "pan" && styles.grabbing)}
          onPointerDown={(e) => down(e)}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          onDoubleClick={() => view.s > 1 && reset()}
        >
          <div className={styles.layer} style={{ transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.s})`, "--s": view.s } as React.CSSProperties}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="Road photo to correct" draggable={false} />
            {boxes.map((b, i) => (
              <div
                key={i}
                className={cx(styles.box, (selected === i || hover === i) && styles.sel, dragging === "move" && selected === i && styles.moving)}
                style={boxStyle(b)}
                onPointerDown={(e) => down(e, i)}
                onPointerEnter={() => setHover(i)}
                onPointerLeave={() => setHover((h) => (h === i ? null : h))}
                aria-label={`${BY[b.cls].n} box ${i + 1}`}
              >
                <span>{i + 1}</span>
              </div>
            ))}
            {draft && <div className={cx(styles.box, styles.draft)} style={boxStyle(draft)} />}
          </div>

          {tip && tipPos && (
            <div className={cx(styles.tip, tipPos.below && styles.tipBelow)} style={{ left: tipPos.left, top: tipPos.top }} role="tooltip">
              <b>
                <i style={{ background: `var(${BY[tip.cls].v})` }} />
                {BY[tip.cls].n}
                <small>
                  #{hover! + 1} · {tip.cls}
                </small>
              </b>
              <code>
                xmin {round(tip.xmin)} · xmax {round(tip.xmax)}
                <br />
                ymin {round(tip.ymin)} · ymax {round(tip.ymax)}
              </code>
              <span>
                {round(tip.xmax - tip.xmin)} × {round(tip.ymax - tip.ymin)} px
              </span>
            </div>
          )}
          {view.s > 1 && <span className={styles.zoomBadge}>{Math.round(view.s * 100)}%</span>}
        </div>

        <aside className={styles.side} aria-label="Correction tools">
          <div className={styles.tools} role="toolbar" aria-label="Tools">
            <ToolButton on={tool === "draw" && !space} onClick={() => setTool("draw")} label="Draw boxes (D)">
              <path d="M4 7V5a1 1 0 0 1 1-1h2M17 4h2a1 1 0 0 1 1 1v2M20 17v2a1 1 0 0 1-1 1h-2M7 20H5a1 1 0 0 1-1-1v-2" />
              <path d="M12 9v6M9 12h6" />
            </ToolButton>
            <ToolButton on={panning} onClick={() => setTool("pan")} label="Move around (H, or hold Space)">
              <path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12m0-6.5v-1a1.5 1.5 0 0 1 3 0V12m0-5.5a1.5 1.5 0 0 1 3 0V12m0-3.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-1.2a6 6 0 0 1-4.8-2.4L4.6 15.2a1.6 1.6 0 0 1 2.4-2.1L8 14" />
            </ToolButton>
            <span className={styles.sep} />
            <ToolButton onClick={() => zoomAt(0.8)} label="Zoom out (−)" disabled={view.s <= 1}>
              <circle cx="11" cy="11" r="6.5" />
              <path d="m20 20-4-4M8.5 11h5" />
            </ToolButton>
            <ToolButton onClick={reset} label="Fit the whole photo (0)" disabled={view.s === 1}>
              <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
            </ToolButton>
            <ToolButton onClick={() => zoomAt(1.25)} label="Zoom in (+)" disabled={view.s >= MAX_ZOOM}>
              <circle cx="11" cy="11" r="6.5" />
              <path d="m20 20-4-4M8.5 11h5M11 8.5v5" />
            </ToolButton>
          </div>

          <div className={styles.group}>
            <span className={styles.label}>Next box</span>
            <div className={styles.classes} role="radiogroup" aria-label="Damage type for the next box">
              {DAMAGE.map((c) => (
                <button
                  key={c.k}
                  type="button"
                  role="radio"
                  aria-checked={cls === c.k}
                  className={cx(styles.cls, cls === c.k && styles.on)}
                  style={{ "--c": `var(${c.v})` } as React.CSSProperties}
                  onClick={() => (setCls(c.k as DamageKey), setTool("draw"))}
                >
                  <i />
                  {c.n}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.group}>
            <span className={styles.label}>Boxes {boxes.length > 0 && <em>{boxes.length}</em>}</span>
            {boxes.length > 0 ? (
              <ol className={styles.list}>
                {boxes.map((b, i) => (
                  <li
                    key={i}
                    className={cx((selected === i || hover === i) && styles.sel)}
                    onClick={() => setSelected(i)}
                    onPointerEnter={() => setHover(i)}
                    onPointerLeave={() => setHover((h) => (h === i ? null : h))}
                  >
                    <span className={styles.num} style={{ background: `var(${BY[b.cls].v})` }}>
                      {i + 1}
                    </span>
                    <Select value={b.cls} options={OPTIONS} onChange={(v) => update(i, { cls: v })} label={`Class of box ${i + 1}`} variant="quiet" className={styles.pick} />
                    <button type="button" className={styles.x} onClick={(e) => (e.stopPropagation(), remove(i))} aria-label={`Remove box ${i + 1}`}>
                      ×
                    </button>
                  </li>
                ))}
              </ol>
            ) : (
              <p className={styles.hint}>Drag on the photo to box the damage. No boxes means no damage.</p>
            )}
          </div>

          <div className={styles.actions}>
            {save.error && <span className={styles.error}>{save.error}</span>}
            <button type="button" className={ui.textBtn} onClick={onCancel} disabled={save.busy}>
              Cancel
            </button>
            <button type="button" className={cx(ui.btn, ui.primary)} onClick={submit} disabled={save.busy}>
              {save.busy ? "Saving…" : "Save"}
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}

function ToolButton({ on, onClick, label, disabled, children }: { on?: boolean; onClick: () => void; label: string; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" className={cx(styles.tool, on && styles.on)} onClick={onClick} aria-label={label} aria-pressed={on} title={label} disabled={disabled}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {children}
      </svg>
    </button>
  );
}

/** Read-only outlines of a correction's boxes, to lay over a RoadView. */
export function BoxOverlay({ boxes }: { boxes: Box[] }) {
  return (
    <div className={styles.overlay} aria-hidden="true">
      {boxes.map((b, i) => (
        <span
          key={i}
          className={styles.box}
          style={{ left: pct(b.xmin, W), top: pct(b.ymin, H), width: pct(b.xmax - b.xmin, W), height: pct(b.ymax - b.ymin, H), "--c": `var(${BY[b.cls].v})` } as React.CSSProperties}
        >
          <span>{i + 1}</span>
        </span>
      ))}
    </div>
  );
}
