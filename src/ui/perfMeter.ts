/**
 * Settings → Dev → Frame times: a small readout over the battlefield of how long each part of a frame takes,
 * to find what to speed up on a real phone. Off by default; remembered per device (not in the save).
 */
const KEY = 'ph.perfMeter';
/** The parts of a frame main.ts times separately. */
export type PerfPart = 'tick' | 'field' | 'render' | 'ui';
const PARTS: PerfPart[] = ['tick', 'field', 'render', 'ui'];
/** A frame this long or longer shows as a hitch (under 30 fps). */
const SLOW_MS = 34;

interface Window_ {
  frames: number;
  /** Total and worst gap between drawn frames (ms). */
  gap: number;
  worst: number;
  slow: number;
  parts: Record<PerfPart, number>;
  peak: Record<PerfPart, number>;
}
const blank = (): Window_ => ({ frames: 0, gap: 0, worst: 0, slow: 0, parts: { tick: 0, field: 0, render: 0, ui: 0 }, peak: { tick: 0, field: 0, render: 0, ui: 0 } });

/** The last second's numbers, also on `window.__perf` so a test browser can read them. */
export interface PerfReport {
  fps: number;
  avgFrameMs: number;
  worstFrameMs: number;
  slowFrames: number;
  /** Average and worst ms per frame spent in each part. */
  avg: Record<PerfPart, number>;
  peak: Record<PerfPart, number>;
}

let on = (() => {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
})();
let box: HTMLElement | null = null;
let win = blank();
let since = 0;

export function perfOn(): boolean {
  return on;
}

export function setPerfOn(v: boolean): void {
  on = v;
  try {
    localStorage.setItem(KEY, v ? '1' : '0');
  } catch {
    /* private mode: just this session */
  }
  if (!v) {
    box?.remove();
    box = null;
  }
}

/** One drawn frame: the gap since the last one and the time each part took (ms). */
export function perfFrame(now: number, gap: number, parts: Partial<Record<PerfPart, number>>): void {
  if (!on) return;
  win.frames++;
  win.gap += gap;
  win.worst = Math.max(win.worst, gap);
  if (gap >= SLOW_MS) win.slow++;
  for (const p of PARTS) {
    const t = parts[p] ?? 0;
    win.parts[p] += t;
    win.peak[p] = Math.max(win.peak[p], t);
  }
  if (!since) since = now;
  if (now - since < 1000) return;
  const n = Math.max(1, win.frames);
  const report: PerfReport = {
    fps: Math.round((win.frames * 1000) / (now - since)),
    avgFrameMs: win.gap / n,
    worstFrameMs: win.worst,
    slowFrames: win.slow,
    avg: Object.fromEntries(PARTS.map((p) => [p, win.parts[p] / n])) as Record<PerfPart, number>,
    peak: { ...win.peak },
  };
  (window as unknown as { __perf?: PerfReport }).__perf = report;
  show(report);
  win = blank();
  since = now;
}

function show(r: PerfReport): void {
  if (!box) {
    box = document.createElement('div');
    box.className = 'perf-meter';
    document.body.appendChild(box);
  }
  const ms = (v: number) => v.toFixed(1);
  box.textContent =
    `${r.fps} fps · frame ${ms(r.avgFrameMs)}, worst ${ms(r.worstFrameMs)} ms · hitches ${r.slowFrames}\n` +
    PARTS.map((p) => `${p} ${ms(r.avg[p])} (${ms(r.peak[p])})`).reduce((a, x, i) => a + (i === 2 ? '\n' : i ? ' · ' : '') + x, '');
}
