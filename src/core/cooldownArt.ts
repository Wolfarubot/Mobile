import type { DamageType, GearEffect, HunterId, UniqueId } from './balance';
import type { Wearer } from './state';

/**
 * The battlefield's cooldown icons: each is an ability-pack icon (public/icons/<pack>/<NNN>.png), redrawn in the
 * colours of the ability's damage type, or in its Hunter's skill tree colours when the damage type depends on the
 * Hunter (summons copy their weapon's type; Ted's dice roll one). See src/render/cdIcons.ts.
 */
export type CooldownTint = DamageType | { hunter: Wearer };

/** Your tap abilities (and the plain Blast), also shown in the Tap Abilities list. */
export const TAP_ART = { blast: 'ab-hunter-warrior/032', flame: 'ab-pyro-hydro/008', thunder: 'ab-geo-aero/052', frost: 'ab-pyro-hydro/069', miasma: 'ab-paladin-dk/092' } as const;
/** Gideon's Bone Wall. */
export const WALL_ART = 'ab-paladin-dk/093';
/** A tome summon's own move (the Wolf Spirit's lunge). */
export const DASH_ART = 'ab-hunter-warrior/028';
/** Artifact and Exalted pieces' built-in abilities. */
export const UNIQUE_ART: Record<UniqueId, string> = {
  stormcaller: 'ab-geo-aero/093',
  spellweaver: 'ab-rogue-warlock/065',
  gravewarden: 'ab-paladin-dk/070',
  meteorCaller: 'ab-pyro-hydro/036',
  eyeOfFlame: 'ab-pyro-hydro/050',
  cataclysm: 'ab-geo-aero/076',
  meteorStorm: 'ab-pyro-hydro/019',
  singularity: 'ab-rogue-warlock/080',
  eternalLegion: 'ab-rogue-warlock/096',
};

/** A piece of gear's recharging ability: its icon and colours (potions, which deal no damage, take their wearer's). */
export function gearCooldownArt(e: GearEffect, who: Wearer): { art: string; tint: CooldownTint } | null {
  switch (e.kind) {
    case 'pulse':
      return { art: 'ab-geo-aero/084', tint: e.damageType };
    case 'strike':
      return { art: 'ab-geo-aero/017', tint: e.damageType };
    case 'summon':
      return { art: e.look === 'puppet' ? 'ab-rogue-warlock/085' : 'ab-gunslinger-druid/095', tint: e.damageType };
    case 'unique':
      return { art: UNIQUE_ART[e.id], tint: e.damageType };
    case 'potion':
      return { art: 'ab-alchemist-shaman/010', tint: { hunter: who } };
    default:
      return null;
  }
}

/** A Guild Hunter's special: their own icon, in its damage type's colours, or theirs when it depends on them. */
export const specialTint = (who: HunterId, special: { kind: string; damageType: DamageType; summon?: unknown }): CooldownTint =>
  special.summon || special.kind === 'dice' ? { hunter: who } : special.damageType;
