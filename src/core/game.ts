import {
  BASE_CRIT_CHANCE,
  BASE_DROP_CHANCE,
  BASE_FIRE_RATE,
  BH_UPGRADES,
  bhUpgradeCost,
  BOSS_MATERIAL_DROP,
  BOSS_REWARD_MULT,
  BOSS_STUN_TIME,
  BOSS_TIME,
  BOUNTY_DROP_PER_LEVEL,
  BOUNTY_GOLD_PER_LEVEL,
  BOUNTY_SPEED_PER_LEVEL,
  bulkCost,
  CRIT_MULT,
  ENEMIES,
  ENEMY_UPGRADE_MAX,
  ESCAPES_TO_RETREAT,
  enemyDef,
  enemyGold,
  enemyHp,
  enemySpeed,
  enemyUpgradeCost,
  FRENZY_CAP_SEC,
  FRENZY_MULT,
  hasteMult,
  isBossStage,
  itemCost,
  itemDef,
  KILLS_PER_STAGE,
  MAX_TICKETS,
  maxAffordable,
  MINIGAME_GOLD_PER_UNIT,
  nervesMult,
  powerDamage,
  shardMultiplier,
  shardsForStage,
  spawnRamp,
  STUN_TIME,
  SWARM_PER_LEVEL,
  UPGRADES,
  type BhUpgradeId,
  type EnemyId,
  type EnemyUpgrade,
  type ItemId,
  type MaterialId,
  type UpgradeId,
} from './balance';
import { computeOffline, farmStage, regenTickets, type OfflineResult } from './offline';
import { newBestiary, newGame, type BuyAmount, type GameState } from './state';

export type GameEvent =
  | { type: 'stageClear'; stage: number }
  | { type: 'stageChange'; reason: StageChangeReason }
  | { type: 'bossFail' }
  | { type: 'overrun' }
  | { type: 'unlock'; enemy: EnemyId }
  | { type: 'prestige'; shards: number };

/** 'advance' keeps the horde on screen; every other change clears the field. */
export type StageChangeReason = 'advance' | 'retreat' | 'manual' | 'prestige';

export interface Purchase {
  count: number;
  cost: number;
}

export interface KillReward {
  gold: number;
  material: MaterialId | null;
  amount: number;
}

/** Live stats for one enemy type on the current stage. */
export interface EnemyStats {
  id: EnemyId;
  hp: number;
  speed: number;
  gold: number;
  spawnRate: number;
  dropChance: number;
  material: MaterialId;
}

export interface MinigameReward {
  gold: number;
  frenzy: number;
  materials: Partial<Record<MaterialId, number>>;
  stars: number;
}

export interface MinigamePayout {
  id: string;
  score: number;
  /** ≈ monsters slain; converted to gold and Frenzy. */
  units: number;
  materials?: Partial<Record<MaterialId, number>>;
  stars?: number;
}

/**
 * The economy and progression rules. Positions, bullets and collisions live in
 * Field; Field reports kills/escapes here and reads combat stats from here.
 */
export class Game {
  state: GameState;
  /** True while a boss is on the field (its timer is running). */
  bossAlive = false;
  private listeners: Array<(e: GameEvent) => void> = [];
  rng: () => number;

  constructor(state: GameState, rng: () => number = Math.random) {
    this.state = state;
    this.rng = rng;
  }

  on(fn: (e: GameEvent) => void): void {
    this.listeners.push(fn);
  }

  private emit(e: GameEvent): void {
    for (const fn of this.listeners) fn(e);
  }

  private item(id: ItemId): number {
    return this.state.items[id];
  }

  // ---- Hunter stats (read by Field every frame) ----

  get shardMult(): number {
    return shardMultiplier(this.state.shards);
  }

  get frenzy(): boolean {
    return this.state.frenzyTime > 0;
  }

  get damage(): number {
    const it = (id: ItemId) => this.item(id);
    return (
      powerDamage(this.state.upgrades.power) *
      (1 + 0.25 * it('whetstone')) *
      1.5 ** it('engine') *
      this.shardMult *
      (this.frenzy ? FRENZY_MULT : 1)
    );
  }

  get fireRate(): number {
    return BASE_FIRE_RATE * hasteMult(this.state.upgrades.haste) * (1 + 0.1 * this.item('gloves')) * (1 + 0.05 * this.item('engine'));
  }

  get projectiles(): number {
    return 1 + this.item('splitbow');
  }

  get pierce(): number {
    return this.item('lance');
  }

  get critChance(): number {
    return BASE_CRIT_CHANCE + 0.04 * this.item('lantern');
  }

  /** Seconds the Hunter is stunned when an enemy reaches them. */
  stunTime(boss = false): number {
    return (boss ? BOSS_STUN_TIME : STUN_TIME) * nervesMult(this.state.upgrades.nerves) * 0.88 ** this.item('bonemail');
  }

  get goldMult(): number {
    return 1 + 0.25 * this.item('idol');
  }

  /** Expected damage per second, ignoring overkill, travel time and stuns. */
  get dps(): number {
    return this.damage * this.fireRate * this.projectiles * (1 + this.critChance * (CRIT_MULT - 1));
  }

  // ---- Enemies ----

  isUnlocked(id: EnemyId): boolean {
    return this.state.bestiary[id].unlocked;
  }

  get unlockedEnemies(): EnemyId[] {
    return ENEMIES.filter((e) => this.isUnlocked(e.id)).map((e) => e.id);
  }

  /** Stats of one enemy type on a stage (defaults to the current one). */
  enemyStats(id: EnemyId, stage = this.state.stage): EnemyStats {
    const def = enemyDef(id);
    const b = this.state.bestiary[id];
    return {
      id,
      hp: enemyHp(stage) * def.hp,
      speed: enemySpeed(stage) * def.speed * (1 + BOUNTY_SPEED_PER_LEVEL * b.bounty),
      gold: enemyGold(stage) * def.gold * (1 + BOUNTY_GOLD_PER_LEVEL * b.bounty) * this.goldMult,
      spawnRate: b.unlocked ? def.spawn * (1 + SWARM_PER_LEVEL * b.swarm) * spawnRamp(stage) * (1 + 0.2 * this.item('lure')) : 0,
      dropChance: BASE_DROP_CHANCE * (1 + 0.25 * this.item('pouch')) * (1 + BOUNTY_DROP_PER_LEVEL * b.bounty),
      material: def.material,
    };
  }

  roster(stage = this.state.stage): EnemyStats[] {
    return this.unlockedEnemies.map((id) => this.enemyStats(id, stage));
  }

  /** Total enemies per second across all unlocked types. */
  get spawnRate(): number {
    return this.roster().reduce((sum, e) => sum + e.spawnRate, 0);
  }

  /** Weighted random pick of which enemy type the next pack is. */
  pickEnemy(): EnemyId {
    const roster = this.roster();
    let roll = this.rng() * roster.reduce((sum, e) => sum + e.spawnRate, 0);
    for (const e of roster) {
      roll -= e.spawnRate;
      if (roll <= 0) return e.id;
    }
    return roster[roster.length - 1]?.id ?? 'slime';
  }

  /** The stage boss is a giant version of the toughest enemy you've unlocked. */
  get bossType(): EnemyId {
    const u = this.unlockedEnemies;
    return u[u.length - 1];
  }

  get isBoss(): boolean {
    return isBossStage(this.state.stage);
  }

  get pendingShards(): number {
    return shardsForStage(this.state.maxStage);
  }

  // ---- Simulation hooks ----

  tick(dt: number): void {
    const s = this.state;
    regenTickets(s, dt);
    if (s.frenzyTime > 0) s.frenzyTime = Math.max(0, s.frenzyTime - dt);
    if (this.bossAlive) {
      s.bossTimer -= dt;
      if (s.bossTimer <= 0) this.failBoss();
    }
  }

  /** Field calls this when it puts the stage boss on the field. */
  bossSpawned(): void {
    this.bossAlive = true;
    this.state.bossTimer = BOSS_TIME;
  }

  /** Field calls this for every enemy killed. */
  registerKill(type: EnemyId, boss: boolean): KillReward {
    const s = this.state;
    const e = this.enemyStats(type);
    const gold = e.gold * (boss ? BOSS_REWARD_MULT : 1);
    s.gold += gold;
    s.stats.totalGold += gold;
    s.stats.totalKills++;

    let amount = 0;
    if (boss) amount = Math.round(BOSS_MATERIAL_DROP * (1 + 0.25 * this.item('pouch')));
    else amount = Math.floor(e.dropChance) + (this.rng() < e.dropChance % 1 ? 1 : 0);
    s.materials[e.material] += amount;

    if (boss) {
      this.bossAlive = false;
      this.clearStage();
    } else if (!this.isBoss) {
      s.stageKills++;
      if (s.stageKills >= KILLS_PER_STAGE) this.clearStage();
    }
    return { gold, material: amount > 0 ? e.material : null, amount };
  }

  /** Field calls this when a fleeing enemy leaves the screen with its loot. Too many and the Hunter falls back. */
  registerEscape(): void {
    const s = this.state;
    s.stageEscapes++;
    s.stats.escaped++;
    if (s.stageEscapes >= ESCAPES_TO_RETREAT && s.stage > 1) {
      s.autoAdvance = false;
      this.emit({ type: 'overrun' });
      this.goToStage(s.stage - 1, 'retreat');
    }
  }

  registerTap(): void {
    this.state.stats.taps++;
  }

  private clearStage(): void {
    const s = this.state;
    this.emit({ type: 'stageClear', stage: s.stage });
    s.maxStage = Math.max(s.maxStage, s.stage + 1);
    if (s.autoAdvance) this.goToStage(s.stage + 1, 'advance');
    else {
      s.stageKills = 0;
      s.stageEscapes = 0;
    }
  }

  private failBoss(): void {
    this.state.autoAdvance = false;
    this.emit({ type: 'bossFail' });
    this.goToStage(this.state.stage - 1, 'retreat');
  }

  private goToStage(stage: number, reason: StageChangeReason): void {
    const s = this.state;
    s.stage = Math.min(Math.max(1, stage), s.maxStage);
    s.stageKills = 0;
    s.stageEscapes = 0;
    s.bossTimer = 0;
    this.bossAlive = false;
    this.emit({ type: 'stageChange', reason });
  }

  /** Player-driven stage navigation. Stepping back pauses auto-advance; reaching the frontier resumes it. */
  setStage(stage: number): void {
    const target = Math.min(Math.max(1, stage), this.state.maxStage);
    if (target === this.state.stage) return;
    this.state.autoAdvance = target >= this.state.maxStage;
    this.goToStage(target, 'manual');
  }

  toggleAutoAdvance(): void {
    this.state.autoAdvance = !this.state.autoAdvance;
  }

  // ---- Gold upgrades ----

  upgradePurchase(id: UpgradeId, amount: BuyAmount = this.state.buyAmount): Purchase {
    const def = UPGRADES.find((u) => u.id === id)!;
    const level = this.state.upgrades[id];
    const room = def.maxLevel !== undefined ? def.maxLevel - level : Infinity;
    if (room <= 0) return { count: 0, cost: Infinity };
    let count = amount === 'max' ? Math.max(1, maxAffordable(def.baseCost, def.growth, level, this.state.gold)) : amount;
    count = Math.min(count, room);
    return { count, cost: bulkCost(def.baseCost, def.growth, level, count) };
  }

  buyUpgrade(id: UpgradeId): boolean {
    const p = this.upgradePurchase(id);
    if (p.count <= 0 || this.state.gold < p.cost) return false;
    this.state.gold -= p.cost;
    this.state.upgrades[id] += p.count;
    return true;
  }

  // ---- Bestiary ----

  unlockEnemy(id: EnemyId): boolean {
    const def = enemyDef(id);
    const b = this.state.bestiary[id];
    if (b.unlocked || this.state.gold < def.unlockCost) return false;
    this.state.gold -= def.unlockCost;
    b.unlocked = true;
    this.emit({ type: 'unlock', enemy: id });
    return true;
  }

  enemyUpgradeCost(id: EnemyId, kind: EnemyUpgrade): number {
    const level = this.state.bestiary[id][kind];
    return level >= ENEMY_UPGRADE_MAX ? Infinity : enemyUpgradeCost(enemyDef(id), kind, level);
  }

  buyEnemyUpgrade(id: EnemyId, kind: EnemyUpgrade): boolean {
    const b = this.state.bestiary[id];
    const cost = this.enemyUpgradeCost(id, kind);
    if (!b.unlocked || this.state.gold < cost) return false;
    this.state.gold -= cost;
    b[kind]++;
    return true;
  }

  // ---- Forge ----

  canCraft(id: ItemId): boolean {
    const def = itemDef(id);
    const level = this.state.items[id];
    if (level >= def.maxLevel) return false;
    const cost = itemCost(def, level);
    return (Object.entries(cost) as [MaterialId, number][]).every(([m, n]) => this.state.materials[m] >= n);
  }

  craft(id: ItemId): boolean {
    if (!this.canCraft(id)) return false;
    const cost = itemCost(itemDef(id), this.state.items[id]);
    for (const [m, n] of Object.entries(cost) as [MaterialId, number][]) this.state.materials[m] -= n;
    this.state.items[id]++;
    return true;
  }

  // ---- Bullet hell upgrades ----

  bhCost(id: BhUpgradeId): number {
    const def = BH_UPGRADES.find((u) => u.id === id)!;
    const level = this.state.bh[id];
    return level >= def.maxLevel ? Infinity : bhUpgradeCost(def, level);
  }

  buyBh(id: BhUpgradeId): boolean {
    const cost = this.bhCost(id);
    if (this.state.stars < cost) return false;
    this.state.stars -= cost;
    this.state.bh[id]++;
    return true;
  }

  // ---- Ascension ----

  /**
   * Resets stage, gold, training and the bestiary for Soul Shards.
   * Materials, forged items and Arena progress are kept.
   */
  prestige(now = Date.now()): number {
    const gained = this.pendingShards;
    if (gained <= 0) return 0;
    const old = this.state;
    const fresh = newGame(now);
    fresh.shards = old.shards + gained;
    fresh.materials = old.materials;
    fresh.items = old.items;
    fresh.stars = old.stars;
    fresh.bh = old.bh;
    fresh.bestiary = newBestiary();
    fresh.tickets = old.tickets;
    fresh.ticketProgress = old.ticketProgress;
    fresh.buyAmount = old.buyAmount;
    fresh.stats = { ...old.stats, prestiges: old.stats.prestiges + 1 };
    this.state = fresh;
    this.bossAlive = false;
    this.emit({ type: 'prestige', shards: gained });
    this.emit({ type: 'stageChange', reason: 'prestige' });
    return gained;
  }

  // ---- Offline & minigames ----

  /** Applies progress for time spent away. Returns what was earned. */
  applyOffline(now = Date.now()): OfflineResult {
    const s = this.state;
    const frenzyWas = s.frenzyTime;
    s.frenzyTime = 0; // offline progress never benefits from Frenzy
    const result = computeOffline(this.dps, this.roster(farmStage(s.stage)), (now - s.lastSeen) / 1000);
    s.frenzyTime = Math.max(0, frenzyWas - result.away);
    s.gold += result.gold;
    s.stats.totalGold += result.gold;
    s.stats.totalKills += result.kills;
    for (const [m, n] of Object.entries(result.materials) as [MaterialId, number][]) s.materials[m] += n;
    regenTickets(s, result.away);
    s.lastSeen = now;
    return result;
  }

  get ticketsFull(): boolean {
    return this.state.tickets >= MAX_TICKETS;
  }

  useTicket(): boolean {
    if (this.state.tickets <= 0) return false;
    if (this.ticketsFull) this.state.ticketProgress = 0;
    this.state.tickets--;
    return true;
  }

  /** Materials of the enemies you've unlocked (the bullet hell only drops these). */
  get unlockedMaterials(): MaterialId[] {
    return this.unlockedEnemies.map((id) => enemyDef(id).material);
  }

  grantMinigame(p: MinigamePayout): MinigameReward {
    const s = this.state;
    const u = Math.max(0, Math.floor(p.units));
    const gold = u * MINIGAME_GOLD_PER_UNIT * this.enemyStats('slime', farmStage(s.stage)).gold;
    const frenzy = Math.max(0, Math.min(FRENZY_CAP_SEC - s.frenzyTime, u));
    s.gold += gold;
    s.stats.totalGold += gold;
    s.frenzyTime += frenzy;
    const materials: Partial<Record<MaterialId, number>> = {};
    for (const [m, n] of Object.entries(p.materials ?? {}) as [MaterialId, number][]) {
      const amount = Math.floor(n);
      if (amount <= 0) continue;
      s.materials[m] += amount;
      materials[m] = amount;
    }
    const stars = Math.max(0, Math.floor(p.stars ?? 0));
    s.stars += stars;
    s.stats.best[p.id] = Math.max(s.stats.best[p.id] ?? 0, p.score);
    return { gold, frenzy, materials, stars };
  }
}
