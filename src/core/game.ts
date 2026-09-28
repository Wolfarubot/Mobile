import {
  areaDef,
  areaEnemies,
  AREAS,
  BASE_CRIT_CHANCE,
  BASE_DROP_CHANCE,
  BASE_FIRE_RATE,
  BH_UPGRADES,
  bhUpgradeCost,
  BOSS_MATERIAL_DROP,
  BOSS_STUN_TIME,
  BOUNTY_DROP_PER_LEVEL,
  BOUNTY_GOLD_PER_LEVEL,
  BOUNTY_SPEED_PER_LEVEL,
  bulkCost,
  CRIT_MULT,
  ENEMIES,
  ENEMY_UPGRADE_MAX,
  enemyDef,
  enemyUnlockCost,
  enemyUpgradeCost,
  FRENZY_CAP_SEC,
  FRENZY_MULT,
  GUARDIAN_GOLD_MULT,
  GUARDIAN_HP_MULT,
  GUARDIAN_TIME,
  hasteMult,
  HELPER_FIRE_RATE,
  HELPER_LEVEL_GROWTH,
  helperLevelCost,
  hunterDef,
  HUNTERS,
  itemCost,
  itemDef,
  MAX_TICKETS,
  maxAffordable,
  MINIGAME_GOLD_PER_UNIT,
  nervesMult,
  nextAreaOf,
  OFFLINE_EFFICIENCY,
  powerDamage,
  STATION_EFFICIENCY,
  STUN_TIME,
  SWARM_PER_LEVEL,
  UPGRADES,
  type AreaId,
  type Archetype,
  type BhUpgradeId,
  type EnemyId,
  type EnemyUpgrade,
  type HunterId,
  type ItemId,
  type MaterialId,
  type UpgradeId,
} from './balance';
import { capAway, regenTickets, type OfflineResult } from './offline';
import { type BuyAmount, type GameState } from './state';

export type GameEvent =
  | { type: 'travel' }
  | { type: 'guardianChallenge' }
  | { type: 'guardianFail' }
  | { type: 'areaUnlocked'; area: AreaId }
  | { type: 'unlock'; enemy: EnemyId }
  | { type: 'recruit'; hunter: HunterId };

/** Who fired a shot: your main Hunter or one of the recruited Hunters. */
export type Shooter = 'main' | HunterId;

export interface Purchase {
  count: number;
  cost: number;
}

export interface KillReward {
  gold: number;
  material: MaterialId | null;
  amount: number;
}

/** Live stats for one enemy type. */
export interface EnemyStats {
  id: EnemyId;
  archetype: Archetype;
  hp: number;
  speed: number;
  gold: number;
  spawnRate: number;
  dropChance: number;
  material: MaterialId;
}

/** Expected per-second yield of a group of Hunters farming an area. */
export interface FarmRates {
  kills: Partial<Record<EnemyId, number>>;
  killsTotal: number;
  gold: number;
  materials: Partial<Record<MaterialId, number>>;
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
 * Hunters stationed in areas you're not looking at farm here, analytically.
 */
export class Game {
  state: GameState;
  /** A Guardian challenge is in progress (the Field spawns it). */
  guardianActive = false;
  /** The Guardian is on the field (its timer is running). */
  bossAlive = false;
  bossTimer = 0;
  /** Enemies that got away since arriving in the current area. */
  escapesHere = 0;
  /** Fractional kills/drops accumulated by stationed Hunters, per area+enemy. */
  private farmAcc = new Map<string, number>();
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

  get frenzy(): boolean {
    return this.state.frenzyTime > 0;
  }

  /** Forge items and Frenzy boost every Hunter. */
  get itemDamageMult(): number {
    return (1 + 0.25 * this.item('whetstone')) * 1.5 ** this.item('engine') * (this.frenzy ? FRENZY_MULT : 1);
  }

  get itemRateMult(): number {
    return (1 + 0.1 * this.item('gloves')) * (1 + 0.05 * this.item('engine'));
  }

  /** Your main Hunter's damage per shot. */
  get damage(): number {
    return powerDamage(this.state.upgrades.power) * this.itemDamageMult;
  }

  get fireRate(): number {
    return BASE_FIRE_RATE * hasteMult(this.state.upgrades.haste) * this.itemRateMult;
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

  private get critFactor(): number {
    return 1 + this.critChance * (CRIT_MULT - 1);
  }

  /** Seconds the main Hunter is stunned when an enemy reaches them. */
  stunTime(boss = false): number {
    return (boss ? BOSS_STUN_TIME : STUN_TIME) * nervesMult(this.state.upgrades.nerves) * 0.88 ** this.item('bonemail');
  }

  get goldMult(): number {
    return 1 + 0.25 * this.item('idol');
  }

  /** Damage per shot of any Hunter against an archetype (archetype bonuses included). */
  shotDamage(shooter: Shooter, archetype?: Archetype): number {
    if (shooter === 'main') return this.damage;
    const def = hunterDef(shooter);
    const bane = def.bane && def.bane.archetype === archetype ? def.bane.mult : 1;
    return powerDamage(this.state.hunters[shooter].level) * this.itemDamageMult * bane;
  }

  shooterRate(shooter: Shooter): number {
    return shooter === 'main' ? this.fireRate : HELPER_FIRE_RATE * this.itemRateMult;
  }

  /** Expected damage per second of a Hunter against an archetype, ignoring overkill, travel time and stuns. */
  dpsOf(shooter: Shooter, archetype?: Archetype): number {
    return this.shotDamage(shooter, archetype) * this.shooterRate(shooter) * this.projectiles * this.critFactor;
  }

  /** Your main Hunter's DPS. */
  get dps(): number {
    return this.dpsOf('main');
  }

  private shooterGold(shooter: Shooter): number {
    return shooter === 'main' ? 1 : (hunterDef(shooter).gold ?? 1);
  }

  private shooterDrops(shooter: Shooter): number {
    return shooter === 'main' ? 1 : (hunterDef(shooter).drops ?? 1);
  }

  // ---- Areas ----

  get area(): AreaId {
    return this.state.area;
  }

  isAreaUnlocked(id: AreaId): boolean {
    return this.state.areas[id].unlocked;
  }

  get unlockedAreas(): AreaId[] {
    return AREAS.filter((a) => this.isAreaUnlocked(a.id)).map((a) => a.id);
  }

  /** The next area this one's Guardian leads to, if it's still locked. */
  get lockedNext(): AreaId | null {
    const next = nextAreaOf(this.state.area);
    return next && !this.isAreaUnlocked(next.id) ? next.id : null;
  }

  get guardianReady(): boolean {
    return this.lockedNext !== null && this.state.areas[this.state.area].kills >= areaDef(this.state.area).mastery;
  }

  /** The Guardian is a giant version of the area's rarest monster. */
  get guardianType(): EnemyId {
    const list = areaEnemies(this.state.area);
    return list[list.length - 1].id;
  }

  get guardianHp(): number {
    const next = nextAreaOf(this.state.area);
    return (next ?? areaDef(this.state.area)).hp * GUARDIAN_HP_MULT;
  }

  travel(id: AreaId): boolean {
    if (!this.isAreaUnlocked(id) || id === this.state.area) return false;
    this.state.area = id;
    this.endGuardian();
    this.escapesHere = 0;
    this.emit({ type: 'travel' });
    return true;
  }

  challengeGuardian(): boolean {
    if (!this.guardianReady || this.guardianActive) return false;
    this.guardianActive = true;
    this.emit({ type: 'guardianChallenge' });
    return true;
  }

  /** Field calls this when it puts the Guardian on the field. */
  bossSpawned(): void {
    this.bossAlive = true;
    this.bossTimer = GUARDIAN_TIME;
  }

  private endGuardian(): void {
    this.guardianActive = false;
    this.bossAlive = false;
    this.bossTimer = 0;
  }

  // ---- Enemies ----

  isUnlocked(id: EnemyId): boolean {
    return this.state.bestiary[id].unlocked && this.isAreaUnlocked(enemyDef(id).area);
  }

  enemyStats(id: EnemyId): EnemyStats {
    const def = enemyDef(id);
    const area = areaDef(def.area);
    const b = this.state.bestiary[id];
    return {
      id,
      archetype: def.archetype,
      hp: area.hp * def.hp,
      speed: area.speed * def.speed * (1 + BOUNTY_SPEED_PER_LEVEL * b.bounty),
      gold: area.gold * def.gold * (1 + BOUNTY_GOLD_PER_LEVEL * b.bounty) * this.goldMult,
      spawnRate: b.unlocked ? def.spawn * (1 + SWARM_PER_LEVEL * b.swarm) * (1 + 0.2 * this.item('lure')) : 0,
      dropChance: BASE_DROP_CHANCE * (1 + 0.25 * this.item('pouch')) * (1 + BOUNTY_DROP_PER_LEVEL * b.bounty),
      material: def.material,
    };
  }

  /** Unlocked enemies of an area (defaults to where you are). */
  roster(area: AreaId = this.state.area): EnemyStats[] {
    return areaEnemies(area)
      .filter((e) => this.state.bestiary[e.id].unlocked)
      .map((e) => this.enemyStats(e.id));
  }

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
    return roster[roster.length - 1]?.id ?? areaEnemies(this.state.area)[0].id;
  }

  // ---- Simulation hooks ----

  tick(dt: number): void {
    const s = this.state;
    regenTickets(s, dt);
    if (s.frenzyTime > 0) s.frenzyTime = Math.max(0, s.frenzyTime - dt);
    if (this.bossAlive) {
      this.bossTimer -= dt;
      if (this.bossTimer <= 0) {
        this.endGuardian();
        this.emit({ type: 'guardianFail' });
      }
    }
    // Hunters stationed elsewhere keep farming in the background.
    for (const h of HUNTERS) {
      const station = s.hunters[h.id].station;
      if (!s.hunters[h.id].recruited || !station || station === s.area) continue;
      this.accrue(station, this.farmRates(station, [h.id], STATION_EFFICIENCY), dt);
    }
  }

  /** Field calls this for every enemy killed. */
  registerKill(type: EnemyId, boss: boolean, shooter: Shooter = 'main'): KillReward {
    const s = this.state;
    const e = this.enemyStats(type);
    s.stats.totalKills++;
    if (boss) {
      const gold = areaDef(s.area).gold * GUARDIAN_GOLD_MULT * this.goldMult;
      s.gold += gold;
      s.stats.totalGold += gold;
      s.materials[e.material] += BOSS_MATERIAL_DROP;
      s.stats.guardians++;
      const next = this.lockedNext;
      this.endGuardian();
      if (next) {
        s.areas[next].unlocked = true;
        this.emit({ type: 'areaUnlocked', area: next });
      }
      return { gold, material: e.material, amount: BOSS_MATERIAL_DROP };
    }
    const gold = e.gold * this.shooterGold(shooter);
    s.gold += gold;
    s.stats.totalGold += gold;
    const chance = e.dropChance * this.shooterDrops(shooter);
    const amount = Math.floor(chance) + (this.rng() < chance % 1 ? 1 : 0);
    s.materials[e.material] += amount;
    s.areas[enemyDef(type).area].kills++;
    return { gold, material: amount > 0 ? e.material : null, amount };
  }

  /** Field calls this when a fleeing enemy leaves the screen with its loot. */
  registerEscape(): void {
    this.escapesHere++;
    this.state.stats.escaped++;
  }

  registerTap(): void {
    this.state.stats.taps++;
  }

  // ---- Background farming ----

  /**
   * Expected yield per second of `shooters` farming `area`. If the horde brings
   * more (bonus-adjusted) HP per second than they can deal, the rest escape.
   */
  farmRates(area: AreaId, shooters: Shooter[], efficiency = 1): FarmRates {
    const roster = this.roster(area);
    const out: FarmRates = { kills: {}, killsTotal: 0, gold: 0, materials: {} };
    if (!shooters.length || !roster.length) return out;
    // Seconds of combined fire needed per second of spawns.
    let load = 0;
    for (const e of roster) {
      const dps = shooters.reduce((sum, sh) => sum + this.dpsOf(sh, e.archetype), 0);
      load += dps > 0 ? (e.spawnRate * e.hp) / dps : Infinity;
    }
    const fraction = Math.min(1, 1 / load) * efficiency;
    // Gold/drop perks apply in proportion to each shooter's share of the damage.
    const total = shooters.reduce((sum, sh) => sum + this.dpsOf(sh), 0) || 1;
    const goldPerk = shooters.reduce((sum, sh) => sum + (this.dpsOf(sh) / total) * this.shooterGold(sh), 0);
    const dropPerk = shooters.reduce((sum, sh) => sum + (this.dpsOf(sh) / total) * this.shooterDrops(sh), 0);
    for (const e of roster) {
      const k = e.spawnRate * fraction;
      out.kills[e.id] = k;
      out.killsTotal += k;
      out.gold += k * e.gold * goldPerk;
      out.materials[e.material] = (out.materials[e.material] ?? 0) + k * e.dropChance * dropPerk;
    }
    return out;
  }

  /** Applies `seconds` of farming yield, carrying fractions so slow trickles still pay out. */
  private accrue(area: AreaId, rates: FarmRates, seconds: number): { kills: number; gold: number; materials: Partial<Record<MaterialId, number>> } {
    const s = this.state;
    const take = (key: string, amount: number) => {
      const v = (this.farmAcc.get(key) ?? 0) + amount;
      const whole = Math.floor(v);
      this.farmAcc.set(key, v - whole);
      return whole;
    };
    let kills = 0;
    for (const [id, rate] of Object.entries(rates.kills) as [EnemyId, number][]) kills += take(`${area}:k:${id}`, rate * seconds);
    const gold = rates.gold * seconds;
    const materials: Partial<Record<MaterialId, number>> = {};
    for (const [m, rate] of Object.entries(rates.materials) as [MaterialId, number][]) {
      const n = take(`${area}:m:${m}`, rate * seconds);
      if (n > 0) {
        s.materials[m] += n;
        materials[m] = n;
      }
    }
    s.gold += gold;
    s.stats.totalGold += gold;
    s.stats.totalKills += kills;
    s.areas[area].kills += kills;
    return { kills, gold, materials };
  }

  // ---- Main Hunter training ----

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

  // ---- Hunters ----

  canRecruit(id: HunterId): boolean {
    const def = hunterDef(id);
    return !this.state.hunters[id].recruited && this.isAreaUnlocked(def.area) && this.state.gold >= def.recruitCost;
  }

  recruit(id: HunterId): boolean {
    if (!this.canRecruit(id)) return false;
    this.state.gold -= hunterDef(id).recruitCost;
    this.state.hunters[id].recruited = true;
    this.emit({ type: 'recruit', hunter: id });
    return true;
  }

  hunterPurchase(id: HunterId, amount: BuyAmount = this.state.buyAmount): Purchase {
    const def = hunterDef(id);
    const level = this.state.hunters[id].level;
    const base = helperLevelCost(def, 0);
    const count = amount === 'max' ? Math.max(1, maxAffordable(base, HELPER_LEVEL_GROWTH, level, this.state.gold)) : amount;
    return { count, cost: bulkCost(base, HELPER_LEVEL_GROWTH, level, count) };
  }

  levelHunter(id: HunterId): boolean {
    const h = this.state.hunters[id];
    const p = this.hunterPurchase(id);
    if (!h.recruited || this.state.gold < p.cost) return false;
    this.state.gold -= p.cost;
    h.level += p.count;
    return true;
  }

  /** Who's stationed in an area (at most one Hunter per area). */
  stationedAt(area: AreaId): HunterId | null {
    return HUNTERS.find((h) => this.state.hunters[h.id].recruited && this.state.hunters[h.id].station === area)?.id ?? null;
  }

  /** Station a Hunter in an area (or pass null to call them back). Swaps out whoever was there. */
  station(id: HunterId, area: AreaId | null): boolean {
    const h = this.state.hunters[id];
    if (!h.recruited || (area && !this.isAreaUnlocked(area))) return false;
    if (area) {
      const current = this.stationedAt(area);
      if (current && current !== id) this.state.hunters[current].station = null;
    }
    h.station = area;
    return true;
  }

  /** Recruited Hunters fighting next to you in the current area. */
  get helpersHere(): HunterId[] {
    const here = this.stationedAt(this.state.area);
    return here ? [here] : [];
  }

  // ---- Bestiary ----

  unlockEnemy(id: EnemyId): boolean {
    const def = enemyDef(id);
    const b = this.state.bestiary[id];
    const cost = enemyUnlockCost(def);
    if (b.unlocked || !this.isAreaUnlocked(def.area) || this.state.gold < cost) return false;
    this.state.gold -= cost;
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
    if (!this.isUnlocked(id) || this.state.gold < cost) return false;
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

  // ---- Offline & minigames ----

  /** Applies progress for time spent away: you (plus anyone stationed with you) and every stationed Hunter. */
  applyOffline(now = Date.now()): OfflineResult {
    const s = this.state;
    const frenzyWas = s.frenzyTime;
    s.frenzyTime = 0; // offline progress never benefits from Frenzy
    const { away, seconds } = capAway((now - s.lastSeen) / 1000);
    const result: OfflineResult = { away, seconds, kills: 0, gold: 0, materials: {} };
    const add = (r: ReturnType<Game['accrue']>) => {
      result.kills += r.kills;
      result.gold += r.gold;
      for (const [m, n] of Object.entries(r.materials) as [MaterialId, number][]) result.materials[m] = (result.materials[m] ?? 0) + n;
    };
    add(this.accrue(s.area, this.farmRates(s.area, ['main', ...this.helpersHere], OFFLINE_EFFICIENCY), seconds));
    for (const h of HUNTERS) {
      const station = s.hunters[h.id].station;
      if (!s.hunters[h.id].recruited || !station || station === s.area) continue;
      add(this.accrue(station, this.farmRates(station, [h.id], STATION_EFFICIENCY * OFFLINE_EFFICIENCY), seconds));
    }
    s.frenzyTime = Math.max(0, frenzyWas - away);
    regenTickets(s, away);
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
    return ENEMIES.filter((e) => this.isUnlocked(e.id)).map((e) => e.material);
  }

  grantMinigame(p: MinigamePayout): MinigameReward {
    const s = this.state;
    const u = Math.max(0, Math.floor(p.units));
    const gold = u * MINIGAME_GOLD_PER_UNIT * this.enemyStats(areaEnemies(s.area)[0].id).gold;
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
