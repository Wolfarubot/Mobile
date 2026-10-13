import type { MinigameApi, MinigameGame } from './shell';
import { HUNTER_SHEETS } from '../../render/hunterSheets';
import { hunterSheetImage } from '../../render/sprites';

/**
 * Ba'al's Pixie Serenade (the Fey Grove): notes fall down three lanes, faster and faster. Tap a lane as its note
 * crosses the line: 1 point, 2 when it's dead on. A note that slips past, or a tap with no note there, costs a heart.
 */

export const PS_INTRO = '<p>Notes fall down three lanes. <b>Tap a lane</b> as its note crosses the glowing line: 1 point, 2 if it\'s dead on.</p><p>A note that slips past, or a tap on an empty lane, costs a heart.</p>';

const COLORS = ['#ff8ad8', '#8ad8ff', '#c8ff8a'];
/** Each lane's falling note: the bard pack's treble clef, notes and note in a circle. */
const LANE_ICONS = ['ab-priest-bard/067', 'ab-priest-bard/081', 'ab-priest-bard/095'];
/** Ba'al's guitar. */
const GUITAR = 'instruments/092';
/** Little pixel notes (♪ and ♫), drawn a pixel at a time: '#' is the note, rows top to bottom. */
const NOTE_GLYPHS = [
  ['..##.', '..#.#', '..#..', '..#..', '###..', '###..', '.#...'],
  ['.####', '.#..#', '.#..#', '.#..#', '##.##', '##.##'],
];

export function pixieSerenade(api: MinigameApi): MinigameGame {
  const notes: Array<{ lane: number; y: number; hit: boolean }> = [];
  const flash = [0, 0, 0];
  /** Notes floating up out of Ba'al's guitar after each hit. */
  const floaters: Array<{ x: number; y: number; vx: number; vy: number; t: number; color: string; glyph: number; sway: number }> = [];
  let strum = 0;
  const baal = () => ({ x: api.W / 2, y: api.H - 28 });
  const guitarAt = () => ({ x: baal().x + 6 * api.k, y: baal().y - 28 * api.k });
  let spawnIn = 0.8;
  const lineY = () => api.H - 150;
  const laneX = (i: number) => (api.W / 3) * (i + 0.5);
  const speed = () => Math.min(620, 200 + 5 * api.t) * api.k;
  const window = () => 40 * api.k;
  /** Ba'al at the bottom, facing you, with the guitar across them (rocking as they strum). */
  const drawBaal = (g: CanvasRenderingContext2D) => {
    const b = baal();
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.beginPath();
    g.ellipse(b.x, b.y + 4, 30 * api.k, 9 * api.k, 0, 0, Math.PI * 2);
    g.fill();
    const sheet = HUNTER_SHEETS.bard;
    const img = hunterSheetImage('bard');
    g.imageSmoothingEnabled = false;
    if (sheet && img && img.complete && img.naturalWidth) {
      const F = sheet.frame;
      const col = Math.floor(api.t * 8) % sheet.frames[0];
      const [bx, by, bw, bh] = sheet.box;
      const k = (88 * api.k) / Math.max(bw, bh);
      g.drawImage(img, col * F, 0, F, F, b.x - (bx + bw / 2) * k, b.y + 4 - (by + bh) * k, F * k, F * k);
    }
    // The guitar in front of them, neck up to their left; it jolts with each strum.
    const at = guitarAt();
    g.save();
    g.translate(at.x, at.y);
    g.rotate(-0.15 + Math.sin(strum * 40) * strum * 0.5);
    api.icon(GUITAR, 0, 0, 58 * api.k);
    g.restore();
  };

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
      // Ba'al strums, and notes drift up out of the guitar (more for a perfect hit).
      strum = 0.25;
      // They spring from the guitar's body, out to either side of Ba'al (leaning toward the lane that was hit).
      const at = guitarAt();
      for (let i = 0; i < (dead ? 3 : 2); i++) {
        const side = lane === 1 ? (i % 2 ? 1 : -1) : lane === 0 ? -1 : 1;
        floaters.push({ x: at.x + side * 26 * api.k, y: at.y + 6 * api.k, vx: side * (30 + Math.random() * 50) * api.k, vy: -(70 + Math.random() * 50) * api.k, t: 0, color: COLORS[lane], glyph: Math.random() < 0.5 ? 0 : 1, sway: Math.random() * 6 });
      }
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
      strum = Math.max(0, strum - dt);
      for (const f of floaters) {
        f.t += dt;
        f.x += (f.vx + Math.sin((f.t + f.sway) * 5) * 22 * api.k) * dt;
        f.y += f.vy * dt;
      }
      for (let i = floaters.length - 1; i >= 0; i--) if (floaters[i].t > 1.4) floaters.splice(i, 1);
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
        const size = 44 * api.k;
        // A glow in the lane's colour behind the note's icon.
        g.fillStyle = COLORS[n.lane];
        g.globalAlpha = 0.45;
        g.shadowColor = COLORS[n.lane];
        g.shadowBlur = 16;
        g.fillRect(x - size / 2 - 3, n.y - size / 2 - 3, size + 6, size + 6);
        g.shadowBlur = 0;
        g.globalAlpha = 1;
        g.imageSmoothingEnabled = false;
        api.icon(LANE_ICONS[n.lane], x, n.y, size);
      }
      drawBaal(g);
      // Notes drifting up from the guitar.
      for (const f of floaters) drawGlyph(g, NOTE_GLYPHS[f.glyph], f.x, f.y, Math.max(3, Math.round(4 * api.k)), f.color, Math.min(1, (1.4 - f.t) / 0.5));
    },
  };
}

/** A pixel glyph (rows of '#'), `px` screen pixels per pixel, centred at (x, y), with a dark outline. */
function drawGlyph(g: CanvasRenderingContext2D, rows: string[], x: number, y: number, px: number, color: string, alpha: number): void {
  const w = rows[0].length * px;
  const h = rows.length * px;
  const x0 = Math.round(x - w / 2);
  const y0 = Math.round(y - h / 2);
  g.globalAlpha = Math.max(0, alpha);
  for (const [dx, dy, c] of [[-1, 0, '#2a1640'], [1, 0, '#2a1640'], [0, -1, '#2a1640'], [0, 1, '#2a1640'], [0, 0, color]] as Array<[number, number, string]>) {
    g.fillStyle = c;
    rows.forEach((row, j) => {
      for (let i = 0; i < row.length; i++) if (row[i] === '#') g.fillRect(x0 + i * px + dx * px * 0.5, y0 + j * px + dy * px * 0.5, px, px);
    });
  }
  g.globalAlpha = 1;
}
