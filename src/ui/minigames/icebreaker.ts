import { drawArt, drawBursts, drawHunter, stepBursts, type Burst } from './art';
import type { MinigameApi, MinigameGame } from './shell';

/**
 * Okrin's Icebreaker (the Frost Peaks): icicles fall on the camp, faster and faster. Tap one to smash it with
 * Okrin's hammer: 1 point, and the big ones take two blows for 3. One that reaches the camp costs a heart. Pack art:
 * each icicle is the ice spell's falling shard (public/minigames/icicle.png), it shatters with the spell's own
 * burst, and the camp is a wall of the Frost Peaks' rocks.
 */

const ICICLE = 'minigames/icicle';
/** The Frost Peaks' rocks along the camp's edge. */
const CAMP_ROCKS = ['backgrounds/peaks/r_Rock2', 'backgrounds/peaks/r_Rock11', 'backgrounds/peaks/r_Rock12', 'backgrounds/peaks/r_Rock13'];

export const IB_INTRO = '<p>Icicles are falling on the camp! <b>Tap</b> to smash them with Okrin\'s hammer: 1 point each.</p><p>Big ones take two blows and are worth 3. One that reaches the camp costs a heart.</p>';

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
      // The ice spell's shatter (its last frames), bigger for the killing blow.
      bursts.push({ key: 'ice', x: best.x, y: best.y - size(best.big), size: size(best.big) * (best.hp <= 0 ? 3 : 2), t: 0, dur: 0.35, from: 4, to: 7 });
      if (best.hp <= 0) {
        api.addScore(best.big ? 3 : 1, best.x, best.y);
        ice.splice(ice.indexOf(best), 1);
      } else best.vy *= 0.6; // the first blow slows a big one
    },
    step(dt) {
      spawnIn -= dt;
      if (spawnIn <= 0) {
        const big = Math.random() < 0.18;
        ice.push({ x: 30 + Math.random() * (api.W - 60), y: -10, vy: Math.min(420, (95 + api.t * 4.5) * (big ? 0.7 : 1 + Math.random() * 0.3)) * api.k, big, hp: big ? 2 : 1 });
        spawnIn = Math.max(0.3, 1.0 - api.t * 0.011);
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
      // The camp's edge: a wall of rocks.
      const n = Math.ceil(api.W / (44 * api.k)) + 1;
      for (let i = 0; i < n; i++) drawArt(g, CAMP_ROCKS[i % CAMP_ROCKS.length], i * 44 * api.k, ground() + 10 * api.k, 34 * api.k);
      for (const c of ice) {
        const s = size(c.big);
        // Chipped by a first blow, it pales.
        drawArt(g, ICICLE, c.x, c.y - s, s * 2.4, 0, c.hp < (c.big ? 2 : 1) ? 0.6 : 1);
      }
      drawBursts(g, bursts);
      // Okrin, hammer ready, in the camp.
      drawHunter(g, 'frostbreaker', api.W / 2, api.H - 30, 56 * api.k, api.t, 3);
    },
  };
}
