import type { MinigameApi, MinigameGame } from './shell';
import { roundRect } from './shell';

/**
 * Alias's Grave Robbing (the Restless Graveyard): nine graves open one after another for a moment, faster and
 * faster. Tap the loot (1 point, a golden urn 3) before the grave shuts; tap a skeleton's hand and it costs a heart.
 * Sixty seconds on the clock.
 */

export const GR_TIME = 60;
export const GR_INTRO = `<p>Graves creak open for a moment. <b>Tap the loot</b> before they shut: 1 point, a golden urn 3.</p><p>Some hold a skeleton's grasping hand: tapping one costs a heart. You have ${GR_TIME} seconds.</p>`;

interface Grave {
  open: number;
  /** What's inside while open. */
  kind: 'loot' | 'gold' | 'hand';
  /** Already taken (or already grabbed you). */
  done: boolean;
}

export function graveRobbing(api: MinigameApi): MinigameGame {
  const graves: Grave[] = Array.from({ length: 9 }, () => ({ open: 0, kind: 'loot', done: true }));
  let openIn = 0.5;
  const cell = () => {
    const size = Math.min(api.W / 3.3, (api.H - 240) / 3.3);
    return { size, x0: (api.W - size * 3) / 2, y0: 120 + (api.H - 240 - size * 3) / 2 };
  };
  const center = (i: number) => {
    const c = cell();
    return { x: c.x0 + (i % 3) * c.size + c.size / 2, y: c.y0 + Math.floor(i / 3) * c.size + c.size / 2 };
  };
  return {
    tap(x, y) {
      const c = cell();
      const col = Math.floor((x - c.x0) / c.size);
      const row = Math.floor((y - c.y0) / c.size);
      if (col < 0 || col > 2 || row < 0 || row > 2) return;
      const i = row * 3 + col;
      const gr = graves[i];
      if (gr.open <= 0 || gr.done) return;
      gr.done = true;
      const p = center(i);
      if (gr.kind === 'hand') api.loseLife(p.x, p.y);
      else api.addScore(gr.kind === 'gold' ? 3 : 1, p.x, p.y);
      gr.open = Math.min(gr.open, 0.15);
    },
    step(dt) {
      if (api.t >= GR_TIME) {
        api.end();
        return;
      }
      for (const gr of graves) gr.open = Math.max(0, gr.open - dt);
      openIn -= dt;
      if (openIn <= 0) {
        const shut = graves.map((g, i) => (g.open <= 0 ? i : -1)).filter((i) => i >= 0);
        if (shut.length) {
          const gr = graves[shut[Math.floor(Math.random() * shut.length)]];
          const r = Math.random();
          const handChance = Math.min(0.35, 0.18 + api.t * 0.003);
          gr.kind = r < handChance ? 'hand' : r < handChance + 0.1 ? 'gold' : 'loot';
          gr.open = Math.max(0.6, 1.5 - api.t * 0.014);
          gr.done = false;
        }
        openIn = Math.max(0.28, 0.85 - api.t * 0.009);
      }
    },
    draw(g) {
      const c = cell();
      // The clock
      const left = Math.max(0, GR_TIME - api.t);
      g.fillStyle = 'rgba(0,0,0,0.45)';
      g.fillRect(16, 64, api.W - 32, 10);
      g.fillStyle = left < 10 ? '#ff6a6a' : '#e8dcc0';
      g.fillRect(16, 64, (api.W - 32) * (left / GR_TIME), 10);
      for (let i = 0; i < 9; i++) {
        const p = center(i);
        const gr = graves[i];
        const s = c.size * 0.82;
        // The grave: a mound, with a headstone behind it.
        roundRect(g, p.x - s * 0.3, p.y - s * 0.5, s * 0.6, s * 0.42, s * 0.12);
        g.fillStyle = '#8a8a96';
        g.fill();
        g.fillStyle = '#5a5a66';
        g.fillRect(p.x - s * 0.05, p.y - s * 0.42, s * 0.1, s * 0.22);
        g.fillRect(p.x - s * 0.13, p.y - s * 0.36, s * 0.26, s * 0.07);
        roundRect(g, p.x - s * 0.45, p.y - s * 0.08, s * 0.9, s * 0.5, s * 0.2);
        g.fillStyle = gr.open > 0 ? '#1a120c' : '#5a4630';
        g.fill();
        if (gr.open > 0 && !gr.done) {
          const key = gr.kind === 'hand' ? 'ab-paladin-dk/091' : gr.kind === 'gold' ? 'things/057' : 'resources1/012';
          api.icon(key, p.x, p.y + s * 0.15, s * 0.5);
          if (gr.kind === 'gold') {
            g.strokeStyle = '#ffd34d';
            g.lineWidth = 3;
            g.beginPath();
            g.arc(p.x, p.y + s * 0.15, s * 0.32, 0, Math.PI * 2);
            g.stroke();
          }
        }
      }
      api.icon('ab-rogue-warlock/009', api.W / 2, api.H - 70, 56);
    },
  };
}
