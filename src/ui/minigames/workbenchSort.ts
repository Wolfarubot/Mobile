import { GEAR, RARITIES, type DamageType, type GearDef, type Rarity } from '../../core/balance';
import { GEAR_SPRITES } from '../../core/gearSprites';
import { canvasFont } from '../../render/fx';
import { DAMAGE_TAG_ICONS } from '../tagIcons';
import { drawHunter } from './art';
import { mgArt } from './dpad';
import { TITLE_Y, type MinigameApi, type MinigameGame } from './shell';

/**
 * Reginald's Workbench Sort (the Ascendant Steps): gear rides in on two conveyor belts, one from each side, that meet
 * in the middle and turn up into his furnace at the top; you sort it into the three bins below before it gets there.
 * Tap a bin to send the part nearest the furnace into it (the bin glows green if that's its bin, red if not). What the bins sort by changes every 20 seconds: by type (weapon, armor, accessory), then by rarity (by the
 * colour of the part's frame), then by element (weapons only). A part in the right bin scores 1, and every fifth in
 * a row 1 more; a part in the wrong bin costs a heart, and so does one left on the belt: it rides up into the
 * furnace. The belts speed up as you go. Sixty seconds. Each bin always gets the same three pieces (WS_PIECES).
 *
 * (Reginald's minigame was the Clockwork Tower; it keeps that id, so its buff, best score and saves carry on.)
 */

export const WS_TIME = 60;
/** Seconds of each sorting rule before the next one. */
export const WS_RULE_TIME = 20;
export const WS_INTRO =
  "<p>Gear rides in on two conveyors that meet in the middle and carry it up into Reginald's furnace. <b>Tap a bin</b> to sort the part nearest the furnace into it before it's burned.</p><p>The bins change every 20 seconds: sort by <b>type</b> (weapon, armor or accessory), then by <b>rarity</b> (the colour of the part's frame), then by <b>element</b>.</p><p>Every part in the right bin scores, and every fifth in a row scores extra. A wrong bin, or a part that reaches the furnace, costs a heart. You have " +
  WS_TIME +
  ' seconds.</p>';

type Rule = 'type' | 'rarity' | 'element';
const RULES: Rule[] = ['type', 'rarity', 'element'];
const RULE_NAMES: Record<Rule, string> = { type: 'Sort by type', rarity: 'Sort by rarity', element: 'Sort by element' };

/** The three rarity bins: which rarities go in each, and the bin's colour. */
const RARITY_BINS: Array<{ name: string; rarities: Rarity[]; color: string }> = [
  { name: 'Common', rarities: ['common', 'uncommon'], color: RARITIES.uncommon.color },
  { name: 'Rare', rarities: ['rare', 'veryRare', 'legendary'], color: RARITIES.rare.color },
  { name: 'Mythic', rarities: ['exotic', 'relic', 'artifact', 'exalted'], color: RARITIES.exotic.color },
];
const ELEMENTS: DamageType[] = ['fire', 'frost', 'lightning'];
const ELEMENT_NAMES: Record<string, string> = { fire: 'Fire', frost: 'Frost', lightning: 'Lightning' };

/** Which bin a piece belongs in under a rule (0, 1 or 2). */
export function sortBin(gd: GearDef, rule: Rule): number {
  if (rule === 'type') return gd.kind === 'armor' ? 1 : gd.kind === 'accessory' ? 2 : 0;
  if (rule === 'rarity') return RARITY_BINS.findIndex((b) => b.rarities.includes(gd.rarity));
  return ELEMENTS.indexOf(gd.damageType!);
}

/**
 * The pieces each rule deals: three for each bin, always the same three, so their look can be learned. Spread
 * across what fits the bin (early, middle and late gear), each with art; for element, weapons of just that element.
 */
const pick3 = (list: GearDef[]): GearDef[] => (list.length <= 3 ? list : [list[Math.floor(list.length * 0.1)], list[Math.floor(list.length * 0.5)], list[Math.floor(list.length * 0.9)]]);
export const WS_PIECES: Record<Rule, GearDef[][]> = (() => {
  const drawn = GEAR.filter((g) => GEAR_SPRITES[g.id] && !g.starter);
  const bins = (rule: Rule, of: GearDef[]) => [0, 1, 2].map((b) => pick3(of.filter((g) => sortBin(g, rule) === b)));
  return {
    type: bins('type', drawn),
    rarity: bins('rarity', drawn),
    element: bins('element', drawn.filter((g) => g.damageType && ELEMENTS.includes(g.damageType) && !g.extraTypes?.length && !g.special)),
  };
})();

interface Part {
  gd: GearDef;
  /** The belt it came in on: -1 from the left, 1 from the right. */
  side: number;
  /** How far along its way it has come: across its belt to the middle, then up to the furnace. */
  d: number;
  /** Sent to a bin: flying there (0 → 1), and whether it was the right one. bin: 0-2 a bin; -1 swept off (the rule
   *  changed); -2 gone; -3 carried into the furnace. */
  fly?: { t: number; bin: number; fromX: number; fromY: number; ok: boolean };
}

/** The furnace's six frames (the blacksmith pack's forge), and how fast they turn. */
const FORGE_FRAMES = 6;
const FORGE_FPS = 8;

export function workbenchSort(api: MinigameApi): MinigameGame {
  const k = () => api.k;
  const size = () => 44 * k();
  const beltH = () => size() * 1.25;
  // The furnace at the top, big; its mouth is where the belt up feeds it.
  const forgeScale = () => 2.6 * k();
  const forgeTop = () => TITLE_Y + 44 * k();
  const forgeH = () => 64 * forgeScale();
  const mouthY = () => forgeTop() + forgeH() * 0.72;
  const binTop = () => api.H - 150 * k();
  const binH = () => 92 * k();
  const binW = () => (api.W - 32 * k()) / 3;
  const binX = (i: number) => 16 * k() + binW() * i;
  // The two belts across, a little below the furnace; the one up runs from where they meet to its mouth.
  const beltY = () => forgeTop() + forgeH() + (binTop() - forgeTop() - forgeH()) * 0.28;
  const across = () => api.W / 2 + size();
  const up = () => beltY() - (forgeTop() + forgeH() - 4 * k());
  const posOf = (p: Part) => {
    if (p.d < across()) return { x: p.side < 0 ? -size() + p.d : api.W + size() - p.d, y: beltY() };
    return { x: api.W / 2, y: beltY() - (p.d - across()) };
  };
  const rule = (): Rule => RULES[Math.min(RULES.length - 1, Math.floor(api.t / WS_RULE_TIME))];
  const parts: Part[] = [];
  let spawnIn = 0.4;
  let nextSide = -1;
  let streak = 0;
  let lastRule: Rule = 'type';
  /** A tapped bin: glowing green (right) or red (wrong), and pressed in for a moment. */
  const glows: Array<{ bin: number; t: number; ok: boolean }> = [];
  /** Embers rising from the furnace's mouth (and a burst of them when a part goes in). */
  const embers: Array<{ x: number; y: number; vx: number; vy: number; t: number; life: number }> = [];
  const ember = (n: number, spread: number) => {
    for (let i = 0; i < n; i++)
      embers.push({ x: api.W / 2 + (Math.random() - 0.5) * spread * k(), y: mouthY(), vx: (Math.random() - 0.5) * 50 * k(), vy: -(40 + Math.random() * 90) * k(), t: 0, life: 0.5 + Math.random() * 0.6 });
  };

  /** Belt speed (px a second at a 400px-wide screen): gentle at first, quicker as the minute goes on. */
  const speed = () => (46 + api.t * 1.3) * (api.expert ? 1.4 : 1) * k();
  const spawn = () => {
    const bin = WS_PIECES[rule()][Math.floor(Math.random() * 3)];
    parts.push({ gd: bin[Math.floor(Math.random() * bin.length)], side: nextSide, d: 0 });
    nextSide = -nextSide;
  };
  /** The part next to sort: the one nearest the furnace. */
  const front = () => parts.filter((p) => !p.fly).reduce<Part | null>((a, p) => (!a || p.d > a.d ? p : a), null);

  return {
    titleSuffix: () => `${Math.ceil(Math.max(0, WS_TIME - api.t))}s`,
    tap(x, y) {
      if (y < binTop() - 10 * k()) return;
      const bin = Math.max(0, Math.min(2, Math.floor((x - binX(0)) / binW())));
      const p = front();
      if (!p) {
        glows.push({ bin, t: 0, ok: true });
        return;
      }
      const ok = sortBin(p.gd, rule()) === bin;
      const at = posOf(p);
      p.fly = { t: 0, bin, fromX: at.x, fromY: at.y, ok };
      glows.push({ bin, t: 0, ok });
    },
    step(dt) {
      if (api.t >= WS_TIME) {
        api.end();
        return;
      }
      // A new rule: the belts are cleared so nothing on them is sorted by the old one.
      if (rule() !== lastRule) {
        lastRule = rule();
        for (const p of parts)
          if (!p.fly) {
            const at = posOf(p);
            p.fly = { t: 0.5, bin: -1, fromX: at.x, fromY: at.y, ok: true };
          }
        api.pop(api.W / 2, beltY() + beltH(), RULE_NAMES[lastRule] + '!', '#ffe08a');
        spawnIn = 1;
      }
      spawnIn -= dt;
      if (spawnIn <= 0) {
        spawn();
        // Parts come closer together as the belts speed up, but never so close they overlap.
        spawnIn = Math.max(0.75, 1.9 - api.t * 0.018);
      }
      // Moving along: furthest first, each keeping a part's length behind the one ahead of it (on its belt, and up the
      // belt to the furnace, where the two belts take turns).
      const v = speed();
      const gap = size() * 1.15;
      const A = across();
      let upTail = Infinity;
      const tail: Record<number, number> = { [-1]: Infinity, 1: Infinity };
      for (const p of parts.filter((q) => !q.fly).sort((a, b) => b.d - a.d)) {
        let nd = p.d + v * dt;
        if (p.d >= A) nd = Math.min(nd, upTail - gap);
        else {
          nd = Math.min(nd, tail[p.side] - gap);
          if (nd >= A && upTail - A < gap) nd = Math.min(nd, A - 0.01);
        }
        p.d = Math.max(p.d, nd);
        if (p.d >= A) upTail = Math.min(upTail, p.d);
        else tail[p.side] = Math.min(tail[p.side], p.d);
        if (p.d >= A + up()) {
          // Into the furnace.
          p.fly = { t: 0, bin: -3, fromX: api.W / 2, fromY: beltY() - up(), ok: false };
          streak = 0;
          api.loseLife(api.W / 2, mouthY());
        }
      }
      for (const p of parts) {
        if (!p.fly) continue;
        p.fly.t += dt / (p.fly.bin === -3 ? 0.45 : 0.28);
        if (p.fly.bin === -3 && p.fly.t >= 0.6 && !p.fly.ok) {
          p.fly.ok = true; // (it has gone in)
          ember(16, 40);
        }
        if (p.fly.t >= 1 && p.fly.bin >= 0) {
          const bx = binX(p.fly.bin) + binW() / 2;
          const by = binTop() + binH() * 0.4;
          if (p.fly.ok) {
            streak++;
            api.addScore(1 + (streak % 5 === 0 ? 1 : 0), bx, by - 20 * k());
            if (streak % 5 === 0) api.pop(bx, by - 46 * k(), `×${streak} in a row!`, '#ffe08a');
          } else {
            streak = 0;
            api.pop(bx, by - 20 * k(), 'Wrong bin!', '#ff8080');
            api.loseLife(bx, by);
          }
          p.fly.bin = -2; // landed
        }
      }
      for (let i = parts.length - 1; i >= 0; i--) if (parts[i].fly && parts[i].fly!.t >= 1) parts.splice(i, 1);
      for (const f of glows) f.t += dt;
      while (glows.length && glows[0].t > 0.5) glows.shift();
      if (Math.random() < dt * 8) ember(1, 30);
      for (const e of embers) {
        e.t += dt;
        e.x += e.vx * dt;
        e.y += e.vy * dt;
      }
      for (let i = embers.length - 1; i >= 0; i--) if (embers[i].t >= embers[i].life) embers.splice(i, 1);
    },
    draw(g) {
      const S = size();
      const K = k();
      const by = beltY();
      const BH = beltH();
      const r = rule();
      const mid = api.W / 2;
      const upTop = by - up();
      drawProps(g, api.W, by + BH / 2 + 46 * K, binTop() - 6 * K, K);
      // The furnace, big, at the top.
      drawForge(g, mid, forgeTop(), forgeScale(), api.t, K);
      // The belts: two across, meeting in the middle, and one up from there into the furnace.
      const v = speed();
      const slat = 22 * K;
      const off = (api.t * v) % slat;
      const frame = (x: number, y: number, w: number, h: number) => {
        g.fillStyle = '#1c1c22';
        g.fillRect(Math.round(x - 3 * K), Math.round(y - 3 * K), Math.round(w + 6 * K), Math.round(h + 6 * K));
      };
      frame(0, by - BH / 2, api.W, BH);
      frame(mid - BH / 2, upTop, BH, by - upTop + BH / 2);
      g.fillStyle = '#2a2a30';
      g.fillRect(0, Math.round(by - BH / 2), api.W, Math.round(BH));
      g.fillRect(Math.round(mid - BH / 2), Math.round(upTop), Math.round(BH), Math.round(by - upTop));
      g.fillStyle = '#3c3c46';
      // Slats: the left belt runs right, the right one left, the middle one up.
      for (let x = -slat + off; x < mid - BH / 2; x += slat) g.fillRect(Math.round(x), Math.round(by - BH / 2), Math.max(2, Math.round(3 * K)), Math.round(BH));
      for (let x = api.W + slat - off; x > mid + BH / 2; x -= slat) g.fillRect(Math.round(x), Math.round(by - BH / 2), Math.max(2, Math.round(3 * K)), Math.round(BH));
      for (let y = by + slat - off; y > upTop; y -= slat) if (y < by + BH / 2) g.fillRect(Math.round(mid - BH / 2), Math.round(y), Math.round(BH), Math.max(2, Math.round(3 * K)));
      // Their steel rails.
      g.fillStyle = '#8a8a96';
      g.fillRect(0, Math.round(by - BH / 2 - 3 * K), Math.round(mid - BH / 2), Math.round(3 * K));
      g.fillRect(Math.round(mid + BH / 2), Math.round(by - BH / 2 - 3 * K), Math.round(api.W - mid - BH / 2), Math.round(3 * K));
      g.fillRect(0, Math.round(by + BH / 2), api.W, Math.round(3 * K));
      g.fillRect(Math.round(mid - BH / 2 - 3 * K), Math.round(upTop), Math.round(3 * K), Math.round(by - upTop - BH / 2));
      g.fillRect(Math.round(mid + BH / 2), Math.round(upTop), Math.round(3 * K), Math.round(by - upTop - BH / 2));
      // The bins: open crates, labelled for the rule now; a tapped one glows, and sinks a little as it's pressed.
      for (let i = 0; i < 3; i++) {
        const glow = glows.filter((f) => f.bin === i).pop();
        const press = glow && glow.t < 0.12 ? 3 * K : 0;
        const label = r === 'type' ? ['Weapons', 'Armor', 'Accessories'][i] : r === 'rarity' ? RARITY_BINS[i].name : ELEMENT_NAMES[ELEMENTS[i]];
        const icon = r === 'type' ? [GEAR_SPRITES.shortSword, GEAR_SPRITES.commonClothes, GEAR_SPRITES.mithrilBand][i] : r === 'element' ? DAMAGE_TAG_ICONS[ELEMENTS[i]] : null;
        const x = binX(i) + 5 * K;
        const w = binW() - 10 * K;
        const y = binTop() + press;
        if (glow) {
          const a = Math.max(0, 1 - glow.t / 0.5);
          g.save();
          g.globalAlpha = a;
          g.shadowColor = glow.ok ? '#5dff8a' : '#ff4a4a';
          g.shadowBlur = 22 * K;
          g.fillStyle = glow.ok ? 'rgba(93,255,138,0.55)' : 'rgba(255,74,74,0.55)';
          g.fillRect(Math.round(x - 5 * K), Math.round(y - 5 * K), Math.round(w + 10 * K), Math.round(binH() + 10 * K));
          g.restore();
        }
        drawCrate(g, x, y, w, binH(), K, r === 'rarity' ? RARITY_BINS[i].color : null);
        if (glow) {
          // And a bright border round it, fading with the glow.
          g.save();
          g.globalAlpha = Math.max(0, 1 - glow.t / 0.5);
          g.strokeStyle = glow.ok ? '#7dffa0' : '#ff5a5a';
          g.lineWidth = 4 * K;
          g.strokeRect(Math.round(x - 2 * K), Math.round(y - 2 * K), Math.round(w + 4 * K), Math.round(binH() + 4 * K));
          g.restore();
        }
        const cx = x + w / 2;
        // Its badge (the bin's icon, or the rarity's colour) inside the crate, and its name on the front.
        const badgeY = y + binH() * 0.33;
        const br = 16 * K;
        g.fillStyle = '#231616';
        g.beginPath();
        g.arc(cx, badgeY, br + 2 * K, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#f1e6c8';
        g.beginPath();
        g.arc(cx, badgeY, br, 0, Math.PI * 2);
        g.fill();
        if (icon) api.icon(icon, cx, badgeY, 24 * K);
        else {
          g.fillStyle = RARITY_BINS[i].color;
          g.beginPath();
          g.arc(cx, badgeY, br * 0.62, 0, Math.PI * 2);
          g.fill();
          g.strokeStyle = '#231616';
          g.lineWidth = 2 * K;
          g.stroke();
        }
        g.font = canvasFont(Math.round(12 * K), 800);
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.lineWidth = 3;
        g.lineJoin = 'round';
        g.strokeStyle = '#000';
        const ly = y + binH() * 0.83;
        g.strokeText(label, cx, ly);
        g.fillStyle = '#fff';
        g.fillText(label, cx, ly);
      }
      // The parts: riding the belts, flying to a bin, or going into the furnace.
      const fr = front();
      for (const p of parts) {
        let { x, y } = p.fly ? { x: p.fly.fromX, y: p.fly.fromY } : posOf(p);
        let s = S;
        let alpha = 1;
        let burn = 0;
        if (p.fly) {
          const t = Math.min(1, p.fly.t);
          if (p.fly.bin === -1) {
            y = p.fly.fromY - t * 30 * K;
            alpha = 1 - t;
          } else if (p.fly.bin === -3) {
            // Up off the belt into the furnace's mouth, shrinking and charring.
            y = p.fly.fromY + (mouthY() - p.fly.fromY) * t;
            s = S * (1 - 0.55 * t);
            burn = Math.min(1, t * 1.6);
            alpha = t < 0.6 ? 1 : Math.max(0, 1 - (t - 0.6) / 0.4);
          } else if (p.fly.bin >= 0) {
            const tx = binX(p.fly.bin) + binW() / 2;
            const ty = binTop() + binH() * 0.25;
            x = p.fly.fromX + (tx - p.fly.fromX) * t;
            y = p.fly.fromY + (ty - p.fly.fromY) * t - Math.sin(Math.PI * t) * 50 * K;
            s = S * (1 - 0.35 * t);
          } else continue;
        }
        g.globalAlpha = alpha;
        // Its frame in its rarity's colour; the part next to sort glows.
        if (p === fr) {
          g.fillStyle = 'rgba(255,224,138,0.9)';
          g.fillRect(Math.round(x - s / 2 - 5), Math.round(y - s / 2 - 5), Math.round(s + 10), Math.round(s + 10));
        }
        g.fillStyle = '#000';
        g.fillRect(Math.round(x - s / 2 - 2), Math.round(y - s / 2 - 2), Math.round(s + 4), Math.round(s + 4));
        g.fillStyle = RARITIES[p.gd.rarity].color;
        g.fillRect(Math.round(x - s / 2), Math.round(y - s / 2), Math.round(s), Math.round(s));
        g.fillStyle = '#e8e2cc';
        g.fillRect(Math.round(x - s / 2 + 3), Math.round(y - s / 2 + 3), Math.round(s - 6), Math.round(s - 6));
        api.icon(GEAR_SPRITES[p.gd.id], x, y, s * 0.82, alpha);
        if (burn > 0) {
          g.globalAlpha = alpha * burn * 0.7;
          g.fillStyle = '#1a0a04';
          g.fillRect(Math.round(x - s / 2 - 2), Math.round(y - s / 2 - 2), Math.round(s + 4), Math.round(s + 4));
          g.globalAlpha = alpha * burn * 0.35;
          g.fillStyle = '#ff7a1a';
          g.fillRect(Math.round(x - s / 2 - 2), Math.round(y - s / 2 - 2), Math.round(s + 4), Math.round(s + 4));
        }
        g.globalAlpha = 1;
      }
      // Embers drifting up from the furnace.
      for (const e of embers) {
        g.globalAlpha = Math.max(0, 1 - e.t / e.life);
        g.fillStyle = e.t < e.life * 0.4 ? '#ffd36a' : '#ff7a2a';
        const d = Math.max(2, Math.round(2.5 * K));
        g.fillRect(Math.round(e.x), Math.round(e.y), d, d);
      }
      g.globalAlpha = 1;
      // Reginald by the left belt, setting parts on it; and what to do, under the belts.
      drawHunter(g, 'artificer', 30 * K, by - BH / 2 - 4 * K, 56 * K, api.t);
      g.font = canvasFont(Math.round(15 * K), 700);
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineWidth = 3;
      g.strokeStyle = '#000';
      const left = Math.ceil(WS_RULE_TIME - (api.t % WS_RULE_TIME));
      const text = `${RULE_NAMES[r]}${api.t < WS_TIME - WS_RULE_TIME ? `  ·  next in ${left}s` : ''}`;
      const ty = by + BH / 2 + 22 * K;
      g.strokeText(text, mid, ty);
      g.fillStyle = '#ffe08a';
      g.fillText(text, mid, ty);
      g.textBaseline = 'alphabetic';
    },
  };
}

/** `a` blended toward `b` by `k` (hex colours). */
function mix(a: string, b: string, k: number): string {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * k).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * A sorting bin, drawn like the blacksmith pack's open crates: a dark outline, a wooden rim round the dark inside,
 * and a front of vertical slats under a top board, with a drop shadow. A rarity bin's wood is stained its colour.
 */
function drawCrate(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, K: number, tint: string | null): void {
  const u = Math.max(2, Math.round(2.4 * K));
  const c = (hex: string) => (tint ? mix(hex, tint, 0.4) : hex);
  const R = (rx: number, ry: number, rw: number, rh: number, col: string) => {
    g.fillStyle = col;
    g.fillRect(Math.round(rx), Math.round(ry), Math.round(rw), Math.round(rh));
  };
  x = Math.round(x);
  y = Math.round(y);
  w = Math.round(w / u) * u;
  h = Math.round(h / u) * u;
  // Drop shadow, down and to the left.
  R(x - u, y + u * 4, w, h - u * 2, 'rgba(30,20,28,0.55)');
  // Outline.
  R(x, y, w, h, '#312123');
  const front = Math.round((h * 0.34) / u) * u;
  const top = h - front;
  // The open top: a rim round the dark inside.
  R(x + u, y + u, w - u * 2, top - u, c('#895e48'));
  R(x + u * 2, y + u * 2, w - u * 4, top - u * 3, '#3f292b');
  for (let i = u * 3; i < w - u * 3; i += u * 4) R(x + i, y + u, u, u, c('#7c4f43'));
  R(x + u, y + top - u, w - u * 2, u, c('#895e48'));
  // The front: a top board, then slats, and a dark foot.
  R(x + u, y + top, w - u * 2, u, c('#5b3936'));
  R(x + u, y + top + u, w - u * 2, front - u * 3, c('#523333'));
  R(x + u, y + top + u, w - u * 2, u, c('#3b2728'));
  for (let i = u * 3; i < w - u * 2; i += u * 3) R(x + i, y + top + u * 2, u, front - u * 4, c('#462d2d'));
  R(x + u, y + h - u * 2, w - u * 2, u, c('#462d2d'));
}

/** The furnace: the blacksmith pack's forge, its coals glowing (six frames), with a warm light round its mouth. */
function drawForge(g: CanvasRenderingContext2D, x: number, top: number, sc: number, t: number, K: number): void {
  const img = mgArt('workroom/forge');
  const h = 64 * sc;
  const glow = g.createRadialGradient(x, top + h * 0.72, 6 * K, x, top + h * 0.72, h * 0.75);
  glow.addColorStop(0, 'rgba(255,150,40,0.4)');
  glow.addColorStop(1, 'rgba(255,120,20,0)');
  g.fillStyle = glow;
  g.fillRect(Math.round(x - h * 0.75), Math.round(top), Math.round(h * 1.5), Math.round(h * 1.5));
  if (!img) return;
  const fw = img.naturalWidth / FORGE_FRAMES;
  const fh = img.naturalHeight;
  const f = Math.floor(t * FORGE_FPS) % FORGE_FRAMES;
  g.imageSmoothingEnabled = false;
  g.drawImage(img, f * fw, 0, fw, fh, Math.round(x - (fw * sc) / 2), Math.round(top), Math.round(fw * sc), Math.round(fh * sc));
}

/**
 * The workroom's floor between the belts and the bins: crates, barrels, sacks of supplies, a coal heap and a spare
 * anvil (from CraftPix's blacksmith house and dungeon objects packs), each standing on its feet.
 */
const PROPS: Array<{ art: string; x: number; y: number }> = [
  { art: 'anvil', x: 0.16, y: 0.3 },
  { art: 'coal', x: 0.84, y: 0.3 },
  { art: 'crates2', x: 0.36, y: 0.62 },
  { art: 'barrel', x: 0.64, y: 0.6 },
  { art: 'barrels', x: 0.12, y: 0.98 },
  { art: 'crates-tall', x: 0.28, y: 0.96 },
  { art: 'supplies', x: 0.52, y: 0.99 },
  { art: 'crates', x: 0.87, y: 1 },
];
function drawProps(g: CanvasRenderingContext2D, W: number, top: number, bottom: number, K: number): void {
  // No floor to speak of (a short landscape stage): the room's own furniture will do.
  if (bottom - top < 90 * K) return;
  g.imageSmoothingEnabled = false;
  const sc = 1.5 * K;
  for (const p of PROPS) {
    const img = mgArt(`workroom/${p.art}`);
    if (!img) continue;
    const w = img.naturalWidth * sc;
    const h = img.naturalHeight * sc;
    const fx = W * p.x;
    const fy = top + (bottom - top) * p.y;
    g.fillStyle = 'rgba(0,0,0,0.28)';
    g.beginPath();
    g.ellipse(fx, fy - 2 * K, w * 0.45, 4 * K, 0, 0, Math.PI * 2);
    g.fill();
    g.drawImage(img, Math.round(fx - w / 2), Math.round(fy - h), Math.round(w), Math.round(h));
  }
}
