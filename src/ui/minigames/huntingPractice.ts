import { SHEETS, sheetRow } from '../../render/monsterSheets';
import { HUNTER_SHEETS } from '../../render/hunterSheets';
import { hunterSheetImage, monsterSheetImage } from '../../render/sprites';
import type { MinigameApi, MinigameGame } from './shell';

/**
 * Galladair's Hunting Practice (the Wandering Woods): slimes hop across the clearing from either side, faster and
 * faster. Tap to aim Galladair's arrows from the bottom of the screen. A green slime is 1 point, a rare golden one
 * 3. Three slimes that make it across end the round.
 */

export const HP_LIVES = 3;
const SHOT_COOLDOWN = 0.22;
const ARROW_SPEED = 950;
const GOLDEN_CHANCE = 0.12;

export const HP_INTRO = `<p>Slimes hop across the clearing, faster and faster. <b>Tap</b> to send Galladair's arrows at them.</p><p>Green slimes are 1 point, golden ones 3. Let ${HP_LIVES} get across and practice is over.</p>`;

/** The round's difficulty after `t` seconds: slime speed (px/s at a 400px-wide screen) and seconds between slimes. */
export function hpDifficulty(t: number): { speed: number; gap: number } {
  return { speed: Math.min(430, 40 + 6 * t), gap: Math.max(0.42, 1.7 - 0.022 * t) };
}

interface Slime {
  x: number;
  base: number;
  hop: number;
  phase: number;
  vx: number;
  r: number;
  golden: boolean;
  dead: boolean;
}

export function huntingPractice(api: MinigameApi): MinigameGame {
  const slimes: Slime[] = [];
  const arrows: Array<{ x: number; y: number; vx: number; vy: number }> = [];
  let spawnIn = 0.6;
  let shotCd = 0;
  let aim = -Math.PI / 2;
  const archer = () => ({ x: api.W / 2, y: api.H - 70 });
  const slimeSheet = SHEETS['slime-green'];
  const archerSheet = HUNTER_SHEETS.ranger;

  const spawn = () => {
    const { speed } = hpDifficulty(api.t);
    const fromLeft = Math.random() < 0.5;
    const golden = Math.random() < GOLDEN_CHANCE;
    const r = (golden ? 21 : 25) * api.k;
    const top = 90;
    const bottom = api.H - 190;
    slimes.push({
      x: fromLeft ? -r : api.W + r,
      base: top + Math.random() * Math.max(40, bottom - top),
      hop: (22 + Math.random() * 30) * api.k,
      phase: Math.random() * Math.PI,
      vx: (fromLeft ? 1 : -1) * speed * api.k * (golden ? 1.35 : 0.85 + Math.random() * 0.3),
      r,
      golden,
      dead: false,
    });
  };

  return {
    tap(x, y) {
      if (shotCd > 0) return;
      const a = archer();
      aim = Math.max(-Math.PI + 0.08, Math.min(-0.08, Math.atan2(y - a.y, x - a.x)));
      arrows.push({ x: a.x, y: a.y - 20, vx: Math.cos(aim) * ARROW_SPEED, vy: Math.sin(aim) * ARROW_SPEED });
      shotCd = SHOT_COOLDOWN;
    },
    step(dt) {
      shotCd = Math.max(0, shotCd - dt);
      spawnIn -= dt;
      if (spawnIn <= 0) {
        spawn();
        spawnIn = hpDifficulty(api.t).gap * (0.7 + Math.random() * 0.6);
      }
      for (const s of slimes) {
        s.x += s.vx * dt;
        s.phase += dt * (s.golden ? 6 : 4.5);
        if (!s.dead && (s.vx > 0 ? s.x > api.W + s.r : s.x < -s.r)) {
          s.dead = true;
          api.loseLife(s.vx > 0 ? api.W - 30 : 30, s.base);
        }
      }
      for (const a of arrows) {
        a.x += a.vx * dt;
        a.y += a.vy * dt;
        for (const s of slimes) {
          if (s.dead) continue;
          const sy = s.base - Math.abs(Math.sin(s.phase)) * s.hop;
          if (Math.hypot(a.x - s.x, a.y - sy) < s.r + 6) {
            s.dead = true;
            a.y = -9999;
            api.addScore(s.golden ? 3 : 1, s.x, sy);
            break;
          }
        }
      }
      for (let i = arrows.length - 1; i >= 0; i--) if (arrows[i].y < -40 || arrows[i].x < -40 || arrows[i].x > api.W + 40) arrows.splice(i, 1);
      for (let i = slimes.length - 1; i >= 0; i--) if (slimes[i].dead) slimes.splice(i, 1);
    },
    draw(g) {
      g.imageSmoothingEnabled = false;
      const sImg = monsterSheetImage('slime-green');
      for (const s of slimes) {
        const lift = Math.abs(Math.sin(s.phase)) * s.hop;
        const y = s.base - lift;
        g.fillStyle = 'rgba(0,0,0,0.25)';
        g.beginPath();
        g.ellipse(s.x, s.base + s.r * 0.55, s.r * (0.9 - lift / (s.hop * 3)), s.r * 0.3, 0, 0, Math.PI * 2);
        g.fill();
        if (sImg.complete && sImg.naturalWidth) {
          const F = slimeSheet.frame;
          const row = sheetRow(slimeSheet, s.vx > 0 ? 'R' : 'L');
          const col = Math.floor(s.phase * 2) % slimeSheet.cols;
          const k = (s.r * 2.2) / slimeSheet.box[2];
          g.save();
          if (s.golden) g.filter = 'hue-rotate(-70deg) saturate(2.2) brightness(1.25)';
          g.drawImage(sImg, col * F, row * F, F, F, s.x - (slimeSheet.box[0] + slimeSheet.box[2] / 2) * k, y + s.r * 0.6 - (slimeSheet.box[1] + slimeSheet.box[3]) * k, F * k, F * k);
          g.restore();
        } else {
          g.fillStyle = s.golden ? '#ffd34d' : '#7be07b';
          g.beginPath();
          g.arc(s.x, y, s.r, 0, Math.PI * 2);
          g.fill();
        }
      }
      g.strokeStyle = '#f4e2b8';
      g.lineWidth = 3;
      for (const a of arrows) {
        const d = Math.hypot(a.vx, a.vy);
        const ux = a.vx / d;
        const uy = a.vy / d;
        g.beginPath();
        g.moveTo(a.x - ux * 22, a.y - uy * 22);
        g.lineTo(a.x, a.y);
        g.stroke();
        g.fillStyle = '#d8d8e0';
        g.beginPath();
        g.moveTo(a.x + ux * 7, a.y + uy * 7);
        g.lineTo(a.x - uy * 4, a.y + ux * 4);
        g.lineTo(a.x + uy * 4, a.y - ux * 4);
        g.fill();
      }
      const ar = archer();
      g.fillStyle = 'rgba(0,0,0,0.3)';
      g.beginPath();
      g.ellipse(ar.x, ar.y + 30, 20, 7, 0, 0, Math.PI * 2);
      g.fill();
      // The bow first, so Galladair stands in front of it.
      g.save();
      g.translate(ar.x, ar.y - 4);
      g.rotate(aim + Math.PI / 4);
      api.icon('weapons/031', 0, 0, 58);
      g.restore();
      const hImg = hunterSheetImage('ranger');
      if (hImg && archerSheet) {
        const F = archerSheet.frame;
        const row = 3; // facing up
        const col = Math.floor(api.t * 8) % archerSheet.frames[row];
        const [bx, by, bw, bh] = archerSheet.box;
        const k = 52 / Math.max(bw, bh);
        g.drawImage(hImg, col * F, row * F, F, F, ar.x - (bx + bw / 2) * k, ar.y + 32 - (by + bh) * k, F * k, F * k);
      }
    },
  };
}
