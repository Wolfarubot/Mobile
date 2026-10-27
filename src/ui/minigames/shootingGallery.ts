import { drawEffect } from './art';
import { TITLE_Y, type MinigameApi, type MinigameGame } from './shell';
import { mgArt } from './dpad';
import { HUNTER_SHEETS } from '../../render/hunterSheets';
import { hunterSheetImage } from '../../render/sprites';
import { drawFramedBar, TIMER_COLOR } from '../../render/hudBars';

/**
 * Wilhelm's Shooting Gallery (the Shadowy Depths): the creature with a hundred eyes, from his story. Its eyes open
 * among the growths one after another, quicker and quicker, and close again: shoot them while they're open. There
 * are exactly 100, so the round lasts as long as they do and the best score is all of them: 1 point an eye, 3 for a
 * red one (quicker to shut). Shooting one of the ghost-flame lanterns costs 3. Wilhelm stands on a ledge in the
 * bottom-left corner, over the nest far below (drawn at half size), and turns his rifle on each shot (a flash at the barrel, a tracer to the crosshair, a puff where it lands).
 */

export const SG_EYES = 100;
export const SG_INTRO = `<p>The creature with a hundred eyes is here. Its eyes open in the dark: <b>tap them</b> before they shut. 1 point an eye, 3 for a <b>red</b> one.</p><p>Leave the ghost-flame <b>lanterns</b> be: shooting one costs 3 points. The hunt ends after all ${SG_EYES} eyes.</p>`;

/** The nest far below Wilhelm's ledge: all of it, drawn at half size (further off). */
export const SG_DECOR = { bands: 4, density: 1, scale: 0.5 };

/** What a lantern costs to shoot. */
const LANTERN_COST = 3;
/** The rifle (the Gloomstalker Rifle's icon). */
const RIFLE = 'weapons5/030';
const LANTERN_FRAMES = 6;

interface Target {
  x: number;
  y: number;
  life: number;
  max: number;
  kind: 'eye' | 'red' | 'lantern';
  done: boolean;
  /** Seconds since it appeared (animates the lanterns). */
  t: number;
}

/**
 * The eye, its edges faded out (an oval falloff round its middle) so it seems to open up out of the ground; and
 * the red eye, its greens turned red. Made once each.
 */
const eyes = new Map<string, HTMLCanvasElement>();
function eyeOf(img: HTMLImageElement, red: boolean): HTMLCanvasElement {
  const key = red ? 'red' : 'eye';
  let c = eyes.get(key);
  if (!c) {
    c = document.createElement('canvas');
    const w = (c.width = img.naturalWidth);
    const h = (c.height = img.naturalHeight);
    const x = c.getContext('2d')!;
    x.drawImage(img, 0, 0);
    if (red) {
      // Every colour turned red (the iris bright, the rim a dark red), keeping the eye's shading.
      x.globalCompositeOperation = 'color';
      x.fillStyle = '#ff2626';
      x.fillRect(0, 0, w, h);
      x.globalCompositeOperation = 'destination-in';
      x.drawImage(img, 0, 0);
    }
    x.globalCompositeOperation = 'destination-in';
    x.translate(w / 2, h / 2);
    x.scale(1, 0.72);
    const fade = x.createRadialGradient(0, 0, w * 0.22, 0, 0, w * 0.5);
    fade.addColorStop(0, 'rgba(0,0,0,1)');
    fade.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = fade;
    x.fillRect(-w, -h * 2, w * 2, h * 4);
    eyes.set(key, c);
  }
  return c;
}

export function shootingGallery(api: MinigameApi): MinigameGame {
  const targets: Target[] = [];
  let spawned = 0;
  let spawnIn = 0.8;
  let lanternIn = 2.5;
  /** Wilhelm's aim (radians, up is -π/2) and the moment of his last shot. */
  let aim = -Math.PI / 2;
  let fired = -1;
  const shots: Array<{ x: number; y: number; t: number; hit: boolean }> = [];
  const puffs: Array<{ x: number; y: number; vx: number; vy: number; t: number; color: string }> = [];
  /** The eye's pixel scale. */
  const S = () => (api.k > 1.3 ? 3 : 2);
  /**
   * The ledge Wilhelm stands on, in the bottom-left corner (a chunk of the cave's earth, its roots hanging off the
   * bottom of the screen): its pixel scale and top-left corner. Wilhelm stands in the middle of its flat top.
   */
  const LEDGE_W = 41;
  const LEDGE_TOP = 36;
  const ledge = () => {
    const L = Math.max(3, Math.round(4 * api.k));
    return { L, x: -4 * L, y: Math.round(api.H - 52 * L) };
  };
  const wilhelm = () => {
    const l = ledge();
    return { x: l.x + (LEDGE_W * l.L) / 2 + 2 * l.L, y: l.y + 24 * l.L };
  };
  /** Where the rifle is held (his right shoulder, so it shows past his head), and its muzzle along the aim. */
  const shoulder = () => ({ x: wilhelm().x + 14 * api.k, y: wilhelm().y - 62 * api.k });
  const muzzle = () => {
    const s = shoulder();
    const len = 50 * api.k;
    return { x: s.x + Math.cos(aim) * len, y: s.y + Math.sin(aim) * len };
  };
  /** Somewhere open between the title bar and Wilhelm. */
  const place = (): { x: number; y: number } => {
    const top = TITLE_Y + 60;
    const bottom = api.H - 60 * api.k;
    const l = ledge();
    for (let tries = 0; tries < 30; tries++) {
      const x = 36 + Math.random() * (api.W - 72);
      const y = top + Math.random() * Math.max(40, bottom - top);
      // Down below: not on (or just above) the ledge, nor behind Wilhelm.
      const onLedge = x < l.x + (LEDGE_W + 8) * l.L && y > l.y - 110 * api.k;
      if (!onLedge && targets.every((o) => Math.hypot(o.x - x, o.y - y) > 26 * S() + 10)) return { x, y };
    }
    return { x: api.W / 2, y: (top + bottom) / 2 };
  };
  const radius = () => 13 * S() + 6;
  const puff = (x: number, y: number, n: number, color: string, speed: number) => {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = (0.4 + Math.random() * 0.6) * speed * api.k;
      puffs.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0, color });
    }
  };

  return {
    titleSuffix: () => `${SG_EYES - spawned + targets.filter((o) => o.kind !== 'lantern' && !o.done).length} eyes left`,
    tap(x, y) {
      // Wilhelm turns and fires (only upward, toward the dark).
      const s = shoulder();
      aim = Math.atan2(Math.min(y - s.y, -8), x - s.x);
      fired = api.t;
      let hit: Target | null = null;
      for (const o of targets) if (!o.done && Math.hypot(o.x - x, o.y - y) <= radius()) hit = o;
      shots.push({ x, y, t: 0, hit: !!hit });
      if (!hit) {
        puff(x, y, 5, '#8a8494', 60); // a puff of dust: a miss costs nothing but time
        return;
      }
      hit.done = true;
      if (hit.kind === 'lantern') {
        puff(hit.x, hit.y, 12, '#7fffe0', 120);
        api.addScore(-Math.min(LANTERN_COST, api.score));
        api.pop(hit.x, hit.y, `−${LANTERN_COST}`, '#ff6a6a');
      } else {
        puff(hit.x, hit.y, 10, hit.kind === 'red' ? '#ff4a4a' : '#9fd87a', 110);
        api.addScore(hit.kind === 'red' ? 3 : 1, hit.x, hit.y);
      }
    },
    step(dt) {
      // The eyes, one after another (quicker, and shutting sooner, as the hunt goes on), until all 100 have opened.
      const n = spawned / SG_EYES;
      spawnIn -= dt;
      if (spawned < SG_EYES && spawnIn <= 0) {
        const red = Math.random() < 0.13;
        const max = (1.8 - 0.95 * n) * (red ? 0.65 : 1);
        targets.push({ ...place(), life: max, max, kind: red ? 'red' : 'eye', done: false, t: 0 });
        spawned++;
        spawnIn = (1.0 - 0.55 * n) * (0.8 + Math.random() * 0.4);
      }
      // Now and then a lantern, to leave be.
      lanternIn -= dt;
      if (spawned < SG_EYES && lanternIn <= 0) {
        targets.push({ ...place(), life: 2.4, max: 2.4, kind: 'lantern', done: false, t: 0 });
        lanternIn = 2.2 + Math.random() * 2.5;
      }
      for (let i = targets.length - 1; i >= 0; i--) {
        const o = targets[i];
        o.life -= dt;
        o.t += dt;
        if (o.life <= 0 || o.done) targets.splice(i, 1);
      }
      for (const s of shots) s.t += dt;
      for (let i = shots.length - 1; i >= 0; i--) if (shots[i].t > 0.4) shots.splice(i, 1);
      for (const p of puffs) {
        p.t += dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.9;
        p.vy *= 0.9;
      }
      for (let i = puffs.length - 1; i >= 0; i--) if (puffs[i].t > 0.45) puffs.splice(i, 1);
      // All the eyes have opened and shut: the hunt is over.
      if (spawned >= SG_EYES && !targets.some((o) => o.kind !== 'lantern')) api.end();
    },
    draw(g) {
      g.imageSmoothingEnabled = false;
      // A light shade over the nest, so the eyes open among its growths.
      g.fillStyle = 'rgba(0,0,8,0.28)';
      g.fillRect(0, 0, api.W, api.H);

      // Under the title, how many eyes are left: the battlefield's framed event timer.
      const left = (SG_EYES - spawned + targets.filter((o) => o.kind !== 'lantern' && !o.done).length) / SG_EYES;
      const BS = 2;
      const nw = Math.floor(Math.min(api.W * 0.8, 360) / BS);
      const bx = Math.round((api.W - nw * BS) / 2);
      if (!drawFramedBar(g, bx, TITLE_Y + 16, BS, nw, 9, left, left < 0.15 ? '#ff6a6a' : TIMER_COLOR)) {
        g.fillStyle = TIMER_COLOR;
        g.fillRect(bx, TITLE_Y + 16, nw * BS * left, 10);
      }

      // The ledge, with the drop's shadow round it on the ground below.
      const l = ledge();
      const ledgeImg = mgArt('ledge');
      if (ledgeImg) {
        const cx = l.x + (LEDGE_W * l.L) / 2;
        const cy = l.y + (LEDGE_TOP * l.L) / 2;
        const sh = g.createRadialGradient(cx, cy, LEDGE_W * l.L * 0.35, cx, cy, LEDGE_W * l.L * 0.95);
        sh.addColorStop(0, 'rgba(0,0,0,0.55)');
        sh.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = sh;
        g.fillRect(0, l.y - LEDGE_W * l.L, (LEDGE_W + 30) * l.L, api.H);
        g.drawImage(ledgeImg, l.x, l.y, ledgeImg.naturalWidth * l.L, ledgeImg.naturalHeight * l.L);
      }

      const s = S();
      const eye = mgArt('eye');
      for (const o of targets) {
        if (o.kind === 'lantern') {
          const f = mgArt(`lantern-${1 + (Math.floor(o.t * 9) % LANTERN_FRAMES)}`);
          if (!f) continue;
          g.globalAlpha = Math.min(1, o.t / 0.2, o.life / 0.3);
          g.drawImage(f, Math.round(o.x - (f.naturalWidth * s) / 2), Math.round(o.y - (f.naturalHeight * s) / 2), f.naturalWidth * s, f.naturalHeight * s);
          g.globalAlpha = 1;
          continue;
        }
        if (!eye) continue;
        // Opens quickly, stays open, then shuts over its last third (squashed shut top and bottom).
        const open = Math.max(0.06, Math.min(1, o.t / 0.12, o.life / (o.max / 3)));
        const img = eyeOf(eye, o.kind === 'red');
        const w = img.width * s;
        const h = img.height * s;
        g.save();
        g.translate(Math.round(o.x), Math.round(o.y));
        g.scale(1, open);
        g.drawImage(img, -w / 2, -h / 2, w, h);
        g.restore();
      }

      // The shots: a tracer from the muzzle to the crosshair, which lingers a moment.
      const m = muzzle();
      const cross = mgArt('crosshair');
      for (const sh of shots) {
        if (sh.t < 0.1) {
          g.globalAlpha = 1 - sh.t / 0.1;
          g.strokeStyle = '#fff2b0';
          g.lineWidth = 2;
          g.beginPath();
          g.moveTo(m.x, m.y);
          g.lineTo(sh.x, sh.y);
          g.stroke();
        }
        if (cross) {
          g.globalAlpha = Math.max(0, 1 - sh.t / 0.4);
          const cs = 2;
          if (sh.hit) g.filter = 'sepia(1) saturate(6) hue-rotate(-20deg)';
          g.drawImage(cross, Math.round(sh.x - (cross.width * cs) / 2), Math.round(sh.y - (cross.height * cs) / 2), cross.width * cs, cross.height * cs);
          g.filter = 'none';
        }
      }
      g.globalAlpha = 1;
      for (const p of puffs) {
        g.globalAlpha = Math.max(0, 1 - p.t / 0.45);
        g.fillStyle = p.color;
        const ps = Math.max(2, Math.round(3 * api.k));
        g.fillRect(Math.round(p.x), Math.round(p.y), ps, ps);
      }
      g.globalAlpha = 1;

      // Wilhelm on the ledge, his back to you, rifle turned on his last shot (behind him when he faces up).
      const wl = wilhelm();
      const sheet = HUNTER_SHEETS.wilhelm;
      const himg = hunterSheetImage('wilhelm');
      const side = Math.abs(Math.cos(aim)) > 0.75;
      const row = side ? (Math.cos(aim) < 0 ? 1 : 2) : 3;
      const drawRifle = () => {
        const sp = shoulder();
        const kick = api.t - fired < 0.08 ? 4 * api.k : 0;
        g.save();
        g.translate(sp.x - Math.cos(aim) * kick, sp.y - Math.sin(aim) * kick);
        g.rotate(aim + Math.PI / 4);
        const size = 68 * api.k;
        // The icon points up-right with its grip at the bottom-left: held halfway along.
        api.icon(RIFLE, size * 0.15, -size * 0.15, size);
        g.restore();
      };
      if (!side) drawRifle();
      if (sheet && himg && himg.complete && himg.naturalWidth) {
        const F = sheet.frame;
        const col = Math.floor(api.t * 6) % sheet.frames[row];
        const [bx2, by, bw, bh] = sheet.box;
        const k = (92 * api.k) / bh;
        g.drawImage(himg, col * F, row * F, F, F, wl.x - (bx2 + bw / 2) * k, wl.y - (by + bh) * k, F * k, F * k);
      }
      if (side) drawRifle();
      // The muzzle flash: the shards effect's first flash and burst.
      if (api.t - fired < 0.07) drawEffect(g, 'shards', (api.t - fired) / 0.035, m.x, m.y, 26 * api.k);
    },
  };
}
