import {
  BASE_CRIT_CHANCE,
  BASE_DROP_CHANCE,
  BASE_FIRE_RATE,
  BASE_SPAWN_RATE,
  BH_UPGRADES,
  bhUpgradeCost,
  BOSS_MATERIAL_DROP,
  BOSS_REWARD_MULT,
  BOSS_TIME,
  bulkCost,
  CRIT_MULT,
  enemyGold,
  enemyHp,
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
  PLAYER_REGEN,
  powerDamage,
  shardMultiplier,
  shardsForStage,
  spawnRamp,
  UPGRADES,
  vitalityMult,
  zoneFor,
  type BhUpgradeId,
  type ItemId,
  type MaterialId,
  type UpgradeId,
} from './balance';
import { computeOffline, farmStage, regenTickets, type OfflineResult } from './offline';
import { newGame, type BuyAmount, type GameState } from './state';

export type GameEvent =
  | { type: 'stageClear'; stage: number }
  | { type: 'stageChange'; reason: StageChangeReason }
  | { type: 'bossFail' }
  | { type: 'death' }
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
 * Field; Field reports kills/deaths here and reads combat stats from here.
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

  // ---- Combat stats (read by Field every frame) ----

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

  get spawnRate(): number {
    return BASE_SPAWN_RATE * spawnRamp(this.state.stage) * (1 + 0.2 * this.item('lure'));
  }

  get dropChance(): number {
    return BASE_DROP_CHANCE * (1 + 0.25 * this.item('pouch'));
  }

  get goldMult(): number {
    return 1 + 0.25 * this.item('idol');
  }

  /** Multiplier on contact damage the hero takes. */
  get damageTaken(): number {
    return 0.88 ** this.item('bonemail') * vitalityMult(this.state.upgrades.vitality);
  }

  get regen(): number {
    return PLAYER_REGEN * (1 + 0.1 * this.state.upgrades.vitality);
  }

  /** Expected damage per second, ignoring overkill and travel time. */
  get dps(): number {
    return this.damage * this.fireRate * this.projectiles * (1 + this.critChance * (CRIT_MULT - 1));
  }

  get enemyHp(): number {
    return enemyHp(this.state.stage);
  }

  get isBoss(): boolean {
    return isBossStage(this.state.stage);
  }

  get zoneMaterial(): MaterialId {
    return zoneFor(this.state.stage).material;
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
  registerKill(boss: boolean): KillReward {
    const s = this.state;
    const gold = enemyGold(s.stage) * this.goldMult * (boss ? BOSS_REWARD_MULT : 1);
    s.gold += gold;
    s.stats.totalGold += gold;
    s.stats.totalKills++;

    const material = this.zoneMaterial;
    let amount = 0;
    if (boss) amount = Math.round(BOSS_MATERIAL_DROP * (1 + 0.25 * this.item('pouch')));
    else {
      const c = this.dropChance;
      amount = Math.floor(c) + (this.rng() < c % 1 ? 1 : 0);
    }
    s.materials[material] += amount;

    if (boss) {
      this.bossAlive = false;
      this.clearStage();
    } else if (!this.isBoss) {
      s.stageKills++;
      if (s.stageKills >= KILLS_PER_STAGE) this.clearStage();
    }
    return { gold, material: amount > 0 ? material : null, amount };
  }

  registerTap(): void {
    this.state.stats.taps++;
  }

  /** Field calls this when the hero's HP runs out: retreat one stage and stop auto-advancing. */
  playerDied(): void {
    this.state.stats.deaths++;
    this.state.autoAdvance = false;
    this.emit({ type: 'death' });
    this.goToStage(this.state.stage - 1, 'retreat');
  }

  private clearStage(): void {
    const s = this.state;
    this.emit({ type: 'stageClear', stage: s.stage });
    s.maxStage = Math.max(s.maxStage, s.stage + 1);
    if (s.autoAdvance) this.goToStage(s.stage + 1, 'advance');
    else s.stageKills = 0;
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

  /** Resets stage, gold and gold upgrades for Soul Shards. Materials, items and Arena progress are kept. */
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
    const result = computeOffline(
      { stage: s.stage, dps: this.dps, spawnRate: this.spawnRate, goldMult: this.goldMult, dropChance: this.dropChance },
      (now - s.lastSeen) / 1000,
    );
    s.frenzyTime = Math.max(0, frenzyWas - result.away);
    s.gold += result.gold;
    s.stats.totalGold += result.gold;
    s.stats.totalKills += result.kills;
    s.materials[result.material] += result.materials;
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

  /** Materials the player has reached so far (the bullet hell only drops these). */
  get unlockedMaterials(): MaterialId[] {
    const zones = Math.min(6, Math.floor((this.state.maxStage - 1) / 10) + 1);
    const mats: MaterialId[] = [];
    for (let z = 0; z < zones; z++) mats.push(zoneFor(z * 10 + 1).material);
    return mats;
  }

  grantMinigame(p: MinigamePayout): MinigameReward {
    const s = this.state;
    const u = Math.max(0, Math.floor(p.units));
    const gold = u * MINIGAME_GOLD_PER_UNIT * enemyGold(farmStage(s.stage)) * this.goldMult;
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
