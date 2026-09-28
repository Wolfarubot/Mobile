// All tunable numbers, content tables and pure formulas live here so balancing never touches game flow code.
import { fmt } from './format';

// ---- Stages ----
export const KILLS_PER_STAGE = 40;
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

/** The horde thickens over the first 10 stages so new players aren't swarmed immediately. */
export function spawnRamp(stage: number): number {
  return Math.min(1, 0.5 + 0.05 * (Math.max(1, stage) - 1));
}

/** Walking speed in px/s. Slowly rises so later zones feel more frantic. */
export function enemySpeed(stage: number): number {
  return 34 + Math.min(40, stage * 0.4);
}

// ---- Player & combat ----
export const BASE_FIRE_RATE = 1.6; // volleys per second
export const BASE_SPAWN_RATE = 2.2; // enemies per second once the ramp is done
export const MAX_ENEMIES = 160;
export const BULLET_SPEED = 520;
export const MULTISHOT_SPREAD = 0.2; // radians between projectiles in a volley
export const BASE_CRIT_CHANCE = 0.05;
export const CRIT_MULT = 3;
export const TAP_DAMAGE_MULT = 2; // a tap blast deals this many shots of damage
export const TAP_RADIUS = 48;
/** Contact damage as a fraction of the player's max HP per second, per enemy touching. */
export const CONTACT_DAMAGE = 0.1;
export const BOSS_CONTACT_DAMAGE = 0.35;
export const PLAYER_REGEN = 0.04; // fraction of max HP per second
export const BASE_DROP_CHANCE = 0.07; // chance a regular enemy drops its zone's material
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
export type UpgradeId = 'power' | 'haste' | 'vitality';

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
  { id: 'vitality', name: 'Vitality', icon: '❤️', baseCost: 50, growth: 1.5, maxLevel: 30, describe: (l) => `+${l * 10}% regen · −${Math.round((1 - vitalityMult(l)) * 100)}% dmg taken` },
];

/** Damage per shot from the Power upgrade: linear with a compounding kicker and x3 every 25 levels. */
export function powerDamage(level: number): number {
  return (1 + level) * 2 ** Math.floor(level / 25);
}

export const hasteMult = (level: number): number => 1 + 0.05 * level;
export const vitalityMult = (level: number): number => 0.97 ** level;

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

// ---- Materials: each zone's enemies drop their own ----
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

// ---- Zones: a new look and material every 10 stages ----
export type EnemyShape = 'circle' | 'square' | 'triangle' | 'diamond' | 'ghost' | 'hexagon';

export interface Zone {
  name: string;
  ground: string;
  speck: string;
  enemy: string;
  shape: EnemyShape;
  material: MaterialId;
}

export const ZONES: Zone[] = [
  { name: 'Mossy Glade', ground: '#2f4a2c', speck: '#3b5c37', enemy: '#7be07b', shape: 'circle', material: 'goo' },
  { name: 'Bone Caverns', ground: '#2b2630', speck: '#383140', enemy: '#e8dcc0', shape: 'square', material: 'bone' },
  { name: 'Ember Wastes', ground: '#3a1c14', speck: '#4d271b', enemy: '#ff7a3d', shape: 'triangle', material: 'ember' },
  { name: 'Frost Peaks', ground: '#23344a', speck: '#2e4561', enemy: '#8fdcff', shape: 'diamond', material: 'frost' },
  { name: 'Haunted Mire', ground: '#1f2b25', speck: '#29392f', enemy: '#c49bff', shape: 'ghost', material: 'ecto' },
  { name: 'Shadow Realm', ground: '#160e22', speck: '#21152f', enemy: '#ff5fd7', shape: 'hexagon', material: 'void' },
];

export const zoneIndex = (stage: number): number => Math.floor((Math.max(1, stage) - 1) / 10) % ZONES.length;
export const zoneFor = (stage: number): Zone => ZONES[zoneIndex(stage)];

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
  { id: 'bonemail', name: 'Bone Mail', icon: '🦴', maxLevel: 10, recipe: { bone: 10 }, growth: 1.6, describe: (l) => `−${Math.round((1 - 0.88 ** l) * 100)}% contact damage` },
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
