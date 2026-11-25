/**
 * Your Hunter's look, chosen in the appearance editor: any head and any body from the Warrior, Mage and Archer
 * outfits (levels 1-9 of CraftPix's top-down Swordsman, Mage and Archer packs, public/hunters/parts/), a skin tone
 * and an eye colour. Outfit level n opens at Hunter Lv (n - 1) x 10 (level 1 from the start, level 9 at Lv 80). Level 2's
 * heads are left out (they're level 1's again), so there are 8 heads per outfit and 9 bodies.
 */

export type LookClass = 's' | 'm' | 'a';
export const LOOK_CLASSES: Array<{ id: LookClass; name: string }> = [
  { id: 's', name: 'Warrior' },
  { id: 'm', name: 'Mage' },
  { id: 'a', name: 'Archer' },
];
export const LOOK_TIERS = 9;

/** A head or body: its outfit and level, e.g. "s1" (Warrior 1) or "a9" (Archer 9). */
export type LookPart = `${LookClass}${number}`;
export const LOOK_PARTS: LookPart[] = LOOK_CLASSES.flatMap((c) => Array.from({ length: LOOK_TIERS }, (_, i) => `${c.id}${i + 1}` as LookPart));

export const partClass = (p: LookPart): LookClass => p[0] as LookClass;
export const partTier = (p: LookPart): number => Number(p.slice(1));
/** The Hunter level an outfit level opens at: 1, 10, 20 … 80. */
export const tierLevel = (tier: number): number => (tier <= 1 ? 1 : (tier - 1) * 10);
export const partLevel = (p: LookPart): number => tierLevel(partTier(p));
export const partName = (p: LookPart): string => `${LOOK_CLASSES.find((c) => c.id === partClass(p))!.name} ${partTier(p)}`;
/** Heads: every level but 2, whose heads are the same as level 1's. They keep their outfit's level (and when it
 * opens) but are numbered 1-8 in the editor: Warrior head 2 is the level-3 head, opening at Lv 20. */
export const LOOK_HEADS: LookPart[] = LOOK_PARTS.filter((p) => partTier(p) !== 2);
export const LOOK_BODIES: LookPart[] = LOOK_PARTS;
/** A head's name in the editor (numbered 1-8). */
export const headName = (p: LookPart): string => `${LOOK_CLASSES.find((c) => c.id === partClass(p))!.name} ${partTier(p) === 1 ? 1 : partTier(p) - 1}`;

type RGB = [number, number, number];

/** Skin tones, lightest first: highlight, base, shade, deep shade, darkest. */
export const SKIN_TONES: Array<{ id: string; name: string; ramp: RGB[] }> = [
  { id: 'pale', name: 'Very light', ramp: [[255, 236, 220], [250, 222, 202], [228, 190, 170], [198, 154, 138], [162, 120, 110]] },
  { id: 'fair', name: 'Fair', ramp: [[250, 214, 184], [234, 188, 160], [204, 156, 132], [164, 118, 106], [140, 100, 92]] },
  { id: 'rose', name: 'Rosy', ramp: [[255, 202, 150], [233, 179, 142], [192, 138, 123], [165, 116, 108], [126, 86, 85]] },
  { id: 'golden', name: 'Golden', ramp: [[246, 202, 116], [225, 178, 110], [190, 134, 95], [164, 111, 89], [121, 80, 72]] },
  { id: 'tan', name: 'Tan', ramp: [[208, 148, 108], [187, 123, 95], [158, 102, 85], [120, 80, 72], [98, 64, 63]] },
  { id: 'bronze', name: 'Bronze', ramp: [[201, 129, 85], [174, 109, 79], [157, 95, 75], [141, 82, 70], [110, 62, 57]] },
  { id: 'brown', name: 'Brown', ramp: [[208, 142, 78], [187, 117, 66], [160, 97, 66], [125, 71, 50], [94, 50, 39]] },
  { id: 'deep', name: 'Very dark', ramp: [[130, 86, 60], [106, 68, 48], [86, 54, 40], [66, 40, 32], [50, 30, 26]] },
];

/** Eye colours: the iris and its darker lower pixel. */
export const EYE_COLORS: Array<{ id: string; name: string; ramp: RGB[] }> = [
  { id: 'blue', name: 'Blue', ramp: [[63, 106, 212], [55, 74, 143]] },
  { id: 'sky', name: 'Sky', ramp: [[96, 196, 236], [48, 124, 164]] },
  { id: 'green', name: 'Green', ramp: [[37, 170, 83], [34, 125, 86]] },
  { id: 'hazel', name: 'Hazel', ramp: [[150, 132, 54], [98, 84, 36]] },
  { id: 'amber', name: 'Amber', ramp: [[226, 152, 40], [152, 94, 28]] },
  { id: 'brown', name: 'Brown', ramp: [[138, 84, 46], [90, 52, 30]] },
  { id: 'dark', name: 'Dark', ramp: [[51, 53, 65], [36, 36, 44]] },
  { id: 'grey', name: 'Grey', ramp: [[150, 160, 174], [98, 106, 122]] },
  { id: 'violet', name: 'Violet', ramp: [[152, 92, 222], [96, 56, 152]] },
  { id: 'red', name: 'Red', ramp: [[212, 52, 52], [132, 28, 34]] },
];

/** Each outfit pack's own skin colours (in SKIN_TONES order) and eye colours (iris, lower pixel). */
export const PACK_SKIN: Record<LookClass, RGB[]> = {
  s: SKIN_TONES[3].ramp,
  m: SKIN_TONES[2].ramp,
  a: SKIN_TONES[6].ramp,
};
export const PACK_EYES: Record<LookClass, RGB[]> = {
  s: EYE_COLORS[0].ramp,
  m: EYE_COLORS[2].ramp,
  a: EYE_COLORS[6].ramp,
};

export interface MainLook {
  head: LookPart;
  body: LookPart;
  skin: string;
  eyes: string;
}

export const DEFAULT_LOOK: MainLook = { head: 's1', body: 's1', skin: 'golden', eyes: 'blue' };

/** A saved look, checked piece by piece (anything unknown falls back to the default). */
export function readLook(x: unknown): MainLook {
  const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
  const part = (list: LookPart[], v: unknown, d: LookPart) => (list.includes(v as LookPart) ? (v as LookPart) : d);
  return {
    head: part(LOOK_HEADS, o.head, DEFAULT_LOOK.head),
    body: part(LOOK_BODIES, o.body, DEFAULT_LOOK.body),
    skin: SKIN_TONES.some((t) => t.id === o.skin) ? (o.skin as string) : DEFAULT_LOOK.skin,
    eyes: EYE_COLORS.some((t) => t.id === o.eyes) ? (o.eyes as string) : DEFAULT_LOOK.eyes,
  };
}
