import type { MinigameApi, MinigameGame } from './shell';
import { roundRect } from './shell';

/**
 * Ba'al's Pixie Serenade (the Fey Grove): notes fall down three lanes, faster and faster. Tap a lane as its note
 * crosses the line: 1 point, 2 when it's dead on. A note that slips past, or a tap with no note there, costs a heart.
 */

export const PS_INTRO = '<p>Notes fall down three lanes. <b>Tap a lane</b> as its note crosses the glowing line: 1 point, 2 if it\'s dead on.</p><p>A note that slips past, or a tap on an empty lane, costs a heart.</p>';

const COLORS = ['#ff8ad8', '#8ad8ff', '#c8ff8a'];

export function pixieSerenade(api: MinigameApi): MinigameGame {
  const notes: Array<{ lane: number; y: number; hit: boolean }> = [];
  const flash = [0, 0, 0];
  let spawnIn = 0.8;
  const lineY = () => api.H - 150;
  const laneX = (i: number) => (api.W / 3) * (i + 0.5);
  const speed = () => Math.min(620, 200 + 5 * api.t) * api.k;
  const window = () => 40 * api.k;
  return {
    tap(x) {
      const lane = Math.max(0, Math.min(2, Math.floor((x / api.W) * 3)));
      flash[lane] = 0.15;
      let best: (typeof notes)[number] | null = null;
      for (const n of notes) if (!n.hit && n.lane === lane && Math.abs(n.y - lineY()) <= window() && (!best || Math.abs(n.y - lineY()) < Math.abs(best.y - lineY()))) best = n;
      if (!best) {
        api.loseLife(laneX(lane), lineY());
        return;
      }
      best.hit = true;
      const dead = Math.abs(best.y - lineY()) <= window() * 0.35;
      api.addScore(dead ? 2 : 1, laneX(lane), lineY());
    },
    step(dt) {
      spawnIn -= dt;
      if (spawnIn <= 0) {
        notes.push({ lane: Math.floor(Math.random() * 3), y: -20, hit: false });
        spawnIn = Math.max(0.3, 0.95 - 0.012 * api.t) * (0.75 + Math.random() * 0.5);
      }
      for (const n of notes) n.y += speed() * dt;
      for (let i = notes.length - 1; i >= 0; i--) {
        const n = notes[i];
        if (!n.hit && n.y > lineY() + window()) {
          n.hit = true;
          api.loseLife(laneX(n.lane), lineY());
        }
        if (n.hit || n.y > api.H + 30) notes.splice(i, 1);
      }
      for (let i = 0; i < 3; i++) flash[i] = Math.max(0, flash[i] - dt);
    },
    draw(g) {
      const w = api.W / 3;
      for (let i = 0; i < 3; i++) {
        g.fillStyle = flash[i] > 0 ? 'rgba(255,255,255,0.25)' : 'rgba(20,10,40,0.35)';
        g.fillRect(i * w + 4, 0, w - 8, api.H);
      }
      // The line notes must be tapped on.
      g.fillStyle = 'rgba(255,240,160,0.9)';
      g.fillRect(0, lineY() - 3, api.W, 6);
      g.strokeStyle = 'rgba(255,240,160,0.35)';
      g.lineWidth = window() * 2;
      g.beginPath();
      g.moveTo(0, lineY());
      g.lineTo(api.W, lineY());
      g.stroke();
      for (const n of notes) {
        const x = laneX(n.lane);
        const r = 20 * api.k;
        g.fillStyle = COLORS[n.lane];
        g.shadowColor = COLORS[n.lane];
        g.shadowBlur = 14;
        g.beginPath();
        g.arc(x, n.y, r, 0, Math.PI * 2);
        g.fill();
        g.shadowBlur = 0;
        g.fillStyle = '#2a1640';
        g.font = `bold ${Math.round(24 * api.k)}px serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('♪', x, n.y + 1);
      }
      g.textBaseline = 'alphabetic';
      // Ba'al at the bottom, strumming.
      roundRect(g, api.W / 2 - 34, api.H - 112, 68, 68, 12);
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.fill();
      api.icon('ab-priest-bard/086', api.W / 2, api.H - 78, 56);
    },
  };
}
