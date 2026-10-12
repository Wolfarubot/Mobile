import { SHEETS, sheetRow } from '../../render/monsterSheets';
import { HUNTER_SHEETS } from '../../render/hunterSheets';
import { scenePiece } from '../../render/backgrounds';
import { hunterSheetImage, monsterSheetImage } from '../../render/sprites';
import type { MinigameApi, MinigameGame } from './shell';

/**
 * Galladair's Hunting Practice (the Wandering Woods): slimes hop across the clearing from either side, faster and
 * faster. Tap to aim Galladair's arrows from the bottom of the screen. A green slime is 1 point, a rare golden one
 * 3. Three slimes that make it across end the round. A few great trees and boulders stand in the clearing: they
 * stop arrows, and a slime hopping behind one is hidden by it.
 */

export const HP_LIVES = 3;
const SHOT_COOLDOWN = 0.22;
const ARROW_SPEED = 950;
const GOLDEN_CHANCE = 0.12;

/** Only the Woods' small ground details, and fewer of them: the clearing's trees, rocks and bushes are the game's. */
export const HP_DECOR = { bands: 1, density: 0.5 };
/** The clearing's objects: [pieces, how many, drawn scale, whether they stop arrows]. */
const PROPS: Array<[string[], number, number, boolean]> = [
  [['Tree1', 'Tree2', 'Tree3', 'Tree4'], 2, 1.4, true],
  [['Rpck_grass1', 'Rpck_grass2', 'Rpck_grass3', 'Rpck_grass4', 'Stone1_grass_shadow', 'Stone2_grass_shadow'], 2, 1.1, true],
  [['Bush1', 'Bush2', 'Bush3', 'Bush4', 'Bush5', 'Bush6'], 3, 1, false],
];

interface Prop {
  img: HTMLImageElement;
  x: number;
  y: number;
  scale: number;
  solid: boolean;
  /** Where it stands (its lowest solid pixel), for drawing nearer things over farther ones. */
  foot: number;
  mask: Uint8ClampedArray;
}

/** A piece's alpha channel and the lowest row that's solid (its shadow doesn't count). */
const masks = new Map<HTMLImageElement, { alpha: Uint8ClampedArray; foot: number }>();
function maskOf(img: HTMLImageElement): { alpha: Uint8ClampedArray; foot: number } {
  let m = masks.get(img);
  if (!m) {
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const g = c.getContext('2d')!;
    g.drawImage(img, 0, 0);
    const data = g.getImageData(0, 0, c.width, c.height).data;
    const alpha = new Uint8ClampedArray(c.width * c.height);
    let foot = 0;
    for (let i = 0; i < alpha.length; i++) {
      alpha[i] = data[i * 4 + 3];
      if (alpha[i] > 200) foot = Math.floor(i / c.width);
    }
    m = { alpha, foot: foot + 1 };
    masks.set(img, m);
  }
  return m;
}

/** Whether (x, y) is on a solid pixel of the prop. */
function propHit(p: Prop, x: number, y: number): boolean {
  const ix = Math.floor((x - p.x) / p.scale);
  const iy = Math.floor((y - p.y) / p.scale);
  const w = p.img.naturalWidth;
  if (ix < 0 || iy < 0 || ix >= w || iy >= p.img.naturalHeight) return false;
  return p.mask[iy * w + ix] > 200;
}

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
  const arrows: Array<{ x: number; y: number; vx: number; vy: number; stuck: number }> = [];
  let props: Prop[] | null = null;
  /** Lays out the clearing once its pieces are in: trees toward the sides, rocks and bushes anywhere, none touching. */
  const layout = (): Prop[] | null => {
    const want = PROPS.flatMap(([files, n, scale, solid]) => Array.from({ length: n }, (_, i) => ({ files, scale, solid, i })));
    const imgs = want.map((w) => scenePiece('forest', w.files[Math.floor(Math.random() * w.files.length)]));
    if (imgs.some((x) => !x)) return null;
    const out: Prop[] = [];
    const boxes: Array<[number, number, number, number]> = [];
    want.forEach((w, n) => {
      const img = imgs[n]!;
      const scale = w.scale * api.k;
      const pw = img.naturalWidth * scale;
      const ph = img.naturalHeight * scale;
      for (let tries = 0; tries < 60; tries++) {
        // Trees lean over the sides (one each side); the rest keep inside the field, all above Galladair.
        const cx = w.files[0] === 'Tree1' ? (w.i % 2 ? 0.8 : 0.2) * api.W + (Math.random() - 0.5) * api.W * 0.2 : 40 + Math.random() * (api.W - 80);
        const bottom = 150 + Math.random() * Math.max(10, api.H - 220 - 150);
        const box: [number, number, number, number] = [cx - pw / 2, bottom - ph, pw, ph];
        const pad = 12;
        if (tries < 59 && boxes.some((b) => box[0] < b[0] + b[2] + pad && b[0] < box[0] + box[2] + pad && box[1] < b[1] + b[3] + pad && b[1] < box[1] + box[3] + pad)) continue;
        boxes.push(box);
        const m = maskOf(img);
        out.push({ img, x: box[0], y: box[1], scale, solid: w.solid, foot: box[1] + m.foot * scale, mask: m.alpha });
        break;
      }
    });
    return out;
  };
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

  /** Where a slime stands: its shadow's line, whatever the height of its hop. */
  const slimeFoot = (s: Slime) => s.base + s.r * 0.6;

  return {
    tap(x, y) {
      if (shotCd > 0) return;
      const a = archer();
      aim = Math.max(-Math.PI + 0.08, Math.min(-0.08, Math.atan2(y - a.y, x - a.x)));
      arrows.push({ x: a.x, y: a.y - 20, vx: Math.cos(aim) * ARROW_SPEED, vy: Math.sin(aim) * ARROW_SPEED, stuck: 0 });
      shotCd = SHOT_COOLDOWN;
    },
    step(dt) {
      shotCd = Math.max(0, shotCd - dt);
      if (!props) props = layout();
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
      // Arrows fly in short steps so none slips through a trunk. Whatever's drawn in front at the tip takes the
      // arrow: a slime ahead of a tree is hit, one behind it is shielded and the arrow sticks in the bark.
      for (const a of arrows) {
        if (a.stuck) {
          a.stuck += dt;
          continue;
        }
        const steps = Math.ceil((Math.hypot(a.vx, a.vy) * dt) / 4);
        for (let n = 0; n < steps && !a.stuck && a.y > -40; n++) {
          a.x += (a.vx * dt) / steps;
          a.y += (a.vy * dt) / steps;
          let slime: Slime | null = null;
          let sy = 0;
          for (const s of slimes) {
            if (s.dead) continue;
            const y = s.base - Math.abs(Math.sin(s.phase)) * s.hop;
            if (Math.hypot(a.x - s.x, a.y - y) < s.r + 6 && (!slime || s.base > slime.base)) {
              slime = s;
              sy = y;
            }
          }
          let prop: Prop | null = null;
          for (const p of props ?? []) if (p.solid && propHit(p, a.x, a.y) && (!prop || p.foot > prop.foot)) prop = p;
          if (prop && (!slime || prop.foot > slimeFoot(slime))) a.stuck = 1e-6;
          else if (slime) {
            slime.dead = true;
            a.y = -9999;
            api.addScore(slime.golden ? 3 : 1, slime.x, sy);
          }
        }
      }
      for (let i = arrows.length - 1; i >= 0; i--) if (arrows[i].stuck > 1.2 || arrows[i].y < -40 || arrows[i].x < -40 || arrows[i].x > api.W + 40) arrows.splice(i, 1);
      for (let i = slimes.length - 1; i >= 0; i--) if (slimes[i].dead) slimes.splice(i, 1);
    },
    draw(g) {
      g.imageSmoothingEnabled = false;
      const sImg = monsterSheetImage('slime-green');
      const drawSlime = (s: Slime) => {
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
      };
      // Slimes and the clearing's objects, farthest first, so a slime behind a tree is hidden by it.
      const scene: Array<{ foot: number; draw: () => void }> = [
        ...(props ?? []).map((p) => ({ foot: p.foot, draw: () => g.drawImage(p.img, p.x, p.y, p.img.naturalWidth * p.scale, p.img.naturalHeight * p.scale) })),
        ...slimes.map((s) => ({ foot: slimeFoot(s), draw: () => drawSlime(s) })),
      ].sort((a, b) => a.foot - b.foot);
      for (const it of scene) it.draw();
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
