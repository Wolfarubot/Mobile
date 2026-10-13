import { TITLE_Y, type MinigameApi, type MinigameGame } from './shell';
import { mgArt } from './dpad';
import { GEAR, WEAPON_CLASSES } from '../../core/balance';
import { GEAR_SPRITES } from '../../core/gearSprites';
import { HUNTER_SHEETS } from '../../render/hunterSheets';
import { gearImage, hunterSheetImage } from '../../render/sprites';
import { drawFramedBar, drawFramedSegments, framedSlot } from '../../render/hudBars';

/**
 * Kargesh's Forge Strike (the Ember Mines): Kargesh at his anvil beside a vent of the mine's fire, a glowing ingot
 * before him. A marker swings along the strike bar; tap while it's in the sweet spot and his hammer lands: 1 point,
 * 2 dead centre. Five strikes hammer the ingot into a finished weapon, set on the rack (3 more if no strike on it
 * missed). The metal cools as he works (the bar under the title): forge it before it goes cold, or it's spoiled and a
 * heart is lost; a strike outside the sweet spot costs a heart too. The swing quickens, the spot shrinks and the
 * metal cools faster with every piece.
 */

export const FS_INTRO = '<p>Kargesh is at the anvil. <b>Tap</b> when the marker is in the bright sweet spot: 1 point, 2 dead centre. Five strikes forge a weapon (3 more if none missed).</p><p>The metal <b>cools</b> as you work: forge it before it goes cold. A cold piece or a missed strike costs a heart.</p>';

/** The mine far behind the forge, at half size and shaded (the forge stands out in front). */
export const FS_DECOR = { bands: 4, density: 1, scale: 0.5 };

/** Strikes to forge a piece. */
const STRIKES = 5;
/** The anvil, the ingot (resources pack) and Kargesh's hammer (the Forge Hammer's icon). */
const ANVIL = 'resources3/020';
const INGOT = 'resources3/044';
const HAMMER = 'weapons/057';

/** Melee weapons' icons, for the finished pieces (one picked for each). */
let finished: string[] | null = null;
function finishedIcons(): string[] {
  if (!finished) {
    const melee = new Set(Object.entries(WEAPON_CLASSES).filter(([, c]) => ['sweep', 'stab', 'slam', 'dagger'].includes(c.attack)).map(([id]) => id));
    finished = GEAR.filter((g) => g.weaponClass && melee.has(g.weaponClass) && GEAR_SPRITES[g.id]).map((g) => GEAR_SPRITES[g.id]);
    if (!finished.length) finished = [HAMMER];
  }
  return finished;
}

/** The metal's glow at a heat (1 white-hot, falling through orange to a dull red, then none). */
function glow(heat: number): [string, number] {
  if (heat > 0.66) return ['#fff2b0', 0.75];
  if (heat > 0.33) return ['#ff8a2a', 0.65];
  if (heat > 0.08) return ['#b0301a', 0.55];
  return ['#000000', 0];
}

/** The ingot in a glow colour (its own shape filled with the colour), made once per colour. */
const glows = new Map<string, HTMLCanvasElement>();
function glowing(img: HTMLImageElement, color: string): HTMLCanvasElement {
  let c = glows.get(color);
  if (!c) {
    c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const x = c.getContext('2d')!;
    x.drawImage(img, 0, 0);
    x.globalCompositeOperation = 'source-atop';
    x.fillStyle = color;
    x.fillRect(0, 0, c.width, c.height);
    glows.set(color, c);
  }
  return c;
}

export function forgeStrike(api: MinigameApi): MinigameGame {
  let pos = 0; // 0..1 along the bar
  let dir = 1;
  let zone = { c: 0.5, w: 0.24 };
  let strikes = 0;
  /** This piece: strikes on it, whether any missed, and its heat (1 → 0). */
  let hits = 0;
  let clean = true;
  let heat = 1;
  /** Seconds before a fresh ingot is on the anvil (after a piece is finished or spoiled). */
  let fresh = 0;
  let pieces = 0;
  const rack: string[] = [];
  /** A finished piece flying from the anvil to the rack. */
  let flying: { icon: string; t: number } | null = null;
  /** Seconds since the hammer last came down, and whether it hit. */
  let swing = 9;
  let swingHit = true;
  const sparks: Array<{ x: number; y: number; vx: number; vy: number; t: number; color: string }> = [];

  /** Swing speed (bar widths a second), sweet-spot width, and seconds a piece stays hot, by progress. */
  const speed = () => Math.min(1.8, 0.7 + strikes * 0.03);
  const coolTime = () => Math.max(3.6, 7.5 - pieces * 0.35);
  const newZone = () => {
    const w = Math.max(0.1, 0.24 - strikes * 0.004);
    zone = { c: w / 2 + Math.random() * (1 - w), w };
  };

  // The forge, low on the screen: the anvil in the middle, Kargesh to its left, the fire vent behind on the right.
  const IS = () => (api.k > 1.3 ? 3 : 2);
  const anvil = () => ({ x: api.W / 2 + 10 * api.k, y: api.H - 150 * api.k });
  const kargesh = () => ({ x: anvil().x - 58 * api.k, y: anvil().y + 34 * api.k });
  /** His hammer hand. */
  const hand = () => ({ x: kargesh().x + 14 * api.k, y: kargesh().y - 66 * api.k });
  const vent = () => ({ x: api.W - 70 * api.k, y: anvil().y - 30 * api.k });
  /** The rack along the bottom: where the n-th finished piece stands. */
  const rackAt = (n: number) => {
    const per = Math.max(1, Math.floor((api.W - 40) / (34 * api.k)));
    return { x: 20 + 17 * api.k + (n % per) * 34 * api.k, y: api.H - 40 * api.k - Math.floor(n / per) * 8 * api.k };
  };
  /** The strike bar: frame pixels and scale, and its top-left. */
  const BS = 3;
  const bar = () => {
    const nw = Math.floor(Math.min(api.W - 40, 420) / BS);
    const nh = 12;
    return { nw, nh, x: Math.round((api.W - nw * BS) / 2), y: Math.round(api.H * 0.46) };
  };
  /** The marker's x on screen (along the bar's slot). */
  const markerX = () => {
    const b = bar();
    const sl = framedSlot(b.nw, b.nh) ?? [0, 1];
    return b.x + (sl[0] + (sl[1] - sl[0]) * pos) * b.nw * BS;
  };
  const ingotTop = () => ({ x: anvil().x, y: anvil().y - 15 * IS() });

  const burst = (x: number, y: number, n: number, colors: string[], up: number) => {
    for (let i = 0; i < n; i++) sparks.push({ x, y, vx: (Math.random() - 0.5) * 320 * api.k, vy: -Math.random() * up * api.k, t: 0, color: colors[i % colors.length] });
  };

  return {
    titleSuffix: () => `${pieces} forged`,
    tap() {
      if (fresh > 0) return;
      swing = 0;
      const off = Math.abs(pos - zone.c);
      const it = ingotTop();
      if (off <= zone.w / 2) {
        swingHit = true;
        strikes++;
        hits++;
        api.addScore(off <= zone.w * 0.15 ? 2 : 1, it.x, it.y - 30 * api.k);
        burst(it.x, it.y, 16, ['#ffd34d', '#fff2b0', '#ff8a2a'], 420);
        newZone();
        if (hits >= STRIKES) {
          // Finished: onto the rack.
          const icons = finishedIcons();
          flying = { icon: icons[Math.floor(Math.random() * icons.length)], t: 0 };
          pieces++;
          if (clean) {
            api.addScore(3);
            api.pop(it.x, it.y - 56 * api.k, 'Flawless! +3', '#ffd34d');
          } else api.pop(it.x, it.y - 56 * api.k, 'Forged!', '#ffb866');
          hits = 0;
          clean = true;
          fresh = 0.5;
        }
      } else {
        // A dull clang off the side of the anvil.
        swingHit = false;
        clean = false;
        burst(it.x, it.y, 6, ['#8a8494', '#5d5866'], 160);
        api.loseLife(it.x, it.y - 30 * api.k);
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
      swing += dt;
      if (fresh > 0) {
        fresh -= dt;
        if (fresh <= 0) heat = 1;
      } else {
        heat -= dt / coolTime();
        if (heat <= 0) {
          // Gone cold: spoiled, and back to the fire for a new ingot.
          const it = ingotTop();
          api.loseLife(it.x, it.y - 30 * api.k);
          api.pop(it.x, it.y - 56 * api.k, 'Too cold!', '#8ab4ff');
          burst(it.x, it.y, 8, ['#5d5866'], 120);
          hits = 0;
          clean = true;
          heat = 0;
          fresh = 0.8;
        }
      }
      if (flying) {
        flying.t += dt;
        if (flying.t >= 0.5) {
          rack.push(flying.icon);
          flying = null;
        }
      }
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.t += dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.vy += 900 * api.k * dt;
        if (s.t > 0.6) sparks.splice(i, 1);
      }
    },
    draw(g) {
      g.imageSmoothingEnabled = false;
      // The mine, shaded, behind the forge.
      g.fillStyle = 'rgba(12,4,2,0.35)';
      g.fillRect(0, 0, api.W, api.H);

      // Under the title, the metal's heat: the battlefield's framed event timer.
      const HS = 2;
      const hw = Math.floor(Math.min(api.W * 0.8, 360) / HS);
      const hx = Math.round((api.W - hw * HS) / 2);
      const shown = fresh > 0 ? 0 : heat;
      if (!drawFramedBar(g, hx, TITLE_Y + 16, HS, hw, 9, shown, shown < 0.33 ? '#c0402a' : shown < 0.66 ? '#ff8a2a' : '#ffd36a')) {
        g.fillStyle = '#ff8a2a';
        g.fillRect(hx, TITLE_Y + 16, hw * HS * shown, 10);
      }

      // The strike bar: a dark trough with the glowing sweet spot (its dead centre brighter), and the marker above.
      const b = bar();
      const seg: Array<[number, number, string]> = [
        [0, 1, '#4a2216'],
        [zone.c - zone.w / 2, zone.c + zone.w / 2, '#ff8a2a'],
        [zone.c - zone.w * 0.15, zone.c + zone.w * 0.15, '#fff2b0'],
      ];
      if (!drawFramedSegments(g, b.x, b.y, BS, b.nw, b.nh, seg)) {
        g.fillStyle = '#4a2216';
        g.fillRect(b.x, b.y, b.nw * BS, b.nh * BS);
      }
      const arrow = mgArt('arrow-down');
      const mx = markerX();
      if (arrow) {
        const as = 3;
        g.drawImage(arrow, Math.round(mx - (arrow.naturalWidth * as) / 2), b.y - arrow.naturalHeight * as - 2, arrow.naturalWidth * as, arrow.naturalHeight * as);
      }
      g.fillStyle = '#ffffff';
      g.fillRect(Math.round(mx - 2), b.y + 4, 4, b.nh * BS - 8);

      // The fire vent behind the anvil, flaring as he works.
      const v = mgArt('forge-vent');
      const vs = IS();
      const vp = vent();
      if (v) {
        const pulse = 0.55 + Math.sin(api.t * 6) * 0.1;
        const gl = g.createRadialGradient(vp.x, vp.y, 4, vp.x, vp.y, 80 * api.k);
        gl.addColorStop(0, `rgba(255,140,40,${pulse})`);
        gl.addColorStop(1, 'rgba(255,140,40,0)');
        g.fillStyle = gl;
        g.fillRect(vp.x - 90 * api.k, vp.y - 90 * api.k, 180 * api.k, 180 * api.k);
        g.drawImage(v, Math.round(vp.x - (v.naturalWidth * vs) / 2), Math.round(vp.y - (v.naturalHeight * vs) / 2), v.naturalWidth * vs, v.naturalHeight * vs);
      }

      // The anvil, and the ingot on it: hammered flatter and longer with each strike, glowing by its heat.
      const an = anvil();
      const s = IS();
      api.icon(ANVIL, an.x, an.y, 32 * s);
      const it = ingotTop();
      if (fresh <= 0 || heat > 0) {
        const ix = 1 + hits * 0.14;
        const iy = 1 - hits * 0.1;
        g.save();
        g.translate(it.x, it.y);
        g.scale(ix, iy);
        api.icon(INGOT, 0, 0, 24 * s);
        const [col, a] = glow(heat);
        const ing = gearImage(INGOT);
        if (ing && a > 0 && fresh <= 0) {
          g.globalAlpha = a * (0.85 + Math.sin(api.t * 10) * 0.1);
          g.drawImage(glowing(ing, col), -12 * s, -12 * s, 24 * s, 24 * s);
          g.globalAlpha = 1;
        }
        g.restore();
      }

      // Kargesh, facing the anvil, his hammer raised, then brought down on each tap.
      const kp = kargesh();
      const sheet = HUNTER_SHEETS.blacksmith;
      const img = hunterSheetImage('blacksmith');
      if (sheet && img && img.complete && img.naturalWidth) {
        const F = sheet.frame;
        const col = Math.floor(api.t * 6) % sheet.frames[2];
        const [bx, by, bw, bh] = sheet.box;
        const k = (100 * api.k) / bh;
        g.drawImage(img, col * F, 2 * F, F, F, kp.x - (bx + bw / 2) * k, kp.y - (by + bh) * k, F * k, F * k);
      }
      // Raised over his shoulder at rest; down onto the ingot in 0.1s (past it, onto the anvil's side, on a miss),
      // back up over 0.3s.
      const hd = hand();
      const strike = Math.atan2(it.y - hd.y, it.x - hd.x) + (swingHit ? 0 : 0.45);
      const rest = strike - 2.3;
      const down = swing < 0.1 ? swing / 0.1 : swing < 0.4 ? 1 - (swing - 0.1) / 0.3 : 0;
      const hs = Math.hypot(it.x - hd.x, it.y - hd.y) * 0.95;
      g.save();
      g.translate(hd.x, hd.y);
      // The icon points up-right with its grip at the bottom-left: turned to the swing, held by its end.
      g.rotate(rest + (strike - rest) * down + Math.PI / 4);
      api.icon(HAMMER, hs * 0.3, -hs * 0.3, hs);
      g.restore();

      // Sparks.
      for (const sp of sparks) {
        g.globalAlpha = Math.max(0, 1 - sp.t / 0.6);
        g.fillStyle = sp.color;
        const ps = Math.max(2, Math.round(3 * api.k));
        g.fillRect(Math.round(sp.x), Math.round(sp.y), ps, ps);
      }
      g.globalAlpha = 1;

      // The rack of finished pieces along the bottom, and one on its way there.
      const RS = 30 * api.k;
      g.fillStyle = 'rgba(60,30,16,0.85)';
      g.fillRect(8, api.H - 26 * api.k, api.W - 16, 6 * api.k);
      rack.forEach((icon, n) => {
        const r = rackAt(n);
        api.icon(icon, r.x, r.y - RS / 2, RS);
      });
      if (flying) {
        const p = flying.t / 0.5;
        const to = rackAt(rack.length);
        const x = it.x + (to.x - it.x) * p;
        const y = it.y + (to.y - RS / 2 - it.y) * p - Math.sin(Math.PI * p) * 80 * api.k;
        api.icon(flying.icon, x, y, RS * (1.4 - 0.4 * p));
      }
    },
  };
}
