import {
  BOSS_TIME,
  bulkCost,
  FRENZY_CAP_SEC,
  FRENZY_MULT,
  HEROES,
  heroDps,
  isBossStage,
  KILLS_PER_STAGE,
  MAX_TICKETS,
  maxAffordable,
  MINIGAME_GOLD_PER_UNIT,
  monsterGold,
  monsterHp,
  RESPAWN_DELAY,
  shardMultiplier,
  shardsForStage,
  TAP_BASE_COST,
  TAP_CRIT_CHANCE,
  TAP_CRIT_MULT,
  TAP_DPS_SHARE,
  tapBaseDamage,
} from './balance';
import { computeOffline, farmStage, regenTickets, type OfflineResult } from './offline';
import { newGame, type BuyAmount, type GameState } from './state';

export type GameEvent =
  | { type: 'tap'; amount: number; crit: boolean }
  | { type: 'kill'; gold: number; boss: boolean }
  | { type: 'spawn'; boss: boolean }
  | { type: 'stageClear'; stage: number }
  | { type: 'bossFail' }
  | { type: 'prestige'; shards: number };

export interface Purchase {
  count: number;
  cost: number;
}

export interface MinigameReward {
  gold: number;
  frenzy: number;
}

export class Game {
  state: GameState;
  /** Seconds until the next monster appears (0 while one is alive). */
  respawn = 0;
  private listeners: Array<(e: GameEvent) => void> = [];
  private rng: () => number;

  constructor(state: GameState, rng: () => number = Math.random) {
    this.state = state;
    this.rng = rng;
    if (state.monsterHp <= 0) this.spawn();
  }

  on(fn: (e: GameEvent) => void): void {
    this.listeners.push(fn);
  }

  private emit(e: GameEvent): void {
    for (const fn of this.listeners) fn(e);
  }

  // ---- Derived stats ----

  get shardMult(): number {
    return shardMultiplier(this.state.shards);
  }

  /** Slayer DPS without temporary buffs (used for offline progress). */
  get baseDps(): number {
    let total = 0;
    HEROES.forEach((h, i) => (total += heroDps(h, this.state.heroes[i])));
    return total * this.shardMult;
  }

  get dps(): number {
    return this.baseDps * (this.state.frenzyTime > 0 ? FRENZY_MULT : 1);
  }

  get tapDamage(): number {
    const frenzy = this.state.frenzyTime > 0 ? FRENZY_MULT : 1;
    return tapBaseDamage(this.state.tapLevel) * this.shardMult * frenzy + this.dps * TAP_DPS_SHARE;
  }

  get maxHp(): number {
    return monsterHp(this.state.stage);
  }

  get isBoss(): boolean {
    return isBossStage(this.state.stage) && !this.state.farming;
  }

  get monsterAlive(): boolean {
    return this.respawn <= 0 && this.state.monsterHp > 0;
  }

  /** Farming a cleared stage before a boss the player failed. */
  get canFightBoss(): boolean {
    return this.state.farming;
  }

  get pendingShards(): number {
    return shardsForStage(this.state.maxStage);
  }

  // ---- Simulation ----

  tick(dt: number): void {
    const s = this.state;
    regenTickets(s, dt);
    if (s.frenzyTime > 0) s.frenzyTime = Math.max(0, s.frenzyTime - dt);

    if (this.respawn > 0) {
      this.respawn -= dt;
      if (this.respawn <= 0) this.spawn();
      return;
    }

    if (this.isBoss) {
      s.bossTimer -= dt;
      if (s.bossTimer <= 0) {
        this.failBoss();
        return;
      }
    }

    this.damage(this.dps * dt);
  }

  tap(): { amount: number; crit: boolean } | null {
    if (!this.monsterAlive) return null;
    const crit = this.rng() < TAP_CRIT_CHANCE;
    const amount = this.tapDamage * (crit ? TAP_CRIT_MULT : 1);
    this.state.stats.taps++;
    this.emit({ type: 'tap', amount, crit });
    this.damage(amount);
    return { amount, crit };
  }

  private damage(amount: number): void {
    if (!this.monsterAlive || amount <= 0) return;
    this.state.monsterHp -= amount;
    if (this.state.monsterHp <= 0) this.kill();
  }

  private kill(): void {
    const s = this.state;
    const boss = this.isBoss;
    const gold = monsterGold(s.stage);
    s.monsterHp = 0;
    s.gold += gold;
    s.stats.totalGold += gold;
    s.stats.totalKills++;
    this.emit({ type: 'kill', gold, boss });

    if (boss) {
      this.advance();
    } else {
      s.kills = Math.min(KILLS_PER_STAGE, s.kills + 1);
      if (s.kills >= KILLS_PER_STAGE && !s.farming) this.advance();
    }
    this.respawn = RESPAWN_DELAY;
  }

  private advance(): void {
    const s = this.state;
    this.emit({ type: 'stageClear', stage: s.stage });
    s.stage++;
    s.maxStage = Math.max(s.maxStage, s.stage);
    s.kills = 0;
    s.farming = false;
  }

  private spawn(): void {
    const s = this.state;
    this.respawn = 0;
    s.monsterHp = this.maxHp;
    if (this.isBoss) s.bossTimer = BOSS_TIME;
    this.emit({ type: 'spawn', boss: this.isBoss });
  }

  private failBoss(): void {
    const s = this.state;
    s.stage = Math.max(1, s.stage - 1);
    s.farming = true;
    s.kills = KILLS_PER_STAGE;
    s.bossTimer = 0;
    this.emit({ type: 'bossFail' });
    this.spawn();
  }

  fightBoss(): void {
    const s = this.state;
    if (!s.farming) return;
    s.farming = false;
    s.stage++;
    s.kills = 0;
    this.spawn();
  }

  // ---- Shop ----

  private purchase(baseCost: number, level: number, amount: BuyAmount): Purchase {
    const count = amount === 'max' ? Math.max(1, maxAffordable(baseCost, level, this.state.gold)) : amount;
    return { count, cost: bulkCost(baseCost, level, count) };
  }

  heroPurchase(i: number, amount: BuyAmount = this.state.buyAmount): Purchase {
    return this.purchase(HEROES[i].baseCost, this.state.heroes[i], amount);
  }

  tapPurchase(amount: BuyAmount = this.state.buyAmount): Purchase {
    // tapLevel starts at 1, so level 1 costs TAP_BASE_COST.
    return this.purchase(TAP_BASE_COST, this.state.tapLevel - 1, amount);
  }

  heroUnlocked(i: number): boolean {
    return i === 0 || this.state.heroes[i] > 0 || this.state.heroes[i - 1] > 0;
  }

  buyHero(i: number): boolean {
    if (!this.heroUnlocked(i)) return false;
    const p = this.heroPurchase(i);
    if (this.state.gold < p.cost) return false;
    this.state.gold -= p.cost;
    this.state.heroes[i] += p.count;
    return true;
  }

  buyTap(): boolean {
    const p = this.tapPurchase();
    if (this.state.gold < p.cost) return false;
    this.state.gold -= p.cost;
    this.state.tapLevel += p.count;
    return true;
  }

  // ---- Prestige ----

  prestige(now = Date.now()): number {
    const gained = this.pendingShards;
    if (gained <= 0) return 0;
    const old = this.state;
    const fresh = newGame(now);
    fresh.shards = old.shards + gained;
    fresh.tickets = old.tickets;
    fresh.ticketProgress = old.ticketProgress;
    fresh.buyAmount = old.buyAmount;
    fresh.stats = { ...old.stats, prestiges: old.stats.prestiges + 1 };
    this.state = fresh;
    this.respawn = 0;
    this.spawn();
    this.emit({ type: 'prestige', shards: gained });
    return gained;
  }

  // ---- Offline & minigames ----

  /** Applies progress for time spent away. Returns what was earned. */
  applyOffline(now = Date.now()): OfflineResult {
    const s = this.state;
    const awaySec = (now - s.lastSeen) / 1000;
    const result = computeOffline(s, this.baseDps, awaySec);
    s.gold += result.gold;
    s.stats.totalGold += result.gold;
    s.stats.totalKills += result.kills;
    regenTickets(s, result.away);
    s.frenzyTime = Math.max(0, s.frenzyTime - result.away);
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

  /** Converts minigame performance ("units" ≈ monsters slain) into gold and a DPS frenzy. */
  grantMinigame(id: string, units: number, score: number): MinigameReward {
    const s = this.state;
    const u = Math.max(0, Math.floor(units));
    const gold = u * MINIGAME_GOLD_PER_UNIT * monsterGold(farmStage(s));
    const frenzy = Math.min(FRENZY_CAP_SEC - s.frenzyTime, u);
    s.gold += gold;
    s.stats.totalGold += gold;
    s.frenzyTime += Math.max(0, frenzy);
    s.stats.best[id] = Math.max(s.stats.best[id] ?? 0, score);
    return { gold, frenzy: Math.max(0, frenzy) };
  }
}
