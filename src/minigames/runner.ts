import type { Game } from '../core/game';
import { fitCanvas } from '../render/fx';
import type { MinigameDef, MinigameInstance, MinigameResult } from './types';

const COUNTDOWN = 3;

/** Hosts a minigame full screen: countdown, input routing, main loop, quit button. */
export function runMinigame(def: MinigameDef, game: Game, onDone: (r: MinigameResult) => void): void {
  const root = document.createElement('div');
  root.className = 'mg-root';
  root.innerHTML = `<canvas class="mg-canvas"></canvas><button class="mg-quit" aria-label="Quit">✕</button>`;
  document.body.appendChild(root);

  const canvas = root.querySelector('canvas')!;
  const g = canvas.getContext('2d')!;
  let { w, h } = fitCanvas(canvas, g);
  const mg: MinigameInstance = def.create(w, h, game);
  let countdown = COUNTDOWN;
  let last = performance.now();
  let ended = false;

  const pos = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as const;
  };
  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    if (countdown <= 0) mg.down(...pos(e));
  });
  canvas.addEventListener('pointermove', (e) => countdown <= 0 && mg.move(...pos(e)));
  canvas.addEventListener('pointerup', (e) => countdown <= 0 && mg.up(...pos(e)));
  canvas.addEventListener('pointercancel', (e) => countdown <= 0 && mg.up(...pos(e)));

  const finish = () => {
    if (ended) return;
    ended = true;
    root.remove();
    onDone(mg.result());
  };
  root.querySelector('.mg-quit')!.addEventListener('click', finish);

  const frame = (now: number) => {
    if (ended) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    ({ w, h } = fitCanvas(canvas, g));

    if (countdown > 0) countdown -= dt;
    else mg.update(dt, w, h);
    mg.render(g, w, h);

    if (countdown > 0) {
      g.fillStyle = 'rgba(10,6,20,0.6)';
      g.fillRect(0, 0, w, h);
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = '#fff';
      g.font = '900 30px system-ui, sans-serif';
      g.fillText(`${def.icon} ${def.name}`, w / 2, h * 0.3);
      g.font = '500 16px system-ui, sans-serif';
      wrapText(g, def.howTo, w / 2, h * 0.3 + 44, Math.min(w - 48, 360), 22);
      g.font = '900 96px system-ui, sans-serif';
      g.fillStyle = '#ffd34d';
      g.fillText(String(Math.ceil(countdown)), w / 2, h * 0.62);
    }

    if (mg.finished) finish();
    else requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

export function wrapText(g: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lineH: number): void {
  const words = text.split(' ');
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (g.measureText(test).width > maxW && line) {
      g.fillText(line, x, y);
      line = word;
      y += lineH;
    } else line = test;
  }
  if (line) g.fillText(line, x, y);
}

/** Shared top bar for minigames: status on the left, score on the right, optional middle text. */
export function drawMgHud(g: CanvasRenderingContext2D, w: number, left: string, warn: boolean, score: number, middle = ''): void {
  g.fillStyle = 'rgba(0,0,0,0.45)';
  g.fillRect(0, 0, w, 52);
  g.textBaseline = 'middle';
  g.font = '800 20px system-ui, sans-serif';
  g.textAlign = 'left';
  g.fillStyle = warn ? '#ff6b6b' : '#fff';
  g.fillText(left, 14, 26);
  g.textAlign = 'right';
  g.fillStyle = '#ffd34d';
  g.fillText(`★ ${score}`, w - 60, 26);
  if (middle) {
    g.textAlign = 'center';
    g.fillStyle = '#fff';
    g.fillText(middle, w / 2, 26);
  }
}

export const timerLabel = (t: number): string => `⏱ ${Math.max(0, t).toFixed(1)}`;
