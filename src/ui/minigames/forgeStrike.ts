import { TITLE_Y, type MinigameApi, type MinigameGame } from './shell';
import { mgArt } from './dpad';
import { GEAR, WEAPON_CLASSES } from '../../core/balance';
import { GEAR_SPRITES } from '../../core/gearSprites';
import { HUNTER_SHEETS } from '../../render/hunterSheets';
import { gearImage, hunterSheetImage } from '../../render/sprites';
import { drawFramedBar, drawFramedSegments, framedSlot } from '../../render/hudBars';

/**
 * Kargesh's Forge Strike (in a smithy): Kargesh at his anvil beside a roaring hearth, a glowing ingot
 * before him. A marker swings along the strike bar, slowly at first; tap while it's in the sweet spot and his hammer
 * lands: 1 point, 2 dead centre, times the multiplier. Every hit quickens the swing a little, and every 3 hits in a
 * row raise the multiplier; a miss resets the multiplier, halves the swing (never below where it started) and costs a
 * heart. Five strikes hammer the ingot into a finished weapon, set on the rack (3 more, times the multiplier, if none
 * missed). The metal cools as he works (the bar under the title), quicker the faster the swing: forge it before it
 * goes cold, or it's spoiled and a heart is lost. The sweet spot shrinks as the strikes add up.
 *
 * The look: the smithy in shadow, lit by the hearth (embers drifting up off it) and by the ingot's own glow. Each
 * strike flashes the ingot white, squashes it, throws streaking sparks and a shockwave (more for a dead-centre
 * Perfect) and jolts the scene; a finished piece hisses in a puff of steam and spins onto the rack. The heat gauge
 * sits under the strike bar, flashing blue as the metal goes cold.
 */

export const FS_INTRO = '<p>Kargesh is at the anvil. <b>Tap</b> when the marker is in the bright sweet spot: 1 point, 2 dead centre. Every hit speeds the swing up, and hits in a row raise your <b>multiplier</b>. Five strikes forge a weapon (3 more if none missed).</p><p>A miss resets the multiplier, slows the swing by half and costs a heart. The metal <b>cools</b> as you work: forge it before it goes cold, or that costs a heart too.</p>';

/** The swing's starting speed (bar widths a second), how much each hit quickens it, and its top speed. */
export const FS_START_SPEED = 0.45;
export const FS_HIT_SPEEDUP = 1.07;
export const FS_MAX_SPEED = 2.4;
/** Hits in a row for each step of the multiplier (×1, then ×2 after 3, ×3 after 6...), up to ×8. */
export const FS_STREAK_STEP = 3;
export const FS_MAX_MULT = 8;

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

/** A hex colour at an alpha, for gradients. */
function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${Math.max(0, Math.min(1, a))})`;
}

/** Kargesh's height on screen (at k = 1). */
const KARGESH_H = 128;

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
  /** The swing's speed, and hits in a row (the multiplier). */
  let spd = FS_START_SPEED;
  let streak = 0;
  const mult = () => Math.min(FS_MAX_MULT, 1 + Math.floor(streak / FS_STREAK_STEP));
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
  /** Effects: impact rings, steam puffs, embers drifting up from the hearth, the ingot's flash and squash, and a jolt. */
  const rings: Array<{ x: number; y: number; t: number; r: number; color: string }> = [];
  const steam: Array<{ x: number; y: number; vx: number; vy: number; t: number; r: number; color: string }> = [];
  const embers: Array<{ x: number; y: number; vy: number; t: number; life: number; ph: number }> = [];
  let emberAcc = 0;
  let flash = 0;
  let squash = 0;
  let shake = 0;
  /** The bar's own flash after a strike: gold on a hit, red on a miss. */
  let barFlash = 0;
  let barHit = true;
  /** The marker's recent positions, for its trail. */
  const trail: number[] = [];

  /** Swing speed (bar widths a second), sweet-spot width, and seconds a piece stays hot, by progress. */
  const speed = () => spd;
  /** A piece stays hot long enough for its five strikes at the current swing (shorter as the swing quickens). */
  const coolTime = () => 2 + 3.2 / spd;
  const newZone = () => {
    const w = Math.max(0.1, 0.24 - strikes * 0.004);
    zone = { c: w / 2 + Math.random() * (1 - w), w };
  };

  // The forge, low on the screen: the anvil in the middle, Kargesh to its left, the hearth behind on the right.
  const IS = () => (api.k > 1.3 ? 4 : 3);
  const anvil = () => ({ x: api.W / 2 + 14 * api.k, y: api.H - 175 * api.k });
  const kargesh = () => ({ x: anvil().x - 78 * api.k, y: anvil().y + 48 * api.k });
  /** His hammer hand. */
  const hand = () => ({ x: kargesh().x + 18 * api.k, y: kargesh().y - 86 * api.k });
  const vent = () => ({ x: api.W - 64 * api.k, y: anvil().y - 46 * api.k });
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
    // Just above the forge (but never up under the title and hearts).
    return { nw, nh, x: Math.round((api.W - nw * BS) / 2), y: Math.round(Math.max(TITLE_Y + 70, Math.min(api.H * 0.52, anvil().y - 230 * api.k))) };
  };
  /** The marker's x on screen (along the bar's slot). */
  const markerX = () => {
    const b = bar();
    const sl = framedSlot(b.nw, b.nh) ?? [0, 1];
    return b.x + (sl[0] + (sl[1] - sl[0]) * pos) * b.nw * BS;
  };
  const ingotTop = () => ({ x: anvil().x, y: anvil().y - 15 * IS() });

  const burst = (x: number, y: number, n: number, colors: string[], up: number, wide = 320) => {
    for (let i = 0; i < n; i++) sparks.push({ x, y, vx: (Math.random() - 0.5) * wide * api.k, vy: -Math.random() * up * api.k, t: 0, color: colors[i % colors.length] });
  };
  const puff = (x: number, y: number, n: number, color: string) => {
    for (let i = 0; i < n; i++) steam.push({ x: x + (Math.random() - 0.5) * 30 * api.k, y, vx: (Math.random() - 0.5) * 40 * api.k, vy: -(40 + Math.random() * 50) * api.k, t: 0, r: (8 + Math.random() * 8) * api.k, color });
  };

  return {
    titleSuffix: () => `${pieces} forged · ×${mult()}`,
    tap() {
      if (fresh > 0) return;
      swing = 0;
      const off = Math.abs(pos - zone.c);
      const it = ingotTop();
      if (off <= zone.w / 2) {
        swingHit = true;
        strikes++;
        hits++;
        const before = mult();
        streak++;
        spd = Math.min(FS_MAX_SPEED, spd * FS_HIT_SPEEDUP);
        const perfect = off <= zone.w * 0.15;
        api.addScore((perfect ? 2 : 1) * mult(), it.x, it.y - 30 * api.k);
        if (mult() > before) api.pop(it.x + 40 * api.k, it.y - 80 * api.k, `×${mult()}!`, '#ffd34d');
        else if (perfect) api.pop(it.x + 64 * api.k, it.y - 36 * api.k, 'Perfect!', '#fff2b0');
        burst(it.x, it.y, perfect ? 30 : 18, ['#ffd34d', '#fff2b0', '#ff8a2a', '#ffffff'], perfect ? 560 : 440, perfect ? 520 : 380);
        rings.push({ x: it.x, y: it.y, t: 0, r: (perfect ? 70 : 50) * api.k, color: perfect ? '255,242,176' : '255,170,70' });
        flash = 1;
        squash = 1;
        shake = perfect ? 0.18 : 0.1;
        barFlash = 1;
        barHit = true;
        newZone();
        if (hits >= STRIKES) {
          // Finished: onto the rack.
          const icons = finishedIcons();
          flying = { icon: icons[Math.floor(Math.random() * icons.length)], t: 0 };
          pieces++;
          if (clean) {
            api.addScore(3 * mult());
            api.pop(it.x, it.y - 56 * api.k, `Flawless! +${3 * mult()}`, '#ffd34d');
          } else api.pop(it.x, it.y - 56 * api.k, 'Forged!', '#ffb866');
          // Quenched: a hiss of steam as it comes off the anvil.
          puff(it.x, it.y - 6 * api.k, 9, '235,235,240');
          hits = 0;
          clean = true;
          fresh = 0.5;
        }
      } else {
        // A dull clang off the side of the anvil.
        swingHit = false;
        clean = false;
        if (streak >= FS_STREAK_STEP) api.pop(it.x + 40 * api.k, it.y - 80 * api.k, 'Streak lost', '#ff8a6a');
        streak = 0;
        spd = Math.max(FS_START_SPEED, spd / 2);
        burst(it.x + 30 * api.k, it.y + 10 * api.k, 8, ['#8a8494', '#5d5866'], 160);
        shake = 0.08;
        barFlash = 1;
        barHit = false;
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
          puff(it.x, it.y - 6 * api.k, 7, '170,200,255');
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
      trail.unshift(pos);
      if (trail.length > 6) trail.length = 6;
      flash = Math.max(0, flash - dt * 7);
      squash = Math.max(0, squash - dt * 6);
      shake = Math.max(0, shake - dt);
      barFlash = Math.max(0, barFlash - dt * 4);
      for (const r of rings) r.t += dt;
      for (let i = rings.length - 1; i >= 0; i--) if (rings[i].t > 0.4) rings.splice(i, 1);
      for (let i = steam.length - 1; i >= 0; i--) {
        const p = steam[i];
        p.t += dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.r += 18 * api.k * dt;
        if (p.t > 1.1) steam.splice(i, 1);
      }
      // Embers rising off the hearth, drifting as they cool.
      emberAcc += dt * 9;
      while (emberAcc >= 1) {
        emberAcc -= 1;
        const v = vent();
        embers.push({ x: v.x + (Math.random() - 0.5) * 40 * api.k, y: v.y - 10 * api.k, vy: -(30 + Math.random() * 50) * api.k, t: 0, life: 1.4 + Math.random() * 1.4, ph: Math.random() * 6 });
      }
      for (let i = embers.length - 1; i >= 0; i--) {
        const e = embers[i];
        e.t += dt;
        e.y += e.vy * dt;
        e.x += Math.sin(e.t * 3 + e.ph) * 14 * api.k * dt;
        if (e.t > e.life) embers.splice(i, 1);
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
      const k = api.k;
      const an = anvil();
      const it = ingotTop();
      const vp = vent();
      const hot = fresh > 0 ? 0 : heat;

      // The smithy in shadow, lit warm around the anvil and the hearth (the light breathing with the fire).
      const breathe = 0.04 * Math.sin(api.t * 5) + 0.03 * Math.sin(api.t * 13);
      const dark = g.createRadialGradient(an.x, an.y - 40 * k, 30 * k, an.x, an.y - 40 * k, Math.max(api.W, api.H) * 0.75);
      dark.addColorStop(0, 'rgba(20,6,2,0.05)');
      dark.addColorStop(0.45, 'rgba(14,4,2,0.35)');
      dark.addColorStop(1, 'rgba(6,2,1,0.7)');
      g.fillStyle = dark;
      g.fillRect(0, 0, api.W, api.H);
      g.save();
      g.globalCompositeOperation = 'lighter';
      const warm = g.createRadialGradient(vp.x, vp.y, 10 * k, vp.x, vp.y, 230 * k);
      warm.addColorStop(0, `rgba(255,120,30,${0.38 + breathe})`);
      warm.addColorStop(1, 'rgba(255,120,30,0)');
      g.fillStyle = warm;
      g.fillRect(0, 0, api.W, api.H);
      // The ingot's own light on the anvil and the floor, by its heat (and a flare on each strike).
      const [gc] = glow(hot);
      const lit = Math.max(hot * 0.55, flash * 0.6);
      if (lit > 0) {
        const il = g.createRadialGradient(it.x, it.y, 4 * k, it.x, it.y, 150 * k);
        il.addColorStop(0, hexA(gc === '#000000' ? '#ff8a2a' : gc, lit));
        il.addColorStop(1, hexA('#ff8a2a', 0));
        g.fillStyle = il;
        g.fillRect(it.x - 160 * k, it.y - 160 * k, 320 * k, 320 * k);
      }
      g.restore();

      // A jolt on each strike.
      g.save();
      if (shake > 0) g.translate((Math.random() - 0.5) * shake * 40 * k, (Math.random() - 0.5) * shake * 30 * k);

      // ---- The strike bar: the framed trough, the sweet spot glowing molten (its dead centre white-hot) ----
      const b = bar();
      const bh = b.nh * BS;
      const zx = (v: number) => {
        const sl = framedSlot(b.nw, b.nh) ?? [0, 1];
        return b.x + (sl[0] + (sl[1] - sl[0]) * v) * b.nw * BS;
      };
      // Its heat haze: a soft glow above and below the sweet spot, pulsing.
      const pulse = 0.75 + 0.25 * Math.sin(api.t * 8);
      g.save();
      g.globalCompositeOperation = 'lighter';
      const zc = zx(zone.c);
      const halo = g.createRadialGradient(zc, b.y + bh / 2, 2, zc, b.y + bh / 2, (zx(zone.c + zone.w / 2) - zc) * 2.2 + 20 * k);
      halo.addColorStop(0, `rgba(255,150,50,${0.55 * pulse})`);
      halo.addColorStop(1, 'rgba(255,150,50,0)');
      g.fillStyle = halo;
      g.fillRect(zc - 160 * k, b.y - 50 * k, 320 * k, bh + 100 * k);
      g.restore();
      const seg: Array<[number, number, string]> = [
        [0, 1, '#2a120c'],
        [zone.c - zone.w / 2, zone.c + zone.w / 2, '#e8641e'],
        [zone.c - zone.w * 0.32, zone.c + zone.w * 0.32, '#ff9a3a'],
        [zone.c - zone.w * 0.15, zone.c + zone.w * 0.15, '#fff2b0'],
      ];
      if (!drawFramedSegments(g, b.x, b.y, BS, b.nw, b.nh, seg)) {
        g.fillStyle = '#2a120c';
        g.fillRect(b.x, b.y, b.nw * BS, bh);
      }
      // The bar flashes gold on a hit, red on a miss.
      if (barFlash > 0) {
        g.fillStyle = barHit ? `rgba(255,230,140,${0.5 * barFlash})` : `rgba(255,60,40,${0.5 * barFlash})`;
        g.fillRect(b.x, b.y, b.nw * BS, bh);
      }
      // The marker: a white-hot needle with a fading trail, Kargesh's hammer riding above it.
      const mx = markerX();
      trail.forEach((tp, n) => {
        if (!n) return;
        g.fillStyle = `rgba(255,240,210,${0.35 * (1 - n / trail.length)})`;
        g.fillRect(Math.round(zx(tp) - 2), b.y + 4, 4, bh - 8);
      });
      g.fillStyle = '#ffffff';
      g.fillRect(Math.round(mx - 2), b.y + 2, 4, bh - 4);
      g.fillStyle = 'rgba(0,0,0,0.6)';
      g.fillRect(Math.round(mx + 2), b.y + 2, 1, bh - 4);
      const hm = 40 * k;
      g.save();
      g.translate(mx, b.y - hm * 0.62);
      g.rotate(Math.PI * 0.75);
      api.icon(HAMMER, 0, 0, hm);
      g.restore();

      // ---- The heat gauge under the bar: a flame, the framed bar, flashing as the metal goes cold ----
      const HS = 2;
      const hw = Math.floor(Math.min(b.nw * BS - 40 * k, 300) / HS);
      const hx = Math.round(api.W / 2 - (hw * HS) / 2 + 12 * k);
      const hy = Math.round(b.y + bh + 16 * k);
      const cold = hot < 0.33 && fresh <= 0;
      const blink = cold ? 0.55 + 0.45 * Math.sin(api.t * 14) : 1;
      g.globalAlpha = blink;
      if (!drawFramedBar(g, hx, hy, HS, hw, 9, hot, hot < 0.33 ? '#6aa8ff' : hot < 0.66 ? '#ff8a2a' : '#ffd36a')) {
        g.fillStyle = '#ff8a2a';
        g.fillRect(hx, hy, hw * HS * hot, 10);
      }
      g.globalAlpha = 1;
      g.font = `900 ${Math.round(13 * k)}px monospace`;
      g.textAlign = 'right';
      g.textBaseline = 'middle';
      g.lineWidth = 3;
      g.strokeStyle = '#000';
      const label = cold ? '❄️' : '🔥';
      g.strokeText(label, hx - 6 * k, hy + 9);
      g.fillStyle = '#fff';
      g.fillText(label, hx - 6 * k, hy + 9);

      // ---- The forge ----
      // The hearth behind the anvil, its coals flickering (six frames).
      const v = mgArt('smithy-forge');
      const vs = IS();
      if (v) {
        const fw = v.naturalWidth / 6;
        const f = Math.floor(api.t * 8) % 6;
        g.drawImage(v, f * fw, 0, fw, v.naturalHeight, Math.round(vp.x - (fw * vs) / 2), Math.round(vp.y - (v.naturalHeight * vs) / 2), fw * vs, v.naturalHeight * vs);
      }
      // Embers drifting up off it.
      g.save();
      g.globalCompositeOperation = 'lighter';
      for (const e of embers) {
        const a = Math.max(0, 1 - e.t / e.life);
        g.fillStyle = a > 0.6 ? `rgba(255,220,140,${a})` : `rgba(255,120,40,${a})`;
        const es = Math.max(2, Math.round(2.5 * k));
        g.fillRect(Math.round(e.x), Math.round(e.y), es, es);
      }
      g.restore();

      // A shadow under the anvil, then the anvil.
      const s = IS();
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.beginPath();
      g.ellipse(an.x, an.y + 15 * s, 20 * s, 5 * s, 0, 0, Math.PI * 2);
      g.fill();
      api.icon(ANVIL, an.x, an.y, 32 * s);

      // The ingot on it: hammered flatter and longer with each strike, glowing by its heat, squashing under each blow.
      if (fresh <= 0 || heat > 0) {
        const ix = (1 + hits * 0.14) * (1 + squash * 0.18);
        const iy = (1 - hits * 0.1) * (1 - squash * 0.22);
        const [col, a] = glow(heat);
        // Its glow round it (a bloom), by heat.
        if (a > 0 && fresh <= 0) {
          g.save();
          g.globalCompositeOperation = 'lighter';
          const bl = g.createRadialGradient(it.x, it.y, 2, it.x, it.y, 30 * s * ix);
          bl.addColorStop(0, hexA(col, 0.55 * a + flash * 0.4));
          bl.addColorStop(1, hexA(col, 0));
          g.fillStyle = bl;
          g.fillRect(it.x - 34 * s * ix, it.y - 34 * s, 68 * s * ix, 68 * s);
          g.restore();
        }
        g.save();
        g.translate(it.x, it.y + squash * 3 * k);
        g.scale(ix, iy);
        api.icon(INGOT, 0, 0, 24 * s);
        const ing = gearImage(INGOT);
        if (ing && a > 0 && fresh <= 0) {
          g.globalAlpha = a * (0.85 + Math.sin(api.t * 10) * 0.1);
          g.drawImage(glowing(ing, col), -12 * s, -12 * s, 24 * s, 24 * s);
        }
        // A white flash as the hammer lands.
        if (ing && flash > 0) {
          g.globalAlpha = flash;
          g.drawImage(glowing(ing, '#ffffff'), -12 * s, -12 * s, 24 * s, 24 * s);
        }
        g.globalAlpha = 1;
        g.restore();
      }
      // The shockwave off each strike.
      for (const r of rings) {
        const p = r.t / 0.4;
        g.strokeStyle = `rgba(${r.color},${1 - p})`;
        g.lineWidth = Math.max(1, 4 * k * (1 - p));
        g.beginPath();
        g.ellipse(r.x, r.y + 4 * k, r.r * (0.2 + p), r.r * (0.2 + p) * 0.4, 0, 0, Math.PI * 2);
        g.stroke();
      }

      // Kargesh, facing the anvil, his hammer raised, then brought down on each tap.
      const kp = kargesh();
      const sheet = HUNTER_SHEETS.blacksmith;
      const img = hunterSheetImage('blacksmith');
      if (sheet && img && img.complete && img.naturalWidth) {
        const F = sheet.frame;
        const col = Math.floor(api.t * 6) % sheet.frames[2];
        const [bx, by, bw, bh2] = sheet.box;
        const kk = (KARGESH_H * k) / bh2;
        g.fillStyle = 'rgba(0,0,0,0.3)';
        g.beginPath();
        g.ellipse(kp.x, kp.y, 26 * k, 7 * k, 0, 0, Math.PI * 2);
        g.fill();
        g.drawImage(img, col * F, 2 * F, F, F, kp.x - (bx + bw / 2) * kk, kp.y - (by + bh2) * kk, F * kk, F * kk);
      }
      // Raised over his shoulder at rest; down onto the ingot in 0.1s (past it, onto the anvil's side, on a miss),
      // back up over 0.3s. It glows hot from the work while it's down.
      const hd = hand();
      const strike = Math.atan2(it.y - hd.y, it.x - hd.x) + (swingHit ? 0 : 0.45);
      const rest = strike - 2.3;
      const down = swing < 0.1 ? swing / 0.1 : swing < 0.4 ? 1 - (swing - 0.1) / 0.3 : 0;
      const hs = Math.hypot(it.x - hd.x, it.y - hd.y) * 0.95;
      g.save();
      g.translate(hd.x, hd.y);
      // The icon points up-right with its grip at the bottom-left: turned to the swing, held by its end.
      const ang = rest + (strike - rest) * down + Math.PI / 4;
      // A swoosh behind the head as it comes down.
      if (swing < 0.12) {
        g.strokeStyle = `rgba(255,230,180,${0.5 * (1 - swing / 0.12)})`;
        g.lineWidth = 6 * k;
        g.beginPath();
        g.arc(0, 0, hs * 0.92, rest - Math.PI / 4 + 0.8 + (strike - rest) * down * 0.4 - 0.2, ang - Math.PI / 4 + 0.6);
        g.stroke();
      }
      g.rotate(ang);
      api.icon(HAMMER, hs * 0.3, -hs * 0.3, hs);
      g.restore();

      // Sparks: bright streaks along their flight, blending into a glow.
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.lineCap = 'round';
      for (const sp of sparks) {
        const a = Math.max(0, 1 - sp.t / 0.6);
        g.globalAlpha = a;
        g.strokeStyle = sp.color;
        g.lineWidth = Math.max(1.5, 2.5 * k * a);
        g.beginPath();
        g.moveTo(sp.x, sp.y);
        g.lineTo(sp.x - sp.vx * 0.035, sp.y - sp.vy * 0.035);
        g.stroke();
      }
      g.restore();
      // Steam (a quench hissing, or the metal gone cold).
      for (const p of steam) {
        const a = Math.max(0, 0.55 * (1 - p.t / 1.1));
        g.fillStyle = `rgba(${p.color},${a})`;
        g.beginPath();
        g.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        g.fill();
      }
      g.restore(); // the jolt

      // The rack of finished pieces along the bottom (a wooden board on pegs), and one on its way there.
      const RS = 30 * k;
      const ry = api.H - 26 * k;
      g.fillStyle = '#3a1e10';
      g.fillRect(8, ry - 1, api.W - 16, 8 * k);
      g.fillStyle = '#6a3a1e';
      g.fillRect(8, ry - 1, api.W - 16, 3 * k);
      rack.forEach((icon, n) => {
        const r = rackAt(n);
        g.fillStyle = '#2a140a';
        g.fillRect(Math.round(r.x - 2 * k), ry - 4 * k, 4 * k, 6 * k);
        g.save();
        g.translate(r.x, r.y - RS / 2);
        g.rotate(-0.12);
        api.icon(icon, 0, 0, RS);
        g.restore();
      });
      if (flying) {
        const p = flying.t / 0.5;
        const to = rackAt(rack.length);
        const x = it.x + (to.x - it.x) * p;
        const y = it.y + (to.y - RS / 2 - it.y) * p - Math.sin(Math.PI * p) * 80 * k;
        g.save();
        g.translate(x, y);
        g.rotate(p * Math.PI * 2);
        // A glint as it flies.
        g.save();
        g.globalCompositeOperation = 'lighter';
        g.fillStyle = `rgba(255,240,200,${0.5 * (1 - p)})`;
        g.beginPath();
        g.arc(0, 0, RS * 0.7, 0, Math.PI * 2);
        g.fill();
        g.restore();
        api.icon(flying.icon, 0, 0, RS * (1.4 - 0.4 * p));
        g.restore();
      }
    },
  };
}
