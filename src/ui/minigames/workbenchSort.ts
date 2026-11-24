import { GEAR, RARITIES, type DamageType, type GearDef, type Rarity } from '../../core/balance';
import { GEAR_SPRITES } from '../../core/gearSprites';
import { canvasFont } from '../../render/fx';
import { DAMAGE_TAG_ICONS } from '../tagIcons';
import { drawHunter } from './art';
import { TITLE_Y, type MinigameApi, type MinigameGame } from './shell';

/**
 * Reginald's Workbench Sort (the Ascendant Steps): gear rides a conveyor belt across his workbench, and you sort it
 * into the three bins below before it falls off the end. Tap a bin to send the part at the front of the belt into
 * it. What the bins sort by changes every 20 seconds: by type (weapon, armor, accessory), then by rarity (by the
 * colour of the part's frame), then by element (weapons only). A part in the right bin scores 1, and every fifth in
 * a row 1 more; a part in the wrong bin costs a heart, and so does one left on the belt: it drops off the end into
 * the fire. The belt speeds up as you go. Sixty seconds. Each bin always gets the same three pieces (WS_PIECES).
 *
 * (Reginald's minigame was the Clockwork Tower; it keeps that id, so its buff, best score and saves carry on.)
 */

export const WS_TIME = 60;
/** Seconds of each sorting rule before the next one. */
export const WS_RULE_TIME = 20;
export const WS_INTRO =
  "<p>Gear rides the conveyor across Reginald's workbench. <b>Tap a bin</b> to sort the part at the front of the belt into it, before it falls off the end.</p><p>The bins change every 20 seconds: sort by <b>type</b> (weapon, armor or accessory), then by <b>rarity</b> (the colour of the part's frame), then by <b>element</b>.</p><p>Every part in the right bin scores, and every fifth in a row scores extra. A wrong bin, or a part that falls off, costs a heart. You have " +
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
  x: number;
  /** Sent to a bin: flying there (0 → 1), and whether it was the right one. */
  /** bin: 0-2 a bin; -1 swept off (the rule changed); -2 gone; -3 dropped off the end into the fire. */
  fly?: { t: number; bin: number; fromX: number; fromY: number; ok: boolean };
}

export function workbenchSort(api: MinigameApi): MinigameGame {
  const k = () => api.k;
  const size = () => 44 * k();
  const beltY = () => Math.max(TITLE_Y + 70 * k(), api.H * 0.36);
  const binTop = () => api.H - 150 * k();
  const binH = () => 92 * k();
  const binW = () => (api.W - 32 * k()) / 3;
  const binX = (i: number) => 16 * k() + binW() * i;
  /** Where the belt ends, and the fire past it that what's left on the belt drops into. */
  const beltEnd = () => api.W - 74 * k();
  const fireX = () => api.W - 38 * k();
  const fireY = () => beltY() + size() * 1.25 * 0.5 + 34 * k();
  /** Embers rising from the fire (and a burst of them when a part drops in). */
  const embers: Array<{ x: number; y: number; vx: number; vy: number; t: number; life: number }> = [];
  const ember = (n: number, spread: number) => {
    for (let i = 0; i < n; i++)
      embers.push({ x: fireX() + (Math.random() - 0.5) * spread * k(), y: fireY() - 6 * k(), vx: (Math.random() - 0.5) * 40 * k(), vy: -(40 + Math.random() * 90) * k(), t: 0, life: 0.5 + Math.random() * 0.6 });
  };
  const rule = (): Rule => RULES[Math.min(RULES.length - 1, Math.floor(api.t / WS_RULE_TIME))];
  const parts: Part[] = [];
  let spawnIn = 0.4;
  let streak = 0;
  let lastRule: Rule = 'type';
  /** A flash on a bin when a part lands: green for right, red for wrong. */
  const flashes: Array<{ bin: number; t: number; ok: boolean }> = [];

  /** Belt speed (px a second at a 400px-wide screen): gentle at first, quicker as the minute goes on. */
  const speed = () => (46 + api.t * 1.3) * (api.expert ? 1.4 : 1) * k();
  const spawn = () => {
    const bin = WS_PIECES[rule()][Math.floor(Math.random() * 3)];
    parts.push({ gd: bin[Math.floor(Math.random() * bin.length)], x: -size() });
  };
  /** The part at the front of the belt (the furthest along, not already sent). */
  const front = () => parts.filter((p) => !p.fly).reduce<Part | null>((a, p) => (!a || p.x > a.x ? p : a), null);

  return {
    titleSuffix: () => `${Math.ceil(Math.max(0, WS_TIME - api.t))}s`,
    tap(x, y) {
      if (y < binTop() - 10 * k()) return;
      const bin = Math.max(0, Math.min(2, Math.floor((x - binX(0)) / binW())));
      const p = front();
      if (!p) return;
      const ok = sortBin(p.gd, rule()) === bin;
      p.fly = { t: 0, bin, fromX: p.x, fromY: beltY(), ok };
    },
    step(dt) {
      if (api.t >= WS_TIME) {
        api.end();
        return;
      }
      // A new rule: the belt is cleared so nothing on it is sorted by the old one.
      if (rule() !== lastRule) {
        lastRule = rule();
        for (const p of parts) if (!p.fly) p.fly = { t: 0.5, bin: -1, fromX: p.x, fromY: beltY(), ok: true };
        api.pop(api.W / 2, beltY() - 40 * k(), RULE_NAMES[lastRule] + '!', '#ffe08a');
        spawnIn = 1;
      }
      spawnIn -= dt;
      if (spawnIn <= 0) {
        spawn();
        // Parts come closer together as the belt speeds up, but never so close they overlap.
        spawnIn = Math.max(0.75, 1.9 - api.t * 0.018);
      }
      const v = speed();
      for (const p of parts) {
        if (p.fly) {
          p.fly.t += dt / (p.fly.bin === -3 ? 0.55 : 0.28);
          if (p.fly.bin === -3 && p.fly.t >= 0.75 && !p.fly.ok) {
            p.fly.ok = true; // (it has reached the flames)
            ember(14, 30);
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
            flashes.push({ bin: p.fly.bin, t: 0, ok: p.fly.ok });
            p.fly.bin = -2; // landed
          }
          continue;
        }
        p.x += v * dt;
        if (p.x > beltEnd() + size() * 0.15) {
          // Off the end of the belt, down into the fire.
          p.fly = { t: 0, bin: -3, fromX: p.x, fromY: beltY(), ok: false };
          streak = 0;
          api.loseLife(fireX(), fireY() - 30 * k());
        }
      }
      for (let i = parts.length - 1; i >= 0; i--) if (parts[i].fly && parts[i].fly!.t >= 1) parts.splice(i, 1);
      for (const f of flashes) f.t += dt;
      if (Math.random() < dt * 9) ember(1, 22);
      for (const e of embers) {
        e.t += dt;
        e.x += e.vx * dt;
        e.y += e.vy * dt;
      }
      for (let i = embers.length - 1; i >= 0; i--) if (embers[i].t >= embers[i].life) embers.splice(i, 1);
      while (flashes.length && flashes[0].t > 0.35) flashes.shift();
    },
    draw(g) {
      const S = size();
      const by = beltY();
      const r = rule();
      const K = k();
      const end = beltEnd();
      // The workbench: a long wooden table under the belt, as long as the belt, standing in his workroom.
      const beltH = S * 1.25;
      const top = by - S * 1.1;
      const bot = by + beltH / 2 + 16 * K;
      const face = 8 * K;
      g.fillStyle = 'rgba(0,0,0,0.3)';
      g.fillRect(0, Math.round(bot + face), Math.round(end + 10 * K), Math.round(10 * K));
      g.fillStyle = '#5c3b22';
      g.fillRect(0, Math.round(top), Math.round(end + 10 * K), Math.round(bot - top));
      g.fillStyle = 'rgba(0,0,0,0.3)';
      for (let y = top + 18 * K; y < bot; y += 18 * K) g.fillRect(0, Math.round(y), Math.round(end + 10 * K), Math.max(1, Math.round(K)));
      g.fillStyle = '#7a5232';
      g.fillRect(0, Math.round(top), Math.round(end + 10 * K), Math.round(4 * K));
      g.fillStyle = '#3e2715';
      g.fillRect(0, Math.round(bot), Math.round(end + 10 * K), Math.round(face));
      // The belt: dark rubber with slats running along it, ending in a steel roller.
      g.fillStyle = '#2a2a30';
      g.fillRect(0, by - beltH / 2, end, beltH);
      g.fillStyle = '#3c3c46';
      const slat = 22 * K;
      const off = (api.t * speed()) % slat;
      for (let x = -slat + off; x < end; x += slat) g.fillRect(Math.round(x), by - beltH / 2, Math.max(2, Math.round(3 * K)), beltH);
      g.fillStyle = '#8a8a96';
      g.fillRect(0, by - beltH / 2 - 3 * K, end, 3 * K);
      g.fillRect(0, by + beltH / 2, end, 3 * K);
      g.fillStyle = '#5a5a66';
      g.fillRect(Math.round(end - 4 * K), Math.round(by - beltH / 2 - 4 * K), Math.round(10 * K), Math.round(beltH + 8 * K));
      g.fillStyle = '#b4b4c0';
      g.fillRect(Math.round(end - 2 * K), Math.round(by - beltH / 2 - 2 * K), Math.round(3 * K), Math.round(beltH + 4 * K));
      drawFire(g, fireX(), fireY(), K, api.t);
      // The bins: wooden crates, labelled for the rule now.
      for (let i = 0; i < 3; i++) {
        const flash = flashes.find((f) => f.bin === i);
        const label = r === 'type' ? ['Weapons', 'Armor', 'Accessories'][i] : r === 'rarity' ? RARITY_BINS[i].name : ELEMENT_NAMES[ELEMENTS[i]];
        const icon = r === 'type' ? [GEAR_SPRITES.shortSword, GEAR_SPRITES.commonClothes, GEAR_SPRITES.mithrilBand][i] : r === 'element' ? DAMAGE_TAG_ICONS[ELEMENTS[i]] : null;
        const x = binX(i) + 5 * K;
        const w = binW() - 10 * K;
        const y = binTop();
        drawCrate(g, x, y, w, binH(), K, r === 'rarity' ? RARITY_BINS[i].color : null, flash ? (flash.ok ? '#3fcf6a' : '#e04040') : null);
        const cx = x + w / 2;
        // Its badge: the bin's icon (or the rarity's colour) on a round plate on the crate's front.
        const badgeY = y + binH() * 0.42;
        const br = 17 * K;
        g.fillStyle = '#2a1a0e';
        g.beginPath();
        g.arc(cx, badgeY, br + 2 * K, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#f1e6c8';
        g.beginPath();
        g.arc(cx, badgeY, br, 0, Math.PI * 2);
        g.fill();
        if (icon) api.icon(icon, cx, badgeY, 26 * K);
        else {
          g.fillStyle = RARITY_BINS[i].color;
          g.beginPath();
          g.arc(cx, badgeY, br * 0.62, 0, Math.PI * 2);
          g.fill();
          g.strokeStyle = '#2a1a0e';
          g.lineWidth = 2 * K;
          g.stroke();
        }
        // Its name on a brass plate.
        const pw = Math.min(w - 12 * K, 92 * K);
        const ph = 17 * K;
        const py = y + binH() * 0.74;
        roundRect(g, cx - pw / 2 - 2 * K, py - ph / 2 - 2 * K, pw + 4 * K, ph + 4 * K, 5 * K, '#3a2410');
        roundRect(g, cx - pw / 2, py - ph / 2, pw, ph, 4 * K, '#d8b45a');
        g.fillStyle = '#f2d68a';
        g.fillRect(Math.round(cx - pw / 2 + 3 * K), Math.round(py - ph / 2 + 1 * K), Math.round(pw - 6 * K), Math.max(1, Math.round(2 * K)));
        g.font = canvasFont(Math.round(11 * K), 800);
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillStyle = '#3a2410';
        g.fillText(label, cx, py + 1 * K);
      }
      // The parts: on the belt, flying to their bin, or tumbling into the fire.
      const fr = front();
      for (const p of parts) {
        let x = p.x;
        let y = by;
        let s = S;
        let alpha = 1;
        let burn = 0;
        if (p.fly) {
          const t = Math.min(1, p.fly.t);
          if (p.fly.bin === -1) {
            // Swept off when the rule changes.
            y = by - t * 30 * K;
            alpha = 1 - t;
          } else if (p.fly.bin === -3) {
            // Off the end: tipping over the roller and dropping into the flames, charring as it goes.
            x = p.fly.fromX + (fireX() - p.fly.fromX) * Math.min(1, t * 1.4);
            y = p.fly.fromY + (fireY() - 4 * K - p.fly.fromY) * t * t;
            s = S * (1 - 0.45 * t);
            burn = Math.min(1, t * 1.6);
            alpha = t < 0.7 ? 1 : Math.max(0, 1 - (t - 0.7) / 0.3);
          } else if (p.fly.bin >= 0) {
            const tx = binX(p.fly.bin) + binW() / 2;
            const ty = binTop() + binH() * 0.2;
            x = p.fly.fromX + (tx - p.fly.fromX) * t;
            y = p.fly.fromY + (ty - p.fly.fromY) * t - Math.sin(Math.PI * t) * 50 * K;
            s = S * (1 - 0.35 * t);
          } else continue;
        }
        g.globalAlpha = alpha;
        // Its frame in its rarity's colour; the part at the front glows.
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
          // Charring: darkening, with the fire's glow on it.
          g.globalAlpha = alpha * burn * 0.7;
          g.fillStyle = '#1a0a04';
          g.fillRect(Math.round(x - s / 2 - 2), Math.round(y - s / 2 - 2), Math.round(s + 4), Math.round(s + 4));
          g.globalAlpha = alpha * burn * 0.35;
          g.fillStyle = '#ff7a1a';
          g.fillRect(Math.round(x - s / 2 - 2), Math.round(y - s / 2 - 2), Math.round(s + 4), Math.round(s + 4));
        }
        g.globalAlpha = 1;
      }
      // Embers drifting up from the fire.
      for (const e of embers) {
        g.globalAlpha = Math.max(0, 1 - e.t / e.life);
        g.fillStyle = e.t < e.life * 0.4 ? '#ffd36a' : '#ff7a2a';
        const d = Math.max(2, Math.round(2.5 * K));
        g.fillRect(Math.round(e.x), Math.round(e.y), d, d);
      }
      g.globalAlpha = 1;
      // Reginald at the start of his bench, setting the parts on the belt, and what to do.
      drawHunter(g, 'artificer', 34 * K, by - S * 1.1 - 4 * K, 56 * K, api.t);
      g.font = canvasFont(Math.round(15 * K), 700);
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineWidth = 3;
      g.strokeStyle = '#000';
      const left = Math.ceil(WS_RULE_TIME - (api.t % WS_RULE_TIME));
      const text = `${RULE_NAMES[r]}${api.t < WS_TIME - WS_RULE_TIME ? `  ·  next in ${left}s` : ''}`;
      const ty = by - S * 1.1 - 22 * K;
      g.strokeText(text, api.W / 2, ty);
      g.fillStyle = '#ffe08a';
      g.fillText(text, api.W / 2, ty);
      g.textBaseline = 'alphabetic';
    },
  };
}

/** A filled rounded rectangle. */
function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, color: string): void {
  g.fillStyle = color;
  g.beginPath();
  g.roundRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h), r);
  g.fill();
}

/** `a` blended toward `b` by `k` (hex colours). */
function mix(a: string, b: string, k: number): string {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * k).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * A sorting bin: a wooden crate, open at the top (its dark inside and back wall showing), planked, with iron corner
 * brackets and rivets. A rarity bin's wood is stained its rarity's colour; a part landing flashes it green or red.
 */
function drawCrate(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, K: number, tint: string | null, flash: string | null): void {
  const wood = tint ? mix('#9a6a3a', tint, 0.55) : '#9a6a3a';
  const dark = mix(wood, '#000000', 0.38);
  const light = mix(wood, '#ffffff', 0.22);
  // Its shadow on the floor.
  g.fillStyle = 'rgba(0,0,0,0.32)';
  g.beginPath();
  g.ellipse(x + w / 2, y + h + 3 * K, w * 0.52, 6 * K, 0, 0, Math.PI * 2);
  g.fill();
  // Outline, then the body.
  roundRect(g, x - 2 * K, y - 2 * K, w + 4 * K, h + 4 * K, 8 * K, '#1e120a');
  roundRect(g, x, y, w, h, 7 * K, wood);
  // The open top: its dark inside, the back wall's lit edge, and the front rim.
  const lip = h * 0.2;
  roundRect(g, x + 5 * K, y + 4 * K, w - 10 * K, lip, 4 * K, '#24160c');
  g.fillStyle = dark;
  g.fillRect(Math.round(x + 7 * K), Math.round(y + 6 * K), Math.round(w - 14 * K), Math.round(lip * 0.35));
  g.fillStyle = light;
  g.fillRect(Math.round(x + 4 * K), Math.round(y + 4 * K + lip), Math.round(w - 8 * K), Math.max(2, Math.round(3 * K)));
  // Planks across the front, with a little grain.
  g.fillStyle = dark;
  const front = y + 4 * K + lip + 3 * K;
  const rows = 3;
  for (let i = 1; i < rows; i++) g.fillRect(Math.round(x + 4 * K), Math.round(front + ((y + h - front) * i) / rows), Math.round(w - 8 * K), Math.max(1, Math.round(1.5 * K)));
  g.globalAlpha = 0.18;
  for (let i = 0; i < 6; i++) g.fillRect(Math.round(x + 10 * K + ((w - 20 * K) * i) / 5), Math.round(front + 4 * K), Math.max(1, Math.round(K)), Math.round((y + h - front) * 0.25));
  g.globalAlpha = 1;
  // Iron brackets on the four corners, each with a rivet.
  const b = 10 * K;
  const t = Math.max(2, Math.round(3 * K));
  g.fillStyle = '#4a4e58';
  for (const [cx, cy, sx, sy] of [
    [x, y, 1, 1],
    [x + w, y, -1, 1],
    [x, y + h, 1, -1],
    [x + w, y + h, -1, -1],
  ] as const) {
    g.fillRect(Math.round(sx > 0 ? cx : cx - b), Math.round(sy > 0 ? cy : cy - t), Math.round(b), t);
    g.fillRect(Math.round(sx > 0 ? cx : cx - t), Math.round(sy > 0 ? cy : cy - b), t, Math.round(b));
    g.fillStyle = '#b8bcc8';
    g.fillRect(Math.round(cx + sx * 5 * K - K), Math.round(cy + sy * 5 * K - K), Math.max(2, Math.round(2 * K)), Math.max(2, Math.round(2 * K)));
    g.fillStyle = '#4a4e58';
  }
  if (flash) {
    g.globalAlpha = 0.5;
    roundRect(g, x, y, w, h, 7 * K, flash);
    g.globalAlpha = 1;
  }
}

/** The fire past the belt's end: an iron brazier with flames licking up, flickering, and a warm glow round it. */
function drawFire(g: CanvasRenderingContext2D, x: number, y: number, K: number, t: number): void {
  // The glow.
  const glow = g.createRadialGradient(x, y - 14 * K, 4 * K, x, y - 14 * K, 60 * K);
  glow.addColorStop(0, 'rgba(255,150,40,0.45)');
  glow.addColorStop(1, 'rgba(255,120,20,0)');
  g.fillStyle = glow;
  g.fillRect(Math.round(x - 60 * K), Math.round(y - 74 * K), Math.round(120 * K), Math.round(120 * K));
  // The flames: pixel tongues of red, orange and yellow, each flickering on its own beat.
  const px = Math.max(2, Math.round(3 * K));
  const tongues = 7;
  for (let layer = 0; layer < 3; layer++) {
    const color = ['#d8331a', '#ff8a1e', '#ffd84a'][layer];
    const k = [1, 0.7, 0.42][layer];
    for (let i = 0; i < tongues; i++) {
      const fx = x + (i - (tongues - 1) / 2) * 6 * K * k * 1.2;
      const hgt = (24 + 12 * Math.sin(t * 9 + i * 1.9) + 6 * Math.sin(t * 15 + i)) * K * k * (1 - Math.abs(i - 3) * 0.12);
      const wid = 7 * K * k;
      for (let yy = 0; yy < hgt; yy += px) {
        const f = yy / Math.max(1, hgt);
        const ww = Math.max(px, Math.round((wid * (1 - f * 0.8)) / px) * px);
        g.fillStyle = color;
        g.fillRect(Math.round((fx - ww / 2) / px) * px, Math.round((y - 8 * K - yy) / px) * px, ww, px);
      }
    }
  }
  // The brazier: an iron bowl on short legs.
  g.fillStyle = '#1c1c22';
  g.fillRect(Math.round(x - 26 * K), Math.round(y - 10 * K), Math.round(52 * K), Math.round(14 * K));
  g.fillStyle = '#3a3a44';
  g.fillRect(Math.round(x - 24 * K), Math.round(y - 8 * K), Math.round(48 * K), Math.round(10 * K));
  g.fillStyle = '#5a5a66';
  g.fillRect(Math.round(x - 24 * K), Math.round(y - 8 * K), Math.round(48 * K), Math.max(2, Math.round(2 * K)));
  g.fillStyle = '#1c1c22';
  g.fillRect(Math.round(x - 20 * K), Math.round(y + 4 * K), Math.round(5 * K), Math.round(12 * K));
  g.fillRect(Math.round(x + 15 * K), Math.round(y + 4 * K), Math.round(5 * K), Math.round(12 * K));
}
