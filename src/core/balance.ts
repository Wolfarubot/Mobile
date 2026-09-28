// All tunable numbers, content tables and pure formulas live here so balancing never touches game flow code.
import { fmt } from './format';

// ---- Stages ----
export const KILLS_PER_STAGE = 40;
/** If this many enemies escape on a stage before it's cleared, the Hunter falls back a stage. */
export const ESCAPES_TO_RETREAT = 40;
export const BOSS_EVERY = 5;
export const BOSS_TIME = 30; // seconds to beat a boss
export const BOSS_HP_MULT = 12;
export const BOSS_REWARD_MULT = 10;

export const isBossStage = (stage: number): boolean => stage % BOSS_EVERY === 0;

/** HP of a regular enemy on a stage (bosses multiply this by BOSS_HP_MULT). */
export function enemyHp(stage: number): number {
  const s = Math.max(1, stage);
  const early = 2 * 1.4 ** (Math.min(s, 150) - 1) + (s - 1);
  const late = s > 150 ? 1.15 ** (s - 150) : 1;
  return Math.ceil(early * late);
}

export function enemyGold(stage: number): number {
  return Math.max(1, Math.ceil(enemyHp(stage) / 6));
}

/** The horde thickens over the first 10 stages so new players aren't swamped immediately. */
export function spawnRamp(stage: number): number {
  return Math.min(1, 0.8 + 0.04 * (Math.max(1, stage) - 1));
}

/** Walking speed in px/s. Slowly rises so later zones feel more frantic. */
export function enemySpeed(stage: number): number {
  return 34 + Math.min(40, stage * 0.4);
}

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
/** After a stun wears off the Hunter can't be re-stunned for this long, so they always get some shots off. */
export const STUN_IMMUNITY = 0.8;
/** Fleeing enemies run this much faster than they approached. */
export const FLEE_SPEED_MULT = 1.4;
export const BASE_DROP_CHANCE = 0.07; // chance an enemy drops its material
export const BOSS_MATERIAL_DROP = 5;

// ---- Offline ----
export const OFFLINE_CAP_SEC = 8 * 3600;
/** Fraction of the online kill rate earned while away. */
export const OFFLINE_EFFICIENCY = 0.5;
export const OFFLINE_MIN_SEC = 30; // shorter absences are not worth a popup

// ---- Arena ----
export const MAX_TICKETS = 3;
export const TICKET_REGEN_SEC = 15 * 60;
export const FRENZY_MULT = 2;
export const FRENZY_CAP_SEC = 300;
/** Minigame reward: each "reward unit" is worth this many kills of gold at the current stage. */
export const MINIGAME_GOLD_PER_UNIT = 2;

// ---- Ascension ----
export const PRESTIGE_MIN_STAGE = 50;
export const SHARD_BONUS = 0.1; // +10% damage per shard

export function shardMultiplier(shards: number): number {
  return 1 + SHARD_BONUS * shards;
}

/** Soul shards granted for ascending after reaching `maxStage`. */
export function shardsForStage(maxStage: number): number {
  if (maxStage < PRESTIGE_MIN_STAGE) return 0;
  return Math.floor(((maxStage - 30) / 5) ** 1.5);
}

// ---- Gold upgrades (reset on Ascension) ----
export type UpgradeId = 'power' | 'haste' | 'nerves';

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  icon: string;
  baseCost: number;
  growth: number;
  maxLevel?: number;
  describe: (level: number) => string;
}

export const UPGRADES: UpgradeDef[] = [
  { id: 'power', name: 'Power', icon: '💪', baseCost: 8, growth: 1.075, describe: (l) => `${fmt(powerDamage(l))} damage per shot` },
  { id: 'haste', name: 'Rapid Fire', icon: '🏹', baseCost: 30, growth: 1.35, maxLevel: 60, describe: (l) => `+${Math.round(l * 5)}% attack rate` },
  { id: 'nerves', name: 'Steady Nerves', icon: '🧘', baseCost: 50, growth: 1.5, maxLevel: 30, describe: (l) => `−${Math.round((1 - nervesMult(l)) * 100)}% stun time` },
];

/** Damage per shot from the Power upgrade: linear with a compounding kicker and x3 every 25 levels. */
export function powerDamage(level: number): number {
  return (1 + level) * 2 ** Math.floor(level / 25);
}

export const hasteMult = (level: number): number => 1 + 0.05 * level;
/** Stun duration multiplier from Steady Nerves. */
export const nervesMult = (level: number): number => 0.96 ** level;

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
export type MaterialId = 'goo' | 'bone' | 'ember' | 'frost' | 'ecto' | 'void';

export interface MaterialDef {
  id: MaterialId;
  name: string;
  color: string;
}

export const MATERIALS: MaterialDef[] = [
  { id: 'goo', name: 'Slime Goo', color: '#7be07b' },
  { id: 'bone', name: 'Bone', color: '#efe6cf' },
  { id: 'ember', name: 'Ember', color: '#ff8a3d' },
  { id: 'frost', name: 'Frost Shard', color: '#8fdcff' },
  { id: 'ecto', name: 'Ectoplasm', color: '#c49bff' },
  { id: 'void', name: 'Void Dust', color: '#ff5fd7' },
];

export const materialDef = (id: MaterialId): MaterialDef => MATERIALS.find((m) => m.id === id)!;

// ---- Zones: purely visual, a new backdrop every 10 stages ----
export interface Zone {
  name: string;
  ground: string;
  speck: string;
}

export const ZONES: Zone[] = [
  { name: 'Mossy Glade', ground: '#2f4a2c', speck: '#3b5c37' },
  { name: 'Bone Caverns', ground: '#2b2630', speck: '#383140' },
  { name: 'Ember Wastes', ground: '#3a1c14', speck: '#4d271b' },
  { name: 'Frost Peaks', ground: '#23344a', speck: '#2e4561' },
  { name: 'Haunted Mire', ground: '#1f2b25', speck: '#29392f' },
  { name: 'Shadow Realm', ground: '#160e22', speck: '#21152f' },
];

export const zoneIndex = (stage: number): number => Math.floor((Math.max(1, stage) - 1) / 10) % ZONES.length;
export const zoneFor = (stage: number): Zone => ZONES[zoneIndex(stage)];

// ---- Enemy roster: each type has its own stats and drops its own material ----
export type EnemyId = 'slime' | 'skeleton' | 'imp' | 'golem' | 'wraith' | 'horror';
export type EnemyShape = 'circle' | 'square' | 'triangle' | 'diamond' | 'ghost' | 'hexagon';

export interface EnemyDef {
  id: EnemyId;
  name: string;
  /** Multipliers on the stage's base HP / walk speed / gold. */
  hp: number;
  speed: number;
  gold: number;
  /** Enemies per second once unlocked (before Swarm, Lure and the early ramp). */
  spawn: number;
  /** Pack size range [min, max]. */
  pack: [number, number];
  radius: number;
  material: MaterialId;
  /** Gold to unlock (0 = available from the start). Cost of the first Swarm/Bounty level scales from this. */
  unlockCost: number;
  /** Placeholder look until real art is added (see src/assets/sprites/README.md). */
  color: string;
  shape: EnemyShape;
  blurb: string;
}

export const ENEMIES: EnemyDef[] = [
  { id: 'slime', name: 'Slime', hp: 1, speed: 1, gold: 1, spawn: 1.4, pack: [3, 5], radius: 10, material: 'goo', unlockCost: 0, color: '#7be07b', shape: 'circle', blurb: 'Squishy and plentiful.' },
  { id: 'skeleton', name: 'Skeleton', hp: 2.5, speed: 0.8, gold: 2.8, spawn: 0.5, pack: [2, 4], radius: 11, material: 'bone', unlockCost: 300, color: '#e8dcc0', shape: 'square', blurb: 'Slow, sturdy, rattles a lot.' },
  { id: 'imp', name: 'Imp', hp: 0.7, speed: 1.8, gold: 2, spawn: 0.6, pack: [2, 3], radius: 8, material: 'ember', unlockCost: 20_000, color: '#ff7a3d', shape: 'triangle', blurb: 'Tiny and fast. Shoot first.' },
  { id: 'golem', name: 'Frost Golem', hp: 8, speed: 0.5, gold: 9, spawn: 0.18, pack: [1, 2], radius: 16, material: 'frost', unlockCost: 1_000_000, color: '#8fdcff', shape: 'diamond', blurb: 'A walking wall of ice.' },
  { id: 'wraith', name: 'Wraith', hp: 1.8, speed: 1.4, gold: 4.5, spawn: 0.4, pack: [2, 4], radius: 11, material: 'ecto', unlockCost: 50_000_000, color: '#c49bff', shape: 'ghost', blurb: 'Drifts in quickly from the dark.' },
  { id: 'horror', name: 'Void Horror', hp: 12, speed: 0.9, gold: 16, spawn: 0.15, pack: [1, 2], radius: 15, material: 'void', unlockCost: 3_000_000_000, color: '#ff5fd7', shape: 'hexagon', blurb: 'Rare, huge, and very rewarding.' },
];

export const enemyDef = (id: EnemyId): EnemyDef => ENEMIES.find((e) => e.id === id)!;

// Per-enemy upgrades (gold, reset on Ascension)
export type EnemyUpgrade = 'swarm' | 'bounty';
export const ENEMY_UPGRADE_MAX = 15;
export const SWARM_PER_LEVEL = 0.4; // +40% of that enemy spawning
export const BOUNTY_GOLD_PER_LEVEL = 0.5; // +50% gold from that enemy
export const BOUNTY_DROP_PER_LEVEL = 0.15; // +15% material drops from that enemy
export const BOUNTY_SPEED_PER_LEVEL = 0.12; // ...but it moves 12% faster

export function enemyUpgradeCost(def: EnemyDef, kind: EnemyUpgrade, level: number): number {
  const base = Math.max(40, def.unlockCost * 0.4) * (kind === 'bounty' ? 1.5 : 1);
  return Math.ceil(base * 2.4 ** level);
}

// ---- Forge items: crafted from materials, permanent (survive Ascension) ----
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
  { id: 'gloves', name: 'Quickdraw Gloves', icon: '🧤', maxLevel: 30, recipe: { goo: 6, bone: 2 }, growth: 1.5, describe: (l) => `+${l * 10}% attack rate` },
  { id: 'lure', name: 'Monster Lure', icon: '🍖', maxLevel: 20, recipe: { goo: 8 }, growth: 1.6, describe: (l) => `+${l * 20}% enemy spawns` },
  { id: 'pouch', name: "Scavenger's Pouch", icon: '👝', maxLevel: 25, recipe: { goo: 10, bone: 3 }, growth: 1.5, describe: (l) => `+${l * 25}% material drops` },
  { id: 'splitbow', name: 'Split Bow', icon: '🔱', maxLevel: 4, recipe: { bone: 8, ember: 4 }, growth: 3, describe: (l) => `+${l} projectile${l === 1 ? '' : 's'} per volley` },
  { id: 'bonemail', name: 'Bone Mail', icon: '🦴', maxLevel: 10, recipe: { bone: 10 }, growth: 1.6, describe: (l) => `−${Math.round((1 - 0.88 ** l) * 100)}% stun time` },
  { id: 'idol', name: 'Golden Idol', icon: '🗿', maxLevel: 30, recipe: { goo: 12, ember: 5 }, growth: 1.5, describe: (l) => `+${l * 25}% gold` },
  { id: 'lance', name: 'Frost Lance', icon: '❄️', maxLevel: 5, recipe: { frost: 8, bone: 12 }, growth: 2.2, describe: (l) => `shots pierce ${l} more enem${l === 1 ? 'y' : 'ies'}` },
  { id: 'lantern', name: 'Soul Lantern', icon: '🏮', maxLevel: 10, recipe: { ecto: 8, frost: 4 }, growth: 1.8, describe: (l) => `+${l * 4}% crit chance` },
  { id: 'engine', name: 'Void Engine', icon: '🌀', maxLevel: 20, recipe: { void: 10, ecto: 10 }, growth: 1.7, describe: (l) => `×${(1.5 ** l).toFixed(l > 3 ? 0 : 1)} damage, +${l * 5}% attack rate` },
];

export const itemDef = (id: ItemId): ItemDef => ITEMS.find((i) => i.id === id)!;

export function itemCost(item: ItemDef, level: number): Partial<Record<MaterialId, number>> {
  const cost: Partial<Record<MaterialId, number>> = {};
  for (const [mat, base] of Object.entries(item.recipe) as [MaterialId, number][]) {
    cost[mat] = Math.ceil(base * item.growth ** level);
  }
  return cost;
}

// ---- Bullet hell minigame upgrades: bought with Stars earned in runs, permanent ----
export type BhUpgradeId = 'treasure' | 'shield' | 'cannons' | 'magnet' | 'endurance' | 'richskies';

export interface BhUpgradeDef {
  id: BhUpgradeId;
  name: string;
  icon: string;
  maxLevel: number;
  baseCost: number;
  growth: number;
  describe: (level: number) => string;
}

export const BH_UPGRADES: BhUpgradeDef[] = [
  { id: 'treasure', name: 'Treasure Hunter', icon: '💎', maxLevel: 20, baseCost: 3, growth: 1.5, describe: (l) => `+${l * 25}% materials from runs` },
  { id: 'richskies', name: 'Rich Skies', icon: '🌠', maxLevel: 10, baseCost: 4, growth: 1.6, describe: (l) => `+${l * 10}% enemy drop chance` },
  { id: 'cannons', name: 'Twin Cannons', icon: '🔫', maxLevel: 4, baseCost: 6, growth: 2.5, describe: (l) => `${l + 1} bullet streams` },
  { id: 'shield', name: 'Shield', icon: '🛡️', maxLevel: 3, baseCost: 8, growth: 2.5, describe: (l) => `${l + 1} hit${l ? 's' : ''} before you fall` },
  { id: 'magnet', name: 'Magnet', icon: '🧲', maxLevel: 8, baseCost: 3, growth: 1.6, describe: (l) => `+${l * 40}% pickup radius` },
  { id: 'endurance', name: 'Endurance', icon: '⏳', maxLevel: 4, baseCost: 5, growth: 2, describe: (l) => `${60 + l * 10}s runs` },
];

/** Each gem in Sky Siege is worth this many materials, so runs stay relevant as idle income grows. */
export function gemValue(maxStage: number): number {
  return 1 + Math.floor(maxStage / 4);
}

export const bhUpgradeCost = (u: BhUpgradeDef, level: number): number => Math.ceil(u.baseCost * u.growth ** level);
