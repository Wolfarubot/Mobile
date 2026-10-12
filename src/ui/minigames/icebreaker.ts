import type { MinigameApi, MinigameGame } from './shell';

/**
 * Okrin's Icebreaker (the Frost Peaks): icicles fall on the camp, faster and faster. Tap one to smash it with
 * Okrin's hammer: 1 point, and the big ones take two blows for 3. One that reaches the camp costs a heart.
 */

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
  const shards: Array<{ x: number; y: number; vx: number; vy: number; t: number }> = [];
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
      for (let i = 0; i < 8; i++) shards.push({ x: best.x, y: best.y - size(best.big), vx: (Math.random() - 0.5) * 300, vy: -Math.random() * 250, t: 0 });
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
      for (let i = shards.length - 1; i >= 0; i--) {
        const s = shards[i];
        s.t += dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.vy += 800 * dt;
        if (s.t > 0.5) shards.splice(i, 1);
      }
    },
    draw(g) {
      // The camp along the bottom.
      g.fillStyle = 'rgba(240,248,255,0.85)';
      g.fillRect(0, ground(), api.W, 6);
      for (const c of ice) {
        const s = size(c.big);
        g.fillStyle = c.hp < (c.big ? 2 : 1) ? '#a8d8f0' : '#dff4ff';
        g.strokeStyle = '#5a9ac0';
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(c.x - s * 0.55, c.y - s * 2.2);
        g.lineTo(c.x + s * 0.55, c.y - s * 2.2);
        g.lineTo(c.x, c.y);
        g.closePath();
        g.fill();
        g.stroke();
      }
      g.fillStyle = '#dff4ff';
      for (const s of shards) {
        g.globalAlpha = 1 - s.t / 0.5;
        g.fillRect(s.x - 2, s.y - 2, 4, 4);
      }
      g.globalAlpha = 1;
      api.icon('ab-pyro-hydro/058', api.W / 2, api.H - 60, 56);
    },
  };
}
