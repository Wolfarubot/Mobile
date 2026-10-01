// All tunable numbers, content tables and pure formulas live here so balancing never touches game flow code.

// ---- Player & combat ----
export const BASE_FIRE_RATE = 1.6; // volleys per second
export const MAX_ENEMIES = 160;
export const BULLET_SPEED = 520;
export const MULTISHOT_SPREAD = 0.2; // radians between projectiles in a volley
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
export const OFFLINE_CAP_SEC = 8 * 3600;
/** Fraction of the online kill rate earned while away. */
export const OFFLINE_EFFICIENCY = 0.5;
/** Shorter absences are granted silently (no Welcome Back popup), e.g. when switching apps. */
export const OFFLINE_POPUP_SEC = 15 * 60;

// ---- Events: timed challenges per area, unlocked by slaying monsters there, then on a cooldown ----
export type EventKind = 'guardian' | 'swarm';

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
  | 'guard' // shield charges before being stunned
  | 'rally' // shield charges granted to every other Hunter
  | 'gold' // +x gold from their kills
  | 'drops' // +x materials from their kills
  | 'tapPower' // +x tap blast damage
  | 'tapSize'; // +x tap blast area

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
  /** Grid position in the tree: column 0–2, row from the top. */
  col: number;
  row: number;
}
export type SkillNode = TreeNode<TreeStat>;

/** Recovery Speed: each rank shortens stuns by this factor. */
export const SKILL_RECOVERY = 0.92;

type NodeSpec = Pick<SkillNode, 'name' | 'icon' | 'desc' | 'maxRank' | 'effect' | 'cost'>;

/**
 * Every tree has the same shape: a signature root; three branches of Attack Power, Attack Speed and
 * Recovery Speed; one signature node under each branch; and a capstone reached from any of them.
 */
function skillTree(root: NodeSpec, branches: [NodeSpec, NodeSpec, NodeSpec], capstone: NodeSpec): SkillNode[] {
  const core: [NodeSpec, NodeSpec, NodeSpec] = [
    { name: 'Attack Power', icon: '💪', desc: '+10% damage per rank.', maxRank: 10, effect: { damage: 0.1 } },
    { name: 'Attack Speed', icon: '⚡', desc: '+10% attack rate per rank.', maxRank: 10, effect: { rate: 0.1 } },
    { name: 'Recovery Speed', icon: '🧘', desc: 'Stuns wear off 8% faster per rank.', maxRank: 5, effect: { recovery: 1 } },
  ];
  const ids = ['power', 'speed', 'recovery'];
  return [
    { id: 'root', ...root, requires: [], col: 1, row: 0 },
    ...core.map((n, i) => ({ id: ids[i], ...n, requires: ['root'], col: i, row: 1 })),
    ...branches.map((n, i) => ({ id: `${ids[i]}2`, ...n, requires: [ids[i]], col: i, row: 2 })),
    { id: 'capstone', ...capstone, requires: ids.map((x) => `${x}2`), col: 1, row: 3 },
  ];
}

// ---- Your Hunter: a longer first tree (Lv 90), Ascend at Lv 100 to become the Slayer, then on to Lv 200 ----

/** Rows below your first tree's capstone: 50 more points, finishing with Legend (so the whole tree is done at Lv 90). */
const MAIN_VETERAN_NODES: SkillNode[] = [
  { id: 'might', name: "Hunter's Might", icon: '🗡️', desc: '+5% damage per rank.', maxRank: 10, effect: { damage: 0.05 }, requires: ['capstone'], col: 0, row: 4 },
  { id: 'haste', name: "Hunter's Haste", icon: '💨', desc: '+5% attack rate per rank.', maxRank: 10, effect: { rate: 0.05 }, requires: ['capstone'], col: 1, row: 4 },
  { id: 'will', name: 'Iron Will', icon: '🪨', desc: 'Stuns wear off 8% faster per rank.', maxRank: 5, effect: { recovery: 1 }, requires: ['capstone'], col: 2, row: 4 },
  { id: 'deadlyTaps', name: 'Deadly Taps', icon: '👊', desc: '+25% tap blast damage per rank.', maxRank: 5, effect: { tapPower: 0.25 }, requires: ['might'], col: 0, row: 5 },
  { id: 'keenEye', name: 'Keen Eye', icon: '🦅', desc: '+1% crit chance per rank.', maxRank: 5, effect: { crit: 0.01 }, requires: ['haste'], col: 1, row: 5 },
  { id: 'wideTaps', name: 'Wide Taps', icon: '🌀', desc: '+8% tap blast area per rank.', maxRank: 5, effect: { tapSize: 0.08 }, requires: ['will'], col: 2, row: 5 },
  { id: 'legend', name: 'Legend', icon: '🏆', desc: '+50% damage and +20% attack rate.', maxRank: 1, cost: 10, effect: { damage: 0.5, rate: 0.2 }, requires: ['deadlyTaps', 'keenEye', 'wideTaps'], col: 1, row: 6 },
];

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
  col: 1,
  row: 7,
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

/** The Slayer's tree (100 points: Lv 101–200), its capstone the last 21 points. */
export const SLAYER_TREE: SkillNode[] = skillTree(
  { name: "Slayer's Oath", icon: '⚔️', desc: '+30% damage and +10% attack rate.', maxRank: 1, cost: 4, effect: { damage: 0.3, rate: 0.1 } },
  [
    { name: 'Precision', icon: '🎯', desc: '+1% crit chance per rank.', maxRank: 10, effect: { crit: 0.01 } },
    { name: 'Tap Fury', icon: '💥', desc: '+30% tap blast damage per rank.', maxRank: 10, effect: { tapPower: 0.3 } },
    { name: 'Tap Reach', icon: '🌊', desc: '+8% tap blast area per rank.', maxRank: 10, effect: { tapSize: 0.08 } },
  ],
  { name: 'Godslayer', icon: '👑', desc: '+100% damage, +25% attack rate and +5% crit chance.', maxRank: 1, cost: 21, effect: { damage: 1, rate: 0.25, crit: 0.05 } },
).map((n) =>
  n.id === 'power'
    ? { ...n, name: 'Carnage', icon: '🩸', desc: '+5% damage per rank.', maxRank: 20, effect: { damage: 0.05 } }
    : n.id === 'speed'
      ? { ...n, name: 'Frenzy', icon: '⚡', desc: '+5% attack rate per rank.', maxRank: 20, effect: { rate: 0.05 } }
      : n.id === 'recovery'
        ? { ...n, name: 'Unbreakable', icon: '🗿' }
        : n,
);

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
 * The tree a Hunter grows after ascending (50 points: Lv 51–100). The same shape as the first tree; its
 * capstone is theirs alone and is the last 8 points, so it opens at Lv 100.
 */
function ascendedTree(capstone: NodeSpec): SkillNode[] {
  return skillTree(
    { name: 'Awakening', icon: '🌅', desc: '+20% damage and +10% attack rate.', maxRank: 1, cost: 2, effect: { damage: 0.2, rate: 0.1 } },
    [
      { name: 'Precision', icon: '🎯', desc: '+2% crit chance per rank.', maxRank: 5, effect: { crit: 0.02 } },
      { name: 'Reach', icon: '📏', desc: '+15 range per rank.', maxRank: 5, effect: { range: 15 } },
      { name: 'Fortune', icon: '🍀', desc: '+10% gold and materials from their kills per rank.', maxRank: 5, effect: { gold: 0.1, drops: 0.1 } },
    ],
    { cost: 8, ...capstone },
  ).map((n) =>
    n.id === 'power'
      ? { ...n, name: 'Mastery', icon: '⚔️', desc: '+8% damage per rank.', effect: { damage: 0.08 } }
      : n.id === 'speed'
        ? { ...n, name: 'Fervor', icon: '🔥', desc: '+8% attack rate per rank.', effect: { rate: 0.08 } }
        : n.id === 'recovery'
          ? { ...n, name: 'Resolve', icon: '🗿' }
          : n,
  );
}

/** Each Guild Hunter's ascended tree. */
export const ASCENDED_TREES: Record<HunterId, SkillNode[]> = {
  alchemist: ascendedTree({ name: "Philosopher's Stone", icon: '💠', desc: '+100% damage and puddles 20% wider.', maxRank: 1, effect: { damage: 1, radius: 0.2 } }),
  ranger: ascendedTree({ name: 'Hundred Arrows', icon: '🏹', desc: '+100% damage; arrows pierce 2 more enemies.', maxRank: 1, effect: { damage: 1, pierce: 2 } }),
  glimmer: ascendedTree({ name: 'Starfire', icon: '☄️', desc: '+100% damage and explosions 30% wider.', maxRank: 1, effect: { damage: 1, radius: 0.3 } }),
  gravewarden: ascendedTree({ name: 'Dawn Eternal', icon: '🌄', desc: '+100% damage and pulses reach 30% further.', maxRank: 1, effect: { damage: 1, radius: 0.3 } }),
  lance: ascendedTree({ name: 'Aegis', icon: '🛡️', desc: '+100% damage and 2 more shield charges.', maxRank: 1, effect: { damage: 1, guard: 2 } }),
  prospector: ascendedTree({ name: 'Midas Touch', icon: '👑', desc: '+100% damage and +50% gold from their kills.', maxRank: 1, effect: { damage: 1, gold: 0.5 } }),
  demonbane: ascendedTree({ name: 'Hellsbane', icon: '🔥', desc: '+100% damage and +1× extra damage to Demons.', maxRank: 1, effect: { damage: 1, bane: 1 } }),
  wilhelm: ascendedTree({ name: 'One Shot', icon: '🎯', desc: '+100% damage and +10% crit chance.', maxRank: 1, effect: { damage: 1, crit: 0.1 } }),
  celeste: ascendedTree({ name: 'Omniscience', icon: '🧠', desc: '+100% damage and +10% crit chance.', maxRank: 1, effect: { damage: 1, crit: 0.1 } }),
  scavenger: ascendedTree({ name: 'Hoard', icon: '💎', desc: '+100% damage and +50% materials from their kills.', maxRank: 1, effect: { damage: 1, drops: 0.5 } }),
  frostbreaker: ascendedTree({ name: 'Eternal Winter', icon: '❄️', desc: '+100% damage and +1× extra damage to Elementals.', maxRank: 1, effect: { damage: 1, bane: 1 } }),
};

/** Each Hunter's skill tree ('main' is yours). */
export const SKILL_TREES: Record<'main' | HunterId, SkillNode[]> = {
  main: [
    ...skillTree(
      { name: "Hunter's Instinct", icon: '👁️', desc: '+5% crit chance.', maxRank: 1, effect: { crit: 0.05 } },
      [
        { name: 'Tap Power', icon: '👆', desc: '+50% tap blast damage per rank.', maxRank: 5, effect: { tapPower: 0.5 } },
        { name: 'Split Shot', icon: '🔱', desc: 'Shots pierce 1 more enemy per rank.', maxRank: 2, effect: { pierce: 1 } },
        { name: 'Tap Size', icon: '💥', desc: '+15% tap blast area per rank.', maxRank: 5, effect: { tapSize: 0.15 } },
      ],
      { name: 'Apex Hunter', icon: '👑', desc: '+25% damage and +10% attack rate.', maxRank: 1, effect: { damage: 0.25, rate: 0.1 } },
    ),
    ...MAIN_VETERAN_NODES,
  ],
  alchemist: skillTree(
    { name: 'Toxic Brew', icon: '🧪', desc: 'Poison puddles spread 15% wider.', maxRank: 1, effect: { radius: 0.15 } },
    [
      { name: 'Slime Bane', icon: '🟢', desc: '+0.5× extra damage to Slimes per rank.', maxRank: 3, effect: { bane: 0.5 } },
      { name: 'Wide Splash', icon: '💦', desc: 'Puddles 15% wider per rank.', maxRank: 3, effect: { radius: 0.15 } },
      { name: 'Lucky Finds', icon: '🍀', desc: '+15% materials from her kills per rank.', maxRank: 3, effect: { drops: 0.15 } },
    ],
    { name: 'Grand Alchemy', icon: '⚗️', desc: '+25% damage, puddles 15% wider.', maxRank: 1, cost: 4, effect: { damage: 0.25, radius: 0.15 } },
  ),
  ranger: skillTree(
    { name: 'Trueshot', icon: '🎯', desc: '+20 range.', maxRank: 1, effect: { range: 20 } },
    [
      { name: 'Beast Bane', icon: '🐾', desc: '+0.5× extra damage to Beasts per rank.', maxRank: 3, effect: { bane: 0.5 } },
      { name: 'Longshot', icon: '🏹', desc: '+25 range per rank.', maxRank: 3, effect: { range: 25 } },
      { name: 'Piercing Arrows', icon: '➶', desc: 'Arrows pierce 1 more enemy per rank.', maxRank: 2, effect: { pierce: 1 } },
    ],
    { name: 'Volley', icon: '🌧️', desc: '+20% attack rate and +10% damage.', maxRank: 1, cost: 5, effect: { rate: 0.2, damage: 0.1 } },
  ),
  glimmer: skillTree(
    { name: 'Kindling', icon: '🔥', desc: 'Fireball explosions 10% wider.', maxRank: 1, effect: { radius: 0.1 } },
    [
      { name: 'Inferno', icon: '🌋', desc: '+15% damage per rank.', maxRank: 5, effect: { damage: 0.15 } },
      { name: 'Wildfire', icon: '💥', desc: 'Explosions 15% wider per rank.', maxRank: 3, effect: { radius: 0.15 } },
      { name: 'Arcane Focus', icon: '🔮', desc: '+3% crit chance per rank.', maxRank: 3, effect: { crit: 0.03 } },
    ],
    { name: 'Meteor', icon: '☄️', desc: '+30% damage, explosions 20% wider.', maxRank: 1, cost: 2, effect: { damage: 0.3, radius: 0.2 } },
  ),
  gravewarden: skillTree(
    { name: 'Consecration', icon: '✨', desc: 'Holy pulses reach 10% further.', maxRank: 1, effect: { radius: 0.1 } },
    [
      { name: 'Undead Bane', icon: '💀', desc: '+0.5× extra damage to Undead per rank.', maxRank: 3, effect: { bane: 0.5 } },
      { name: 'Holy Radiance', icon: '🌟', desc: 'Pulses reach 15% further per rank.', maxRank: 3, effect: { radius: 0.15 } },
      { name: 'Sanctuary', icon: '⛪', desc: 'Stuns wear off 8% faster per rank.', maxRank: 3, effect: { recovery: 1 } },
    ],
    { name: 'Divine Wrath', icon: '⚡', desc: '+30% damage.', maxRank: 1, cost: 4, effect: { damage: 0.3 } },
  ),
  lance: skillTree(
    { name: 'Zone of Protection', icon: '🛡️', desc: 'His shield: blocks 3 hits before he is stunned, regaining a charge every few seconds.', maxRank: 1, effect: { guard: 3 } },
    [
      { name: 'Piercing Thrust', icon: '🔱', desc: '+10 reach per rank.', maxRank: 3, cost: 2, effect: { range: 10 } },
      { name: 'Bulwark', icon: '🧱', desc: 'His shield blocks 1 more hit per rank.', maxRank: 2, effect: { guard: 1 } },
      { name: 'Rallying Oath', icon: '📯', desc: 'Every other Hunter (you too) gets a 1-hit shield.', maxRank: 1, effect: { rally: 1 } },
    ],
    { name: 'Holy Lance', icon: '⚜️', desc: '+30% damage and 1 more shield charge.', maxRank: 1, cost: 4, effect: { damage: 0.3, guard: 1 } },
  ),
  prospector: skillTree(
    { name: 'Gold Rush', icon: '💰', desc: '+25% gold from his kills.', maxRank: 1, effect: { gold: 0.25 } },
    [
      { name: 'Buckshot', icon: '💥', desc: '+15% damage per rank.', maxRank: 3, effect: { damage: 0.15 } },
      { name: 'Prospecting', icon: '⛏️', desc: '+25% gold from his kills per rank.', maxRank: 3, effect: { gold: 0.25 } },
      { name: 'Lucky Strike', icon: '🎲', desc: '+3% crit chance per rank.', maxRank: 3, effect: { crit: 0.03 } },
    ],
    { name: 'Motherlode', icon: '🏆', desc: '+50% gold and +15% damage.', maxRank: 1, cost: 4, effect: { gold: 0.5, damage: 0.15 } },
  ),
  demonbane: skillTree(
    { name: 'Hexed Blades', icon: '🗡️', desc: '+5% crit chance.', maxRank: 1, effect: { crit: 0.05 } },
    [
      { name: 'Demon Bane', icon: '😈', desc: '+0.5× extra damage to Demons per rank.', maxRank: 3, effect: { bane: 0.5 } },
      { name: 'Flurry', icon: '🌪️', desc: '+10% attack rate per rank.', maxRank: 3, effect: { rate: 0.1 } },
      { name: 'Keen Edge', icon: '🔪', desc: '+3% crit chance per rank.', maxRank: 3, effect: { crit: 0.03 } },
    ],
    { name: 'Exorcist', icon: '📿', desc: '+30% damage.', maxRank: 1, cost: 4, effect: { damage: 0.3 } },
  ),
  wilhelm: skillTree(
    { name: 'Steady Aim', icon: '🎯', desc: '+30 range.', maxRank: 1, effect: { range: 30 } },
    [
      { name: 'Deadeye', icon: '👁️', desc: '+4% crit chance per rank.', maxRank: 3, effect: { crit: 0.04 } },
      { name: 'Hollow Point', icon: '🔩', desc: 'Shots pierce 1 more enemy per rank.', maxRank: 2, effect: { pierce: 1 } },
      { name: 'Quickdraw', icon: '🔫', desc: '+10% attack rate per rank.', maxRank: 3, effect: { rate: 0.1 } },
    ],
    { name: 'Marksman', icon: '🏅', desc: '+30% damage and +30 range.', maxRank: 1, cost: 5, effect: { damage: 0.3, range: 30 } },
  ),
  celeste: skillTree(
    { name: 'Mind\'s Eye', icon: '👁️', desc: '+10% damage and +20 range.', maxRank: 1, effect: { damage: 0.1, range: 20 } },
    [
      { name: 'Dragon Bane', icon: '🐉', desc: '+0.5× extra damage to Dragons per rank.', maxRank: 3, effect: { bane: 0.5 } },
      { name: 'Far Reach', icon: '🧠', desc: '+25 range per rank.', maxRank: 3, effect: { range: 25 } },
      { name: 'Insight', icon: '💡', desc: '+3% crit chance per rank.', maxRank: 3, effect: { crit: 0.03 } },
    ],
    { name: 'Transcendence', icon: '👑', desc: '+30% damage and +15% attack rate.', maxRank: 1, cost: 4, effect: { damage: 0.3, rate: 0.15 } },
  ),
  scavenger: skillTree(
    { name: 'Magpie', icon: '🐦', desc: '+20% materials from his kills.', maxRank: 1, effect: { drops: 0.2 } },
    [
      { name: 'Hard Stones', icon: '🪨', desc: '+15% damage per rank.', maxRank: 3, effect: { damage: 0.15 } },
      { name: 'Keen Nose', icon: '👃', desc: '+20% materials per rank.', maxRank: 3, effect: { drops: 0.2 } },
      { name: 'Long Sling', icon: '🎯', desc: '+20 range per rank.', maxRank: 3, effect: { range: 20 } },
    ],
    { name: 'Treasure Trove', icon: '💎', desc: '+40% materials and +20% gold.', maxRank: 1, cost: 4, effect: { drops: 0.4, gold: 0.2 } },
  ),
  frostbreaker: skillTree(
    { name: 'Permafrost', icon: '❄️', desc: '+10% damage.', maxRank: 1, effect: { damage: 0.1 } },
    [
      { name: 'Elemental Bane', icon: '🔷', desc: '+0.5× extra damage to Elementals per rank.', maxRank: 3, effect: { bane: 0.5 } },
      { name: 'Heavy Hammer', icon: '🔨', desc: '+15% damage per rank.', maxRank: 3, effect: { damage: 0.15 } },
      { name: 'Glacial Hide', icon: '🧊', desc: 'Stuns wear off 8% faster per rank.', maxRank: 3, effect: { recovery: 1 } },
    ],
    { name: 'Avalanche', icon: '🏔️', desc: '+30% damage and +10% attack rate.', maxRank: 1, cost: 4, effect: { damage: 0.3, rate: 0.1 } },
  ),
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
  | 'gloom'
  | 'umbra'
  | 'ore'
  | 'scale'
  | 'plume'
  | 'skystone'
  | 'feather'
  | 'thunder'
  | 'meteor'
  | 'stardust'
  | 'goo'
  | 'pelt'
  | 'redgel'
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

export interface MaterialDef {
  id: MaterialId;
  name: string;
  color: string;
  /** A line of flavour for its details card. */
  desc: string;
}

export const MATERIALS: MaterialDef[] = [
  { id: 'goo', name: 'Slime Gel', color: '#7be07b', desc: 'A wobbly glob of green slime. Sticky, harmless, and oddly useful for binding things together.' },
  { id: 'pelt', name: 'Wolf Pelt', color: '#c09060', desc: 'A coarse hide from the beasts of the wilds. Warm, tough, and a favourite of leatherworkers.' },
  { id: 'redgel', name: 'Red Gel', color: '#ff6b6b', desc: 'Angry red slime that still feels warm. It stings a little to hold.' },
  { id: 'bone', name: 'Bone', color: '#efe6cf', desc: 'Old, dry bone from the restless dead. Sturdy enough to carve into blades and charms.' },
  { id: 'flesh', name: 'Rotten Flesh', color: '#9bb56e', desc: "A lump of rotten flesh. It smells exactly as bad as you'd expect." },
  { id: 'wing', name: 'Bat Wing', color: '#8a78b0', desc: 'A leathery bat wing, thin as paper and surprisingly strong.' },
  { id: 'ember', name: 'Ember', color: '#ff8a3d', desc: 'A coal that never quite goes out. It glows brighter when monsters are near.' },
  { id: 'magma', name: 'Magma Gel', color: '#ff4d1a', desc: "Molten gel scooped from the caves and mines. Keep it in something that won't melt." },
  { id: 'chitin', name: 'Chitin', color: '#3fb0a0', desc: 'A hard shell plate from the creatures of the caves and mines. Light, tough and a little shiny.' },
  { id: 'fur', name: 'Frost Fur', color: '#dfefff', desc: 'Thick white fur from the frozen peaks. It keeps out even the bitterest cold.' },
  { id: 'frost', name: 'Frost Shard', color: '#8fdcff', desc: 'A shard of ice that never melts. Cold enough to numb your fingers through gloves.' },
  { id: 'ecto', name: 'Ectoplasm', color: '#c49bff', desc: 'Faintly glowing ectoplasm left behind by spirits. It hums when you hold it.' },
  { id: 'spore', name: 'Glowing Spore', color: '#b8e86a', desc: 'A spore from the Faerie Glade that glows softly green. It sneezes back if you shake it.' },
  { id: 'dust', name: 'Pixie Dust', color: '#ffb8f0', desc: 'Sparkling dust shaken off a pixie. Things sprinkled with it feel a little lighter.' },
  { id: 'wrap', name: 'Mummy Wrap', color: '#e8d8b0', desc: 'Ancient linen from the Forsaken Crypt, still tight around whatever it held.' },
  { id: 'grave', name: 'Grave Dust', color: '#9a8e80', desc: 'Fine grey dust from the oldest tombs in the Crypt. It never quite settles.' },
  { id: 'gloom', name: 'Gloom Silk', color: '#5a4a7a', desc: 'Thread spun in the Shadowy Depths. It drinks the light around it.' },
  { id: 'umbra', name: 'Umbral Pearl', color: '#8a7ea8', desc: 'A dark pearl from the Depths, cold and heavier than it looks.' },
  { id: 'ore', name: 'Mithril Ore', color: '#b8c8d8', desc: 'A silvery ore from the Deep Mines, light and harder than steel.' },
  { id: 'scale', name: 'Drake Scale', color: '#e0603a', desc: 'A scale shed by a fire drake. Still warm, and it never burns.' },
  { id: 'plume', name: 'Griffin Plume', color: '#f0d890', desc: 'A golden feather from the Ascendant Steps. It catches every breeze.' },
  { id: 'skystone', name: 'Sky Stone', color: '#a8b8e0', desc: 'A pale stone from the stairs to the sky. It hangs in the air a moment when dropped.' },
  { id: 'feather', name: 'Storm Feather', color: '#e8f4ff', desc: 'A feather that crackles with static. It never quite settles when you put it down.' },
  { id: 'thunder', name: 'Thunder Crystal', color: '#ffe36e', desc: 'Lightning caught in glass, taken from the storms around the Cloud Fortress.' },
  { id: 'meteor', name: 'Meteor Iron', color: '#c07048', desc: 'Dense, pitted metal from a fallen star. Still warm, and heavier than it looks.' },
  { id: 'stardust', name: 'Stardust', color: '#b8a8ff', desc: 'Sparkling dust from the Meteor Fields. It glows faintly in the dark, like a sky in a jar.' },
  { id: 'shade', name: 'Shadow Gel', color: '#7a5cc0', desc: 'Inky gel from the Rift that swallows the light around it.' },
  { id: 'void', name: 'Void Dust', color: '#ff5fd7', desc: 'Glittering dust from beyond the Rift. It drifts upward when you let it go.' },
  { id: 'soul', name: 'Soul Gem', color: '#6ff0e0', desc: 'A crystal holding a trapped soul. It whispers at night.' },
];

export const materialDef = (id: MaterialId): MaterialDef => MATERIALS.find((m) => m.id === id)!;

// ---- Archetypes: enemy families that Hunters specialize against ----
export type Archetype = 'slime' | 'beast' | 'undead' | 'demon' | 'elemental' | 'humanoid' | 'plant' | 'dragon';

export const ARCHETYPES: Record<Archetype, { name: string; icon: string }> = {
  slime: { name: 'Slime', icon: '🟢' },
  beast: { name: 'Beast', icon: '🐾' },
  undead: { name: 'Undead', icon: '💀' },
  demon: { name: 'Demon', icon: '😈' },
  elemental: { name: 'Elemental', icon: '🔷' },
  humanoid: { name: 'Humanoid', icon: '👤' },
  plant: { name: 'Plant', icon: '🌿' },
  dragon: { name: 'Dragon', icon: '🐉' },
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

export const AREAS: AreaDef[] = [
  { id: 'forest', name: 'Whispering Forest', icon: '🌲', hp: 1, gold: 1, speed: 36, mastery: 10_000, guardian: 1_500, palette: ['#183c18', '#2f7d32', '#7ec850', '#e2f5c4'], ground: ['#6cb848', '#58a03c'], blurb: 'Where every hunt begins.' },
  { id: 'glade', name: 'Faerie Glade', icon: '🍄', hp: 150, gold: 80, speed: 38, mastery: 180_000, guardian: 12_000, palette: ['#221a30', '#5a4a8a', '#a8d8b0', '#f4f0ff'], ground: ['#7cc47c', '#8ed28a'], blurb: 'Mushroom rings and things that bite.' },
  { id: 'graveyard', name: 'Old Graveyard', icon: '🪦', hp: 1_200, gold: 15_000, speed: 40, mastery: 1_100_000, guardian: 150_000, palette: ['#1e1a2a', '#4a4460', '#9a94b0', '#e8e4f0'], ground: ['#5b5670', '#4c4762'], blurb: 'The dead do not rest here.' },
  { id: 'crypt', name: 'Forsaken Crypt', icon: '⚰️', hp: 5_000, gold: 2_000_000, speed: 42, mastery: 1_350_000, guardian: 660_000, palette: ['#1a1614', '#4a403a', '#9a8e80', '#ece4d8'], ground: ['#5a524a', '#4e4640'], blurb: 'Deeper than the graves, and older.' },
  { id: 'depths', name: 'Shadowy Depths', icon: '🕳️', hp: 10_000, gold: 10_000_000_000, speed: 43, mastery: 1_400_000, guardian: 900_000, palette: ['#120e1c', '#3a3050', '#8a7ea8', '#e6e0f4'], ground: ['#2e2838', '#26212f'], blurb: 'Below the crypt, the dark has teeth.' },
  { id: 'caves', name: 'Ember Caves', icon: '🌋', hp: 20_000, gold: 3_000_000_000_000, speed: 45, mastery: 2_200_000, guardian: 3_600_000, palette: ['#2a0e08', '#8a2c10', '#e07030', '#fde4c0'], ground: ['#6a2c1a', '#823722'], blurb: 'Hot, bright and full of teeth.' },
  { id: 'mines', name: 'Deep Mines', icon: '⛏️', hp: 40_000, gold: 100_000_000_000_000, speed: 47, mastery: 3_100_000, guardian: 39_000_000, palette: ['#1e140a', '#6a4a22', '#c09050', '#f4e4c8'], ground: ['#5a4228', '#4e3820'], blurb: 'Dug too deep, woke too much.' },
  { id: 'peaks', name: 'Frost Peaks', icon: '🏔️', hp: 100_000, gold: 3e15, speed: 50, mastery: 5_300_000, guardian: 40_000_000, palette: ['#0c2038', '#2a60a0', '#78b8e8', '#e4f4ff'], ground: ['#bcd8f0', '#a4c6e6'], blurb: 'Cold winds carry cold things.' },
  { id: 'cliffs', name: 'Ascendant Steps', icon: '🪜', hp: 250_000, gold: 5e17, speed: 53, mastery: 2_200_000, guardian: 80_000_000, palette: ['#141c30', '#4a5a86', '#a8b8e0', '#f2f4ff'], ground: ['#9aa6bc', '#8a96ac'], blurb: 'Stone stairs above the peaks, climbing into the sky.' },
  { id: 'fortress', name: 'Cloud Fortress', icon: '🏰', hp: 400_000, gold: 1e19, speed: 54, mastery: 1_200_000, guardian: 60_000_000, palette: ['#1a2440', '#4a70b0', '#a8d0f8', '#fdfcf4'], ground: ['#e8f0fa', '#d4e2f4'], blurb: 'A citadel on the clouds, held by storm and steel.' },
  { id: 'meteors', name: 'Meteor Fields', icon: '☄️', hp: 650_000, gold: 2e20, speed: 55, mastery: 1_300_000, guardian: 150_000_000, palette: ['#0a0a1e', '#3a2a6a', '#e08a4a', '#fce8d0'], ground: ['#1c1830', '#2a2440'], blurb: 'Past the sky, where falling stars still burn.' },
  { id: 'rift', name: 'Void Rift', icon: '🌀', hp: 1_500_000, gold: 5e21, speed: 56, mastery: 1_600_000, guardian: 1_000_000_000, palette: ['#1a0830', '#5a2098', '#b070e0', '#f2e4ff'], ground: ['#2a1440', '#3a1d58'], blurb: 'The end of the known world.' },
];

export const areaDef = (id: AreaId): AreaDef => AREAS.find((a) => a.id === id)!;
export const areaIndex = (id: AreaId): number => AREAS.findIndex((a) => a.id === id);
export const nextAreaOf = (id: AreaId): AreaDef | undefined => AREAS[areaIndex(id) + 1];

// ---- Enemy roster ----
export type EnemyId =
  | 'greenSlime'
  | 'wolf'
  | 'redSlime'
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
  | 'killerBee'
  | 'boar'
  | 'pixie'
  | 'mandragora'
  | 'treant'
  | 'ghoul'
  | 'ghost'
  | 'mummy'
  | 'crow'
  | 'boneKnight'
  | 'banshee'
  | 'necromancer'
  | 'kobold'
  | 'salamander'
  | 'hellhound'
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
  | 'gloomcrawler'
  | 'duskmoth'
  | 'shadowWisp'
  | 'umbralOoze'
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
  /** Gold to add it to its area's horde, as a multiple of the area's base gold (0 = comes with the area). */
  unlock: number;
  /** Placeholder look until real art is added (see src/assets/sprites/README.md). */
  color: string;
  shape: EnemyShape;
  blurb: string;
  /** Damage types that hit it harder (×WEAK_MULT) or softer (×RESIST_MULT). */
  weak: DamageType[];
  resist: DamageType[];
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
  // Whispering Forest
  { id: 'greenSlime', name: 'Green Slime', area: 'forest', archetype: 'slime', hp: 1, speed: 1, gold: 1, spawn: 0.8, pack: [2, 3], radius: 10, material: 'goo', unlock: 0, color: '#7be07b', shape: 'circle', blurb: 'Squishy and plentiful.', weak: ['fire', 'acid'], resist: ['poison'] },
  { id: 'wolf', name: 'Forest Wolf', area: 'forest', archetype: 'beast', hp: 1.3, speed: 1.5, gold: 1.6, spawn: 0.6, pack: [2, 3], radius: 10, material: 'pelt', unlock: 250, color: '#b08a5a', shape: 'triangle', blurb: 'Fast, hunts in pairs.', weak: ['fire'], resist: ['frost'] },
  { id: 'redSlime', name: 'Red Slime', area: 'forest', archetype: 'slime', hp: 2, speed: 0.9, gold: 2.5, spawn: 0.5, pack: [2, 4], radius: 11, material: 'redgel', unlock: 900, color: '#ff6b6b', shape: 'circle', blurb: 'A tougher, angrier slime.', weak: ['frost'], resist: ['fire', 'poison'] },
  { id: 'goblin', name: 'Goblin', area: 'forest', archetype: 'humanoid', hp: 1.5, speed: 1.1, gold: 1.8, spawn: 0.5, pack: [2, 4], radius: 10, material: 'pelt', unlock: 4_000, color: '#6a9a3a', shape: 'square', blurb: 'Sneaky, greedy and always in a gang.', weak: ['fire', 'radiant'], resist: ['poison'] },
  { id: 'killerBee', name: 'Killer Bee', area: 'forest', archetype: 'beast', hp: 0.6, speed: 2, gold: 1.2, spawn: 0.8, pack: [3, 5], radius: 7, material: 'redgel', unlock: 15_000, color: '#f0c030', shape: 'triangle', blurb: 'Tiny, angry and very fast.', weak: ['frost', 'fire'], resist: ['poison'] },


  // Faerie Glade
  { id: 'toadstool', name: 'Toadstool', area: 'glade', archetype: 'plant', hp: 1, speed: 0.7, gold: 1.5, spawn: 1.2, pack: [2, 4], radius: 10, material: 'spore', unlock: 0, color: '#d0584a', shape: 'circle', blurb: 'A walking mushroom that puffs spores.', weak: ['fire', 'frost'], resist: ['poison', 'acid'] },
  { id: 'pixie', name: 'Pixie', area: 'glade', archetype: 'elemental', hp: 0.8, speed: 1.7, gold: 2, spawn: 0.5, pack: [2, 3], radius: 8, material: 'dust', unlock: 120, color: '#ff9ae0', shape: 'diamond', blurb: 'Giggles, glitters and bites.', weak: ['void', 'decay'], resist: ['arcane'] },
  { id: 'boar', name: 'Wild Boar', area: 'glade', archetype: 'beast', hp: 2.5, speed: 1.3, gold: 2.8, spawn: 0.4, pack: [1, 2], radius: 13, material: 'pelt', unlock: 900, color: '#8a5a3a', shape: 'triangle', blurb: 'Charges head-first at anything.', weak: ['poison', 'acid'], resist: ['frost'] },
  { id: 'mandragora', name: 'Mandragora', area: 'glade', archetype: 'plant', hp: 2, speed: 0.8, gold: 2.6, spawn: 0.4, pack: [1, 3], radius: 10, material: 'spore', unlock: 4_000, color: '#9ad060', shape: 'diamond', blurb: 'Its scream stops hearts. Pull with care.', weak: ['fire', 'acid'], resist: ['poison', 'decay'] },
  { id: 'treant', name: 'Treant', area: 'glade', archetype: 'plant', hp: 5, speed: 0.5, gold: 6, spawn: 0.2, pack: [1, 1], radius: 17, material: 'dust', unlock: 15_000, color: '#5a7a3a', shape: 'hexagon', blurb: 'An old tree that has had enough.', weak: ['fire', 'acid'], resist: ['physical', 'poison'] },


  // Old Graveyard
  { id: 'skeleton', name: 'Skeleton', area: 'graveyard', archetype: 'undead', hp: 1, speed: 0.9, gold: 1, spawn: 1.5, pack: [3, 5], radius: 11, material: 'bone', unlock: 0, color: '#e8dcc0', shape: 'square', blurb: 'Rattles in by the dozen.', weak: ['radiant', 'arcane'], resist: ['poison', 'decay'] },
  { id: 'zombie', name: 'Zombie', area: 'graveyard', archetype: 'undead', hp: 2.2, speed: 0.6, gold: 2.4, spawn: 0.6, pack: [2, 4], radius: 12, material: 'flesh', unlock: 120, color: '#8fae6b', shape: 'square', blurb: 'Slow, sturdy, relentless.', weak: ['fire', 'radiant'], resist: ['poison', 'decay'] },
  { id: 'bat', name: 'Grave Bat', area: 'graveyard', archetype: 'beast', hp: 0.6, speed: 1.9, gold: 1.3, spawn: 0.8, pack: [3, 5], radius: 8, material: 'wing', unlock: 900, color: '#8a78b0', shape: 'triangle', blurb: 'Tiny, fast and everywhere.', weak: ['frost', 'radiant'], resist: ['decay'] },
  { id: 'ghoul', name: 'Ghoul', area: 'graveyard', archetype: 'undead', hp: 1.6, speed: 1.2, gold: 1.8, spawn: 0.6, pack: [2, 4], radius: 11, material: 'flesh', unlock: 4_000, color: '#7a8a6a', shape: 'square', blurb: 'Hungry, fast and not picky.', weak: ['fire', 'radiant'], resist: ['poison', 'decay'] },
  { id: 'ghost', name: 'Ghost', area: 'graveyard', archetype: 'undead', hp: 1, speed: 1.1, gold: 1.6, spawn: 0.6, pack: [2, 4], radius: 11, material: 'wing', unlock: 15_000, color: '#dfe8ff', shape: 'ghost', blurb: 'Drifts through walls and swords alike.', weak: ['radiant', 'arcane'], resist: ['physical', 'poison'] },


  // Forsaken Crypt
  { id: 'crow', name: 'Carrion Crow', area: 'crypt', archetype: 'beast', hp: 1, speed: 2, gold: 1.2, spawn: 1.4, pack: [3, 6], radius: 7, material: 'wing', unlock: 0, color: '#3a3a4a', shape: 'triangle', blurb: 'Follows the dead, and those about to be.', weak: ['frost', 'physical'], resist: ['decay'] },
  { id: 'mummy', name: 'Mummy', area: 'crypt', archetype: 'undead', hp: 3, speed: 0.6, gold: 3.2, spawn: 0.35, pack: [1, 3], radius: 12, material: 'wrap', unlock: 120, color: '#d8c89a', shape: 'square', blurb: 'Wrapped tight and very flammable.', weak: ['fire'], resist: ['poison', 'decay', 'frost'] },
  { id: 'banshee', name: 'Banshee', area: 'crypt', archetype: 'undead', hp: 1.8, speed: 1.4, gold: 2.4, spawn: 0.4, pack: [1, 3], radius: 11, material: 'grave', unlock: 900, color: '#b0d8ff', shape: 'ghost', blurb: 'Her wail freezes the blood.', weak: ['radiant', 'arcane'], resist: ['frost', 'physical'] },
  { id: 'boneKnight', name: 'Bone Knight', area: 'crypt', archetype: 'undead', hp: 4, speed: 0.8, gold: 4.5, spawn: 0.25, pack: [1, 2], radius: 13, material: 'bone', unlock: 4_000, color: '#c8c0a8', shape: 'hexagon', blurb: 'A skeleton that kept its armor.', weak: ['radiant'], resist: ['physical', 'poison', 'decay'] },
  { id: 'necromancer', name: 'Necromancer', area: 'crypt', archetype: 'humanoid', hp: 3, speed: 0.9, gold: 4, spawn: 0.25, pack: [1, 2], radius: 12, material: 'grave', unlock: 15_000, color: '#5a3a7a', shape: 'diamond', blurb: 'Raises the dead for fun.', weak: ['radiant', 'physical'], resist: ['decay', 'void'] },


  // Shadowy Depths
  { id: 'gloomcrawler', name: 'Gloomcrawler', area: 'depths', archetype: 'beast', hp: 1, speed: 1.3, gold: 1.1, spawn: 1.4, pack: [3, 5], radius: 9, material: 'gloom', unlock: 0, color: '#4a4058', shape: 'triangle', blurb: 'Too many legs, all of them quiet.', weak: ['fire', 'radiant'], resist: ['poison'] },
  { id: 'duskmoth', name: 'Duskmoth', area: 'depths', archetype: 'beast', hp: 0.8, speed: 1.8, gold: 1.2, spawn: 0.6, pack: [2, 4], radius: 8, material: 'gloom', unlock: 120, color: '#8a7a9a', shape: 'diamond', blurb: 'Drawn to light. Especially yours.', weak: ['fire', 'frost'], resist: ['decay'] },
  { id: 'shadowWisp', name: 'Shadow Wisp', area: 'depths', archetype: 'elemental', hp: 1, speed: 1.5, gold: 1.8, spawn: 0.5, pack: [2, 3], radius: 9, material: 'umbra', unlock: 900, color: '#6a5a8a', shape: 'ghost', blurb: 'A flicker of dark that bites back.', weak: ['radiant', 'arcane'], resist: ['physical', 'decay'] },
  { id: 'umbralOoze', name: 'Umbral Ooze', area: 'depths', archetype: 'slime', hp: 2.2, speed: 0.8, gold: 2.6, spawn: 0.45, pack: [2, 3], radius: 12, material: 'umbra', unlock: 4_000, color: '#3a2e4a', shape: 'circle', blurb: 'A slime that soaked up the dark.', weak: ['fire', 'radiant'], resist: ['poison', 'void'] },
  { id: 'deepLurker', name: 'Deep Lurker', area: 'depths', archetype: 'demon', hp: 3, speed: 0.7, gold: 3.5, spawn: 0.35, pack: [1, 2], radius: 13, material: 'umbra', unlock: 15_000, color: '#2a2036', shape: 'hexagon', blurb: 'All eyes, somewhere in the dark.', weak: ['radiant'], resist: ['physical', 'void'] },

  // Ember Caves
  { id: 'imp', name: 'Imp', area: 'caves', archetype: 'demon', hp: 1, speed: 1.3, gold: 1, spawn: 1.4, pack: [2, 4], radius: 9, material: 'ember', unlock: 0, color: '#ff7a3d', shape: 'hexagon', blurb: 'Cackling little fire-starters.', weak: ['frost', 'radiant'], resist: ['fire'] },
  { id: 'magmaSlime', name: 'Magma Slime', area: 'caves', archetype: 'slime', hp: 2.5, speed: 0.8, gold: 2.5, spawn: 0.6, pack: [2, 3], radius: 12, material: 'magma', unlock: 120, color: '#ff4d1a', shape: 'circle', blurb: 'Molten and very hard to squish.', weak: ['frost', 'acid'], resist: ['fire', 'physical'] },
  { id: 'beetle', name: 'Fire Beetle', area: 'caves', archetype: 'beast', hp: 1.8, speed: 1.1, gold: 1.8, spawn: 0.7, pack: [2, 4], radius: 11, material: 'chitin', unlock: 900, color: '#3fb0a0', shape: 'triangle', blurb: 'Armored and quick to scuttle.', weak: ['acid', 'frost'], resist: ['physical', 'fire'] },
  { id: 'salamander', name: 'Salamander', area: 'caves', archetype: 'beast', hp: 1.8, speed: 1.3, gold: 2, spawn: 0.5, pack: [2, 3], radius: 11, material: 'ember', unlock: 4_000, color: '#ff9a3a', shape: 'triangle', blurb: 'A lizard that swims in lava.', weak: ['frost'], resist: ['fire', 'poison'] },
  { id: 'hellhound', name: 'Hellhound', area: 'caves', archetype: 'demon', hp: 2, speed: 1.8, gold: 2.6, spawn: 0.4, pack: [2, 3], radius: 11, material: 'ember', unlock: 15_000, color: '#b02a1a', shape: 'triangle', blurb: 'Its bark is fire. So is its bite.', weak: ['frost', 'radiant'], resist: ['fire', 'decay'] },


  // Deep Mines
  { id: 'kobold', name: 'Kobold', area: 'mines', archetype: 'humanoid', hp: 1, speed: 1.2, gold: 1.4, spawn: 1.4, pack: [3, 5], radius: 9, material: 'ore', unlock: 0, color: '#c07a3a', shape: 'square', blurb: 'Digs tunnels, sets traps, yips a lot.', weak: ['frost', 'physical'], resist: ['fire'] },
  { id: 'basilisk', name: 'Basilisk', area: 'mines', archetype: 'beast', hp: 3, speed: 1, gold: 3.8, spawn: 0.3, pack: [1, 2], radius: 13, material: 'scale', unlock: 120, color: '#5aa05a', shape: 'triangle', blurb: 'Whatever you do, don\'t meet its eyes.', weak: ['radiant', 'frost'], resist: ['poison', 'acid'] },
  { id: 'lavaGolem', name: 'Lava Golem', area: 'mines', archetype: 'elemental', hp: 5, speed: 0.5, gold: 5.5, spawn: 0.2, pack: [1, 1], radius: 16, material: 'magma', unlock: 900, color: '#d8401a', shape: 'diamond', blurb: 'Molten rock with a bad temper.', weak: ['frost'], resist: ['fire', 'physical', 'poison'] },
  { id: 'fireDrake', name: 'Fire Drake', area: 'mines', archetype: 'dragon', hp: 3.5, speed: 1.2, gold: 4.2, spawn: 0.25, pack: [1, 2], radius: 14, material: 'scale', unlock: 4_000, color: '#ff5a2a', shape: 'hexagon', blurb: 'A young dragon, already cranky.', weak: ['frost', 'void'], resist: ['fire', 'physical'] },
  { id: 'caveTroll', name: 'Cave Troll', area: 'mines', archetype: 'humanoid', hp: 6, speed: 0.6, gold: 6.5, spawn: 0.15, pack: [1, 1], radius: 17, material: 'ore', unlock: 15_000, color: '#7a6a5a', shape: 'square', blurb: 'Shrugs off blades. Hates fire.', weak: ['fire', 'acid'], resist: ['physical', 'frost'] },


  // Frost Peaks
  { id: 'iceWolf', name: 'Ice Wolf', area: 'peaks', archetype: 'beast', hp: 1, speed: 1.4, gold: 1, spawn: 1.4, pack: [2, 4], radius: 10, material: 'fur', unlock: 0, color: '#dfefff', shape: 'triangle', blurb: 'The pack howls on the wind.', weak: ['fire'], resist: ['frost'] },
  { id: 'golem', name: 'Frost Golem', area: 'peaks', archetype: 'elemental', hp: 4, speed: 0.5, gold: 4.5, spawn: 0.3, pack: [1, 2], radius: 16, material: 'frost', unlock: 120, color: '#8fdcff', shape: 'diamond', blurb: 'A walking wall of ice.', weak: ['fire', 'acid'], resist: ['frost', 'poison'] },
  { id: 'wraith', name: 'Snow Wraith', area: 'peaks', archetype: 'undead', hp: 1.4, speed: 1.3, gold: 1.8, spawn: 0.6, pack: [2, 4], radius: 11, material: 'ecto', unlock: 900, color: '#c49bff', shape: 'ghost', blurb: 'Drifts in quickly from the storm.', weak: ['radiant', 'arcane'], resist: ['physical'] },
  { id: 'yeti', name: 'Yeti', area: 'peaks', archetype: 'beast', hp: 3.5, speed: 1, gold: 4, spawn: 0.3, pack: [1, 2], radius: 15, material: 'fur', unlock: 4_000, color: '#f0f4ff', shape: 'hexagon', blurb: 'Big, shaggy and surprisingly quick.', weak: ['fire'], resist: ['frost'] },
  { id: 'frostSprite', name: 'Frost Sprite', area: 'peaks', archetype: 'elemental', hp: 0.8, speed: 1.6, gold: 1.5, spawn: 0.8, pack: [3, 5], radius: 8, material: 'frost', unlock: 15_000, color: '#bfefff', shape: 'diamond', blurb: 'A snowflake with a grudge.', weak: ['fire', 'physical'], resist: ['frost', 'poison'] },


  // Ascendant Steps
  { id: 'harpy', name: 'Harpy', area: 'cliffs', archetype: 'beast', hp: 1, speed: 1.8, gold: 1.8, spawn: 1.4, pack: [2, 4], radius: 10, material: 'plume', unlock: 0, color: '#a08ac0', shape: 'triangle', blurb: 'Screeches down from the heights.', weak: ['physical', 'acid'], resist: ['frost'] },
  { id: 'snowOwl', name: 'Snow Owl', area: 'cliffs', archetype: 'beast', hp: 1, speed: 1.9, gold: 1.6, spawn: 0.6, pack: [2, 4], radius: 9, material: 'plume', unlock: 120, color: '#e8e8f0', shape: 'triangle', blurb: 'Silent wings, sharp talons.', weak: ['fire', 'acid'], resist: ['frost'] },
  { id: 'griffin', name: 'Griffin', area: 'cliffs', archetype: 'beast', hp: 3, speed: 1.6, gold: 3.8, spawn: 0.3, pack: [1, 2], radius: 14, material: 'plume', unlock: 900, color: '#d8b060', shape: 'triangle', blurb: 'Half eagle, half lion, all trouble.', weak: ['acid', 'void'], resist: ['frost'] },
  { id: 'iceWyvern', name: 'Ice Wyvern', area: 'cliffs', archetype: 'dragon', hp: 5, speed: 1.2, gold: 6, spawn: 0.18, pack: [1, 1], radius: 16, material: 'skystone', unlock: 4_000, color: '#6ac8f0', shape: 'hexagon', blurb: 'Breathes blizzards.', weak: ['fire', 'radiant'], resist: ['frost', 'poison'] },
  { id: 'frostGiant', name: 'Frost Giant', area: 'cliffs', archetype: 'humanoid', hp: 7, speed: 0.5, gold: 8, spawn: 0.12, pack: [1, 1], radius: 18, material: 'skystone', unlock: 15_000, color: '#8ab8e8', shape: 'square', blurb: 'Throws boulders like snowballs.', weak: ['fire', 'radiant'], resist: ['frost', 'physical'] },


  // Cloud Fortress
  { id: 'cloudling', name: 'Cloudling', area: 'fortress', archetype: 'slime', hp: 1, speed: 1.3, gold: 1.2, spawn: 1.4, pack: [3, 5], radius: 11, material: 'feather', unlock: 0, color: '#eef6ff', shape: 'circle', blurb: 'A puff of cloud with a mean streak.', weak: ['fire', 'void'], resist: ['frost', 'physical'] },
  { id: 'thunderbird', name: 'Thunderbird', area: 'fortress', archetype: 'beast', hp: 1.4, speed: 1.9, gold: 1.8, spawn: 0.6, pack: [2, 4], radius: 11, material: 'feather', unlock: 120, color: '#f0d050', shape: 'triangle', blurb: 'Every beat of its wings is a thunderclap.', weak: ['frost', 'acid'], resist: ['arcane'] },
  { id: 'skyKnight', name: 'Sky Knight', area: 'fortress', archetype: 'humanoid', hp: 3, speed: 1, gold: 3.6, spawn: 0.35, pack: [1, 2], radius: 13, material: 'thunder', unlock: 900, color: '#a8c0e0', shape: 'square', blurb: 'Guards the gates in armour of polished cloud-steel.', weak: ['acid', 'decay'], resist: ['physical', 'radiant'] },
  { id: 'valkyrie', name: 'Valkyrie', area: 'fortress', archetype: 'humanoid', hp: 2.5, speed: 1.6, gold: 3.2, spawn: 0.3, pack: [1, 2], radius: 12, material: 'feather', unlock: 4_000, color: '#ffe8b0', shape: 'diamond', blurb: 'Dives from the battlements, spear first.', weak: ['decay', 'void'], resist: ['radiant', 'frost'] },
  { id: 'stormTitan', name: 'Storm Titan', area: 'fortress', archetype: 'elemental', hp: 7, speed: 0.5, gold: 8, spawn: 0.12, pack: [1, 1], radius: 19, material: 'thunder', unlock: 15_000, color: '#6a80c0', shape: 'hexagon', blurb: 'A thundercloud that learned to walk.', weak: ['acid', 'poison'], resist: ['arcane', 'frost', 'physical'] },

  // Meteor Fields
  { id: 'meteorite', name: 'Meteorite', area: 'meteors', archetype: 'elemental', hp: 1, speed: 1.4, gold: 1.2, spawn: 1.4, pack: [3, 5], radius: 11, material: 'meteor', unlock: 0, color: '#c07048', shape: 'circle', blurb: 'A burning rock that never stopped falling.', weak: ['frost', 'physical'], resist: ['fire'] },
  { id: 'cometWisp', name: 'Comet Wisp', area: 'meteors', archetype: 'elemental', hp: 0.8, speed: 2, gold: 1.6, spawn: 0.7, pack: [3, 5], radius: 9, material: 'stardust', unlock: 120, color: '#9ad8ff', shape: 'ghost', blurb: 'A streak of ice and light with a long, bright tail.', weak: ['fire', 'void'], resist: ['frost', 'physical'] },
  { id: 'rockMite', name: 'Rock Mite', area: 'meteors', archetype: 'beast', hp: 2.2, speed: 1.2, gold: 2.6, spawn: 0.45, pack: [2, 4], radius: 11, material: 'meteor', unlock: 900, color: '#8a7a6a', shape: 'triangle', blurb: 'Burrows into asteroids and eats its way out.', weak: ['acid', 'radiant'], resist: ['physical', 'fire'] },
  { id: 'astralSentinel', name: 'Astral Sentinel', area: 'meteors', archetype: 'humanoid', hp: 4, speed: 0.8, gold: 4.8, spawn: 0.25, pack: [1, 2], radius: 14, material: 'stardust', unlock: 4_000, color: '#b8a8ff', shape: 'diamond', blurb: 'An ancient watcher, carved from starlight.', weak: ['void', 'decay'], resist: ['arcane', 'radiant'] },
  { id: 'starEater', name: 'Star Eater', area: 'meteors', archetype: 'dragon', hp: 8, speed: 0.9, gold: 9.5, spawn: 0.1, pack: [1, 1], radius: 19, material: 'stardust', unlock: 15_000, color: '#5a3a9a', shape: 'hexagon', blurb: 'Swallows falling stars whole. The way down to the Rift lies past it.', weak: ['radiant', 'frost'], resist: ['fire', 'physical', 'arcane'] },

  // Void Rift
  { id: 'shadowSlime', name: 'Shadow Slime', area: 'rift', archetype: 'slime', hp: 1, speed: 1, gold: 1, spawn: 1.5, pack: [3, 5], radius: 11, material: 'shade', unlock: 0, color: '#7a5cc0', shape: 'circle', blurb: 'A slime made of the dark itself.', weak: ['radiant', 'acid'], resist: ['void'] },
  { id: 'horror', name: 'Void Horror', area: 'rift', archetype: 'demon', hp: 5, speed: 0.8, gold: 6, spawn: 0.25, pack: [1, 2], radius: 15, material: 'void', unlock: 120, color: '#ff5fd7', shape: 'hexagon', blurb: 'Rare, huge, and very rewarding.', weak: ['radiant', 'arcane'], resist: ['void', 'decay'] },
  { id: 'lich', name: 'Lich', area: 'rift', archetype: 'undead', hp: 2.5, speed: 1, gold: 3.5, spawn: 0.4, pack: [1, 3], radius: 12, material: 'soul', unlock: 900, color: '#6ff0e0', shape: 'ghost', blurb: 'An undead king hoarding souls.', weak: ['radiant', 'fire'], resist: ['decay', 'poison', 'frost'] },
  { id: 'shade', name: 'Shade', area: 'rift', archetype: 'undead', hp: 1.2, speed: 1.4, gold: 1.6, spawn: 0.7, pack: [3, 5], radius: 10, material: 'shade', unlock: 4_000, color: '#4a3a6a', shape: 'ghost', blurb: 'A shadow that forgot who cast it.', weak: ['radiant'], resist: ['physical', 'void'] },
  { id: 'watcher', name: 'Watcher', area: 'rift', archetype: 'demon', hp: 2.5, speed: 0.8, gold: 3.2, spawn: 0.35, pack: [1, 2], radius: 13, material: 'void', unlock: 15_000, color: '#c05ad0', shape: 'circle', blurb: 'One huge eye. It never blinks.', weak: ['radiant', 'acid'], resist: ['arcane', 'void'] },
  { id: 'darkKnight', name: 'Dark Knight', area: 'rift', archetype: 'humanoid', hp: 4, speed: 0.9, gold: 4.6, spawn: 0.25, pack: [1, 2], radius: 13, material: 'soul', unlock: 40_000, color: '#3a2a4a', shape: 'square', blurb: 'Traded his soul for better armor.', weak: ['radiant', 'arcane'], resist: ['physical', 'decay'] },
  { id: 'succubus', name: 'Succubus', area: 'rift', archetype: 'demon', hp: 2, speed: 1.5, gold: 2.8, spawn: 0.4, pack: [1, 3], radius: 11, material: 'soul', unlock: 100_000, color: '#ff6ab0', shape: 'diamond', blurb: 'Charming. Deadly. Mostly deadly.', weak: ['radiant', 'frost'], resist: ['fire', 'arcane'] },
  { id: 'chimera', name: 'Chimera', area: 'rift', archetype: 'beast', hp: 5, speed: 1.2, gold: 6, spawn: 0.18, pack: [1, 1], radius: 16, material: 'void', unlock: 250_000, color: '#c08a4a', shape: 'hexagon', blurb: 'Three heads, zero manners.', weak: ['frost', 'acid'], resist: ['fire', 'poison'] },
  { id: 'voidWyrm', name: 'Void Wyrm', area: 'rift', archetype: 'dragon', hp: 8, speed: 0.9, gold: 9.5, spawn: 0.1, pack: [1, 1], radius: 18, material: 'void', unlock: 600_000, color: '#8a3ae0', shape: 'hexagon', blurb: 'Swims through the dark between stars.', weak: ['radiant'], resist: ['void', 'physical', 'frost'] },
  { id: 'behemoth', name: 'Behemoth', area: 'rift', archetype: 'beast', hp: 10, speed: 0.6, gold: 12, spawn: 0.08, pack: [1, 1], radius: 20, material: 'soul', unlock: 1_500_000, color: '#6a4a8a', shape: 'hexagon', blurb: 'The ground shakes when it walks.', weak: ['arcane', 'acid'], resist: ['physical', 'fire'] },
  // The Void Rift's Guardian: it only ever appears as the final Guardian.
  { id: 'timeEater', name: 'Time Eater', area: 'rift', archetype: 'demon', guardianOnly: true, winAt: 0.5, hp: 1, speed: 0.6, gold: 1, spawn: 0, pack: [1, 1], radius: 22, material: 'void', unlock: Infinity, color: '#e0c060', shape: 'hexagon', blurb: 'It devours the hours of every world it finds. The Void Rift is its mouth.', weak: ['radiant', 'arcane'], resist: ['void', 'decay', 'physical'] },
];

export const enemyDef = (id: EnemyId): EnemyDef => ENEMIES.find((e) => e.id === id)!;
/** An area's horde (Guardian-only monsters like the Time Eater aren't part of it). */
export const areaEnemies = (area: AreaId): EnemyDef[] => ENEMIES.filter((e) => e.area === area && !e.guardianOnly);
/** Which monster each area's Guardian is a giant version of. */
export const GUARDIAN_ENEMY: Record<AreaId, EnemyId> = {
  forest: 'redSlime',
  glade: 'treant',
  graveyard: 'bat',
  crypt: 'necromancer',
  depths: 'deepLurker',
  caves: 'beetle',
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
 * MAX_MONSTER_LEVEL, where every evolution tree can be completed (about ×7 HP, ×30 gold, ×4 drops, ×7 spawns).
 */
export const EMPOWER = { hp: 0.03, gold: 0.145, drops: 0.015, spawn: 0.03 };
export const EMPOWER_SESSIONS_PER_LEVEL = 5;
/** A monster's top level: enough evolution points for its whole tree. */
export const MAX_MONSTER_LEVEL = 42;
export const MAX_EMPOWER_SESSIONS = (MAX_MONSTER_LEVEL - 1) * EMPOWER_SESSIONS_PER_LEVEL;

/** Multiplier from `sessions` Empower sessions. */
export const empowerMult = (stat: keyof typeof EMPOWER, sessions: number): number => 1 + EMPOWER[stat] * sessions;
/**
 * Each session costs this much more than the last: maxing out a monster takes gold from about three areas
 * further on (Green Slimes finish evolving while you level in the Forsaken Crypt).
 */
export const EMPOWER_GROWTH = 1.12;

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
/** Cost of a monster's first Empower session (then × EMPOWER_GROWTH each). */
export const empowerBaseCost = (def: EnemyDef): number => Math.ceil(areaDef(def.area).gold * Math.max(40, def.unlock * 0.3) * def.gold);

/** What evolution nodes change (per rank). */
export type EvoStat =
  | 'hp' // +x HP (multiplier)
  | 'gold' // +x gold (multiplier)
  | 'drops' // +x material drop chance (multiplier)
  | 'spawn' // +x spawn rate (multiplier)
  | 'pack' // +x monsters per pack (they arrive in bigger hordes)
  | 'speed'; // +x move speed (multiplier): riskier, usually paired with a bigger reward
export type EvoNode = TreeNode<EvoStat>;
type EvoSpec = Pick<EvoNode, 'name' | 'icon' | 'desc' | 'maxRank' | 'effect'>;

/**
 * Every evolution tree has the same shape as a Hunter's skill tree: a signature root; three branches,
 * Wealth (gold), Horde (spawns) and Harvest (materials); a signature node under each; and a capstone.
 */
function evoTree(root: EvoSpec, branches: [EvoSpec, EvoSpec, EvoSpec], capstone: EvoSpec): EvoNode[] {
  const core: [EvoSpec, EvoSpec, EvoSpec] = [
    { name: 'Wealth', icon: '💰', desc: '+10% gold per rank.', maxRank: 10, effect: { gold: 0.1 } },
    { name: 'Horde', icon: '👥', desc: '+8% spawns per rank.', maxRank: 10, effect: { spawn: 0.08 } },
    { name: 'Harvest', icon: '💎', desc: '+10% material drops per rank.', maxRank: 10, effect: { drops: 0.1 } },
  ];
  const ids = ['wealth', 'horde', 'harvest'];
  return [
    { id: 'root', ...root, requires: [], col: 1, row: 0 },
    ...core.map((n, i) => ({ id: ids[i], ...n, requires: ['root'], col: i, row: 1 })),
    ...branches.map((n, i) => ({ id: `${ids[i]}2`, ...n, requires: [ids[i]], col: i, row: 2 })),
    { id: 'capstone', ...capstone, requires: ids.map((x) => `${x}2`), col: 1, row: 3 },
  ];
}

/** Each archetype's evolution tree; every monster of that archetype evolves along it. */
export const EVO_TREES: Record<Archetype, EvoNode[]> = {
  slime: evoTree(
    { name: 'Gelatinous Bulk', icon: '🟢', desc: '+25% HP and +25% gold.', maxRank: 1, effect: { hp: 0.25, gold: 0.25 } },
    [
      { name: 'Treasure Gel', icon: '🪙', desc: '+30% gold per rank.', maxRank: 3, effect: { gold: 0.3 } },
      { name: 'Small Hordes', icon: '🫧', desc: 'Packs of 1 more and +10% spawns per rank.', maxRank: 2, effect: { pack: 1, spawn: 0.1 } },
      { name: 'Rich Ooze', icon: '💧', desc: '+25% material drops per rank.', maxRank: 3, effect: { drops: 0.25 } },
    ],
    { name: "Slime King's Court", icon: '👑', desc: '+50% gold, +50% drops, packs of 1 more.', maxRank: 1, effect: { gold: 0.5, drops: 0.5, pack: 1 } },
  ),
  beast: evoTree(
    { name: 'Thick Hide', icon: '🐾', desc: '+20% HP and +20% material drops.', maxRank: 1, effect: { hp: 0.2, drops: 0.2 } },
    [
      { name: 'Prized Pelts', icon: '🪙', desc: '+40% gold but 8% faster per rank.', maxRank: 3, effect: { gold: 0.4, speed: 0.08 } },
      { name: 'Pack Hunters', icon: '🐺', desc: 'Packs of 1 more and +10% spawns per rank.', maxRank: 2, effect: { pack: 1, spawn: 0.1 } },
      { name: 'Alpha Stock', icon: '🦴', desc: '+25% material drops per rank.', maxRank: 3, effect: { drops: 0.25 } },
    ],
    { name: 'Apex Herd', icon: '👑', desc: '+40% gold and +25% spawns.', maxRank: 1, effect: { gold: 0.4, spawn: 0.25 } },
  ),
  undead: evoTree(
    { name: 'Restless Dead', icon: '💀', desc: '+20% HP and +20% spawns.', maxRank: 1, effect: { hp: 0.2, spawn: 0.2 } },
    [
      { name: 'Grave Goods', icon: '🪙', desc: '+30% gold per rank.', maxRank: 3, effect: { gold: 0.3 } },
      { name: 'Rising Horde', icon: '🧟', desc: 'Packs of 1 more and +12% spawns per rank.', maxRank: 2, effect: { pack: 1, spawn: 0.12 } },
      { name: 'Bone Harvest', icon: '🦴', desc: '+25% material drops per rank.', maxRank: 3, effect: { drops: 0.25 } },
    ],
    { name: 'Endless Legion', icon: '👑', desc: '+30% spawns, packs of 1 more, +30% gold.', maxRank: 1, effect: { spawn: 0.3, pack: 1, gold: 0.3 } },
  ),
  demon: evoTree(
    { name: 'Infernal Pact', icon: '😈', desc: '+20% HP and +30% gold.', maxRank: 1, effect: { hp: 0.2, gold: 0.3 } },
    [
      { name: 'Hoarded Souls', icon: '🪙', desc: '+45% gold but 8% faster per rank.', maxRank: 3, effect: { gold: 0.45, speed: 0.08 } },
      { name: 'Summoning Circle', icon: '🔥', desc: '+15% spawns per rank.', maxRank: 3, effect: { spawn: 0.15 } },
      { name: 'Brimstone', icon: '🪨', desc: '+25% material drops per rank.', maxRank: 3, effect: { drops: 0.25 } },
    ],
    { name: 'Hellgate', icon: '👑', desc: '+60% gold and packs of 1 more.', maxRank: 1, effect: { gold: 0.6, pack: 1 } },
  ),
  elemental: evoTree(
    { name: 'Condensed Core', icon: '🔷', desc: '+25% HP and +25% material drops.', maxRank: 1, effect: { hp: 0.25, drops: 0.25 } },
    [
      { name: 'Crystal Heart', icon: '🪙', desc: '+30% gold per rank.', maxRank: 3, effect: { gold: 0.3 } },
      { name: 'Surge', icon: '🌪️', desc: '+15% spawns per rank.', maxRank: 3, effect: { spawn: 0.15 } },
      { name: 'Shard Shedding', icon: '💠', desc: '+35% material drops per rank.', maxRank: 3, effect: { drops: 0.35 } },
    ],
    { name: 'Primordial', icon: '👑', desc: '+60% material drops and +30% gold.', maxRank: 1, effect: { drops: 0.6, gold: 0.3 } },
  ),
  humanoid: evoTree(
    { name: 'Loot Sacks', icon: '👤', desc: '+10% HP and +30% gold.', maxRank: 1, effect: { hp: 0.1, gold: 0.3 } },
    [
      { name: 'War Chest', icon: '🪙', desc: '+35% gold per rank.', maxRank: 3, effect: { gold: 0.35 } },
      { name: 'Warbands', icon: '⚔️', desc: 'Packs of 1 more and +10% spawns per rank.', maxRank: 2, effect: { pack: 1, spawn: 0.1 } },
      { name: 'Supply Lines', icon: '🎒', desc: '+25% material drops per rank.', maxRank: 3, effect: { drops: 0.25 } },
    ],
    { name: 'Warlord', icon: '👑', desc: '+50% gold and +20% spawns.', maxRank: 1, effect: { gold: 0.5, spawn: 0.2 } },
  ),
  plant: evoTree(
    { name: 'Deep Roots', icon: '🌿', desc: '+30% HP and +20% material drops.', maxRank: 1, effect: { hp: 0.3, drops: 0.2 } },
    [
      { name: 'Golden Sap', icon: '🪙', desc: '+30% gold per rank.', maxRank: 3, effect: { gold: 0.3 } },
      { name: 'Spreading Spores', icon: '🍄', desc: '+15% spawns per rank.', maxRank: 3, effect: { spawn: 0.15 } },
      { name: 'Bountiful Bloom', icon: '🌸', desc: '+30% material drops per rank.', maxRank: 3, effect: { drops: 0.3 } },
    ],
    { name: 'World Tree', icon: '👑', desc: '+50% material drops and +40% gold.', maxRank: 1, effect: { drops: 0.5, gold: 0.4 } },
  ),
  dragon: evoTree(
    { name: 'Dragon Hoard', icon: '🐉', desc: '+30% HP and +40% gold.', maxRank: 1, effect: { hp: 0.3, gold: 0.4 } },
    [
      { name: 'Golden Scales', icon: '🪙', desc: '+50% gold but 8% faster per rank.', maxRank: 3, effect: { gold: 0.5, speed: 0.08 } },
      { name: 'Clutch', icon: '🥚', desc: '+15% spawns per rank.', maxRank: 3, effect: { spawn: 0.15 } },
      { name: 'Shed Scales', icon: '💎', desc: '+30% material drops per rank.', maxRank: 3, effect: { drops: 0.3 } },
    ],
    { name: 'Elder Wyrm', icon: '👑', desc: '+75% gold and +40% material drops.', maxRank: 1, effect: { gold: 0.75, drops: 0.4 } },
  ),
};

export const evoNode = (archetype: Archetype, id: string): EvoNode | undefined => EVO_TREES[archetype].find((n) => n.id === id);

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
  | 'gravewarden'
  | 'lance'
  | 'prospector'
  | 'demonbane'
  | 'wilhelm'
  | 'celeste'
  | 'scavenger'
  | 'frostbreaker';

// ---- Damage types: every attack deals one. Weapons carry a type; without one, a Hunter uses their own. ----
export type DamageType = 'physical' | 'fire' | 'acid' | 'frost' | 'radiant' | 'poison' | 'arcane' | 'decay' | 'void';

/**
 * Status effects: a hit of these types has a chance (the weapon's `proc`, or the Hunter's own without one) to:
 * Fire: burn (`share` of the hit again over `duration`). Poison: poison (the same, slower and longer).
 * Frost: chill (half speed). Acid: drop an acid puddle that hurts everything in it. Radiant: a radiant burst
 * around the target. Decay: a dark aura on the monster that hurts the monsters around it. Arcane: strip its
 * resistances for a while. Physical and Void have no effect. New procs refresh rather than stack.
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
   * Bleeding (Physical): `share` of the hit again over `duration`. The only effect that stacks: each bleed is
   * its own instance, up to `maxStacks` at once (a new one replaces the oldest).
   */
  bleed: { share: 0.25, duration: 3, maxStacks: 8 },
  /** Seconds between damage-over-time ticks. */
  tick: 0.5,
};
/** Rough extra damage each type's effect adds when it always procs, for the background model (scaled by proc chance). */
export const STATUS_MODEL: Partial<Record<DamageType, number>> = { physical: 1.25, fire: 1.4, poison: 1.5, acid: 1.4, radiant: 1.5, decay: 1.4, arcane: 1.1 };

export const DAMAGE_TYPES: Record<DamageType, { name: string; icon: string; color: string; effect?: string }> = {
  physical: { name: 'Physical', icon: '🗡️', color: '#e8e8e8', effect: `Bleeds: ${STATUS.bleed.share * 100}% of the hit again over ${STATUS.bleed.duration}s; bleeds stack (up to ${STATUS.bleed.maxStacks})` },
  fire: { name: 'Fire', icon: '🔥', color: '#ff7a2a', effect: `Burns: ${STATUS.burn.share * 100}% of the hit again over ${STATUS.burn.duration}s, and can spread to monsters right next to it` },
  acid: { name: 'Acid', icon: '🧪', color: '#c6f03a', effect: `Acid puddle: hurts everything in it for ${STATUS.acid.duration}s` },
  frost: { name: 'Frost', icon: '❄️', color: '#8fdcff', effect: `Chills: half speed for ${STATUS.chill.duration}s` },
  radiant: { name: 'Radiant', icon: '✨', color: '#ffe36e', effect: `Radiant burst: ${STATUS.burst.share * 100}% of the hit to everything nearby` },
  poison: { name: 'Poison', icon: '☠️', color: '#6fdc5a', effect: `Poisons: ${STATUS.poison.share * 100}% of the hit again over ${STATUS.poison.duration}s, plus a share of its max HP (more from rarer weapons, less on Guardians)` },
  arcane: { name: 'Arcane', icon: '🔮', color: '#c08cff', effect: `Exposes: removes its resistances for ${STATUS.expose.duration}s` },
  decay: { name: 'Decay', icon: '🍂', color: '#b09a60', effect: `Dark aura: it hurts the monsters around it for ${STATUS.aura.duration}s` },
  void: { name: 'Void', icon: '🌀', color: '#ff5fd7' },
};

/** How a Hunter fights on the battlefield. */
export type AttackKind =
  | 'bolt' // single shot (your Hunter)
  | 'potion' // magic bolts, plus a lobbed flask that leaves a damaging puddle (special)
  | 'fireball' // magic bolts, plus a fireball that explodes for area damage (special)
  | 'arrow' // pierces through a line of enemies
  | 'nova' // holy pulse around themselves
  | 'thrust' // short lance strike through everything in a line
  | 'shotgun' // spread of pellets, short range
  | 'daggers' // very fast, short range
  | 'sniper' // long-range piercing shot; akimbo pistols up close
  | 'ricochet' // bounces between enemies
  | 'hammer' // slows what it hits
  | 'beam'; // a long psychic beam through everything in a line

export interface AttackStyle {
  kind: AttackKind;
  /** Their own damage type, used when their weapon slot is empty (and always for specials). */
  damageType: DamageType;
  /** Chance their own attacks trigger their type's status effect (without a weapon). */
  proc?: number;
  /** World units (the view shows roughly ±320 × ±350 around your Hunter). */
  range: number;
  /** Multipliers on the Hunter's base fire rate and damage per shot. */
  rate: number;
  damage: number;
  /** Area radius for fireballs, potions (puddle) and novas. */
  radius?: number;
  pierce?: number;
  pellets?: number;
  bounces?: number;
  /** Seconds a hit enemy is slowed to half speed. */
  slow?: number;
  /** Sniper switches to akimbo pistols when an enemy is this close. */
  closeRange?: number;
  /**
   * A special attack on a cooldown (Reginald's potions, Glimmer's fireballs), cast alongside their normal shots.
   * Its damage per hit is `damage` × their shot damage × (1 + their weapon's damage); its radius is
   * `radius` × (1 + their weapon's attack rate). `ticks` is how many times it hits (a puddle ticks), and
   * `crowd` how many monsters it typically catches, for the background model.
   */
  special?: { cooldown: number; damage: number; radius: number; ticks: number; crowd: number; proc?: number };
  /** Rough damage efficiency vs a crowd, used for background DPS (AoE > 1). */
  farm: number;
  /** Typical monsters hit per attack against a crowd (area, pierce, bounce), used to model kill rates. */
  crowd: number;
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
  style: AttackStyle;
  /** Damage multiplier against one archetype. */
  bane?: { archetype: Archetype; mult: number };
  /** Multipliers on gold / material drops from their kills. */
  gold?: number;
  drops?: number;
  /** Short description of what makes them special, shown on their card. */
  ability: string;
  /** Equipment slots (defaults to Weapon, Armor, Accessory). */
  slots?: SlotDef[];
}

/** Your own Hunter's range, in world units. */
export const MAIN_RANGE = 250;
/** How far the battlefield is zoomed out: 0.6 = everything drawn at 60% size, so you see more of the field. */
export const FIELD_ZOOM = 0.6;
/** Seconds for a Paladin-style guard to regain one charge. */
export const GUARD_RECHARGE = 4;

export const HUNTERS: HunterDef[] = [
  {
    id: 'alchemist', name: 'Reginald', title: 'Alchemist', icon: '⚗️', color: '#7be07b', area: 'forest', recruitCost: 150, bane: { archetype: 'slime', mult: 3 },
    unlock: { event: 'slimeSwarm', times: 1 },
    ascendedTitle: 'Archalchemist',
    story: "Reginald is in the Whispering Forest doing research on Slimes, with an idea for a new potion, but he needs far more test subjects than he can catch. Survive a Slime Swarm, and Reginald will help you hunt monsters.",
    ability: 'Every few seconds, lobs a potion that leaves a poison puddle. Deals triple damage to Slimes. Uses ranged or magic weapons.',
    slots: [{ kind: 'weapon', label: 'Weapon', accepts: ['weapon', 'magic'] }, { kind: 'armor', label: 'Armor' }, { kind: 'accessory', label: 'Accessory' }],
    style: {
      kind: 'potion', damageType: 'poison', proc: 0.5, range: 230, rate: 0.6, damage: 0.8, farm: 1, crowd: 1,
      special: { cooldown: 4, damage: 0.35, radius: 45, ticks: 6, crowd: 2.5 },
      describe: 'Flings magic bolts. Every 4s, lobs a potion whose puddle keeps hurting: the weapon\'s damage powers the poison, its attack rate widens the puddle.',
    },
  },
  {
    id: 'ranger', name: 'Galladair', title: 'Ranger', icon: '🏹', color: '#c09060', area: 'forest', recruitCost: 2_000, bane: { archetype: 'beast', mult: 3 },
    unlock: { event: 'guardian-forest', times: 1 },
    ascendedTitle: 'Pathfinder',
    story: 'Galladair\'s home on the edge of the Whispering Forest is being threatened by monsters. Help her defeat the Forest Guardian, and she will fight by your side.',
    ability: 'Arrows pierce through lines of enemies. Deals triple damage to Beasts.',
    style: { kind: 'arrow', damageType: 'physical', range: 300, rate: 1, damage: 1, pierce: 3, farm: 1.4, crowd: 2, describe: 'Arrows pierce through up to 4 enemies in a line.' },
  },
  {
    id: 'gravewarden', name: 'Alric', title: 'Gravewarden', icon: '✝️', color: '#efe6cf', area: 'graveyard', recruitCost: 60_000_000, bane: { archetype: 'undead', mult: 3 },
    unlock: { event: 'guardian-graveyard', times: 1 },
    ascendedTitle: 'Lightbringer',
    story: 'Alric keeps watch over the Old Graveyard, praying for the restless dead. Put its Guardian to rest, and he\'ll lend you his holy light.',
    ability: 'Holy pulses strike everything around him. Deals triple damage to Undead.',
    style: { kind: 'nova', damageType: 'radiant', proc: 0.15, range: 110, rate: 0.5, damage: 1.5, radius: 110, farm: 1.5, crowd: 3, describe: 'Pulses holy light, striking every enemy around him.' },
  },
  {
    id: 'lance', name: 'Lance', title: 'Paladin', icon: '🛡️', color: '#ffe8a3', area: 'graveyard', recruitCost: 200_000_000,
    unlock: { event: 'guardian-graveyard', times: 2 },
    ascendedTitle: 'Crusader',
    story: 'Lance swore to guard the Old Graveyard\'s gates until its Guardian falls twice. Help him keep his oath, and his shield is yours.',
    ability: 'Can take multiple hits before being knocked out (Zone of Protection), and grants other Hunters an extra hit as well (Rallying Oath).',
    slots: [{ kind: 'melee', label: 'Melee' }, { kind: 'armor', label: 'Armor' }, { kind: 'accessory', label: 'Accessory' }],
    style: { kind: 'thrust', damageType: 'radiant', proc: 0.1, range: 90, rate: 0.9, damage: 1.8, farm: 1.3, crowd: 2, describe: 'Holds the line with lance thrusts that pierce everything in reach.' },
  },
  {
    id: 'prospector', name: 'Gus', title: 'Prospector', icon: '💰', color: '#ffd34d', area: 'graveyard', recruitCost: 400_000_000, gold: 1.75,
    unlock: { event: 'guardian-graveyard', times: 3 },
    ascendedTitle: 'Tycoon',
    story: 'Gus has been digging for treasure under the Old Graveyard, but the dead keep chasing him off. Beat its Guardian three times, and he\'ll share his luck.',
    ability: 'Blasts five pellets at close range. Earns +75% gold from his kills.',
    style: { kind: 'shotgun', damageType: 'physical', range: 150, rate: 0.7, damage: 0.45, pellets: 5, farm: 1.2, crowd: 1, describe: 'A trusty shotgun: five pellets per blast at close range.' },
  },
  {
    id: 'glimmer', name: 'Glimmer', title: 'Wizard', icon: '🧙', color: '#b07cff', area: 'crypt', recruitCost: 300_000_000_000,
    unlock: { event: 'guardian-crypt', times: 1 },
    ascendedTitle: 'Archmage',
    story: 'Glimmer came to the Forsaken Crypt to study the old magic sealed inside, but its Guardian won\'t let anyone near. Put it to rest, and Glimmer will lend you a fireball or two.',
    ability: 'Every few seconds, hurls a fireball that explodes for area damage. Wields only magic weapons.',
    slots: [{ kind: 'magic', label: 'Magic weapon' }, { kind: 'armor', label: 'Robe' }, { kind: 'accessory', label: 'Accessory' }],
    style: {
      kind: 'fireball', damageType: 'fire', proc: 0.3, range: 260, rate: 0.55, damage: 1.6, farm: 1, crowd: 1,
      special: { cooldown: 4, damage: 1.75, radius: 55, ticks: 1, crowd: 3, proc: 1 },
      describe: 'Fires magic bolts. Every 4s he hurls a fireball that explodes: his weapon\'s damage powers the blast, its attack rate widens it.',
    },
  },
  {
    id: 'wilhelm', name: 'Wilhelm', title: 'Sniper', icon: '🎯', color: '#9aa7b8', area: 'depths', recruitCost: 100_000_000_000_000,
    unlock: { event: 'guardian-depths', times: 1 },
    ascendedTitle: 'Deadeye',
    story: '“I was hunting a creature with a hundred eyes, but after shooting 99 of them, it got away. Help me track it down in the Shadowy Depths.”',
    ability: 'Snipes from across the field, akimbo pistols up close. Can equip a long-range weapon and a short-range weapon.',
    slots: [
      { kind: 'weapon', label: 'Long-range', role: 'long' },
      { kind: 'weapon', label: 'Short-range', role: 'short' },
      { kind: 'armor', label: 'Armor' },
    ],
    style: { kind: 'sniper', damageType: 'physical', range: 520, rate: 0.4, damage: 3.5, pierce: 2, closeRange: 90, farm: 1.5, crowd: 2, describe: 'Picks enemies off from across the field with piercing shots; switches to akimbo pistols when they get close.' },
  },
  {
    id: 'celeste', name: 'Celeste', title: 'Psion', icon: '🔮', color: '#c9a8ff', area: 'depths', recruitCost: 200_000_000_000_000, bane: { archetype: 'dragon', mult: 3 },
    unlock: { event: 'guardian-depths', times: 2 },
    ascendedTitle: 'Oracle',
    story: 'Celeste, a Psion who hears the thoughts of monsters, followed a whisper into the Shadowy Depths and got lost in the noise. Beat the Depths\' Guardian twice to quiet it, and Celeste will lend you that mind.',
    ability: 'Fires long psychic beams that pierce every monster in a line. Deals triple damage to Dragons.',
    style: { kind: 'beam', damageType: 'arcane', proc: 0.15, range: 280, rate: 0.6, damage: 1.4, farm: 1.5, crowd: 2.5, describe: 'A beam of pure thought through everything in its path.' },
  },
  {
    id: 'demonbane', name: 'Sera', title: 'Demonbane', icon: '🗡️', color: '#ff7a3d', area: 'caves', recruitCost: 3e15, bane: { archetype: 'demon', mult: 3 },
    unlock: { event: 'guardian-caves', times: 1 },
    ascendedTitle: 'Demonslayer',
    story: 'Sera hunts the demons of the Ember Caves alone. Show her you can beat the Caves\' Guardian, and she\'ll fight beside you.',
    ability: 'A rapid flurry of daggers at short range. Deals triple damage to Demons.',
    style: { kind: 'daggers', damageType: 'arcane', proc: 0.15, range: 160, rate: 3, damage: 0.4, farm: 1.1, crowd: 1, describe: 'Throws a flurry of daggers at anything that gets close.' },
  },
  {
    id: 'scavenger', name: 'Pip', title: 'Scavenger', icon: '🎒', color: '#3fb0a0', area: 'caves', recruitCost: 1.2e16, drops: 2,
    unlock: { event: 'guardian-caves', times: 2 },
    ascendedTitle: 'Treasure Hunter',
    story: 'Pip scavenges the Ember Caves for anything shiny. Beat its Guardian twice, and Pip will tag along for the loot.',
    ability: 'Stones ricochet between enemies. Doubles material drops from his kills.',
    style: { kind: 'ricochet', damageType: 'acid', proc: 0.2, range: 220, rate: 1, damage: 0.8, bounces: 3, farm: 1.4, crowd: 2.5, describe: 'Acid-slicked slingshot stones ricochet between up to 4 enemies.' },
  },
  {
    id: 'frostbreaker', name: 'Bjorn', title: 'Frostbreaker', icon: '🔨', color: '#8fdcff', area: 'peaks', recruitCost: 2.5e19, bane: { archetype: 'elemental', mult: 3 },
    unlock: { event: 'guardian-peaks', times: 1 },
    ascendedTitle: 'Winterking',
    story: 'Bjorn climbed the Frost Peaks to hunt the thing that rules them. Defeat the Peaks\' Guardian, and he\'ll bring his hammer to your side.',
    ability: 'Frost hammers slow enemies to a crawl. Deals triple damage to Elementals.',
    style: { kind: 'hammer', damageType: 'frost', proc: 0.5, range: 200, rate: 0.7, damage: 1.6, slow: 2, farm: 1.3, crowd: 1, describe: 'Throws frost hammers that slow enemies to a crawl.' },
  },
];

export const hunterDef = (id: HunterId): HunterDef => HUNTERS.find((h) => h.id === id)!;

export function hunterPerk(h: HunterDef): string {
  const parts: string[] = [];
  if (h.bane) parts.push(`×${h.bane.mult} damage vs ${ARCHETYPES[h.bane.archetype].name}`);
  if (h.gold) parts.push(`+${Math.round((h.gold - 1) * 100)}% gold`);
  if (h.drops) parts.push(`+${Math.round((h.drops - 1) * 100)}% drops`);
  return parts.join(', ');
}

/** Your own Hunter's card blurb. */
export const MAIN_ABILITY = 'Tap the Battle Field to damage Monsters!';

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
  /** Wilhelm's weapon slots: 'long' powers his sniper shots, 'short' his akimbo pistols. */
  role?: 'long' | 'short';
  /** Kinds the slot takes, when more than its own `kind` (Reginald's weapon slot takes ranged or magic). */
  accepts?: GearKind[];
}

/** Can a piece of this kind go in this slot? */
export const slotAccepts = (slot: SlotDef, kind: GearKind): boolean => (slot.accepts ?? [slot.kind]).includes(kind);

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
  | 'fangDagger'
  | 'wispTome'
  | 'wolfTome'
  | 'boneMaul'
  | 'goblinSword'
  | 'huntingBow'
  | 'boneCrossbow'
  | 'emberLongbow'
  | 'bonePistol'
  | 'frostRifle'
  | 'voidRepeater'
  | 'ironSpear'
  | 'magmaGlaive'
  | 'soulLance'
  | 'apprenticeWand'
  | 'gravewoodStaff'
  | 'emberFocus'
  | 'crystalFocus'
  | 'voidScepter'
  | 'soulfireStaff'
  | 'leatherVest'
  | 'bonePlate'
  | 'chitinCarapace'
  | 'frostMail'
  | 'luckyCharm'
  | 'goldTooth'
  | 'satchel'
  | 'emberOrb'
  | 'hawkeyeLens'
  | 'soulRing';

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
  /** Weapons only: the damage type they deal. */
  damageType?: DamageType;
  /** Weapons only: what kind of weapon it is, which shapes how it attacks (see WEAPON_CLASSES). */
  weaponClass?: WeaponClass;
  /**
   * Tomes: what this one summons (a spirit by default). `dash` is the creatures' own ability: every
   * `cooldown` seconds they lunge `range` at a monster, and a lunge that lands deals `damage` × a bite. Its
   * cooldown shows as the item's icon on the battlefield.
   */
  summon?: { look: 'wisp' | 'wolf'; name: string; dash?: { cooldown: number; range: number; speed: number; damage: number } };
  /** A line about the item's own ability, shown on its card. */
  ability?: string;
  /** Chance each hit triggers its damage type's status effect (0 or missing: never). */
  proc?: number;
  /** Stats at 1★; higher stars multiply them by GEAR_STAR_POWER. */
  stats: Partial<Record<GearStat, number>>;
  /** Materials to craft (1★); each star after costs more (see gearCost). */
  recipe: Partial<Record<MaterialId, number>>;
  /** Starting gear: every new game begins with it; it can't be crafted (its recipe prices its stars). */
  starter?: boolean;
  /** Weapons: the area tier they belong to (1 = Whispering Forest … 12 = Void Rift), which sets their base damage. */
  tier?: number;
  /** Weapons: base damage per hit at 1★, overriding the tier's (the starting weapons deal 1). */
  hit?: number;
}

// ---- Weapon damage: every hit starts from the weapon's own damage ----
/**
 * A weapon's base damage per hit at 1★ by its area tier (1 = Whispering Forest … 12 = Void Rift), before its
 * class makes it heavier or lighter: each new area's weapons reach well past the last area's.
 */
export const TIER_HIT = [2, 4, 8, 15, 27, 45, 72, 110, 160, 230, 320, 440];
/** A weapon's base damage at each star, as a multiple of 1★. */
export const WEAPON_HIT_POWER = [0, 1, 1.3, 1.65, 2.1, 2.6];
/** Base damage per hit with no weapon equipped. */
export const UNARMED_HIT = 1;
/** A weapon's base damage per hit at a star count (0 for gear that isn't a weapon). */
export function weaponHit(def: GearDef, stars: number): number {
  if (!def.weaponClass) return 0;
  const raw = TIER_HIT[Math.max(1, Math.min(TIER_HIT.length, def.tier ?? 1)) - 1] * WEAPON_CLASSES[def.weaponClass].damage;
  const base = def.hit ?? (raw >= 10 ? Math.round(raw) : Math.round(raw * 10) / 10);
  return base * WEAPON_HIT_POWER[Math.max(0, Math.min(MAX_STARS, stars))];
}
/** A weapon's damage for display (e.g. "1.3 damage"). */
export const hitText = (v: number): string => `${Number(v.toFixed(v < 10 ? 2 : 1))} damage`;
/** Everything a piece does at a star count: a weapon's base damage, then its stat bonuses. */
export function gearSummary(def: GearDef, stars: number): string {
  const hit = weaponHit(def, stars);
  return [hit ? hitText(hit) : '', describeGear(gearStats(def, stars))].filter(Boolean).join(', ');
}

// ---- Stars: gear and Upgrades go from 1★ (crafted) to 5★ ----
export const MAX_STARS = 5;
/** Gear stats at each star, as a multiple of 1★ (0★ = not crafted). */
export const GEAR_STAR_POWER = [0, 1, 2, 4, 7, 10];
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
   * a burst hits every monster in that radius around the Hunter. 'summon': calls up a creature (see `summon`).
   */
  attack: 'shot' | 'sweep' | 'stab' | 'dagger' | 'nova' | 'summon';
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
  hammer: { name: 'Hammer', attack: 'sweep', range: 1, reach: 75, arc: 1.3, knock: 420, rate: 0.45, damage: 2.3, farm: 1.4, describe: 'Very slow, crushing smashes that send monsters flying.' },
  shortbow: { name: 'Shortbow', attack: 'shot', projectile: 'arrow', range: 0.85, rate: 1.35, damage: 0.75, farm: 1, describe: 'The basic bow: quick, light shots that never stop.' },
  longbow: { name: 'Longbow', attack: 'shot', projectile: 'arrow', range: 1.35, rate: 0.65, damage: 1.5, followThrough: 45, farm: 1.2, describe: 'Slow, heavy shots from far away; each arrow carries on through its target into whatever is just behind.' },
  crossbow: { name: 'Crossbow', attack: 'shot', projectile: 'arrow', range: 1.1, rate: 0.8, damage: 1.25, pierce: 1, farm: 1.2, describe: 'Heavy bolts that always pierce at least one more monster.' },
  pistol: { name: 'Pistol', attack: 'shot', projectile: 'pistol', range: 0.7, rate: 1.6, damage: 1, mag: 6, reload: 3, farm: 1, describe: 'Hard-hitting shots at close range: 6 shots, then a reload.' },
  rifle: { name: 'Rifle', attack: 'shot', projectile: 'pistol', range: 1.5, rate: 0.8, damage: 2.4, pierce: 1, mag: 4, reload: 3, farm: 1.1, describe: 'Very hard, very long shots that pierce: 4 shots, then a long reload.' },
  repeater: { name: 'Repeater', attack: 'shot', projectile: 'bolt', range: 0.9, rate: 1.2, damage: 0.32, volley: 3, fan: 0.5, stack: 0.5, mag: 6, reload: 3, farm: 1, describe: 'Sprays volleys of 3 bolts in a random fan; each extra bolt of a volley on the same monster hits 50% harder. 6 volleys, then a reload.' },
  wand: { name: 'Wand', attack: 'shot', projectile: 'spark', range: 0.85, rate: 1.35, damage: 0.75, farm: 1, describe: 'The basic magic weapon: quick, light bolts at shorter range.' },
  scepter: { name: 'Scepter', attack: 'shot', projectile: 'spark', range: 1.25, rate: 0.75, damage: 1.3, bounces: 2, farm: 1.5, describe: 'Slower, longer-range bolts that bounce on to 2 more monsters nearby.' },
  staff: { name: 'Staff', attack: 'shot', projectile: 'spark', range: 1.1, rate: 0.8, damage: 1.25, spell: { every: 5, radius: 70, damage: 3 }, mag: 6, reload: 2, farm: 1.4, describe: 'Casts 5 bolts, then a big spell that blasts everything around its target, then a short cooldown.' },
  focus: { name: 'Focus', attack: 'nova', range: 1, reach: 110, rate: 0.8, damage: 1.2, farm: 2, describe: 'When monsters come close, bursts with power that hits every monster around the Hunter.' },
  tome: { name: 'Tome', attack: 'summon', range: 1, rate: 0.12, damage: 0.7, summon: { duration: 8, bites: 1.5, speed: 150, name: 'spirit' }, farm: 1, describe: 'Summons a spirit that hunts monsters across the field for 8s, then fades; a new one comes after a cooldown.' },
};

export const GEAR: GearDef[] = [
  // Starting gear (not craftable): your Hunter begins with the Short Sword and Common Clothes on, and a Short Bow spare.
  { id: 'shortSword', name: 'Short Sword', icon: '🗡️', kind: 'melee', rarity: 'common', weaponClass: 'sword', damageType: 'physical', hit: 1, stats: {}, recipe: { goo: 6 }, starter: true },
  { id: 'shortBow', name: 'Short Bow', icon: '🏹', kind: 'weapon', rarity: 'common', weaponClass: 'shortbow', damageType: 'physical', hit: 1, stats: {}, recipe: { goo: 6 }, starter: true },
  { id: 'commonClothes', name: 'Common Clothes', icon: '👕', kind: 'armor', rarity: 'common', stats: {}, recipe: { goo: 4 }, starter: true },
  // Weapons
  { id: 'huntingBow', name: 'Hunting Bow', icon: '🏹', kind: 'weapon', rarity: 'common', weaponClass: 'shortbow', tier: 1, damageType: 'physical', stats: {}, recipe: { goo: 8, pelt: 4 } },
  { id: 'boneCrossbow', name: 'Bone Crossbow', icon: '🎯', kind: 'weapon', rarity: 'uncommon', weaponClass: 'crossbow', tier: 3, damageType: 'physical', stats: { range: 8 }, recipe: { bone: 10, wing: 5 } },
  { id: 'emberLongbow', name: 'Ember Longbow', icon: '🔥', kind: 'weapon', rarity: 'veryRare', weaponClass: 'longbow', tier: 6, damageType: 'fire', proc: 0.3, stats: { rate: 0.12 }, recipe: { ember: 10, chitin: 5 } },
  { id: 'bonePistol', name: 'Bone Pistol', icon: '🔫', kind: 'weapon', rarity: 'uncommon', weaponClass: 'pistol', tier: 3, damageType: 'physical', stats: {}, recipe: { bone: 8, wing: 4 } },
  { id: 'frostRifle', name: 'Frost Rifle', icon: '🔫', kind: 'weapon', rarity: 'legendary', weaponClass: 'rifle', tier: 8, damageType: 'frost', proc: 0.35, stats: { range: 15 }, recipe: { fur: 10, frost: 5 } },
  { id: 'voidRepeater', name: 'Void Repeater', icon: '🌀', kind: 'weapon', rarity: 'exalted', weaponClass: 'repeater', tier: 12, damageType: 'void', stats: { rate: 0.2 }, recipe: { shade: 10, void: 5 } },
  // Melee
  { id: 'fangDagger', name: 'Fang Dagger', icon: '🗡️', kind: 'melee', rarity: 'common', weaponClass: 'dagger', tier: 1, damageType: 'physical', proc: 0.3, stats: { rate: 0.05 }, recipe: { pelt: 6, goo: 6 } },
  { id: 'goblinSword', name: 'Goblin Sword', icon: '⚔️', kind: 'melee', rarity: 'common', weaponClass: 'sword', tier: 1, damageType: 'physical', proc: 0.2, stats: {}, recipe: { pelt: 8, redgel: 4 } },
  { id: 'boneMaul', name: 'Bone Maul', icon: '🔨', kind: 'melee', rarity: 'uncommon', weaponClass: 'hammer', tier: 3, damageType: 'physical', stats: {}, recipe: { bone: 12, flesh: 6 } },
  { id: 'ironSpear', name: 'Bone Spear', icon: '🔱', kind: 'melee', rarity: 'uncommon', weaponClass: 'spear', tier: 3, damageType: 'physical', proc: 0.2, stats: {}, recipe: { bone: 10, flesh: 5 } },
  { id: 'magmaGlaive', name: 'Magma Glaive', icon: '🪓', kind: 'melee', rarity: 'veryRare', weaponClass: 'glaive', tier: 6, damageType: 'fire', proc: 0.4, stats: { range: 6 }, recipe: { magma: 10, ember: 5 } },
  { id: 'soulLance', name: 'Soulreaver Lance', icon: '⚜️', kind: 'melee', rarity: 'exalted', weaponClass: 'spear', tier: 12, damageType: 'decay', proc: 0.2, stats: { pierce: 0.2 }, recipe: { soul: 8, void: 4 } },
  // Magic (Reginald and Glimmer)
  { id: 'apprenticeWand', name: 'Apprentice Wand', icon: '🪄', kind: 'magic', rarity: 'common', weaponClass: 'wand', tier: 1, damageType: 'arcane', proc: 0.15, stats: { rate: 0.05 }, recipe: { goo: 8, redgel: 4 } },
  { id: 'gravewoodStaff', name: 'Gravewood Staff', icon: '🪵', kind: 'magic', rarity: 'uncommon', weaponClass: 'staff', tier: 3, damageType: 'decay', proc: 0.15, stats: { rate: 0.06 }, recipe: { flesh: 10, wing: 5 } },
  { id: 'emberFocus', name: 'Ember Focus', icon: '🕯️', kind: 'magic', rarity: 'veryRare', weaponClass: 'focus', tier: 6, damageType: 'fire', proc: 0.3, stats: { rate: 0.15 }, recipe: { ember: 10, magma: 5 } },
  { id: 'crystalFocus', name: 'Crystal Focus', icon: '💎', kind: 'magic', rarity: 'legendary', weaponClass: 'focus', tier: 8, damageType: 'frost', proc: 0.3, stats: { rate: 0.1 }, recipe: { frost: 8, ecto: 6 } },
  { id: 'voidScepter', name: 'Void Scepter', icon: '🪬', kind: 'magic', rarity: 'exalted', weaponClass: 'scepter', tier: 12, damageType: 'void', stats: { rate: 0.25 }, recipe: { shade: 10, void: 5 } },
  { id: 'wispTome', name: 'Tome of Wisps', icon: '📖', kind: 'magic', rarity: 'uncommon', weaponClass: 'tome', tier: 3, damageType: 'arcane', proc: 0.15, stats: {}, recipe: { flesh: 10, wing: 6, bone: 4 } },
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
  { id: 'soulfireStaff', name: 'Soulfire Staff', icon: '🌟', kind: 'magic', rarity: 'exalted', weaponClass: 'staff', tier: 12, damageType: 'radiant', proc: 0.2, stats: { rate: 0.15 }, recipe: { soul: 8, void: 4 } },
  // A weapon for every area tier (ranged, melee and magic), crafted from that area's materials.
  { id: 'thornLongbow', name: 'Thorn Longbow', icon: '🌿', kind: 'weapon', rarity: 'uncommon', weaponClass: 'longbow', tier: 2, damageType: 'physical', stats: {}, recipe: { spore: 10, pelt: 5 } },
  { id: 'thornSpear', name: 'Thorn Spear', icon: '🌱', kind: 'melee', rarity: 'uncommon', weaponClass: 'spear', tier: 2, damageType: 'poison', proc: 0.2, stats: {}, recipe: { spore: 8, dust: 5 } },
  { id: 'faerieWand', name: 'Faerie Scepter', icon: '🧚', kind: 'magic', rarity: 'uncommon', weaponClass: 'scepter', tier: 2, damageType: 'arcane', proc: 0.15, stats: {}, recipe: { dust: 10, spore: 4 } },
  { id: 'bansheeBow', name: 'Banshee Bow', icon: '👻', kind: 'weapon', rarity: 'rare', weaponClass: 'longbow', tier: 4, damageType: 'decay', proc: 0.2, stats: {}, recipe: { wrap: 10, grave: 5 } },
  { id: 'knightGlaive', name: 'Bone Knight Glaive', icon: '🪓', kind: 'melee', rarity: 'rare', weaponClass: 'glaive', tier: 4, damageType: 'physical', stats: {}, recipe: { grave: 10, bone: 6 } },
  { id: 'necroTome', name: 'Necronomicon', icon: '📕', kind: 'magic', rarity: 'rare', weaponClass: 'tome', tier: 4, damageType: 'decay', proc: 0.2, stats: {}, recipe: { wrap: 8, grave: 8 } },
  { id: 'gloomPistol', name: 'Gloom Pistol', icon: '🔫', kind: 'weapon', rarity: 'rare', weaponClass: 'pistol', tier: 5, damageType: 'arcane', proc: 0.15, stats: {}, recipe: { gloom: 10, umbra: 5 } },
  { id: 'umbralDagger', name: 'Umbral Dagger', icon: '🗡️', kind: 'melee', rarity: 'rare', weaponClass: 'dagger', tier: 5, damageType: 'physical', proc: 0.3, stats: {}, recipe: { umbra: 8, gloom: 6 } },
  { id: 'umbralFocus', name: 'Umbral Focus', icon: '🌑', kind: 'magic', rarity: 'rare', weaponClass: 'focus', tier: 5, damageType: 'arcane', proc: 0.25, stats: {}, recipe: { umbra: 10, gloom: 5 } },
  { id: 'mithrilCrossbow', name: 'Mithril Crossbow', icon: '🎯', kind: 'weapon', rarity: 'veryRare', weaponClass: 'crossbow', tier: 7, damageType: 'physical', stats: {}, recipe: { ore: 10, scale: 5 } },
  { id: 'drakeHammer', name: 'Drakebone Hammer', icon: '🔨', kind: 'melee', rarity: 'veryRare', weaponClass: 'hammer', tier: 7, damageType: 'fire', proc: 0.3, stats: {}, recipe: { scale: 10, ore: 6 } },
  { id: 'drakeScepter', name: 'Drake Scepter', icon: '🐉', kind: 'magic', rarity: 'veryRare', weaponClass: 'scepter', tier: 7, damageType: 'fire', proc: 0.25, stats: {}, recipe: { scale: 8, magma: 6 } },
  { id: 'frostbiteBlade', name: 'Frostbite Blade', icon: '❄️', kind: 'melee', rarity: 'legendary', weaponClass: 'sword', tier: 8, damageType: 'frost', proc: 0.3, stats: {}, recipe: { frost: 10, fur: 6 } },
  { id: 'skyLongbow', name: 'Skyward Longbow', icon: '🏹', kind: 'weapon', rarity: 'exotic', weaponClass: 'longbow', tier: 9, damageType: 'physical', stats: {}, recipe: { plume: 10, skystone: 5 } },
  { id: 'griffinSpear', name: 'Griffin Spear', icon: '🔱', kind: 'melee', rarity: 'exotic', weaponClass: 'spear', tier: 9, damageType: 'physical', proc: 0.2, stats: {}, recipe: { plume: 8, skystone: 6 } },
  { id: 'skyStaff', name: 'Sky Staff', icon: '🌤️', kind: 'magic', rarity: 'exotic', weaponClass: 'staff', tier: 9, damageType: 'frost', proc: 0.2, stats: {}, recipe: { skystone: 10, plume: 4 } },
  { id: 'thunderRepeater', name: 'Thunder Repeater', icon: '⚡', kind: 'weapon', rarity: 'relic', weaponClass: 'repeater', tier: 10, damageType: 'arcane', proc: 0.2, stats: {}, recipe: { thunder: 10, feather: 5 } },
  { id: 'stormbreaker', name: 'Stormbreaker', icon: '🔨', kind: 'melee', rarity: 'relic', weaponClass: 'hammer', tier: 10, damageType: 'radiant', proc: 0.25, stats: {}, recipe: { thunder: 12, feather: 6 } },
  { id: 'stormTome', name: 'Tome of Storms', icon: '📘', kind: 'magic', rarity: 'relic', weaponClass: 'tome', tier: 10, damageType: 'arcane', proc: 0.2, stats: {}, recipe: { feather: 10, thunder: 6 } },
  { id: 'meteorRifle', name: 'Meteor Rifle', icon: '☄️', kind: 'weapon', rarity: 'artifact', weaponClass: 'rifle', tier: 11, damageType: 'fire', proc: 0.3, stats: {}, recipe: { meteor: 10, stardust: 5 } },
  { id: 'starsteelSword', name: 'Starsteel Sword', icon: '⚔️', kind: 'melee', rarity: 'artifact', weaponClass: 'sword', tier: 11, damageType: 'radiant', proc: 0.25, stats: {}, recipe: { meteor: 10, stardust: 6 } },
  { id: 'starScepter', name: 'Star Scepter', icon: '🌟', kind: 'magic', rarity: 'artifact', weaponClass: 'scepter', tier: 11, damageType: 'radiant', proc: 0.25, stats: {}, recipe: { stardust: 10, meteor: 4 } },
  // Armor
  { id: 'leatherVest', name: 'Leather Vest', icon: '🦺', kind: 'armor', rarity: 'common', stats: { stun: 0.05 }, recipe: { pelt: 8, goo: 6 } },
  { id: 'bonePlate', name: 'Bone Plate', icon: '🦴', kind: 'armor', rarity: 'rare', stats: { stun: 0.06, guard: 0.2 }, recipe: { bone: 10, flesh: 6 } },
  { id: 'chitinCarapace', name: 'Chitin Carapace', icon: '🪲', kind: 'armor', rarity: 'veryRare', stats: { stun: 0.07, damage: 0.05 }, recipe: { chitin: 10, magma: 5 } },
  { id: 'frostMail', name: 'Frost Mail', icon: '🧥', kind: 'armor', rarity: 'exotic', stats: { stun: 0.08, guard: 0.3 }, recipe: { fur: 10, frost: 6 } },
  // Accessories
  { id: 'luckyCharm', name: 'Lucky Charm', icon: '🍀', kind: 'accessory', rarity: 'common', stats: { crit: 0.03 }, recipe: { redgel: 6, goo: 6 } },
  { id: 'goldTooth', name: 'Gold Tooth', icon: '🦷', kind: 'accessory', rarity: 'uncommon', stats: { gold: 0.15 }, recipe: { redgel: 6, bone: 6 } },
  { id: 'satchel', name: "Scavenger's Satchel", icon: '👜', kind: 'accessory', rarity: 'uncommon', stats: { drops: 0.15 }, recipe: { wing: 6, pelt: 8 } },
  { id: 'emberOrb', name: 'Ember Orb', icon: '🔮', kind: 'accessory', rarity: 'veryRare', stats: { radius: 0.12, damage: 0.08 }, recipe: { ember: 8, magma: 4 } },
  { id: 'hawkeyeLens', name: 'Hawkeye Lens', icon: '🔭', kind: 'accessory', rarity: 'rare', stats: { range: 20 }, recipe: { chitin: 8, wing: 6 } },
  { id: 'soulRing', name: 'Soul Ring', icon: '💍', kind: 'accessory', rarity: 'relic', stats: { damage: 0.25, crit: 0.02 }, recipe: { soul: 6, ecto: 6 } },
];

export const gearDef = (id: GearId): GearDef => GEAR.find((g) => g.id === id)!;

/** Colour of a gear piece's rarity. */
export const gearColor = (id: GearId): string => RARITIES[gearDef(id).rarity].color;

/** A piece's stats at a star count. */
export function gearStats(def: GearDef, stars: number): Partial<Record<GearStat, number>> {
  const out: Partial<Record<GearStat, number>> = {};
  const power = GEAR_STAR_POWER[Math.max(0, Math.min(MAX_STARS, stars))];
  for (const [k, v] of Object.entries(def.stats) as [GearStat, number][]) out[k] = v * power;
  return out;
}

export function describeGear(stats: Partial<Record<GearStat, number>>): string {
  return (Object.entries(stats) as [GearStat, number][])
    .filter(([k, v]) => (k === 'guard' || k === 'pierce' ? Math.floor(v) >= 1 : v > 0))
    .map(([k, v]) => GEAR_STATS[k](v))
    .join(', ');
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

// ---- Camp upgrades (the original Forge items): permanent, boost every Hunter ----
// ---- Forge items: crafted from materials, permanent, boost every Hunter ----
export type ItemId =
  | 'whetstone'
  | 'gloves'
  | 'lure'
  | 'pouch'
  | 'splitbow'
  | 'bonemail'
  | 'idol'
  | 'lance'
  | 'lantern'
  | 'engine'
  | 'forestIdol'
  | 'graveWhetstone'
  | 'batwingGloves';

export interface ItemDef {
  id: ItemId;
  name: string;
  icon: string;
  rarity: Rarity;
  /** Area Upgrades change one area's monsters (multipliers at a strength, in steps). */
  area?: { id: AreaId; hp: (level: number) => number; gold: (level: number) => number };
  /**
   * Its strength at 5★, in steps (1★ is 1 step). Common and Uncommon Upgrades stop at 15, since rarer gear
   * and Upgrades take over from there. The stars between are spread out geometrically.
   */
  maxLevel: number;
  recipe: Partial<Record<MaterialId, number>>;
  /** Material cost multiplier per step already owned. */
  growth: number;
  /** What it does at a strength (in steps; see itemLevel). */
  describe: (level: number) => string;
}

export const ITEMS: ItemDef[] = [
  { id: 'whetstone', name: 'Whetstone', icon: '🪨', rarity: 'common', maxLevel: 15, recipe: { goo: 4 }, growth: 1.45, describe: (l) => `+${l * 10}% damage` },
  { id: 'gloves', name: 'Quickdraw Gloves', icon: '🧤', rarity: 'common', maxLevel: 15, recipe: { goo: 6, pelt: 2 }, growth: 1.5, describe: (l) => `+${l * 10}% attack rate` },
  { id: 'lure', name: 'Monster Lure', icon: '🍖', rarity: 'uncommon', maxLevel: 15, recipe: { redgel: 5, pelt: 3 }, growth: 1.6, describe: (l) => `+${l * 20}% enemy spawns` },
  { id: 'pouch', name: "Scavenger's Pouch", icon: '👝', rarity: 'uncommon', maxLevel: 15, recipe: { pelt: 6, redgel: 3 }, growth: 1.5, describe: (l) => `+${l * 25}% material drops` },
  { id: 'bonemail', name: 'Bone Mail', icon: '🦴', rarity: 'rare', maxLevel: 10, recipe: { bone: 8, flesh: 4 }, growth: 1.6, describe: (l) => `−${Math.round((1 - 0.88 ** l) * 100)}% stun time` },
  { id: 'splitbow', name: 'Split Bow', icon: '🔱', rarity: 'rare', maxLevel: 5, recipe: { bone: 10, wing: 6 }, growth: 3, describe: (l) => `+${l} projectile${l === 1 ? '' : 's'} per volley` },
  { id: 'idol', name: 'Golden Idol', icon: '🗿', rarity: 'veryRare', maxLevel: 30, recipe: { ember: 6, magma: 3 }, growth: 1.5, describe: (l) => `+${l * 25}% gold` },
  { id: 'lance', name: 'Frost Lance', icon: '❄️', rarity: 'legendary', maxLevel: 5, recipe: { chitin: 8, frost: 4 }, growth: 2.2, describe: (l) => `shots pierce ${l} more enem${l === 1 ? 'y' : 'ies'}` },
  { id: 'lantern', name: 'Soul Lantern', icon: '🏮', rarity: 'exotic', maxLevel: 10, recipe: { ecto: 8, fur: 6 }, growth: 1.8, describe: (l) => `+${l * 4}% crit chance` },
  // Rare successors: they pick up where the Common Whetstone and Gloves stop, from Graveyard and Crypt materials.
  { id: 'graveWhetstone', name: 'Grave Whetstone', icon: '⚱️', rarity: 'rare', maxLevel: 8, recipe: { bone: 12, flesh: 8 }, growth: 1.6, describe: (l) => `+${l * 8}% damage (on top of the Whetstone)` },
  { id: 'batwingGloves', name: 'Batwing Gloves', icon: '🦇', rarity: 'rare', maxLevel: 8, recipe: { wing: 10, bone: 6 }, growth: 1.65, describe: (l) => `+${l * 6}% attack rate (on top of the Quickdraw Gloves)` },
  {
    id: 'forestIdol',
    name: 'Forest Idol',
    icon: '🌳',
    rarity: 'uncommon',
    area: { id: 'forest', hp: () => 2, gold: (l) => 2 + 0.25 * (l - 1) },
    maxLevel: 5,
    recipe: { goo: 30, pelt: 15, redgel: 10 },
    growth: 2,
    describe: (l) => `Whispering Forest monsters: ×2 HP, ×${2 + 0.25 * (l - 1)} gold`,
  },
  { id: 'engine', name: 'Void Engine', icon: '🌀', rarity: 'artifact', maxLevel: 20, recipe: { shade: 10, void: 5, soul: 3 }, growth: 1.7, describe: (l) => `+${l * 10}% damage, +${l * 5}% attack rate` },
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

/** An Upgrade's strength at a star count. */
export const itemLevel = (item: ItemDef, stars: number): number => itemLevels(item)[Math.max(0, Math.min(MAX_STARS, stars))];

/** Materials to go from `stars` to `stars + 1` (0 = crafting it). */
export function itemCost(item: ItemDef, stars: number): Partial<Record<MaterialId, number>> {
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

export const EVENTS: EventDef[] = [
  // Listed in the order they unlock: the Slime Swarm comes first in the Forest.
  {
    id: 'slimeSwarm',
    area: 'forest',
    kind: 'swarm',
    name: 'Slime Swarm',
    icon: '🟢',
    blurb: 'Slimes flood the forest for 60s: twice as many (at least 10 Green Slimes a second), twice as fast.',
    unlockKills: 1000,
    unlockArchetype: 'slime',
    cooldown: 15 * 60,
    duration: 60,
    archetype: 'slime',
    spawnMult: 2,
    speedMult: 2,
    minSpawn: { greenSlime: 10 },
  },
  ...AREAS.filter((a) => Number.isFinite(a.mastery)).map(
    (a): EventDef => ({
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
    }),
  ),
];

export const eventDef = (id: string): EventDef => EVENTS.find((e) => e.id === id)!;

/** Your Hunter's sessions from Lv 1 to 100, and from becoming the Slayer to Lv 200. */
export const MAIN_SESSIONS_TO_ASCEND = sessionsToLevel(MAIN_ASCEND_LEVEL);
export const MAIN_SESSIONS_AFTER_ASCEND = sessionsAfterAscending(MAIN_ASCEND_LEVEL, MAIN_MAX_LEVEL);
