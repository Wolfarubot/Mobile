// All tunable numbers, content tables and pure formulas live here so balancing never touches game flow code.
import { fmt } from './format';

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
export const BOSS_MATERIAL_DROP = 10;
/** Seconds to defeat an area's Guardian once challenged. */
export const GUARDIAN_TIME = 45;
/** Gold for slaying a Guardian, in kills' worth of the area's basic enemy. */
export const GUARDIAN_GOLD_MULT = 50;

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
/** Minigame reward: each "reward unit" is worth this many kills of gold in the current area. */
export const MINIGAME_GOLD_PER_UNIT = 2;

// ---- Main Hunter training (gold) ----
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

/** Damage per shot from a Power (or Hunter) level: linear, doubling every 25 levels. */
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
  ground: string;
  speck: string;
  blurb: string;
}

export const AREAS: AreaDef[] = [
  { id: 'forest', name: 'Whispering Forest', hp: 3, gold: 1, speed: 36, mastery: 600, guardian: 25_000, ground: '#2f4a2c', speck: '#3b5c37', blurb: 'Where every hunt begins.' },
  { id: 'graveyard', name: 'Old Graveyard', hp: 150, gold: 25, speed: 40, mastery: 1_500, guardian: 25_000_000, ground: '#2b2630', speck: '#383140', blurb: 'The dead do not rest here.' },
  { id: 'caves', name: 'Ember Caves', hp: 150_000, gold: 600, speed: 45, mastery: 4_000, guardian: 1_000_000_000, ground: '#3a1c14', speck: '#4d271b', blurb: 'Hot, bright and full of teeth.' },
  { id: 'peaks', name: 'Frost Peaks', hp: 7_000_000, gold: 15_000, speed: 50, mastery: 10_000, guardian: 3.5e10, ground: '#23344a', speck: '#2e4561', blurb: 'Cold winds carry cold things.' },
  { id: 'rift', name: 'Void Rift', hp: 250_000_000, gold: 350_000, speed: 56, mastery: Infinity, guardian: Infinity, ground: '#160e22', speck: '#21152f', blurb: 'The end of the known world.' },
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
}

export const ENEMIES: EnemyDef[] = [
  // Whispering Forest
  { id: 'greenSlime', name: 'Green Slime', area: 'forest', archetype: 'slime', hp: 1, speed: 1, gold: 1, spawn: 1.6, pack: [3, 5], radius: 10, material: 'goo', unlock: 0, color: '#7be07b', shape: 'circle', blurb: 'Squishy and plentiful.' },
  { id: 'wolf', name: 'Forest Wolf', area: 'forest', archetype: 'beast', hp: 1.3, speed: 1.5, gold: 1.6, spawn: 0.6, pack: [2, 3], radius: 10, material: 'pelt', unlock: 120, color: '#b08a5a', shape: 'triangle', blurb: 'Fast, hunts in pairs.' },
  { id: 'redSlime', name: 'Red Slime', area: 'forest', archetype: 'slime', hp: 2, speed: 0.9, gold: 2.5, spawn: 0.5, pack: [2, 4], radius: 11, material: 'redgel', unlock: 900, color: '#ff6b6b', shape: 'circle', blurb: 'A tougher, angrier slime.' },
  // Old Graveyard
  { id: 'skeleton', name: 'Skeleton', area: 'graveyard', archetype: 'undead', hp: 1, speed: 0.9, gold: 1, spawn: 1.5, pack: [3, 5], radius: 11, material: 'bone', unlock: 0, color: '#e8dcc0', shape: 'square', blurb: 'Rattles in by the dozen.' },
  { id: 'zombie', name: 'Zombie', area: 'graveyard', archetype: 'undead', hp: 2.2, speed: 0.6, gold: 2.4, spawn: 0.6, pack: [2, 4], radius: 12, material: 'flesh', unlock: 120, color: '#8fae6b', shape: 'square', blurb: 'Slow, sturdy, relentless.' },
  { id: 'bat', name: 'Grave Bat', area: 'graveyard', archetype: 'beast', hp: 0.6, speed: 1.9, gold: 1.3, spawn: 0.8, pack: [3, 5], radius: 8, material: 'wing', unlock: 900, color: '#8a78b0', shape: 'triangle', blurb: 'Tiny, fast and everywhere.' },
  // Ember Caves
  { id: 'imp', name: 'Imp', area: 'caves', archetype: 'demon', hp: 1, speed: 1.3, gold: 1, spawn: 1.4, pack: [2, 4], radius: 9, material: 'ember', unlock: 0, color: '#ff7a3d', shape: 'hexagon', blurb: 'Cackling little fire-starters.' },
  { id: 'magmaSlime', name: 'Magma Slime', area: 'caves', archetype: 'slime', hp: 2.5, speed: 0.8, gold: 2.5, spawn: 0.6, pack: [2, 3], radius: 12, material: 'magma', unlock: 120, color: '#ff4d1a', shape: 'circle', blurb: 'Molten and very hard to squish.' },
  { id: 'beetle', name: 'Fire Beetle', area: 'caves', archetype: 'beast', hp: 1.8, speed: 1.1, gold: 1.8, spawn: 0.7, pack: [2, 4], radius: 11, material: 'chitin', unlock: 900, color: '#3fb0a0', shape: 'triangle', blurb: 'Armored and quick to scuttle.' },
  // Frost Peaks
  { id: 'iceWolf', name: 'Ice Wolf', area: 'peaks', archetype: 'beast', hp: 1, speed: 1.4, gold: 1, spawn: 1.4, pack: [2, 4], radius: 10, material: 'fur', unlock: 0, color: '#dfefff', shape: 'triangle', blurb: 'The pack howls on the wind.' },
  { id: 'golem', name: 'Frost Golem', area: 'peaks', archetype: 'elemental', hp: 4, speed: 0.5, gold: 4.5, spawn: 0.3, pack: [1, 2], radius: 16, material: 'frost', unlock: 120, color: '#8fdcff', shape: 'diamond', blurb: 'A walking wall of ice.' },
  { id: 'wraith', name: 'Snow Wraith', area: 'peaks', archetype: 'undead', hp: 1.4, speed: 1.3, gold: 1.8, spawn: 0.6, pack: [2, 4], radius: 11, material: 'ecto', unlock: 900, color: '#c49bff', shape: 'ghost', blurb: 'Drifts in quickly from the storm.' },
  // Void Rift
  { id: 'shadowSlime', name: 'Shadow Slime', area: 'rift', archetype: 'slime', hp: 1, speed: 1, gold: 1, spawn: 1.5, pack: [3, 5], radius: 11, material: 'shade', unlock: 0, color: '#7a5cc0', shape: 'circle', blurb: 'A slime made of the dark itself.' },
  { id: 'horror', name: 'Void Horror', area: 'rift', archetype: 'demon', hp: 5, speed: 0.8, gold: 6, spawn: 0.25, pack: [1, 2], radius: 15, material: 'void', unlock: 120, color: '#ff5fd7', shape: 'hexagon', blurb: 'Rare, huge, and very rewarding.' },
  { id: 'lich', name: 'Lich', area: 'rift', archetype: 'undead', hp: 2.5, speed: 1, gold: 3.5, spawn: 0.4, pack: [1, 3], radius: 12, material: 'soul', unlock: 900, color: '#6ff0e0', shape: 'ghost', blurb: 'An undead king hoarding souls.' },
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
export type HunterId = 'alchemist' | 'ranger' | 'gravewarden' | 'prospector' | 'demonbane' | 'scavenger' | 'frostbreaker';

export interface HunterDef {
  id: HunterId;
  name: string;
  title: string;
  icon: string;
  color: string;
  /** Area that must be unlocked before they can be recruited. */
  area: AreaId;
  recruitCost: number;
  /** Damage multiplier against one archetype. */
  bane?: { archetype: Archetype; mult: number };
  /** Multipliers on gold / material drops from their kills. */
  gold?: number;
  drops?: number;
}

export const HUNTERS: HunterDef[] = [
  { id: 'alchemist', name: 'Mira', title: 'Alchemist', icon: '⚗️', color: '#7be07b', area: 'forest', recruitCost: 150, bane: { archetype: 'slime', mult: 3 } },
  { id: 'ranger', name: 'Rin', title: 'Ranger', icon: '🏹', color: '#c09060', area: 'forest', recruitCost: 1_200, bane: { archetype: 'beast', mult: 3 } },
  { id: 'gravewarden', name: 'Alric', title: 'Gravewarden', icon: '✝️', color: '#efe6cf', area: 'graveyard', recruitCost: 15_000, bane: { archetype: 'undead', mult: 3 } },
  { id: 'prospector', name: 'Gus', title: 'Prospector', icon: '💰', color: '#ffd34d', area: 'graveyard', recruitCost: 80_000, gold: 1.75 },
  { id: 'demonbane', name: 'Sera', title: 'Demonbane', icon: '🗡️', color: '#ff7a3d', area: 'caves', recruitCost: 1_500_000, bane: { archetype: 'demon', mult: 3 } },
  { id: 'scavenger', name: 'Pip', title: 'Scavenger', icon: '🎒', color: '#3fb0a0', area: 'caves', recruitCost: 6_000_000, drops: 2 },
  { id: 'frostbreaker', name: 'Bjorn', title: 'Frostbreaker', icon: '🔨', color: '#8fdcff', area: 'peaks', recruitCost: 150_000_000, bane: { archetype: 'elemental', mult: 3 } },
];

export const hunterDef = (id: HunterId): HunterDef => HUNTERS.find((h) => h.id === id)!;

export function hunterPerk(h: HunterDef): string {
  const parts: string[] = [];
  if (h.bane) parts.push(`×${h.bane.mult} damage vs ${ARCHETYPES[h.bane.archetype].name}`);
  if (h.gold) parts.push(`+${Math.round((h.gold - 1) * 100)}% gold`);
  if (h.drops) parts.push(`+${Math.round((h.drops - 1) * 100)}% drops`);
  return parts.join(', ');
}

/** Hunters fire a little slower than you and level with gold. */
export const HELPER_FIRE_RATE = 1.2;
export const HELPER_LEVEL_GROWTH = 1.085;
export const helperLevelCost = (h: HunterDef, level: number): number => Math.ceil(Math.max(10, h.recruitCost * 0.05) * HELPER_LEVEL_GROWTH ** level);
/** Stationed Hunters earn at this fraction of their full rate (they don't tap, but they never get stunned). */
export const STATION_EFFICIENCY = 0.8;

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
export function gemValue(areasUnlocked: number): number {
  return 1 + 2 * Math.max(0, areasUnlocked - 1);
}

export const bhUpgradeCost = (u: BhUpgradeDef, level: number): number => Math.ceil(u.baseCost * u.growth ** level);
