// All tunable numbers and pure formulas live here so balancing never touches game flow code.

export const KILLS_PER_STAGE = 10;
export const BOSS_EVERY = 5;
export const BOSS_TIME = 30; // seconds to beat a boss
export const RESPAWN_DELAY = 0.3; // seconds between a kill and the next monster

export const TAP_CRIT_CHANCE = 0.05;
export const TAP_CRIT_MULT = 5;
/** Each tap also deals this fraction of total slayer DPS, so tapping stays relevant late. */
export const TAP_DPS_SHARE = 0.02;

export const OFFLINE_CAP_SEC = 8 * 3600;
/** Fraction of the online kill rate earned while away. */
export const OFFLINE_EFFICIENCY = 0.5;
export const OFFLINE_MIN_SEC = 30; // shorter absences are not worth a popup

export const MAX_TICKETS = 3;
export const TICKET_REGEN_SEC = 15 * 60;

export const FRENZY_MULT = 2;
export const FRENZY_CAP_SEC = 300;
/** Minigame reward: each "reward unit" is worth this many kills of gold at the current stage. */
export const MINIGAME_GOLD_PER_UNIT = 2;

export const PRESTIGE_MIN_STAGE = 50;
export const SHARD_BONUS = 0.1; // +10% DPS and tap damage per shard

export const COST_GROWTH = 1.07;

export interface HeroDef {
  id: string;
  name: string;
  icon: string;
  baseCost: number;
  baseDps: number;
}

export const HEROES: HeroDef[] = [
  { id: 'squire', name: 'Squire', icon: '🗡️', baseCost: 50, baseDps: 5 },
  { id: 'archer', name: 'Archer', icon: '🏹', baseCost: 250, baseDps: 22 },
  { id: 'pyro', name: 'Pyromancer', icon: '🔥', baseCost: 1_000, baseDps: 74 },
  { id: 'knight', name: 'Knight', icon: '🛡️', baseCost: 4_000, baseDps: 245 },
  { id: 'ranger', name: 'Beast Ranger', icon: '🐺', baseCost: 20_000, baseDps: 976 },
  { id: 'berserker', name: 'Berserker', icon: '🪓', baseCost: 100_000, baseDps: 3_725 },
  { id: 'stormcaller', name: 'Stormcaller', icon: '⚡', baseCost: 400_000, baseDps: 10_859 },
  { id: 'dragoon', name: 'Dragon Rider', icon: '🐉', baseCost: 2_500_000, baseDps: 47_143 },
  { id: 'paladin', name: 'Paladin', icon: '✨', baseCost: 15_000_000, baseDps: 186_000 },
  { id: 'archmage', name: 'Archmage', icon: '🔮', baseCost: 100_000_000, baseDps: 782_000 },
  { id: 'titan', name: 'Titan', icon: '🗿', baseCost: 800_000_000, baseDps: 3_721_000 },
  { id: 'voidlord', name: 'Void Lord', icon: '🌌', baseCost: 6.5e9, baseDps: 17_010_000 },
];

export const isBossStage = (stage: number): boolean => stage % BOSS_EVERY === 0;

export function monsterHp(stage: number): number {
  const s = Math.max(1, stage);
  const early = 10 * (s - 1 + 1.5 ** (Math.min(s, 140) - 1));
  const late = s > 140 ? 1.145 ** (s - 140) : 1;
  return Math.ceil(early * late * (isBossStage(s) ? 10 : 1));
}

export function monsterGold(stage: number): number {
  return Math.max(1, Math.ceil(monsterHp(stage) / 15));
}

/** x2 at level 10, then x3 more at every 25 levels. */
export function milestoneMult(level: number): number {
  return (level >= 10 ? 2 : 1) * 3 ** Math.floor(level / 25);
}

export function heroDps(hero: HeroDef, level: number): number {
  return level <= 0 ? 0 : hero.baseDps * level * milestoneMult(level);
}

/** Total cost of buying `count` levels starting at `level` (geometric series). */
export function bulkCost(baseCost: number, level: number, count: number): number {
  if (count <= 0) return 0;
  const g = COST_GROWTH;
  return (baseCost * g ** level * (g ** count - 1)) / (g - 1);
}

/** How many levels are affordable with `gold`, starting at `level`. */
export function maxAffordable(baseCost: number, level: number, gold: number): number {
  const g = COST_GROWTH;
  const first = baseCost * g ** level;
  if (gold < first) return 0;
  const n = Math.floor(Math.log((gold * (g - 1)) / first + 1) / Math.log(g));
  // Guard against floating point drift at the boundary.
  return bulkCost(baseCost, level, n) > gold ? Math.max(0, n - 1) : n;
}

export const TAP_BASE_COST = 5;

export function tapBaseDamage(tapLevel: number): number {
  return tapLevel * milestoneMult(tapLevel);
}

export function shardMultiplier(shards: number): number {
  return 1 + SHARD_BONUS * shards;
}

/** Soul shards granted for prestiging after reaching `maxStage`. */
export function shardsForStage(maxStage: number): number {
  if (maxStage < PRESTIGE_MIN_STAGE) return 0;
  return Math.floor(((maxStage - 30) / 5) ** 1.5);
}

// ---- Zones: purely cosmetic grouping of stages ----
export interface Zone {
  name: string;
  skyTop: string;
  skyBottom: string;
  ground: string;
  hueBase: number;
}

export const ZONES: Zone[] = [
  { name: 'Mossy Glade', skyTop: '#2b4a3a', skyBottom: '#6fae7a', ground: '#355e2f', hueBase: 100 },
  { name: 'Bone Caverns', skyTop: '#1d1a24', skyBottom: '#4a4150', ground: '#2c2630', hueBase: 30 },
  { name: 'Ember Wastes', skyTop: '#3b0f0f', skyBottom: '#c2582a', ground: '#4a1d10', hueBase: 10 },
  { name: 'Frost Peaks', skyTop: '#1b2c4a', skyBottom: '#8fc3e8', ground: '#c8dff0', hueBase: 200 },
  { name: 'Haunted Mire', skyTop: '#16261f', skyBottom: '#4d6b4f', ground: '#243024', hueBase: 150 },
  { name: 'Shadow Realm', skyTop: '#0d0716', skyBottom: '#3d1f5c', ground: '#1a0f26', hueBase: 280 },
];

export const zoneFor = (stage: number): Zone => ZONES[Math.floor((stage - 1) / 10) % ZONES.length];
