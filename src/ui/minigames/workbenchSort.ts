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
 * a row 1 more; a part in the wrong bin, or one that falls off the belt, costs a heart. The belt speeds up as you
 * go. Sixty seconds.
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

/** Pieces for each rule (with art): any piece for type and rarity; weapons of one of the three elements for element. */
const POOL: Record<Rule, GearDef[]> = (() => {
  const drawn = GEAR.filter((g) => GEAR_SPRITES[g.id]);
  return {
    type: drawn,
    rarity: drawn,
    element: drawn.filter((g) => g.damageType && ELEMENTS.includes(g.damageType) && !g.extraTypes?.length && !g.special),
  };
})();

interface Part {
  gd: GearDef;
  x: number;
  /** Sent to a bin: flying there (0 → 1), and whether it was the right one. */
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
  const rule = (): Rule => RULES[Math.min(RULES.length - 1, Math.floor(api.t / WS_RULE_TIME))];
  const parts: Part[] = [];
  let spawnIn = 0.4;
  let streak = 0;
  let lastRule: Rule = 'type';
  /** A flash on a bin when a part lands: green for right, red for wrong. */
  const flashes: Array<{ bin: number; t: number; ok: boolean }> = [];

  /** Belt speed (px a second at a 400px-wide screen): gentle at first, quicker as the minute goes on. */
  const speed = () => (46 + api.t * 1.3) * k();
  const spawn = () => {
    const pool = POOL[rule()];
    parts.push({ gd: pool[Math.floor(Math.random() * pool.length)], x: -size() });
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
          p.fly.t += dt / 0.28;
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
        if (p.x > api.W + size() * 0.2) {
          // Off the end of the belt.
          p.fly = { t: 1, bin: -2, fromX: p.x, fromY: beltY(), ok: false };
          streak = 0;
          api.loseLife(api.W - 30 * k(), beltY());
        }
      }
      for (let i = parts.length - 1; i >= 0; i--) if (parts[i].fly && parts[i].fly!.t >= 1) parts.splice(i, 1);
      for (const f of flashes) f.t += dt;
      while (flashes.length && flashes[0].t > 0.35) flashes.shift();
    },
    draw(g) {
      const S = size();
      const by = beltY();
      const r = rule();
      // The workbench: a wooden top behind the belt and the bins.
      const top = by - S * 1.1;
      g.fillStyle = '#5c3b22';
      g.fillRect(0, top, api.W, api.H - top);
      // Its planks: a darker seam every few rows, and a lighter edge along the front.
      g.fillStyle = 'rgba(0,0,0,0.3)';
      for (let y = top + 18 * k(); y < api.H; y += 18 * k()) g.fillRect(0, Math.round(y), api.W, Math.max(1, Math.round(k())));
      g.fillStyle = '#7a5232';
      g.fillRect(0, Math.round(top), api.W, Math.round(4 * k()));
      // The belt: dark rubber with slats running along it.
      const beltH = S * 1.25;
      g.fillStyle = '#2a2a30';
      g.fillRect(0, by - beltH / 2, api.W, beltH);
      g.fillStyle = '#3c3c46';
      const slat = 22 * k();
      const off = (api.t * speed()) % slat;
      for (let x = -slat + off; x < api.W; x += slat) g.fillRect(Math.round(x), by - beltH / 2, Math.max(2, Math.round(3 * k())), beltH);
      g.fillStyle = '#8a8a96';
      g.fillRect(0, by - beltH / 2 - 3 * k(), api.W, 3 * k());
      g.fillRect(0, by + beltH / 2, api.W, 3 * k());
      // The edge it falls off: a red stripe at the right.
      g.fillStyle = '#c0392b';
      g.fillRect(api.W - 6 * k(), by - beltH / 2, 6 * k(), beltH);
      // The bins, labelled for the rule now.
      for (let i = 0; i < 3; i++) {
        const x = binX(i) + 4 * k();
        const w = binW() - 8 * k();
        const y = binTop();
        const flash = flashes.find((f) => f.bin === i);
        const color = r === 'rarity' ? RARITY_BINS[i].color : '#b88a52';
        g.fillStyle = '#000';
        g.fillRect(Math.round(x - 2), Math.round(y - 2), Math.round(w + 4), Math.round(binH() + 4));
        g.fillStyle = flash ? (flash.ok ? '#3fcf6a' : '#e04040') : color;
        g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(binH()));
        g.fillStyle = 'rgba(0,0,0,0.28)';
        g.fillRect(Math.round(x + 5 * k()), Math.round(y + binH() * 0.55), Math.round(w - 10 * k()), Math.round(binH() * 0.38));
        const cx = x + w / 2;
        const label = r === 'type' ? ['Weapons', 'Armor', 'Accessories'][i] : r === 'rarity' ? RARITY_BINS[i].name : ELEMENT_NAMES[ELEMENTS[i]];
        const icon = r === 'type' ? [GEAR_SPRITES.shortSword, GEAR_SPRITES.commonClothes, GEAR_SPRITES.mithrilBand][i] : r === 'element' ? DAMAGE_TAG_ICONS[ELEMENTS[i]] : null;
        if (icon) api.icon(icon, cx, y + binH() * 0.32, 30 * k());
        else {
          // Rarity: a framed swatch of its colour.
          g.fillStyle = '#fff';
          g.fillRect(Math.round(cx - 13 * k()), Math.round(y + binH() * 0.32 - 13 * k()), Math.round(26 * k()), Math.round(26 * k()));
          g.fillStyle = RARITY_BINS[i].color;
          g.fillRect(Math.round(cx - 10 * k()), Math.round(y + binH() * 0.32 - 10 * k()), Math.round(20 * k()), Math.round(20 * k()));
        }
        g.font = canvasFont(Math.round(12 * k()), 700);
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.lineWidth = 3;
        g.lineJoin = 'round';
        g.strokeStyle = '#000';
        g.strokeText(label, cx, y + binH() * 0.74);
        g.fillStyle = '#fff';
        g.fillText(label, cx, y + binH() * 0.74);
      }
      // The parts: on the belt, or flying to their bin.
      const fr = front();
      for (const p of parts) {
        let x = p.x;
        let y = by;
        let s = S;
        let alpha = 1;
        if (p.fly) {
          const t = Math.min(1, p.fly.t);
          if (p.fly.bin === -1) {
            // Swept off when the rule changes.
            y = by - t * 30 * k();
            alpha = 1 - t;
          } else if (p.fly.bin >= 0) {
            const tx = binX(p.fly.bin) + binW() / 2;
            const ty = binTop() + binH() * 0.4;
            x = p.fly.fromX + (tx - p.fly.fromX) * t;
            y = p.fly.fromY + (ty - p.fly.fromY) * t - Math.sin(Math.PI * t) * 50 * k();
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
        g.globalAlpha = 1;
      }
      // Reginald at the end of his bench, and what to do.
      drawHunter(g, 'artificer', api.W - 34 * k(), by - S * 1.1 - 4 * k(), 56 * k(), api.t);
      g.font = canvasFont(Math.round(15 * k()), 700);
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineWidth = 3;
      g.strokeStyle = '#000';
      const left = Math.ceil(WS_RULE_TIME - (api.t % WS_RULE_TIME));
      const text = `${RULE_NAMES[r]}${api.t < WS_TIME - WS_RULE_TIME ? `  ·  next in ${left}s` : ''}`;
      const ty = by - S * 1.1 - 22 * k();
      g.strokeText(text, api.W / 2, ty);
      g.fillStyle = '#ffe08a';
      g.fillText(text, api.W / 2, ty);
      g.textBaseline = 'alphabetic';
    },
  };
}
