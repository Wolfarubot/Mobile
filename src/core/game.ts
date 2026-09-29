import {
  typeMult,
  type DamageType,
  slotAccepts,
  WEAPON_KINDS,
  areaDef,
  areaEnemies,
  AREAS,
  BASE_CRIT_CHANCE,
  BASE_DROP_CHANCE,
  BASE_FIRE_RATE,
  BOSS_MATERIAL_DROP,
  DEFAULT_SLOTS,
  BOSS_STUN_TIME,
  BOUNTY_DROP_PER_LEVEL,
  BOUNTY_GOLD_PER_LEVEL,
  BOUNTY_SPEED_PER_LEVEL,
  bulkCost,
  CRIT_MULT,
  ENEMY_UPGRADE_MAX,
  enemyDef,
  eventDef,
  EVENTS,
  enemyUnlockCost,
  enemyUpgradeCost,
  GEAR_MAX_LEVEL,
  GEAR_STUN_CAP,
  gearCost,
  gearDef,
  gearStats,
  GUARDIAN_GOLD_MULT,
  GUARD_RECHARGE,
  GUARDIAN_TIME,
  HELPER_FIRE_RATE,
  HELPER_TRAIN_GROWTH,
  helperTrainCost,
  levelFromTrains,
  MAIN_TRAIN_COST,
  MAIN_TRAIN_GROWTH,
  hunterDef,
  HUNTERS,
  itemCost,
  itemDef,
  MAIN_RANGE,
  maxAffordable,
  nextAreaOf,
  OFFLINE_EFFICIENCY,
  powerDamage,
  SALVAGE_REFUND,
  STATION_CAPACITY,
  STATION_EFFICIENCY,
  STUN_IMMUNITY,
  STUN_TIME,
  SWARM_PER_LEVEL,
  SKILL_RECOVERY,
  TAP_DAMAGE_MULT,
  TAP_RADIUS,
  type AreaId,
  type Archetype,
  type EnemyId,
  type EnemyUpgrade,
  type GearId,
  type GearStat,
  type HunterId,
  type ItemId,
  type MaterialId,
  type SlotDef,
  skillNode,
  SKILL_TREES,
  type SkillNode,
  type TreeStat,
} from './balance';
import { capAway, type OfflineResult } from './offline';
import { type BuyAmount, type GameState, type GearItem, type Training, type Wearer } from './state';

export type GameEvent =
  | { type: 'travel' }
  | { type: 'guardianChallenge' }
  | { type: 'guardianFail' }
  | { type: 'areaUnlocked'; area: AreaId }
  | { type: 'unlock'; enemy: EnemyId }
  | { type: 'recruit'; hunter: HunterId }
  | { type: 'eventStart'; event: string }
  | { type: 'eventEnd'; event: string }
  | { type: 'eventComplete'; event: string };

/** Wilhelm's two weapon slots: 'long' powers sniper shots, 'short' his akimbo pistols. */
export type GearMode = 'long' | 'short';

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
  /** Times per second each Hunter gets stunned by monsters slipping through. */
  stuns: Partial<Record<Shooter, number>>;
  /** Fraction of the time each Hunter spends stunned (0..1). */
  stunned: Partial<Record<Shooter, number>>;
  /** Each Hunter's share of the kills (by damage dealt). */
  share: Partial<Record<Shooter, number>>;
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
  /** A timed event (e.g. Slime Swarm) running in the current area. */
  activeEvent: { id: string; left: number } | null = null;
  /** Fractional kills/drops accumulated by stationed Hunters, per area+enemy. */
  private farmAcc = new Map<string, number>();
  /** Stationed Hunters' farm rates, refreshed about once a second (the model iterates, so don't redo it every frame). */
  private stationRates = new Map<AreaId, { key: string; rates: FarmRates; age: number }>();
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

  /** Upgrades boost every Hunter. */
  get itemDamageMult(): number {
    return (1 + 0.25 * this.item('whetstone')) * 1.5 ** this.item('engine');
  }

  get itemRateMult(): number {
    return (1 + 0.1 * this.item('gloves')) * (1 + 0.05 * this.item('engine'));
  }

  /** Your main Hunter's damage per shot. */
  get damage(): number {
    return powerDamage(this.state.main.trains) * this.skillDamageMult('main') * this.itemDamageMult * (1 + this.gear('main').damage);
  }

  get fireRate(): number {
    return BASE_FIRE_RATE * this.skillRateMult('main') * this.itemRateMult * (1 + this.gear('main').rate);
  }

  /** Damage of a tap blast (Tap Power nodes). */
  get tapDamage(): number {
    return this.damage * TAP_DAMAGE_MULT * (1 + this.tree('main').tapPower);
  }

  /** Radius of a tap blast in world units (Tap Size nodes). */
  get tapRadius(): number {
    return TAP_RADIUS * (1 + this.tree('main').tapSize);
  }

  private skillDamageMult(who: Wearer): number {
    return 1 + this.tree(who).damage;
  }

  private skillRateMult(who: Wearer): number {
    return 1 + this.tree(who).rate;
  }

  /** Everything a Hunter's learned skill-tree nodes add up to. */
  tree(who: Wearer): Record<TreeStat, number> {
    const out: Record<TreeStat, number> = { damage: 0, rate: 0, recovery: 0, crit: 0, range: 0, pierce: 0, radius: 0, bane: 0, guard: 0, rally: 0, gold: 0, drops: 0, tapPower: 0, tapSize: 0 };
    const skills = this.training(who).skills;
    for (const node of SKILL_TREES[who]) {
      const rank = skills[node.id] ?? 0;
      if (rank > 0) for (const [k, v] of Object.entries(node.effect) as [TreeStat, number][]) out[k] += v * rank;
    }
    return out;
  }

  get projectiles(): number {
    return 1 + this.item('splitbow');
  }

  get pierce(): number {
    return this.item('lance');
  }

  /** Camp-wide crit chance (Soul Lantern); gear adds per Hunter via critChanceOf. */
  get critChance(): number {
    return BASE_CRIT_CHANCE + 0.04 * this.item('lantern');
  }

  critChanceOf(shooter: Shooter): number {
    return this.critChance + this.gear(shooter).crit + this.tree(shooter).crit;
  }

  private critFactor(shooter: Shooter): number {
    return 1 + this.critChanceOf(shooter) * (CRIT_MULT - 1);
  }

  /** Extra enemies each shot passes through (Frost Lance + gear). */
  pierceOf(shooter: Shooter, mode?: GearMode): number {
    return this.pierce + Math.floor(this.gear(shooter, mode).pierce) + this.tree(shooter).pierce;
  }

  /** Multiplier on a Hunter's area effects (fireballs, puddles, novas). */
  radiusMult(shooter: Shooter): number {
    return 1 + this.gear(shooter).radius + this.tree(shooter).radius;
  }

  /** Shield charges before a Hunter is stunned (skill tree, e.g. Lance's Zone of Protection + gear + rallies). */
  guardOf(shooter: Shooter): number {
    return this.tree(shooter).guard + Math.floor(this.gear(shooter).guard) + this.rallyFor(shooter);
  }

  /** Shield charges granted to `shooter` by other recruited Hunters' rally nodes (Lance's Rallying Oath). */
  rallyFor(shooter: Shooter): number {
    let n = 0;
    for (const h of HUNTERS) if (h.id !== shooter && this.state.hunters[h.id].recruited) n += this.tree(h.id).rally;
    return n;
  }

  /** Enemies this Hunter has defeated (on the field, stationed and offline). */
  killsBy(who: Shooter): number {
    return this.state.stats.hunterKills[who] ?? 0;
  }

  /**
   * Seconds a Hunter is stunned when an enemy reaches them. Their Recovery Speed skill and armor and other
   * gear reduce it per Hunter; Bone Mail helps everyone.
   */
  stunTime(boss = false, shooter: Shooter = 'main'): number {
    const recovery = SKILL_RECOVERY ** this.tree(shooter).recovery;
    const gear = 1 - Math.min(GEAR_STUN_CAP, this.gear(shooter).stun);
    return (boss ? BOSS_STUN_TIME : STUN_TIME) * recovery * 0.88 ** this.item('bonemail') * gear;
  }

  get goldMult(): number {
    return 1 + 0.25 * this.item('idol');
  }

  /**
   * Damage per shot of any Hunter against an archetype (archetype bonuses and gear included).
   * `mode` picks Wilhelm's weapon: 'long' (sniper, default) or 'short' (akimbo).
   */
  shotDamage(shooter: Shooter, archetype?: Archetype, mode?: GearMode): number {
    if (shooter === 'main') return this.damage;
    const def = hunterDef(shooter);
    const bane = def.bane && def.bane.archetype === archetype ? def.bane.mult + this.tree(shooter).bane : 1;
    return powerDamage(this.state.hunters[shooter].trains) * this.skillDamageMult(shooter) * this.itemDamageMult * def.style.damage * bane * (1 + this.gear(shooter, mode).damage);
  }

  /** Attacks per second. */
  shooterRate(shooter: Shooter, mode?: GearMode): number {
    if (shooter === 'main') return this.fireRate;
    return HELPER_FIRE_RATE * hunterDef(shooter).style.rate * this.skillRateMult(shooter) * this.itemRateMult * (1 + this.gear(shooter, mode).rate);
  }

  /** How far a Hunter can attack, in world units. */
  shooterRange(shooter: Shooter, mode?: GearMode): number {
    return (shooter === 'main' ? MAIN_RANGE : hunterDef(shooter).style.range) + this.gear(shooter, mode).range + this.tree(shooter).range;
  }

  /**
   * Expected damage per second of a Hunter against an archetype, ignoring overkill, travel time and stuns.
   * Each attack style has a `farm` factor for how well it works against a crowd (AoE > 1).
   */
  dpsOf(shooter: Shooter, archetype?: Archetype): number {
    const style = shooter === 'main' ? null : hunterDef(shooter).style;
    const perAttack = (style?.pellets ?? 1) * this.projectiles * (style?.farm ?? 1);
    return this.shotDamage(shooter, archetype) * (this.shooterRate(shooter) * perAttack + this.specialHitRate(shooter)) * this.critFactor(shooter);
  }

  /**
   * The damage type a Hunter deals: their weapon's (for Wilhelm, the weapon of that mode), or their own
   * when the slot is empty or holds an untyped piece. Specials always use the Hunter's own type.
   */
  damageTypeOf(who: Shooter, mode: GearMode = 'long', special = false): DamageType {
    const own: DamageType = who === 'main' ? 'physical' : hunterDef(who).style.damageType;
    if (special) return own;
    const slots = this.slotsOf(who);
    const items = this.equipped(who);
    const i = slots.findIndex((sl) => WEAPON_KINDS.includes(sl.kind) && (!sl.role || sl.role === mode));
    const item = i >= 0 ? items[i] : null;
    return (item && gearDef(item.base).damageType) || own;
  }

  /**
   * Average damage-type multiplier of a Hunter against an enemy (weakness/resistance), blending their normal
   * attacks and their special by how much of their damage each deals. Used by the background model.
   */
  typeMultVs(shooter: Shooter, enemy: EnemyId): number {
    const normal = typeMult(this.damageTypeOf(shooter), enemy);
    const sp = this.specialHitRate(shooter);
    if (!sp) return normal;
    const style = hunterDef(shooter as HunterId).style;
    const shots = this.shooterRate(shooter) * (style.pellets ?? 1) * this.projectiles * style.crowd;
    return (shots * normal + sp * typeMult(this.damageTypeOf(shooter, 'long', true), enemy)) / (shots + sp);
  }

  // ---- Special attacks (Mira's potions, Glimmer's fireballs) ----

  /** Stats of the piece in a Hunter's weapon slot (zeros when empty). Its damage and attack rate power their special. */
  weaponStats(who: Shooter): Partial<Record<GearStat, number>> {
    const slots = this.slotsOf(who);
    const i = slots.findIndex((sl) => WEAPON_KINDS.includes(sl.kind));
    const item = i >= 0 ? this.equipped(who)[i] : null;
    return item ? gearStats(gearDef(item.base), item.level) : {};
  }

  /** Seconds between special attacks, or null if the Hunter has none. */
  specialCooldown(shooter: Shooter): number | null {
    return shooter === 'main' ? null : (hunterDef(shooter).style.special?.cooldown ?? null);
  }

  /** Multiplier on shot damage for each hit of the special: its base × (1 + weapon damage). */
  specialDamageMult(shooter: Shooter): number {
    const sp = shooter === 'main' ? undefined : hunterDef(shooter).style.special;
    return sp ? sp.damage * (1 + (this.weaponStats(shooter).damage ?? 0)) : 0;
  }

  /** Radius of the special: its base × (1 + weapon attack rate) × area bonuses (skills, gear). */
  specialRadius(shooter: Shooter): number {
    const sp = shooter === 'main' ? undefined : hunterDef(shooter).style.special;
    return sp ? sp.radius * (1 + (this.weaponStats(shooter).rate ?? 0)) * this.radiusMult(shooter) : 0;
  }

  /** The special's damage in shot-equivalents per second against a crowd (for DPS and the farm model). */
  private specialHitRate(shooter: Shooter): number {
    const sp = shooter === 'main' ? undefined : hunterDef(shooter).style.special;
    if (!sp) return 0;
    // Wider specials catch more of the crowd.
    const reach = this.specialRadius(shooter) / sp.radius;
    return (sp.ticks * sp.crowd * reach * this.specialDamageMult(shooter)) / sp.cooldown;
  }

  /** Your main Hunter's DPS. */
  get dps(): number {
    return this.dpsOf('main');
  }

  private shooterGold(shooter: Shooter): number {
    return (shooter === 'main' ? 1 : (hunterDef(shooter).gold ?? 1)) * (1 + this.gear(shooter).gold + this.tree(shooter).gold);
  }

  private shooterDrops(shooter: Shooter): number {
    return (shooter === 'main' ? 1 : (hunterDef(shooter).drops ?? 1)) * (1 + this.gear(shooter).drops + this.tree(shooter).drops);
  }

  // ---- Equipment ----

  /** A Hunter's equipment slots. */
  slotsOf(who: Wearer): SlotDef[] {
    return who === 'main' ? DEFAULT_SLOTS : (hunterDef(who).slots ?? DEFAULT_SLOTS);
  }

  gearItem(uid: number): GearItem | undefined {
    return this.state.inventory.find((g) => g.uid === uid);
  }

  /** The gear in each of a Hunter's slots (null = empty). */
  equipped(who: Wearer): Array<GearItem | null> {
    const uids = this.state.equipment[who] ?? [];
    return this.slotsOf(who).map((_, i) => (uids[i] != null ? (this.gearItem(uids[i]!) ?? null) : null));
  }

  /** Who is wearing a piece (and in which slot), if anyone. */
  wearerOf(uid: number): { who: Wearer; slot: number } | null {
    for (const [who, uids] of Object.entries(this.state.equipment) as [Wearer, Array<number | null>][]) {
      const slot = uids.indexOf(uid);
      if (slot >= 0) return { who, slot };
    }
    return null;
  }

  /**
   * Summed gear stats of a Hunter. Slots with a role (Wilhelm's long/short weapons) only count in
   * their mode; with no mode given, the 'long' (default) weapon counts.
   */
  gear(who: Shooter, mode: GearMode = 'long'): Record<GearStat, number> {
    const total: Record<GearStat, number> = { damage: 0, rate: 0, range: 0, crit: 0, stun: 0, guard: 0, gold: 0, drops: 0, radius: 0, pierce: 0 };
    const slots = this.slotsOf(who);
    this.equipped(who).forEach((item, i) => {
      if (!item || (slots[i].role && slots[i].role !== mode)) return;
      for (const [k, v] of Object.entries(gearStats(gearDef(item.base), item.level)) as [GearStat, number][]) total[k] += v;
    });
    return total;
  }

  canCraftGear(id: GearId): boolean {
    return this.hasMaterials(gearCost(gearDef(id), 0));
  }

  /** Crafts a new level-1 piece into the inventory. */
  craftGear(id: GearId): GearItem | null {
    if (!this.canCraftGear(id)) return null;
    this.spend(gearCost(gearDef(id), 0));
    const item: GearItem = { uid: this.state.nextGearUid++, base: id, level: 1 };
    this.state.inventory.push(item);
    return item;
  }

  gearUpgradeCost(uid: number): Partial<Record<MaterialId, number>> | null {
    const item = this.gearItem(uid);
    if (!item || item.level >= GEAR_MAX_LEVEL) return null;
    return gearCost(gearDef(item.base), item.level);
  }

  upgradeGear(uid: number): boolean {
    const cost = this.gearUpgradeCost(uid);
    if (!cost || !this.hasMaterials(cost)) return false;
    this.spend(cost);
    this.gearItem(uid)!.level++;
    return true;
  }

  /** Materials returned for salvaging a piece: half of everything spent on it. */
  salvageValue(uid: number): Partial<Record<MaterialId, number>> {
    const item = this.gearItem(uid);
    const out: Partial<Record<MaterialId, number>> = {};
    if (!item) return out;
    for (let l = 0; l < item.level; l++)
      for (const [m, n] of Object.entries(gearCost(gearDef(item.base), l)) as [MaterialId, number][]) out[m] = (out[m] ?? 0) + n;
    for (const m of Object.keys(out) as MaterialId[]) out[m] = Math.floor(out[m]! * SALVAGE_REFUND);
    return out;
  }

  /** Destroys a piece for some of its materials (it's unequipped first). */
  salvageGear(uid: number): boolean {
    if (!this.gearItem(uid)) return false;
    const refund = this.salvageValue(uid);
    const worn = this.wearerOf(uid);
    if (worn) this.state.equipment[worn.who]![worn.slot] = null;
    for (const [m, n] of Object.entries(refund) as [MaterialId, number][]) this.state.materials[m] += n;
    this.state.inventory = this.state.inventory.filter((g) => g.uid !== uid);
    return true;
  }

  /** Can this Hunter wear gear right now? (you always can; others once recruited) */
  canWear(who: Wearer): boolean {
    return who === 'main' || this.state.hunters[who].recruited;
  }

  /**
   * Puts a piece into a Hunter's slot (null empties it). The piece must fit the slot's kind;
   * if someone else was wearing it, it moves over.
   */
  equip(who: Wearer, slot: number, uid: number | null): boolean {
    const slots = this.slotsOf(who);
    if (!this.canWear(who) || slot < 0 || slot >= slots.length) return false;
    if (uid !== null) {
      const item = this.gearItem(uid);
      if (!item || !slotAccepts(slots[slot], gearDef(item.base).kind)) return false;
      const worn = this.wearerOf(uid);
      if (worn) this.state.equipment[worn.who]![worn.slot] = null;
    }
    const list = (this.state.equipment[who] ??= slots.map(() => null));
    while (list.length < slots.length) list.push(null);
    list[slot] = uid;
    return true;
  }

  private hasMaterials(cost: Partial<Record<MaterialId, number>>): boolean {
    return (Object.entries(cost) as [MaterialId, number][]).every(([m, n]) => this.state.materials[m] >= n);
  }

  private spend(cost: Partial<Record<MaterialId, number>>): void {
    for (const [m, n] of Object.entries(cost) as [MaterialId, number][]) this.state.materials[m] -= n;
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

  /** The Guardian Challenge for this area can be started now. */
  get guardianReady(): boolean {
    return this.eventReady(`guardian-${this.state.area}`);
  }

  /** The Guardian is a giant version of the area's rarest monster. */
  get guardianType(): EnemyId {
    const list = areaEnemies(this.state.area);
    return list[list.length - 1].id;
  }

  get guardianHp(): number {
    return areaDef(this.state.area).guardian;
  }

  travel(id: AreaId): boolean {
    if (!this.isAreaUnlocked(id) || id === this.state.area) return false;
    this.state.area = id;
    this.endGuardian();
    this.endEvent();
    this.emit({ type: 'travel' });
    return true;
  }

  /** Starts this area's Guardian Challenge event. */
  challengeGuardian(): boolean {
    return this.startEvent(`guardian-${this.state.area}`);
  }

  // ---- Events ----

  /** Unlocked once enough monsters have been slain in its area (and the area is open). */
  eventUnlocked(id: string): boolean {
    const def = EVENTS.find((e) => e.id === id); // e.g. the final area has no Guardian Challenge
    return !!def && this.isAreaUnlocked(def.area) && this.state.areas[def.area].kills >= def.unlockKills;
  }

  eventCooldown(id: string): number {
    return Math.max(0, this.state.events[id]?.cooldown ?? 0);
  }

  /** Something (a Guardian or a timed event) is running right now. */
  get eventRunning(): boolean {
    return this.guardianActive || this.activeEvent !== null;
  }

  eventReady(id: string): boolean {
    return this.eventUnlocked(id) && this.eventCooldown(id) <= 0 && !this.eventRunning;
  }

  /** Starts an event, travelling to its area first. Its cooldown starts now. */
  startEvent(id: string): boolean {
    if (!this.eventReady(id)) return false;
    const def = eventDef(id);
    if (def.area !== this.state.area) this.travel(def.area);
    const st = this.state.events[id];
    st.cooldown = def.cooldown;
    st.runs++;
    if (def.kind === 'guardian') {
      this.guardianActive = true;
      this.emit({ type: 'guardianChallenge' });
    } else {
      this.activeEvent = { id, left: def.duration };
    }
    this.emit({ type: 'eventStart', event: id });
    return true;
  }

  /** Ends the running timed event; `completed` if it ran its full length. */
  private endEvent(completed = false): void {
    if (!this.activeEvent) return;
    const id = this.activeEvent.id;
    this.activeEvent = null;
    if (completed) this.completeEvent(id);
    this.emit({ type: 'eventEnd', event: id });
  }

  private completeEvent(id: string): void {
    const st = this.state.events[id];
    if (!st) return;
    st.completed++;
    this.emit({ type: 'eventComplete', event: id });
  }

  /** The Events tab opens once the first Guardian Challenge unlocks (and stays open). */
  get eventsOpen(): boolean {
    return this.state.flags.eventsIntro || this.eventUnlocked('guardian-forest') || this.isAreaUnlocked('graveyard');
  }

  /** Times an event has been completed (Guardians beaten, swarms survived). */
  eventCompletions(id: string): number {
    return this.state.events[id]?.completed ?? 0;
  }

  /** Counts down every event's cooldown (also used for time away). */
  private coolEvents(seconds: number): void {
    for (const st of Object.values(this.state.events)) st.cooldown = Math.max(0, st.cooldown - seconds);
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
    // A swarm event here: only its archetype spawns, more of them and faster.
    const ev = this.activeEvent && def.area === this.state.area ? eventDef(this.activeEvent.id) : null;
    const swarm = ev?.kind === 'swarm' ? (def.archetype === ev.archetype ? { spawn: ev.spawnMult ?? 1, speed: ev.speedMult ?? 1 } : { spawn: 0, speed: 1 }) : { spawn: 1, speed: 1 };
    return {
      id,
      archetype: def.archetype,
      hp: area.hp * def.hp,
      speed: area.speed * def.speed * (1 + BOUNTY_SPEED_PER_LEVEL * b.bounty) * swarm.speed,
      gold: area.gold * def.gold * (1 + BOUNTY_GOLD_PER_LEVEL * b.bounty) * this.goldMult,
      spawnRate: b.unlocked ? def.spawn * (1 + SWARM_PER_LEVEL * b.swarm) * (1 + 0.2 * this.item('lure')) * swarm.spawn : 0,
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
    this.coolEvents(dt);
    if (this.activeEvent) {
      this.activeEvent.left -= dt;
      if (this.activeEvent.left <= 0) this.endEvent(true);
    }
    if (this.bossAlive) {
      this.bossTimer -= dt;
      if (this.bossTimer <= 0) {
        this.endGuardian();
        this.emit({ type: 'guardianFail' });
      }
    }
    // Hunters stationed elsewhere keep farming in the background, together per area.
    for (const area of AREAS) {
      if (area.id === s.area) continue;
      const group = this.stationedIn(area.id);
      if (!group.length) continue;
      const key = group.join(',');
      let cached = this.stationRates.get(area.id);
      if (!cached || cached.key !== key || cached.age >= 1) {
        cached = { key, rates: this.farmRates(area.id, group, STATION_EFFICIENCY), age: 0 };
        this.stationRates.set(area.id, cached);
      }
      cached.age += dt;
      this.accrue(area.id, cached.rates, dt);
    }
  }

  /** Field calls this for every enemy killed. */
  registerKill(type: EnemyId, boss: boolean, shooter: Shooter = 'main'): KillReward {
    const s = this.state;
    const e = this.enemyStats(type);
    s.stats.totalKills++;
    s.stats.hunterKills[shooter] = (s.stats.hunterKills[shooter] ?? 0) + 1;
    if (boss) {
      const gold = areaDef(s.area).gold * GUARDIAN_GOLD_MULT * this.goldMult;
      s.gold += gold;
      s.stats.totalGold += gold;
      s.areas[s.area].gold += gold;
      s.materials[e.material] += BOSS_MATERIAL_DROP;
      s.stats.guardians++;
      const next = this.lockedNext;
      this.endGuardian();
      this.completeEvent(`guardian-${s.area}`);
      if (next) {
        s.areas[next].unlocked = true;
        this.emit({ type: 'areaUnlocked', area: next });
      }
      return { gold, material: e.material, amount: BOSS_MATERIAL_DROP };
    }
    const gold = e.gold * this.shooterGold(shooter);
    s.gold += gold;
    s.stats.totalGold += gold;
    s.areas[enemyDef(type).area].gold += gold;
    const chance = e.dropChance * this.shooterDrops(shooter);
    const amount = Math.floor(chance) + (this.rng() < chance % 1 ? 1 : 0);
    s.materials[e.material] += amount;
    s.areas[enemyDef(type).area].kills++;
    return { gold, material: amount > 0 ? e.material : null, amount };
  }

  /** Field calls this when a fleeing enemy leaves the screen with its loot. */
  registerEscape(): void {
    this.state.stats.escaped++;
    this.state.areas[this.state.area].escaped++;
  }

  /** Field calls this when a monster knocks out (stuns) a Hunter here. */
  registerKnockout(): void {
    this.state.areas[this.state.area].knockouts++;
  }

  registerTap(): void {
    this.state.stats.taps++;
  }

  // ---- Background farming ----

  /**
   * Expected yield per second of `shooters` farming `area`, modelling the same pressure as the live field
   * (calibrated against it in tests/calibrate.test.ts):
   *
   * 1. Kills are limited by *shots*, not just damage: every monster needs at least one hit, so a
   *    Hunter's kill rate is shots/s ÷ hits-per-kill (area attacks count for more via their `crowd` factor).
   * 2. A monster walks for `range / speed` seconds between entering the Hunters' range and reaching them.
   *    It slips through if the Hunters can't keep up overall, or can't clear a whole pack in that window.
   * 3. A monster that slips through stuns a Hunter (shields absorb some). Stuns don't stack: monsters
   *    arriving while they're dazed or immune just run off. With arrivals at rate λ and stun time T,
   *    a Hunter is down T out of every T + immunity + 1/λ seconds.
   * 4. When overwhelmed, damage is wasted on monsters that get away half-dead (more so when kills take many hits).
   * 5. Stunned Hunters don't attack, so more slips through. We iterate that feedback to a steady state.
   *
   * So Hunters that are too weak for an area spend most of their time stunned and earn little,
   * online or offline. `efficiency` scales the result (stationing / offline rates).
   */
  farmRates(area: AreaId, shooters: Shooter[], efficiency = 1): FarmRates {
    const roster = this.roster(area);
    const out: FarmRates = { kills: {}, killsTotal: 0, gold: 0, materials: {}, stuns: {}, stunned: {}, share: {} };
    if (!shooters.length || !roster.length) return out;

    const hunters = shooters.map((sh) => {
      const style = sh === 'main' ? null : hunterDef(sh).style;
      return {
        sh,
        stunTime: this.stunTime(false, sh),
        // A shield regains one charge every GUARD_RECHARGE seconds, however many it holds.
        guardRate: this.guardOf(sh) > 0 ? 1 / GUARD_RECHARGE : 0,
        /** Effective hits per second, counting pellets, Split Bow and how many monsters each attack reaches. */
        shots: this.shooterRate(sh) * (style?.pellets ?? 1) * this.projectiles * (style?.crowd ?? 1) + this.specialHitRate(sh),
        down: 0, // fraction of time stunned
        stunRate: 0,
      };
    });
    const range = Math.max(...shooters.map((sh) => this.shooterRange(sh)));
    const packs = new Map(roster.map((e) => [e.id, (enemyDef(e.id).pack[0] + enemyDef(e.id).pack[1]) / 2]));
    // Hits each Hunter needs to kill one of each enemy type (crits averaged in).
    const hitsToKill = (sh: Shooter, e: EnemyStats) => {
      const dmg = this.shotDamage(sh, e.archetype) * this.typeMultVs(sh, e.id) * this.critFactor(sh);
      return dmg > 0 ? Math.max(1, Math.ceil(e.hp / dmg - 1e-9)) : Infinity;
    };
    const hits = new Map(roster.map((e) => [e.id, hunters.map((h) => hitsToKill(h.sh, e))]));

    let killFrac = new Map<EnemyId, number>();
    for (let iter = 0; iter < 24; iter++) {
      // Kills per second the group manages if it focuses one enemy type.
      const killRate = (e: EnemyStats) => hunters.reduce((sum, h, i) => sum + (h.shots * (1 - h.down)) / hits.get(e.id)![i], 0);
      // Seconds of combined fire needed per second of spawns (> 1 means overwhelmed).
      let load = 0;
      for (const e of roster) {
        const k = killRate(e);
        load += k > 0 ? e.spawnRate / k : Infinity;
      }
      const capacity = Math.min(1, 1 / load);
      killFrac = new Map();
      let leak = 0;
      for (const e of roster) {
        const window = range / Math.max(1, e.speed);
        const burst = Math.min(1, (window * killRate(e)) / packs.get(e.id)!);
        // When overwhelmed, hits spread over monsters that then run off half-dead: that damage is wasted.
        // The waste grows with how many hits a kill takes and how swamped the Hunters are:
        // f → f^(1 + (1−f)²·(1 − 1/hits)). One-hit kills waste nothing. Calibrated against the live field.
        const reach = Math.max(0, Math.min(capacity, burst));
        const h = Math.min(...hits.get(e.id)!);
        const f = reach ** (1 + (1 - reach) ** 2 * (1 - 1 / h));
        killFrac.set(e.id, f);
        leak += e.spawnRate * (1 - f);
      }
      // Leaks spread across the Hunters; shields soak some. A stun runs its course, then immunity,
      // then the next arrival stuns again: one cycle lasts T + immunity + 1/λ.
      for (const h of hunters) {
        const lambda = Math.max(0, leak / hunters.length - h.guardRate);
        let down = 0;
        h.stunRate = 0;
        if (lambda > 1e-9) {
          const cycle = h.stunTime + STUN_IMMUNITY + 1 / lambda;
          down = h.stunTime / cycle;
          h.stunRate = 1 / cycle;
        }
        h.down = 0.5 * h.down + 0.5 * down; // damped to converge
      }
    }

    // Gold/drop perks apply in proportion to each shooter's share of the damage.
    const total = shooters.reduce((sum, sh) => sum + this.dpsOf(sh), 0) || 1;
    const goldPerk = shooters.reduce((sum, sh) => sum + (this.dpsOf(sh) / total) * this.shooterGold(sh), 0);
    const dropPerk = shooters.reduce((sum, sh) => sum + (this.dpsOf(sh) / total) * this.shooterDrops(sh), 0);
    for (const e of roster) {
      const k = e.spawnRate * killFrac.get(e.id)! * efficiency;
      out.kills[e.id] = k;
      out.killsTotal += k;
      out.gold += k * e.gold * goldPerk;
      out.materials[e.material] = (out.materials[e.material] ?? 0) + k * e.dropChance * dropPerk;
    }
    for (const h of hunters) {
      out.stuns[h.sh] = h.stunRate * efficiency;
      out.stunned[h.sh] = h.down;
      out.share[h.sh] = (this.dpsOf(h.sh) * (1 - h.down)) / hunters.reduce((sum, x) => sum + this.dpsOf(x.sh) * (1 - x.down), 0) || 1 / hunters.length;
    }
    return out;
  }

  /** Applies `seconds` of farming yield, carrying fractions so slow trickles still pay out. */
  private accrue(
    area: AreaId,
    rates: FarmRates,
    seconds: number,
  ): { kills: number; gold: number; materials: Partial<Record<MaterialId, number>>; knockouts: Partial<Record<Shooter, number>> } {
    const s = this.state;
    const take = (key: string, amount: number) => {
      const v = (this.farmAcc.get(key) ?? 0) + amount;
      const whole = Math.floor(v);
      this.farmAcc.set(key, v - whole);
      return whole;
    };
    let kills = 0;
    for (const [id, rate] of Object.entries(rates.kills) as [EnemyId, number][]) kills += take(`${area}:k:${id}`, rate * seconds);
    for (const [sh, share] of Object.entries(rates.share) as [Shooter, number][]) {
      const n = take(`${area}:hk:${sh}`, rates.killsTotal * share * seconds);
      if (n > 0) s.stats.hunterKills[sh] = (s.stats.hunterKills[sh] ?? 0) + n;
    }
    const gold = rates.gold * seconds;
    const materials: Partial<Record<MaterialId, number>> = {};
    for (const [m, rate] of Object.entries(rates.materials) as [MaterialId, number][]) {
      const n = take(`${area}:m:${m}`, rate * seconds);
      if (n > 0) {
        s.materials[m] += n;
        materials[m] = n;
      }
    }
    const knockouts: Partial<Record<Shooter, number>> = {};
    for (const [sh, rate] of Object.entries(rates.stuns) as [Shooter, number][]) {
      const n = take(`${area}:s:${sh}`, rate * seconds);
      if (n > 0) knockouts[sh] = n;
    }
    s.gold += gold;
    s.stats.totalGold += gold;
    s.stats.totalKills += kills;
    s.areas[area].kills += kills;
    s.areas[area].gold += gold;
    for (const n of Object.values(knockouts)) s.areas[area].knockouts += n ?? 0;
    return { kills, gold, materials, knockouts };
  }

  // ---- Training & skills ----

  training(who: Wearer): Training {
    return who === 'main' ? this.state.main : this.state.hunters[who];
  }

  /** Level from training, and sessions done / needed toward the next one. */
  levelInfo(who: Wearer): { level: number; into: number; need: number } {
    return levelFromTrains(this.training(who).trains);
  }

  levelOf(who: Wearer): number {
    return this.levelInfo(who).level;
  }

  /** Ranks in a skill-tree node. */
  skill(who: Wearer, id: string): number {
    return this.training(who).skills[id] ?? 0;
  }

  /** A Hunter's skill tree. */
  skillTree(who: Wearer): SkillNode[] {
    return SKILL_TREES[who];
  }

  /** Unspent skill points: one per level above 1. */
  skillPoints(who: Wearer): number {
    const spent = Object.values(this.training(who).skills).reduce((a, b) => a + b, 0);
    return this.levelOf(who) - 1 - spent;
  }

  /** A node is reachable once any node it hangs from has a rank (the root always is). */
  nodeReachable(who: Wearer, id: string): boolean {
    const node = skillNode(who, id);
    return !!node && (node.requires.length === 0 || node.requires.some((r) => this.skill(who, r) > 0));
  }

  canLearn(who: Wearer, id: string): boolean {
    const node = skillNode(who, id);
    if (!node) return false;
    if (who !== 'main' && !this.state.hunters[who].recruited) return false;
    return this.skillPoints(who) > 0 && this.skill(who, id) < node.maxRank && this.nodeReachable(who, id);
  }

  learn(who: Wearer, id: string): boolean {
    if (!this.canLearn(who, id)) return false;
    const t = this.training(who);
    t.skills[id] = (t.skills[id] ?? 0) + 1;
    return true;
  }

  /** Cost of the next `amount` training sessions (`buyAmount` by default). */
  trainPurchase(who: Wearer, amount: BuyAmount = this.state.buyAmount): Purchase {
    const base = who === 'main' ? MAIN_TRAIN_COST : helperTrainCost(hunterDef(who));
    const growth = who === 'main' ? MAIN_TRAIN_GROWTH : HELPER_TRAIN_GROWTH;
    const done = this.training(who).trains;
    const count = amount === 'max' ? Math.max(1, maxAffordable(base, growth, done, this.state.gold)) : amount;
    return { count, cost: bulkCost(base, growth, done, count) };
  }

  /** Trains a Hunter `buyAmount` times. Returns false if they can't afford it (or aren't recruited). */
  train(who: Wearer): boolean {
    if (who !== 'main' && !this.state.hunters[who].recruited) return false;
    const p = this.trainPurchase(who);
    if (this.state.gold < p.cost) return false;
    this.state.gold -= p.cost;
    this.training(who).trains += p.count;
    return true;
  }

  // ---- Hunters ----

  /** Completed their unlocking event enough times to be recruited. */
  hunterAvailable(id: HunterId): boolean {
    const { event, times } = hunterDef(id).unlock;
    return this.eventCompletions(event) >= times;
  }

  canRecruit(id: HunterId): boolean {
    return !this.state.hunters[id].recruited && this.hunterAvailable(id) && this.state.gold >= hunterDef(id).recruitCost;
  }

  /** Hunters a completion of this event would make available (the next time it's completed). */
  huntersUnlockedBy(id: string): HunterId[] {
    const next = this.eventCompletions(id) + 1;
    return HUNTERS.filter((h) => h.unlock.event === id && h.unlock.times === next).map((h) => h.id);
  }

  recruit(id: HunterId): boolean {
    if (!this.canRecruit(id)) return false;
    this.state.gold -= hunterDef(id).recruitCost;
    this.state.hunters[id].recruited = true;
    this.emit({ type: 'recruit', hunter: id });
    return true;
  }

  /** Hunters stationed in an area (up to STATION_CAPACITY). */
  stationedIn(area: AreaId): HunterId[] {
    return HUNTERS.filter((h) => this.state.hunters[h.id].recruited && this.state.hunters[h.id].station === area).map((h) => h.id);
  }

  /** Room for another Hunter in this area (one already there always "fits"). */
  canStation(id: HunterId, area: AreaId): boolean {
    const here = this.stationedIn(area);
    return here.includes(id) || here.length < STATION_CAPACITY;
  }

  /** Station a Hunter in an area (or pass null to call them back). Fails if the area is full. */
  station(id: HunterId, area: AreaId | null): boolean {
    const h = this.state.hunters[id];
    if (!h.recruited || (area && (!this.isAreaUnlocked(area) || !this.canStation(id, area)))) return false;
    h.station = area;
    return true;
  }

  /** Recruited Hunters fighting next to you in the current area. */
  get helpersHere(): HunterId[] {
    return this.stationedIn(this.state.area);
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

  // ---- Offline ----

  /** Applies progress for time spent away: you (plus anyone stationed with you) and every stationed Hunter. */
  applyOffline(now = Date.now()): OfflineResult {
    const s = this.state;
    const { away, seconds } = capAway((now - s.lastSeen) / 1000);
    this.coolEvents(away);
    const result: OfflineResult = { away, seconds, kills: 0, gold: 0, materials: {}, areas: [], knockouts: 0 };
    const add = (area: AreaId, hunters: Shooter[], r: ReturnType<Game['accrue']>) => {
      result.kills += r.kills;
      result.gold += r.gold;
      for (const [m, n] of Object.entries(r.materials) as [MaterialId, number][]) result.materials[m] = (result.materials[m] ?? 0) + n;
      result.areas.push({ area, hunters, ...r });
      for (const n of Object.values(r.knockouts)) result.knockouts += n ?? 0;
    };
    const withYou: Shooter[] = ['main', ...this.helpersHere];
    add(s.area, withYou, this.accrue(s.area, this.farmRates(s.area, withYou, OFFLINE_EFFICIENCY), seconds));
    for (const area of AREAS) {
      const group = this.stationedIn(area.id);
      if (area.id === s.area || !group.length) continue;
      add(area.id, group, this.accrue(area.id, this.farmRates(area.id, group, STATION_EFFICIENCY * OFFLINE_EFFICIENCY), seconds));
    }
    s.lastSeen = now;
    return result;
  }
}
