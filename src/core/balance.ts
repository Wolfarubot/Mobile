import { GEAR_CATALOG, type CatalogGearId, type CatalogSpec } from './gearCatalog';

// All tunable numbers, content tables and pure formulas live here so balancing never touches game flow code.

// ---- Player & combat ----
export const BASE_FIRE_RATE = 1.6; // volleys per second
/** Monsters on the Wandering Woods' battlefield at most; bigger areas hold more (× areaScale). */
export const MAX_ENEMIES = 160;
export const BULLET_SPEED = 520;
export const BASE_CRIT_CHANCE = 0.05;
export const CRIT_MULT = 3;
export const TAP_DAMAGE_MULT = 2; // a tap blast deals this many shots of damage
export const TAP_RADIUS = 48;
/** An enemy that reaches the Hunter stuns them this long (seconds), then flees. */
export const STUN_TIME = 1.2;
/** Bosses don't flee: they stun longer and bounce off. */
export const BOSS_STUN_TIME = 2.5;
/**
 * Stuns never stack or extend: monsters that reach a stunned Hunter just run off. After a stun wears off
 * the Hunter can't be re-stunned for this long, so they always get some shots off.
 */
export const STUN_IMMUNITY = 1.2;
/** Fleeing enemies run this much faster than they approached. */
export const FLEE_SPEED_MULT = 1.4;
export const BASE_DROP_CHANCE = 0.07; // chance an enemy drops its material
export const BOSS_MATERIAL_DROP = 10;
/** Seconds to defeat an area's Guardian once challenged. */
export const GUARDIAN_TIME = 45;
/** Gold for slaying a Guardian, in kills' worth of the area's basic enemy. */
export const GUARDIAN_GOLD_MULT = 50;

// ---- Offline ----
/**
 * Hours away that count toward offline progress, to start with. Ten Energy Potions (crafted once each, from a
 * Guardian's spoils and the rare ores and gems along the way, one an area from the Fey Grove to the Meteor Field)
 * add 2 hours each: 24 hours with all ten.
 */
export const OFFLINE_BASE_SEC = 4 * 3600;
export const OFFLINE_POTION_SEC = 2 * 3600;
export const OFFLINE_POTIONS = ['pixiePotion', 'bonePotion', 'lichPotion', 'watcherPotion', 'demonPotion', 'venomPotion', 'glacialPotion', 'skyPotion', 'stormPotion', 'starPotion'] as const;
/** Fraction of the online kill rate earned while away. */
export const OFFLINE_EFFICIENCY = 0.5;
/** A background battlefield sample (sampler.ts) is used once it has measured this many seconds. */
export const SAMPLE_MIN_SECONDS = 20;
/** Shorter absences are granted silently (no Welcome Back popup), e.g. when switching apps. */
export const OFFLINE_POPUP_SEC = 15 * 60;

// ---- Events: timed challenges per area, unlocked by slaying monsters there, then on a cooldown ----
export type EventKind = 'guardian' | 'swarm' | 'minigame';

/** Minigames: hands-on events played on their own screen, one per area with a Hunter from that area. */
export type MinigameId = 'huntingPractice' | 'pixieSerenade' | 'graveRobbing' | 'puppetShow' | 'shootingGallery' | 'forgeStrike' | 'runeMatch' | 'icebreaker';

/**
 * A blessing from a smithing minigame: your next Refine (Kargesh) or Enchant (Marceline) rolls every option's
 * quality this many extra times and keeps the best, so a perfect roll is likelier. Earned by score (the tiers).
 */
export interface Blessing {
  kind: 'refine' | 'enchant';
  /** Scores that earn 1, 2 and 3 extra rolls. */
  tiers: number[];
}

export interface EventDef {
  id: string;
  area: AreaId;
  kind: EventKind;
  name: string;
  icon: string;
  blurb: string;
  /** Monsters slain in the area to unlock it (a Guardian Challenge unlocks at the area's mastery). */
  unlockKills: number;
  /** Count only this archetype's kills in the area toward unlocking it (e.g. slimes for the Slime Swarm). */
  unlockArchetype?: Archetype;
  /** Seconds after starting before it can run again. */
  cooldown: number;
  /** Seconds it lasts (a Guardian gives you GUARDIAN_TIME once it appears). */
  duration: number;
  /** Swarm: only this archetype spawns, with spawn rate and speed multiplied. */
  archetype?: Archetype;
  spawnMult?: number;
  speedMult?: number;
  /** Swarm: spawns per second a monster gets at least, if its multiplied rate is lower. */
  minSpawn?: Partial<Record<EnemyId, number>>;
  /** Also needs another event completed this many times first (a Guardian waits on its area's first event). */
  requires?: { event: string; times: number };
  /** Minigame: which one, and the Hunter who stars in it (it opens once they're recruited). */
  minigame?: MinigameId;
  hunter?: HunterId;
  /**
   * Minigame rewards for a score: `gold` Guardian bounties per point (the furthest area reached's gold ×
   * GUARDIAN_GOLD_MULT), and
   * of each material, `per` points earn one.
   */
  rewards?: { gold: number; materials: Array<{ material: MaterialId; per: number }> };
  /** Minigame: a blessing on your next Refine or Enchant, by score. */
  blessing?: Blessing;
}

export const GUARDIAN_COOLDOWN = 5 * 60;

// EVENTS is built at the end of this file, once AREAS exists.

// ---- Training & skills (every Hunter, you included) ----
// Hunters *train* with gold: every session adds a little damage. Enough training raises their level,
// and each level earns a skill point for their skill tree.

/** Each training session adds this much of the weapon's base damage (a multiplier on every hit). */
export const TRAIN_DAMAGE = 0.01;
/** Training's damage multiplier after `trains` sessions: +1% per session (about ×6 at Lv 30, ×50 at Lv 100). */
export function powerDamage(trains: number): number {
  return 1 + TRAIN_DAMAGE * trains;
}

/** Training sessions needed to go from `level` to the next (Lv 1→2: 3, 2→3: 4, ...). */
export const trainsForLevel = (level: number): number => level + 2;

/** Level reached after `trains` sessions, and progress toward the next one. */
export function levelFromTrains(trains: number): { level: number; into: number; need: number } {
  let level = 1;
  let left = trains;
  while (left >= trainsForLevel(level)) {
    left -= trainsForLevel(level);
    level++;
  }
  return { level, into: left, need: trainsForLevel(level) };
}

/** Your Hunter's training cost: `MAIN_TRAIN_COST × MAIN_TRAIN_GROWTH^trains`. Guild Hunters use helperTrainCost. */
export const MAIN_TRAIN_COST = 8;
export const MAIN_TRAIN_GROWTH = 1.075;

/** What skill-tree nodes can improve (per rank). */
export type TreeStat =
  | 'damage' // +x attack damage (multiplier)
  | 'rate' // +x attack rate (multiplier)
  | 'recovery' // ranks of Recovery Speed: stuns ×0.92 each
  | 'crit' // +x crit chance
  | 'range' // +x world units of range
  | 'pierce' // +x enemies each shot passes through
  | 'radius' // +x area-effect size (multiplier)
  | 'bane' // +x to their archetype damage multiplier
  | 'bolts' // Themus: blood bolts burst from each monster his Crimson Wave kills
  | 'guard' // shield charges before being stunned
  | 'rally' // shield charges granted to every other Hunter
  | 'gold' // +x gold from their kills
  | 'drops' // +x materials from their kills
  | 'tapPower' // +x tap blast damage
  | 'tapSize' // +x tap blast area
  | 'cooldown' // -x cooldowns of their gear's abilities and their tap ability (Quick Casting)
  | 'duration' // +x how long the status effects they set off last (Extended Effects)
  | 'critDamage' // +x crit damage (Brutal Criticals)
  | 'multishot'; // extra projectiles per shot, or an extra strike per melee attack (Apex Hunter)

/** A node in a branching tree: a Hunter's skill tree or a monster's evolution tree. */
export interface TreeNode<S extends string = string> {
  id: string;
  name: string;
  icon: string;
  desc: string;
  maxRank: number;
  /** Effect per rank. */
  effect: Partial<Record<S, number>>;
  /** Nodes that must have at least one rank first (any one of them). */
  requires: string[];
  /** Skill points each rank costs (default 1). */
  cost?: number;
  /** Grid position in the tree: column 0–2 (0–4 in your Hunter's trees; halves like 1.5 stagger a row), row from the top. */
  col: number;
  row: number;
  /** Your Hunter: the tap ability this node unlocks (equip it under Tap Abilities on the Overview). */
  ability?: TapAbilityId;
  /** A monster's capstone: every monster of its archetype gains this drop (a share of its drop chance). */
  legacy?: { material: MaterialId; share: number };
}
export type SkillNode = TreeNode<TreeStat>;

/** Recovery Speed: each rank shortens stuns by this factor. */
export const SKILL_RECOVERY = 0.92;

type NodeSpec = Pick<SkillNode, 'name' | 'icon' | 'desc' | 'maxRank' | 'effect' | 'cost'>;

// ---- Guild Hunters' trees: small steady steps like your own tree, each Hunter's shaped around what they do ----

const pctOf = (v: number): string => `${+(v * 100).toFixed(1)}%`;
/** Ranks of SKILL_RECOVERY that make stuns wear off 5% faster (Guild Hunters use the same step as you). */
const REC_STEP = Math.log(0.95) / Math.log(SKILL_RECOVERY);
// Stock nodes: the per-rank numbers every tree shares, under each Hunter's own names.
const atk = (maxRank: number, name = 'Attack Power', icon = '💪', v = 0.2): NodeSpec => ({ name, icon, desc: `+${pctOf(v)} damage per rank.`, maxRank, effect: { damage: v } });
const spd = (maxRank: number, name = 'Attack Speed', icon = '⚡', v = 0.05): NodeSpec => ({ name, icon, desc: `+${pctOf(v)} attack rate per rank.`, maxRank, effect: { rate: v } });
const rec = (maxRank: number, name = 'Recovery Speed', icon = '🧘'): NodeSpec => ({ name, icon, desc: 'Stuns wear off 5% faster per rank.', maxRank, effect: { recovery: REC_STEP } });
const crt = (maxRank: number, name: string, icon: string, v = 0.025): NodeSpec => ({ name, icon, desc: `+${pctOf(v)} crit chance per rank.`, maxRank, effect: { crit: v } });
const crd = (maxRank: number, name: string, icon: string, v = 0.1): NodeSpec => ({ name, icon, desc: `Critical hits deal +${pctOf(v)} more damage per rank.`, maxRank, effect: { critDamage: v } });
const rng = (maxRank: number, name: string, icon: string, v = 10): NodeSpec => ({ name, icon, desc: `+${v} range per rank.`, maxRank, effect: { range: v } });
const area = (maxRank: number, name: string, icon: string, what: string, v = 0.1): NodeSpec => ({ name, icon, desc: `${what} ${pctOf(v)} per rank.`, maxRank, effect: { radius: v } });
const cdr = (maxRank: number, name: string, icon: string, what = 'Their special recharges', v = 0.05): NodeSpec => ({ name, icon, desc: `${what} ${pctOf(v)} faster per rank.`, maxRank, effect: { cooldown: v } });
const dur = (maxRank: number, name: string, icon: string, v = 0.1): NodeSpec => ({ name, icon, desc: `The status effects they set off last ${pctOf(v)} longer per rank.`, maxRank, effect: { duration: v } });
const prc = (maxRank: number, name: string, icon: string, cost?: number): NodeSpec => ({ name, icon, desc: 'Shots pierce 1 more enemy per rank.', maxRank, effect: { pierce: 1 }, cost });
const grd = (maxRank: number, name: string, icon: string, cost?: number): NodeSpec => ({ name, icon, desc: '+1 shield charge per rank.', maxRank, effect: { guard: 1 }, cost });
const ban = (maxRank: number, name: string, icon: string, foes: string, v = 0.25): NodeSpec => ({ name, icon, desc: `+${v}× extra damage to ${foes} per rank.`, maxRank, effect: { bane: v } });
const gld = (maxRank: number, name: string, icon: string, v = 0.1): NodeSpec => ({ name, icon, desc: `+${pctOf(v)} gold from their kills per rank.`, maxRank, effect: { gold: v } });
const drp = (maxRank: number, name: string, icon: string, v = 0.05): NodeSpec => ({ name, icon, desc: `+${pctOf(v)} materials from their kills per rank.`, maxRank, effect: { drops: v } });
const multi = (name: string, icon: string, cost: number): NodeSpec => ({ name, icon, desc: 'Ranged and Magic attacks fire an extra projectile; melee attacks follow up with another strike.', maxRank: 1, effect: { multishot: 1 }, cost });

type GridNode = NodeSpec & { id: string };
/**
 * Lays a tree out row by row, centred on column 2 of five (the same grid as your tree): a row of n nodes sits
 * at columns 2 - (n-1)/2, +1, ... Each node needs any node touching it in the row above (a column or less away).
 */
function gridTree(rows: GridNode[][]): SkillNode[] {
  const out: SkillNode[] = [];
  rows.forEach((row, r) => {
    const above = out.filter((n) => n.row === r - 1);
    row.forEach((spec, i) => {
      const col = 2 - (row.length - 1) / 2 + i;
      out.push({ ...spec, requires: above.filter((p) => Math.abs(p.col - col) <= 1).map((p) => p.id), col, row: r });
    });
  });
  return out;
}
const at = (id: string, spec: NodeSpec): GridNode => ({ id, ...spec });

// ---- Your Hunter: tap abilities, unlocked in the skill tree and swapped under Tap Abilities on the Overview ----

export type TapAbilityId = 'flame' | 'thunder' | 'frost' | 'miasma';

/**
 * Elemental tap abilities: with one equipped, a tap blast deals its element's damage (instead of your weapon's)
 * and always sets off its effect on everything it hits.
 */
export interface TapAbilityDef {
  id: TapAbilityId;
  name: string;
  icon: string;
  damageType: DamageType;
  /** Tap blast damage multiplier. */
  damage: number;
  desc: string;
}
export const TAP_ABILITIES: TapAbilityDef[] = [
  { id: 'flame', name: 'Flame Burst', icon: '🔥', damageType: 'fire', damage: 1, desc: 'Your taps deal Fire damage, and every 3s a tap erupts, setting everything it hits ablaze.' },
  { id: 'thunder', name: 'Thunderclap', icon: '⚡', damageType: 'lightning', damage: 1, desc: 'Your taps crack with lightning: every monster hit arcs a bolt to another one nearby.' },
  { id: 'frost', name: 'Frost Nova', icon: '❄️', damageType: 'frost', damage: 1, desc: 'Your taps freeze: everything hit is chilled (half speed) for 3s.' },
  { id: 'miasma', name: 'Melting Miasma', icon: '☠️', damageType: 'poison', damage: 1, desc: 'Your taps poison everything they hit, and every 4s a tap leaves a poison puddle that hurts monsters walking through it.' },
];
export const tapAbilityDef = (id: TapAbilityId): TapAbilityDef => TAP_ABILITIES.find((a) => a.id === id)!;
/** How long Frost Nova chills. */
export const FROST_TAP_CHILL = 3;
/**
 * Melting Miasma's puddle: at most one per `cooldown` seconds (shortened by Quick Casting), as wide as the tap
 * blast, lasting `ticks` puddle ticks, each hurting everything in it for `share` of the tap's damage.
 */
/** Flame Burst sets monsters ablaze at most once per this many seconds (shortened by Quick Casting). */
export const FLAME_BURST_COOLDOWN = 3;
export const MIASMA_PUDDLE = { cooldown: 4, ticks: 6, share: 0.15 };

/**
 * Your Hunter's first tree, as laid out in the Skill Trees editor: two diamonds. The root opens three branches
 * (power, speed, recovery); their wings lead to Flame Burst and Frost Nova and meet again at Apex Hunter. Below
 * it, four more branches lead out to Thunderclap and Melting Miasma on the wings and come back together at
 * Legend, then Ascend. Each node needs one of the nodes touching it in the row above; row gates pace the rest.
 */
const TAP_HINT = 'Equip it under Tap Abilities on your Overview.';
/** Ranks of SKILL_RECOVERY that make stuns wear off 5% faster. */
const RECOVERY_5 = Math.log(0.95) / Math.log(SKILL_RECOVERY);
const MAIN_FIRST_TREE: SkillNode[] = [
  { id: 'root', name: "Hunter's Instinct", icon: '👁️', desc: '+5% crit chance.', maxRank: 1, effect: { crit: 0.05 }, requires: [], col: 2, row: 0 },
  // First diamond
  { id: 'power', name: 'Attack Power', icon: '💪', desc: '+20% damage per rank.', maxRank: 5, effect: { damage: 0.2 }, requires: ['root'], col: 1, row: 1 },
  { id: 'speed', name: 'Attack Speed', icon: '⚡', desc: '+5% attack rate per rank.', maxRank: 5, effect: { rate: 0.05 }, requires: ['root'], col: 2, row: 1 },
  { id: 'recovery', name: 'Recovery Speed', icon: '🧘', desc: 'Stuns wear off 5% faster per rank.', maxRank: 3, effect: { recovery: RECOVERY_5 }, requires: ['root'], col: 3, row: 1 },
  { id: 'power2', name: 'Tap Power', icon: '👆', desc: '+25% tap blast damage per rank.', maxRank: 5, effect: { tapPower: 0.25 }, requires: ['power'], col: 0.5, row: 2 },
  { id: 'eagleEye', name: 'Eagle Eye', icon: '🎯', desc: '+2.5% crit chance per rank.', maxRank: 2, effect: { crit: 0.025 }, requires: ['speed'], col: 2, row: 2 },
  { id: 'recovery2', name: 'Tap Size', icon: '💥', desc: '+20% tap blast area per rank.', maxRank: 4, effect: { tapSize: 0.2 }, requires: ['recovery'], col: 3.5, row: 2 },
  { id: 'flameTap', name: 'Flame Burst', icon: '🔥', desc: `Unlocks the Flame Burst tap ability: taps deal Fire damage, and every ${FLAME_BURST_COOLDOWN}s a tap sets everything it hits ablaze. ${TAP_HINT}`, maxRank: 1, effect: {}, ability: 'flame', requires: ['power2'], col: 0.5, row: 3 },
  { id: 'speed2', name: 'Piercing Shot', icon: '🔱', desc: 'Shots pierce 1 more enemy.', maxRank: 1, effect: { pierce: 1 }, requires: ['eagleEye'], col: 2, row: 3 },
  { id: 'frostTap', name: 'Frost Nova', icon: '❄️', desc: `Unlocks the Frost Nova tap ability: taps deal Frost damage and chill monsters. ${TAP_HINT}`, maxRank: 1, effect: {}, ability: 'frost', requires: ['recovery2'], col: 3.5, row: 3 },
  { id: 'wideTaps', name: 'Wide Taps', icon: '🌀', desc: '+10% tap blast area per rank.', maxRank: 4, effect: { tapSize: 0.1 }, requires: ['flameTap'], col: 1, row: 4 },
  { id: 'prosperity', name: 'Prosperity', icon: '🪙', desc: '+15% gold from your kills per rank.', maxRank: 3, effect: { gold: 0.15 }, requires: ['speed2'], col: 2, row: 4 },
  { id: 'bulwark', name: 'Bulwark', icon: '🛡️', desc: '+1 shield charge per rank.', maxRank: 2, effect: { guard: 1 }, requires: ['frostTap'], col: 3, row: 4 },
  {
    id: 'capstone',
    name: 'Apex Hunter',
    icon: '👑',
    desc: 'Ranged and Magic attacks fire an extra projectile; melee attacks follow up with another strike, and dagger bursts throw one more dagger.',
    maxRank: 1,
    effect: { multishot: 1 },
    requires: ['wideTaps', 'prosperity', 'bulwark'],
    col: 2,
    row: 5,
  },
  // Second diamond
  { id: 'reach', name: 'Reach', icon: '📏', desc: '+15 range per rank.', maxRank: 3, effect: { range: 15 }, requires: ['capstone'], col: 1, row: 6 },
  { id: 'will', name: 'Quick Casting', icon: '⏱️', desc: "Your gear's abilities and your tap ability recharge 10% faster per rank.", maxRank: 3, effect: { cooldown: 0.1 }, requires: ['capstone'], col: 2, row: 6 },
  { id: 'longShot', name: 'Long Shot', icon: '🔭', desc: '+10 range per rank.', maxRank: 3, effect: { range: 10 }, requires: ['capstone'], col: 3, row: 6 },
  { id: 'deadlyTaps', name: 'Deadly Taps', icon: '👊', desc: '+30% tap blast damage per rank.', maxRank: 4, effect: { tapPower: 0.3 }, requires: ['reach'], col: 0.5, row: 7 },
  { id: 'fortune', name: 'Fortune', icon: '🍀', desc: '+10% gold from your kills per rank.', maxRank: 3, effect: { gold: 0.1 }, requires: ['reach', 'will'], col: 1.5, row: 7 },
  { id: 'treasure', name: 'Treasure Sense', icon: '💎', desc: '+5% materials from your kills per rank.', maxRank: 3, effect: { drops: 0.05 }, requires: ['will', 'longShot'], col: 2.5, row: 7 },
  { id: 'extendedEffects', name: 'Extended Effects', icon: '⏳', desc: 'The status effects you set off last 10% longer per rank.', maxRank: 3, effect: { duration: 0.1 }, requires: ['longShot'], col: 3.5, row: 7 },
  { id: 'thunderTap', name: 'Thunderclap', icon: '⚡', desc: `Unlocks the Thunderclap tap ability: taps deal Lightning damage and arc to monsters nearby. ${TAP_HINT}`, maxRank: 1, effect: {}, ability: 'thunder', requires: ['deadlyTaps'], col: 0.5, row: 8 },
  { id: 'haste', name: "Hunter's Haste", icon: '💨', desc: '+5.5% attack rate per rank.', maxRank: 5, effect: { rate: 0.055 }, requires: ['fortune'], col: 1.5, row: 8 },
  { id: 'brutalCriticals', name: 'Brutal Criticals', icon: '💢', desc: 'Your critical hits deal +50% more damage.', maxRank: 1, effect: { critDamage: 0.5 }, requires: ['treasure'], col: 2.5, row: 8 },
  { id: 'meltingMiasma', name: 'Melting Miasma', icon: '☠️', desc: `Unlocks the Melting Miasma tap ability: taps deal Poison damage and poison monsters, and every 4s a tap leaves a poison puddle that hurts monsters walking through it. ${TAP_HINT}`, maxRank: 1, effect: {}, ability: 'miasma', requires: ['extendedEffects'], col: 3.5, row: 8 },
  { id: 'goldTouch', name: 'Golden Touch', icon: '✨', desc: '+20% gold from your kills per rank.', maxRank: 2, effect: { gold: 0.2 }, requires: ['thunderTap', 'haste'], col: 1, row: 9 },
  { id: 'shieldWall', name: 'Shield Wall', icon: '🛡️', desc: '+1 shield charge.', maxRank: 1, effect: { guard: 1 }, requires: ['haste', 'brutalCriticals'], col: 2, row: 9 },
  { id: 'bounty', name: 'Bounty', icon: '💰', desc: '+15% materials from your kills per rank.', maxRank: 3, effect: { drops: 0.15 }, requires: ['brutalCriticals', 'meltingMiasma'], col: 3, row: 9 },
  { id: 'keenEye', name: 'Keen Eye', icon: '🦅', desc: '+5% crit chance per rank.', maxRank: 3, effect: { crit: 0.05 }, requires: ['goldTouch', 'shieldWall'], col: 1.5, row: 10 },
  { id: 'might', name: "Hunter's Might", icon: '🗡️', desc: '+10% damage per rank.', maxRank: 5, effect: { damage: 0.1 }, requires: ['shieldWall', 'bounty'], col: 2.5, row: 10 },
  // 7 points (not the editor's 10) so the whole tree, then Ascend, fits in the 99 points earned by Lv 100.
  { id: 'legend', name: 'Legend', icon: '🏆', desc: '+50% damage and +20% attack rate.', maxRank: 1, cost: 7, effect: { damage: 0.5, rate: 0.2 }, requires: ['keenEye', 'might'], col: 2, row: 11 },
];

/**
 * Row gates: points a Hunter must have spent in a tree before a row of it opens (rows count from 0, the root's, so
 * `{ 2: 5 }` keeps the third row shut until 5 points are in). Keyed like NODE_SPRITES: "main", a Hunter's id, or
 * either with "+" for their Ascended tree; trees without their own entry use the defaults below. Rows not listed
 * are open. The Skill Trees editor sets these per tree.
 */
export type RowGates = Partial<Record<number, number>>;
export const DEFAULT_ROW_GATES: { main: RowGates; mainAscended: RowGates; hunter: RowGates; hunterAscended: RowGates } = {
  main: { 2: 5, 3: 10, 4: 15, 5: 20, 6: 35, 9: 55 },
  mainAscended: { 2: 15, 3: 40 },
  hunter: { 2: 5, 3: 15, 4: 30 },
  hunterAscended: { 2: 10, 3: 25, 4: 40 },
};
export const ROW_GATES: Record<string, RowGates> = {};
export function rowGates(tree: string): RowGates {
  return ROW_GATES[tree] ?? (tree === 'main' ? DEFAULT_ROW_GATES.main : tree === 'main+' ? DEFAULT_ROW_GATES.mainAscended : tree.endsWith('+') ? DEFAULT_ROW_GATES.hunterAscended : DEFAULT_ROW_GATES.hunter);
}

/** Your Hunter's gold Ascend node, below Legend: 10 points, so Lv 100. */
export const MAIN_ASCEND_NODE: SkillNode = {
  id: 'ascend',
  name: 'Ascend',
  icon: '🌟',
  desc: 'Become the Slayer: a new skill tree, and training up to Lv 200. Keeps Lv 100; the level curve starts over (1 session to Lv 101).',
  maxRank: 1,
  cost: 10,
  effect: {},
  requires: ['legend'],
  col: 2,
  row: 12,
};

/** Your Hunter's level cap before ascending, and after (as the Slayer). */
export const MAIN_ASCEND_LEVEL = 100;
export const MAIN_MAX_LEVEL = 200;

/**
 * Past Lv 30 each of your Hunter's sessions costs this much more than the last: a little faster than the
 * damage a session adds (×2 every 25), so gold stays what paces the climb and the richer areas keep mattering,
 * while the price stays within range all the way to Lv 200.
 */
export const MAIN_TAPER_GROWTH = 1.03;

/** Cost of `count` of your Hunter's sessions after `done`: ×MAIN_TRAIN_GROWTH to Lv 30, then ×MAIN_TAPER_GROWTH. */
export function mainBulkCost(done: number, count: number): number {
  return taperedBulkCost(MAIN_TRAIN_COST, MAIN_TRAIN_GROWTH, MAIN_TAPER_GROWTH, done, count);
}

/** Sessions of a two-speed cost curve: `growth` per session until Lv 30 (HELPER_TAPER_SESSIONS), then `taper`. */
export function taperedBulkCost(base: number, growth: number, taper: number, done: number, count: number): number {
  if (count <= 0) return 0;
  const k = HELPER_TAPER_SESSIONS;
  const steep = Math.max(0, Math.min(count, k - done));
  const before = bulkCost(base, growth, done, steep);
  const flat = count - steep;
  if (flat <= 0) return before;
  return before + bulkCost(base * growth ** k, taper, Math.max(done, k) - k, flat);
}

/** How many sessions `gold` buys on a cost curve `cost(count)` (at most `limit`). */
export function affordableCount(cost: (count: number) => number, gold: number, limit: number): number {
  let lo = 0;
  let hi = Math.max(0, limit);
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (cost(mid) <= gold) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** The Slayer's tree (100 points: Lv 101–200), five wide like your first tree; its capstone the last 21 points. */
export const SLAYER_TREE: SkillNode[] = [
  { id: 'root', name: "Slayer's Oath", icon: '⚔️', desc: '+30% damage and +10% attack rate.', maxRank: 1, cost: 4, effect: { damage: 0.3, rate: 0.1 }, requires: [], col: 2, row: 0 },
  { id: 'power', name: 'Carnage', icon: '🩸', desc: '+7% damage per rank.', maxRank: 15, effect: { damage: 0.07 }, requires: ['root'], col: 0, row: 1 },
  { id: 'speed', name: 'Frenzy', icon: '⚡', desc: '+7% attack rate per rank.', maxRank: 15, effect: { rate: 0.07 }, requires: ['root'], col: 1, row: 1 },
  { id: 'recovery', name: 'Unbreakable', icon: '🗿', desc: 'Stuns wear off 8% faster per rank.', maxRank: 5, effect: { recovery: 1 }, requires: ['root'], col: 2, row: 1 },
  { id: 'farSight', name: 'Far Sight', icon: '🔭', desc: '+10 range per rank.', maxRank: 5, effect: { range: 10 }, requires: ['root'], col: 3, row: 1 },
  { id: 'plunder', name: 'Plunder', icon: '🪙', desc: '+10% gold and materials from your kills per rank.', maxRank: 5, effect: { gold: 0.1, drops: 0.1 }, requires: ['root'], col: 4, row: 1 },
  { id: 'power2', name: 'Precision', icon: '🎯', desc: '+1.25% crit chance per rank.', maxRank: 8, effect: { crit: 0.0125 }, requires: ['power'], col: 0, row: 2 },
  { id: 'speed2', name: 'Tap Fury', icon: '💥', desc: '+40% tap blast damage per rank.', maxRank: 8, effect: { tapPower: 0.4 }, requires: ['speed'], col: 1, row: 2 },
  { id: 'recovery2', name: 'Tap Reach', icon: '🌊', desc: '+9% tap blast area per rank.', maxRank: 9, effect: { tapSize: 0.09 }, requires: ['recovery'], col: 2, row: 2 },
  { id: 'ironSkin', name: 'Iron Skin', icon: '🛡️', desc: '+1 shield charge per rank.', maxRank: 2, effect: { guard: 1 }, requires: ['farSight'], col: 3, row: 2 },
  { id: 'spoils', name: 'Spoils', icon: '💰', desc: '+15% materials from your kills per rank.', maxRank: 3, effect: { drops: 0.15 }, requires: ['plunder'], col: 4, row: 2 },
  { id: 'capstone', name: 'Godslayer', icon: '👑', desc: '+100% damage, +25% attack rate and +5% crit chance.', maxRank: 1, cost: 21, effect: { damage: 1, rate: 0.25, crit: 0.05 }, requires: ['power2', 'speed2', 'recovery2', 'ironSkin', 'spoils'], col: 2, row: 3 },
];

// ---- Ascension (Guild Hunters) ----
// A Guild Hunter's first tree costs 39 points: it's complete at Lv 40. Then a gold Ascend node appears
// (10 points, so Lv 50). Training stops at Lv 50 until they ascend. Ascending keeps Lv 50, starts the level
// curve over (1 session to Lv 51, 2 to Lv 52, ...) without making training cheaper, opens a second tree
// worth 50 points and raises the cap to Lv 100, where its capstone becomes affordable.

/** Level cap before ascending, and after. */
export const ASCEND_LEVEL = 50;
export const MAX_LEVEL = 100;

/** The gold node below a completed first tree. Learning it ascends the Hunter. */
export const ASCEND_NODE: SkillNode = {
  id: 'ascend',
  name: 'Ascend',
  icon: '🌟',
  desc: 'Ascend: a new title, a new skill tree, and training up to Lv 100. Keeps Lv 50; the level curve starts over (1 session to Lv 51).',
  maxRank: 1,
  cost: 10,
  effect: {},
  requires: ['capstone'],
  col: 1,
  row: 4,
};

/** Level after `sessions` training sessions since ascending (Lv 50 → 51 takes 1, 51 → 52 takes 2, ...). */
export function levelAfterAscending(sessions: number, from = ASCEND_LEVEL, to = MAX_LEVEL): { level: number; into: number; need: number } {
  let level = from;
  let left = sessions;
  while (level < to && left >= level - from + 1) {
    left -= level - from + 1;
    level++;
  }
  return { level, into: left, need: level - from + 1 };
}

/** Sessions from Lv 1 to `level` on the normal curve, and from ascending at `from` to `to` on the restarted one. */
export const sessionsToLevel = (level: number): number => Array.from({ length: level - 1 }, (_, i) => trainsForLevel(i + 1)).reduce((a, b) => a + b, 0);
export const sessionsAfterAscending = (from: number, to: number): number => ((to - from) * (to - from + 1)) / 2;

/** Sessions from Lv 1 to the pre-ascension cap, and from ascending to the final cap. */
export const SESSIONS_TO_ASCEND = Array.from({ length: ASCEND_LEVEL - 1 }, (_, i) => trainsForLevel(i + 1)).reduce((a, b) => a + b, 0);
export const SESSIONS_AFTER_ASCEND = Array.from({ length: MAX_LEVEL - ASCEND_LEVEL }, (_, i) => i + 1).reduce((a, b) => a + b, 0);

/**
 * The tree a Hunter grows after ascending (50 points: Lv 51–100). Mastery, Fervor and Resolve for everyone; then
 * three deep nodes in what that Hunter does best (20 points between them), Precision and Fortune, and their own
 * capstone: the last 8 points, so it opens at Lv 100.
 */
function ascendedTree(focus: [NodeSpec, NodeSpec, NodeSpec], capstone: NodeSpec): SkillNode[] {
  return gridTree([
    [at('root', { name: 'Awakening', icon: '🌅', desc: '+20% damage and +5% attack rate.', maxRank: 1, cost: 2, effect: { damage: 0.2, rate: 0.05 } })],
    [at('power', atk(5, 'Mastery', '⚔️', 0.1)), at('speed', spd(5, 'Fervor', '🔥')), at('recovery', rec(3, 'Resolve', '🗿'))],
    [at('power2', focus[0]), at('speed2', focus[1]), at('recovery2', focus[2])],
    [at('precision', crt(4, 'Precision', '🎯')), at('fortune', { name: 'Fortune', icon: '🍀', desc: '+10% gold and +5% materials from their kills per rank.', maxRank: 3, effect: { gold: 0.1, drops: 0.05 } })],
    [at('capstone', { cost: 8, ...capstone })],
  ]);
}

/** Each Guild Hunter's ascended tree. */
export const ASCENDED_TREES: Record<HunterId, SkillNode[]> = {
  alchemist: ascendedTree([area(8, 'Vast Splash', '💦', 'Puddles spread', 0.05), dur(6, 'Slow Rot', '☠️'), ban(6, 'Slime Scourge', '🟢', 'Slimes')], { name: "Philosopher's Stone", icon: '💠', desc: '+50% damage and puddles 20% wider.', maxRank: 1, effect: { damage: 0.5, radius: 0.2 } }),
  bard: ascendedTree([spd(8, 'Virtuoso', '🎻', 0.03), area(6, 'Amplify', '🔊', 'Sound waves reach'), ban(6, 'Showstopper', '👤', 'Humanoids')], { name: 'Symphony', icon: '🎼', desc: '+50% damage and +15% attack rate.', maxRank: 1, effect: { damage: 0.5, rate: 0.15 } }),
  druid: ascendedTree([area(8, 'Alpha Pack', '🐺', 'Wolves bite harder:'), cdr(6, 'Howl', '🌕', 'Wolves come'), ban(6, 'Overgrowth Bane', '🌱', 'Plants')], { name: 'Wild Hunt', icon: '🐺', desc: '+50% damage and wolves 30% fiercer.', maxRank: 1, effect: { damage: 0.5, radius: 0.3 } }),
  ranger: ascendedTree([rng(8, 'Hawk Eye', '🦅'), crd(6, 'Barbed Arrows', '🏹'), ban(6, 'Beast Slayer', '🐾', 'Beasts')], { name: 'Hundred Arrows', icon: '🏹', desc: '+50% damage; one more arrow per shot, and arrows pierce 2 more enemies.', maxRank: 1, effect: { damage: 0.5, multishot: 1, pierce: 2 } }),
  glimmer: ascendedTree([area(8, 'Cataclysm', '💥', 'Explosions grow'), cdr(6, 'Arcane Haste', '⏱️', 'Fireballs come'), dur(6, 'Everburn', '🔥')], { name: 'Starfire', icon: '☄️', desc: '+50% damage and explosions 30% wider.', maxRank: 1, effect: { damage: 0.5, radius: 0.3 } }),
  thief: ascendedTree([gld(8, 'Golden Hands', '👛'), drp(6, 'Fine Loot', '🗝️'), crd(6, 'Assassinate', '🔪')], { name: 'Grand Heist', icon: '💎', desc: '+50% damage and +50% gold from his kills.', maxRank: 1, effect: { damage: 0.5, gold: 0.5 } }),
  lance: ascendedTree([atk(8, 'Righteous Fury', '☀️', 0.05), grd(3, 'Bastion', '🧱', 2), area(6, 'Consecration', '✨', 'Their strikes reach wider:')], { name: 'Aegis', icon: '🛡️', desc: '+50% damage and 2 more shield charges.', maxRank: 1, effect: { damage: 0.5, guard: 2 } }),
  puppeteer: ascendedTree([area(8, 'Puppet Army', '🪆', 'Puppets bite harder:'), cdr(6, 'Curtain Call', '🎪', 'Puppets come'), crt(6, 'Stage Presence', '🌟')], { name: 'Theater of Puppets', icon: '🎭', desc: '+50% damage and puppets 30% fiercer.', maxRank: 1, effect: { damage: 0.5, radius: 0.3 } }),
  blacksmith: ascendedTree([atk(8, 'Hammer and Tongs', '🔨', 0.05), crd(6, 'Crushing Blows', '💢'), spd(6, 'Hot Iron', '🔥', 0.03)], { name: 'Masterwork', icon: '⚒️', desc: '+50% damage and +20% attack rate.', maxRank: 1, effect: { damage: 0.5, rate: 0.2 } }),
  wilhelm: ascendedTree([crd(8, 'Executioner', '💀'), rng(6, 'Scope', '🔭'), prc(3, 'Armor Piercing', '🔩', 2)], { name: 'One Shot', icon: '🎯', desc: '+50% damage and +10% crit chance.', maxRank: 1, effect: { damage: 0.5, crit: 0.1 } }),
  celeste: ascendedTree([ban(8, 'Wyrmbane', '🐉', 'Dragons'), rng(6, 'Astral Reach', '🧠'), crd(6, 'Mind Break', '⚡')], { name: 'Omniscience', icon: '🧠', desc: '+50% damage and +10% crit chance.', maxRank: 1, effect: { damage: 0.5, crit: 0.1 } }),
  enchantress: ascendedTree([dur(8, 'Everlasting Hex', '⏳'), cdr(6, 'Swift Glyphs', '🪄', "Their gear's abilities recharge"), crt(6, 'Runic Insight', '✴️')], { name: 'Grand Enchantment', icon: '✨', desc: '+50% damage and +10% crit chance.', maxRank: 1, effect: { damage: 0.5, crit: 0.1 } }),
  scavenger: ascendedTree([area(8, 'Mountain Stance', '🏔️', 'Punches reach further:'), cdr(6, 'Still Mind', '🧘', 'Mountain Fist comes'), atk(6, 'Stone Fists', '👊', 0.05)], { name: 'Mountain Breaker', icon: '🏔️', desc: '+50% damage and punches reach 30% further.', maxRank: 1, effect: { damage: 0.5, radius: 0.3 } }),
  osteomancer: ascendedTree([area(8, 'Bone Forest', '🦴', 'Bone spikes reach wider:'), cdr(6, 'Grave Haste', '⏱️', 'Bone spikes come'), grd(3, 'Ribcage', '🛡️', 2)], { name: 'Ossuary', icon: '💀', desc: '+50% damage and spikes 30% wider.', maxRank: 1, effect: { damage: 0.5, radius: 0.3 } }),
  bloodblade: ascendedTree([area(8, 'Red Tide', '🌊', 'The Crimson Wave runs further:'), dur(6, 'Open Wounds', '🩸'), crd(6, 'Bloodletting', '🔪')], { name: 'Crimson Tide', icon: '🌊', desc: '+50% damage and 2 more blood bolts from each Crimson Wave kill.', maxRank: 1, effect: { damage: 0.5, bolts: 2 } }),
  spaceslime: ascendedTree([area(8, 'Galactic Charm', '🌌', 'His charm reaches further:'), cdr(6, 'Pickup Lines', '💬', 'His charm comes'), gld(6, 'Comet Dust', '☄️')], { name: 'Silver Tongue', icon: '💬', desc: '+50% damage and his charm reaches 30% further.', maxRank: 1, effect: { damage: 0.5, radius: 0.3 } }),
  gambler: ascendedTree([crd(8, 'Double Down', '🎲'), area(6, 'Boxcars', '💥', 'Dice blasts grow'), gld(6, 'House Money', '🪙')], { name: 'High Roller', icon: '🎲', desc: '+50% damage and dice blasts 30% wider.', maxRank: 1, effect: { damage: 0.5, radius: 0.3 } }),
  archivist: ascendedTree([area(8, 'Grand Index', '📜', 'Recalled specials grow'), cdr(6, 'Speed Archive', '📑', 'The tome opens'), dur(6, 'Long Memory', '🕯️')], { name: 'Great Library', icon: '📚', desc: '+50% damage and recalled specials 30% bigger.', maxRank: 1, effect: { damage: 0.5, radius: 0.3 } }),
  artificer: ascendedTree([spd(8, 'Perpetual Motion', '⚙️', 0.03), rng(6, 'Long Barrels', '🔭'), crt(6, 'Calibration', '📐')], { name: 'Grand Design', icon: '⚙️', desc: '+50% damage and +20% attack rate.', maxRank: 1, effect: { damage: 0.5, rate: 0.2 } }),
  frostbreaker: ascendedTree([ban(8, 'Glacier Bane', '🔷', 'Elementals'), dur(6, 'Endless Winter', '🥶'), crd(6, 'Ice Shatter', '💎')], { name: 'Eternal Winter', icon: '❄️', desc: '+50% damage and +1× extra damage to Elementals.', maxRank: 1, effect: { damage: 0.5, bane: 1 } }),
};

/** Each Hunter's skill tree ('main' is yours). Every Guild Hunter's costs 39 points: complete at Lv 40. */
export const SKILL_TREES: Record<'main' | HunterId, SkillNode[]> = {
  main: MAIN_FIRST_TREE,
  // Andrejz: wider, longer-lasting poison puddles, sooner.
  alchemist: gridTree([
    [at('root', area(1, 'Toxic Brew', '🧪', 'Poison puddles spread'))],
    [at('power', atk(3)), at('quickBrew', cdr(4, 'Quick Brew', '⏱️', 'Potions come')), at('recovery', rec(3))],
    [at('slimeBane', ban(4, 'Slime Bane', '🟢', 'Slimes')), at('wideSplash', area(4, 'Wide Splash', '💦', 'Puddles spread')), at('lingering', dur(4, 'Lingering Fumes', '☁️')), at('luckyFinds', drp(3, 'Lucky Finds', '🍀'))],
    [at('speed', spd(4)), at('potency', atk(4, 'Potent Toxins', '☠️', 0.1)), at('thickBrew', dur(2, 'Thick Brew', '🫧'))],
    [at('capstone', { name: 'Grand Alchemy', icon: '⚗️', desc: '+20% damage; puddles 20% wider; poison lasts 20% longer.', maxRank: 1, cost: 3, effect: { damage: 0.2, radius: 0.2, duration: 0.2 } })],
  ]),
  // Galladair: arrows that pierce, and more of them.
  ranger: gridTree([
    [at('root', prc(1, 'Trueshot', '🎯'))],
    [at('power', atk(4)), at('speed', spd(4)), at('longshot', rng(3, 'Longshot', '🔭'))],
    [at('beastBane', ban(4, 'Beast Bane', '🐾', 'Beasts')), at('piercing', prc(2, 'Piercing Arrows', '➶')), at('eagleEye', crt(3, 'Eagle Eye', '🦅')), at('deepQuiver', spd(3, 'Deep Quiver', '🏹'))],
    [at('splitShot', multi('Split Shot', '🔱', 4)), at('broadheads', atk(4, 'Broadheads', '🗡️', 0.1)), at('recovery', rec(3, 'Fleet Foot', '👣'))],
    [at('capstone', { name: 'Volley', icon: '🌧️', desc: 'One more arrow per shot, and arrows pierce 1 more enemy.', maxRank: 1, cost: 4, effect: { multishot: 1, pierce: 1 } })],
  ]),
  // Ba'al: faster playing, wider sound waves.
  bard: gridTree([
    [at('root', area(1, 'Opening Chord', '🎵', 'Sound waves reach'))],
    [at('power', atk(3)), at('speed', spd(5, 'Tempo', '🥁')), at('recovery', rec(3))],
    [at('crescendo', area(4, 'Crescendo', '🔊', 'Sound waves reach')), at('silverTongue', ban(4, 'Silver Tongue', '👤', 'Humanoids')), at('encore', spd(4, 'Encore', '🎤'))],
    [at('rhythm', crt(3, 'Rhythm', '🎼')), at('drumbeat', atk(5, 'Drumbeat', '🪘', 0.1)), at('echo', area(3, 'Echo', '📣', 'Sound waves reach'))],
    [at('capstone', { name: 'Ballad of Heroes', icon: '🎶', desc: '+15% attack rate and sound waves reach 20% further.', maxRank: 1, cost: 4, effect: { rate: 0.15, radius: 0.2 } })],
  ]),
  // Deku: fiercer wolves, called sooner.
  druid: gridTree([
    [at('root', grd(1, 'Thornskin', '🌵'))],
    [at('packBond', area(4, 'Pack Bond', '🐺', 'Wolves bite harder:')), at('power', atk(3)), at('recovery', rec(3))],
    [at('weedkiller', ban(4, 'Weedkiller', '🌱', 'Plants')), at('callPack', cdr(4, 'Call of the Pack', '📯', 'Wolves come')), at('alpha', area(3, 'Alpha', '🐾', 'Wolves bite harder:')), at('naturesGift', drp(3, "Nature's Gift", '🍃'))],
    [at('barkskin', grd(2, 'Barkskin', '🪵')), at('savage', dur(3, 'Savage Bites', '🦷')), at('speed', spd(5))],
    [at('capstone', { name: 'Call of the Wild', icon: '🌳', desc: '+20% damage and wolves 30% fiercer.', maxRank: 1, cost: 4, effect: { damage: 0.2, radius: 0.3 } })],
  ]),
  // Glimmer: bigger explosions, more often.
  glimmer: gridTree([
    [at('root', area(1, 'Kindling', '🔥', 'Explosions grow'))],
    [at('power', atk(3)), at('quickCast', cdr(4, 'Quick Incantation', '⏱️', 'Fireballs come')), at('wildfire', area(4, 'Wildfire', '💥', 'Explosions grow'))],
    [at('inferno', dur(3, 'Inferno', '🌋')), at('arcane', crt(3, 'Arcane Focus', '🔮')), at('blastWave', area(4, 'Blast Wave', '🌀', 'Explosions grow')), at('channel', cdr(4, 'Channeling', '✨', 'Fireballs come'))],
    [at('speed', spd(3)), at('heat', atk(3, 'Searing Heat', '♨️', 0.1)), at('recovery', rec(2))],
    [at('capstone', { name: 'Meteor', icon: '☄️', desc: 'Explosions 30% wider, and fireballs come 15% faster.', maxRank: 1, cost: 5, effect: { radius: 0.3, cooldown: 0.15 } })],
  ]),
  // Alias: gold, loot and dirty tricks.
  thief: gridTree([
    [at('root', gld(1, 'Sticky Fingers', '🤏'))],
    [at('power', atk(3)), at('pickpocket', gld(4, 'Pickpocket', '👛')), at('speed', spd(3))],
    [at('treasureSense', drp(4, 'Treasure Sense', '🗝️')), at('backstab', crt(4, 'Backstab', '🔪')), at('recovery', rec(3, 'Shadowstep', '👣')), at('fence', gld(3, 'Fence', '⚖️'))],
    [at('cheapShot', crd(4, 'Cheap Shot', '💢')), at('looter', drp(3, 'Looter', '🎒')), at('luckyBreak', gld(2, 'Lucky Break', '🍀'))],
    [at('capstone', { name: 'Master Thief', icon: '🎭', desc: '+40% gold and +20% materials from their kills.', maxRank: 1, cost: 5, effect: { gold: 0.4, drops: 0.2 } })],
  ]),
  // Lance: a bigger shield, for everyone.
  lance: gridTree([
    [at('root', { name: 'Zone of Protection', icon: '🛡️', desc: 'His shield: blocks 3 hits before he is stunned, regaining a charge every few seconds.', maxRank: 1, effect: { guard: 3 } })],
    [at('power', atk(5)), at('bulwark', grd(2, 'Bulwark', '🧱')), at('recovery', rec(3))],
    [at('piercingThrust', rng(3, 'Piercing Thrust', '🔱')), at('rally', { name: 'Rallying Oath', icon: '📯', desc: 'Every other Hunter (you too) gets a 1-hit shield.', maxRank: 1, cost: 3, effect: { rally: 1 } }), at('holyLight', atk(5, 'Holy Light', '☀️', 0.1)), at('vigil', spd(4, 'Vigil', '🕯️'))],
    [at('aegis', grd(2, 'Aegis', '🔰')), at('crusader', crt(4, 'Crusader', '⚔️')), at('speed', spd(3))],
    [at('capstone', { name: 'Holy Lance', icon: '⚜️', desc: '1 more shield charge, and every other Hunter gets 1 more shield charge too.', maxRank: 1, cost: 4, effect: { guard: 1, rally: 1 } })],
  ]),
  // Theon: fiercer puppets, sooner.
  puppeteer: gridTree([
    [at('root', area(1, 'Strings Attached', '🧵', 'Puppets bite harder:'))],
    [at('marionette', area(4, 'Marionette Master', '🪆', 'Puppets bite harder:')), at('power', atk(3)), at('recovery', rec(3, 'Cut the Strings', '✂️'))],
    [at('quickStrings', cdr(4, 'Quick Strings', '🪡', 'Puppets come')), at('tangle', dur(3, 'Tangled Threads', '🕸️')), at('puppetShow', area(3, 'Puppet Show', '🎪', 'Puppets bite harder:')), at('speed', spd(4))],
    [at('showstopper', crt(3, 'Showstopper', '🌟')), at('sharpWires', atk(5, 'Sharp Wires', '🪝', 0.1)), at('woodenGuard', grd(2, 'Wooden Guard', '🪵'))],
    [at('capstone', { name: 'Grand Performance', icon: '🎭', desc: 'Puppets 30% fiercer, and they come 10% faster.', maxRank: 1, cost: 4, effect: { radius: 0.3, cooldown: 0.1 } })],
  ]),
  // Kargesh: heavy, telling blows.
  blacksmith: gridTree([
    [at('root', grd(1, 'Forge-Hardened', '🔥'))],
    [at('power', atk(5)), at('heavyBlows', crd(3, 'Heavy Blows', '🔨')), at('recovery', rec(3))],
    [at('speed', spd(4, 'Quench', '💧')), at('whetstone', crt(4, 'Whetstone Eye', '🪨')), at('tempered', grd(2, 'Tempered Steel', '🛡️')), at('anvil', atk(4, 'Anvil Strike', '⚒️', 0.1))],
    [at('foldedSteel', atk(3, 'Folded Steel', '🗡️', 0.1)), at('bellows', spd(3, 'Bellows', '🌬️')), at('longHaft', rng(2, 'Long Haft', '📏'))],
    [at('capstone', { name: 'Master Smith', icon: '⚒️', desc: '+40% damage and critical hits deal +20% more damage.', maxRank: 1, cost: 5, effect: { damage: 0.4, critDamage: 0.2 } })],
  ]),
  // Wilhelm: crits from afar.
  wilhelm: gridTree([
    [at('root', rng(1, 'Steady Aim', '🎯', 15))],
    [at('power', atk(4)), at('deadeye', crt(4, 'Deadeye', '👁️')), at('speed', spd(3, 'Quickdraw', '🔫'))],
    [at('hollowPoint', prc(2, 'Hollow Point', '🔩')), at('longBarrel', rng(3, 'Long Barrel', '🔭')), at('headshot', crd(4, 'Headshot', '💥')), at('recovery', rec(3))],
    [at('buckshot', multi('Buckshot', '💨', 4)), at('steadyHands', crt(3, 'Steady Hands', '🤲')), at('caliber', atk(3, 'Heavy Caliber', '🧨', 0.1))],
    [at('capstone', { name: 'Marksman', icon: '🏅', desc: '+10% crit chance, and critical hits deal +30% more damage.', maxRank: 1, cost: 5, effect: { crit: 0.1, critDamage: 0.3 } })],
  ]),
  // Celeste: reach and dragon-slaying focus.
  celeste: gridTree([
    [at('root', { name: "Mind's Eye", icon: '👁️', desc: '+10% damage and +10 range.', maxRank: 1, effect: { damage: 0.1, range: 10 } })],
    [at('power', atk(4)), at('farReach', rng(3, 'Far Reach', '🧠')), at('recovery', rec(3))],
    [at('dragonBane', ban(4, 'Dragon Bane', '🐉', 'Dragons')), at('insight', crt(4, 'Insight', '💡')), at('psionicWave', area(3, 'Psionic Wave', '🌀', 'Their blasts grow')), at('speed', spd(4))],
    [at('overload', crd(3, 'Overload', '⚡')), at('clarity', atk(4, 'Clarity', '🔮', 0.1)), at('telekinesis', prc(1, 'Telekinesis', '🪄', 2))],
    [at('capstone', { name: 'Transcendence', icon: '👑', desc: 'Shots pierce 1 more enemy, and +0.5× extra damage to Dragons.', maxRank: 1, cost: 4, effect: { pierce: 1, bane: 0.5 } })],
  ]),
  // Sciirj: longer reach, more punches.
  scavenger: gridTree([
    [at('root', area(1, 'Inner Focus', '🧘', 'Punches reach further:'))],
    [at('power', atk(4, 'Iron Knuckles', '👊')), at('speed', spd(4, 'Flurry', '💨')), at('recovery', rec(3))],
    [at('wideStance', area(4, 'Wide Stance', '🌀', 'Punches reach further:')), at('breath', cdr(4, 'Centered Breath', '🌬️', 'Mountain Fist comes')), at('pressure', crt(3, 'Pressure Points', '🎯')), at('combo', multi('Combo', '🥊', 3))],
    [at('thousandFists', atk(5, 'Hundred Blows', '💥', 0.1)), at('ironBody', grd(2, 'Iron Body', '🗿')), at('fleetSteps', rng(2, 'Fleet Steps', '👣'))],
    [at('capstone', { name: 'Thousand Fists', icon: '💥', desc: 'Punches reach 25% further, and Mountain Fist comes 15% faster.', maxRank: 1, cost: 4, effect: { radius: 0.25, cooldown: 0.15 } })],
  ]),
  // Gideon: wider spikes, sooner, behind walls of bone.
  osteomancer: gridTree([
    [at('root', area(1, 'Marrow Sense', '🦴', 'Bone spikes reach wider:'))],
    [at('power', atk(5)), at('ossuary', area(4, 'Ossuary Field', '🌀', 'Bone spikes reach wider:')), at('calcified', grd(2, 'Calcified Skin', '🛡️'))],
    [at('sharpened', atk(4, 'Sharpened Bone', '🗡️', 0.1)), at('restless', cdr(4, 'Restless Dead', '⏱️', 'Bone spikes come')), at('grasping', dur(3, 'Grasping Bones', '🖐️')), at('recovery', rec(3))],
    [at('speed', spd(4)), at('marrow', crt(3, 'Marrow Strike', '💀')), at('boneArmor', grd(2, 'Bone Armor', '🦴'))],
    [at('capstone', { name: 'Boneyard', icon: '💀', desc: 'Bone spikes 25% wider, and they come 10% faster.', maxRank: 1, cost: 4, effect: { radius: 0.25, cooldown: 0.1 } })],
  ]),
  // Themus: longer waves, deeper bleeding.
  bloodblade: gridTree([
    [at('root', area(1, 'First Blood', '🩸', 'The Crimson Wave runs further:'))],
    [at('power', atk(4, 'Keen Edge', '🗡️')), at('speed', spd(4, 'Bloodlust', '💢')), at('recovery', rec(2))],
    [at('surge', area(4, 'Surge', '🌊', 'The Crimson Wave runs further:')), at('hemorrhage', dur(4, 'Hemorrhage', '🩸')), at('tide', cdr(3, 'Rising Tide', '⏱️', 'The Crimson Wave comes')), at('sanguine', crt(3, 'Sanguine Eye', '👁️'))],
    [at('crimsonEdge', atk(5, 'Crimson Edge', '🔪', 0.1)), at('thirst', crd(4, 'Thirst', '🧛')), at('vitae', grd(1, 'Vitae', '❤️'))],
    [at('capstone', { name: 'Blood Rain', icon: '🌧️', desc: '+10% damage; monsters the Crimson Wave kills burst into 3 blood bolts.', maxRank: 1, cost: 4, effect: { damage: 0.1, bolts: 3 } })],
  ]),
  // Marceline: long-lasting hexes and quick spells.
  enchantress: gridTree([
    [at('root', crt(1, 'Glyphwork', '🔯'))],
    [at('power', atk(4)), at('speed', spd(4, 'Quickened Words', '💬')), at('recovery', rec(3))],
    [at('runedBolts', crt(3, 'Runed Bolts', '✴️')), at('lastingHexes', dur(4, 'Lasting Hexes', '⏳')), at('wideWards', area(3, 'Wide Wards', '🌀', 'Their spells grow')), at('spellweave', cdr(4, 'Spellweave', '🪄', "Their gear's abilities recharge"))],
    [at('arcanePower', atk(4, 'Arcane Power', '🔮', 0.1)), at('hex', crd(3, 'Hex', '💢')), at('manaShield', grd(1, 'Mana Shield', '🛡️'))],
    [at('capstone', { name: 'Spellbinder', icon: '📜', desc: 'Status effects last 30% longer, and abilities recharge 15% faster.', maxRank: 1, cost: 5, effect: { duration: 0.3, cooldown: 0.15 } })],
  ]),
  // Norm: a wider, quicker charm.
  spaceslime: gridTree([
    [at('root', area(1, 'Cosmic Goo', '🌌', 'His charm reaches further:'))],
    [at('power', atk(3)), at('speed', spd(4, 'Quick Wit', '⚡')), at('recovery', rec(3, 'Unflappable', '🫧'))],
    [at('smoothTalker', cdr(4, 'Smooth Talker', '💬', 'His charm comes')), at('magnetism', area(4, 'Magnetism', '🧲', 'His charm reaches further:')), at('goo', grd(2, 'Gooey Body', '🟣')), at('stardust', gld(3, 'Stardust', '✨'))],
    [at('gravity', atk(5, 'Gravity Well', '🌑', 0.1)), at('orbit', crt(3, 'Orbit', '🪐')), at('spaceJunk', drp(3, 'Space Junk', '🛰️'))],
    [at('capstone', { name: 'Magnetic Personality', icon: '🧲', desc: 'His charm reaches 30% further and comes 10% faster.', maxRank: 1, cost: 4, effect: { radius: 0.3, cooldown: 0.1 } })],
  ]),
  // Ted: big crits, bigger blasts.
  gambler: gridTree([
    [at('root', crt(1, 'Lucky Coin', '🪙'))],
    [at('power', atk(3)), at('speed', spd(3, 'Quick Hands', '🃏')), at('recovery', rec(3, 'Poker Face', '🎭'))],
    [at('raiseStakes', crd(4, 'Raise the Stakes', '💰')), at('loadedDice', crt(4, 'Loaded Dice', '🎲')), at('bigBlast', area(4, 'Big Blast', '💥', 'Dice blasts grow')), at('highStakes', gld(3, 'High Stakes', '🪙'))],
    [at('hotStreak', cdr(4, 'Hot Streak', '🔥', 'Dice come')), at('jackpot', atk(3, 'Jackpot', '🎰', 0.1)), at('winnings', drp(2, 'Winnings', '💎'))],
    [at('capstone', { name: 'All In', icon: '🎰', desc: '+10% crit chance and dice blasts 25% wider.', maxRank: 1, cost: 5, effect: { crit: 0.1, radius: 0.25 } })],
  ]),
  // Thomas: bigger recalled specials, more often.
  archivist: gridTree([
    [at('root', area(1, 'Marginalia', '📖', 'Recalled specials grow'))],
    [at('power', atk(3)), at('speedReading', cdr(4, 'Speed Reading', '📑', 'The tome opens')), at('recovery', rec(3, 'Quiet Study', '🕯️'))],
    [at('annotated', area(4, 'Annotated Volumes', '📜', 'Recalled specials grow')), at('footnotes', dur(3, 'Footnotes', '🖋️')), at('crossRef', crt(3, 'Cross-Reference', '🔖')), at('speed', spd(4))],
    [at('indexing', cdr(3, 'Indexing', '🗂️', 'The tome opens')), at('tomes', atk(4, 'Weighty Tomes', '📚', 0.1)), at('bookmark', rng(2, 'Bookmark', '🔖'))],
    [at('capstone', { name: 'Encyclopedia', icon: '📚', desc: 'Recalled specials 30% bigger, and the tome opens 10% faster.', maxRank: 1, cost: 5, effect: { radius: 0.3, cooldown: 0.1 } })],
  ]),
  // Reginald: gadgets that fire faster and further.
  artificer: gridTree([
    [at('root', spd(1, 'Spare Parts', '⚙️'))],
    [at('power', atk(4)), at('speed', spd(4, 'Oiled Gears', '🔩')), at('sturdyFrame', grd(2, 'Sturdy Frame', '🛠️'))],
    [at('fineTuning', crt(3, 'Fine Tuning', '🔧')), at('clockwork', cdr(4, 'Clockwork', '⏱️', "Their gear's abilities recharge")), at('servo', rng(4, 'Servo Arm', '🦾')), at('recovery', rec(3))],
    [at('overclock', spd(5, 'Overclock', '🔋')), at('precision', atk(5, 'Precision Parts', '📐', 0.1))],
    [at('capstone', { name: 'Grand Design', icon: '🧰', desc: 'Ranged and Magic attacks fire an extra projectile; melee attacks follow up with another strike.', maxRank: 1, cost: 4, effect: { multishot: 1 } })],
  ]),
  // Okrin: long chills and shattering blows on Elementals.
  frostbreaker: gridTree([
    [at('root', atk(1, 'Permafrost', '❄️', 0.1))],
    [at('power', atk(4, 'Heavy Hammer', '🔨')), at('recovery', rec(3, 'Glacial Hide', '🧊')), at('speed', spd(3))],
    [at('elementalBane', ban(4, 'Elemental Bane', '🔷', 'Elementals')), at('deepFreeze', dur(4, 'Deep Freeze', '🥶')), at('shatter', crd(3, 'Shatter', '💎')), at('glacier', grd(2, 'Glacier', '🏔️'))],
    [at('avalanche', area(3, 'Avalanche', '🌨️', 'Swings and blasts grow')), at('frostbite', crt(3, 'Frostbite', '🌬️')), at('might', atk(5, 'Frost Might', '💪', 0.1))],
    [at('capstone', { name: 'Eternal Winter', icon: '❄️', desc: '+0.5× extra damage to Elementals, and status effects last 25% longer.', maxRank: 1, cost: 4, effect: { bane: 0.5, duration: 0.25 } })],
  ]),
};

export const skillNode = (who: 'main' | HunterId, id: string): SkillNode | undefined => SKILL_TREES[who].find((n) => n.id === id);

/** Total cost of buying `count` levels starting at `level` (geometric series). */
export function bulkCost(baseCost: number, growth: number, level: number, count: number): number {
  if (count <= 0) return 0;
  return (baseCost * growth ** level * (growth ** count - 1)) / (growth - 1);
}

/** How many levels are affordable with `gold`, starting at `level`. */
export function maxAffordable(baseCost: number, growth: number, level: number, gold: number): number {
  const first = baseCost * growth ** level;
  if (gold < first) return 0;
  const n = Math.floor(Math.log((gold * (growth - 1)) / first + 1) / Math.log(growth));
  // Guard against floating point drift at the boundary.
  return bulkCost(baseCost, growth, level, n) > gold ? Math.max(0, n - 1) : n;
}

// ---- Materials: each enemy type drops its own ----
export type MaterialId =
  | 'spore'
  | 'dust'
  | 'wrap'
  | 'grave'
  | 'string'
  | 'gloom'
  | 'umbra'
  | 'ore'
  | 'awokenRock'
  | 'obsidian'
  | 'ironOre'
  | 'silverOre'
  | 'goldOre'
  | 'quartz'
  | 'amethyst'
  | 'topaz'
  | 'emerald'
  | 'diamond'
  | 'cobaltOre'
  | 'venomite'
  | 'frostIron'
  | 'coldsteel'
  | 'aquamarine'
  | 'sapphire'
  | 'skysteel'
  | 'adamantite'
  | 'opal'
  | 'stormstone'
  | 'starIron'
  | 'orichalcum'
  | 'voidsteel'
  | 'voidPrism'
  | 'scale'
  | 'plume'
  | 'skystone'
  | 'feather'
  | 'thunder'
  | 'meteor'
  | 'stardust'
  | 'goo'
  | 'twig'
  | 'pelt'
  | 'beastBone'
  | 'scrap'
  | 'bearClaw'
  | 'enchantedBone'
  | 'unicornHorn'
  | 'thorn'
  | 'sap'
  | 'vampEssence'
  | 'sacredText'
  | 'robePiece'
  | 'nightmareWisp'
  | 'undeadFeather'
  | 'enchantedScrap'
  | 'darkClaw'
  | 'shadowWisp'
  | 'umbralEye'
  | 'umbralSlime'
  | 'demonTooth'
  | 'demonBone'
  | 'demonWing'
  | 'royalSlime'
  | 'regalEssence'
  | 'calciumCrystal'
  | 'eldritchText'
  | 'everwatchingEye'
  | 'forsakenSoul'
  | 'bone'
  | 'flesh'
  | 'wing'
  | 'ember'
  | 'magma'
  | 'chitin'
  | 'fur'
  | 'frost'
  | 'ecto'
  | 'shade'
  | 'void'
  | 'soul';

/**
 * The golems' ores and gems (and their stones), the rarer materials: on the battlefield's pick-up pop-ups they
 * push out the common drops' rows.
 */
export const RARE_MATERIALS: ReadonlySet<MaterialId> = new Set<MaterialId>([
  'awokenRock', 'obsidian', 'ironOre', 'silverOre', 'goldOre', 'quartz', 'amethyst', 'topaz', 'emerald', 'diamond', 'cobaltOre', 'venomite',
  'frostIron', 'coldsteel', 'aquamarine', 'sapphire', 'skysteel', 'orichalcum', 'opal', 'stormstone', 'starIron', 'adamantite', 'voidsteel',
  'voidPrism', 'ore',
]);

/** A golem: a construct dropping ores and gems. They spawn rarely, and an area's Idol doesn't bring more of them. */
export const isGolem = (e: { archetype: string; material: string }): boolean => e.archetype === 'construct' && RARE_MATERIALS.has(e.material as MaterialId);

export interface MaterialDef {
  id: MaterialId;
  name: string;
  color: string;
  /** A line of flavour for its details card. */
  desc: string;
}

export const MATERIALS: MaterialDef[] = [
  // Wandering Woods
  { id: 'goo', name: 'Green Slime', color: '#7be07b', desc: 'A wobbly glob of green slime. Sticky, harmless, and oddly useful for binding things together.' },
  { id: 'twig', name: 'Twigs', color: '#a07a4a', desc: "A bundle of twigs from a Twiggling. They still twitch now and then." },
  { id: 'pelt', name: 'Wolf Pelt', color: '#c09060', desc: 'A coarse hide from the wolves of the forest. Warm, tough, and a favourite of leatherworkers.' },
  { id: 'beastBone', name: 'Beast Bone', color: '#e8dcc0', desc: 'A heavy bone from a forest beast. Good for handles, hilts and anything that needs to take a beating.' },
  { id: 'scrap', name: 'Scrap', color: '#9a9a8a', desc: 'Bent nails, broken buckles and stolen spoons: everything a goblin thought was worth taking.' },
  { id: 'bearClaw', name: 'Bear Claw', color: '#5a4030', desc: 'A claw as long as your hand. Sharp enough to carve wood, and other things.' },
  // Fey Grove
  { id: 'spore', name: 'Mushroom Cap', color: '#d0584a', desc: 'The spotted cap of a Toadstool. It sneezes spores if you squeeze it.' },
  { id: 'dust', name: 'Pixie Dust', color: '#ffb8f0', desc: 'Sparkling dust shaken off a pixie. Things sprinkled with it feel a little lighter.' },
  { id: 'enchantedBone', name: 'Enchanted Bone', color: '#f0e8ff', desc: 'A bone that hums with old magic. It is warm to the touch.' },
  { id: 'unicornHorn', name: 'Unicorn Horn', color: '#ffe0f8', desc: 'A spiralled horn that glows faintly. Wands made from it never miss.' },
  { id: 'thorn', name: 'Enchanted Thorn', color: '#6ab04a', desc: 'A thorn from a Walking Man Trap. It keeps trying to bite.' },
  { id: 'sap', name: 'Sentient Sap', color: '#d8a040', desc: 'Golden sap from a Treant. It slowly crawls back toward the nearest tree.' },
  // Restless Graveyard
  { id: 'bone', name: 'Undead Bone', color: '#efe6cf', desc: 'Old, dry bone from the restless dead. Sturdy enough to carve into blades and charms.' },
  { id: 'flesh', name: 'Rotting Flesh', color: '#9bb56e', desc: "A lump of rotting flesh. It smells exactly as bad as you'd expect." },
  { id: 'vampEssence', name: 'Vampire Essence', color: '#c0203a', desc: 'A drop of a vampire bat\'s blood magic, thick and dark red. It never dries.' },
  { id: 'wing', name: 'Bat Wing', color: '#8a78b0', desc: 'A leathery bat wing, thin as paper and surprisingly strong.' },
  { id: 'sacredText', name: 'Sacred Text', color: '#e0c890', desc: 'A torn page of a cultist\'s scripture. The words shift when you are not looking.' },
  { id: 'robePiece', name: 'Robe Piece', color: '#7a2a3a', desc: 'A strip of a cultist\'s robe, dyed deep red and stitched with symbols.' },
  { id: 'nightmareWisp', name: 'Nightmare Wisp', color: '#5a6a8a', desc: 'A wisp of a wraith\'s nightmare. Holding it, you hear someone else\'s bad dream.' },
  // Forbidden Crypt
  { id: 'undeadFeather', name: 'Undead Feather', color: '#4a4a5a', desc: 'A black feather from a carrion crow. It is cold, and it never quite stops twitching.' },
  { id: 'enchantedScrap', name: 'Enchanted Scrap', color: '#a8b0d0', desc: 'A plate of possessed armor. Whatever moved it still hums inside the metal.' },
  // Shadowy Depths
  { id: 'darkClaw', name: 'Dark Claw', color: '#3a3048', desc: 'A claw from a Gloomcrawler, dark as the tunnels it came from.' },
  { id: 'shadowWisp', name: 'Shadow Wisp', color: '#6a5a8a', desc: 'A flicker of living shadow left by a Shadow Haunt. It hides from light.' },
  { id: 'umbralEye', name: 'Umbral Eyeball', color: '#b8a0d8', desc: 'An eye from a Gazing Eye. It keeps watching you from the bag.' },
  { id: 'umbralSlime', name: 'Umbral Slime', color: '#3a2e4a', desc: 'Dark slime from an Umbral Ooze. It soaks up any light that touches it.' },
  // Ember Mines
  { id: 'demonTooth', name: 'Demon Tooth', color: '#f0e0c0', desc: 'A fang from a hellhound, still hot enough to scorch leather.' },
  { id: 'demonBone', name: 'Demon Bone', color: '#7a2a1a', desc: 'A blackened bone from a demon of the caves. It smells of brimstone.' },
  { id: 'demonWing', name: 'Demon Wing', color: '#c04a2a', desc: 'A leathery imp wing, scorched at the edges.' },
  // Guardians' own materials (10 per Guardian slain)
  { id: 'royalSlime', name: 'Royal Slime', color: '#4ad04a', desc: 'A glob of the King of Slimes, golden-green and faintly regal. It wobbles with dignity.' },
  { id: 'regalEssence', name: 'Regal Essence', color: '#ff7ad8', desc: 'A shimmering drop of the Pixie Queen\'s magic. Everything near it sparkles.' },
  { id: 'calciumCrystal', name: 'Calcium Crystal', color: '#f8f0e0', desc: 'A crystal grown in the Skeleton King\'s bones over centuries. Hard as diamond.' },
  { id: 'eldritchText', name: 'Eldritch Text', color: '#8a5ac0', desc: 'A page from the Awoken Lich\'s own book. The ink moves to follow your eyes.' },
  { id: 'everwatchingEye', name: 'Everwatching Eye', color: '#c0a0e0', desc: 'An eye of the Beholden Watcher. It still sees, and it still watches you.' },
  { id: 'forsakenSoul', name: 'Forsaken Soul', color: '#ff5030', desc: 'A soul the Demon Lord held captive. It burns cold, and it is grateful to be free.' },
  { id: 'ember', name: 'Ember', color: '#ff8a3d', desc: 'A coal that never quite goes out. It glows brighter when monsters are near.' },
  { id: 'magma', name: 'Magma Slime', color: '#ff4d1a', desc: "Molten gel scooped from the mines and caverns. Keep it in something that won't melt." },
  { id: 'chitin', name: 'Chitin', color: '#3fb0a0', desc: 'A hard shell plate from the creatures of the mines and caverns. Light, tough and a little shiny.' },
  { id: 'fur', name: 'Frost Fur', color: '#dfefff', desc: 'Thick white fur from the frozen peaks. It keeps out even the bitterest cold.' },
  { id: 'frost', name: 'Frost Shard', color: '#8fdcff', desc: 'A shard of ice that never melts. Cold enough to numb your fingers through gloves.' },
  { id: 'ecto', name: 'Ectoplasm', color: '#c49bff', desc: 'Faintly glowing ectoplasm left behind by spirits. It hums when you hold it.' },
  { id: 'wrap', name: 'Possessed Cloth', color: '#e8d8b0', desc: 'Ancient linen from a mummy, still tight around whatever it held, and still moving.' },
  { id: 'string', name: 'Possessed String', color: '#c89a6a', desc: 'A taut string from a Possessed Puppet. It twitches when nobody is holding it.' },
  { id: 'grave', name: 'Forbidden Text', color: '#5a3a7a', desc: 'A page torn from a necromancer\'s grimoire. Reading it out loud is a bad idea.' },
  { id: 'gloom', name: 'Gloom Silk', color: '#5a4a7a', desc: 'Thread spun in the Shadowy Depths. It drinks the light around it.' },
  { id: 'umbra', name: 'Umbral Pearl', color: '#8a7ea8', desc: 'A dark pearl from the Depths, cold and heavier than it looks.' },
  { id: 'awokenRock', name: 'Awoken Rock', color: '#9a9488', desc: "A chunk of a Stone Golem that hasn't quite stopped moving. It hums when you hold it." },
  { id: 'obsidian', name: 'Obsidian', color: '#3a2e44', desc: 'Black volcanic glass from deep inside a golem. Sharp enough to cut a shadow.' },
  { id: 'ironOre', name: 'Iron Ore', color: '#8a7a70', desc: 'Rust-red ore, heavy in the hand. The backbone of any good smithy.' },
  { id: 'silverOre', name: 'Silver Ore', color: '#d0d8e0', desc: 'Bright ore that shines even in the dark. Monsters of the night hate it.' },
  { id: 'goldOre', name: 'Gold Ore', color: '#f0c040', desc: 'A rare vein of gold, torn from an Ore Golem. Too precious to spend.' },
  { id: 'quartz', name: 'Quartz', color: '#eef0f4', desc: 'Clear crystal from a geode. Common, but it rings like a bell.' },
  { id: 'amethyst', name: 'Amethyst', color: '#a070d8', desc: 'A violet crystal said to keep a clear head.' },
  { id: 'topaz', name: 'Topaz', color: '#f0a040', desc: 'A warm golden stone that holds the heat of the mines.' },
  { id: 'emerald', name: 'Emerald', color: '#30c070', desc: 'A deep green gem, rarely found whole.' },
  { id: 'diamond', name: 'Diamond', color: '#c8f4ff', desc: "The rarest stone in a Geode Golem's heart. Nothing scratches it." },
  { id: 'cobaltOre', name: 'Cobalt Ore', color: '#3a6ad0', desc: "Deep blue ore from the Venom Caverns' golems, tougher than steel." },
  { id: 'venomite', name: 'Venomite', color: '#7adc3a', desc: "Ore laced with the Caverns' venom. It hums faintly and never quite stops dripping." },
  { id: 'frostIron', name: 'Frost Iron', color: '#a8d0f0', desc: "Iron that froze in the earth and stayed frozen. Cold to the touch, forever." },
  { id: 'coldsteel', name: 'Coldsteel', color: '#dff4ff', desc: "The heart of a Glacial Golem: metal so cold it burns." },
  { id: 'aquamarine', name: 'Aquamarine', color: '#6fe0e0', desc: "A sea-green gem from the Frost Peaks' Crystal Golems." },
  { id: 'sapphire', name: 'Sapphire', color: '#3a5ae0', desc: "A deep blue gem, rarely found whole in a Crystal Golem." },
  { id: 'skysteel', name: 'Skysteel', color: '#c8d4f0', desc: "Metal from the Ascendant Steps, light as a feather and twice as strong as steel." },
  { id: 'orichalcum', name: 'Orichalcum', color: '#ffb040', desc: "A legendary red-gold metal from the heart of a Sky Golem." },
  { id: 'opal', name: 'Opal', color: '#f4e8ff', desc: "A milky gem flickering with every colour, from the Cloud Fortress' Storm Golems." },
  { id: 'stormstone', name: 'Stormstone', color: '#8fb4ff', desc: "A gem with a thunderstorm trapped inside. It crackles." },
  { id: 'starIron', name: 'Star Iron', color: '#d0a070', desc: "Iron that fell from the sky in the Meteor Field." },
  { id: 'adamantite', name: 'Adamantite', color: '#8a7ac8', desc: "The hardest metal there is, found deep in a Meteor Golem." },
  { id: 'voidsteel', name: 'Voidsteel', color: '#5a3a8a', desc: "Metal from beyond the Rift. It drinks the light." },
  { id: 'voidPrism', name: 'Void Prism', color: '#ff5fd7', desc: "A gem from beyond the Rift that bends light the wrong way." },
  { id: 'ore', name: 'Mithril Ore', color: '#b8c8d8', desc: 'A silvery ore from the Venom Caverns, light and harder than steel.' },
  { id: 'scale', name: 'Drake Scale', color: '#e0603a', desc: 'A scale shed by a fire drake. Still warm, and it never burns.' },
  { id: 'plume', name: 'Griffin Plume', color: '#f0d890', desc: 'A golden feather from the Ascendant Steps. It catches every breeze.' },
  { id: 'skystone', name: 'Sky Stone', color: '#a8b8e0', desc: 'A pale stone from the stairs to the sky. It hangs in the air a moment when dropped.' },
  { id: 'feather', name: 'Storm Feather', color: '#e8f4ff', desc: 'A feather that crackles with static. It never quite settles when you put it down.' },
  { id: 'thunder', name: 'Thunder Crystal', color: '#ffe36e', desc: 'Lightning caught in glass, taken from the storms around the Cloud Fortress.' },
  { id: 'meteor', name: 'Meteor Iron', color: '#c07048', desc: 'Dense, pitted metal from a fallen star. Still warm, and heavier than it looks.' },
  { id: 'stardust', name: 'Stardust', color: '#b8a8ff', desc: 'Sparkling dust from the Meteor Field. It glows faintly in the dark, like a sky in a jar.' },
  { id: 'shade', name: 'Shadow Gel', color: '#7a5cc0', desc: 'Inky gel from the Rift that swallows the light around it.' },
  { id: 'void', name: 'Void Dust', color: '#ff5fd7', desc: 'Glittering dust from beyond the Rift. It drifts upward when you let it go.' },
  { id: 'soul', name: 'Soul Gem', color: '#6ff0e0', desc: 'A crystal holding a trapped soul. It whispers at night.' },
];

export const materialDef = (id: MaterialId): MaterialDef => MATERIALS.find((m) => m.id === id)!;

// ---- Archetypes: enemy families that Hunters specialize against ----
export type Archetype = 'slime' | 'beast' | 'undead' | 'demon' | 'elemental' | 'humanoid' | 'plant' | 'dragon' | 'construct';

export const ARCHETYPES: Record<Archetype, { name: string; icon: string }> = {
  slime: { name: 'Slime', icon: '🟢' },
  beast: { name: 'Beast', icon: '🐾' },
  undead: { name: 'Undead', icon: '💀' },
  demon: { name: 'Demon', icon: '😈' },
  elemental: { name: 'Elemental', icon: '🔷' },
  humanoid: { name: 'Humanoid', icon: '👤' },
  plant: { name: 'Plant', icon: '🌿' },
  dragon: { name: 'Dragon', icon: '🐉' },
  construct: { name: 'Construct', icon: '🪆' },
};

// ---- Areas: permanent unlocks, each with its own enemies and materials ----
export type AreaId = 'forest' | 'glade' | 'graveyard' | 'crypt' | 'depths' | 'caves' | 'mines' | 'peaks' | 'cliffs' | 'fortress' | 'meteors' | 'rift';

export interface AreaDef {
  id: AreaId;
  name: string;
  /** Base stats that every enemy in the area multiplies. */
  hp: number;
  gold: number;
  speed: number;
  /** Kills in this area before its Guardian can be challenged. */
  mastery: number;
  /** HP of this area's Guardian: the real gate to the next area. */
  guardian: number;
  icon: string;
  /** Game Boy Advance-style UI palette, darkest to lightest: menus take on these colours in this area. */
  palette: [string, string, string, string];
  /** Battlefield ground colour and its speckles. */
  ground: [string, string];
  blurb: string;
}

// Monster and Guardian HP sit lower than they used to (÷4.5 in the Fey Grove, ÷8 in the Graveyard, ÷13 from the
// Crypt, ÷18 from the Frost Peaks, ÷20 in the Void Rift, ÷30 for the Time Eater; in the Woods only its Guardian,
// ÷2): about the damage per second the removed Upgrades that boosted every Hunter had added by each area.
export const AREAS: AreaDef[] = [
  { id: 'forest', name: 'Wandering Woods', icon: '🌲', hp: 1, gold: 1, speed: 36, mastery: 10_000, guardian: 750, palette: ['#183c18', '#2f7d32', '#7ec850', '#e2f5c4'], ground: ['#6cb848', '#58a03c'], blurb: 'Where every hunt begins.' },
  { id: 'glade', name: 'Fey Grove', icon: '🍄', hp: 33, gold: 80, speed: 38, mastery: 150_000, guardian: 2_700, palette: ['#221a30', '#5a4a8a', '#a8d8b0', '#f4f0ff'], ground: ['#7cc47c', '#8ed28a'], blurb: 'Mushroom rings and things that bite.' },
  { id: 'graveyard', name: 'Restless Graveyard', icon: '🪦', hp: 150, gold: 15_000, speed: 40, mastery: 700_000, guardian: 15_000, palette: ['#1e1a2a', '#4a4460', '#9a94b0', '#e8e4f0'], ground: ['#5b5670', '#4c4762'], blurb: 'The dead do not rest here.' },
  { id: 'crypt', name: 'Forbidden Crypt', icon: '⚰️', hp: 380, gold: 2_000_000, speed: 42, mastery: 520_000, guardian: 41_000, palette: ['#1a1614', '#4a403a', '#9a8e80', '#ece4d8'], ground: ['#5a524a', '#4e4640'], blurb: 'Deeper than the graves, and older.' },
  { id: 'depths', name: 'Shadowy Depths', icon: '🕳️', hp: 770, gold: 10_000_000_000, speed: 43, mastery: 1_000_000, guardian: 55_000, palette: ['#120e1c', '#3a3050', '#8a7ea8', '#e6e0f4'], ground: ['#2e2838', '#26212f'], blurb: 'Below the crypt, the dark has teeth.' },
  { id: 'caves', name: 'Ember Mines', icon: '🌋', hp: 1_500, gold: 3_000_000_000_000, speed: 45, mastery: 1_400_000, guardian: 220_000, palette: ['#2a0e08', '#8a2c10', '#e07030', '#fde4c0'], ground: ['#6a2c1a', '#823722'], blurb: 'Hot, bright and full of teeth.' },
  { id: 'mines', name: 'Venom Caverns', icon: '⛏️', hp: 3_100, gold: 100_000_000_000_000, speed: 47, mastery: 1_250_000, guardian: 2_400_000, palette: ['#1e140a', '#6a4a22', '#c09050', '#f4e4c8'], ground: ['#5a4228', '#4e3820'], blurb: 'Dug too deep, woke too much.' },
  { id: 'peaks', name: 'Frost Peaks', icon: '🏔️', hp: 5_600, gold: 3e15, speed: 50, mastery: 2_650_000, guardian: 1_800_000, palette: ['#0c2038', '#2a60a0', '#78b8e8', '#e4f4ff'], ground: ['#bcd8f0', '#a4c6e6'], blurb: 'Cold winds carry cold things.' },
  { id: 'cliffs', name: 'Ascendant Steps', icon: '🪜', hp: 14_000, gold: 5e17, speed: 53, mastery: 680_000, guardian: 3_600_000, palette: ['#141c30', '#4a5a86', '#a8b8e0', '#f2f4ff'], ground: ['#9aa6bc', '#8a96ac'], blurb: 'Stone stairs above the peaks, climbing into the sky.' },
  { id: 'fortress', name: 'Cloud Fortress', icon: '🏰', hp: 22_000, gold: 1e19, speed: 54, mastery: 1_250_000, guardian: 2_700_000, palette: ['#1a2440', '#4a70b0', '#a8d0f8', '#fdfcf4'], ground: ['#e8f0fa', '#d4e2f4'], blurb: 'A citadel on the clouds, held by storm and steel.' },
  { id: 'meteors', name: 'Meteor Field', icon: '☄️', hp: 36_000, gold: 2e20, speed: 55, mastery: 1_150_000, guardian: 6_700_000, palette: ['#0a0a1e', '#3a2a6a', '#e08a4a', '#fce8d0'], ground: ['#1c1830', '#2a2440'], blurb: 'Past the sky, where falling stars still burn.' },
  { id: 'rift', name: 'Void Rift', icon: '🌀', hp: 75_000, gold: 5e21, speed: 56, mastery: 4_800_000, guardian: 27_000_000, palette: ['#1a0830', '#5a2098', '#b070e0', '#f2e4ff'], ground: ['#2a1440', '#3a1d58'], blurb: 'The end of the known world.' },
];

export const areaDef = (id: AreaId): AreaDef => AREAS.find((a) => a.id === id)!;
export const areaIndex = (id: AreaId): number => AREAS.findIndex((a) => a.id === id);
export const nextAreaOf = (id: AreaId): AreaDef | undefined => AREAS[areaIndex(id) + 1];

// ---- Enemy roster ----
export type EnemyId =
  | 'greenSlime'
  | 'wolf'
  | 'twiggling'
  | 'skeleton'
  | 'zombie'
  | 'bat'
  | 'imp'
  | 'magmaSlime'
  | 'beetle'
  | 'iceWolf'
  | 'golem'
  | 'wraith'
  | 'shadowSlime'
  | 'horror'
  | 'lich'
  | 'goblin'
  | 'toadstool'
  | 'brownBear'
  | 'unicorn'
  | 'pixie'
  | 'manTrap'
  | 'treant'
  | 'stoneGolem'
  | 'cultist'
  | 'graveWraith'
  | 'mummy'
  | 'crow'
  | 'boneKnight'
  | 'possessedArmor'
  | 'necromancer'
  | 'puppet'
  | 'kobold'
  | 'salamander'
  | 'hellhound'
  | 'oreGolem'
  | 'geodeGolem'
  | 'venomGolem'
  | 'glacialGolem'
  | 'crystalGolem'
  | 'skyGolem'
  | 'stormGolem'
  | 'meteorGolem'
  | 'voidGolem'
  | 'lavaGolem'
  | 'fireDrake'
  | 'caveTroll'
  | 'basilisk'
  | 'yeti'
  | 'harpy'
  | 'frostSprite'
  | 'snowOwl'
  | 'frostGiant'
  | 'griffin'
  | 'iceWyvern'
  | 'shade'
  | 'watcher'
  | 'darkKnight'
  | 'succubus'
  | 'chimera'
  | 'voidWyrm'
  | 'behemoth'
  | 'timeEater'
  | 'kingSlime'
  | 'pixieQueen'
  | 'skeletonKing'
  | 'awokenLich'
  | 'beholdenWatcher'
  | 'demonLord'
  | 'gloomcrawler'
  | 'duskmoth'
  | 'shadowWisp'
  | 'umbralOoze'
  | 'gazingEye'
  | 'deepLurker'
  | 'cloudling'
  | 'thunderbird'
  | 'skyKnight'
  | 'valkyrie'
  | 'stormTitan'
  | 'meteorite'
  | 'cometWisp'
  | 'rockMite'
  | 'astralSentinel'
  | 'starEater';
export type EnemyShape = 'circle' | 'square' | 'triangle' | 'diamond' | 'ghost' | 'hexagon';

/** How big a monster is drawn, as a size class (set per monster; the Skill Trees editor shows it on its evolution tree). */
export type MonsterSize = 'tiny' | 'small' | 'medium' | 'large' | 'huge' | 'colossal';
export const SIZE_SCALE: Record<MonsterSize, number> = { tiny: 0.7, small: 0.85, medium: 1, large: 1.25, huge: 1.6, colossal: 2 };

export interface EnemyDef {
  id: EnemyId;
  name: string;
  area: AreaId;
  /** Only ever appears as its area's Guardian (never in the horde or the Bestiary), like the Time Eater. */
  guardianOnly?: boolean;
  /** As a Guardian, the fight is won once its HP falls to this fraction of its maximum (the Time Eater: half). */
  winAt?: number;
  archetype: Archetype;
  /** Multipliers on the area's base HP / walk speed / gold. */
  hp: number;
  speed: number;
  gold: number;
  /** Enemies per second once unlocked (before Swarm and Lure). */
  spawn: number;
  /** Pack size range [min, max]. */
  pack: [number, number];
  radius: number;
  material: MaterialId;
  /** A second material it can drop, at EXTRA_DROP_SHARE of its drop chance (a Forest Wolf's Beast Bone). */
  extra?: MaterialId;
  /**
   * More materials it can drop, each at `share` of its drop chance, rarer down the list (a Stone Golem's
   * Obsidian and Iron Ore). Each rolls on its own.
   */
  drops?: Array<{ material: MaterialId; share: number }>;
  /** Gold to add it to its area's horde, as a multiple of the area's base gold (0 = comes with the area). */
  unlock: number;
  /** Placeholder look until real art is added (see src/assets/sprites/README.md). */
  color: string;
  shape: EnemyShape;
  /** Size class: scales its art on the battlefield (not its hit size, which is `radius`). Medium if unset. */
  size?: MonsterSize;
  blurb: string;
  /** Damage types that hit it harder (×WEAK_MULT) or softer (×RESIST_MULT). */
  weak: DamageType[];
  resist: DamageType[];
  /**
   * A ranged attacker: it stops `range` from the nearest Hunter and shoots a projectile at them every `cooldown`
   * seconds, flying at `speed` (it never reaches them, so never runs off with its loot). Otherwise it's melee.
   */
  ranged?: { range: number; cooldown: number; speed: number };
}

/** Damage multiplier for a type the enemy is vulnerable to. */
export const WEAK_MULT = 1.5;
/** Damage multiplier for a type the enemy resists. */
export const RESIST_MULT = 0.5;

/** How a damage type fares against an enemy: 'weak' (it's vulnerable), 'resist', or null. */
export function affinity(t: DamageType, enemy: EnemyId): 'weak' | 'resist' | null {
  const e = enemyDef(enemy);
  return e.weak.includes(t) ? 'weak' : e.resist.includes(t) ? 'resist' : null;
}

/** Damage multiplier of a type against an enemy. */
export function typeMult(t: DamageType, enemy: EnemyId): number {
  const a = affinity(t, enemy);
  return a === 'weak' ? WEAK_MULT : a === 'resist' ? RESIST_MULT : 1;
}

export const ENEMIES: EnemyDef[] = [
  // Wandering Woods
  { id: 'greenSlime', name: 'Green Slime', area: 'forest', archetype: 'slime', hp: 1, speed: 1, gold: 1, spawn: 0.8, pack: [2, 3], radius: 10, material: 'goo', unlock: 0, color: '#7be07b', shape: 'circle', blurb: 'Squishy and plentiful.', weak: ['fire', 'acid'], resist: ['poison'] },
  { id: 'twiggling', name: 'Twiggling', area: 'forest', archetype: 'plant', hp: 1.2, speed: 1.2, gold: 1.5, spawn: 0.7, pack: [2, 4], radius: 9, material: 'twig', unlock: 250, color: '#a07a4a', shape: 'diamond', blurb: 'A bundle of sticks that learned to walk, and then to bite.', weak: ['fire', 'physical'], resist: ['poison'] },
  { id: 'wolf', name: 'Forest Wolf', area: 'forest', archetype: 'beast', hp: 1.8, speed: 1.5, gold: 2.4, spawn: 0.55, pack: [2, 3], radius: 10, material: 'pelt', extra: 'beastBone', unlock: 900, color: '#b08a5a', shape: 'triangle', blurb: 'Fast, hunts in pairs.', weak: ['fire'], resist: ['frost'] },
  { id: 'goblin', name: 'Goblin', area: 'forest', archetype: 'humanoid', hp: 1.5, speed: 1.1, gold: 1.8, spawn: 0.5, pack: [2, 4], radius: 10, material: 'scrap', unlock: 4_000, color: '#6a9a3a', shape: 'square', blurb: 'Sneaky, greedy and always in a gang.', weak: ['fire', 'radiant'], resist: ['poison'] },
  { id: 'brownBear', name: 'Brown Bear', area: 'forest', archetype: 'beast', hp: 4, speed: 0.8, gold: 5, spawn: 0.25, pack: [1, 2], radius: 15, material: 'bearClaw', extra: 'beastBone', unlock: 15_000, color: '#7a5030', shape: 'hexagon', blurb: 'Big, brown and always hungry.', weak: ['fire', 'arcane'], resist: ['frost', 'physical'] },


  // Fey Grove
  { id: 'toadstool', name: 'Toadstool', area: 'glade', archetype: 'plant', hp: 1, speed: 0.7, gold: 1.5, spawn: 1.2, pack: [2, 4], radius: 10, material: 'spore', unlock: 0, color: '#d0584a', shape: 'circle', blurb: 'A walking mushroom that puffs spores.', weak: ['fire', 'frost'], resist: ['poison', 'acid'] },
  { id: 'pixie', name: 'Pixie', area: 'glade', archetype: 'elemental', hp: 0.8, speed: 1.7, gold: 2, spawn: 0.5, pack: [2, 3], radius: 8, material: 'dust', unlock: 120, color: '#ff9ae0', shape: 'diamond', blurb: 'Giggles, glitters and bites.', weak: ['void', 'decay'], resist: ['arcane'] },
  { id: 'unicorn', name: 'Unicorn', area: 'glade', archetype: 'beast', hp: 2.5, speed: 1.6, gold: 3, spawn: 0.35, pack: [1, 2], radius: 13, material: 'enchantedBone', extra: 'unicornHorn', unlock: 900, color: '#f4f0ff', shape: 'triangle', blurb: 'Beautiful, magical, and it will absolutely stab you.', weak: ['void', 'decay'], resist: ['radiant', 'arcane'] },
  { id: 'manTrap', name: 'Walking Man Trap', area: 'glade', archetype: 'plant', hp: 2.4, speed: 0.7, gold: 2.8, spawn: 0.4, pack: [1, 3], radius: 12, material: 'thorn', unlock: 4_000, color: '#6ab04a', shape: 'diamond', blurb: 'A giant flytrap on legs. It is not picky about flies.', weak: ['fire', 'frost'], resist: ['poison', 'acid'] },
  { id: 'treant', name: 'Treant', area: 'glade', archetype: 'plant', hp: 5, speed: 0.5, gold: 6, spawn: 0.2, pack: [1, 1], radius: 17, material: 'sap', unlock: 15_000, color: '#5a7a3a', shape: 'hexagon', blurb: 'An old tree that has had enough.', weak: ['fire', 'acid'], resist: ['physical', 'poison'] },
  { id: 'stoneGolem', name: 'Stone Golem', area: 'glade', archetype: 'construct', hp: 6, speed: 0.45, gold: 7, spawn: 0.04, pack: [1, 1], radius: 18, material: 'awokenRock', drops: [{ material: 'obsidian', share: 0.3 }, { material: 'ironOre', share: 0.1 }], unlock: 40_000, color: '#8a8478', shape: 'square', blurb: 'A hillside that woke up and started walking.', weak: ['acid', 'lightning'], resist: ['physical', 'fire'] },


  // Restless Graveyard
  { id: 'skeleton', name: 'Skeleton', area: 'graveyard', archetype: 'undead', hp: 1, speed: 0.9, gold: 1, spawn: 1.5, pack: [3, 5], radius: 11, material: 'bone', unlock: 0, color: '#e8dcc0', shape: 'square', blurb: 'Rattles in by the dozen.', weak: ['radiant', 'arcane'], resist: ['poison', 'decay'] },
  { id: 'zombie', name: 'Zombie', area: 'graveyard', archetype: 'undead', hp: 2.2, speed: 0.6, gold: 2.4, spawn: 0.6, pack: [2, 4], radius: 12, material: 'flesh', unlock: 120, color: '#8fae6b', shape: 'square', blurb: 'Slow, sturdy, relentless. Sometimes still wearing its gear.', weak: ['fire', 'radiant'], resist: ['poison', 'decay'] },
  { id: 'bat', name: 'Vampire Bat', area: 'graveyard', archetype: 'beast', hp: 0.8, speed: 1.9, gold: 1.5, spawn: 0.8, pack: [3, 5], radius: 8, material: 'vampEssence', extra: 'wing', unlock: 900, color: '#8a2a4a', shape: 'triangle', blurb: 'Tiny, fast and thirsty.', weak: ['frost', 'radiant'], resist: ['decay'] },
  { id: 'cultist', name: 'Cultist', area: 'graveyard', archetype: 'humanoid', hp: 1.8, speed: 1, gold: 2.2, spawn: 0.5, pack: [2, 3], radius: 11, material: 'sacredText', extra: 'robePiece', unlock: 4_000, color: '#7a2a3a', shape: 'diamond', blurb: 'Chants in the dark; sometimes the dark answers.', weak: ['radiant', 'physical'], resist: ['decay'] },
  { id: 'graveWraith', name: 'Wraith', area: 'graveyard', archetype: 'undead', hp: 1.2, speed: 1.3, gold: 1.8, spawn: 0.6, pack: [2, 4], radius: 11, material: 'nightmareWisp', unlock: 15_000, color: '#5a6a8a', shape: 'ghost', blurb: 'The shadow of a nightmare that never ended.', weak: ['radiant', 'arcane'], resist: ['physical', 'frost'] },


  // Forbidden Crypt
  { id: 'crow', name: 'Carrion Crow', area: 'crypt', archetype: 'beast', hp: 1, speed: 2, gold: 1.2, spawn: 1.4, pack: [3, 6], radius: 7, material: 'undeadFeather', unlock: 0, color: '#3a3a4a', shape: 'triangle', blurb: 'Follows the dead, and those about to be.', weak: ['frost', 'physical'], resist: ['decay'] },
  { id: 'puppet', name: 'Possessed Puppet', area: 'crypt', archetype: 'construct', hp: 2.2, speed: 1.2, gold: 3, spawn: 0.4, pack: [2, 4], radius: 10, material: 'string', unlock: 120, color: '#b08058', shape: 'diamond', blurb: 'A marionette that dances with no hand on its strings.', weak: ['fire', 'physical'], resist: ['poison', 'frost'] },
  { id: 'boneKnight', name: 'Bone Knight', area: 'crypt', archetype: 'undead', hp: 4, speed: 0.8, gold: 4.5, spawn: 0.3, pack: [1, 2], radius: 13, material: 'enchantedBone', unlock: 900, color: '#c8c0a8', shape: 'hexagon', blurb: 'A skeleton that kept its armor, and its sword.', weak: ['radiant'], resist: ['physical', 'poison', 'decay'] },
  { id: 'possessedArmor', name: 'Possessed Armor', area: 'crypt', archetype: 'construct', hp: 4.5, speed: 0.7, gold: 5, spawn: 0.25, pack: [1, 2], radius: 13, material: 'enchantedScrap', unlock: 4_000, color: '#8890b0', shape: 'square', blurb: 'An empty suit of armor that never stopped standing guard.', weak: ['arcane', 'lightning'], resist: ['physical', 'poison', 'decay'] },
  { id: 'mummy', name: 'Mummy', area: 'crypt', archetype: 'undead', hp: 3, speed: 0.6, gold: 3.2, spawn: 0.35, pack: [1, 3], radius: 12, material: 'wrap', unlock: 8_000, color: '#d8c89a', shape: 'square', blurb: 'Wrapped tight and very flammable.', weak: ['fire'], resist: ['poison', 'decay', 'frost'] },
  { id: 'necromancer', name: 'Necromancer', area: 'crypt', archetype: 'humanoid', hp: 3, speed: 0.9, gold: 4, spawn: 0.25, pack: [1, 2], radius: 12, material: 'grave', unlock: 15_000, color: '#5a3a7a', shape: 'diamond', blurb: 'Raises the dead for fun, and hurls bolts of grave-magic from afar.', weak: ['radiant', 'physical'], resist: ['decay', 'void'], ranged: { range: 165, cooldown: 2.6, speed: 115 } },


  // Shadowy Depths
  { id: 'gloomcrawler', name: 'Gloomcrawler', area: 'depths', archetype: 'beast', hp: 1, speed: 1.3, gold: 1.1, spawn: 1.4, pack: [3, 5], radius: 9, material: 'darkClaw', unlock: 0, color: '#4a4058', shape: 'triangle', blurb: 'Too many legs, all of them quiet.', weak: ['fire', 'radiant'], resist: ['poison'] },
  { id: 'duskmoth', name: 'Duskmoth', area: 'depths', archetype: 'beast', hp: 0.8, speed: 1.8, gold: 1.2, spawn: 0.6, pack: [2, 4], radius: 8, material: 'gloom', unlock: 120, color: '#8a7a9a', shape: 'diamond', blurb: 'Drawn to light. Especially yours.', weak: ['fire', 'frost'], resist: ['decay'] },
  { id: 'shadowWisp', name: 'Shadow Haunt', area: 'depths', archetype: 'elemental', hp: 1, speed: 1.5, gold: 1.8, spawn: 0.5, pack: [2, 3], radius: 9, material: 'shadowWisp', unlock: 900, color: '#6a5a8a', shape: 'ghost', blurb: 'A shadow that follows you even where there is no light, flinging shards of darkness from afar.', weak: ['radiant', 'arcane'], resist: ['physical', 'decay'], ranged: { range: 190, cooldown: 2.2, speed: 140 } },
  { id: 'gazingEye', name: 'Gazing Eye', area: 'depths', archetype: 'demon', hp: 1.8, speed: 0.9, gold: 2.2, spawn: 0.45, pack: [1, 3], radius: 11, material: 'umbralEye', unlock: 4_000, color: '#b8a0d8', shape: 'circle', blurb: 'It never blinks. It never stops watching, and it keeps its distance while it fires bolts from its gaze.', weak: ['radiant', 'physical'], resist: ['arcane', 'void'], ranged: { range: 230, cooldown: 3, speed: 125 } },
  { id: 'umbralOoze', name: 'Umbral Ooze', area: 'depths', archetype: 'slime', hp: 2.2, speed: 0.8, gold: 2.6, spawn: 0.4, pack: [2, 3], radius: 12, material: 'umbralSlime', unlock: 8_000, color: '#3a2e4a', shape: 'circle', blurb: 'A slime that soaked up the dark.', weak: ['fire', 'radiant'], resist: ['poison', 'void'] },
  { id: 'deepLurker', name: 'Abyssal Lurker', area: 'depths', archetype: 'demon', hp: 3, speed: 0.7, gold: 3.5, spawn: 0.35, pack: [1, 2], radius: 13, material: 'umbra', unlock: 15_000, color: '#2a2036', shape: 'hexagon', blurb: 'All eyes and teeth, somewhere in the abyss.', weak: ['radiant'], resist: ['physical', 'void'] },


  // Ember Mines
  { id: 'imp', name: 'Imp', area: 'caves', archetype: 'demon', hp: 1, speed: 1.3, gold: 1, spawn: 1.4, pack: [2, 4], radius: 9, material: 'demonBone', extra: 'demonWing', unlock: 0, color: '#ff7a3d', shape: 'hexagon', blurb: 'Cackling little fire-starters.', weak: ['frost', 'radiant'], resist: ['fire'] },
  { id: 'magmaSlime', name: 'Magma Slime', area: 'caves', archetype: 'slime', hp: 2.5, speed: 0.8, gold: 2.5, spawn: 0.6, pack: [2, 3], radius: 12, material: 'magma', unlock: 120, color: '#ff4d1a', shape: 'circle', blurb: 'Molten and very hard to squish.', weak: ['frost', 'acid'], resist: ['fire', 'physical'] },
  { id: 'beetle', name: 'Fire Beetle', area: 'caves', archetype: 'beast', hp: 1.8, speed: 1.1, gold: 1.8, spawn: 0.7, pack: [2, 4], radius: 11, material: 'chitin', unlock: 900, color: '#3fb0a0', shape: 'triangle', blurb: 'Armored and quick to scuttle.', weak: ['acid', 'frost'], resist: ['physical', 'fire'] },
  { id: 'salamander', name: 'Salamander', area: 'caves', archetype: 'beast', hp: 1.8, speed: 1.3, gold: 2, spawn: 0.5, pack: [2, 3], radius: 11, material: 'ember', unlock: 4_000, color: '#ff9a3a', shape: 'triangle', blurb: 'A lizard that swims in lava.', weak: ['frost'], resist: ['fire', 'poison'] },
  { id: 'hellhound', name: 'Hellhound', area: 'caves', archetype: 'demon', hp: 2, speed: 1.8, gold: 2.6, spawn: 0.4, pack: [2, 3], radius: 11, material: 'demonTooth', extra: 'demonBone', unlock: 15_000, color: '#b02a1a', shape: 'triangle', blurb: 'Its bark is fire. So is its bite.', weak: ['frost', 'radiant'], resist: ['fire', 'decay'] },
  { id: 'oreGolem', name: 'Ore Golem', area: 'caves', archetype: 'construct', hp: 6, speed: 0.45, gold: 7, spawn: 0.045, pack: [1, 1], radius: 18, material: 'ironOre', drops: [{ material: 'silverOre', share: 0.3 }, { material: 'goldOre', share: 0.1 }], unlock: 40_000, color: '#7a6250', shape: 'square', blurb: 'Rock threaded with metal veins, guarding the richest seams.', weak: ['acid', 'lightning'], resist: ['physical', 'frost'] },
  { id: 'geodeGolem', name: 'Geode Golem', area: 'caves', archetype: 'construct', hp: 8, speed: 0.4, gold: 9, spawn: 0.03, pack: [1, 1], radius: 19, material: 'quartz', drops: [{ material: 'amethyst', share: 0.4 }, { material: 'topaz', share: 0.2 }, { material: 'emerald', share: 0.08 }, { material: 'diamond', share: 0.03 }], unlock: 120_000, color: '#9a70d0', shape: 'hexagon', blurb: 'Plain grey rock outside; a glittering crystal heart inside.', weak: ['acid', 'void'], resist: ['physical', 'arcane'] },


  // Venom Caverns
  { id: 'kobold', name: 'Kobold', area: 'mines', archetype: 'humanoid', hp: 1, speed: 1.2, gold: 1.4, spawn: 1.4, pack: [3, 5], radius: 9, material: 'ore', unlock: 0, color: '#c07a3a', shape: 'square', blurb: 'Digs tunnels, sets traps, yips a lot.', weak: ['frost', 'physical'], resist: ['fire'] },
  { id: 'basilisk', name: 'Basilisk', area: 'mines', archetype: 'beast', hp: 3, speed: 1, gold: 3.8, spawn: 0.3, pack: [1, 2], radius: 13, material: 'scale', unlock: 120, color: '#5aa05a', shape: 'triangle', blurb: 'Whatever you do, don\'t meet its eyes.', weak: ['radiant', 'frost'], resist: ['poison', 'acid'] },
  // Ids kept from the old fire monsters (Lava Golem, Fire Drake) so saves keep their kills, Empower and evolutions.
  { id: 'lavaGolem', name: 'Toxic Bloat', area: 'mines', archetype: 'elemental', hp: 5, speed: 0.5, gold: 5.5, spawn: 0.2, pack: [1, 1], radius: 16, material: 'magma', unlock: 900, color: '#7a5aa0', shape: 'diamond', size: 'large', blurb: 'A walking sack of cave gas. Best popped from a distance.', weak: ['fire', 'radiant'], resist: ['poison', 'acid', 'physical'] },
  { id: 'fireDrake', name: 'Broodmother', area: 'mines', archetype: 'beast', hp: 3.5, speed: 1.2, gold: 4.2, spawn: 0.25, pack: [1, 2], radius: 14, material: 'scale', unlock: 4_000, color: '#5a9a3a', shape: 'hexagon', size: 'large', blurb: 'Mother of every spider in the Caverns. Her bite burns for days.', weak: ['fire', 'radiant'], resist: ['poison', 'physical'] },
  { id: 'caveTroll', name: 'Cave Troll', area: 'mines', archetype: 'humanoid', hp: 6, speed: 0.6, gold: 6.5, spawn: 0.15, pack: [1, 1], radius: 17, material: 'ore', unlock: 15_000, color: '#7a6a5a', shape: 'square', blurb: 'Shrugs off blades. Hates fire.', weak: ['fire', 'acid'], resist: ['physical', 'frost'] },
  { id: 'venomGolem', name: 'Venomite Golem', area: 'mines', archetype: 'construct', hp: 6, speed: 0.45, gold: 7, spawn: 0.04, pack: [1, 1], radius: 18, material: 'cobaltOre', drops: [{ material: 'venomite', share: 0.3 }, { material: 'ore', share: 0.1 }], unlock: 40_000, color: '#4a7a3a', shape: 'square', blurb: 'Stone and ore, soaked through with venom.', weak: ['acid', 'radiant'], resist: ['physical', 'poison'] },


  // Frost Peaks
  { id: 'iceWolf', name: 'Ice Wolf', area: 'peaks', archetype: 'beast', hp: 1, speed: 1.4, gold: 1, spawn: 1.4, pack: [2, 4], radius: 10, material: 'fur', unlock: 0, color: '#dfefff', shape: 'triangle', blurb: 'The pack howls on the wind.', weak: ['fire'], resist: ['frost'] },
  { id: 'golem', name: 'Frost Golem', area: 'peaks', archetype: 'elemental', hp: 4, speed: 0.5, gold: 4.5, spawn: 0.3, pack: [1, 2], radius: 16, material: 'frost', unlock: 120, color: '#8fdcff', shape: 'diamond', blurb: 'A walking wall of ice.', weak: ['fire', 'acid'], resist: ['frost', 'poison'] },
  { id: 'wraith', name: 'Snow Wraith', area: 'peaks', archetype: 'undead', hp: 1.4, speed: 1.3, gold: 1.8, spawn: 0.6, pack: [2, 4], radius: 11, material: 'ecto', unlock: 900, color: '#c49bff', shape: 'ghost', blurb: 'Drifts in quickly from the storm.', weak: ['radiant', 'arcane'], resist: ['physical'] },
  { id: 'yeti', name: 'Yeti', area: 'peaks', archetype: 'beast', hp: 3.5, speed: 1, gold: 4, spawn: 0.3, pack: [1, 2], radius: 15, material: 'fur', unlock: 4_000, color: '#f0f4ff', shape: 'hexagon', blurb: 'Big, shaggy and surprisingly quick.', weak: ['fire'], resist: ['frost'] },
  { id: 'frostSprite', name: 'Frost Sprite', area: 'peaks', archetype: 'elemental', hp: 0.8, speed: 1.6, gold: 1.5, spawn: 0.8, pack: [3, 5], radius: 8, material: 'frost', unlock: 15_000, color: '#bfefff', shape: 'diamond', blurb: 'A snowflake with a grudge.', weak: ['fire', 'physical'], resist: ['frost', 'poison'] },
  { id: 'glacialGolem', name: 'Glacial Golem', area: 'peaks', archetype: 'construct', hp: 6, speed: 0.45, gold: 7, spawn: 0.04, pack: [1, 1], radius: 18, material: 'frostIron', drops: [{ material: 'coldsteel', share: 0.25 }], unlock: 40_000, color: '#a8c8e0', shape: 'square', blurb: 'An iron giant frozen into the mountain, now thawed and angry.', weak: ['fire', 'acid'], resist: ['physical', 'frost'] },
  { id: 'crystalGolem', name: 'Crystal Golem', area: 'peaks', archetype: 'construct', hp: 7, speed: 0.4, gold: 8, spawn: 0.03, pack: [1, 1], radius: 18, material: 'aquamarine', drops: [{ material: 'sapphire', share: 0.25 }], unlock: 120_000, color: '#6fd0e8', shape: 'hexagon', blurb: 'Ice and gemstone, glittering in the snow.', weak: ['fire', 'physical'], resist: ['frost', 'arcane'] },


  // Ascendant Steps
  { id: 'harpy', name: 'Harpy', area: 'cliffs', archetype: 'beast', hp: 1, speed: 1.8, gold: 1.8, spawn: 1.4, pack: [2, 4], radius: 10, material: 'plume', unlock: 0, color: '#a08ac0', shape: 'triangle', blurb: 'Screeches down from the heights.', weak: ['physical', 'acid'], resist: ['frost'] },
  { id: 'snowOwl', name: 'Snow Owl', area: 'cliffs', archetype: 'beast', hp: 1, speed: 1.9, gold: 1.6, spawn: 0.6, pack: [2, 4], radius: 9, material: 'plume', unlock: 120, color: '#e8e8f0', shape: 'triangle', blurb: 'Silent wings, sharp talons.', weak: ['fire', 'acid'], resist: ['frost'] },
  { id: 'griffin', name: 'Griffin', area: 'cliffs', archetype: 'beast', hp: 3, speed: 1.6, gold: 3.8, spawn: 0.3, pack: [1, 2], radius: 14, material: 'plume', unlock: 900, color: '#d8b060', shape: 'triangle', blurb: 'Half eagle, half lion, all trouble.', weak: ['acid', 'void'], resist: ['frost'] },
  { id: 'iceWyvern', name: 'Ice Wyvern', area: 'cliffs', archetype: 'dragon', hp: 5, speed: 1.2, gold: 6, spawn: 0.18, pack: [1, 1], radius: 16, material: 'skystone', unlock: 4_000, color: '#6ac8f0', shape: 'hexagon', size: 'huge', blurb: 'Breathes blizzards.', weak: ['fire', 'radiant'], resist: ['frost', 'poison'] },
  { id: 'frostGiant', name: 'Frost Giant', area: 'cliffs', archetype: 'humanoid', hp: 7, speed: 0.5, gold: 8, spawn: 0.12, pack: [1, 1], radius: 18, material: 'skystone', unlock: 15_000, color: '#8ab8e8', shape: 'square', blurb: 'Throws boulders like snowballs.', weak: ['fire', 'radiant'], resist: ['frost', 'physical'] },
  { id: 'skyGolem', name: 'Sky Golem', area: 'cliffs', archetype: 'construct', hp: 6, speed: 0.45, gold: 7, spawn: 0.04, pack: [1, 1], radius: 18, material: 'skysteel', drops: [{ material: 'orichalcum', share: 0.25 }], unlock: 40_000, color: '#b8c4e8', shape: 'square', blurb: 'Carved to guard the stairs to the sky, and still guarding.', weak: ['acid', 'lightning'], resist: ['physical', 'frost'] },


  // Cloud Fortress
  { id: 'cloudling', name: 'Cloudling', area: 'fortress', archetype: 'slime', hp: 1, speed: 1.3, gold: 1.2, spawn: 1.4, pack: [3, 5], radius: 11, material: 'feather', unlock: 0, color: '#eef6ff', shape: 'circle', blurb: 'A puff of cloud with a mean streak.', weak: ['fire', 'void'], resist: ['frost', 'physical'] },
  { id: 'thunderbird', name: 'Thunderbird', area: 'fortress', archetype: 'beast', hp: 1.4, speed: 1.9, gold: 1.8, spawn: 0.6, pack: [2, 4], radius: 11, material: 'feather', unlock: 120, color: '#f0d050', shape: 'triangle', blurb: 'Every beat of its wings is a thunderclap.', weak: ['frost', 'acid'], resist: ['arcane'] },
  { id: 'skyKnight', name: 'Sky Knight', area: 'fortress', archetype: 'humanoid', hp: 3, speed: 1, gold: 3.6, spawn: 0.35, pack: [1, 2], radius: 13, material: 'thunder', unlock: 900, color: '#a8c0e0', shape: 'square', blurb: 'Guards the gates in armour of polished cloud-steel.', weak: ['acid', 'decay'], resist: ['physical', 'radiant'] },
  { id: 'valkyrie', name: 'Valkyrie', area: 'fortress', archetype: 'humanoid', hp: 2.5, speed: 1.6, gold: 3.2, spawn: 0.3, pack: [1, 2], radius: 12, material: 'feather', unlock: 4_000, color: '#ffe8b0', shape: 'diamond', blurb: 'Dives from the battlements, spear first.', weak: ['decay', 'void'], resist: ['radiant', 'frost'] },
  { id: 'stormTitan', name: 'Storm Titan', area: 'fortress', archetype: 'elemental', hp: 7, speed: 0.5, gold: 8, spawn: 0.12, pack: [1, 1], radius: 19, material: 'thunder', unlock: 15_000, color: '#6a80c0', shape: 'hexagon', blurb: 'A thundercloud that learned to walk.', weak: ['acid', 'poison'], resist: ['arcane', 'frost', 'physical'] },
  { id: 'stormGolem', name: 'Storm Golem', area: 'fortress', archetype: 'construct', hp: 7, speed: 0.4, gold: 8, spawn: 0.03, pack: [1, 1], radius: 18, material: 'opal', drops: [{ material: 'stormstone', share: 0.25 }], unlock: 40_000, color: '#d8c8ff', shape: 'hexagon', blurb: 'A golem of cloud-stone and gems, crackling with the storm.', weak: ['acid', 'void'], resist: ['lightning', 'physical'] },

  // Meteor Field
  { id: 'meteorite', name: 'Meteorite', area: 'meteors', archetype: 'elemental', hp: 1, speed: 1.4, gold: 1.2, spawn: 1.4, pack: [3, 5], radius: 11, material: 'meteor', unlock: 0, color: '#c07048', shape: 'circle', blurb: 'A burning rock that never stopped falling.', weak: ['frost', 'physical'], resist: ['fire'] },
  { id: 'cometWisp', name: 'Comet Wisp', area: 'meteors', archetype: 'elemental', hp: 0.8, speed: 2, gold: 1.6, spawn: 0.7, pack: [3, 5], radius: 9, material: 'stardust', unlock: 120, color: '#9ad8ff', shape: 'ghost', blurb: 'A streak of ice and light with a long, bright tail.', weak: ['fire', 'void'], resist: ['frost', 'physical'] },
  { id: 'rockMite', name: 'Rock Mite', area: 'meteors', archetype: 'beast', hp: 2.2, speed: 1.2, gold: 2.6, spawn: 0.45, pack: [2, 4], radius: 11, material: 'meteor', unlock: 900, color: '#8a7a6a', shape: 'triangle', blurb: 'Burrows into asteroids and eats its way out.', weak: ['acid', 'radiant'], resist: ['physical', 'fire'] },
  { id: 'astralSentinel', name: 'Astral Sentinel', area: 'meteors', archetype: 'humanoid', hp: 4, speed: 0.8, gold: 4.8, spawn: 0.25, pack: [1, 2], radius: 14, material: 'stardust', unlock: 4_000, color: '#b8a8ff', shape: 'diamond', blurb: 'An ancient watcher, carved from starlight.', weak: ['void', 'decay'], resist: ['arcane', 'radiant'] },
  { id: 'starEater', name: 'Star Eater', area: 'meteors', archetype: 'dragon', hp: 8, speed: 0.9, gold: 9.5, spawn: 0.1, pack: [1, 1], radius: 19, material: 'stardust', unlock: 15_000, color: '#5a3a9a', shape: 'hexagon', size: 'huge', blurb: 'Swallows falling stars whole. The way down to the Rift lies past it.', weak: ['radiant', 'frost'], resist: ['fire', 'physical', 'arcane'] },
  { id: 'meteorGolem', name: 'Meteor Golem', area: 'meteors', archetype: 'construct', hp: 6, speed: 0.45, gold: 7, spawn: 0.04, pack: [1, 1], radius: 18, material: 'starIron', drops: [{ material: 'adamantite', share: 0.25 }], unlock: 40_000, color: '#c08050', shape: 'square', blurb: 'A fallen star that picked itself up.', weak: ['frost', 'acid'], resist: ['physical', 'fire'] },

  // Void Rift
  { id: 'shadowSlime', name: 'Shadow Slime', area: 'rift', archetype: 'slime', hp: 1, speed: 1, gold: 1, spawn: 1.5, pack: [3, 5], radius: 11, material: 'shade', unlock: 0, color: '#7a5cc0', shape: 'circle', blurb: 'A slime made of the dark itself.', weak: ['radiant', 'acid'], resist: ['void'] },
  { id: 'horror', name: 'Void Horror', area: 'rift', archetype: 'demon', hp: 5, speed: 0.8, gold: 6, spawn: 0.25, pack: [1, 2], radius: 15, material: 'void', unlock: 120, color: '#ff5fd7', shape: 'hexagon', blurb: 'Rare, huge, and very rewarding.', weak: ['radiant', 'arcane'], resist: ['void', 'decay'] },
  { id: 'lich', name: 'Lich', area: 'rift', archetype: 'undead', hp: 2.5, speed: 1, gold: 3.5, spawn: 0.4, pack: [1, 3], radius: 12, material: 'soul', unlock: 900, color: '#6ff0e0', shape: 'ghost', blurb: 'An undead king hoarding souls.', weak: ['radiant', 'fire'], resist: ['decay', 'poison', 'frost'] },
  { id: 'shade', name: 'Shade', area: 'rift', archetype: 'undead', hp: 1.2, speed: 1.4, gold: 1.6, spawn: 0.7, pack: [3, 5], radius: 10, material: 'shade', unlock: 4_000, color: '#4a3a6a', shape: 'ghost', blurb: 'A shadow that forgot who cast it.', weak: ['radiant'], resist: ['physical', 'void'] },
  { id: 'watcher', name: 'Watcher', area: 'rift', archetype: 'demon', hp: 2.5, speed: 0.8, gold: 3.2, spawn: 0.35, pack: [1, 2], radius: 13, material: 'void', unlock: 15_000, color: '#c05ad0', shape: 'circle', blurb: 'One huge eye. It never blinks.', weak: ['radiant', 'acid'], resist: ['arcane', 'void'] },
  { id: 'darkKnight', name: 'Dark Knight', area: 'rift', archetype: 'humanoid', hp: 4, speed: 0.9, gold: 4.6, spawn: 0.25, pack: [1, 2], radius: 13, material: 'soul', unlock: 40_000, color: '#3a2a4a', shape: 'square', blurb: 'Traded his soul for better armor.', weak: ['radiant', 'arcane'], resist: ['physical', 'decay'] },
  { id: 'succubus', name: 'Succubus', area: 'rift', archetype: 'demon', hp: 2, speed: 1.5, gold: 2.8, spawn: 0.4, pack: [1, 3], radius: 11, material: 'soul', unlock: 100_000, color: '#ff6ab0', shape: 'diamond', blurb: 'Charming. Deadly. Mostly deadly.', weak: ['radiant', 'frost'], resist: ['fire', 'arcane'] },
  { id: 'chimera', name: 'Chimera', area: 'rift', archetype: 'beast', hp: 5, speed: 1.2, gold: 6, spawn: 0.18, pack: [1, 1], radius: 16, material: 'void', unlock: 250_000, color: '#c08a4a', shape: 'hexagon', blurb: 'Three heads, zero manners.', weak: ['frost', 'acid'], resist: ['fire', 'poison'] },
  { id: 'voidWyrm', name: 'Void Wyrm', area: 'rift', archetype: 'dragon', hp: 8, speed: 0.9, gold: 9.5, spawn: 0.1, pack: [1, 1], radius: 18, material: 'void', unlock: 600_000, color: '#8a3ae0', shape: 'hexagon', size: 'huge', blurb: 'Swims through the dark between stars.', weak: ['radiant'], resist: ['void', 'physical', 'frost'] },
  { id: 'behemoth', name: 'Behemoth', area: 'rift', archetype: 'beast', hp: 10, speed: 0.6, gold: 12, spawn: 0.08, pack: [1, 1], radius: 20, material: 'soul', unlock: 1_500_000, color: '#6a4a8a', shape: 'hexagon', size: 'large', blurb: 'The ground shakes when it walks.', weak: ['arcane', 'acid'], resist: ['physical', 'fire'] },
  { id: 'voidGolem', name: 'Void Golem', area: 'rift', archetype: 'construct', hp: 8, speed: 0.4, gold: 9, spawn: 0.03, pack: [1, 1], radius: 19, material: 'voidsteel', drops: [{ material: 'voidPrism', share: 0.3 }], unlock: 3_000_000, color: '#5a3a8a', shape: 'hexagon', blurb: 'Ore and gem from beyond the Rift, walking.', weak: ['radiant', 'acid'], resist: ['void', 'physical'] },
  // The Void Rift's Guardian: it only ever appears as the final Guardian.
  // Guardians: boss versions of each area's monsters, only ever met in its Guardian Challenge
  { id: 'kingSlime', name: 'King of Slimes', area: 'forest', archetype: 'slime', guardianOnly: true, hp: 1, speed: 0.6, gold: 1, spawn: 0, pack: [1, 1], radius: 20, material: 'royalSlime', unlock: Infinity, color: '#4ad04a', shape: 'circle', blurb: "The biggest, oldest slime in the forest, crowned in its own goo.", weak: ['fire', 'acid'], resist: ['poison'] },
  { id: 'pixieQueen', name: 'Pixie Queen', area: 'glade', archetype: 'elemental', guardianOnly: true, hp: 1, speed: 0.6, gold: 1, spawn: 0, pack: [1, 1], radius: 16, material: 'regalEssence', unlock: Infinity, color: '#ff7ad8', shape: 'diamond', blurb: "She rules the Grove with a smile, a wand and a very long memory.", weak: ['void', 'decay'], resist: ['arcane', 'radiant'] },
  { id: 'skeletonKing', name: 'Skeleton King', area: 'graveyard', archetype: 'undead', guardianOnly: true, hp: 1, speed: 0.6, gold: 1, spawn: 0, pack: [1, 1], radius: 20, material: 'calciumCrystal', unlock: Infinity, color: '#f0e8d0', shape: 'square', blurb: "He wears a crown of finger bones and commands every skeleton in the Graveyard.", weak: ['radiant', 'arcane'], resist: ['poison', 'decay', 'physical'] },
  { id: 'awokenLich', name: 'Awoken Lich', area: 'crypt', archetype: 'undead', guardianOnly: true, hp: 1, speed: 0.6, gold: 1, spawn: 0, pack: [1, 1], radius: 20, material: 'eldritchText', unlock: Infinity, color: '#8a5ac0', shape: 'hexagon', blurb: "The Crypt's oldest master, risen at last, and furious about it.", weak: ['radiant', 'physical'], resist: ['decay', 'void', 'frost'] },
  { id: 'beholdenWatcher', name: 'Beholden Watcher', area: 'depths', archetype: 'demon', guardianOnly: true, hp: 1, speed: 0.6, gold: 1, spawn: 0, pack: [1, 1], radius: 22, material: 'everwatchingEye', unlock: Infinity, color: '#c0a0e0', shape: 'circle', blurb: "A great eye ringed with smaller ones. Every one of them is looking at you.", weak: ['radiant', 'lightning'], resist: ['arcane', 'void', 'physical'] },
  { id: 'demonLord', name: 'Demon Lord', area: 'caves', archetype: 'demon', guardianOnly: true, hp: 1, speed: 0.6, gold: 1, spawn: 0, pack: [1, 1], radius: 22, material: 'forsakenSoul', unlock: Infinity, color: '#c02a1a', shape: 'hexagon', blurb: "The master of the Ember Mines, wreathed in the souls it has taken.", weak: ['frost', 'radiant'], resist: ['fire', 'decay', 'physical'] },
  { id: 'timeEater', name: 'Time Eater', area: 'rift', archetype: 'demon', guardianOnly: true, winAt: 0.5, hp: 1, speed: 0.6, gold: 1, spawn: 0, pack: [1, 1], radius: 22, material: 'void', unlock: Infinity, color: '#e0c060', shape: 'hexagon', blurb: 'It devours the hours of every world it finds. The Void Rift is its mouth.', weak: ['radiant', 'arcane'], resist: ['void', 'decay', 'physical'] },
];

export const enemyDef = (id: EnemyId): EnemyDef => ENEMIES.find((e) => e.id === id)!;
/** An area's horde (Guardian-only monsters like the Time Eater aren't part of it). */
export const areaEnemies = (area: AreaId): EnemyDef[] => ENEMIES.filter((e) => e.area === area && !e.guardianOnly);
/** Which monster each area's Guardian is a giant version of. */
export const GUARDIAN_ENEMY: Record<AreaId, EnemyId> = {
  forest: 'kingSlime',
  glade: 'pixieQueen',
  graveyard: 'skeletonKing',
  crypt: 'awokenLich',
  depths: 'beholdenWatcher',
  caves: 'demonLord',
  mines: 'caveTroll',
  peaks: 'wraith',
  cliffs: 'iceWyvern',
  fortress: 'stormTitan',
  meteors: 'starEater',
  rift: 'timeEater',
};
export const enemyUnlockCost = (def: EnemyDef): number => def.unlock * areaDef(def.area).gold;

// ---- Monsters: Empower (gold) raises a monster's level; levels earn evolution points for its evolution tree ----

/** Slimes to slay (in all) before training unlocks. */
export const TRAIN_UNLOCK_KILLS = 20;

/** Slimes to slay (in all) before Empower unlocks. */
export const EMPOWER_UNLOCK_KILLS = 100;

/**
 * Empower: each session adds a share of a monster's HP, gold, material drops and spawns (added up). Every
 * EMPOWER_SESSIONS_PER_LEVEL sessions is a level, and each level above 1 earns an evolution point, up to
 * MAX_MONSTER_LEVEL, where every evolution tree can be completed (about ×7 HP, ×30 gold, ×4 drops, ×7.5 spawns).
 */
export const EMPOWER = { hp: 0.042, gold: 0.2, drops: 0.021, spawn: 0.045 };
export const EMPOWER_SESSIONS_PER_LEVEL = 5;
/** A monster's top level: enough evolution points for its whole tree. */
export const MAX_MONSTER_LEVEL = 30;
export const MAX_EMPOWER_SESSIONS = (MAX_MONSTER_LEVEL - 1) * EMPOWER_SESSIONS_PER_LEVEL;

/** Multiplier from `sessions` Empower sessions. */
export const empowerMult = (stat: keyof typeof EMPOWER, sessions: number): number => 1 + EMPOWER[stat] * sessions;
/**
 * Each session costs this much more than the last: the first levels are cheap (monsters keep up with your
 * early damage), and Lv 30 takes gold from about two areas further on (Green Slimes max out around the end of
 * the Restless Graveyard, or soon after reaching the Forbidden Crypt).
 */
export const EMPOWER_GROWTH = 1.125;

/** A monster's level from its Empower sessions, and progress toward the next (capped at MAX_MONSTER_LEVEL). */
export function monsterLevel(sessions: number): { level: number; into: number; need: number } {
  const s = Math.max(0, Math.min(MAX_EMPOWER_SESSIONS, Math.floor(sessions)));
  const level = 1 + Math.floor(s / EMPOWER_SESSIONS_PER_LEVEL);
  return { level, into: level >= MAX_MONSTER_LEVEL ? EMPOWER_SESSIONS_PER_LEVEL : s % EMPOWER_SESSIONS_PER_LEVEL, need: EMPOWER_SESSIONS_PER_LEVEL };
}

/**
 * Materials from one kill at a drop chance: every full 100% is a guaranteed drop, and the rest is the chance
 * of one more (150% = 1 + a 50% chance; 350% = 3 + a 50% chance). `roll` is uniform in [0, 1).
 */
export const dropsFrom = (chance: number, roll: number): number => Math.floor(chance) + (roll < chance % 1 ? 1 : 0);
// ---- Loot: some monsters carry gear; Guardians always drop a piece ----

/**
 * Chance per kill that a monster drops a piece of gear (loot). Only certain monsters carry it: thieves,
 * knights, grave robbers and the like. A Guardian always drops a piece when it falls.
 */
export const LOOT_CARRIERS: Partial<Record<EnemyId, number>> = {
  zombie: 1 / 2500,
  boneKnight: 1 / 1500,
  possessedArmor: 1 / 1200,
  imp: 1 / 6000,
  kobold: 1 / 6000,
  caveTroll: 1 / 1000,
  yeti: 1 / 1500,
  frostGiant: 1 / 1000,
  skyKnight: 1 / 2000,
  valkyrie: 1 / 1500,
  astralSentinel: 1 / 1500,
  darkKnight: 1 / 1200,
  lich: 1 / 2000,
};
export const lootChance = (id: EnemyId): number => LOOT_CARRIERS[id] ?? 0;
/** Share of loot from the area's own tier (the rest comes from older areas' gear). */
export const LOOT_CURRENT_SHARE = 0.6;
/** Chance a looted piece is already 2★. */
export const LOOT_TWO_STAR = 0.1;

/**
 * How deep into the game a material comes from: its area's index, plus how far into the area the first
 * monster dropping it is met (its place in the unlock order, up to +0.8; a Guardian's material is +0.9).
 */
export function materialDepth(m: MaterialId): number {
  let best = Infinity;
  for (const e of ENEMIES) {
    if (!enemyDrops(e).includes(m)) continue;
    const a = AREAS.findIndex((ar) => ar.id === e.area);
    const roster = areaEnemies(e.area);
    const into = e.guardianOnly ? 0.9 : (roster.findIndex((x) => x.id === e.id) / roster.length) * 0.8;
    best = Math.min(best, a + into);
  }
  return Number.isFinite(best) ? best : 0;
}

/**
 * The tier a piece of gear belongs to (1 = Wandering Woods … 12 = Void Rift): its own, or worked out from
 * its recipe, so gear made from materials further into an area is a little stronger (Forest gear runs from
 * 1.0 for Green Slime up to 1.9 for Royal Slime).
 */
export function gearTier(def: GearDef): number {
  if (def.tier) return def.tier;
  let t = 0;
  for (const m of Object.keys(def.recipe) as MaterialId[]) t = Math.max(t, materialDepth(m));
  return 1 + Math.round(t * 100) / 100;
}

/** The area a piece of gear comes from (its whole tier). */
export const gearArea = (def: GearDef): number => Math.floor(gearTier(def));

/**
 * A random piece of loot for an area: usually gear of that area's tier (or the newest tier below it that has
 * gear), otherwise something from an older area. `roll` and `pick` are uniform in [0, 1).
 */
export function rollLoot(area: AreaId, roll: number, pick: number): GearDef {
  const tier = AREAS.findIndex((a) => a.id === area) + 1;
  // Starting gear can drop too (it can't be crafted).
  const pool = GEAR.filter((g) => gearArea(g) <= tier);
  const top = Math.max(...pool.map(gearArea));
  const current = pool.filter((g) => gearArea(g) === top);
  const older = pool.filter((g) => gearArea(g) < top);
  const from = roll < LOOT_CURRENT_SHARE || !older.length ? current : older;
  return from[Math.floor(pick * from.length) % from.length];
}

/** A second drop (`extra`) comes at this share of the monster's drop chance. */
export const EXTRA_DROP_SHARE = 0.5;

/** Every material a monster drops (its main one, then its second if it has one). */
export const enemyDrops = (def: EnemyDef): MaterialId[] => [def.material, ...enemyExtraDrops(def).map((d) => d.material)];

/** Every drop after a monster's main one, with its share of the drop chance. */
export const enemyExtraDrops = (def: EnemyDef): Array<{ material: MaterialId; share: number }> => [
  ...(def.extra ? [{ material: def.extra, share: EXTRA_DROP_SHARE }] : []),
  ...(def.drops ?? []),
];

/** How rare a drop is, by its share of the monster's drop chance (for the Bestiary). */
export const dropRarity = (share: number): Rarity => (share >= 0.5 ? 'common' : share >= 0.25 ? 'uncommon' : share >= 0.1 ? 'rare' : share >= 0.05 ? 'veryRare' : 'legendary');

/** Cost of a monster's first Empower session (then × EMPOWER_GROWTH each). */
export const empowerBaseCost = (def: EnemyDef): number => Math.ceil(areaDef(def.area).gold * Math.max(10, def.unlock * 0.075) * def.gold);

/** What evolution nodes change (per rank). */
export type EvoStat =
  | 'hp' // +x HP (multiplier)
  | 'gold' // +x gold (multiplier)
  | 'drops' // +x material drop chance (multiplier)
  | 'spawn' // +x spawn rate (multiplier)
  | 'pack' // +x monsters per pack (they arrive in bigger hordes)
  | 'speed'; // +x move speed (multiplier): riskier, usually paired with a bigger reward
export type EvoNode = TreeNode<EvoStat>;
type EvoSpec = Pick<EvoNode, 'name' | 'icon' | 'desc' | 'maxRank' | 'effect'> & { id: string };
const ev = (id: string, name: string, icon: string, desc: string, maxRank: number, effect: EvoNode['effect']): EvoSpec => ({ id, name, icon, desc, maxRank, effect });

/**
 * Lays out an evolution tree: four rows (one per EVO_KILLS step), centred on column 1 of three, each node needing
 * any node touching it in the row above. Every archetype's has its own shape and leanings; the capstone takes
 * whatever points are left, so every tree completes exactly at the top level.
 */
function evoTree(rows: [EvoSpec, EvoSpec[], EvoSpec[]], capstone: Omit<EvoSpec, 'id'>): EvoNode[] {
  const nodes: EvoNode[] = [];
  [[rows[0]], rows[1], rows[2]].forEach((row, r) => {
    const above = nodes.filter((n) => n.row === r - 1);
    row.forEach((spec, i) => {
      const col = 1 - (row.length - 1) / 2 + i;
      nodes.push({ ...spec, requires: above.filter((p) => Math.abs(p.col - col) <= 1).map((p) => p.id), col, row: r });
    });
  });
  const spent = nodes.reduce((a, n) => a + n.maxRank * (n.cost ?? 1), 0);
  return [...nodes, { id: 'capstone', ...capstone, cost: MAX_MONSTER_LEVEL - 1 - spent, requires: nodes.filter((n) => n.row === 2).map((n) => n.id), col: 1, row: 3 }];
}

/** Each archetype's evolution template: every monster of that archetype grows its own copy (MONSTER_EVO_TREES), ending in its own Legacy. */
export const EVO_TREES: Record<Archetype, EvoNode[]> = {
  // Slimes: gold, and bigger blobs of them.
  slime: evoTree(
    [
      ev('root', 'Gelatinous Bulk', '🟢', '+25% HP and +25% gold.', 1, { hp: 0.25, gold: 0.25 }),
      [ev('wealth', 'Wealth', '💰', '+15% gold per rank.', 7, { gold: 0.15 }), ev('ooze', 'Ooze Trail', '🫧', 'Packs of 1 more per rank.', 2, { pack: 1 }), ev('horde', 'Horde', '👥', '+12% spawns per rank.', 5, { spawn: 0.12 })],
      [ev('wealth2', 'Treasure Gel', '🪙', '+30% gold per rank.', 3, { gold: 0.3 }), ev('horde2', 'Small Hordes', '🫧', 'Packs of 1 more and +10% spawns per rank.', 2, { pack: 1, spawn: 0.1 }), ev('harvest2', 'Rich Ooze', '💧', '+25% material drops per rank.', 3, { drops: 0.25 })],
    ],
    { name: "Slime King's Court", icon: '👑', desc: '+50% gold, +30% drops, packs of 1 more.', maxRank: 1, effect: { gold: 0.5, drops: 0.3, pack: 1 } },
  ),
  // Beasts: fine pelts and fast, dangerous packs.
  beast: evoTree(
    [
      ev('root', 'Thick Hide', '🐾', '+20% HP and +20% material drops.', 1, { hp: 0.2, drops: 0.2 }),
      [ev('wealth', 'Hunting Grounds', '💰', '+15% gold per rank.', 7, { gold: 0.15 }), ev('harvest', 'Pelts', '💎', '+15% material drops per rank.', 7, { drops: 0.15 })],
      [ev('wealth2', 'Prized Pelts', '🪙', '+40% gold but 8% faster per rank.', 3, { gold: 0.4, speed: 0.08 }), ev('horde2', 'Pack Hunters', '🐺', 'Packs of 1 more and +10% spawns per rank.', 3, { pack: 1, spawn: 0.1 }), ev('harvest2', 'Alpha Stock', '🦴', '+25% material drops per rank.', 3, { drops: 0.25 })],
    ],
    { name: 'Apex Herd', icon: '👑', desc: '+40% gold and +25% spawns.', maxRank: 1, effect: { gold: 0.4, spawn: 0.25 } },
  ),
  // Undead: endless hordes, each worth little.
  undead: evoTree(
    [
      ev('root', 'Restless Dead', '💀', '+20% HP and +20% spawns.', 1, { hp: 0.2, spawn: 0.2 }),
      [ev('wealth', 'Grave Goods', '💰', '+10% gold per rank.', 4, { gold: 0.1 }), ev('horde', 'Horde', '👥', '+12% spawns per rank.', 6, { spawn: 0.12 }), ev('harvest', 'Bone Harvest', '💎', '+15% material drops per rank.', 4, { drops: 0.15 })],
      [ev('wealth2', 'Tithe', '🪙', '+20% gold per rank.', 3, { gold: 0.2 }), ev('horde2', 'Rising Horde', '🧟', 'Packs of 1 more and +12% spawns per rank.', 3, { pack: 1, spawn: 0.12 }), ev('graves', 'Mass Grave', '⚰️', 'Packs of 1 more per rank.', 2, { pack: 1 })],
    ],
    { name: 'Endless Legion', icon: '👑', desc: '+30% spawns, packs of 2 more, +30% gold.', maxRank: 1, effect: { spawn: 0.3, pack: 2, gold: 0.3 } },
  ),
  // Demons: rich, but faster and tougher for it.
  demon: evoTree(
    [
      ev('root', 'Infernal Pact', '😈', '+20% HP and +30% gold.', 1, { hp: 0.2, gold: 0.3 }),
      [ev('wealth', 'Wealth', '💰', '+20% gold per rank.', 6, { gold: 0.2 }), ev('frenzy', 'Bloodlust', '🔥', '+30% gold but 10% faster per rank.', 3, { gold: 0.3, speed: 0.1 }), ev('horde', 'Summoning Circle', '👥', '+15% spawns per rank.', 5, { spawn: 0.15 })],
      [ev('wealth2', 'Hoarded Souls', '🪙', '+45% gold but 8% faster per rank.', 4, { gold: 0.45, speed: 0.08 }), ev('harvest2', 'Brimstone', '🪨', '+25% material drops per rank.', 4, { drops: 0.25 })],
    ],
    { name: 'Hellgate', icon: '👑', desc: '+60% gold and packs of 1 more, but +20% HP.', maxRank: 1, effect: { gold: 0.6, pack: 1, hp: 0.2 } },
  ),
  // Elementals: shards and cores.
  elemental: evoTree(
    [
      ev('root', 'Condensed Core', '🔷', '+25% HP and +25% material drops.', 1, { hp: 0.25, drops: 0.25 }),
      [ev('harvest', 'Harvest', '💎', '+15% material drops per rank.', 7, { drops: 0.15 }), ev('wealth', 'Crystal Heart', '💰', '+15% gold per rank.', 6, { gold: 0.15 })],
      [ev('harvest2', 'Shard Shedding', '💠', '+35% material drops per rank.', 3, { drops: 0.35 }), ev('volatile', 'Volatile', '⚡', '+20% material drops but 10% faster per rank.', 3, { drops: 0.2, speed: 0.1 }), ev('horde2', 'Surge', '🌪️', '+15% spawns per rank.', 3, { spawn: 0.15 })],
    ],
    { name: 'Primordial', icon: '👑', desc: '+60% material drops and +30% gold.', maxRank: 1, effect: { drops: 0.6, gold: 0.3 } },
  ),
  // Constructs: tough frames full of parts.
  construct: evoTree(
    [
      ev('root', 'Reinforced Frame', '🪆', '+25% HP and +20% material drops.', 1, { hp: 0.25, drops: 0.2 }),
      [ev('harvest', 'Plating', '💎', '+20% material drops but +10% HP per rank.', 5, { drops: 0.2, hp: 0.1 }), ev('wealth', 'Salvage Value', '💰', '+15% gold per rank.', 5, { gold: 0.15 }), ev('horde', 'Assembly Line', '👥', '+12% spawns per rank.', 4, { spawn: 0.12 })],
      [ev('harvest2', 'Spare Parts', '🔩', '+25% material drops per rank.', 3, { drops: 0.25 }), ev('wealth2', 'Scrap Value', '🪙', '+30% gold per rank.', 3, { gold: 0.3 }), ev('horde2', 'Production Run', '⚙️', 'Packs of 1 more and +10% spawns per rank.', 2, { pack: 1, spawn: 0.1 })],
    ],
    { name: 'Animated Legion', icon: '👑', desc: '+40% gold and +30% spawns.', maxRank: 1, effect: { gold: 0.4, spawn: 0.3 } },
  ),
  // Humanoids: war chests and warbands.
  humanoid: evoTree(
    [
      ev('root', 'Loot Sacks', '👤', '+10% HP and +30% gold.', 1, { hp: 0.1, gold: 0.3 }),
      [ev('wealth', 'Wealth', '💰', '+20% gold per rank.', 6, { gold: 0.2 }), ev('horde', 'Horde', '👥', '+12% spawns per rank.', 4, { spawn: 0.12 }), ev('harvest', 'Supply Lines', '💎', '+10% material drops per rank.', 3, { drops: 0.1 })],
      [ev('wealth2', 'War Chest', '🪙', '+35% gold per rank.', 3, { gold: 0.35 }), ev('bounties', 'Bounties', '📜', '+10% gold and +10% material drops per rank.', 4, { gold: 0.1, drops: 0.1 }), ev('horde2', 'Warbands', '⚔️', 'Packs of 1 more and +10% spawns per rank.', 2, { pack: 1, spawn: 0.1 })],
    ],
    { name: 'Warlord', icon: '👑', desc: '+50% gold and +20% spawns.', maxRank: 1, effect: { gold: 0.5, spawn: 0.2 } },
  ),
  // Plants: they spread, slowly, and bloom.
  plant: evoTree(
    [
      ev('root', 'Deep Roots', '🌿', '+30% HP and +20% material drops.', 1, { hp: 0.3, drops: 0.2 }),
      [ev('harvest', 'Harvest', '💎', '+15% material drops per rank.', 7, { drops: 0.15 }), ev('horde', 'Spreading Spores', '👥', '+15% spawns per rank.', 6, { spawn: 0.15 })],
      [ev('harvest2', 'Bountiful Bloom', '🌸', '+30% material drops per rank.', 3, { drops: 0.3 }), ev('rooted', 'Golden Sap', '🪙', '+20% gold and 10% slower per rank.', 3, { gold: 0.2, speed: -0.1 }), ev('horde2', 'Seed Pods', '🍄', 'Packs of 1 more per rank.', 2, { pack: 1 })],
    ],
    { name: 'World Tree', icon: '👑', desc: '+50% material drops and +40% gold.', maxRank: 1, effect: { drops: 0.5, gold: 0.4 } },
  ),
  // Dragons: few, tough, and sitting on a hoard.
  dragon: evoTree(
    [
      ev('root', 'Dragon Hoard', '🐉', '+30% HP and +40% gold.', 1, { hp: 0.3, gold: 0.4 }),
      [ev('wealth', 'Wealth', '💰', '+20% gold per rank.', 7, { gold: 0.2 }), ev('harvest', 'Shed Scales', '💎', '+15% material drops per rank.', 5, { drops: 0.15 })],
      [ev('wealth2', 'Golden Scales', '🪙', '+50% gold but 8% faster per rank.', 3, { gold: 0.5, speed: 0.08 }), ev('ancient', 'Ancient Hide', '🛡️', '+30% gold but +20% HP per rank.', 2, { gold: 0.3, hp: 0.2 }), ev('horde2', 'Clutch', '🥚', '+15% spawns per rank.', 3, { spawn: 0.15 })],
    ],
    { name: 'Elder Wyrm', icon: '👑', desc: '+75% gold and +40% material drops.', maxRank: 1, effect: { gold: 0.75, drops: 0.4 } },
  ),
};

/**
 * Legacies: a monster's capstone passes something on to every monster of its archetype, a small chance to
 * drop a material. A monster whose boss version is its area's Guardian passes on the Guardian's material (fully
 * evolved Green Slimes: every slime can drop Royal Slime); the rest pass on their rarest drop.
 */
const LEGACY_GUARDIAN: Partial<Record<EnemyId, EnemyId>> = {
  greenSlime: 'kingSlime',
  pixie: 'pixieQueen',
  skeleton: 'skeletonKing',
  mummy: 'awokenLich',
  gazingEye: 'beholdenWatcher',
  imp: 'demonLord',
};
/** A Legacy's share of each monster's drop chance: a Guardian's material, a monster's only drop, or half of its rarest extra drop's share. */
export const LEGACY_GUARDIAN_SHARE = 0.1;
export const LEGACY_OWN_SHARE = 0.25;
export const LEGACY_EXTRA_SHARE = 0.5;

/** What a monster's Legacy passes on to every monster of its archetype. */
export function evoLegacy(def: EnemyDef): { material: MaterialId; share: number } {
  const boss = LEGACY_GUARDIAN[def.id];
  if (boss) return { material: enemyDef(boss).material, share: LEGACY_GUARDIAN_SHARE };
  const extras = enemyExtraDrops(def);
  if (!extras.length) return { material: def.material, share: LEGACY_OWN_SHARE };
  const rarest = extras.reduce((a, b) => (b.share < a.share ? b : a));
  return { material: rarest.material, share: rarest.share * LEGACY_EXTRA_SHARE };
}

/**
 * Every monster's own evolution tree: its archetype's eight nodes, with the capstone as the monster's Legacy
 * (its archetype's capstone bonus for itself, plus a drop for every monster of its archetype).
 */
function monsterEvoTree(def: EnemyDef): EvoNode[] {
  const legacy = evoLegacy(def);
  const kind = ARCHETYPES[def.archetype].name;
  return EVO_TREES[def.archetype].map((n) =>
    n.id === 'capstone'
      ? {
          ...n,
          name: `${def.name} Legacy`,
          desc: `${n.desc} Legacy: every ${kind} (wherever it's hunted) has a small chance to also drop ${materialDef(legacy.material).name}.`,
          legacy,
        }
      : n,
  );
}

export const MONSTER_EVO_TREES = Object.fromEntries(ENEMIES.map((e) => [e.id, monsterEvoTree(e)])) as Record<EnemyId, EvoNode[]>;

export const evoNode = (id: EnemyId, node: string): EvoNode | undefined => MONSTER_EVO_TREES[id].find((n) => n.id === node);

/** Kills of a monster needed before each row of its evolution tree opens (root, branches, signature nodes, capstone). */
export const EVO_KILLS = [100, 1_000, 5_000, 20_000];

/** Kills of this monster needed for an evolution node: rarer monsters (lower spawn rates) need fewer. */
export function evoKillsNeeded(def: EnemyDef, node: EvoNode): number {
  const n = EVO_KILLS[Math.min(node.row, EVO_KILLS.length - 1)] * Math.min(1, def.spawn);
  const mag = 10 ** Math.max(0, Math.floor(Math.log10(n)) - 1);
  return Math.max(10, Math.round(n / mag) * mag); // two significant figures
}

// ---- Hunters: extra hunters you recruit and station in areas ----
export type HunterId =
  | 'alchemist'
  | 'glimmer'
  | 'ranger'
  | 'bard'
  | 'druid'
  | 'thief'
  | 'lance'
  | 'puppeteer'
  | 'blacksmith'
  | 'wilhelm'
  | 'celeste'
  | 'scavenger'
  | 'enchantress'
  | 'osteomancer'
  | 'frostbreaker'
  | 'bloodblade'
  | 'artificer'
  | 'archivist'
  | 'gambler'
  | 'spaceslime';

// ---- Damage types: every attack deals one. Weapons carry a type; without one, a Hunter uses their own. ----
export type DamageType = 'physical' | 'fire' | 'acid' | 'frost' | 'radiant' | 'poison' | 'arcane' | 'decay' | 'lightning' | 'void';

/**
 * Status effects: a hit of these types has a chance (the weapon's `proc`, or the Hunter's own without one) to:
 * Fire: burn (`share` of the hit again over `duration`). Poison: poison (the same, slower and longer).
 * Frost: chill (half speed). Acid: drop an acid puddle that hurts everything in it. Radiant: a radiant burst
 * around the target. Decay: a dark aura on the monster that hurts the monsters around it. Arcane: strip its
 * resistances for a while. Lightning: arc to another monster nearby, hurting everything on the way.
 * Void has no effect. New procs refresh rather than stack.
 */
export const STATUS = {
  /** Burns can spread: each tick, a `spreadChance` to ignite each monster within `spreadRadius` of its edge, at `spreadFalloff` strength. */
  burn: { share: 0.3, duration: 2, spreadChance: 0.1, spreadRadius: 18, spreadFalloff: 0.5 },
  /** Poison also deals `maxHp[rarity]` of the monster's max HP over its duration (by the weapon's rarity; ×`guardian` on Guardians). */
  poison: {
    share: 0.4,
    duration: 4,
    maxHp: { common: 0.01, uncommon: 0.015, rare: 0.02, veryRare: 0.025, legendary: 0.03, exotic: 0.035, relic: 0.04, artifact: 0.05, exalted: 0.06 } as Record<Rarity, number>,
    guardian: 0.1,
  },
  chill: { duration: 1.2 },
  /** Each tick hurts everything in the puddle for `share` of the hit. */
  acid: { share: 0.15, duration: 3, radius: 38 },
  burst: { share: 0.6, radius: 65 },
  /** Each tick the aura hurts monsters within `radius` of its bearer for `share` of the hit. */
  aura: { share: 0.12, duration: 4, radius: 55 },
  expose: { duration: 4 },
  /**
   * Lightning arcs from the monster it hits to another creature within `radius` of it (any one, at random),
   * dealing `share` of the hit to that creature and to every creature the arc passes through on the way.
   */
  arc: { share: 0.6, radius: 110 },
  /** Void opens a gravity well on the monster it hits: for `duration`s, monsters within `radius` are pulled toward it at `pull` units/s (Guardians and Void-resistant monsters hold their ground). */
  well: { duration: 1.5, radius: 95, pull: 150 },
  /**
   * Bleeding (Physical): `share` of the hit again over `duration`. The only effect that stacks: each bleed is
   * its own instance, up to `maxStacks` at once (a new one replaces the oldest).
   */
  bleed: { share: 0.25, duration: 3, maxStacks: 8 },
  /** Seconds between damage-over-time ticks. */
  tick: 0.5,
};
/** Rough extra damage each type's effect adds when it always procs, for the background model (scaled by proc chance). */
export const STATUS_MODEL: Partial<Record<DamageType, number>> = { physical: 1.25, fire: 1.4, poison: 1.5, acid: 1.4, radiant: 1.5, decay: 1.4, arcane: 1.1, lightning: 1.5, void: 1.15 };

/** How long a Hunter's attacks pause after their shield deflects a projectile (seconds). */
export const SHIELD_DEFLECT_PAUSE = 1;

/** Monsters that fly (or float): they pass over the battlefield's rocks, trees and coffins instead of going around. */
export const FLYING: ReadonlySet<EnemyId> = new Set<EnemyId>([
  'pixie', 'bat', 'graveWraith', 'crow', 'duskmoth', 'shadowWisp', 'gazingEye', 'frostSprite', 'wraith', 'harpy', 'snowOwl', 'griffin',
  'iceWyvern', 'cloudling', 'thunderbird', 'valkyrie', 'cometWisp', 'starEater', 'shade', 'watcher', 'voidWyrm', 'pixieQueen', 'beholdenWatcher',
]);

export const DAMAGE_TYPES: Record<DamageType, { name: string; icon: string; color: string; effect?: string }> = {
  physical: { name: 'Physical', icon: '🗡️', color: '#e8e8e8', effect: `Bleeds: ${STATUS.bleed.share * 100}% of the hit again over ${STATUS.bleed.duration}s; bleeds stack (up to ${STATUS.bleed.maxStacks})` },
  fire: { name: 'Fire', icon: '🔥', color: '#ff7a2a', effect: `Burns: ${STATUS.burn.share * 100}% of the hit again over ${STATUS.burn.duration}s, and can spread to monsters right next to it` },
  acid: { name: 'Acid', icon: '🧪', color: '#c6f03a', effect: `Acid puddle: hurts everything in it for ${STATUS.acid.duration}s` },
  frost: { name: 'Frost', icon: '❄️', color: '#8fdcff', effect: `Chills: half speed for ${STATUS.chill.duration}s` },
  radiant: { name: 'Radiant', icon: '✨', color: '#ffe36e', effect: `Radiant burst: ${STATUS.burst.share * 100}% of the hit to everything nearby` },
  poison: { name: 'Poison', icon: '☠️', color: '#6fdc5a', effect: `Poisons: ${STATUS.poison.share * 100}% of the hit again over ${STATUS.poison.duration}s, plus a share of its max HP (more from rarer weapons, less on Guardians)` },
  arcane: { name: 'Arcane', icon: '🔮', color: '#c08cff', effect: `Exposes: removes its resistances for ${STATUS.expose.duration}s` },
  decay: { name: 'Decay', icon: '🍂', color: '#b09a60', effect: `Dark aura: it hurts the monsters around it for ${STATUS.aura.duration}s` },
  lightning: { name: 'Lightning', icon: '⚡', color: '#8fb4ff', effect: `Arcs: ${STATUS.arc.share * 100}% of the hit jumps to another creature nearby, striking everything it passes through` },
  void: { name: 'Void', icon: '🌀', color: '#ff5fd7', effect: `Gravity well: for ${STATUS.well.duration}s it pulls the monsters around it in toward itself` },
};

/**
 * A Guild Hunter's signature ability, used on a cooldown alongside the attacks of the weapon they hold:
 * Andrejz's potions, Glimmer's fireballs, Deku's wolves, Theon's puppets. Its damage per hit is `damage` ×
 * their shot damage (so their weapon powers it); its radius is `radius` × (1 + their weapon's attack rate).
 * `ticks` is how many times it hits (a puddle ticks), and `crowd` how many monsters it typically catches, for
 * the background model. Summons copy the weapon's damage type and status effects; the others keep their own.
 */
export interface HunterSpecial {
  kind: 'potion' | 'fireball' | 'summon' | 'punch' | 'spikes' | 'wave' | 'recall' | 'dice' | 'charm';
  /** What it's called on the Hunter's card ("Potions", "Wolves"...). */
  name: string;
  damageType: DamageType;
  /** Chance it triggers its type's status effect (summons use their weapon's). */
  proc?: number;
  cooldown: number;
  damage: number;
  radius: number;
  ticks: number;
  crowd: number;
  summon?: { look: 'wolf' | 'puppet'; type: SummonType };
  /** Punches: how hard they knock monsters back (Guardians hold their ground) and how wide the blow is, in radians. */
  knock?: number;
  arc?: number;
  /** Bone spikes: seconds the monsters they hit are held in place (Guardians a quarter as long). */
  hold?: number;
  /** Crimson Wave: how wide the surge is (it runs `radius` long). */
  width?: number;
  describe: string;
}

export interface HunterDef {
  id: HunterId;
  name: string;
  title: string;
  icon: string;
  color: string;
  /** Their home area (shown on their card). */
  area: AreaId;
  /** Becomes available to recruit after completing this event of their area this many times. */
  unlock: { event: string; times: number };
  /** Shown on their card while locked: where they are and what it takes to win them over. */
  story: string;
  /** Their title after ascending. */
  ascendedTitle: string;
  recruitCost: number;
  /** Their signature ability on a cooldown (they otherwise fight with their weapon's attacks). */
  special?: HunterSpecial;
  /** Wilhelm: switches to his short-range weapon when a monster is this close. */
  swapRange?: number;
  /** Damage multiplier against one archetype. */
  bane?: { archetype: Archetype; mult: number };
  /** Multipliers on gold / material drops from their kills. */
  gold?: number;
  drops?: number;
  /** One line for their card in the Hunters tab; `ability` is the full text in their expanded view. */
  short: string;
  /** Short description of what makes them special, shown on their card. */
  ability: string;
  /** Their summons of this type hit this much harder (Deku's Beasts, Theon's Constructs), whatever summoned them. */
  summonBonus?: { type: SummonType; mult: number };
  /** Their song: every other Hunter fighting in the same area attacks this much faster (Ba'al). */
  inspire?: number;
  /** Wherever they're stationed, every kill there pays this much more gold, and loot drops this much more often (Alias). */
  areaGold?: number;
  areaLoot?: number;
  /**
   * Reginald the Artificer: every Hunter in his area (him included) uses their gear as if it had this many more
   * stars; a piece already at 5★ gets what the stars past it would give (see the 6★ entries of the star tables).
   */
  tinker?: number;
  /**
   * Ted the Gambler's Double or Nothing: every kill in his area has a `double` chance to pay twice the gold and
   * materials, and a `bust` chance to pay nothing (Guardians excepted).
   */
  gamble?: { double: number; bust: number };
  /** Equipment slots (defaults to Weapon, Armor, Accessory). */
  slots?: SlotDef[];
  /**
   * Gideon's Bone Wall: when he's stunned, a ring of bone rises around every Hunter for `duration` seconds and no
   * monster can get through it (they crowd at the wall). Its own cooldown; his spikes wait while it stands.
   */
  wall?: { name: string; cooldown: number; duration: number; radius: number; describe: string };
}

/**
 * Area effects grow with a Hunter's level: +3% per level (×1.75 at Lv 26, ×2.5 at Lv 51, ×7 at Lv 200), which keeps
 * pace with the later areas' wider views as a typical player levels, and keeps growing past them.
 */
export const AOE_PER_LEVEL = 0.03;

/** Every Hunter's base range with a shooting weapon (scaled by its class), in world units. */
export const MAIN_RANGE = 250;
/** How far the battlefield is zoomed out: 0.6 = everything drawn at 60% size, so you see more of the field. */
export const FIELD_ZOOM = 0.6;
/** Each area's battlefield is this much bigger than the Wandering Woods', per area after it. */
export const AREA_GROWTH = 0.1;
/**
 * How big an area's battlefield is next to the Wandering Woods': 10% more per area (the Fey Grove 110%,
 * the Meteor Field 200%). The view zooms out to fit it, so Hunters and monsters are drawn smaller.
 */
export const areaScale = (area: AreaId): number => 1 + AREA_GROWTH * Math.max(0, AREAS.findIndex((a) => a.id === area));
/**
 * From the Shadowy Depths on, the view zooms out this much further (on top of each area's growth): the Hunters
 * are drawn smaller, with open ground round them for the monsters that keep their distance and shoot.
 */
export const DEEP_ZOOM_OUT = 0.6;
/** How much more of the field an area's view shows than the Woods' (its size, and the Depths' extra step on). */
export const viewScale = (area: AreaId): number => areaScale(area) + (AREAS.findIndex((a) => a.id === area) >= AREAS.findIndex((a) => a.id === 'depths') ? DEEP_ZOOM_OUT : 0);
/** The battlefield's zoom in an area. */
export const fieldZoom = (area: AreaId): number => FIELD_ZOOM / viewScale(area);
/** Seconds for a Paladin-style guard to regain one charge. */
export const GUARD_RECHARGE = 4;

export const HUNTERS: HunterDef[] = [
  {
    id: 'alchemist', name: 'Andrejz', title: 'Alchemist', icon: '⚗️', color: '#7be07b', area: 'forest', recruitCost: 150, bane: { archetype: 'slime', mult: 3 },
    short: 'Lobs poison potions; slays Slimes.',
    unlock: { event: 'slimeSwarm', times: 1 },
    ascendedTitle: 'Archalchemist',
    story: "Andrejz is in the Wandering Woods doing research on Slimes, with an idea for a new potion, but he needs far more test subjects than he can catch. Survive a Slime Swarm, and Andrejz will help you hunt monsters.",
    ability: 'Every 4s, lobs a potion that leaves a poison puddle. Deals triple damage to Slimes. Uses ranged or magic weapons.',
    slots: [{ kind: 'weapon', label: 'Weapon', accepts: ['weapon', 'magic'] }, { kind: 'armor', label: 'Armor' }, { kind: 'accessory', label: 'Accessory' }],
    special: { kind: 'potion', name: 'Potions', damageType: 'poison', cooldown: 4, damage: 0.35, radius: 45, ticks: 6, crowd: 2.5, describe: 'Every 4s, lobs a potion whose poison puddle keeps hurting: his weapon\'s damage powers it, its attack rate widens the puddle.' },
  },
  {
    id: 'ranger', name: 'Galladair', title: 'Ranger', icon: '🏹', color: '#c09060', area: 'forest', recruitCost: 2_000, bane: { archetype: 'beast', mult: 3 },
    short: 'Triple damage to Beasts.',
    unlock: { event: 'guardian-forest', times: 1 },
    ascendedTitle: 'Pathfinder',
    story: 'Galladair\'s home on the edge of the Wandering Woods is being threatened by monsters. Help her defeat the Woods\' Guardian, and she will fight by your side.',
    ability: 'Deals triple damage to Beasts.',
  },
  {
    id: 'bard', name: "Ba'al", title: 'Bard', icon: '🪕', color: '#e0a0ff', area: 'glade', recruitCost: 40_000, bane: { archetype: 'humanoid', mult: 3 },
    short: 'His song speeds up nearby Hunters.',
    unlock: { event: 'guardian-glade', times: 1 },
    ascendedTitle: 'Maestro',
    inspire: 0.15,
    story: "Ba'al wandered into the Fey Grove chasing a melody only the pixies hum, and the Grove's Guardian won't let him leave. Beat it, and his songs are yours.",
    ability: 'His song makes every other Hunter in his area attack 15% faster. Deals triple damage to Humanoids.',
  },
  {
    id: 'druid', name: 'Deku', title: 'Druid', icon: '🌿', color: '#6abf5a', area: 'glade', recruitCost: 250_000, bane: { archetype: 'plant', mult: 3 }, summonBonus: { type: 'beast', mult: 1.5 },
    short: 'Summons wolves to fight for him.',
    unlock: { event: 'guardian-glade', times: 2 },
    ascendedTitle: 'Archdruid',
    story: 'Deku tends the oldest trees of the Fey Grove, and the Guardian keeps trampling his saplings. Beat it twice, and he\'ll lend you the spirits of the wild.',
    ability: 'Every 6s calls two spirit wolves to hunt. Deals triple damage to Plants, and his Beast summons (wolves from any source) hit 50% harder. Uses ranged or magic weapons.',
    slots: [{ kind: 'weapon', label: 'Weapon', accepts: ['weapon', 'magic'] }, { kind: 'armor', label: 'Armor' }, { kind: 'accessory', label: 'Accessory' }],
    special: { kind: 'summon', name: 'Wolves', damageType: 'physical', cooldown: 6, damage: 0.7, radius: 1, ticks: 18, crowd: 1, summon: { look: 'wolf', type: 'beast' }, describe: 'Every 6s calls two spirit wolves that hunt for 6s, biting for his damage: his weapon powers them, and they share its damage type and status effects.' },
  },
  {
    id: 'thief', name: 'Alias', title: 'Thief', icon: '🦹', color: '#8a8aa8', area: 'graveyard', recruitCost: 60_000_000,
    short: 'More gold and loot where he hunts.',
    unlock: { event: 'guardian-graveyard', times: 1 },
    ascendedTitle: 'Master Thief',
    areaGold: 0.3,
    areaLoot: 1,
    story: "Alias has been robbing the Restless Graveyard's tombs, but its Guardian guards the best of them. Beat it, and he'll share the take.",
    ability: 'Wherever he is, monsters pay 30% more gold and drop loot twice as often.',
  },
  {
    id: 'lance', name: 'Lance', title: 'Paladin', icon: '🛡️', color: '#ffe8a3', area: 'graveyard', recruitCost: 200_000_000,
    short: 'Takes extra hits and shields allies.',
    unlock: { event: 'guardian-graveyard', times: 2 },
    ascendedTitle: 'Crusader',
    story: 'Lance swore to guard the Restless Graveyard\'s gates until its Guardian falls twice. Help him keep his oath, and his shield is yours.',
    ability: 'Can take multiple hits before being knocked out (Zone of Protection), and grants other Hunters an extra hit as well (Rallying Oath).',
    slots: [{ kind: 'melee', label: 'Melee' }, { kind: 'armor', label: 'Armor' }, { kind: 'accessory', label: 'Accessory' }],
  },
  {
    id: 'glimmer', name: 'Glimmer', title: 'Wizard', icon: '🧙', color: '#b07cff', area: 'crypt', recruitCost: 300_000_000_000,
    short: 'Hurls exploding fireballs.',
    unlock: { event: 'guardian-crypt', times: 1 },
    ascendedTitle: 'Archmage',
    story: 'Glimmer came to the Forbidden Crypt to study the old magic sealed inside, but its Guardian won\'t let anyone near. Put it to rest, and Glimmer will lend you a fireball or two.',
    ability: 'Every 4s, hurls a fireball that explodes for area damage. Wields only magic weapons.',
    slots: [{ kind: 'magic', label: 'Magic weapon' }, { kind: 'armor', label: 'Robe', armorTypes: ['robe'] }, { kind: 'accessory', label: 'Accessory' }],
    special: { kind: 'fireball', name: 'Fireballs', damageType: 'fire', proc: 1, cooldown: 4, damage: 1.75, radius: 55, ticks: 1, crowd: 3, describe: 'Every 4s hurls a fireball that explodes: his weapon\'s damage powers the blast, its attack rate widens it.' },
  },  {
    id: 'puppeteer', name: 'Theon', title: 'Puppeteer', icon: '🎎', color: '#c89a6a', area: 'crypt', recruitCost: 1_000_000_000_000, summonBonus: { type: 'construct', mult: 1.5 },
    short: 'Summons puppets to fight for her.',
    unlock: { event: 'guardian-crypt', times: 2 },
    ascendedTitle: 'Grand Puppeteer',
    story: "Theon pulls the strings of the Forbidden Crypt's Possessed Puppets, or tries to: something in the dark keeps cutting them. Beat the Crypt's Guardian twice, and her puppets will dance for you.",
    ability: 'Every 6s calls two puppets that hunt across the field. Her Construct summons (puppets from any source) hit 50% harder. Uses magic or melee weapons.',
    slots: [{ kind: 'magic', label: 'Weapon', accepts: ['magic', 'melee'] }, { kind: 'armor', label: 'Armor' }, { kind: 'accessory', label: 'Accessory' }],
    special: { kind: 'summon', name: 'Puppets', damageType: 'physical', cooldown: 6, damage: 0.7, radius: 1, ticks: 18, crowd: 1, summon: { look: 'puppet', type: 'construct' }, describe: 'Every 6s calls two puppets that hunt for 6s, biting for her damage: her weapon powers them, and they share its damage type and status effects.' },
  },

  {
    id: 'wilhelm', name: 'Wilhelm', title: 'Sniper', icon: '🎯', color: '#9aa7b8', area: 'depths', recruitCost: 100_000_000_000_000,
    short: 'Swaps guns when monsters get close.',
    unlock: { event: 'guardian-depths', times: 1 },
    ascendedTitle: 'Deadeye',
    story: '“I was hunting a creature with a hundred eyes, but after shooting 99 of them, it got away. Help me track it down in the Shadowy Depths.”',
    ability: 'Carries a long-range weapon and a short-range one, and switches to the short-range one when monsters get close.',
    slots: [
      { kind: 'weapon', label: 'Long-range', role: 'long' },
      { kind: 'weapon', label: 'Short-range', role: 'short' },
      { kind: 'armor', label: 'Armor' },
    ],
    swapRange: 90,
  },
  {
    id: 'celeste', name: 'Celeste', title: 'Psion', icon: '🔮', color: '#c9a8ff', area: 'depths', recruitCost: 200_000_000_000_000, bane: { archetype: 'dragon', mult: 3 },
    short: 'Triple damage to Dragons.',
    unlock: { event: 'guardian-depths', times: 2 },
    ascendedTitle: 'Oracle',
    story: 'Celeste, a Psion who hears the thoughts of monsters, followed a whisper into the Shadowy Depths and got lost in the noise. Beat the Depths\' Guardian twice to quiet it, and Celeste will lend you that mind.',
    ability: 'Deals triple damage to Dragons.',
  },
  {
    id: 'blacksmith', name: 'Kargesh', title: 'Blacksmith', icon: '⚒️', color: '#d07a3a', area: 'caves', recruitCost: 3e15,
    short: 'Refines gear with new stats.',
    unlock: { event: 'guardian-caves', times: 1 },
    ascendedTitle: 'Master Smith',
    story: "Kargesh keeps a forge deep in the Ember Mines, fed by the heat of the Demon Lord's lair. Beat the Mines' Guardian, and he'll bring his anvil to the guild.",
    ability: 'Unlocks Refine in Equipment: add stat modifiers (attack speed, damage, knockback, piercing, magazine size) to Very Rare and rarer gear. Fights with melee weapons.',
    slots: [{ kind: 'melee', label: 'Melee' }, { kind: 'armor', label: 'Armor' }, { kind: 'accessory', label: 'Accessory' }],
  },
  {
    // Sciirj replaced Pip the Scavenger; the id stays 'scavenger' so saves keep his recruit, levels and gear.
    id: 'scavenger', name: 'Sciirj', title: 'Monk', icon: '👊', color: '#e0703a', area: 'caves', recruitCost: 1.2e16,
    short: 'Punches monsters across the field.',
    unlock: { event: 'guardian-caves', times: 2 },
    ascendedTitle: 'Grandmaster',
    story: 'Sciirj trains in the heat of the Ember Mines, punching stone until the stone gives first. Beat its Guardian twice, and he\'ll lend you his fists.',
    ability: 'Every 5s, throws a massive punch that hits every monster in front of him and sends them flying. Fights with melee weapons.',
    special: { kind: 'punch', name: 'Mountain Fist', damageType: 'physical', cooldown: 5, damage: 3, radius: 95, ticks: 1, crowd: 2.5, knock: 700, arc: 1.6, describe: 'Every 5s, when a monster is close, throws a massive punch that hits everything in front of him and knocks it far back: his weapon\'s damage powers the blow, its attack rate lengthens his reach.' },
    slots: [{ kind: 'melee', label: 'Melee' }, { kind: 'armor', label: 'Armor' }, { kind: 'accessory', label: 'Accessory' }],
  },
  {
    id: 'enchantress', name: 'Marceline', title: 'Enchantress', icon: '✨', color: '#c47cff', area: 'mines', recruitCost: 6e17,
    short: 'Enchants gear with new powers.',
    unlock: { event: 'guardian-mines', times: 1 },
    ascendedTitle: 'Archenchantress',
    story: "Marceline came to the Venom Caverns for the venom-bright crystals that hold an enchantment best, and the Caverns' Guardian has kept her pinned in the dark ever since. Beat it, and she'll put her runes on your gear.",
    ability: 'Unlocks Enchant in Equipment: add damage types, stronger status effects and abilities to Very Rare and rarer gear. Fights with magic weapons.',
    slots: [{ kind: 'magic', label: 'Magic weapon' }, { kind: 'armor', label: 'Armor' }, { kind: 'accessory', label: 'Accessory' }],
  },
  {
    id: 'osteomancer', name: 'Gideon', title: 'Osteomancer', icon: '🦴', color: '#e8dcc0', area: 'mines', recruitCost: 4e18,
    short: 'Raises bone spikes and bone walls.',
    unlock: { event: 'guardian-mines', times: 2 },
    ascendedTitle: 'Bonelord',
    story: "Gideon came to the Venom Caverns for the bones of the things that died there, and there are a great many. Beat the Caverns' Guardian twice, and he'll raise them for you.",
    ability: 'Every 5s, bone spikes burst from the ground under a group of monsters, hurting them and holding them in place. When he is stunned, a Bone Wall rises around every Hunter for a few seconds. Uses magic weapons.',
    special: { kind: 'spikes', name: 'Bone Spikes', damageType: 'physical', cooldown: 5, damage: 1.6, radius: 60, ticks: 1, crowd: 3, hold: 1.5, describe: 'Every 5s, bone spikes burst up under the nearest monster, hurting everything around it and holding it in place for 1.5s: his weapon\'s damage powers them, its attack rate widens them. Not while his Bone Wall stands.' },
    wall: { name: 'Bone Wall', cooldown: 25, duration: 4, radius: 70, describe: 'When he is stunned, a wall of bone rises around every Hunter for 4s: no monster can reach them. Ready again 25s later.' },
    slots: [{ kind: 'magic', label: 'Magic weapon' }, { kind: 'armor', label: 'Armor' }, { kind: 'accessory', label: 'Accessory' }],
  },
  {
    id: 'frostbreaker', name: 'Okrin', title: 'Frostbreaker', icon: '🔨', color: '#8fdcff', area: 'peaks', recruitCost: 2.5e19, bane: { archetype: 'elemental', mult: 3 },
    short: 'Triple damage to Elementals.',
    unlock: { event: 'guardian-peaks', times: 1 },
    ascendedTitle: 'Winterking',
    story: 'Okrin climbed the Frost Peaks to hunt the thing that rules them. Defeat the Peaks\' Guardian, and he\'ll bring his hammer to your side.',
    ability: 'Deals triple damage to Elementals.',
  },
  {
    id: 'bloodblade', name: 'Themus', title: 'Blood Blade', icon: '🩸', color: '#c0242c', area: 'peaks', recruitCost: 1.5e20,
    short: 'Waves of blood that make monsters bleed.',
    unlock: { event: 'guardian-peaks', times: 2 },
    ascendedTitle: 'Crimson Lord',
    story: "Themus walks the Frost Peaks, where blood freezes before it can fall. Beat the Peaks' Guardian twice, and his blade is yours.",
    ability: 'Every 5s, sends a Crimson Wave of blood surging toward the monsters, hurting everything it passes and making it bleed. Once his tree is complete, monsters it kills burst into blood bolts. Fights with melee weapons.',
    special: { kind: 'wave', name: 'Crimson Wave', damageType: 'physical', cooldown: 5, damage: 1.4, radius: 200, width: 26, ticks: 1, crowd: 3, describe: 'Every 5s, a surge of blood rushes out toward the nearest monster, hurting everything in its path and making it bleed: his weapon\'s damage powers it, its attack rate lengthens it. With Blood Rain (his capstone), monsters it kills burst into blood bolts that seek out others and make them bleed too.' },
    slots: [{ kind: 'melee', label: 'Melee' }, { kind: 'armor', label: 'Armor' }, { kind: 'accessory', label: 'Accessory' }],
  },
  {
    id: 'artificer', name: 'Reginald', title: 'Artificer', icon: '⚙️', color: '#d8b060', area: 'cliffs', recruitCost: 4e21,
    short: "Every Hunter's gear works a star better beside him.",
    unlock: { event: 'harpyStorm', times: 1 },
    ascendedTitle: 'Grand Artificer',
    tinker: 1,
    story: "Reginald climbed the Ascendant Steps to study the Sky Golems' clockwork, and the harpies won't leave his instruments alone. Drive off a Harpy Storm, and he'll tune your gear in return.",
    ability: "Every Hunter in his area, him included, uses their gear as if it had one more star; gear already at 5★ gets the bonus a 6th star would give. Uses any weapon.",
    slots: [{ kind: 'weapon', label: 'Weapon', accepts: ['weapon', 'magic', 'melee'] }, { kind: 'armor', label: 'Armor' }, { kind: 'accessory', label: 'Accessory' }],
  },
  {
    id: 'archivist', name: 'Thomas', title: 'Archivist', icon: '📖', color: '#c9b8ff', area: 'cliffs', recruitCost: 1.6e22,
    short: "His tome recalls other Hunters' specials.",
    unlock: { event: 'harpyStorm', times: 2 },
    ascendedTitle: 'Loremaster',
    story: "Thomas came to the Ascendant Steps to copy the sky-script carved into its stairs, but the harpies keep scattering his pages. Drive off two Harpy Storms, and his library is yours.",
    ability: "Every 6s, his tome opens somewhere on the field and another Hunter's special bursts from it: usually one of the Hunters fighting beside him, sometimes any Hunter you've recruited. Wields only magic weapons.",
    slots: [{ kind: 'magic', label: 'Magic weapon' }, { kind: 'armor', label: 'Armor' }, { kind: 'accessory', label: 'Accessory' }],
    special: {
      kind: 'recall',
      name: 'Recall',
      damageType: 'arcane',
      cooldown: 6,
      damage: 1,
      radius: 1,
      ticks: 2,
      crowd: 2.5,
      describe: "Every 6s a tome opens somewhere on the field and casts a copy of another Hunter's special at the monsters near it, powered by his weapon (its attack rate makes the copy bigger). 85% of the time it's the special of a Hunter fighting in his area; otherwise any recruited Hunter's. Only active specials (no passives like Reginald's or Alias's).",
    },
  },
  {
    id: 'gambler', name: 'Ted', title: 'Gambler', icon: '🎲', color: '#e0c060', area: 'fortress', recruitCost: 8e22,
    short: 'Rolls dice for big blasts; kills near him pay double or nothing.',
    unlock: { event: 'cloudburst', times: 1 },
    ascendedTitle: 'High Roller',
    gamble: { double: 0.25, bust: 0.1 },
    story: "Ted runs the only card table in the Cloud Fortress, and the storm keeps blowing his chips off it. Weather a Cloudburst, and he'll bet on you instead.",
    ability: 'Every 5s, rolls two dice at the monsters: the higher the total, the bigger the blast; doubles hit twice as hard, double 6s hit the whole field, and snake eyes leave him dazed. Kills in his area pay double (25%) or nothing (10%). Uses any weapon.',
    slots: [{ kind: 'weapon', label: 'Weapon', accepts: ['weapon', 'magic', 'melee'] }, { kind: 'armor', label: 'Armor' }, { kind: 'accessory', label: 'Accessory' }],
    special: {
      kind: 'dice',
      name: 'Roll the Dice',
      damageType: 'physical',
      cooldown: 5,
      damage: 1.2,
      radius: 60,
      ticks: 1,
      crowd: 3,
      describe: "Every 5s, throws two dice at the monsters, powered by his weapon (its attack rate widens the blasts). 2 (snake eyes): nothing, and he's dazed for a moment. 3-4: one monster takes a hit. 5-9: a blast. 10-11: a bigger blast. 12 (double 6s): the whole field. Other doubles hit twice as hard, and his crit chance can re-roll his lower die.",
    },
  },
  {
    id: 'spaceslime', name: 'Norm', title: 'Space Slime', icon: '🌌', color: '#c88aff', area: 'meteors', recruitCost: 1.6e24,
    short: 'Charms monsters into fighting each other.',
    unlock: { event: 'meteorShower', times: 1 },
    ascendedTitle: 'Cosmic Charmer',
    story: "Norm fell to the Meteor Field inside a meteorite and has been talking his way out of trouble ever since. Ride out a Meteor Shower with him, and he'll talk the monsters into fighting for you.",
    ability: "Every 6s, sweet-talks the monster nearest him (Guardians aren't fooled): it turns pink and, for 6s, hunts the nearest other monster instead of your Hunters, biting it for a quarter of its own health every second. Uses ranged or magic weapons.",
    slots: [{ kind: 'weapon', label: 'Weapon', accepts: ['weapon', 'magic'] }, { kind: 'armor', label: 'Armor' }, { kind: 'accessory', label: 'Accessory' }],
    special: {
      kind: 'charm',
      name: 'Smooth Talk',
      damageType: 'physical',
      cooldown: 6,
      damage: 0.25,
      radius: 110,
      ticks: 6,
      crowd: 4,
      describe: "Every 6s, charms the monster nearest him within reach (his weapon's attack rate and area size widen it; Guardians are immune). For 6s it turns on the nearest other monster, biting it every second for 25% of its own max health, and your Hunters leave it be.",
    },
  },
];

export const hunterDef = (id: HunterId): HunterDef => HUNTERS.find((h) => h.id === id)!;

export function hunterPerk(h: HunterDef): string {
  const parts: string[] = [];
  if (h.bane) parts.push(`×${h.bane.mult} damage vs ${ARCHETYPES[h.bane.archetype].name}`);
  if (h.gold) parts.push(`+${Math.round((h.gold - 1) * 100)}% gold`);
  if (h.drops) parts.push(`+${Math.round((h.drops - 1) * 100)}% drops`);
  if (h.summonBonus) parts.push(`×${h.summonBonus.mult} damage from ${SUMMON_TYPES[h.summonBonus.type].name} summons`);
  if (h.inspire) parts.push(`+${Math.round(h.inspire * 100)}% attack rate to Hunters beside him`);
  if (h.areaGold) parts.push(`+${Math.round(h.areaGold * 100)}% gold in his area`);
  if (h.areaLoot) parts.push(`×${1 + h.areaLoot} loot in his area`);
  if (h.gamble) parts.push(`kills in his area pay double (${Math.round(h.gamble.double * 100)}%) or nothing (${Math.round(h.gamble.bust * 100)}%)`);
  if (h.tinker) parts.push(`+${h.tinker}★ to the gear of every Hunter in his area`);
  return parts.join(', ');
}

/** Your own Hunter's card blurb. */
export const MAIN_ABILITY = 'Tap the Battle Field to damage Monsters!';
/** Your Hunter's one line on their card. */
export const MAIN_SHORT = 'Tap the field to blast monsters.';

/** Hunters fire a little slower than you and train with gold. */
export const HELPER_FIRE_RATE = 1.2;
export const HELPER_TRAIN_GROWTH = 1.085;
/** From Lv 30 on, each Guild Hunter session costs this much more than the last (as for your Hunter). */
export const HELPER_TAPER_LEVEL = 30;
export const HELPER_TAPER_GROWTH = 1.03;
/** Sessions it takes to reach HELPER_TAPER_LEVEL. */
export const HELPER_TAPER_SESSIONS = Array.from({ length: HELPER_TAPER_LEVEL - 1 }, (_, i) => trainsForLevel(i + 1)).reduce((a, b) => a + b, 0);

/**
 * Cost of `count` Guild Hunter sessions after `done` of them: ×HELPER_TRAIN_GROWTH per session until Lv 30,
 * then ×HELPER_TAPER_GROWTH. Counted in sessions, so it carries on unchanged through Ascension.
 */
export function helperBulkCost(base: number, done: number, count: number): number {
  return taperedBulkCost(base, HELPER_TRAIN_GROWTH, HELPER_TAPER_GROWTH, done, count);
}

/** How many Guild Hunter sessions `gold` buys after `done` (at most `limit`). */
export function helperMaxAffordable(base: number, done: number, gold: number, limit: number): number {
  return affordableCount((n) => helperBulkCost(base, done, n), gold, limit);
}

/** Cost of a Guild Hunter's first training session (then × HELPER_TRAIN_GROWTH each, tapering past Lv 30). */
export const helperTrainCost = (h: HunterDef): number => Math.ceil(Math.max(10, h.recruitCost * 0.05));
/** Stationed Hunters earn at this fraction of their full rate (they don't tap, but they never get stunned). */
/** Hunters that can be stationed in one area (besides yours). */
export const STATION_CAPACITY = 3;
export const STATION_EFFICIENCY = 0.8;

// ---- Equipment: crafted into the inventory, equipped into Hunters' slots ----
export type GearKind = 'weapon' | 'melee' | 'magic' | 'armor' | 'accessory';

/** 'weapon' is a ranged weapon (bows, crossbows, rifles). */
export const GEAR_KINDS: Record<GearKind, { name: string; icon: string }> = {
  weapon: { name: 'Ranged weapon', icon: '🏹' },
  melee: { name: 'Melee weapon', icon: '⚔️' },
  magic: { name: 'Magic weapon', icon: '🪄' },
  armor: { name: 'Armor', icon: '🦺' },
  accessory: { name: 'Accessory', icon: '💍' },
};

export interface SlotDef {
  kind: GearKind;
  label: string;
  /** Wilhelm's weapon slots: 'long' is his usual weapon, 'short' the one he switches to up close. */
  role?: 'long' | 'short';
  /** Kinds the slot takes, when more than its own `kind` (Andrejz's weapon slot takes ranged or magic). */
  accepts?: GearKind[];
  /** Armor slots that only take some kinds of armor (Glimmer wears robes). */
  armorTypes?: ArmorType[];
}

/** Can this piece go in this slot? */
export const slotAccepts = (slot: SlotDef, def: Pick<GearDef, 'kind' | 'armorType'>): boolean =>
  (slot.accepts ?? [slot.kind]).includes(def.kind) && (!slot.armorTypes || !def.armorType || slot.armorTypes.includes(def.armorType));

// ---- Summons: every summoned creature has a type, which some Hunters are better at commanding ----
export type SummonType = 'beast' | 'construct' | 'spirit' | 'undead' | 'elemental';
export const SUMMON_TYPES: Record<SummonType, { name: string; icon: string }> = {
  beast: { name: 'Beast', icon: '🐺' },
  construct: { name: 'Construct', icon: '🪆' },
  spirit: { name: 'Spirit', icon: '👻' },
  undead: { name: 'Undead', icon: '💀' },
  elemental: { name: 'Elemental', icon: '🌪️' },
};

// ---- Armor: four kinds, each trading attack speed, damage and shield charges differently ----
export type ArmorType = 'light' | 'heavy' | 'robe' | 'shield';

/**
 * Each kind of armor has a stat profile (what its stats lean toward) and a fixed penalty that never grows
 * with stars: Light is quick, Heavy shrugs off hits but slows you, Robes channel power, Shields block.
 */
export const ARMOR_TYPES: Record<ArmorType, { name: string; icon: string; desc: string; penalty: Partial<Record<GearStat, number>> }> = {
  light: { name: 'Light armor', icon: '🥋', desc: 'Quick and free: more attack speed and a little damage.', penalty: {} },
  heavy: { name: 'Heavy armor', icon: '🪖', desc: 'Shrugs off hits: shield charges and shorter stuns, but slower attacks.', penalty: { rate: -0.1 } },
  robe: { name: 'Robe', icon: '👘', desc: 'Channels power: more damage and bigger area effects, but no shield.', penalty: {} },
  shield: { name: 'Shield', icon: '🛡️', desc: 'Blocks: the most shield charges, but a little less damage.', penalty: { damage: -0.08 } },
};

/** Armor stats at 1★ by kind and area tier (1 = Wandering Woods … 12 = Void Rift). */
export function armorStats(type: ArmorType, tier: number): Partial<Record<GearStat, number>> {
  const m = 1 + 0.25 * (tier - 1);
  const r = (v: number) => Math.round(v * m * 1000) / 1000;
  switch (type) {
    case 'light':
      return { rate: r(0.02), damage: r(0.01), stun: r(0.02) };
    case 'heavy':
      return { guard: tier >= 6 ? 2 : 1, stun: r(0.04), damage: r(0.01) };
    case 'robe':
      return { damage: r(0.03), radius: r(0.02) };
    case 'shield':
      return { guard: tier >= 6 ? 3 : 2, stun: r(0.02) };
  }
}

/**
 * Special effects on rarer armor and on accessories. Abilities that deal damage have their own base damage
 * (`base`, ×WEAPON_HIT_POWER for the piece's stars), multiplied by the wearer's own bonuses (training,
 * skills, Upgrades, % damage) but never by their weapon's damage.
 *  Armor:  thorns (monsters that reach you take damage), block (a shield block bursts out), evade (a chance to
 *          slip a monster entirely), pulse (a burst around you every few seconds).
 *  Accessories only: summon (creatures of their own, like a tome's), wave (melee attacks send out a wave),
 *          strike (lightning from above), chill (an aura that slows every monster near you).
 */
export type GearEffect =
  | { kind: 'thorns'; base: number; damageType: DamageType; chance?: number }
  | { kind: 'block'; base: number; damageType: DamageType; radius: number; chance?: number }
  | { kind: 'evade'; chance: number }
  | { kind: 'pulse'; base: number; damageType: DamageType; radius: number; cooldown: number }
  | { kind: 'summon'; base: number; damageType: DamageType; look: 'puppet'; type: SummonType; name: string; count: number; duration: number; cooldown: number; bites: number; speed: number }
  | { kind: 'wave'; base: number; damageType: DamageType; radius: number; chance: number }
  | { kind: 'strike'; base: number; damageType: DamageType; targets: number; cooldown: number; range: number }
  | { kind: 'chill'; radius: number }
  /** A spell (SPELLS) cast at the nearest monster: a Spell enchantment's, at its own base damage. */
  | { kind: 'spell'; spell: SpellId; base: number; damageType: DamageType };

/** Effects that recharge (and get a cooldown icon on the battlefield). */
export const effectCooldown = (e: GearEffect): number | null => ('cooldown' in e ? e.cooldown : null);

/** A piece's ability base damage at its stars. */
export const effectBase = (e: GearEffect, stars: number): number => ('base' in e ? e.base * WEAPON_HIT_POWER[Math.max(1, Math.min(MAX_EFFECTIVE_STARS, stars))] : 0);

/** Weapon kinds: a Hunter's weapon slot powers their special attack. */
export const WEAPON_KINDS: GearKind[] = ['weapon', 'melee', 'magic'];

/** Your Hunter's slots: the weapon slot takes any weapon (ranged, melee or magic). */
export const MAIN_SLOTS: SlotDef[] = [
  { kind: 'weapon', label: 'Weapon', accepts: ['weapon', 'melee', 'magic'] },
  { kind: 'armor', label: 'Armor' },
  { kind: 'accessory', label: 'Accessory' },
];

export const DEFAULT_SLOTS: SlotDef[] = [
  { kind: 'weapon', label: 'Weapon' },
  { kind: 'armor', label: 'Armor' },
  { kind: 'accessory', label: 'Accessory' },
];

/** What a piece of gear can modify. Values are per gear level. */
export type GearStat = 'damage' | 'rate' | 'range' | 'crit' | 'stun' | 'guard' | 'gold' | 'drops' | 'radius' | 'pierce';

export const GEAR_STATS: Record<GearStat, (v: number) => string> = {
  damage: (v) => `+${Math.round(v * 100)}% damage`,
  rate: (v) => `+${Math.round(v * 100)}% attack rate`,
  range: (v) => `+${Math.round(v)} range`,
  crit: (v) => `+${Math.round(v * 100)}% crit`,
  stun: (v) => `−${Math.round(v * 100)}% stun time`,
  guard: (v) => `+${Math.floor(v)} shield`,
  gold: (v) => `+${Math.round(v * 100)}% gold`,
  drops: (v) => `+${Math.round(v * 100)}% drops`,
  radius: (v) => `+${Math.round(v * 100)}% area size`,
  pierce: (v) => `+${Math.floor(v)} pierce`,
};

export type GearId =
  | 'slimeSword'
  | 'forestBow'
  | 'furCoat'
  | 'boneArmor'
  | 'boneSpear'
  | 'forestLongbow'
  | 'forestGlaive'
  | 'beastBlade'
  | 'fangTalisman'
  | 'forestBlade'
  | 'natureBow'
  | 'slimeVial'
  | 'forestCrossbow'
  | 'forestShield'
  | 'royalGlaive'
  | 'leatherArmor'
  | 'plateArmor'
  | 'slimeWand'
  | 'sparkWand'
  | 'thornLongbow'
  | 'thornSpear'
  | 'faerieWand'
  | 'bansheeBow'
  | 'knightGlaive'
  | 'necroTome'
  | 'gloomPistol'
  | 'umbralDagger'
  | 'umbralFocus'
  | 'mithrilCrossbow'
  | 'drakeHammer'
  | 'drakeScepter'
  | 'frostbiteBlade'
  | 'skyLongbow'
  | 'griffinSpear'
  | 'skyStaff'
  | 'thunderRepeater'
  | 'stormbreaker'
  | 'stormTome'
  | 'meteorRifle'
  | 'starsteelSword'
  | 'starScepter'
  | 'shortSword'
  | 'shortBow'
  | 'commonClothes'
  | 'wispTome'
  | 'wolfTome'
  | 'boneMaul'
  | 'boneCrossbow'
  | 'emberLongbow'
  | 'bonePistol'
  | 'frostRifle'
  | 'voidRepeater'
  | 'elementalCataclysm'
  | 'ironSpear'
  | 'magmaGlaive'
  | 'soulLance'
  | 'gravewoodStaff'
  | 'emberFocus'
  | 'crystalFocus'
  | 'voidScepter'
  | 'soulfireStaff'
  | 'silkTunic'
  | 'gloomLeathers'
  | 'hauntedPlate'
  | 'griffinHide'
  | 'starweave'
  | 'stormplate'
  | 'voidPlate'
  | 'cultistRobe'
  | 'wrapRobe'
  | 'emberRobe'
  | 'cloudRobe'
  | 'soulRobe'
  | 'buckler'
  | 'boneShield'
  | 'drakeShield'
  | 'starAegis'
  | 'puppetDoll'
  | 'flameBrand'
  | 'frostCharm'
  | 'thunderTotem'
  | 'bonePlate'
  | 'chitinCarapace'
  | 'frostMail'
  | 'goldTooth'
  | 'satchel'
  | 'emberOrb'
  | 'hawkeyeLens'
  | 'soulRing'
  | CatalogGearId;

/** Item rarity, lowest to highest. Shown as the item's colour everywhere gear appears. */
export type Rarity = 'common' | 'uncommon' | 'rare' | 'veryRare' | 'legendary' | 'exotic' | 'relic' | 'artifact' | 'exalted';

export const RARITIES: Record<Rarity, { name: string; color: string }> = {
  common: { name: 'Common', color: '#a7afba' },
  uncommon: { name: 'Uncommon', color: '#3fcf6a' },
  rare: { name: 'Rare', color: '#4d9dff' },
  veryRare: { name: 'Very Rare', color: '#b48cff' },
  legendary: { name: 'Legendary', color: '#9a3cff' },
  exotic: { name: 'Exotic', color: '#ffd34d' },
  relic: { name: 'Relic', color: '#ff4d4d' },
  artifact: { name: 'Artifact', color: '#ff8c1a' },
  exalted: { name: 'Exalted', color: '#ff2fd0' },
};

export interface GearDef {
  id: GearId;
  name: string;
  icon: string;
  kind: GearKind;
  rarity: Rarity;
  /** Weapons only: the damage type they deal (the first of them, with `extraTypes`). */
  damageType?: DamageType;
  /**
   * Weapons with more than one damage type. Each hit is split evenly between all of them (a Fire and Frost
   * sword hitting for 100 deals 50 Fire and 50 Frost), each half checked against the monster's weaknesses and
   * resistances on its own and rolling its own status effect. See `perShot` for projectiles.
   */
  extraTypes?: DamageType[];
  /**
   * Tweaks to its weapon class: a dagger's stabs per attack (and its attack speed, × `rate`), a staff's bolts
   * before its big spell, or a focus that sends out an expanding `wave` instead of bursting around the Hunter.
   */
  tweak?: { thrusts?: number; rate?: number; bolts?: number; wave?: boolean };
  /** Projectile weapons with several types: each projectile deals one type at full damage, taking turns, instead of splitting. */
  perShot?: boolean;
  /**
   * Shown as the **Special** damage type instead of listing its types: weapons that change elements, or deal
   * too many to list (Elemental Cataclysm).
   */
  special?: boolean;
  /** Extra damage of one type, whatever deals it (+bonus at 1★, ×GEAR_STAR_POWER for stars). */
  typeBonus?: { type: DamageType; bonus: number };
  /** Weapons only: what kind of weapon it is, which shapes how it attacks (see WEAPON_CLASSES). */
  weaponClass?: WeaponClass;
  /**
   * Tomes: what this one summons (a spirit by default). `dash` is the creatures' own ability: every
   * `cooldown` seconds they lunge `range` at a monster, and a lunge that lands deals `damage` × a bite. Its
   * cooldown shows as the item's icon on the battlefield.
   */
  summon?: { look: 'wisp' | 'wolf'; name: string; dash?: { cooldown: number; range: number; speed: number; damage: number } };
  /** Tomes: the type of creature they summon (default: Spirit, or Beast for wolves). */
  summonType?: SummonType;
  /** A line about the item's own ability, shown on its card. */
  ability?: string;
  /** Armor: which kind it is (sets its stat profile and penalty). */
  armorType?: ArmorType;
  /** Rarer armor and accessories: a special effect (see GearEffect). */
  effect?: GearEffect;
  /** Extra damage against one archetype (+bonus at 1★, ×GEAR_STAR_POWER for stars), e.g. the Fang Talisman vs Beasts. */
  bane?: { archetype: Archetype; bonus: number };
  /** From `stars`★: the wearer's kills of `archetype` have `chance` to also drop one `material` (the Slime Vial's Royal Slime). */
  findDrop?: { archetype: Archetype; material: MaterialId; chance: number; stars: number };
  /** Chance each hit triggers its damage type's status effect (0 or missing: never). */
  proc?: number;
  /** Stats at 1★; higher stars multiply them by GEAR_STAR_POWER. */
  stats: Partial<Record<GearStat, number>>;
  /** Materials to craft (1★); each star after costs more (see gearCost). */
  recipe: Partial<Record<MaterialId, number>>;
  /** Starting gear: every new game begins with it; it can't be crafted (its recipe prices its stars). */
  starter?: boolean;
  /** Weapons: the area tier they belong to (1 = Wandering Woods … 12 = Void Rift), which sets their base damage. */
  tier?: number;
  /** Weapons: base damage per hit at 1★, overriding the tier's (the starting weapons deal 1). */
  hit?: number;
}

// ---- Weapon damage: every hit starts from the weapon's own damage ----
/**
 * A weapon's base damage per hit at 1★ by its area tier (1 = Wandering Woods … 12 = Void Rift), before its
 * class makes it heavier or lighter: each new area's weapons reach well past the last area's.
 */
export const TIER_HIT = [2, 4, 8, 15, 27, 45, 72, 110, 160, 230, 320, 440];
/** A weapon's base damage at each star, as a multiple of 1★. */
export const WEAPON_HIT_POWER = [0, 1, 1.3, 1.65, 2.1, 2.6, 3.2];
/** Base damage per hit with no weapon equipped. */
export const UNARMED_HIT = 1;
/** A weapon's base damage per hit at a star count (0 for gear that isn't a weapon). */
export function weaponHit(def: GearDef, stars: number): number {
  if (!def.weaponClass) return 0;
  // Between whole tiers, damage grows geometrically toward the next tier's.
  const t = Math.max(1, Math.min(TIER_HIT.length, gearTier(def)));
  const lo = Math.floor(t);
  const tierHit = lo >= TIER_HIT.length ? TIER_HIT[TIER_HIT.length - 1] : TIER_HIT[lo - 1] * (TIER_HIT[lo] / TIER_HIT[lo - 1]) ** (t - lo);
  const raw = tierHit * WEAPON_CLASSES[def.weaponClass].damage;
  const base = def.hit ?? (raw >= 10 ? Math.round(raw) : Math.round(raw * 10) / 10);
  return base * WEAPON_HIT_POWER[Math.max(0, Math.min(MAX_EFFECTIVE_STARS, stars))];
}
/** A weapon's damage for display (e.g. "1.3 damage"). */
export const hitText = (v: number): string => `${Number(v.toFixed(v < 10 ? 2 : 1))} damage`;
/** Everything a piece does at a star count: a weapon's base damage, then its stat bonuses. */
export function gearSummary(def: GearDef, stars: number): string {
  const hit = weaponHit(def, stars);
  return [hit ? hitText(hit) : '', describeGear(gearTotals(def, stars))].filter(Boolean).join(', ');
}

// ---- Stars: gear and Upgrades go from 1★ (crafted) to 5★ ----
export const MAX_STARS = 5;
/**
 * Stars a piece can work at: one past MAX_STARS, reached only with Reginald the Artificer's touch (the star
 * tables' last entry is that extra star, continuing their steps).
 */
export const MAX_EFFECTIVE_STARS = MAX_STARS + 1;

// ---- Gear modifiers: Refine (Kargesh the Blacksmith) and Enchant (Marceline the Enchantress) ----

/** Modifier slots on a piece by its rarity (weapons, armor and accessories alike). Stars don't change them. */
export const MOD_SLOTS: Record<Rarity, number> = { common: 0, uncommon: 0, rare: 0, veryRare: 1, legendary: 2, exotic: 2, relic: 3, artifact: 3, exalted: 3 };

/**
 * Modifiers are rolled: which one you get is random (from those that fit the piece), and so is its strength,
 * within a range that grows with the piece's rarity. Ranges are written for Legendary gear (what you'd have
 * when Refine opens in the Ember Mines) and scaled by MOD_POWER. A roll is a quality step from 0 to
 * MOD_QUALITY_STEPS; the top step is a **perfect** roll (it gets a special border).
 */
export const MOD_QUALITY_STEPS = 10;
/** Choices a roll offers to pick from (crafted items will raise it, up to 5). */
export const MOD_CHOICES = 2;
export const MOD_POWER: Record<Rarity, number> = { common: 1, uncommon: 1, rare: 1, veryRare: 0.8, legendary: 1, exotic: 1.2, relic: 1.45, artifact: 1.75, exalted: 2.1 };

/** Where a piece of gear goes, for which modifiers fit it. */
const isWeapon = (d: GearDef) => !!d.weaponClass;
const isArmor = (d: GearDef) => d.kind === 'armor';
const isAccessory = (d: GearDef) => d.kind === 'accessory';

/** A modifier's value at a quality step on a piece of a rarity (whole numbers for `int` ones). */
export function modRoll(range: [number, number], int: boolean | undefined, rarity: Rarity, q: number): number {
  const p = MOD_POWER[rarity];
  const v = (range[0] + ((range[1] - range[0]) * Math.max(0, Math.min(MOD_QUALITY_STEPS, q))) / MOD_QUALITY_STEPS) * p;
  return int ? Math.max(1, Math.round(v)) : Math.round(v * 1000) / 1000;
}

export type RefineStat = 'rate' | 'damage' | 'crit' | 'knock' | 'pierce' | 'mag' | 'guard' | 'stun' | 'radius' | 'range' | 'gold' | 'drops' | 'reload' | 'critDmg' | 'size';

/** Gear that summons (a tome, a Puppeteer's Doll), for summon modifiers. */
const summons = (d: GearDef) => (isWeapon(d) && !!WEAPON_CLASSES[d.weaponClass!].summon) || d.effect?.kind === 'summon';
/** Gear with a built-in ability on a cooldown (pulses, strikes, summons, a tome's lunge), for Haste. */
const hasCooldown = (d: GearDef) => (!!d.effect && 'cooldown' in d.effect) || !!d.summon?.dash;

/** Refine modifiers: stat bonuses. `range` is at Legendary (see MOD_POWER); `fits` says which pieces take it. */
export const REFINES: Record<RefineStat, { name: string; icon: string; range: [number, number]; int?: boolean; text: (v: number) => string; fits: (def: GearDef) => boolean }> = {
  rate: { name: 'Attack Speed', icon: '⚡', range: [0.05, 0.1], text: (v) => `+${pct(v)} attack speed`, fits: () => true },
  damage: { name: 'Damage', icon: '💥', range: [0.06, 0.12], text: (v) => `+${pct(v)} damage`, fits: () => true },
  crit: { name: 'Critical', icon: '🎯', range: [0.02, 0.04], text: (v) => `+${pct(v)} crit chance`, fits: (d) => !isArmor(d) },
  knock: { name: 'Knockback', icon: '🥊', range: [0.2, 0.4], text: (v) => `+${pct(v)} knockback`, fits: (d) => isWeapon(d) && (WEAPON_CLASSES[d.weaponClass!].knock ?? 0) > 0 },
  pierce: { name: 'Piercing', icon: '🏹', range: [1, 2], int: true, text: (v) => `+${v} pierce`, fits: (d) => isWeapon(d) && WEAPON_CLASSES[d.weaponClass!].attack === 'shot' },
  mag: { name: 'Magazine Size', icon: '🔋', range: [0.15, 0.3], text: (v) => `+${pct(v)} magazine size`, fits: (d) => isWeapon(d) && !!WEAPON_CLASSES[d.weaponClass!].mag },
  guard: { name: 'Bulwark', icon: '🛡️', range: [1, 2], int: true, text: (v) => `+${v} shield charge${v === 1 ? '' : 's'}`, fits: isArmor },
  stun: { name: 'Steadfast', icon: '🪨', range: [0.05, 0.1], text: (v) => `−${pct(v)} stun time`, fits: isArmor },
  radius: { name: 'Expanse', icon: '🌐', range: [0.15, 0.3], text: (v) => `+${pct(v)} area size`, fits: (d) => isAccessory(d) || d.armorType === 'robe' || d.weaponClass === 'hammer' || (isWeapon(d) && !!WEAPON_CLASSES[d.weaponClass!].spell) },
  range: { name: 'Reach', icon: '📏', range: [10, 20], int: true, text: (v) => `+${v} range`, fits: (d) => isAccessory(d) || (isWeapon(d) && d.kind !== 'melee') },
  size: { name: 'Size', icon: '📐', range: [0.1, 0.2], text: (v) => `+${pct(v)} melee reach`, fits: (d) => d.kind === 'melee' },
  gold: { name: 'Fortune', icon: '🪙', range: [0.06, 0.12], text: (v) => `+${pct(v)} gold`, fits: isAccessory },
  drops: { name: 'Plunder', icon: '💎', range: [0.06, 0.12], text: (v) => `+${pct(v)} materials`, fits: isAccessory },
  reload: { name: 'Quick Reload', icon: '🔄', range: [0.1, 0.2], text: (v) => `−${pct(v)} reload and recharge time`, fits: (d) => isWeapon(d) && !!WEAPON_CLASSES[d.weaponClass!].mag },
  critDmg: { name: 'Brutal', icon: '💢', range: [0.15, 0.3], text: (v) => `+${pct(v)} crit damage`, fits: (d) => !isArmor(d) },
};

// ---- Spells: each element's magic, cast by staffs and by Spell enchantments ----

export type SpellId =
  | 'fireVolley'
  | 'fireball'
  | 'acidPool'
  | 'acidRain'
  | 'iceSpikes'
  | 'frostFan'
  | 'radiantBeam'
  | 'sunbeam'
  | 'poisonMist'
  | 'plague'
  | 'arcaneBolts'
  | 'raiseDead'
  | 'chainLightning'
  | 'thunderstorm'
  | 'gravityAnchor';

/**
 * A spell. `k` is the share of the cast's damage each of its hits deals (a staff's cast is its spell multiple ×
 * the Hunter's shot; an enchantment's its rolled base damage); the rest of its numbers shape it.
 */
export interface SpellDef {
  name: string;
  icon: string;
  damageType: DamageType;
  desc: string;
  k: number;
  /** How many projectiles, spikes, strikes or jumps. */
  count?: number;
  /** Area radius (× area size), or a cone's or line's reach. */
  r?: number;
  /** Seconds it lingers (zones, puddles), and seconds between its ticks. */
  life?: number;
  tick?: number;
  /** A fan's spread or a cone's half-angle, in radians. */
  spread?: number;
}

export const SPELLS: Record<SpellId, SpellDef> = {
  fireVolley: { name: 'Fire Volley', icon: '🔥', damageType: 'fire', k: 0.6, count: 5, spread: 0.7, desc: 'A fan of five fire bolts.' },
  fireball: { name: 'Fireball', icon: '☄️', damageType: 'fire', k: 1, r: 70, desc: 'A fireball lobbed at the monsters that explodes where it lands.' },
  acidPool: { name: 'Acid Pool', icon: '🧪', damageType: 'acid', k: 0.35, r: 60, life: 3, desc: 'A flask of acid that leaves a burning pool.' },
  acidRain: { name: 'Acid Rain', icon: '🌧️', damageType: 'acid', k: 0.4, r: 90, life: 3, tick: 0.15, desc: 'A cloud that rains acid drops on the monsters under it.' },
  iceSpikes: { name: 'Ice Spikes', icon: '🧊', damageType: 'frost', k: 1, count: 6, r: 24, desc: 'A line of ice spikes erupting from the ground toward the monsters, chilling them.' },
  frostFan: { name: 'Frost Fan', icon: '❄️', damageType: 'frost', k: 1, r: 160, spread: 0.55, desc: 'A fan of ice blasting out in front, chilling everything in it.' },
  radiantBeam: { name: 'Radiant Beam', icon: '✨', damageType: 'radiant', k: 1, r: 26, desc: 'A beam of light from the Hunter, through everything in its path.' },
  sunbeam: { name: 'Sunbeam', icon: '☀️', damageType: 'radiant', k: 0.6, count: 4, r: 50, tick: 0.2, desc: 'A beam of sunlight from the sky that burns the ground under it.' },
  poisonMist: { name: 'Poison Mist', icon: '🌫️', damageType: 'poison', k: 0.25, r: 55, life: 5, tick: 0.5, desc: 'A cloud of poison drifting across the field, poisoning every monster it touches.' },
  plague: { name: 'Plague', icon: '🦠', damageType: 'poison', k: 1, r: 40, life: 6, desc: 'Infects the monsters: they poison every monster they touch, which then spread it too.' },
  arcaneBolts: { name: 'Arcane Bolts', icon: '🔮', damageType: 'arcane', k: 0.8, count: 3, spread: 0.25, desc: 'Three bolts that pierce every monster in their path until they leave the field.' },
  raiseDead: { name: 'Raise Dead', icon: '💀', damageType: 'decay', k: 0.15, r: 80, life: 6, tick: 0.5, desc: 'Curses the ground: monsters that die on it rise again to fight for the Hunter.' },
  chainLightning: { name: 'Chain Lightning', icon: '⚡', damageType: 'lightning', k: 1, count: 5, r: 130, desc: 'A bolt from the Hunter that jumps from monster to monster.' },
  thunderstorm: { name: 'Thunderstorm', icon: '🌩️', damageType: 'lightning', k: 0.8, count: 5, r: 150, tick: 0.2, desc: 'Lightning strikes down from the sky on the monsters around the target.' },
  gravityAnchor: { name: 'Gravity Anchor', icon: '🌀', damageType: 'void', k: 0.15, r: 110, life: 3, tick: 0.5, desc: 'An anchor thrown into the thick of them that pulls every monster in, then collapses.' },
};
/** Each element's spells (a staff of that type casts one of them). Physical has none: its staffs blast. */
export const TYPE_SPELLS: Record<DamageType, SpellId[]> = {
  physical: [],
  fire: ['fireball', 'fireVolley'],
  acid: ['acidPool', 'acidRain'],
  frost: ['iceSpikes', 'frostFan'],
  radiant: ['radiantBeam', 'sunbeam'],
  poison: ['poisonMist', 'plague'],
  arcane: ['arcaneBolts'],
  decay: ['raiseDead'],
  lightning: ['chainLightning', 'thunderstorm'],
  void: ['gravityAnchor'],
};
/** Raise Dead: how long a risen monster fights, and how often it bites (each bite: the spell's cast × `k`). */
export const RISEN = { life: 6, bites: 1, k: 0.5 };
/** Gravity Anchor's collapse: a last hit for this × the spell's cast, within this share of its radius. */
export const ANCHOR_COLLAPSE = { k: 1, r: 0.6 };
/** Plague: each spread poisons for this share of what infected the spreader. */
export const PLAGUE_SPREAD = 0.8;

/** A percentage, to one decimal place when it isn't whole. */
const pct = (v: number): string => `${Math.round(v * 1000) / 10}%`;

/**
 * Enchantments: the involved modifiers. Each has a rolled **chance** to activate (`range`, the roll that makes it
 * Perfect at its top), and most also a separately rolled **power** (`power`): an infusion's bonus to its type,
 * an ability's damage (× the piece's area TIER_HIT, like gear abilities). Both ranges are at Legendary, like
 * Refine's, and scale with rarity. `weight` makes some likelier to roll (each infusion is one of nine).
 */
export type EnchantId =
  | 'infuseFire'
  | 'infuseFrost'
  | 'infuseAcid'
  | 'infusePoison'
  | 'infuseLightning'
  | 'infuseRadiant'
  | 'infuseArcane'
  | 'infuseDecay'
  | 'infuseVoid'
  | 'potency'
  | 'fireburst'
  | 'thunderCall'
  | 'frostPulse'
  | 'emberPulse'
  | 'thorns'
  | 'evasion'
  | 'shieldBurst'
  | 'virulence'
  | 'binding'
  | 'haste'
  | 'amplify'
  | SpellEnchantId;
/** A Spell enchantment: one per spell, e.g. 'spellFireball'. */
export type SpellEnchantId = `spell${Capitalize<SpellId>}`;

export interface EnchantDef {
  name: string;
  icon: string;
  /** Its chance to activate, at Legendary (the roll that decides a Perfect). */
  range: [number, number];
  /** Its second roll, at Legendary: an infusion's bonus to its type, or damage as a multiple of TIER_HIT. */
  power?: [number, number];
  weight: number;
  /** Infusions: the damage type they add; their chance is that type's status chance. */
  infuse?: DamageType;
  /** Potency: its chance is added to the weapon's status chance. */
  potency?: boolean;
  /** Virulence / Binding: their roll is a strength, not a chance: status effect strength, or summon duration. */
  boost?: 'status' | 'summonDur' | 'cooldown' | 'radius';
  /** Fireburst: each kill by the weapon has its chance to burst within `radius`. */
  onKill?: { radius: number; damageType: DamageType };
  /** Thunder Call and the pulses: each of the wearer's attacks has its chance to set this off. */
  onAttack?: GearEffect;
  /** Armor specials (thorns, evade, block): each time they could, they activate at its chance. */
  effect?: GearEffect;
  fits: (def: GearDef) => boolean;
  /** In words, given its rolled chance, power and the piece's TIER_HIT. */
  text: (chance: number, power: number, tierHit: number) => string;
}

const dmg = (v: number, t: number) => `${Math.round(v * t * 10) / 10} base damage`;
const infusion = (t: DamageType, icon: string): EnchantDef => ({
  name: `${DAMAGE_TYPES[t].name} Infusion`,
  icon,
  range: [0.1, 0.25],
  power: [0.05, 0.15],
  weight: 0.4,
  infuse: t,
  fits: isWeapon,
  text: (c, p) => `adds ${DAMAGE_TYPES[t].name} damage (+${pct(p)}; hits split between the weapon's types)${DAMAGE_TYPES[t].effect ? `, ${pct(c)} chance to ${DAMAGE_TYPES[t].effect!.split(':')[0].toLowerCase()}` : ''}`,
});

/** Ranged and magic weapons (and accessories) take Spell enchantments; melee weapons don't. */
const castsSpells = (d: GearDef) => !isArmor(d) && d.kind !== 'melee';
const spellEnchant = (id: SpellId): EnchantDef => ({
  name: SPELLS[id].name,
  icon: SPELLS[id].icon,
  range: [0.04, 0.08],
  power: [0.8, 1.2],
  weight: 0.3,
  onAttack: { kind: 'spell', spell: id, base: 1, damageType: SPELLS[id].damageType },
  fits: castsSpells,
  text: (c, p, t) => `${pct(c)} chance on attack to cast ${SPELLS[id].name}: ${SPELLS[id].desc.charAt(0).toLowerCase()}${SPELLS[id].desc.slice(1, -1)} (${dmg(p, t)})`,
});
export const spellEnchantId = (id: SpellId): SpellEnchantId => `spell${id.charAt(0).toUpperCase()}${id.slice(1)}` as SpellEnchantId;

export const ENCHANTS: Record<EnchantId, EnchantDef> = {
  infuseFire: infusion('fire', '🔥'),
  infuseFrost: infusion('frost', '❄️'),
  infuseAcid: infusion('acid', '🧪'),
  infusePoison: infusion('poison', '☠️'),
  infuseLightning: infusion('lightning', '⚡'),
  infuseRadiant: infusion('radiant', '✨'),
  infuseArcane: infusion('arcane', '🔮'),
  infuseDecay: infusion('decay', '🍂'),
  infuseVoid: infusion('void', '🌀'),
  potency: { name: 'Potency', icon: '🧫', range: [0.08, 0.15], weight: 1, potency: true, fits: isWeapon, text: (c) => `+${pct(c)} status effect chance` },
  fireburst: { name: 'Fireburst', icon: '💥', range: [0.25, 0.5], power: [0.6, 1], weight: 1, onKill: { radius: 70, damageType: 'fire' }, fits: isWeapon, text: (c, p, t) => `${pct(c)} chance a monster this weapon kills bursts into flame (${dmg(p, t)})` },
  thunderCall: { name: 'Thunder Call', icon: '🌩️', range: [0.05, 0.12], power: [0.5, 0.8], weight: 1, onAttack: { kind: 'strike', base: 1, damageType: 'lightning', targets: 2, cooldown: 0, range: 300 }, fits: () => true, text: (c, p, t) => `${pct(c)} chance on attack to call lightning on 2 monsters (${dmg(p, t)})` },
  frostPulse: { name: 'Frost Pulse', icon: '🧊', range: [0.05, 0.12], power: [0.6, 0.9], weight: 1, onAttack: { kind: 'pulse', base: 1, damageType: 'frost', radius: 90, cooldown: 0 }, fits: () => true, text: (c, p, t) => `${pct(c)} chance on attack for a burst of frost around the wearer (${dmg(p, t)})` },
  emberPulse: { name: 'Ember Pulse', icon: '🔥', range: [0.05, 0.12], power: [0.6, 0.9], weight: 1, onAttack: { kind: 'pulse', base: 1, damageType: 'fire', radius: 90, cooldown: 0 }, fits: (d) => !isWeapon(d), text: (c, p, t) => `${pct(c)} chance on attack for a burst of fire around the wearer (${dmg(p, t)})` },
  thorns: { name: 'Thorns', icon: '🌵', range: [0.3, 0.6], power: [0.8, 1.2], weight: 1, effect: { kind: 'thorns', base: 1, damageType: 'physical' }, fits: isArmor, text: (c, p, t) => `${pct(c)} chance a monster that reaches the wearer takes damage (${dmg(p, t)})` },
  evasion: { name: 'Evasion', icon: '💨', range: [0.05, 0.1], weight: 1, effect: { kind: 'evade', chance: 1 }, fits: isArmor, text: (c) => `${pct(c)} chance to slip a monster entirely` },
  virulence: { name: 'Virulence', icon: '🧫', range: [0.1, 0.25], weight: 1, boost: 'status', fits: isWeapon, text: (v) => `+${pct(v)} status effect strength (damaging effects hit harder; the others last longer or pull harder)` },
  haste: { name: 'Haste', icon: '⏱️', range: [0.08, 0.16], weight: 1, boost: 'cooldown', fits: hasCooldown, text: (v) => `−${pct(v)} ability cooldowns` },
  amplify: { name: 'Amplify', icon: '🌀', range: [0.2, 0.4], weight: 1, boost: 'radius', fits: () => true, text: (v) => `+${pct(v)} area size (every area effect: specials, blasts, puddles, slams, auras)` },
  binding: { name: 'Binding', icon: '⏳', range: [0.15, 0.3], weight: 1, boost: 'summonDur', fits: summons, text: (v) => `+${pct(v)} summon duration` },
  ...(Object.fromEntries((Object.keys(SPELLS) as SpellId[]).map((id) => [spellEnchantId(id), spellEnchant(id)])) as Record<SpellEnchantId, EnchantDef>),
  shieldBurst: { name: 'Shield Burst', icon: '🛡️', range: [0.4, 0.8], power: [0.8, 1.2], weight: 1, effect: { kind: 'block', base: 1, damageType: 'radiant', radius: 80 }, fits: isArmor, text: (c, p, t) => `${pct(c)} chance a blocked hit blasts everything nearby (${dmg(p, t)})` },
};

type ModLike = { kind: 'refine'; stat: RefineStat; q: number } | { kind: 'enchant'; id: EnchantId; q: number; p?: number };

/** A rolled modifier's value on a piece: a Refine stat, or an Enchantment's chance (its quality step in its range). */
export function modValue(m: ModLike, def: GearDef): number {
  const d = m.kind === 'refine' ? REFINES[m.stat] : ENCHANTS[m.id];
  return modRoll(d.range, 'int' in d ? d.int : false, def.rarity, m.q);
}

/** An Enchantment's second roll on a piece (an infusion's bonus, an ability's damage multiple); 0 if it has none. */
export function modPower(m: ModLike, def: GearDef): number {
  if (m.kind !== 'enchant') return 0;
  const r = ENCHANTS[m.id].power;
  return r ? modRoll(r, false, def.rarity, m.p ?? Math.round(MOD_QUALITY_STEPS / 2)) : 0;
}

/** A perfect roll: the top of its range (shown with a special border). */
export const modPerfect = (m: { q: number }): boolean => m.q >= MOD_QUALITY_STEPS;

/** The TIER_HIT an enchantment's damage is a multiple of: the piece's area's. */
export const enchantTierHit = (def: GearDef): number => TIER_HIT[Math.max(1, Math.min(TIER_HIT.length, gearArea(def))) - 1];

/**
 * What a Refine or Enchant roll costs: some of the piece's own recipe (like an upgrade: MOD_RECIPE_SHARE of it),
 * plus golem metals for Refine or golem gems for Enchant, rarer ones for rarer pieces.
 */
export const MOD_RECIPE_SHARE = 0.5;

/** Gold a piece's area pays per kill (Forest gear: the Forest's), for pricing upgrades and modifiers in gold. */
const gearAreaGold = (def: GearDef): number => areaDef(AREAS[Math.max(1, Math.min(AREAS.length, gearArea(def))) - 1].id).gold;
/** Upgrading also costs gold: this many kills' worth in the piece's area for 1★ → 2★, doubling each star. */
export const UPGRADE_GOLD_KILLS = 300;
export const gearUpgradeGold = (def: GearDef, stars: number): number => Math.ceil(gearAreaGold(def) * UPGRADE_GOLD_KILLS * 2 ** (stars - 1));
/** Refining also costs this many kills' worth of gold in the piece's area; enchanting twice as much. */
export const MOD_GOLD_KILLS = 2_000;
export const modGold = (def: GearDef, kind: 'refine' | 'enchant'): number => Math.ceil(gearAreaGold(def) * MOD_GOLD_KILLS * (kind === 'enchant' ? 2 : 1));
export const MOD_METALS: Partial<Record<Rarity, Partial<Record<MaterialId, number>>>> = {
  veryRare: { ironOre: 4 },
  legendary: { silverOre: 4, cobaltOre: 3 },
  exotic: { goldOre: 3, venomite: 2, frostIron: 2 },
  relic: { frostIron: 4, skysteel: 3 },
  artifact: { coldsteel: 2, orichalcum: 2, starIron: 3 },
  exalted: { adamantite: 2, voidsteel: 3 },
};
export const MOD_GEMS: Partial<Record<Rarity, Partial<Record<MaterialId, number>>>> = {
  veryRare: { quartz: 4 },
  legendary: { amethyst: 4 },
  exotic: { topaz: 3, aquamarine: 2 },
  relic: { emerald: 2, sapphire: 3 },
  artifact: { diamond: 1, opal: 3 },
  exalted: { stormstone: 2, voidPrism: 3 },
};
export function modCost(def: GearDef, kind: 'refine' | 'enchant'): Partial<Record<MaterialId, number>> {
  const out: Partial<Record<MaterialId, number>> = {};
  for (const [m, n] of Object.entries(def.recipe) as [MaterialId, number][]) out[m] = Math.max(1, Math.ceil(n * MOD_RECIPE_SHARE));
  for (const [m, n] of Object.entries((kind === 'refine' ? MOD_METALS : MOD_GEMS)[def.rarity] ?? {}) as [MaterialId, number][]) out[m] = (out[m] ?? 0) + n;
  return out;
}
/** Gear stats at each star, as a multiple of 1★ (0★ = not crafted). */
export const GEAR_STAR_POWER = [0, 1, 2, 4, 7, 10, 13];
/** Gear costs grow this much per step of power (so a star costs the sum of the steps it skips). */
export const GEAR_COST_GROWTH = 1.8;
/** The ★★★☆☆ display of a star count. */
export const starsText = (stars: number): string => '★'.repeat(stars) + '☆'.repeat(Math.max(0, MAX_STARS - stars));
/** Salvaging returns this share of the materials spent on a piece. */
export const SALVAGE_REFUND = 0.5;
/** Stun reductions from gear stack additively up to this cap. */
export const GEAR_STUN_CAP = 0.7;

// ---- Weapon classes: how a weapon attacks ----
// Your Hunter attacks the way their weapon does. Guild Hunters keep their own signature attack; their
// weapon's class reshapes it (a longbow makes Galladair's arrows slower, heavier and longer-ranged).
// Each class's rate × damage is about 1, so none is simply better: they trade speed, reach and crowd hits.

export type WeaponClass = 'tome' | 'dagger' | 'sword' | 'glaive' | 'spear' | 'hammer' | 'shortbow' | 'longbow' | 'crossbow' | 'pistol' | 'rifle' | 'repeater' | 'wand' | 'staff' | 'focus' | 'scepter';

export interface WeaponClassDef {
  name: string;
  /**
   * How your Hunter attacks with it. 'shot': a projectile out to their range × `range`. 'sweep': an arc of
   * `arc` radians in front of them, `reach` deep, hitting everything in it. 'stab': a thrust `reach` long that
   * pierces `pierce` extra enemies in a line. 'dagger': a swipe (like a small sweep) when something is within
   * `reach`, else a thrown dagger out to their range × `range`. 'nova': when a monster comes within `reach`,
   * a burst hits every monster in that radius around the Hunter. 'slam': a hammer smashes the ground, hitting
   * every monster within `reach` all around (× area size) and knocking them far back. 'summon': calls up a
   * creature (see `summon`).
   */
  attack: 'shot' | 'sweep' | 'stab' | 'dagger' | 'nova' | 'slam' | 'summon';
  /** Projectile look for shots and throws. */
  projectile?: 'bolt' | 'arrow' | 'spark' | 'pistol' | 'dagger';
  range: number;
  reach?: number;
  arc?: number;
  rate: number;
  damage: number;
  pierce?: number;
  /**
   * Guns: shots in a magazine, then a reload lasting `reload` shots' worth of time (so reloads keep pace with
   * attack speed). Bows and blades never reload.
   */
  mag?: number;
  reload?: number;
  /** Longbows: after hitting its target, the arrow carries on this far and hits anything just behind it. */
  followThrough?: number;
  /**
   * Repeaters: projectiles per attack, fired at random angles within a fan `fan` radians wide. Each extra one
   * from the same volley that hits the same monster deals `stack` more (the 2nd ×1.5, the 3rd ×2...).
   */
  volley?: number;
  fan?: number;
  stack?: number;
  /** Daggers: stabs per attack, in quick succession at the same monster (or daggers thrown, when it's far). */
  thrusts?: number;
  /** Focuses that send out a wave: it expands from the Hunter out to `reach`, hitting monsters as it passes. */
  wave?: boolean;
  /** Spears: how wide the thrust is (it hits everything in that band). */
  width?: number;
  /** Melee: how hard a hit knocks a surviving monster back (daggers: only the last stab). */
  knock?: number;
  /** Scepters: each bolt bounces on to this many more monsters nearby. */
  bounces?: number;
  /**
   * Staffs: after `every` bolts, the next attack is a big spell (an explosion `radius` wide, dealing `damage` ×
   * a bolt to everything in it), then a short cooldown (the magazine's reload).
   */
  spell?: { every: number; radius: number; damage: number };
  /**
   * Tomes: each attack summons a creature that roams the field for `duration` seconds, biting monsters within
   * reach `bites` times a second for `damage` × a shot (the class's `damage`). Attack speed shortens the wait.
   */
  summon?: { duration: number; bites: number; speed: number; name: string };
  /** Rough crowd efficiency for the background model (sweeps and stabs hit several). */
  farm: number;
  describe: string;
}

/** Share of time a weapon spends firing rather than reloading (1 for weapons that never reload). */
export const weaponUptime = (c: WeaponClassDef | null | undefined): number => (c?.mag ? c.mag / (c.mag + (c.reload ?? 0)) : 1);

/**
 * Hits per attack for the background model: a dagger's stabs, or a repeater's volley (with some of it stacking
 * on the same monster: about half the extra shots land on the first one).
 */
export const weaponHitsPerAttack = (c: WeaponClassDef | null | undefined): number => {
  if (!c) return 1;
  if (c.thrusts) return c.thrusts;
  if (c.summon) return c.summon.duration * c.summon.bites;
  if (c.spell) return (c.spell.every + c.spell.damage) / (c.spell.every + 1);
  const v = c.volley ?? 1;
  return v * (1 + ((c.stack ?? 0) * (v - 1)) / 4);
};

export const WEAPON_CLASSES: Record<WeaponClass, WeaponClassDef> = {
  dagger: { name: 'Dagger', attack: 'dagger', projectile: 'dagger', range: 0.8, reach: 60, thrusts: 3, knock: 160, rate: 0.9, damage: 0.4, farm: 1, describe: 'A quick burst of 3 stabs at one monster; the last knocks it back. Thrown when monsters are further off.' },
  sword: { name: 'Sword', attack: 'sweep', range: 1, reach: 80, arc: 2.4, knock: 120, rate: 0.9, damage: 1.1, farm: 1.8, describe: 'A sweeping slash that hits every monster in front and knocks them back.' },
  glaive: { name: 'Glaive', attack: 'sweep', range: 1, reach: 100, arc: 3.2, knock: 160, rate: 0.7, damage: 1.4, farm: 2, describe: 'A wide, heavy cleave around the front that knocks monsters back.' },
  spear: { name: 'Spear', attack: 'stab', range: 1, reach: 170, width: 24, knock: 200, rate: 0.8, damage: 1.2, farm: 2, describe: 'A long, wide thrust straight out that hits everything in its path and drives it back.' },
  hammer: { name: 'Hammer', attack: 'slam', range: 1, reach: 80, knock: 460, rate: 0.45, damage: 2.3, farm: 2.2, describe: 'Very slow, crushing slams on the ground that hit every monster close around and send them flying.' },
  shortbow: { name: 'Shortbow', attack: 'shot', projectile: 'arrow', range: 0.85, rate: 1.35, damage: 0.75, farm: 1, describe: 'The basic bow: quick, light shots that never stop.' },
  longbow: { name: 'Longbow', attack: 'shot', projectile: 'arrow', range: 1.35, rate: 0.65, damage: 1.5, followThrough: 45, farm: 1.2, describe: 'Slow, heavy shots from far away; each arrow carries on through its target into whatever is just behind.' },
  crossbow: { name: 'Crossbow', attack: 'shot', projectile: 'arrow', range: 1.1, rate: 0.8, damage: 1.25, pierce: 1, farm: 1.2, describe: 'Heavy bolts that always pierce at least one more monster.' },
  pistol: { name: 'Pistol', attack: 'shot', projectile: 'pistol', range: 0.7, rate: 1.6, damage: 1, mag: 6, reload: 3, farm: 1, describe: 'Hard-hitting shots at close range: 6 shots, then a reload.' },
  rifle: { name: 'Rifle', attack: 'shot', projectile: 'pistol', range: 1.5, rate: 0.8, damage: 2.4, pierce: 1, mag: 4, reload: 3, farm: 1.1, describe: 'Very hard, very long shots that pierce: 4 shots, then a long reload.' },
  repeater: { name: 'Repeater', attack: 'shot', projectile: 'bolt', range: 0.9, rate: 1.2, damage: 0.32, volley: 3, fan: 0.5, stack: 0.5, mag: 6, reload: 3, farm: 1, describe: 'Sprays volleys of 3 bolts in a random fan; each extra bolt of a volley on the same monster hits 50% harder. 6 volleys, then a reload.' },
  wand: { name: 'Wand', attack: 'shot', projectile: 'spark', range: 0.85, rate: 1.35, damage: 0.75, farm: 1, describe: 'The basic magic weapon: quick, light bolts at shorter range.' },
  scepter: { name: 'Scepter', attack: 'shot', projectile: 'spark', range: 1.25, rate: 0.75, damage: 1.3, bounces: 2, farm: 1.5, describe: 'Slower, longer-range bolts that bounce on to 2 more monsters nearby.' },
  staff: { name: 'Staff', attack: 'shot', projectile: 'spark', range: 1.1, rate: 0.8, damage: 1.25, spell: { every: 5, radius: 70, damage: 3 }, mag: 6, reload: 2, farm: 1.4, describe: "Casts 5 bolts, then its element's spell (a Fire staff's Fireball or Fire Volley, a Frost staff's Ice Spikes or Frost Fan, and so on), then a short cooldown." },
  focus: { name: 'Focus', attack: 'nova', range: 1, reach: 110, rate: 0.8, damage: 1.2, farm: 2, describe: 'When monsters come close, bursts with power that hits every monster around the Hunter.' },
  tome: { name: 'Tome', attack: 'summon', range: 1, rate: 0.12, damage: 0.7, summon: { duration: 8, bites: 1.5, speed: 150, name: 'spirit' }, farm: 1, describe: 'Summons a spirit that hunts monsters across the field for 8s, then fades; a new one comes after a cooldown.' },
};

// ---- The gear catalog (gearCatalog.ts): one line per item, filled out here ----

/** Each area's usual rarity (Wandering Woods … Void Rift). */
const AREA_RARITY: Rarity[] = ['common', 'uncommon', 'uncommon', 'rare', 'rare', 'veryRare', 'veryRare', 'legendary', 'exotic', 'relic', 'artifact', 'exalted'];
/**
 * Catalog items made with an area's rarest material (`top`) get this rarity: one higher, except where that
 * rarity's Modify metals and gems only drop from golems in later areas (the Crypt and Depths stay Rare, as Very
 * Rare gems start in the Ember Mines; the Ember Mines, Cloud Fortress and Meteor Field keep their usual rarity).
 */
const AREA_TOP_RARITY: Rarity[] = ['uncommon', 'rare', 'rare', 'rare', 'rare', 'veryRare', 'legendary', 'exotic', 'relic', 'relic', 'artifact', 'exalted'];
const RARITY_ORDER: Rarity[] = ['common', 'uncommon', 'rare', 'veryRare', 'legendary', 'exotic', 'relic', 'artifact', 'exalted'];
const MELEE_CLASSES: WeaponClass[] = ['dagger', 'sword', 'glaive', 'spear', 'hammer'];
const MAGIC_CLASSES: WeaponClass[] = ['wand', 'staff', 'focus', 'scepter', 'tome'];
/** A catalog accessory's stats at the Restless Graveyard (tier 3); they grow 30% per area after. */
const CATALOG_ACC_STATS: Record<string, number> = { damage: 0.06, rate: 0.05, crit: 0.02, gold: 0.15, drops: 0.15, range: 12, radius: 0.08, stun: 0.04 };

/** The element of each area's armor specials (Ember Mines on; earlier armor is below Very Rare and has none). */
const AREA_ELEMENT: DamageType[] = ['physical', 'physical', 'physical', 'physical', 'physical', 'fire', 'acid', 'frost', 'lightning', 'lightning', 'radiant', 'void'];

/**
 * From Very Rare up, armor has a special, by kind: Heavy armor Thorns, Light armor Evasion, Robes a Pulse and
 * Shields a Shield burst, with the area's base damage (the same scale as the hand-made ones, e.g. Chitin Carapace).
 */
function catalogArmorEffect(armor: ArmorType, rarity: Rarity, area: number): { effect?: GearEffect } {
  if (RARITY_ORDER.indexOf(rarity) < RARITY_ORDER.indexOf('veryRare')) return {};
  const base = TIER_HIT[Math.min(TIER_HIT.length, area) - 1];
  const damageType = AREA_ELEMENT[area - 1];
  switch (armor) {
    case 'heavy':
      return { effect: { kind: 'thorns', base, damageType } };
    case 'light':
      return { effect: { kind: 'evade', chance: Math.min(0.4, Math.round((0.05 * area - 0.2) * 100) / 100) } };
    case 'robe':
      return { effect: { kind: 'pulse', base, damageType, radius: 90 + 5 * (area - 6), cooldown: 5 } };
    case 'shield':
      return { effect: { kind: 'block', base, damageType, radius: 80 + 5 * (area - 6) } };
  }
}

function catalogGear(spec: CatalogSpec): GearDef {
  const recipe = spec.recipe as Partial<Record<MaterialId, number>>;
  const tier = gearTier({ recipe } as GearDef);
  const areaIdx = AREAS.findIndex((a) => a.id === spec.area);
  const rarity = spec.top ? AREA_TOP_RARITY[areaIdx] : AREA_RARITY[areaIdx];
  const common = { id: spec.id as GearId, name: spec.name, icon: spec.icon, rarity, recipe };
  if (spec.type === 'armor') return { ...common, kind: 'armor', armorType: spec.armor, stats: armorStats(spec.armor, tier), ...catalogArmorEffect(spec.armor, rarity, areaIdx + 1) };
  if (spec.type === 'accessory') {
    const m = 1 + 0.3 * (tier - 3);
    const stats: Partial<Record<GearStat, number>> = {};
    for (const st of spec.stats) stats[st] = st === 'range' ? Math.round(CATALOG_ACC_STATS[st] * m) : Math.round(CATALOG_ACC_STATS[st] * m * 1000) / 1000;
    return { ...common, kind: 'accessory', stats, ...(spec.bane ? { bane: { archetype: spec.bane, bonus: Math.round(0.06 * m * 1000) / 1000 } } : {}) };
  }
  const cls = spec.cls as WeaponClass;
  // Elemental weapons inflict their effect more often in later areas; among Physical weapons only blades bleed.
  const proc = spec.dmg !== 'physical' ? Math.min(0.3, 0.15 + 0.01 * (areaIdx - 1)) : cls === 'dagger' ? 0.15 : cls === 'sword' || cls === 'spear' ? 0.1 : 0;
  return {
    ...common,
    kind: MELEE_CLASSES.includes(cls) ? 'melee' : MAGIC_CLASSES.includes(cls) ? 'magic' : 'weapon',
    weaponClass: cls,
    damageType: spec.dmg,
    ...(proc ? { proc } : {}),
    stats: {},
  };
}

export const GEAR: GearDef[] = [
  // Starting gear (not craftable): your Hunter begins with the Short Sword and Common Clothes on, and a Short Bow spare.
  { id: 'shortSword', name: 'Short Sword', icon: '🗡️', kind: 'melee', rarity: 'common', weaponClass: 'sword', damageType: 'physical', hit: 1, stats: {}, recipe: { goo: 6 }, starter: true },
  { id: 'shortBow', name: 'Short Bow', icon: '🏹', kind: 'weapon', rarity: 'common', weaponClass: 'shortbow', damageType: 'physical', hit: 1, stats: {}, recipe: { goo: 6 }, starter: true },
  { id: 'commonClothes', name: 'Common Garb', icon: '👕', kind: 'armor', rarity: 'common', stats: {}, recipe: { goo: 4 }, starter: true },
  // Weapons
  // Wandering Woods: tiers (and damage) come from how deep into the Woods each recipe's materials are
  { id: 'slimeSword', name: 'Slime Sword', icon: '⚔️', kind: 'melee', rarity: 'common', weaponClass: 'sword', damageType: 'physical', stats: {}, recipe: { goo: 8 } },
  { id: 'forestBow', name: 'Forest Bow', icon: '🏹', kind: 'weapon', rarity: 'common', weaponClass: 'shortbow', damageType: 'physical', stats: {}, recipe: { goo: 6, twig: 6 } },
  { id: 'furCoat', name: 'Fur Coat', icon: '🧥', kind: 'armor', armorType: 'light', rarity: 'common', stats: armorStats('light', gearTier({ recipe: { pelt: 8 } } as GearDef)), recipe: { pelt: 8 } },
  { id: 'boneArmor', name: 'Bone Armor', icon: '🦴', kind: 'armor', armorType: 'heavy', rarity: 'common', stats: armorStats('heavy', gearTier({ recipe: { beastBone: 8 } } as GearDef)), recipe: { beastBone: 8 } },
  { id: 'boneSpear', name: 'Bone Spear', icon: '🔱', kind: 'melee', rarity: 'common', weaponClass: 'spear', damageType: 'physical', stats: {}, recipe: { goo: 6, beastBone: 5 } },
  { id: 'forestLongbow', name: 'Longbow', icon: '🏹', kind: 'weapon', rarity: 'common', weaponClass: 'longbow', damageType: 'physical', stats: {}, recipe: { scrap: 6, twig: 8 } },
  { id: 'forestGlaive', name: 'Glaive', icon: '🪓', kind: 'melee', rarity: 'common', weaponClass: 'glaive', damageType: 'physical', stats: {}, recipe: { scrap: 8, twig: 6 } },
  { id: 'beastBlade', name: 'Beast Blade', icon: '🔪', kind: 'melee', rarity: 'uncommon', weaponClass: 'dagger', damageType: 'physical', proc: 0.25, stats: {}, recipe: { bearClaw: 5, beastBone: 6 } },
  { id: 'fangTalisman', name: 'Fang Talisman', icon: '🦷', kind: 'accessory', rarity: 'uncommon', stats: { rate: 0.05 }, bane: { archetype: 'beast', bonus: 0.05 }, recipe: { bearClaw: 4, beastBone: 4, pelt: 6, bone: 6 } },
  { id: 'forestBlade', name: 'Forest Blade', icon: '🗡️', kind: 'melee', rarity: 'uncommon', weaponClass: 'sword', damageType: 'physical', stats: {}, recipe: { scrap: 8, beastBone: 6, bearClaw: 4 } },
  { id: 'natureBow', name: 'Nature Bow', icon: '🏹', kind: 'weapon', rarity: 'uncommon', weaponClass: 'shortbow', damageType: 'physical', stats: {}, recipe: { bearClaw: 4, twig: 10, scrap: 5 } },
  { id: 'slimeVial', name: 'Slime Vial', icon: '🧪', kind: 'accessory', rarity: 'uncommon', stats: {}, bane: { archetype: 'slime', bonus: 0.1 }, findDrop: { archetype: 'slime', material: 'royalSlime', chance: 0.01, stars: 5 }, recipe: { goo: 15, royalSlime: 2, vampEssence: 3 } },
  { id: 'forestCrossbow', name: 'Crossbow', icon: '🎯', kind: 'weapon', rarity: 'uncommon', weaponClass: 'crossbow', damageType: 'physical', stats: {}, recipe: { royalSlime: 2, twig: 12 } },
  { id: 'forestShield', name: 'Shield', icon: '🛡️', kind: 'armor', armorType: 'shield', rarity: 'uncommon', stats: armorStats('shield', gearTier({ recipe: { royalSlime: 2, scrap: 10 } } as GearDef)), recipe: { royalSlime: 2, scrap: 10 } },
  { id: 'royalGlaive', name: 'Royal Glaive', icon: '🪓', kind: 'melee', rarity: 'uncommon', weaponClass: 'glaive', damageType: 'physical', stats: {}, recipe: { scrap: 10, royalSlime: 2, beastBone: 6 } },
  { id: 'leatherArmor', name: 'Leather Armor', icon: '🦺', kind: 'armor', armorType: 'light', rarity: 'uncommon', stats: armorStats('light', gearTier({ recipe: { pelt: 12, royalSlime: 2 } } as GearDef)), recipe: { pelt: 12, royalSlime: 2 } },
  { id: 'plateArmor', name: 'Plate Armor', icon: '🪖', kind: 'armor', armorType: 'heavy', rarity: 'uncommon', stats: armorStats('heavy', gearTier({ recipe: { scrap: 12, royalSlime: 2 } } as GearDef)), recipe: { scrap: 12, royalSlime: 2 } },
  { id: 'slimeWand', name: 'Slime Wand', icon: '🪄', kind: 'magic', rarity: 'uncommon', weaponClass: 'wand', damageType: 'poison', proc: 0.2, stats: {}, recipe: { twig: 10, royalSlime: 2 } },
  { id: 'sparkWand', name: 'Spark Wand', icon: '🪄', kind: 'magic', rarity: 'uncommon', weaponClass: 'wand', damageType: 'fire', proc: 0.2, stats: {}, recipe: { royalSlime: 2, twig: 10, scrap: 6 } },
  // Later areas
  { id: 'boneCrossbow', name: 'Bone Crossbow', icon: '🎯', kind: 'weapon', rarity: 'uncommon', weaponClass: 'crossbow', tier: 3, damageType: 'physical', stats: { range: 8 }, recipe: { bone: 10, wing: 5 } },
  { id: 'emberLongbow', name: 'Ember Longbow', icon: '🔥', kind: 'weapon', rarity: 'veryRare', weaponClass: 'longbow', tier: 6, damageType: 'fire', proc: 0.3, stats: { rate: 0.12 }, recipe: { ember: 10, chitin: 5 } },
  { id: 'bonePistol', name: 'Bone Pistol', icon: '🔫', kind: 'weapon', rarity: 'rare', weaponClass: 'pistol', tier: 5, damageType: 'physical', stats: {}, recipe: { darkClaw: 6, bone: 8 } },
  { id: 'frostRifle', name: 'Frost Rifle', icon: '🔫', kind: 'weapon', rarity: 'legendary', weaponClass: 'rifle', tier: 8, damageType: 'frost', proc: 0.35, stats: { range: 15 }, recipe: { fur: 10, frost: 5 } },
  // Its volleys start with Arcane and cycle through every element, one per bolt (shown as Special).
  { id: 'elementalCataclysm', name: 'Elemental Cataclysm', icon: '🌈', kind: 'weapon', rarity: 'exalted', weaponClass: 'repeater', tier: 12, damageType: 'arcane', extraTypes: ['fire', 'frost', 'acid', 'poison', 'lightning', 'radiant', 'decay', 'void'], perShot: true, special: true, proc: 0.25, stats: { rate: 0.2 }, recipe: { soul: 10, void: 8, shade: 8 } },
  { id: 'voidRepeater', name: 'Void Repeater', icon: '🌀', kind: 'weapon', rarity: 'exalted', weaponClass: 'repeater', tier: 12, damageType: 'void', stats: { rate: 0.2 }, recipe: { shade: 10, void: 5 } },
  // Melee
  { id: 'boneMaul', name: 'Bone Maul', icon: '🔨', kind: 'melee', rarity: 'uncommon', weaponClass: 'hammer', tier: 3, damageType: 'physical', stats: {}, recipe: { bone: 12, flesh: 6 } },
  { id: 'ironSpear', name: 'Bone Spear', icon: '🔱', kind: 'melee', rarity: 'uncommon', weaponClass: 'spear', tier: 3, damageType: 'physical', proc: 0.2, stats: {}, recipe: { bone: 10, flesh: 5 } },
  { id: 'magmaGlaive', name: 'Magma Glaive', icon: '🪓', kind: 'melee', rarity: 'veryRare', weaponClass: 'glaive', tier: 6, damageType: 'fire', proc: 0.4, stats: { range: 6 }, recipe: { demonTooth: 8, magma: 6 } },
  { id: 'soulLance', name: 'Soulreaver Lance', icon: '⚜️', kind: 'melee', rarity: 'exalted', weaponClass: 'spear', tier: 12, damageType: 'decay', proc: 0.2, stats: { pierce: 0.2 }, recipe: { soul: 8, void: 4 } },
  // Magic (Andrejz and Glimmer)
  { id: 'gravewoodStaff', name: 'Gravewood Staff', icon: '🪵', kind: 'magic', rarity: 'uncommon', weaponClass: 'staff', tier: 3, damageType: 'decay', proc: 0.15, stats: { rate: 0.06 }, recipe: { sacredText: 8, vampEssence: 5 } },
  { id: 'emberFocus', name: 'Ember Focus', icon: '🕯️', kind: 'magic', rarity: 'veryRare', weaponClass: 'focus', tier: 6, damageType: 'fire', proc: 0.3, stats: { rate: 0.15 }, tweak: { wave: true }, recipe: { ember: 10, demonBone: 5 } },
  { id: 'crystalFocus', name: 'Crystal Focus', icon: '💎', kind: 'magic', rarity: 'legendary', weaponClass: 'focus', tier: 8, damageType: 'frost', proc: 0.3, stats: { rate: 0.1 }, recipe: { frost: 8, ecto: 6 } },
  { id: 'voidScepter', name: 'Void Scepter', icon: '🪬', kind: 'magic', rarity: 'exalted', weaponClass: 'scepter', tier: 12, damageType: 'void', stats: { rate: 0.25 }, recipe: { shade: 10, void: 5 } },
  { id: 'wispTome', name: 'Tome of Wisps', icon: '📖', kind: 'magic', rarity: 'uncommon', weaponClass: 'tome', tier: 3, damageType: 'arcane', proc: 0.15, stats: {}, recipe: { nightmareWisp: 10, sacredText: 6, calciumCrystal: 2 } },
  {
    id: 'wolfTome',
    name: 'Tome of the Wolf Spirit',
    icon: '🐺',
    kind: 'magic',
    rarity: 'uncommon',
    weaponClass: 'tome',
    tier: 2,
    damageType: 'physical',
    stats: {},
    recipe: { pelt: 24 },
    summon: { look: 'wolf', name: 'wolf spirit', dash: { cooldown: 4, range: 150, speed: 520, damage: 2.5 } },
    ability: 'Its wolves lunge at a monster every 4s; a lunge that lands bites for ×2.5.',
  },
  { id: 'soulfireStaff', name: 'Soulfire Staff', icon: '🌟', kind: 'magic', rarity: 'exalted', weaponClass: 'staff', tier: 12, damageType: 'radiant', proc: 0.2, stats: { rate: 0.15 }, tweak: { bolts: 8 }, recipe: { soul: 8, void: 4 } },
  // A weapon for every area tier (ranged, melee and magic), crafted from that area's materials.
  { id: 'thornLongbow', name: 'Thorn Longbow', icon: '🌿', kind: 'weapon', rarity: 'uncommon', weaponClass: 'longbow', tier: 2, damageType: 'physical', stats: {}, recipe: { thorn: 10, sap: 5 } },
  { id: 'thornSpear', name: 'Thorn Spear', icon: '🌱', kind: 'melee', rarity: 'uncommon', weaponClass: 'spear', tier: 2, damageType: 'poison', proc: 0.2, stats: {}, recipe: { thorn: 8, enchantedBone: 5 } },
  { id: 'faerieWand', name: 'Faerie Scepter', icon: '🧚', kind: 'magic', rarity: 'uncommon', weaponClass: 'scepter', tier: 2, damageType: 'arcane', proc: 0.15, stats: {}, recipe: { unicornHorn: 6, dust: 8, regalEssence: 2 } },
  { id: 'bansheeBow', name: 'Banshee Bow', icon: '👻', kind: 'weapon', rarity: 'rare', weaponClass: 'longbow', tier: 4, damageType: 'decay', proc: 0.2, stats: {}, recipe: { undeadFeather: 10, string: 5 } },
  { id: 'knightGlaive', name: 'Bone Knight Glaive', icon: '🪓', kind: 'melee', rarity: 'rare', weaponClass: 'glaive', tier: 4, damageType: 'physical', stats: {}, recipe: { enchantedScrap: 8, enchantedBone: 6 } },
  { id: 'necroTome', name: 'Necronomicon', icon: '📕', kind: 'magic', rarity: 'rare', weaponClass: 'tome', summonType: 'undead', tier: 4, damageType: 'decay', proc: 0.2, stats: {}, recipe: { grave: 8, wrap: 8, eldritchText: 2 } },
  { id: 'gloomPistol', name: 'Gloom Pistol', icon: '🔫', kind: 'weapon', rarity: 'rare', weaponClass: 'pistol', tier: 5, damageType: 'arcane', proc: 0.15, stats: {}, recipe: { darkClaw: 10, umbralEye: 4 } },
  { id: 'umbralDagger', name: 'Umbral Dagger', icon: '🗡️', kind: 'melee', rarity: 'rare', weaponClass: 'dagger', tier: 5, damageType: 'physical', proc: 0.3, stats: {}, tweak: { thrusts: 5, rate: 0.65 }, recipe: { darkClaw: 8, shadowWisp: 6 } },
  { id: 'umbralFocus', name: 'Umbral Focus', icon: '🌑', kind: 'magic', rarity: 'rare', weaponClass: 'focus', tier: 5, damageType: 'arcane', proc: 0.25, stats: {}, recipe: { umbralEye: 8, umbra: 4, everwatchingEye: 2 } },
  { id: 'mithrilCrossbow', name: 'Mithril Crossbow', icon: '🎯', kind: 'weapon', rarity: 'veryRare', weaponClass: 'crossbow', tier: 7, damageType: 'physical', stats: {}, recipe: { ore: 10, scale: 5 } },
  { id: 'drakeHammer', name: 'Drakebone Hammer', icon: '🔨', kind: 'melee', rarity: 'veryRare', weaponClass: 'hammer', tier: 7, damageType: 'fire', proc: 0.3, stats: {}, recipe: { scale: 10, ore: 6 } },
  { id: 'drakeScepter', name: 'Drake Scepter', icon: '🐉', kind: 'magic', rarity: 'veryRare', weaponClass: 'scepter', tier: 7, damageType: 'fire', proc: 0.25, stats: {}, recipe: { scale: 8, magma: 6 } },
  { id: 'frostbiteBlade', name: 'Frostbite Blade', icon: '❄️', kind: 'melee', rarity: 'legendary', weaponClass: 'sword', tier: 8, damageType: 'frost', proc: 0.3, stats: {}, recipe: { frost: 10, fur: 6 } },
  { id: 'skyLongbow', name: 'Skyward Longbow', icon: '🏹', kind: 'weapon', rarity: 'exotic', weaponClass: 'longbow', tier: 9, damageType: 'physical', stats: {}, recipe: { plume: 10, skystone: 5 } },
  { id: 'griffinSpear', name: 'Griffin Spear', icon: '🔱', kind: 'melee', rarity: 'exotic', weaponClass: 'spear', tier: 9, damageType: 'physical', proc: 0.2, stats: {}, recipe: { plume: 8, skystone: 6 } },
  { id: 'skyStaff', name: 'Sky Staff', icon: '🌤️', kind: 'magic', rarity: 'exotic', weaponClass: 'staff', tier: 9, damageType: 'lightning', proc: 0.2, stats: {}, tweak: { bolts: 3 }, recipe: { skystone: 10, plume: 4 } },
  { id: 'thunderRepeater', name: 'Thunder Repeater', icon: '⚡', kind: 'weapon', rarity: 'relic', weaponClass: 'repeater', tier: 10, damageType: 'lightning', proc: 0.2, stats: {}, recipe: { thunder: 10, feather: 5 } },
  { id: 'stormbreaker', name: 'Stormbreaker', icon: '🔨', kind: 'melee', rarity: 'relic', weaponClass: 'hammer', tier: 10, damageType: 'lightning', proc: 0.25, stats: {}, recipe: { thunder: 12, feather: 6 } },
  { id: 'stormTome', name: 'Tome of Storms', icon: '📘', kind: 'magic', rarity: 'relic', weaponClass: 'tome', summonType: 'elemental', tier: 10, damageType: 'lightning', proc: 0.2, stats: {}, recipe: { feather: 10, thunder: 6 } },
  { id: 'meteorRifle', name: 'Meteor Rifle', icon: '☄️', kind: 'weapon', rarity: 'artifact', weaponClass: 'rifle', tier: 11, damageType: 'fire', proc: 0.3, stats: {}, recipe: { meteor: 10, stardust: 5 } },
  { id: 'starsteelSword', name: 'Starsteel Sword', icon: '⚔️', kind: 'melee', rarity: 'artifact', weaponClass: 'sword', tier: 11, damageType: 'radiant', proc: 0.25, stats: {}, recipe: { meteor: 10, stardust: 6 } },
  { id: 'starScepter', name: 'Star Scepter', icon: '🌟', kind: 'magic', rarity: 'artifact', weaponClass: 'scepter', tier: 11, damageType: 'radiant', proc: 0.25, stats: {}, recipe: { stardust: 10, meteor: 4 } },
  // Armor: Light, Heavy, Robes and Shields; stats from their kind and tier (armorStats), specials from Very Rare up
  { id: 'silkTunic', name: 'Pixie Silk Tunic', icon: '👚', kind: 'armor', armorType: 'light', rarity: 'uncommon', tier: 2, stats: armorStats('light', 2), recipe: { dust: 8, spore: 5 } },
  { id: 'buckler', name: 'Wooden Buckler', icon: '🛡️', kind: 'armor', armorType: 'shield', rarity: 'uncommon', tier: 2, stats: armorStats('shield', 2), recipe: { sap: 6, enchantedBone: 6 } },
  { id: 'cultistRobe', name: 'Cultist Robe', icon: '🥻', kind: 'armor', armorType: 'robe', rarity: 'uncommon', tier: 3, stats: armorStats('robe', 3), recipe: { robePiece: 10, sacredText: 5 } },
  { id: 'bonePlate', name: 'Bone Plate', icon: '🦴', kind: 'armor', armorType: 'heavy', rarity: 'uncommon', tier: 3, stats: armorStats('heavy', 3), recipe: { bone: 10, flesh: 6 } },
  { id: 'boneShield', name: 'Bone Shield', icon: '🛡️', kind: 'armor', armorType: 'shield', rarity: 'uncommon', tier: 3, stats: armorStats('shield', 3), recipe: { bone: 8, wing: 6 } },
  { id: 'wrapRobe', name: 'Mummy-Wrap Robe', icon: '🧻', kind: 'armor', armorType: 'robe', rarity: 'rare', tier: 4, stats: armorStats('robe', 4), recipe: { wrap: 10, grave: 5 } },
  { id: 'hauntedPlate', name: 'Haunted Plate', icon: '🛡️', kind: 'armor', armorType: 'heavy', rarity: 'rare', tier: 4, stats: armorStats('heavy', 4), recipe: { enchantedScrap: 10, wrap: 5 } },
  { id: 'gloomLeathers', name: 'Gloom Leathers', icon: '🥋', kind: 'armor', armorType: 'light', rarity: 'rare', tier: 5, stats: armorStats('light', 5), recipe: { gloom: 10, umbralSlime: 5 } },
  { id: 'chitinCarapace', name: 'Chitin Carapace', icon: '🪲', kind: 'armor', armorType: 'heavy', rarity: 'veryRare', tier: 6, stats: armorStats('heavy', 6), recipe: { chitin: 10, magma: 5 }, effect: { kind: 'thorns', base: 45, damageType: 'physical' } },
  { id: 'emberRobe', name: 'Ember Robe', icon: '🔥', kind: 'armor', armorType: 'robe', rarity: 'veryRare', tier: 6, stats: armorStats('robe', 6), recipe: { demonWing: 10, ember: 5 }, effect: { kind: 'pulse', base: 45, damageType: 'fire', radius: 90, cooldown: 5 } },
  { id: 'drakeShield', name: 'Drake Shield', icon: '🐉', kind: 'armor', armorType: 'shield', rarity: 'veryRare', tier: 7, stats: armorStats('shield', 7), recipe: { scale: 10, ore: 6 }, effect: { kind: 'block', base: 72, damageType: 'fire', radius: 80 } },
  { id: 'frostMail', name: 'Frost Mail', icon: '🧥', kind: 'armor', armorType: 'heavy', rarity: 'legendary', tier: 8, stats: armorStats('heavy', 8), recipe: { fur: 10, frost: 6 }, effect: { kind: 'block', base: 110, damageType: 'frost', radius: 90 } },
  { id: 'griffinHide', name: 'Griffin Hide', icon: '🪶', kind: 'armor', armorType: 'light', rarity: 'exotic', tier: 9, stats: armorStats('light', 9), recipe: { plume: 10, skystone: 5 }, effect: { kind: 'evade', chance: 0.25 } },
  { id: 'stormplate', name: 'Stormplate', icon: '⚡', kind: 'armor', armorType: 'heavy', rarity: 'relic', tier: 10, stats: armorStats('heavy', 10), recipe: { thunder: 10, feather: 6 }, effect: { kind: 'block', base: 230, damageType: 'lightning', radius: 100 } },
  { id: 'cloudRobe', name: 'Cloudsilk Robe', icon: '☁️', kind: 'armor', armorType: 'robe', rarity: 'relic', tier: 10, stats: armorStats('robe', 10), recipe: { feather: 10, thunder: 5 }, effect: { kind: 'pulse', base: 230, damageType: 'lightning', radius: 110, cooldown: 5 } },
  { id: 'starweave', name: 'Starweave Jerkin', icon: '✨', kind: 'armor', armorType: 'light', rarity: 'artifact', tier: 11, stats: armorStats('light', 11), recipe: { stardust: 10, meteor: 5 }, effect: { kind: 'evade', chance: 0.35 } },
  { id: 'starAegis', name: 'Star Aegis', icon: '🌟', kind: 'armor', armorType: 'shield', rarity: 'artifact', tier: 11, stats: armorStats('shield', 11), recipe: { meteor: 10, stardust: 6 }, effect: { kind: 'block', base: 320, damageType: 'radiant', radius: 110 } },
  { id: 'voidPlate', name: 'Void Plate', icon: '🌀', kind: 'armor', armorType: 'heavy', rarity: 'exalted', tier: 12, stats: armorStats('heavy', 12), recipe: { void: 10, shade: 6 }, effect: { kind: 'thorns', base: 440, damageType: 'void' } },
  { id: 'soulRobe', name: 'Soul Vestments', icon: '👻', kind: 'armor', armorType: 'robe', rarity: 'exalted', tier: 12, stats: armorStats('robe', 12), recipe: { soul: 10, shade: 5 }, effect: { kind: 'pulse', base: 440, damageType: 'void', radius: 120, cooldown: 5 } },
  // Accessories
  { id: 'goldTooth', name: 'Gold Tooth', icon: '🦷', kind: 'accessory', rarity: 'uncommon', stats: { gold: 0.15 }, recipe: { scrap: 8, bone: 6 } },
  { id: 'satchel', name: "Scavenger's Satchel", icon: '👜', kind: 'accessory', rarity: 'uncommon', stats: { drops: 0.15 }, recipe: { robePiece: 6, flesh: 8 } },
  { id: 'emberOrb', name: 'Ember Orb', icon: '🔮', kind: 'accessory', rarity: 'veryRare', stats: { radius: 0.12, damage: 0.08 }, recipe: { ember: 8, magma: 4 } },
  { id: 'hawkeyeLens', name: 'Hawkeye Lens', icon: '🔭', kind: 'accessory', rarity: 'rare', stats: { range: 20 }, recipe: { chitin: 8, umbralEye: 4 } },
  { id: 'soulRing', name: 'Soul Ring', icon: '💍', kind: 'accessory', rarity: 'relic', stats: { damage: 0.25, crit: 0.02 }, recipe: { soul: 6, ecto: 6 } },
  // Accessories with abilities of their own (found on nothing else)
  { id: 'puppetDoll', name: "Puppeteer's Doll", icon: '🪆', kind: 'accessory', rarity: 'rare', tier: 4, stats: {}, recipe: { string: 10, wrap: 5 }, effect: { kind: 'summon', base: 8, damageType: 'physical', look: 'puppet', type: 'construct', name: 'puppet', count: 2, duration: 6, cooldown: 8, bites: 1.5, speed: 140 } },
  { id: 'flameBrand', name: 'Flame Brand', icon: '🔥', kind: 'accessory', rarity: 'veryRare', tier: 6, stats: {}, recipe: { demonTooth: 8, ember: 6, forsakenSoul: 2 }, effect: { kind: 'wave', base: 45, damageType: 'fire', radius: 100, chance: 0.3 } },
  { id: 'frostCharm', name: 'Frostbite Charm', icon: '❄️', kind: 'accessory', rarity: 'legendary', tier: 8, stats: {}, recipe: { frost: 10, ecto: 6 }, effect: { kind: 'chill', radius: 110 } },
  { id: 'thunderTotem', name: 'Thunder Totem', icon: '🗿', kind: 'accessory', rarity: 'relic', tier: 10, stats: {}, recipe: { thunder: 10, feather: 6 }, effect: { kind: 'strike', base: 230, damageType: 'lightning', targets: 3, cooldown: 3, range: 320 } },
  ...GEAR_CATALOG.map(catalogGear),
];

export const gearDef = (id: GearId): GearDef => GEAR.find((g) => g.id === id)!;

/** The Special damage type's look (weapons with `special`: they change elements, or deal too many to list). */
export const SPECIAL_TYPE = { name: 'Special', icon: '✴️', color: '#ffd84a' };

/** Every damage type a piece deals (none for armor and accessories). */
export const gearTypes = (def: GearDef): DamageType[] => (def.damageType ? [def.damageType, ...(def.extraTypes ?? [])] : []);

/** Colour of a gear piece's rarity. */
export const gearColor = (id: GearId): string => RARITIES[gearDef(id).rarity].color;

/** A piece's stats at a star count. */
export function gearStats(def: GearDef, stars: number): Partial<Record<GearStat, number>> {
  const out: Partial<Record<GearStat, number>> = {};
  const st = Math.max(0, Math.min(MAX_EFFECTIVE_STARS, stars));
  // Shield charges grow slowly with stars (a 5★ piece has twice its 1★ charges); everything else ×GEAR_STAR_POWER.
  for (const [k, v] of Object.entries(def.stats) as [GearStat, number][]) out[k] = v * (k === 'guard' ? GUARD_STAR_POWER[st] : GEAR_STAR_POWER[st]);
  return out;
}

/** Shield charges at each star, as a multiple of 1★. */
export const GUARD_STAR_POWER = [0, 1, 1.25, 1.5, 1.75, 2, 2.25];

/** A piece's stats at its stars, plus its armor kind's fixed penalty. */
export function gearTotals(def: GearDef, stars: number): Partial<Record<GearStat, number>> {
  const out = gearStats(def, stars);
  if (def.armorType) for (const [k, v] of Object.entries(ARMOR_TYPES[def.armorType].penalty) as [GearStat, number][]) out[k] = (out[k] ?? 0) + v;
  return out;
}

export function describeGear(stats: Partial<Record<GearStat, number>>): string {
  return (Object.entries(stats) as [GearStat, number][])
    .filter(([k, v]) => (k === 'guard' || k === 'pierce' ? Math.floor(v) >= 1 : v !== 0))
    .map(([k, v]) => (v < 0 ? GEAR_STATS[k](-v).replace(/^\+/, '−') : GEAR_STATS[k](v)))
    .join(', ');
}

/** The type of creature a tome summons. */
export const tomeSummonType = (def: GearDef): SummonType => def.summonType ?? (def.summon?.look === 'wolf' ? 'beast' : 'spirit');

/** A gear effect in words, with its damage at a star count (before the wearer's bonuses). */
export function describeEffect(e: GearEffect, stars: number): string {
  const dmg = 'base' in e ? `${fmtNum(effectBase(e, stars))} ${DAMAGE_TYPES[e.damageType].name}` : '';
  switch (e.kind) {
    case 'thorns':
      return `Thorns: monsters that reach you take ${dmg} damage.`;
    case 'block':
      return `Shield burst: each block blasts ${dmg} damage at everything nearby.`;
    case 'evade':
      return `Evasion: ${Math.round(e.chance * 100)}% chance to slip a monster that reaches you (no stun, no shield used).`;
    case 'pulse':
      return `Pulse: every ${e.cooldown}s, a burst of ${dmg} damage around you.`;
    case 'summon':
      return `Summons ${e.count} ${e.name}s (${SUMMON_TYPES[e.type].icon} ${SUMMON_TYPES[e.type].name}) every ${e.cooldown}s; they hunt for ${e.duration}s, biting for ${dmg} damage.`;
    case 'wave':
      return `Melee attacks have a ${Math.round(e.chance * 100)}% chance to send out a wave of ${dmg} damage.`;
    case 'strike':
      return `Every ${e.cooldown}s, lightning strikes ${e.targets} monsters for ${dmg} damage.`;
    case 'chill':
      return 'Chill aura: monsters near you move at half speed.';
    case 'spell':
      return `${SPELLS[e.spell].name}: ${SPELLS[e.spell].desc} (${dmg} damage)`;
  }
}

/**
 * The spell a staff casts after its bolts: one of its type's (TYPE_SPELLS), taking turns between that type's
 * staffs by tier so neighbouring staffs of one element cast different spells. None for Physical staffs.
 */
export function staffSpell(def: GearDef): SpellId | null {
  if (def.weaponClass !== 'staff' || !def.damageType) return null;
  const spells = TYPE_SPELLS[def.damageType];
  if (!spells.length) return null;
  const peers = GEAR.filter((d) => d.weaponClass === 'staff' && d.damageType === def.damageType).sort((a, b) => (a.tier ?? 0) - (b.tier ?? 0));
  return spells[Math.max(0, peers.indexOf(def)) % spells.length];
}

/** Compact number for item cards (no formatter import here). */
function fmtNum(n: number): string {
  return n >= 100 ? String(Math.round(n)) : String(Math.round(n * 10) / 10);
}

/**
 * The step whose price a star costs (0 = crafting): two thirds of the way (geometrically) through the steps
 * it covers. Its power arrives in one go, so pricing it below the top step keeps the pace about where paying
 * step by step had it (the top step made it slower, the middle one faster).
 */
function starStep(from: number, to: number): number {
  return from === 0 ? 0 : Math.max(from, Math.round(from ** (1 / 3) * to ** (2 / 3)) - 1);
}

/** Materials to go from `stars` to `stars + 1` (0 = crafting it). */
export function gearCost(def: GearDef, stars: number): Partial<Record<MaterialId, number>> {
  const step = starStep(GEAR_STAR_POWER[stars], GEAR_STAR_POWER[stars + 1]);
  return stepsCost(def.recipe, GEAR_COST_GROWTH, step, step + 1);
}

/** The cost of steps `from` … `to − 1` of a recipe whose step `l` costs `recipe × growth^l`. */
export function stepsCost(recipe: Partial<Record<MaterialId, number>>, growth: number, from: number, to: number): Partial<Record<MaterialId, number>> {
  const cost: Partial<Record<MaterialId, number>> = {};
  for (const [m, n] of Object.entries(recipe) as [MaterialId, number][]) {
    let sum = 0;
    for (let l = from; l < to; l++) sum += Math.ceil(n * growth ** l);
    cost[m] = sum;
  }
  return cost;
}

// ---- Upgrades: crafted from materials, permanent, for the whole camp (spawns, drops, gold, an area, offline time) ----
export type ItemId =
  | 'lure'
  | 'pouch'
  | 'idol'
  | 'forestIdol'
  | 'groveIdol'
  | 'graveIdol'
  | 'cryptIdol'
  | 'depthsIdol'
  | 'emberIdol'
  | 'venomIdol'
  | 'frostIdol'
  | 'skyIdol'
  | 'cloudIdol'
  | 'starIdol'
  | 'pixiePotion'
  | 'bonePotion'
  | 'lichPotion'
  | 'watcherPotion'
  | 'demonPotion'
  | 'venomPotion'
  | 'glacialPotion'
  | 'skyPotion'
  | 'stormPotion'
  | 'starPotion';

export interface ItemDef {
  id: ItemId;
  name: string;
  icon: string;
  rarity: Rarity;
  /** Area Upgrades (Idols) change one area: its monsters' spawn rate at a strength, in steps. */
  area?: { id: AreaId; spawn: (level: number) => number };
  /**
   * Its strength at 5★, in steps (1★ is 1 step). Uncommon Upgrades stop at 15, since rarer gear
   * and Upgrades take over from there. The stars between are spread out geometrically.
   */
  maxLevel: number;
  recipe: Partial<Record<MaterialId, number>>;
  /** Material cost multiplier per step already owned. */
  growth: number;
  /** Materials for each star (index 0 = crafting it), instead of `recipe` × `growth` per step. */
  starCosts?: Partial<Record<MaterialId, number>>[];
  /** Crafted once, no stars (an Energy Potion): done at 1★. */
  once?: boolean;
  /** Its pixel icon (a key into public/icons), drawn instead of the emoji. */
  sprite?: string;
  /** What it does at a strength (in steps; see itemLevel). */
  describe: (level: number) => string;
}

/** An area Idol's spawn rate multiplier per star (golems excepted): ×2 at 1★ up to ×10 at 5★. */
export const IDOL_SPAWN_PER_STAR = 2;
/** How many times its 1★ cost each star of an Idol takes: drastically more of the area's drops, a few more ores. */
export const IDOL_DROP_STEPS = [1, 4, 12, 30, 80];
export const IDOL_ORE_STEPS = [1, 2, 3, 4, 5];

/**
 * An area Idol: that area's monsters (all but its golems) spawn ×2 as fast at 1★, up to ×10 at 5★. Each star costs
 * far more of the area's own drops (`drops`), and a little more of the ores and gems (`ores`) from further on.
 */
function areaIdol(id: ItemId, name: string, area: AreaId, rarity: Rarity, drops: Partial<Record<MaterialId, number>>, ores: Partial<Record<MaterialId, number>> = {}): ItemDef {
  const areaName = AREAS.find((a) => a.id === area)!.name;
  const scale = (r: Partial<Record<MaterialId, number>>, k: number) => Object.fromEntries(Object.entries(r).map(([m, n]) => [m, n! * k]));
  const starCosts = IDOL_DROP_STEPS.map((k, i) => ({ ...scale(drops, k), ...scale(ores, IDOL_ORE_STEPS[i]) }));
  return {
    id,
    name,
    icon: AREAS.find((a) => a.id === area)!.icon,
    rarity,
    area: { id: area, spawn: (l) => IDOL_SPAWN_PER_STAR * l },
    maxLevel: 5,
    recipe: starCosts[0],
    starCosts,
    growth: 1,
    describe: (l) => `${areaName} monsters spawn ×${IDOL_SPAWN_PER_STAR * l} (not its golems)`,
  };
}

export const ITEMS: ItemDef[] = [
  { id: 'lure', name: 'Monster Lure', icon: '🍖', rarity: 'uncommon', maxLevel: 15, recipe: { beastBone: 5, pelt: 3 }, growth: 1.6, describe: (l) => `+${l * 20}% enemy spawns` },
  { id: 'pouch', name: "Scavenger's Pouch", icon: '👝', rarity: 'uncommon', maxLevel: 15, recipe: { pelt: 6, scrap: 3 }, growth: 1.5, describe: (l) => `+${l * 25}% material drops` },
  { id: 'idol', name: 'Golden Idol', icon: '🗿', rarity: 'veryRare', maxLevel: 30, recipe: { ember: 6, magma: 3 }, growth: 1.5, describe: (l) => `+${l * 25}% gold` },
  areaIdol('forestIdol', 'Forest Idol', 'forest', 'uncommon', { goo: 10_000, twig: 5_000, bearClaw: 1_000 }),
  // The other areas' Idols: huge amounts of the area's own drops, plus ores and gems from a golem a few areas on.
  areaIdol('groveIdol', 'Fey Grove Idol', 'glade', 'veryRare', { spore: 500_000, dust: 150_000 }, { goldOre: 400, topaz: 120 }),
  areaIdol('graveIdol', 'Graveyard Idol', 'graveyard', 'veryRare', { bone: 1_500_000, flesh: 800_000 }, { silverOre: 1_000, amethyst: 400 }),
  areaIdol('cryptIdol', 'Crypt Idol', 'crypt', 'legendary', { undeadFeather: 4_000_000, string: 800_000 }, { cobaltOre: 2_500, venomite: 750 }),
  areaIdol('depthsIdol', 'Shadowy Depths Idol', 'depths', 'legendary', { darkClaw: 5_000_000, gloom: 3_000_000 }, { frostIron: 2_000, aquamarine: 1_200 }),
  areaIdol('emberIdol', 'Ember Mines Idol', 'caves', 'legendary', { demonBone: 5_000_000, chitin: 2_000_000 }, { coldsteel: 400, sapphire: 250 }),
  areaIdol('venomIdol', 'Venom Caverns Idol', 'mines', 'exotic', { ore: 6_000_000, scale: 600_000 }, { skysteel: 2_000, orichalcum: 400 }),
  areaIdol('frostIdol', 'Frost Peaks Idol', 'peaks', 'relic', { fur: 4_000_000, frost: 1_000_000 }, { opal: 2_000, stormstone: 400 }),
  areaIdol('skyIdol', 'Ascendant Steps Idol', 'cliffs', 'artifact', { plume: 4_000_000, skystone: 1_000_000 }, { starIron: 2_000, adamantite: 400 }),
  areaIdol('cloudIdol', 'Cloud Fortress Idol', 'fortress', 'exalted', { feather: 5_000_000, thunder: 1_500_000 }, { voidsteel: 1_500, voidPrism: 250 }),
  areaIdol('starIdol', 'Meteor Field Idol', 'meteors', 'exalted', { stardust: 5_000_000, meteor: 2_000_000 }, { voidPrism: 500, diamond: 100 }),
  // Energy Potions: crafted once each, 2 more hours of offline time apiece (4 hours to start, 24 with all ten).
  // One an area from the Fey Grove to the Meteor Field (not the Woods or the Rift): a Guardian's spoils early on, rare
  // ores and gems later (Guardian spoils to come for the later areas once they have their own Guardians); each costs
  // a good share of what you'd hold of them on reaching the next area.
  { id: 'pixiePotion', name: 'Pixie Energy Potion', icon: '🧪', sprite: 'rpg-items/230', rarity: 'uncommon', once: true, maxLevel: 1, recipe: { regalEssence: 4, obsidian: 3, dust: 400 }, growth: 1, describe: () => '+2h offline time' },
  { id: 'bonePotion', name: 'Bone Energy Potion', icon: '🧪', sprite: 'rpg-items/110', rarity: 'rare', once: true, maxLevel: 1, recipe: { calciumCrystal: 4, bone: 50_000, sacredText: 5_000 }, growth: 1, describe: () => '+2h offline time' },
  { id: 'lichPotion', name: 'Lich Energy Potion', icon: '🧪', sprite: 'rpg-items/170', rarity: 'rare', once: true, maxLevel: 1, recipe: { eldritchText: 4, grave: 4_000, enchantedBone: 25_000 }, growth: 1, describe: () => '+2h offline time' },
  { id: 'watcherPotion', name: 'Watcher Energy Potion', icon: '🧪', sprite: 'rpg-items/190', rarity: 'veryRare', once: true, maxLevel: 1, recipe: { everwatchingEye: 8, umbra: 6_000, umbralEye: 12_000 }, growth: 1, describe: () => '+2h offline time' },
  { id: 'demonPotion', name: 'Demon Energy Potion', icon: '🧪', sprite: 'rpg-items/130', rarity: 'veryRare', once: true, maxLevel: 1, recipe: { forsakenSoul: 8, goldOre: 75, topaz: 75 }, growth: 1, describe: () => '+2h offline time' },
  { id: 'venomPotion', name: 'Venom Energy Potion', icon: '🧪', sprite: 'rpg-items/050', rarity: 'legendary', once: true, maxLevel: 1, recipe: { cobaltOre: 600, ore: 150_000, emerald: 40 }, growth: 1, describe: () => '+2h offline time' },
  { id: 'glacialPotion', name: 'Glacial Energy Potion', icon: '🧪', sprite: 'rpg-items/030', rarity: 'exotic', once: true, maxLevel: 1, recipe: { coldsteel: 400, sapphire: 200, diamond: 15 }, growth: 1, describe: () => '+2h offline time' },
  { id: 'skyPotion', name: 'Sky Energy Potion', icon: '🧪', sprite: 'rpg-items/250', rarity: 'exotic', once: true, maxLevel: 1, recipe: { orichalcum: 225, skysteel: 1_000, skystone: 12_000 }, growth: 1, describe: () => '+2h offline time' },
  { id: 'stormPotion', name: 'Storm Energy Potion', icon: '🧪', sprite: 'rpg-items/070', rarity: 'artifact', once: true, maxLevel: 1, recipe: { opal: 750, stormstone: 200, thunder: 30_000 }, growth: 1, describe: () => '+2h offline time' },
  { id: 'starPotion', name: 'Star Energy Potion', icon: '🧪', sprite: 'rpg-items/010', rarity: 'artifact', once: true, maxLevel: 1, recipe: { adamantite: 250, starIron: 1_000, diamond: 50 }, growth: 1, describe: () => '+2h offline time' },
];

export const itemDef = (id: ItemId): ItemDef => ITEMS.find((i) => i.id === id)!;

/** An Upgrade's strength (in steps) at each star: 1★ = 1, 5★ = maxLevel, geometric in between. */
const itemLevelCache = new Map<ItemId, number[]>();
export function itemLevels(item: ItemDef): number[] {
  const hit = itemLevelCache.get(item.id);
  if (hit) return hit;
  const out = [0, 1];
  for (let s = 2; s <= MAX_STARS; s++) out.push(Math.max(out[s - 1] + 1, Math.round(item.maxLevel ** ((s - 1) / (MAX_STARS - 1)))));
  out[MAX_STARS] = Math.max(out[MAX_STARS], item.maxLevel);
  itemLevelCache.set(item.id, out);
  return out;
}

/** The stars an Upgrade goes up to: 5, or 1 for one crafted once. */
export const itemMaxStars = (item: ItemDef): number => (item.once ? 1 : MAX_STARS);

/** An Upgrade's strength at a star count. */
export const itemLevel = (item: ItemDef, stars: number): number => itemLevels(item)[Math.max(0, Math.min(MAX_STARS, stars))];

/** Materials to go from `stars` to `stars + 1` (0 = crafting it). */
export function itemCost(item: ItemDef, stars: number): Partial<Record<MaterialId, number>> {
  if (item.starCosts) return { ...item.starCosts[stars] };
  const levels = itemLevels(item);
  const step = starStep(levels[stars], levels[stars + 1]);
  return stepsCost(item.recipe, item.growth, step, step + 1);
}

/**
 * Converts an old level-based piece or Upgrade to stars: the highest star at or below its level, and the
 * materials spent on the levels above that star (refunded).
 */
export function starsFromLevel(levels: number[], level: number, recipe: Partial<Record<MaterialId, number>>, growth: number): { stars: number; refund: Partial<Record<MaterialId, number>> } {
  let stars = 0;
  while (stars < MAX_STARS && levels[stars + 1] <= level) stars++;
  return { stars, refund: level > levels[stars] ? stepsCost(recipe, growth, levels[stars], level) : {} };
}

/**
 * Each area's first event: a swarm of its signature monsters. Only monsters of that archetype spawn, twice as
 * many and twice as fast (at least 10 a second of its first monster). It unlocks after slaying that many of
 * them there, and its Guardian Challenge waits until it has been survived once.
 */
const AREA_SWARMS: Record<AreaId, { id: string; name: string; icon: string; archetype: Archetype; blurb: string; unlockKills: number }> = {
  forest: { id: 'slimeSwarm', name: 'Slime Swarm', icon: '🟢', archetype: 'slime', blurb: 'Slimes flood the forest for 60s', unlockKills: 1000 },
  glade: { id: 'sporeBloom', name: 'Spore Bloom', icon: '🍄', archetype: 'plant', blurb: 'The grove blooms: walking mushrooms and man traps pour in for 60s', unlockKills: 15_000 },
  graveyard: { id: 'nightOfTheDead', name: 'Night of the Dead', icon: '💀', archetype: 'undead', blurb: 'The graves empty for 60s: skeletons, zombies and wraiths', unlockKills: 70_000 },
  crypt: { id: 'carrionFlock', name: 'Carrion Flock', icon: '🐦', archetype: 'beast', blurb: 'A black cloud of carrion crows descends for 60s', unlockKills: 52_000 },
  depths: { id: 'gloomSwarm', name: 'Gloom Swarm', icon: '🌑', archetype: 'beast', blurb: 'Gloomcrawlers and duskmoths boil up from the dark for 60s', unlockKills: 100_000 },
  caves: { id: 'demonSurge', name: 'Demon Surge', icon: '😈', archetype: 'demon', blurb: 'The mines open onto the pit for 60s: imps and hellhounds', unlockKills: 140_000 },
  mines: { id: 'koboldRaid', name: 'Kobold Raid', icon: '⛏️', archetype: 'humanoid', blurb: 'Every kobold in the Caverns comes yipping out at once, for 60s', unlockKills: 125_000 },
  peaks: { id: 'wolfBlizzard', name: 'Wolf Blizzard', icon: '🐺', archetype: 'beast', blurb: 'The pack howls down the mountain in a blizzard for 60s: ice wolves and yetis', unlockKills: 265_000 },
  cliffs: { id: 'harpyStorm', name: 'Harpy Storm', icon: '🪶', archetype: 'beast', blurb: 'Harpies, owls and griffins dive from the sky for 60s', unlockKills: 68_000 },
  fortress: { id: 'cloudburst', name: 'Cloudburst', icon: '☁️', archetype: 'slime', blurb: 'The clouds break open for 60s and cloudlings rain down', unlockKills: 125_000 },
  meteors: { id: 'meteorShower', name: 'Meteor Shower', icon: '☄️', archetype: 'elemental', blurb: 'A meteor shower for 60s: meteorites and comet wisps crash in', unlockKills: 115_000 },
  rift: { id: 'shadowTide', name: 'Shadow Tide', icon: '🌀', archetype: 'slime', blurb: 'The Rift spills over with shadow slimes for 60s', unlockKills: 480_000 },
};

/** Minigames by area (more to come): the third event, opened by recruiting the Hunter who stars in it. */
/** The third event in each area: a minigame starring one of its Hunters, opened by recruiting them. */
const MINIGAME_GOLD = 0.2;
const MINIGAME_COOLDOWN = 20 * 60;
const AREA_MINIGAMES: Partial<Record<AreaId, Omit<EventDef, 'area' | 'kind' | 'unlockKills' | 'duration' | 'cooldown'>>> = {
  forest: {
    id: 'huntingPractice',
    name: "Galladair's Hunting Practice",
    icon: '🏹',
    blurb: 'Slimes hop across the clearing, faster and faster: tap to aim Galladair\'s arrows. Three that get across end it.',
    minigame: 'huntingPractice',
    hunter: 'ranger',
    rewards: { gold: MINIGAME_GOLD, materials: [{ material: 'royalSlime', per: 4 }, { material: 'goo', per: 1 }] },
  },
  glade: {
    id: 'pixieSerenade',
    name: "Ba'al's Pixie Serenade",
    icon: '🪕',
    blurb: 'Notes fall down three lanes: tap each as it crosses the line. Missed notes and empty taps cost a heart.',
    minigame: 'pixieSerenade',
    hunter: 'bard',
    rewards: { gold: MINIGAME_GOLD, materials: [{ material: 'regalEssence', per: 4 }, { material: 'unicornHorn', per: 5 }, { material: 'dust', per: 1 }] },
  },
  graveyard: {
    id: 'graveRobbing',
    name: "Alias's Grave Robbing",
    icon: '🦹',
    blurb: 'Move Alias between the graves with the arrows to grab loot, and dodge the skeletons bursting out of the ground. Sixty seconds.',
    minigame: 'graveRobbing',
    hunter: 'thief',
    rewards: { gold: MINIGAME_GOLD, materials: [{ material: 'calciumCrystal', per: 4 }, { material: 'vampEssence', per: 3 }, { material: 'bone', per: 1 }] },
  },
  crypt: {
    id: 'puppetShow',
    name: "Theon's Puppet Show",
    icon: '🎎',
    blurb: 'Watch the puppets dance, then repeat the sequence. One move longer each round.',
    minigame: 'puppetShow',
    hunter: 'puppeteer',
    rewards: { gold: MINIGAME_GOLD, materials: [{ material: 'eldritchText', per: 4 }, { material: 'wrap', per: 3 }, { material: 'string', per: 1 }] },
  },
  depths: {
    id: 'shootingGallery',
    name: "Wilhelm's Shooting Gallery",
    icon: '🎯',
    blurb: 'Eyes open in the dark: shoot them before they blink shut, and leave the lanterns be.',
    minigame: 'shootingGallery',
    hunter: 'wilhelm',
    rewards: { gold: MINIGAME_GOLD, materials: [{ material: 'everwatchingEye', per: 4 }, { material: 'umbra', per: 3 }, { material: 'umbralEye', per: 1 }] },
  },
  caves: {
    id: 'forgeStrike',
    name: "Kargesh's Forge Strike",
    icon: '⚒️',
    blurb: 'Strike the metal when the marker is in the sweet spot. Pays in ores and gems, and a good score blesses your next Refine.',
    minigame: 'forgeStrike',
    hunter: 'blacksmith',
    rewards: {
      gold: MINIGAME_GOLD,
      materials: [
        { material: 'ironOre', per: 4 },
        { material: 'quartz', per: 8 },
        { material: 'silverOre', per: 12 },
        { material: 'amethyst', per: 20 },
        { material: 'goldOre', per: 24 },
        { material: 'topaz', per: 32 },
        { material: 'emerald', per: 48 },
        { material: 'diamond', per: 80 },
      ],
    },
    blessing: { kind: 'refine', tiers: [140, 240, 360] },
  },
  mines: {
    id: 'runeMatch',
    name: "Marceline's Rune Match",
    icon: '✨',
    blurb: 'Remember the cards, then find the pairs once they\'re turned over: the board grows each time you clear it. A good score blesses your next Enchant.',
    minigame: 'runeMatch',
    hunter: 'enchantress',
    rewards: { gold: MINIGAME_GOLD, materials: [{ material: 'venomite', per: 8 }, { material: 'cobaltOre', per: 3 }, { material: 'ore', per: 3 }] },
    blessing: { kind: 'enchant', tiers: [50, 85, 120] },
  },
  peaks: {
    id: 'icebreaker',
    name: "Okrin's Icebreaker",
    icon: '🔨',
    blurb: 'Smash the falling icicles before they reach the camp. Big ones take two blows.',
    minigame: 'icebreaker',
    hunter: 'frostbreaker',
    rewards: { gold: MINIGAME_GOLD, materials: [{ material: 'ecto', per: 4 }, { material: 'coldsteel', per: 5 }, { material: 'frostIron', per: 2 }, { material: 'frost', per: 1 }] },
  },
};

export const EVENTS: EventDef[] = AREAS.flatMap((a): EventDef[] => {
  const sw = AREA_SWARMS[a.id];
  const first = ENEMIES.find((e) => e.area === a.id && e.archetype === sw.archetype && e.unlock === 0) ?? ENEMIES.find((e) => e.area === a.id && e.archetype === sw.archetype)!;
  const out: EventDef[] = [
    {
      id: sw.id,
      area: a.id,
      kind: 'swarm',
      name: sw.name,
      icon: sw.icon,
      blurb: `${sw.blurb}: twice as many (at least 10 ${first.name}s a second), twice as fast.`,
      unlockKills: sw.unlockKills,
      unlockArchetype: sw.archetype,
      cooldown: 15 * 60,
      duration: 60,
      archetype: sw.archetype,
      spawnMult: 2,
      speedMult: 2,
      minSpawn: { [first.id]: 10 },
    },
  ];
  if (Number.isFinite(a.mastery))
    out.push({
      id: `guardian-${a.id}`,
      area: a.id,
      kind: 'guardian',
      name: 'Guardian Challenge',
      icon: '⚔️',
      blurb: enemyDef(GUARDIAN_ENEMY[a.id]).guardianOnly
        ? `Bring down the ${enemyDef(GUARDIAN_ENEMY[a.id]).name}, the ${a.name} Guardian, within ${GUARDIAN_TIME}s.`
        : `Bring down the ${a.name} Guardian within ${GUARDIAN_TIME}s.`,
      unlockKills: a.mastery,
      cooldown: GUARDIAN_COOLDOWN,
      duration: GUARDIAN_TIME,
      requires: { event: sw.id, times: 1 },
    });
  const mg = AREA_MINIGAMES[a.id];
  if (mg) out.push({ ...mg, area: a.id, kind: 'minigame', unlockKills: 0, duration: 0, cooldown: MINIGAME_COOLDOWN });
  return out;
});

export const eventDef = (id: string): EventDef => EVENTS.find((e) => e.id === id)!;

/** Your Hunter's sessions from Lv 1 to 100, and from becoming the Slayer to Lv 200. */
export const MAIN_SESSIONS_TO_ASCEND = sessionsToLevel(MAIN_ASCEND_LEVEL);
export const MAIN_SESSIONS_AFTER_ASCEND = sessionsAfterAscending(MAIN_ASCEND_LEVEL, MAIN_MAX_LEVEL);
