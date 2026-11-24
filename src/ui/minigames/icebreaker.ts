import { drawArt, drawBursts, drawHunter, stepBursts, type Burst } from './art';
import type { MinigameApi, MinigameGame } from './shell';

/**
 * Lilith's Icebreaker (the Frost Peaks): Lilith stands on a summit over a village far below, and icicles fall toward
 * it, faster and faster. Tap one and her ghosts shatter it (its pieces keep falling and fade): 1 point, and the big
 * ones take two blows for 3. One that gets past her costs a heart. Pack art: each icicle is the ice spell's falling
 * shard (public/minigames/icicle.png), and it shatters with the spell's own burst; the scene is icePeak.
 */

const ICICLE = 'minigames/icicle';
/** How far in from each side icicles fall (at a 400px-wide screen), so none overlaps the area's border. */
const SIDE_MARGIN = 56;

export const IB_INTRO = '<p>Icicles are falling toward the village far below! Lilith keeps watch from the peak: <b>tap</b> to send her ghosts to shatter them, 1 point each.</p><p>Big ones take two blows and are worth 3. One that gets past her costs a heart.</p>';

interface Icicle {
  x: number;
  y: number;
  vy: number;
  big: boolean;
  hp: number;
}

export function icebreaker(api: MinigameApi): MinigameGame {
  const ice: Icicle[] = [];
  const bursts: Burst[] = [];
  let spawnIn = 0.6;
  const ground = () => api.H - 120;
  const size = (b: boolean) => (b ? 30 : 18) * api.k;
  return {
    tap(x, y) {
      let best: Icicle | null = null;
      let bestD = Infinity;
      for (const c of ice) {
        const d = Math.hypot(c.x - x, c.y - size(c.big) - y);
        if (d < size(c.big) * 1.6 + 12 && d < bestD) {
          bestD = d;
          best = c;
        }
      }
      if (!best) return;
      best.hp--;
      // The ice spell's shatter (its last frames), bigger for the killing blow; the pieces keep falling as the icicle
      // was, gathering speed, and fade away (a chipped one's chips fall away too).
      bursts.push({ key: 'ice', x: best.x, y: best.y - size(best.big), size: size(best.big) * (best.hp <= 0 ? 3 : 2), t: 0, dur: 0.7, from: 4, to: 7, vy: best.vy * 0.8, fall: 900 * api.k, fade: true });
      if (best.hp <= 0) {
        api.addScore(best.big ? 3 : 1, best.x, best.y);
        ice.splice(ice.indexOf(best), 1);
      } else best.vy *= 0.6; // the first blow slows a big one
    },
    step(dt) {
      spawnIn -= dt;
      if (spawnIn <= 0) {
        const big = Math.random() < 0.18;
        // Clear of the area's border down each side: its edge, plus the icicle's own half-width.
        const m = SIDE_MARGIN * api.k + size(big) * 1.2;
        ice.push({ x: m + Math.random() * Math.max(0, api.W - m * 2), y: -10, vy: Math.min(api.expert ? 600 : 420, (95 + api.t * 4.5) * (api.expert ? 1.4 : 1) * (big ? 0.7 : 1 + Math.random() * 0.3)) * api.k, big, hp: big ? 2 : 1 });
        // Expert: icicles fall faster and more often.
        spawnIn = api.expert ? Math.max(0.22, 0.75 - api.t * 0.009) : Math.max(0.3, 1.0 - api.t * 0.011);
      }
      for (let i = ice.length - 1; i >= 0; i--) {
        const c = ice[i];
        c.y += c.vy * dt;
        if (c.y >= ground()) {
          ice.splice(i, 1);
          api.loseLife(c.x, ground());
        }
      }
      stepBursts(bursts, dt);
    },
    draw(g) {
      for (const c of ice) {
        const s = size(c.big);
        // Chipped by a first blow, it pales.
        drawArt(g, ICICLE, c.x, c.y - s, s * 2.4, 0, c.hp < (c.big ? 2 : 1) ? 0.6 : 1);
      }
      drawBursts(g, bursts);
      // Lilith on the summit's ledge, keeping watch over the village below.
      drawHunter(g, 'haunter', api.W / 2, ground() + 15 * api.k, 56 * api.k, api.t, 3);
    },
  };
}
