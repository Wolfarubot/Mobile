import type { MinigameApi, MinigameGame } from './shell';

/**
 * Wilhelm's Shooting Gallery (the Shadowy Depths): eyes open in the dark for a moment, quicker and quicker. Shoot
 * them before they blink shut (1 point, a red one 3). An eye that shuts unshot, or a shot lantern, costs a heart.
 */

export const SG_INTRO = '<p>Eyes open in the dark. <b>Tap them</b> before they blink shut: 1 point, a red eye 3.</p><p>An eye that closes unshot costs a heart, and so does shooting one of the lanterns.</p>';

interface Target {
  x: number;
  y: number;
  r: number;
  life: number;
  max: number;
  kind: 'eye' | 'red' | 'lantern';
  done: boolean;
}

export function shootingGallery(api: MinigameApi): MinigameGame {
  const targets: Target[] = [];
  let spawnIn = 0.6;
  const shots: Array<{ x: number; y: number; t: number }> = [];
  const place = (): { x: number; y: number } => {
    for (let tries = 0; tries < 20; tries++) {
      const x = 40 + Math.random() * (api.W - 80);
      const y = 110 + Math.random() * (api.H - 260);
      if (targets.every((o) => Math.hypot(o.x - x, o.y - y) > 70)) return { x, y };
    }
    return { x: api.W / 2, y: api.H / 2 };
  };
  return {
    tap(x, y) {
      shots.push({ x, y, t: 0 });
      let hit: Target | null = null;
      for (const o of targets) if (!o.done && Math.hypot(o.x - x, o.y - y) <= o.r + 8) hit = o;
      if (!hit) return; // a miss costs nothing but time
      hit.done = true;
      if (hit.kind === 'lantern') api.loseLife(hit.x, hit.y);
      else api.addScore(hit.kind === 'red' ? 3 : 1, hit.x, hit.y);
    },
    step(dt) {
      spawnIn -= dt;
      if (spawnIn <= 0) {
        const p = place();
        const r = Math.random();
        const kind: Target['kind'] = r < 0.22 ? 'lantern' : r < 0.32 ? 'red' : 'eye';
        const max = (kind === 'lantern' ? 2.2 : Math.max(0.65, 1.7 - api.t * 0.015)) * (kind === 'red' ? 0.7 : 1);
        targets.push({ ...p, r: (kind === 'red' ? 18 : 24) * api.k, life: max, max, kind, done: false });
        spawnIn = Math.max(0.3, 0.9 - api.t * 0.009);
      }
      for (let i = targets.length - 1; i >= 0; i--) {
        const o = targets[i];
        o.life -= dt;
        if (o.life <= 0) {
          if (!o.done && o.kind !== 'lantern') api.loseLife(o.x, o.y);
          targets.splice(i, 1);
        } else if (o.done) targets.splice(i, 1);
      }
      for (let i = shots.length - 1; i >= 0; i--) if ((shots[i].t += dt) > 0.25) shots.splice(i, 1);
    },
    draw(g) {
      // Darkness over the Depths.
      g.fillStyle = 'rgba(0,0,8,0.55)';
      g.fillRect(0, 0, api.W, api.H);
      for (const o of targets) {
        // Eyes open, then start to close in their last third.
        const open = Math.min(1, (o.max - o.life) / 0.12, o.life / (o.max / 3));
        if (o.kind === 'lantern') {
          g.fillStyle = 'rgba(255,200,90,0.25)';
          g.beginPath();
          g.arc(o.x, o.y, o.r * 1.8, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = '#3a2a1a';
          g.fillRect(o.x - o.r * 0.5, o.y - o.r * 0.9, o.r, o.r * 0.2);
          g.fillStyle = '#ffd36a';
          g.fillRect(o.x - o.r * 0.45, o.y - o.r * 0.7, o.r * 0.9, o.r * 1.2);
          g.fillStyle = '#3a2a1a';
          g.fillRect(o.x - o.r * 0.55, o.y + o.r * 0.5, o.r * 1.1, o.r * 0.2);
          continue;
        }
        g.save();
        g.translate(o.x, o.y);
        g.scale(1, Math.max(0.05, open));
        g.fillStyle = '#f4ecd8';
        g.beginPath();
        g.ellipse(0, 0, o.r, o.r * 0.62, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = o.kind === 'red' ? '#d8242c' : '#4a8a5a';
        g.beginPath();
        g.arc(0, 0, o.r * 0.42, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#000';
        g.beginPath();
        g.arc(0, 0, o.r * 0.2, 0, Math.PI * 2);
        g.fill();
        g.restore();
      }
      g.strokeStyle = '#ffe8a3';
      g.lineWidth = 2;
      for (const s of shots) {
        const r = 6 + s.t * 60;
        g.globalAlpha = 1 - s.t / 0.25;
        g.beginPath();
        g.arc(s.x, s.y, r, 0, Math.PI * 2);
        g.stroke();
      }
      g.globalAlpha = 1;
      api.icon('ab-gunslinger-druid/013', api.W / 2, api.H - 70, 56);
    },
  };
}
