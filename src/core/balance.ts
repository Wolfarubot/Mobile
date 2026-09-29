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
  /** Seconds after starting before it can run again. */
  cooldown: number;
  /** Seconds it lasts (a Guardian gives you GUARDIAN_TIME once it appears). */
  duration: number;
  /** Swarm: only this archetype spawns, with spawn rate and speed multiplied. */
  archetype?: Archetype;
  spawnMult?: number;
  speedMult?: number;
}

export const GUARDIAN_COOLDOWN = 5 * 60;

// EVENTS is built at the end of this file, once AREAS exists.

// ---- Training & skills (every Hunter, you included) ----
// Hunters *train* with gold: every session adds a little damage. Enough training raises their level,
// and each level earns a skill point for their skill tree.

/** Damage per shot after `trains` training sessions: linear, doubling every 25 sessions. */
export function powerDamage(trains: number): number {
  return (1 + trains) * 2 ** Math.floor(trains / 25);
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

export interface SkillNode {
  id: string;
  name: string;
  icon: string;
  desc: string;
  maxRank: number;
  /** Effect per rank. */
  effect: Partial<Record<TreeStat, number>>;
  /** Nodes that must have at least one rank first (any one of them). */
  requires: string[];
  /** Grid position in the tree: column 0–2, row from the top. */
  col: number;
  row: number;
}

/** Recovery Speed: each rank shortens stuns by this factor. */
export const SKILL_RECOVERY = 0.92;

type NodeSpec = Pick<SkillNode, 'name' | 'icon' | 'desc' | 'maxRank' | 'effect'>;

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

/** Each Hunter's skill tree ('main' is yours). */
export const SKILL_TREES: Record<'main' | HunterId, SkillNode[]> = {
  main: skillTree(
    { name: "Hunter's Instinct", icon: '👁️', desc: '+5% crit chance.', maxRank: 1, effect: { crit: 0.05 } },
    [
      { name: 'Tap Power', icon: '👆', desc: '+50% tap blast damage per rank.', maxRank: 5, effect: { tapPower: 0.5 } },
      { name: 'Split Shot', icon: '🔱', desc: 'Shots pierce 1 more enemy per rank.', maxRank: 2, effect: { pierce: 1 } },
      { name: 'Tap Size', icon: '💥', desc: '+15% tap blast area per rank.', maxRank: 5, effect: { tapSize: 0.15 } },
    ],
    { name: 'Apex Hunter', icon: '👑', desc: '+25% damage and +10% attack rate.', maxRank: 1, effect: { damage: 0.25, rate: 0.1 } },
  ),
  alchemist: skillTree(
    { name: 'Toxic Brew', icon: '🧪', desc: 'Poison puddles spread 15% wider.', maxRank: 1, effect: { radius: 0.15 } },
    [
      { name: 'Slime Bane', icon: '🟢', desc: '+0.5× extra damage to Slimes per rank.', maxRank: 3, effect: { bane: 0.5 } },
      { name: 'Wide Splash', icon: '💦', desc: 'Puddles 15% wider per rank.', maxRank: 3, effect: { radius: 0.15 } },
      { name: 'Lucky Finds', icon: '🍀', desc: '+15% materials from her kills per rank.', maxRank: 3, effect: { drops: 0.15 } },
    ],
    { name: 'Grand Alchemy', icon: '⚗️', desc: '+25% damage, puddles 15% wider.', maxRank: 1, effect: { damage: 0.25, radius: 0.15 } },
  ),
  ranger: skillTree(
    { name: 'Trueshot', icon: '🎯', desc: '+20 range.', maxRank: 1, effect: { range: 20 } },
    [
      { name: 'Beast Bane', icon: '🐾', desc: '+0.5× extra damage to Beasts per rank.', maxRank: 3, effect: { bane: 0.5 } },
      { name: 'Longshot', icon: '🏹', desc: '+25 range per rank.', maxRank: 3, effect: { range: 25 } },
      { name: 'Piercing Arrows', icon: '➶', desc: 'Arrows pierce 1 more enemy per rank.', maxRank: 2, effect: { pierce: 1 } },
    ],
    { name: 'Volley', icon: '🌧️', desc: '+20% attack rate and +10% damage.', maxRank: 1, effect: { rate: 0.2, damage: 0.1 } },
  ),
  glimmer: skillTree(
    { name: 'Kindling', icon: '🔥', desc: 'Fireball explosions 10% wider.', maxRank: 1, effect: { radius: 0.1 } },
    [
      { name: 'Inferno', icon: '🌋', desc: '+15% damage per rank.', maxRank: 5, effect: { damage: 0.15 } },
      { name: 'Wildfire', icon: '💥', desc: 'Explosions 15% wider per rank.', maxRank: 3, effect: { radius: 0.15 } },
      { name: 'Arcane Focus', icon: '🔮', desc: '+3% crit chance per rank.', maxRank: 3, effect: { crit: 0.03 } },
    ],
    { name: 'Meteor', icon: '☄️', desc: '+30% damage, explosions 20% wider.', maxRank: 1, effect: { damage: 0.3, radius: 0.2 } },
  ),
  gravewarden: skillTree(
    { name: 'Consecration', icon: '✨', desc: 'Holy pulses reach 10% further.', maxRank: 1, effect: { radius: 0.1 } },
    [
      { name: 'Undead Bane', icon: '💀', desc: '+0.5× extra damage to Undead per rank.', maxRank: 3, effect: { bane: 0.5 } },
      { name: 'Holy Radiance', icon: '🌟', desc: 'Pulses reach 15% further per rank.', maxRank: 3, effect: { radius: 0.15 } },
      { name: 'Sanctuary', icon: '⛪', desc: 'Stuns wear off 8% faster per rank.', maxRank: 3, effect: { recovery: 1 } },
    ],
    { name: 'Divine Wrath', icon: '⚡', desc: '+30% damage.', maxRank: 1, effect: { damage: 0.3 } },
  ),
  lance: skillTree(
    { name: 'Zone of Protection', icon: '🛡️', desc: 'His shield: blocks 3 hits before he is stunned, regaining a charge every few seconds.', maxRank: 1, effect: { guard: 3 } },
    [
      { name: 'Piercing Thrust', icon: '🔱', desc: '+10 reach per rank.', maxRank: 3, effect: { range: 10 } },
      { name: 'Bulwark', icon: '🧱', desc: 'His shield blocks 1 more hit per rank.', maxRank: 2, effect: { guard: 1 } },
      { name: 'Rallying Oath', icon: '📯', desc: 'Every other Hunter (you too) gets a 1-hit shield.', maxRank: 1, effect: { rally: 1 } },
    ],
    { name: 'Holy Lance', icon: '⚜️', desc: '+30% damage and 1 more shield charge.', maxRank: 1, effect: { damage: 0.3, guard: 1 } },
  ),
  prospector: skillTree(
    { name: 'Gold Rush', icon: '💰', desc: '+25% gold from his kills.', maxRank: 1, effect: { gold: 0.25 } },
    [
      { name: 'Buckshot', icon: '💥', desc: '+15% damage per rank.', maxRank: 3, effect: { damage: 0.15 } },
      { name: 'Prospecting', icon: '⛏️', desc: '+25% gold from his kills per rank.', maxRank: 3, effect: { gold: 0.25 } },
      { name: 'Lucky Strike', icon: '🎲', desc: '+3% crit chance per rank.', maxRank: 3, effect: { crit: 0.03 } },
    ],
    { name: 'Motherlode', icon: '🏆', desc: '+50% gold and +15% damage.', maxRank: 1, effect: { gold: 0.5, damage: 0.15 } },
  ),
  demonbane: skillTree(
    { name: 'Hexed Blades', icon: '🗡️', desc: '+5% crit chance.', maxRank: 1, effect: { crit: 0.05 } },
    [
      { name: 'Demon Bane', icon: '😈', desc: '+0.5× extra damage to Demons per rank.', maxRank: 3, effect: { bane: 0.5 } },
      { name: 'Flurry', icon: '🌪️', desc: '+10% attack rate per rank.', maxRank: 3, effect: { rate: 0.1 } },
      { name: 'Keen Edge', icon: '🔪', desc: '+3% crit chance per rank.', maxRank: 3, effect: { crit: 0.03 } },
    ],
    { name: 'Exorcist', icon: '📿', desc: '+30% damage.', maxRank: 1, effect: { damage: 0.3 } },
  ),
  wilhelm: skillTree(
    { name: 'Steady Aim', icon: '🎯', desc: '+30 range.', maxRank: 1, effect: { range: 30 } },
    [
      { name: 'Deadeye', icon: '👁️', desc: '+4% crit chance per rank.', maxRank: 3, effect: { crit: 0.04 } },
      { name: 'Hollow Point', icon: '🔩', desc: 'Shots pierce 1 more enemy per rank.', maxRank: 2, effect: { pierce: 1 } },
      { name: 'Quickdraw', icon: '🔫', desc: '+10% attack rate per rank.', maxRank: 3, effect: { rate: 0.1 } },
    ],
    { name: 'Marksman', icon: '🏅', desc: '+30% damage and +30 range.', maxRank: 1, effect: { damage: 0.3, range: 30 } },
  ),
  scavenger: skillTree(
    { name: 'Magpie', icon: '🐦', desc: '+20% materials from his kills.', maxRank: 1, effect: { drops: 0.2 } },
    [
      { name: 'Hard Stones', icon: '🪨', desc: '+15% damage per rank.', maxRank: 3, effect: { damage: 0.15 } },
      { name: 'Keen Nose', icon: '👃', desc: '+20% materials per rank.', maxRank: 3, effect: { drops: 0.2 } },
      { name: 'Long Sling', icon: '🎯', desc: '+20 range per rank.', maxRank: 3, effect: { range: 20 } },
    ],
    { name: 'Treasure Trove', icon: '💎', desc: '+40% materials and +20% gold.', maxRank: 1, effect: { drops: 0.4, gold: 0.2 } },
  ),
  frostbreaker: skillTree(
    { name: 'Permafrost', icon: '❄️', desc: '+10% damage.', maxRank: 1, effect: { damage: 0.1 } },
    [
      { name: 'Elemental Bane', icon: '🔷', desc: '+0.5× extra damage to Elementals per rank.', maxRank: 3, effect: { bane: 0.5 } },
      { name: 'Heavy Hammer', icon: '🔨', desc: '+15% damage per rank.', maxRank: 3, effect: { damage: 0.15 } },
      { name: 'Glacial Hide', icon: '🧊', desc: 'Stuns wear off 8% faster per rank.', maxRank: 3, effect: { recovery: 1 } },
    ],
    { name: 'Avalanche', icon: '🏔️', desc: '+30% damage and +10% attack rate.', maxRank: 1, effect: { damage: 0.3, rate: 0.1 } },
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
}

export const MATERIALS: MaterialDef[] = [
  { id: 'goo', name: 'Slime Gel', color: '#7be07b' },
  { id: 'pelt', name: 'Wolf Pelt', color: '#c09060' },
  { id: 'redgel', name: 'Red Gel', color: '#ff6b6b' },
  { id: 'bone', name: 'Bone', color: '#efe6cf' },
  { id: 'flesh', name: 'Rotten Flesh', color: '#9bb56e' },
  { id: 'wing', name: 'Bat Wing', color: '#8a78b0' },
  { id: 'ember', name: 'Ember', color: '#ff8a3d' },
  { id: 'magma', name: 'Magma Gel', color: '#ff4d1a' },
  { id: 'chitin', name: 'Chitin', color: '#3fb0a0' },
  { id: 'fur', name: 'Frost Fur', color: '#dfefff' },
  { id: 'frost', name: 'Frost Shard', color: '#8fdcff' },
  { id: 'ecto', name: 'Ectoplasm', color: '#c49bff' },
  { id: 'shade', name: 'Shadow Gel', color: '#7a5cc0' },
  { id: 'void', name: 'Void Dust', color: '#ff5fd7' },
  { id: 'soul', name: 'Soul Gem', color: '#6ff0e0' },
];

export const materialDef = (id: MaterialId): MaterialDef => MATERIALS.find((m) => m.id === id)!;

// ---- Archetypes: enemy families that Hunters specialize against ----
export type Archetype = 'slime' | 'beast' | 'undead' | 'demon' | 'elemental';

export const ARCHETYPES: Record<Archetype, { name: string; icon: string }> = {
  slime: { name: 'Slime', icon: '🟢' },
  beast: { name: 'Beast', icon: '🐾' },
  undead: { name: 'Undead', icon: '💀' },
  demon: { name: 'Demon', icon: '😈' },
  elemental: { name: 'Elemental', icon: '🔷' },
};

// ---- Areas: permanent unlocks, each with its own enemies and materials ----
export type AreaId = 'forest' | 'graveyard' | 'caves' | 'peaks' | 'rift';

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
  { id: 'forest', name: 'Whispering Forest', icon: '🌲', hp: 1, gold: 1, speed: 36, mastery: 600, guardian: 25_000, palette: ['#183c18', '#2f7d32', '#7ec850', '#e2f5c4'], ground: ['#6cb848', '#58a03c'], blurb: 'Where every hunt begins.' },
  { id: 'graveyard', name: 'Old Graveyard', icon: '🪦', hp: 150, gold: 25, speed: 40, mastery: 1_500, guardian: 60_000_000, palette: ['#1e1a2a', '#4a4460', '#9a94b0', '#e8e4f0'], ground: ['#5b5670', '#4c4762'], blurb: 'The dead do not rest here.' },
  { id: 'caves', name: 'Ember Caves', icon: '🌋', hp: 150_000, gold: 600, speed: 45, mastery: 4_000, guardian: 5_000_000_000, palette: ['#2a0e08', '#8a2c10', '#e07030', '#fde4c0'], ground: ['#6a2c1a', '#823722'], blurb: 'Hot, bright and full of teeth.' },
  { id: 'peaks', name: 'Frost Peaks', icon: '🏔️', hp: 7_000_000, gold: 15_000, speed: 50, mastery: 10_000, guardian: 220_000_000_000, palette: ['#0c2038', '#2a60a0', '#78b8e8', '#e4f4ff'], ground: ['#bcd8f0', '#a4c6e6'], blurb: 'Cold winds carry cold things.' },
  { id: 'rift', name: 'Void Rift', icon: '🌀', hp: 250_000_000, gold: 350_000, speed: 56, mastery: Infinity, guardian: Infinity, palette: ['#1a0830', '#5a2098', '#b070e0', '#f2e4ff'], ground: ['#2a1440', '#3a1d58'], blurb: 'The end of the known world.' },
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
  | 'lich';
export type EnemyShape = 'circle' | 'square' | 'triangle' | 'diamond' | 'ghost' | 'hexagon';

export interface EnemyDef {
  id: EnemyId;
  name: string;
  area: AreaId;
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
  { id: 'wolf', name: 'Forest Wolf', area: 'forest', archetype: 'beast', hp: 1.3, speed: 1.5, gold: 1.6, spawn: 0.6, pack: [2, 3], radius: 10, material: 'pelt', unlock: 120, color: '#b08a5a', shape: 'triangle', blurb: 'Fast, hunts in pairs.', weak: ['fire'], resist: ['frost'] },
  { id: 'redSlime', name: 'Red Slime', area: 'forest', archetype: 'slime', hp: 2, speed: 0.9, gold: 2.5, spawn: 0.5, pack: [2, 4], radius: 11, material: 'redgel', unlock: 900, color: '#ff6b6b', shape: 'circle', blurb: 'A tougher, angrier slime.', weak: ['frost'], resist: ['fire', 'poison'] },
  // Old Graveyard
  { id: 'skeleton', name: 'Skeleton', area: 'graveyard', archetype: 'undead', hp: 1, speed: 0.9, gold: 1, spawn: 1.5, pack: [3, 5], radius: 11, material: 'bone', unlock: 0, color: '#e8dcc0', shape: 'square', blurb: 'Rattles in by the dozen.', weak: ['radiant', 'arcane'], resist: ['poison', 'decay'] },
  { id: 'zombie', name: 'Zombie', area: 'graveyard', archetype: 'undead', hp: 2.2, speed: 0.6, gold: 2.4, spawn: 0.6, pack: [2, 4], radius: 12, material: 'flesh', unlock: 120, color: '#8fae6b', shape: 'square', blurb: 'Slow, sturdy, relentless.', weak: ['fire', 'radiant'], resist: ['poison', 'decay'] },
  { id: 'bat', name: 'Grave Bat', area: 'graveyard', archetype: 'beast', hp: 0.6, speed: 1.9, gold: 1.3, spawn: 0.8, pack: [3, 5], radius: 8, material: 'wing', unlock: 900, color: '#8a78b0', shape: 'triangle', blurb: 'Tiny, fast and everywhere.', weak: ['frost', 'radiant'], resist: ['decay'] },
  // Ember Caves
  { id: 'imp', name: 'Imp', area: 'caves', archetype: 'demon', hp: 1, speed: 1.3, gold: 1, spawn: 1.4, pack: [2, 4], radius: 9, material: 'ember', unlock: 0, color: '#ff7a3d', shape: 'hexagon', blurb: 'Cackling little fire-starters.', weak: ['frost', 'radiant'], resist: ['fire'] },
  { id: 'magmaSlime', name: 'Magma Slime', area: 'caves', archetype: 'slime', hp: 2.5, speed: 0.8, gold: 2.5, spawn: 0.6, pack: [2, 3], radius: 12, material: 'magma', unlock: 120, color: '#ff4d1a', shape: 'circle', blurb: 'Molten and very hard to squish.', weak: ['frost', 'acid'], resist: ['fire', 'physical'] },
  { id: 'beetle', name: 'Fire Beetle', area: 'caves', archetype: 'beast', hp: 1.8, speed: 1.1, gold: 1.8, spawn: 0.7, pack: [2, 4], radius: 11, material: 'chitin', unlock: 900, color: '#3fb0a0', shape: 'triangle', blurb: 'Armored and quick to scuttle.', weak: ['acid', 'frost'], resist: ['physical', 'fire'] },
  // Frost Peaks
  { id: 'iceWolf', name: 'Ice Wolf', area: 'peaks', archetype: 'beast', hp: 1, speed: 1.4, gold: 1, spawn: 1.4, pack: [2, 4], radius: 10, material: 'fur', unlock: 0, color: '#dfefff', shape: 'triangle', blurb: 'The pack howls on the wind.', weak: ['fire'], resist: ['frost'] },
  { id: 'golem', name: 'Frost Golem', area: 'peaks', archetype: 'elemental', hp: 4, speed: 0.5, gold: 4.5, spawn: 0.3, pack: [1, 2], radius: 16, material: 'frost', unlock: 120, color: '#8fdcff', shape: 'diamond', blurb: 'A walking wall of ice.', weak: ['fire', 'acid'], resist: ['frost', 'poison'] },
  { id: 'wraith', name: 'Snow Wraith', area: 'peaks', archetype: 'undead', hp: 1.4, speed: 1.3, gold: 1.8, spawn: 0.6, pack: [2, 4], radius: 11, material: 'ecto', unlock: 900, color: '#c49bff', shape: 'ghost', blurb: 'Drifts in quickly from the storm.', weak: ['radiant', 'arcane'], resist: ['physical'] },
  // Void Rift
  { id: 'shadowSlime', name: 'Shadow Slime', area: 'rift', archetype: 'slime', hp: 1, speed: 1, gold: 1, spawn: 1.5, pack: [3, 5], radius: 11, material: 'shade', unlock: 0, color: '#7a5cc0', shape: 'circle', blurb: 'A slime made of the dark itself.', weak: ['radiant', 'acid'], resist: ['void'] },
  { id: 'horror', name: 'Void Horror', area: 'rift', archetype: 'demon', hp: 5, speed: 0.8, gold: 6, spawn: 0.25, pack: [1, 2], radius: 15, material: 'void', unlock: 120, color: '#ff5fd7', shape: 'hexagon', blurb: 'Rare, huge, and very rewarding.', weak: ['radiant', 'arcane'], resist: ['void', 'decay'] },
  { id: 'lich', name: 'Lich', area: 'rift', archetype: 'undead', hp: 2.5, speed: 1, gold: 3.5, spawn: 0.4, pack: [1, 3], radius: 12, material: 'soul', unlock: 900, color: '#6ff0e0', shape: 'ghost', blurb: 'An undead king hoarding souls.', weak: ['radiant', 'fire'], resist: ['decay', 'poison', 'frost'] },
];

export const enemyDef = (id: EnemyId): EnemyDef => ENEMIES.find((e) => e.id === id)!;
export const areaEnemies = (area: AreaId): EnemyDef[] => ENEMIES.filter((e) => e.area === area);
export const enemyUnlockCost = (def: EnemyDef): number => def.unlock * areaDef(def.area).gold;

// Per-enemy upgrades (gold, permanent)
export type EnemyUpgrade = 'swarm' | 'bounty';
export const ENEMY_UPGRADE_MAX = 15;
export const SWARM_PER_LEVEL = 0.4; // +40% of that enemy spawning
export const BOUNTY_GOLD_PER_LEVEL = 0.5; // +50% gold from that enemy
export const BOUNTY_DROP_PER_LEVEL = 0.15; // +15% material drops from that enemy
export const BOUNTY_SPEED_PER_LEVEL = 0.12; // ...but it moves 12% faster

export function enemyUpgradeCost(def: EnemyDef, kind: EnemyUpgrade, level: number): number {
  const base = areaDef(def.area).gold * Math.max(60, def.unlock * 0.5) * (kind === 'bounty' ? 1.5 : 1);
  return Math.ceil(base * 2.4 ** level);
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
  | 'scavenger'
  | 'frostbreaker';

// ---- Damage types: every attack deals one. Weapons carry a type; without one, a Hunter uses their own. ----
export type DamageType = 'physical' | 'fire' | 'acid' | 'frost' | 'radiant' | 'poison' | 'arcane' | 'decay' | 'void';

export const DAMAGE_TYPES: Record<DamageType, { name: string; icon: string; color: string }> = {
  physical: { name: 'Physical', icon: '🗡️', color: '#e8e8e8' },
  fire: { name: 'Fire', icon: '🔥', color: '#ff7a2a' },
  acid: { name: 'Acid', icon: '🧪', color: '#c6f03a' },
  frost: { name: 'Frost', icon: '❄️', color: '#8fdcff' },
  radiant: { name: 'Radiant', icon: '✨', color: '#ffe36e' },
  poison: { name: 'Poison', icon: '☠️', color: '#6fdc5a' },
  arcane: { name: 'Arcane', icon: '🔮', color: '#c08cff' },
  decay: { name: 'Decay', icon: '🍂', color: '#b09a60' },
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
  | 'hammer'; // slows what it hits

export interface AttackStyle {
  kind: AttackKind;
  /** Their own damage type, used when their weapon slot is empty (and always for specials). */
  damageType: DamageType;
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
   * A special attack on a cooldown (Mira's potions, Glimmer's fireballs), cast alongside their normal shots.
   * Its damage per hit is `damage` × their shot damage × (1 + their weapon's damage); its radius is
   * `radius` × (1 + their weapon's attack rate). `ticks` is how many times it hits (a puddle ticks), and
   * `crowd` how many monsters it typically catches, for the background model.
   */
  special?: { cooldown: number; damage: number; radius: number; ticks: number; crowd: number };
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
    id: 'alchemist', name: 'Mira', title: 'Alchemist', icon: '⚗️', color: '#7be07b', area: 'forest', recruitCost: 150, bane: { archetype: 'slime', mult: 3 },
    unlock: { event: 'guardian-forest', times: 1 },
    ability: 'Every few seconds, lobs a potion that leaves a poison puddle. Deals triple damage to Slimes. Uses ranged or magic weapons.',
    slots: [{ kind: 'weapon', label: 'Weapon', accepts: ['weapon', 'magic'] }, { kind: 'armor', label: 'Armor' }, { kind: 'accessory', label: 'Accessory' }],
    style: {
      kind: 'potion', damageType: 'poison', range: 230, rate: 0.6, damage: 0.8, farm: 1, crowd: 1,
      special: { cooldown: 4, damage: 0.35, radius: 45, ticks: 6, crowd: 2.5 },
      describe: 'Flings magic bolts. Every 4s she lobs a potion whose puddle keeps hurting: her weapon\'s damage powers the poison, its attack rate widens the puddle.',
    },
  },
  {
    id: 'ranger', name: 'Rin', title: 'Ranger', icon: '🏹', color: '#c09060', area: 'forest', recruitCost: 1_200, bane: { archetype: 'beast', mult: 3 },
    unlock: { event: 'guardian-forest', times: 2 },
    ability: 'Arrows pierce through lines of enemies. Deals triple damage to Beasts.',
    style: { kind: 'arrow', damageType: 'physical', range: 300, rate: 1, damage: 1, pierce: 3, farm: 1.4, crowd: 2, describe: 'Arrows pierce through up to 4 enemies in a line.' },
  },
  {
    id: 'glimmer', name: 'Glimmer', title: 'Wizard', icon: '🧙', color: '#b07cff', area: 'forest', recruitCost: 600,
    unlock: { event: 'slimeSwarm', times: 1 },
    ability: 'Every few seconds, hurls a fireball that explodes for area damage. Wields only magic weapons.',
    slots: [{ kind: 'magic', label: 'Magic weapon' }, { kind: 'armor', label: 'Robe' }, { kind: 'accessory', label: 'Accessory' }],
    style: {
      kind: 'fireball', damageType: 'fire', range: 260, rate: 0.55, damage: 1.6, farm: 1, crowd: 1,
      special: { cooldown: 4, damage: 1.75, radius: 55, ticks: 1, crowd: 3 },
      describe: 'Fires magic bolts. Every 4s he hurls a fireball that explodes: his weapon\'s damage powers the blast, its attack rate widens it.',
    },
  },
  {
    id: 'gravewarden', name: 'Alric', title: 'Gravewarden', icon: '✝️', color: '#efe6cf', area: 'graveyard', recruitCost: 15_000, bane: { archetype: 'undead', mult: 3 },
    unlock: { event: 'guardian-graveyard', times: 1 },
    ability: 'Holy pulses strike everything around him. Deals triple damage to Undead.',
    style: { kind: 'nova', damageType: 'radiant', range: 110, rate: 0.5, damage: 1.5, radius: 110, farm: 1.5, crowd: 3, describe: 'Pulses holy light, striking every enemy around him.' },
  },
  {
    id: 'lance', name: 'Lance', title: 'Paladin', icon: '🛡️', color: '#ffe8a3', area: 'graveyard', recruitCost: 40_000,
    unlock: { event: 'guardian-graveyard', times: 2 },
    ability: 'Can take multiple hits before being knocked out (Zone of Protection), and grants other Hunters an extra hit as well (Rallying Oath).',
    slots: [{ kind: 'melee', label: 'Melee' }, { kind: 'armor', label: 'Armor' }, { kind: 'accessory', label: 'Accessory' }],
    style: { kind: 'thrust', damageType: 'radiant', range: 90, rate: 0.9, damage: 1.8, farm: 1.3, crowd: 2, describe: 'Holds the line with lance thrusts that pierce everything in reach.' },
  },
  {
    id: 'prospector', name: 'Gus', title: 'Prospector', icon: '💰', color: '#ffd34d', area: 'graveyard', recruitCost: 80_000, gold: 1.75,
    unlock: { event: 'guardian-graveyard', times: 3 },
    ability: 'Blasts five pellets at close range. Earns +75% gold from his kills.',
    style: { kind: 'shotgun', damageType: 'physical', range: 150, rate: 0.7, damage: 0.45, pellets: 5, farm: 1.2, crowd: 1, describe: 'A trusty shotgun: five pellets per blast at close range.' },
  },
  {
    id: 'demonbane', name: 'Sera', title: 'Demonbane', icon: '🗡️', color: '#ff7a3d', area: 'caves', recruitCost: 1_500_000, bane: { archetype: 'demon', mult: 3 },
    unlock: { event: 'guardian-caves', times: 1 },
    ability: 'A rapid flurry of daggers at short range. Deals triple damage to Demons.',
    style: { kind: 'daggers', damageType: 'arcane', range: 160, rate: 3, damage: 0.4, farm: 1.1, crowd: 1, describe: 'Throws a flurry of daggers at anything that gets close.' },
  },
  {
    id: 'wilhelm', name: 'Wilhelm', title: 'Sniper', icon: '🎯', color: '#9aa7b8', area: 'caves', recruitCost: 3_000_000,
    unlock: { event: 'guardian-caves', times: 2 },
    ability: 'Snipes from across the field, akimbo pistols up close. Can equip a long-range weapon and a short-range weapon.',
    slots: [
      { kind: 'weapon', label: 'Long-range', role: 'long' },
      { kind: 'weapon', label: 'Short-range', role: 'short' },
      { kind: 'armor', label: 'Armor' },
    ],
    style: { kind: 'sniper', damageType: 'physical', range: 520, rate: 0.4, damage: 3.5, pierce: 2, closeRange: 90, farm: 1.5, crowd: 2, describe: 'Picks enemies off from across the field with piercing shots; switches to akimbo pistols when they get close.' },
  },
  {
    id: 'scavenger', name: 'Pip', title: 'Scavenger', icon: '🎒', color: '#3fb0a0', area: 'caves', recruitCost: 6_000_000, drops: 2,
    unlock: { event: 'guardian-caves', times: 3 },
    ability: 'Stones ricochet between enemies. Doubles material drops from his kills.',
    style: { kind: 'ricochet', damageType: 'acid', range: 220, rate: 1, damage: 0.8, bounces: 3, farm: 1.4, crowd: 2.5, describe: 'Acid-slicked slingshot stones ricochet between up to 4 enemies.' },
  },
  {
    id: 'frostbreaker', name: 'Bjorn', title: 'Frostbreaker', icon: '🔨', color: '#8fdcff', area: 'peaks', recruitCost: 150_000_000, bane: { archetype: 'elemental', mult: 3 },
    unlock: { event: 'guardian-peaks', times: 1 },
    ability: 'Frost hammers slow enemies to a crawl. Deals triple damage to Elementals.',
    style: { kind: 'hammer', damageType: 'frost', range: 200, rate: 0.7, damage: 1.6, slow: 2, farm: 1.3, crowd: 1, describe: 'Throws frost hammers that slow enemies to a crawl.' },
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
/** Cost of a Guild Hunter's first training session (then × HELPER_TRAIN_GROWTH each). */
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
  /** Kinds the slot takes, when more than its own `kind` (Mira's weapon slot takes ranged or magic). */
  accepts?: GearKind[];
}

/** Can a piece of this kind go in this slot? */
export const slotAccepts = (slot: SlotDef, kind: GearKind): boolean => (slot.accepts ?? [slot.kind]).includes(kind);

/** Weapon kinds: a Hunter's weapon slot powers their special attack. */
export const WEAPON_KINDS: GearKind[] = ['weapon', 'melee', 'magic'];

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
  | 'huntingBow'
  | 'boneCrossbow'
  | 'emberLongbow'
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
  /** Stats at level 1; each level adds the same again. */
  stats: Partial<Record<GearStat, number>>;
  /** Materials to craft (level 1); upgrades cost this × GEAR_COST_GROWTH^level. */
  recipe: Partial<Record<MaterialId, number>>;
}

export const GEAR_MAX_LEVEL = 10;
export const GEAR_COST_GROWTH = 1.8;
/** Salvaging returns this share of the materials spent on a piece. */
export const SALVAGE_REFUND = 0.5;
/** Stun reductions from gear stack additively up to this cap. */
export const GEAR_STUN_CAP = 0.7;

export const GEAR: GearDef[] = [
  // Weapons
  { id: 'huntingBow', name: 'Hunting Bow', icon: '🏹', kind: 'weapon', rarity: 'common', damageType: 'physical', stats: { damage: 0.2 }, recipe: { goo: 8, pelt: 4 } },
  { id: 'boneCrossbow', name: 'Bone Crossbow', icon: '🎯', kind: 'weapon', rarity: 'uncommon', damageType: 'physical', stats: { damage: 0.3, range: 8 }, recipe: { bone: 10, wing: 5 } },
  { id: 'emberLongbow', name: 'Ember Longbow', icon: '🔥', kind: 'weapon', rarity: 'rare', damageType: 'fire', stats: { damage: 0.3, rate: 0.12 }, recipe: { ember: 10, chitin: 5 } },
  { id: 'frostRifle', name: 'Frost Rifle', icon: '🔫', kind: 'weapon', rarity: 'legendary', damageType: 'frost', stats: { damage: 0.45, range: 15 }, recipe: { fur: 10, frost: 5 } },
  { id: 'voidRepeater', name: 'Void Repeater', icon: '🌀', kind: 'weapon', rarity: 'artifact', damageType: 'void', stats: { damage: 0.6, rate: 0.2 }, recipe: { shade: 10, void: 5 } },
  // Melee
  { id: 'ironSpear', name: 'Bone Spear', icon: '🔱', kind: 'melee', rarity: 'uncommon', damageType: 'physical', stats: { damage: 0.35 }, recipe: { bone: 10, flesh: 5 } },
  { id: 'magmaGlaive', name: 'Magma Glaive', icon: '🪓', kind: 'melee', rarity: 'veryRare', damageType: 'fire', stats: { damage: 0.5, range: 6 }, recipe: { magma: 10, ember: 5 } },
  { id: 'soulLance', name: 'Soulreaver Lance', icon: '⚜️', kind: 'melee', rarity: 'exalted', damageType: 'decay', stats: { damage: 0.8, pierce: 0.2 }, recipe: { soul: 8, void: 4 } },
  // Magic (Mira and Glimmer)
  { id: 'apprenticeWand', name: 'Apprentice Wand', icon: '🪄', kind: 'magic', rarity: 'common', damageType: 'arcane', stats: { damage: 0.15, rate: 0.1 }, recipe: { goo: 8, redgel: 4 } },
  { id: 'gravewoodStaff', name: 'Gravewood Staff', icon: '🪵', kind: 'magic', rarity: 'uncommon', damageType: 'decay', stats: { damage: 0.25, rate: 0.1 }, recipe: { flesh: 10, wing: 5 } },
  { id: 'emberFocus', name: 'Ember Focus', icon: '🕯️', kind: 'magic', rarity: 'rare', damageType: 'fire', stats: { damage: 0.3, rate: 0.15 }, recipe: { ember: 10, magma: 5 } },
  { id: 'crystalFocus', name: 'Crystal Focus', icon: '💎', kind: 'magic', rarity: 'legendary', damageType: 'frost', stats: { damage: 0.4, rate: 0.2 }, recipe: { frost: 8, ecto: 6 } },
  { id: 'voidScepter', name: 'Void Scepter', icon: '🪬', kind: 'magic', rarity: 'relic', damageType: 'void', stats: { damage: 0.55, rate: 0.25 }, recipe: { shade: 10, void: 5 } },
  { id: 'soulfireStaff', name: 'Soulfire Staff', icon: '🌟', kind: 'magic', rarity: 'exalted', damageType: 'radiant', stats: { damage: 0.75, rate: 0.3 }, recipe: { soul: 8, void: 4 } },
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

/** A piece's stats at a level. */
export function gearStats(def: GearDef, level: number): Partial<Record<GearStat, number>> {
  const out: Partial<Record<GearStat, number>> = {};
  for (const [k, v] of Object.entries(def.stats) as [GearStat, number][]) out[k] = v * level;
  return out;
}

export function describeGear(stats: Partial<Record<GearStat, number>>): string {
  return (Object.entries(stats) as [GearStat, number][])
    .filter(([k, v]) => (k === 'guard' || k === 'pierce' ? Math.floor(v) >= 1 : v > 0))
    .map(([k, v]) => GEAR_STATS[k](v))
    .join(', ');
}

/** Materials to go from `level` to `level + 1` (level 0 = crafting it). */
export function gearCost(def: GearDef, level: number): Partial<Record<MaterialId, number>> {
  const cost: Partial<Record<MaterialId, number>> = {};
  for (const [m, n] of Object.entries(def.recipe) as [MaterialId, number][]) cost[m] = Math.ceil(n * GEAR_COST_GROWTH ** level);
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
  | 'engine';

export interface ItemDef {
  id: ItemId;
  name: string;
  icon: string;
  maxLevel: number;
  recipe: Partial<Record<MaterialId, number>>;
  /** Material cost multiplier per level already owned. */
  growth: number;
  describe: (level: number) => string;
}

export const ITEMS: ItemDef[] = [
  { id: 'whetstone', name: 'Whetstone', icon: '🪨', maxLevel: 50, recipe: { goo: 4 }, growth: 1.45, describe: (l) => `+${l * 25}% damage` },
  { id: 'gloves', name: 'Quickdraw Gloves', icon: '🧤', maxLevel: 30, recipe: { goo: 6, pelt: 2 }, growth: 1.5, describe: (l) => `+${l * 10}% attack rate` },
  { id: 'lure', name: 'Monster Lure', icon: '🍖', maxLevel: 20, recipe: { redgel: 5, pelt: 3 }, growth: 1.6, describe: (l) => `+${l * 20}% enemy spawns` },
  { id: 'pouch', name: "Scavenger's Pouch", icon: '👝', maxLevel: 25, recipe: { pelt: 6, redgel: 3 }, growth: 1.5, describe: (l) => `+${l * 25}% material drops` },
  { id: 'bonemail', name: 'Bone Mail', icon: '🦴', maxLevel: 10, recipe: { bone: 8, flesh: 4 }, growth: 1.6, describe: (l) => `−${Math.round((1 - 0.88 ** l) * 100)}% stun time` },
  { id: 'splitbow', name: 'Split Bow', icon: '🔱', maxLevel: 4, recipe: { bone: 10, wing: 6 }, growth: 3, describe: (l) => `+${l} projectile${l === 1 ? '' : 's'} per volley` },
  { id: 'idol', name: 'Golden Idol', icon: '🗿', maxLevel: 30, recipe: { ember: 6, magma: 3 }, growth: 1.5, describe: (l) => `+${l * 25}% gold` },
  { id: 'lance', name: 'Frost Lance', icon: '❄️', maxLevel: 5, recipe: { chitin: 8, frost: 4 }, growth: 2.2, describe: (l) => `shots pierce ${l} more enem${l === 1 ? 'y' : 'ies'}` },
  { id: 'lantern', name: 'Soul Lantern', icon: '🏮', maxLevel: 10, recipe: { ecto: 8, fur: 6 }, growth: 1.8, describe: (l) => `+${l * 4}% crit chance` },
  { id: 'engine', name: 'Void Engine', icon: '🌀', maxLevel: 20, recipe: { shade: 10, void: 5, soul: 3 }, growth: 1.7, describe: (l) => `×${(1.5 ** l).toFixed(l > 3 ? 0 : 1)} damage, +${l * 5}% attack rate` },
];

export const itemDef = (id: ItemId): ItemDef => ITEMS.find((i) => i.id === id)!;

export function itemCost(item: ItemDef, level: number): Partial<Record<MaterialId, number>> {
  const cost: Partial<Record<MaterialId, number>> = {};
  for (const [mat, base] of Object.entries(item.recipe) as [MaterialId, number][]) {
    cost[mat] = Math.ceil(base * item.growth ** level);
  }
  return cost;
}

export const EVENTS: EventDef[] = [
  ...AREAS.filter((a) => Number.isFinite(a.mastery)).map(
    (a): EventDef => ({
      id: `guardian-${a.id}`,
      area: a.id,
      kind: 'guardian',
      name: 'Guardian Challenge',
      icon: '⚔️',
      blurb: `Bring down the ${a.name} Guardian within ${GUARDIAN_TIME}s.`,
      unlockKills: a.mastery,
      cooldown: GUARDIAN_COOLDOWN,
      duration: GUARDIAN_TIME,
    }),
  ),
  {
    id: 'slimeSwarm',
    area: 'forest',
    kind: 'swarm',
    name: 'Slime Swarm',
    icon: '🟢',
    blurb: 'Slimes flood the forest for 60s: twice as many, twice as fast.',
    unlockKills: 2500,
    cooldown: 15 * 60,
    duration: 60,
    archetype: 'slime',
    spawnMult: 2,
    speedMult: 2,
  },
];

export const eventDef = (id: string): EventDef => EVENTS.find((e) => e.id === id)!;
