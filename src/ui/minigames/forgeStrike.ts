import type { MinigameApi, MinigameGame } from './shell';
import { roundRect } from './shell';

/**
 * Kargesh's Forge Strike (the Ember Mines): a marker swings across the hot bar; tap when it's in the glowing sweet
 * spot. 1 point, 2 dead centre, and every 5 strikes in a row add 3 more. The swing quickens and the sweet spot
 * shrinks. A miss costs a heart and the streak.
 */

export const FS_INTRO = '<p>Strike the glowing metal! <b>Tap</b> when the marker is inside the bright sweet spot: 1 point, 2 dead centre.</p><p>Every 5 strikes in a row add 3 more. The swing speeds up and the spot shrinks; a miss costs a heart and your streak.</p>';

export function forgeStrike(api: MinigameApi): MinigameGame {
  let pos = 0; // 0..1 along the bar
  let dir = 1;
  let zone = { c: 0.5, w: 0.24 };
  let streak = 0;
  let strikes = 0;
  const sparks: Array<{ x: number; y: number; vx: number; vy: number; t: number }> = [];
  const bar = () => ({ x: 30, y: api.H * 0.42, w: api.W - 60, h: 34 * api.k });
  /** Swing speed (bar widths a second) and sweet-spot width, by strikes so far. */
  const speed = () => Math.min(1.8, 0.7 + strikes * 0.03);
  const newZone = () => {
    const w = Math.max(0.1, 0.24 - strikes * 0.004);
    zone = { c: w / 2 + Math.random() * (1 - w), w };
  };
  return {
    tap() {
      const b = bar();
      const x = b.x + pos * b.w;
      const off = Math.abs(pos - zone.c);
      if (off <= zone.w / 2) {
        strikes++;
        streak++;
        const pts = (off <= zone.w * 0.15 ? 2 : 1) + (streak % 5 === 0 ? 3 : 0);
        api.addScore(pts, x, b.y);
        if (streak % 5 === 0) api.pop(x, b.y - 30, `${streak} in a row!`, '#ffd34d');
        for (let i = 0; i < 14; i++) sparks.push({ x, y: b.y + b.h / 2, vx: (Math.random() - 0.5) * 360, vy: -Math.random() * 380, t: 0 });
        newZone();
      } else {
        streak = 0;
        api.loseLife(x, b.y);
      }
    },
    step(dt) {
      pos += dir * speed() * dt;
      if (pos > 1) {
        pos = 2 - pos;
        dir = -1;
      } else if (pos < 0) {
        pos = -pos;
        dir = 1;
      }
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.t += dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.vy += 900 * dt;
        if (s.t > 0.6) sparks.splice(i, 1);
      }
    },
    draw(g) {
      const b = bar();
      // Anvil and ingot under the bar.
      api.icon('ab-engineer-psionic/006', api.W / 2, api.H - 80, 64);
      g.fillStyle = '#ffb060';
      g.font = `bold ${Math.round(18 * api.k)}px monospace`;
      g.textAlign = 'center';
      g.fillText(streak > 0 ? `Streak ${streak}` : 'Strike!', api.W / 2, b.y - 40);
      roundRect(g, b.x, b.y, b.w, b.h, 8);
      g.fillStyle = '#3a1a10';
      g.fill();
      // The sweet spot, glowing; its dead centre brighter.
      g.fillStyle = '#ff8a2a';
      g.shadowColor = '#ffb060';
      g.shadowBlur = 16;
      g.fillRect(b.x + (zone.c - zone.w / 2) * b.w, b.y + 3, zone.w * b.w, b.h - 6);
      g.shadowBlur = 0;
      g.fillStyle = '#fff2b0';
      g.fillRect(b.x + (zone.c - zone.w * 0.15) * b.w, b.y + 3, zone.w * 0.3 * b.w, b.h - 6);
      // The marker
      const mx = b.x + pos * b.w;
      g.fillStyle = '#fff';
      g.fillRect(mx - 3, b.y - 10, 6, b.h + 20);
      g.fillStyle = '#ffd34d';
      for (const s of sparks) {
        g.globalAlpha = 1 - s.t / 0.6;
        g.fillRect(s.x - 2, s.y - 2, 4, 4);
      }
      g.globalAlpha = 1;
    },
  };
}
