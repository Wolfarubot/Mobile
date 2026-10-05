import {
  ASCEND_LEVEL,
  ASCEND_NODE,
  ASCENDED_TREES,
  MAIN_SLOTS,
  WEAPON_CLASSES,
  weaponUptime,
  weaponHitsPerAttack,
  type WeaponClassDef,
  dropsFrom,
  rollLoot,
  EXTRA_DROP_SHARE,
  lootChance,
  LOOT_TWO_STAR,
  affordableCount,
  MAIN_ASCEND_LEVEL,
  MAIN_ASCEND_NODE,
  MAIN_MAX_LEVEL,
  mainBulkCost,
  SLAYER_TREE,
  MAIN_SESSIONS_TO_ASCEND,
  MAIN_SESSIONS_AFTER_ASCEND,
  levelAfterAscending,
  MAX_LEVEL,
  SESSIONS_AFTER_ASCEND,
  SESSIONS_TO_ASCEND,
  type Rarity,
  evoKillsNeeded,
  ENEMIES,
  EMPOWER_UNLOCK_KILLS,
  TRAIN_UNLOCK_KILLS,
  empowerMult,
  EMPOWER_GROWTH,
  MAX_EMPOWER_SESSIONS,
  monsterLevel,
  empowerBaseCost,
  EVO_TREES,
  evoNode,
  type EvoNode,
  type EvoStat,
  STATUS_MODEL,
  GUARDIAN_ENEMY,
  typeMult,
  type DamageType,
  type TapAbilityId,
  tapAbilityDef,
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
  bulkCost,
  CRIT_MULT,
  enemyDef,
  eventDef,
  EVENTS,
  enemyUnlockCost,
  MAX_STARS,
  itemLevel,
  GEAR_STUN_CAP,
  gearCost,
  GEAR_STAR_POWER,
  gearDef,
  gearStats,
  gearTotals,
  type GearDef,
  type GearEffect,
  type SummonType,
  GUARDIAN_GOLD_MULT,
  GUARD_RECHARGE,
  GUARDIAN_TIME,
  HELPER_FIRE_RATE,
  helperBulkCost,
  helperMaxAffordable,
  helperTrainCost,
  levelFromTrains,
  hunterDef,
  HUNTERS,
  itemCost,
  itemDef,
  ITEMS,
  MAIN_RANGE,
  maxAffordable,
  nextAreaOf,
  OFFLINE_EFFICIENCY,
  powerDamage,
  UNARMED_HIT,
  weaponHit,
  SALVAGE_REFUND,
  STATION_CAPACITY,
  STATION_EFFICIENCY,
  STUN_IMMUNITY,
  STUN_TIME,
  SKILL_RECOVERY,
  TAP_DAMAGE_MULT,
  TAP_RADIUS,
  type AreaId,
  type Archetype,
  type EnemyId,
  type GearId,
  type GearStat,
  type HunterId,
  type ItemId,
  type MaterialId,
  type SlotDef,
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
  | { type: 'eventComplete'; event: string }
  /** The last area's Guardian (the Time Eater) fell: the Void Rift is conquered. */
  | { type: 'finalGuardian' }
  /** A monster dropped a piece of gear (auto-salvaged into materials if its rarity is set to). */
  | { type: 'loot'; gear: GearId; stars: number; salvaged: boolean };

/** Wilhelm's two weapon slots: 'long' powers sniper shots, 'short' his akimbo pistols. */
/** Which of a Hunter's skill trees: their first, or the one they grow after ascending. */
export type TreeKind = 'base' | 'ascended';

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

  /** What crafted area Upgrades (e.g. the Forest Idol) do to an area's monsters. */
  areaUpgrades(area: AreaId): { hp: number; gold: number } {
    const out = { hp: 1, gold: 1 };
    for (const it of ITEMS)
      if (it.area?.id === area && this.state.items[it.id] > 0) {
        const l = this.item(it.id);
        out.hp *= it.area.hp(l);
        out.gold *= it.area.gold(l);
      }
    return out;
  }

  /** An Upgrade's strength (in steps) at its current stars. */
  private item(id: ItemId): number {
    return itemLevel(itemDef(id), this.state.items[id]);
  }

  // ---- Combat stats (read by Field every frame) ----

  /** Upgrades boost every Hunter. */
  get itemDamageMult(): number {
    return (1 + 0.2 * this.item('whetstone')) * (1 + 0.08 * this.item('graveWhetstone')) * (1 + 0.1 * this.item('engine'));
  }

  get itemRateMult(): number {
    return (1 + 0.04 * this.item('gloves')) * (1 + 0.03 * this.item('batwingGloves')) * (1 + 0.03 * this.item('engine'));
  }

  /**
   * Your main Hunter's damage per hit: their weapon's base damage (the starting Short Sword: 1), multiplied
   * by training, skills, Upgrades and the % damage on their armor and accessory.
   */
  get damage(): number {
    return this.weaponHitOf('main') * powerDamage(this.state.main.trains) * this.skillDamageMult('main') * this.itemDamageMult * (1 + this.gear('main').damage);
  }

  /** Base damage per hit of the weapon a Hunter holds (UNARMED_HIT without one). */
  weaponHitOf(who: Shooter, mode: GearMode = 'long'): number {
    const slots = this.slotsOf(who);
    const i = slots.findIndex((sl) => WEAPON_KINDS.includes(sl.kind) && (!sl.role || sl.role === mode));
    const item = i >= 0 ? this.equipped(who)[i] : null;
    const def = item ? gearDef(item.base) : null;
    return def?.weaponClass ? weaponHit(def, item!.stars) : UNARMED_HIT;
  }

  get fireRate(): number {
    return BASE_FIRE_RATE * this.skillRateMult('main') * this.itemRateMult * (1 + this.gear('main').rate) * this.inspireFor('main');
  }

  /**
   * Attack-rate multiplier from a Bard's song: Ba'al speeds up every other Hunter fighting in the same area
   * (you count wherever you are; Guild Hunters where they're stationed).
   */
  inspireFor(who: Shooter): number {
    const where = who === 'main' ? this.state.area : this.state.hunters[who].station;
    if (!where) return 1;
    let m = 1;
    for (const h of HUNTERS)
      if (h.inspire && h.id !== who && this.state.hunters[h.id].recruited && this.state.hunters[h.id].station === where) m *= 1 + h.inspire;
    return m;
  }

  /**
   * Gear abilities (accessories, rarer armor) have their own base damage: this is what a Hunter's bonuses
   * multiply it by (training, skills, Upgrades, % damage, Guild Hunters' style and bane), everything their
   * weapon's own damage would get except the weapon itself.
   */
  abilityMult(who: Shooter, archetype?: Archetype): number {
    return this.shotDamage(who, archetype) / Math.max(1e-9, this.weaponHitOf(who));
  }

  /** Damage multiplier for a Hunter's summons of a type (Deku's Beasts, Theon's Constructs). */
  summonMult(who: Shooter, type: SummonType): number {
    const b = who === 'main' ? undefined : hunterDef(who).summonBonus;
    return b && b.type === type ? b.mult : 1;
  }

  /** The pieces a Hunter wears that have a special effect, with their stars. */
  gearEffects(who: Shooter): Array<{ uid: number; def: GearDef; effect: GearEffect; stars: number }> {
    const out: Array<{ uid: number; def: GearDef; effect: GearEffect; stars: number }> = [];
    for (const item of this.equipped(who)) {
      const def = item ? gearDef(item.base) : null;
      if (item && def?.effect) out.push({ uid: item.uid, def, effect: def.effect, stars: item.stars });
    }
    return out;
  }

  /** Damage of a tap blast (Tap Power nodes, and the equipped tap ability). */
  get tapDamage(): number {
    const ab = this.tapAbility;
    return this.damage * TAP_DAMAGE_MULT * (1 + this.tree('main').tapPower) * (ab ? tapAbilityDef(ab).damage : 1);
  }

  /** The tap ability your Hunter has equipped, if it's still unlocked. */
  get tapAbility(): TapAbilityId | null {
    const id = this.state.main.tapAbility;
    return id && this.tapAbilityUnlocked(id) ? id : null;
  }

  /** A tap ability is unlocked by learning its node in your Hunter's skill tree. */
  tapAbilityUnlocked(id: TapAbilityId): boolean {
    const node = SKILL_TREES.main.find((n) => n.ability === id);
    return !!node && this.skill('main', node.id) > 0;
  }

  /** Equips a tap ability (null = a plain blast in your weapon's damage type). */
  setTapAbility(id: TapAbilityId | null): boolean {
    if (id && !this.tapAbilityUnlocked(id)) return false;
    if (id) this.state.main.tapAbility = id;
    else delete this.state.main.tapAbility;
    return true;
  }

  /** The damage type of a tap blast: the equipped ability's element, else your weapon's. */
  get tapDamageType(): DamageType {
    const ab = this.tapAbility;
    return ab ? tapAbilityDef(ab).damageType : this.damageTypeOf('main');
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
    for (const which of ['base', 'ascended'] as const)
      for (const node of this.skillTree(who, which)) {
        const rank = this.skill(who, node.id, which);
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
    return this.pierce + Math.floor(this.gear(shooter, mode).pierce) + this.tree(shooter).pierce + (this.weaponClassOf(shooter, mode)?.pierce ?? 0);
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
    // A weapon's class weight is already in its base damage (a hammer's hits start higher than a dagger's).
    if (shooter === 'main') return this.damage * (1 + this.gearBane('main', archetype));
    const def = hunterDef(shooter);
    const bane = def.bane && def.bane.archetype === archetype ? def.bane.mult + this.tree(shooter).bane : 1;
    return this.weaponHitOf(shooter, mode) * powerDamage(this.state.hunters[shooter].trains) * this.skillDamageMult(shooter) * this.itemDamageMult * def.style.damage * bane * (1 + this.gear(shooter, mode).damage) * (1 + this.gearBane(shooter, archetype));
  }

  /** Extra damage from a Hunter's gear against an archetype (the Fang Talisman vs Beasts, the Slime Vial vs Slimes). */
  gearBane(who: Shooter, archetype?: Archetype): number {
    if (!archetype) return 0;
    let b = 0;
    for (const item of this.equipped(who)) {
      const d = item ? gearDef(item.base) : null;
      if (item && d?.bane?.archetype === archetype) b += d.bane.bonus * GEAR_STAR_POWER[item.stars];
    }
    return b;
  }

  /** Attacks per second. */
  shooterRate(shooter: Shooter, mode?: GearMode): number {
    const cls = this.weaponClassOf(shooter, mode)?.rate ?? 1;
    if (shooter === 'main') return this.fireRate * cls;
    return HELPER_FIRE_RATE * hunterDef(shooter).style.rate * this.skillRateMult(shooter) * this.itemRateMult * (1 + this.gear(shooter, mode).rate) * cls * this.inspireFor(shooter);
  }

  /**
   * How far a Hunter can attack, in world units. A shot's range is scaled by their weapon's class; your Hunter
   * with a sweeping or stabbing weapon reaches only as far as it does (range bonuses count a quarter).
   */
  shooterRange(shooter: Shooter, mode?: GearMode): number {
    const cls = this.weaponClassOf(shooter, mode);
    const bonus = this.gear(shooter, mode).range + this.tree(shooter).range;
    if (shooter === 'main' && cls && (cls.attack === 'sweep' || cls.attack === 'stab' || cls.attack === 'nova')) return cls.reach! + bonus / 4;
    return (shooter === 'main' ? MAIN_RANGE : hunterDef(shooter).style.range) * (cls?.range ?? 1) + bonus;
  }

  /** The class of the weapon a Hunter has equipped (for Wilhelm, the one for `mode`), or null. */
  weaponClassOf(who: Shooter, mode: GearMode = 'long'): WeaponClassDef | null {
    const slots = this.slotsOf(who);
    const i = slots.findIndex((sl) => WEAPON_KINDS.includes(sl.kind) && (!sl.role || sl.role === mode));
    const item = i >= 0 ? this.equipped(who)[i] : null;
    const id = item ? gearDef(item.base).weaponClass : undefined;
    return id ? WEAPON_CLASSES[id] : null;
  }

  /**
   * Expected damage per second of a Hunter against an archetype, ignoring overkill, travel time and stuns.
   * Each attack style has a `farm` factor for how well it works against a crowd (AoE > 1).
   */
  dpsOf(shooter: Shooter, archetype?: Archetype): number {
    const style = shooter === 'main' ? null : hunterDef(shooter).style;
    const cls = shooter === 'main' ? this.weaponClassOf('main') : null;
    const shots = !cls || cls.attack === 'shot' || cls.attack === 'dagger' ? this.projectiles : 1;
    const perAttack = (style?.pellets ?? 1) * shots * (style?.farm ?? cls?.farm ?? 1);
    // Guns spend part of their time reloading.
    const wc = this.weaponClassOf(shooter);
    const uptime = weaponUptime(wc) * (shooter === 'main' ? weaponHitsPerAttack(wc) : 1);
    return this.shotDamage(shooter, archetype) * (this.shooterRate(shooter) * perAttack * uptime + this.specialHitRate(shooter)) * this.critFactor(shooter);
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
    // Status effects (burns, puddles, bursts...) add some damage on top, as often as they proc.
    const vs = (t: DamageType, proc: number) => typeMult(t, enemy) * (1 + ((STATUS_MODEL[t] ?? 1) - 1) * proc);
    const normal = vs(this.damageTypeOf(shooter), this.procOf(shooter));
    const sp = this.specialHitRate(shooter);
    if (!sp) return normal;
    const style = hunterDef(shooter as HunterId).style;
    const shots = this.shooterRate(shooter) * (style.pellets ?? 1) * this.projectiles * style.crowd;
    return (shots * normal + sp * vs(this.damageTypeOf(shooter, 'long', true), this.procOf(shooter, 'long', true))) / (shots + sp);
  }

  /**
   * Chance a hit triggers its damage type's status effect: the weapon's own chance (for Wilhelm, that mode's
   * weapon), or the Hunter's own without one. Specials use their own chance (Glimmer's fireballs always burn).
   */
  procOf(who: Shooter, mode: GearMode = 'long', special = false): number {
    if (who === 'main') return this.weaponItem(who, mode) ? (gearDef(this.weaponItem(who, mode)!.base).proc ?? 0) : 0;
    const style = hunterDef(who).style;
    if (special) return style.special?.proc ?? 0;
    const item = this.weaponItem(who, mode);
    return item ? (gearDef(item.base).proc ?? 0) : (style.proc ?? 0);
  }

  /** Rarity behind a Hunter's status effects: their weapon's, or Common for their own attacks and specials. */
  procRarity(who: Shooter, mode: GearMode = 'long', special = false): Rarity {
    const item = special ? null : this.weaponItem(who, mode);
    return item ? gearDef(item.base).rarity : 'common';
  }

  /** The piece in a Hunter's weapon slot for a mode, if any. */
  weaponItem(who: Shooter, mode: GearMode = 'long'): GearItem | null {
    const slots = this.slotsOf(who);
    const i = slots.findIndex((sl) => WEAPON_KINDS.includes(sl.kind) && (!sl.role || sl.role === mode));
    return i >= 0 ? this.equipped(who)[i] : null;
  }

  // ---- Special attacks (Reginald's potions, Glimmer's fireballs) ----

  /** Stats of the piece in a Hunter's weapon slot (zeros when empty). Its damage and attack rate power their special. */
  weaponStats(who: Shooter): Partial<Record<GearStat, number>> {
    const slots = this.slotsOf(who);
    const i = slots.findIndex((sl) => WEAPON_KINDS.includes(sl.kind));
    const item = i >= 0 ? this.equipped(who)[i] : null;
    return item ? gearStats(gearDef(item.base), item.stars) : {};
  }

  /** Seconds between special attacks, or null if the Hunter has none. */
  specialCooldown(shooter: Shooter): number | null {
    return shooter === 'main' ? null : (hunterDef(shooter).style.special?.cooldown ?? null);
  }

  /** Multiplier on shot damage for each hit of the special: its base × (1 + weapon damage). */
  specialDamageMult(shooter: Shooter): number {
    const sp = shooter === 'main' ? undefined : hunterDef(shooter).style.special;
    // The weapon powers it through the shot it multiplies (every hit starts from the weapon's damage).
    return sp ? sp.damage : 0;
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
    return who === 'main' ? MAIN_SLOTS : (hunterDef(who).slots ?? DEFAULT_SLOTS);
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
      for (const [k, v] of Object.entries(gearTotals(gearDef(item.base), item.stars)) as [GearStat, number][]) total[k] += v;
    });
    return total;
  }

  canCraftGear(id: GearId): boolean {
    return !gearDef(id).starter && this.hasMaterials(gearCost(gearDef(id), 0));
  }

  /** Crafts a new 1★ piece into the inventory. */
  craftGear(id: GearId): GearItem | null {
    if (!this.canCraftGear(id)) return null;
    this.spend(gearCost(gearDef(id), 0));
    const item: GearItem = { uid: this.state.nextGearUid++, base: id, stars: 1 };
    this.state.inventory.push(item);
    return item;
  }

  gearUpgradeCost(uid: number): Partial<Record<MaterialId, number>> | null {
    const item = this.gearItem(uid);
    // Pieces with no stats (Common Clothes) have nothing to improve.
    const def = item ? gearDef(item.base) : null;
    if (!item || !def || item.stars >= MAX_STARS || (!Object.keys(def.stats).length && !def.weaponClass && !def.effect)) return null;
    return gearCost(gearDef(item.base), item.stars);
  }

  upgradeGear(uid: number): boolean {
    const cost = this.gearUpgradeCost(uid);
    if (!cost || !this.hasMaterials(cost)) return false;
    this.spend(cost);
    this.gearItem(uid)!.stars++;
    return true;
  }

  /** Materials returned for salvaging a piece: half of everything spent on it. */
  salvageValue(uid: number): Partial<Record<MaterialId, number>> {
    const item = this.gearItem(uid);
    const out: Partial<Record<MaterialId, number>> = {};
    if (!item) return out;
    // Starting gear was free: only its stars count.
    for (let l = gearDef(item.base).starter ? 1 : 0; l < item.stars; l++)
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
      if (!item || !slotAccepts(slots[slot], gearDef(item.base))) return false;
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
    return GUARDIAN_ENEMY[this.state.area];
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
    return !!def && this.isAreaUnlocked(def.area) && this.eventProgress(id) >= def.unlockKills;
  }

  /** Kills counting toward unlocking an event: every kill in its area, or only its archetype's (e.g. slimes). */
  eventProgress(id: string): number {
    const def = EVENTS.find((e) => e.id === id);
    if (!def) return 0;
    if (!def.unlockArchetype) return this.state.areas[def.area].kills;
    return ENEMIES.filter((e) => e.area === def.area && e.archetype === def.unlockArchetype).reduce((n, e) => n + this.state.bestiary[e.id].kills, 0);
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

  /** The Events tab opens once the Forest's first event (the Slime Swarm, then its Guardian Challenge) unlocks, and stays open. */
  get eventsOpen(): boolean {
    return this.state.flags.eventsIntro || EVENTS.some((e) => e.area === 'forest' && this.eventUnlocked(e.id)) || this.isAreaUnlocked('graveyard');
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
    const evo = this.evo(id);
    const emp = (stat: 'hp' | 'gold' | 'drops' | 'spawn') => empowerMult(stat, Math.min(b.empower, MAX_EMPOWER_SESSIONS));
    const idol = this.areaUpgrades(def.area);
    return {
      id,
      archetype: def.archetype,
      hp: area.hp * def.hp * emp('hp') * (1 + evo.hp) * idol.hp,
      speed: area.speed * def.speed * (1 + evo.speed) * swarm.speed,
      gold: area.gold * def.gold * emp('gold') * (1 + evo.gold) * this.goldMult * idol.gold * this.areaPerk(def.area).gold,
      spawnRate: b.unlocked ? Math.max(def.spawn * emp('spawn') * (1 + evo.spawn) * (1 + 0.2 * this.item('lure')) * swarm.spawn, swarm.spawn ? (ev?.minSpawn?.[id] ?? 0) : 0) : 0,
      dropChance: BASE_DROP_CHANCE * (1 + 0.25 * this.item('pouch')) * emp('drops') * (1 + evo.drops),
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

  /**
   * Area-wide perks of the Guild Hunters stationed there (Alias the Thief): ×gold for every kill in the area,
   * ×loot chance. Your current area counts the Hunters stationed with you.
   */
  areaPerk(area: AreaId): { gold: number; loot: number } {
    const out = { gold: 1, loot: 1 };
    for (const h of HUNTERS) {
      if (!this.state.hunters[h.id].recruited || this.state.hunters[h.id].station !== area) continue;
      out.gold *= 1 + (h.areaGold ?? 0);
      out.loot *= 1 + (h.areaLoot ?? 0);
    }
    return out;
  }

  /**
   * A monster in `area` dropped gear: a random piece for the area (see rollLoot), 1★ or sometimes 2★. If its
   * rarity is set to Auto Salvage, it's salvaged straight away (half its materials, like salvaging by hand).
   */
  dropLoot(area: AreaId, quiet = false): { gear: GearId; salvaged: boolean } {
    const def = rollLoot(area, this.rng(), this.rng());
    const stars = this.rng() < LOOT_TWO_STAR ? 2 : 1;
    const salvaged = this.state.settings.autoSalvage.includes(def.rarity);
    if (salvaged) {
      for (let l = 0; l < stars; l++)
        for (const [m, n] of Object.entries(gearCost(def, l)) as [MaterialId, number][]) this.gainMaterial(m, Math.floor(n * SALVAGE_REFUND));
    } else this.state.inventory.push({ uid: this.state.nextGearUid++, base: def.id, stars });
    this.state.stats.looted = (this.state.stats.looted ?? 0) + 1;
    if (!quiet) this.emit({ type: 'loot', gear: def.id, stars, salvaged });
    return { gear: def.id, salvaged };
  }

  /** Salvages every unequipped piece of the given rarities. Returns how many went. */
  salvageRarities(rarities: Rarity[]): number {
    const doomed = this.state.inventory.filter((it) => rarities.includes(gearDef(it.base).rarity) && !gearDef(it.base).starter && !this.wearerOf(it.uid));
    for (const it of doomed) this.salvageGear(it.uid);
    return doomed.length;
  }

  /** Auto Salvage shows up once you've reached the Old Graveyard. */
  get autoSalvageOpen(): boolean {
    return this.state.areas.graveyard.unlocked;
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
      this.gainMaterial(e.material, BOSS_MATERIAL_DROP);
      this.dropLoot(s.area); // every Guardian carries a piece
      s.stats.guardians++;
      const next = this.lockedNext;
      this.endGuardian();
      this.completeEvent(`guardian-${s.area}`);
      if (next) {
        s.areas[next].unlocked = true;
        this.emit({ type: 'areaUnlocked', area: next });
      } else if (!nextAreaOf(s.area)) this.emit({ type: 'finalGuardian' });
      return { gold, material: e.material, amount: BOSS_MATERIAL_DROP };
    }
    const gold = e.gold * this.shooterGold(shooter);
    s.gold += gold;
    s.stats.totalGold += gold;
    s.areas[enemyDef(type).area].gold += gold;
    s.bestiary[type].kills++;
    const chance = e.dropChance * this.shooterDrops(shooter);
    const amount = dropsFrom(chance, this.rng());
    this.gainMaterial(e.material, amount);
    // A second drop (a Forest Wolf's Beast Bone), at a share of the chance.
    const extra = enemyDef(type).extra;
    if (extra) this.gainMaterial(extra, dropsFrom(chance * EXTRA_DROP_SHARE, this.rng()));
    s.areas[enemyDef(type).area].kills++;
    // Gear that finds extra materials (the Slime Vial at 5★: Royal Slime from slimes).
    for (const item of this.equipped(shooter)) {
      const fd = item ? gearDef(item.base).findDrop : undefined;
      if (item && fd && item.stars >= fd.stars && enemyDef(type).archetype === fd.archetype && this.rng() < fd.chance) this.gainMaterial(fd.material, 1);
    }
    const loot = lootChance(type) * this.areaPerk(enemyDef(type).area).loot;
    if (loot > 0 && this.rng() < loot) this.dropLoot(enemyDef(type).area);
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
    const packs = new Map(roster.map((e) => [e.id, (this.packOf(e.id)[0] + this.packOf(e.id)[1]) / 2]));
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
      const extra = enemyDef(e.id).extra;
      if (extra) out.materials[extra] = (out.materials[extra] ?? 0) + k * e.dropChance * dropPerk * EXTRA_DROP_SHARE;
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
    quiet = false,
  ): { kills: number; gold: number; materials: Partial<Record<MaterialId, number>>; knockouts: Partial<Record<Shooter, number>>; loot: Array<{ gear: GearId; salvaged: boolean }> } {
    const s = this.state;
    const take = (key: string, amount: number) => {
      const v = (this.farmAcc.get(key) ?? 0) + amount;
      const whole = Math.floor(v);
      this.farmAcc.set(key, v - whole);
      return whole;
    };
    let kills = 0;
    let lootRate = 0;
    for (const [id, rate] of Object.entries(rates.kills) as [EnemyId, number][]) {
      const n = take(`${area}:k:${id}`, rate * seconds);
      kills += n;
      s.bestiary[id].kills += n;
      lootRate += rate * lootChance(id);
    }
    const loot: Array<{ gear: GearId; salvaged: boolean }> = [];
    const pieces = take(`${area}:loot`, lootRate * this.areaPerk(area).loot * seconds);
    for (let i = 0; i < pieces; i++) loot.push(this.dropLoot(area, quiet));
    for (const [sh, share] of Object.entries(rates.share) as [Shooter, number][]) {
      const n = take(`${area}:hk:${sh}`, rates.killsTotal * share * seconds);
      if (n > 0) s.stats.hunterKills[sh] = (s.stats.hunterKills[sh] ?? 0) + n;
    }
    const gold = rates.gold * seconds;
    const materials: Partial<Record<MaterialId, number>> = {};
    for (const [m, rate] of Object.entries(rates.materials) as [MaterialId, number][]) {
      const n = take(`${area}:m:${m}`, rate * seconds);
      if (n > 0) {
        this.gainMaterial(m, n);
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
    return { kills, gold, materials, knockouts, loot };
  }

  // ---- Training & skills ----

  training(who: Wearer): Training {
    return who === 'main' ? this.state.main : this.state.hunters[who];
  }

  /** Level from training, and sessions done / needed toward the next one (the curve starts over after ascending). */
  levelInfo(who: Wearer): { level: number; into: number; need: number } {
    const t = this.training(who);
    if (who === 'main') {
      if (t.ascendAt !== undefined) return levelAfterAscending(t.trains - t.ascendAt, MAIN_ASCEND_LEVEL, MAIN_MAX_LEVEL);
      const info = levelFromTrains(t.trains);
      // Saves from before the cap could be past it: hold them at Lv 100 until they ascend.
      return info.level >= MAIN_ASCEND_LEVEL ? { level: MAIN_ASCEND_LEVEL, into: 0, need: 1 } : info;
    }
    if (t.ascendAt !== undefined) return levelAfterAscending(t.trains - t.ascendAt);
    return levelFromTrains(t.trains);
  }

  levelOf(who: Wearer): number {
    return this.levelInfo(who).level;
  }

  /** Has this Hunter ascended (your Hunter: become the Slayer)? */
  ascended(who: Wearer): boolean {
    return this.training(who).ascendAt !== undefined;
  }

  /** Highest level they can train to: Guild Hunters stop at Lv 50 until they ascend, then Lv 100; your Hunter Lv 100, then 200. */
  maxLevel(who: Wearer): number {
    if (who === 'main') return this.ascended(who) ? MAIN_MAX_LEVEL : MAIN_ASCEND_LEVEL;
    return this.ascended(who) ? MAX_LEVEL : ASCEND_LEVEL;
  }

  /** Training sessions left before they hit their level cap. */
  sessionsLeft(who: Wearer): number {
    const t = this.training(who);
    if (who === 'main')
      return Math.max(0, t.ascendAt !== undefined ? MAIN_SESSIONS_AFTER_ASCEND - (t.trains - t.ascendAt) : MAIN_SESSIONS_TO_ASCEND - t.trains);
    return t.ascendAt !== undefined ? SESSIONS_AFTER_ASCEND - (t.trains - t.ascendAt) : SESSIONS_TO_ASCEND - t.trains;
  }

  /** Their title: Guild Hunters take a new one when they ascend; your Hunter becomes the Slayer. */
  titleOf(who: Wearer): string {
    if (who === 'main') return this.ascended(who) ? 'Slayer' : 'Hunter';
    const def = hunterDef(who);
    return this.ascended(who) ? def.ascendedTitle : def.title;
  }

  /** Ranks in a skill-tree node (their first tree, or the one they grow after ascending). */
  skill(who: Wearer, id: string, which: TreeKind = 'base'): number {
    if (which === 'base' && id === 'ascend') return this.ascended(who) ? 1 : 0;
    const t = this.training(who);
    return (which === 'base' ? t.skills : (t.skills2 ?? {}))[id] ?? 0;
  }

  /** A Hunter's skill tree: their first (with the Ascend node for Guild Hunters), or their ascended one. */
  skillTree(who: Wearer, which: TreeKind = 'base'): SkillNode[] {
    if (which === 'ascended') return who === 'main' ? SLAYER_TREE : ASCENDED_TREES[who];
    return [...SKILL_TREES[who], who === 'main' ? MAIN_ASCEND_NODE : ASCEND_NODE];
  }

  private treeNode(who: Wearer, id: string, which: TreeKind): SkillNode | undefined {
    return this.skillTree(who, which).find((n) => n.id === id);
  }

  /** Unspent skill points: one per level above 1, less what's been spent (each node rank costs its `cost`). */
  skillPoints(who: Wearer): number {
    let spent = 0;
    for (const which of ['base', 'ascended'] as const)
      for (const n of this.skillTree(who, which)) spent += this.skill(who, n.id, which) * (n.cost ?? 1);
    return this.levelOf(who) - 1 - spent;
  }

  /** Is every node of their first tree maxed (so the Ascend node shows)? */
  baseTreeComplete(who: Wearer): boolean {
    return SKILL_TREES[who].every((n) => this.skill(who, n.id) >= n.maxRank);
  }

  /** A node is reachable once any node it hangs from has a rank (the root always is). Ascend needs the whole first tree. */
  nodeReachable(who: Wearer, id: string, which: TreeKind = 'base'): boolean {
    if (which === 'base' && id === 'ascend') return this.baseTreeComplete(who);
    const node = this.treeNode(who, id, which);
    return !!node && (node.requires.length === 0 || node.requires.some((r) => this.skill(who, r, which) > 0));
  }

  canLearn(who: Wearer, id: string, which: TreeKind = 'base'): boolean {
    const node = this.treeNode(who, id, which);
    if (!node) return false;
    if (who !== 'main' && !this.state.hunters[who].recruited) return false;
    if (which === 'ascended' && !this.ascended(who)) return false;
    return this.skillPoints(who) >= (node.cost ?? 1) && this.skill(who, id, which) < node.maxRank && this.nodeReachable(who, id, which);
  }

  learn(who: Wearer, id: string, which: TreeKind = 'base'): boolean {
    if (!this.canLearn(who, id, which)) return false;
    const t = this.training(who);
    if (which === 'base' && id === 'ascend') {
      // Ascend: keep the level (Lv 50, or Lv 100 for your Hunter), start the level curve over from here (the training price carries on), open the next tree.
      t.ascendAt = t.trains;
      t.skills2 = {};
      return true;
    }
    const ranks = which === 'base' ? t.skills : (t.skills2 ??= {});
    ranks[id] = (ranks[id] ?? 0) + 1;
    return true;
  }

  /** Cost of the next `amount` training sessions (`buyAmount` by default), stopping at their level cap. */
  trainPurchase(who: Wearer, amount: BuyAmount = this.state.buyAmount): Purchase {
    const done = this.training(who).trains;
    const left = this.sessionsLeft(who);
    if (left <= 0) return { count: 0, cost: Infinity };
    if (who === 'main') {
      // Your Hunter: costs taper past Lv 30 too (more gently than a Guild Hunter's climb), up to the level cap.
      const cost = (n: number) => mainBulkCost(done, n);
      const wanted = amount === 'max' ? Math.max(1, affordableCount(cost, this.state.gold, left)) : amount;
      const count = Math.min(wanted, left);
      return { count, cost: cost(count) };
    }
    // Guild Hunters: costs taper past Lv 30, and training stops at their level cap.
    const base = helperTrainCost(hunterDef(who));
    const wanted = amount === 'max' ? Math.max(1, helperMaxAffordable(base, done, this.state.gold, left)) : amount;
    const count = Math.min(wanted, left);
    return { count, cost: helperBulkCost(base, done, count) };
  }

  /** Adds materials to your stock and to the all-time count of that material gained. */
  gainMaterial(id: MaterialId, n: number): void {
    if (n <= 0) return;
    this.state.materials[id] += n;
    this.state.stats.matGained[id] = (this.state.stats.matGained[id] ?? 0) + n;
  }

  /** Trains a Hunter `buyAmount` times. Returns false if they can't afford it (or aren't recruited). */
  train(who: Wearer): boolean {
    if (!this.trainUnlocked) return false;
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
    // New recruits join you where you are, if there's room.
    this.station(id, this.state.area);
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

  // ---- Monster Empower & evolution ----

  /** Slimes slain in all (any slime monster, anywhere). */
  get slimeKills(): number {
    return ENEMIES.filter((e) => e.archetype === 'slime').reduce((n, e) => n + this.state.bestiary[e.id].kills, 0);
  }

  /** Empower opens once you've slain EMPOWER_UNLOCK_KILLS slimes. */
  /** Training opens once you've slain TRAIN_UNLOCK_KILLS slimes (for good). */
  get trainUnlocked(): boolean {
    return this.state.flags.trainIntro || this.slimeKills >= TRAIN_UNLOCK_KILLS;
  }

  get empowerUnlocked(): boolean {
    return this.state.flags.empowerIntro || this.slimeKills >= EMPOWER_UNLOCK_KILLS;
  }

  /** Cost of the next `amount` Empower sessions for a monster (`buyAmount` by default). */
  empowerPurchase(id: EnemyId, amount: BuyAmount = this.state.buyAmount): Purchase {
    const base = empowerBaseCost(enemyDef(id));
    const done = this.state.bestiary[id].empower;
    // Never past the top level.
    const left = Math.max(0, MAX_EMPOWER_SESSIONS - done);
    const count = Math.min(left, amount === 'max' ? Math.max(1, maxAffordable(base, EMPOWER_GROWTH, done, this.state.gold)) : amount);
    return { count, cost: bulkCost(base, EMPOWER_GROWTH, done, count) };
  }

  /** Empowers a monster (`buyAmount` sessions): more HP, gold and material drops; levels earn evolution points. */
  empower(id: EnemyId, amount: BuyAmount = this.state.buyAmount): boolean {
    const p = this.empowerPurchase(id, amount);
    if (!this.empowerUnlocked || !this.isUnlocked(id) || p.count <= 0 || this.state.gold < p.cost) return false;
    this.state.gold -= p.cost;
    this.state.bestiary[id].empower += p.count;
    return true;
  }

  /** A monster's level from Empower sessions (5 per level, up to MAX_MONSTER_LEVEL), and progress to the next. */
  monsterLevelInfo(id: EnemyId): { level: number; into: number; need: number } {
    return monsterLevel(this.state.bestiary[id].empower);
  }

  /** The evolution tree a monster grows along (its archetype's). */
  evoTree(id: EnemyId): EvoNode[] {
    return EVO_TREES[enemyDef(id).archetype];
  }

  evoRank(id: EnemyId, node: string): number {
    return this.state.bestiary[id].evo[node] ?? 0;
  }

  /** Unspent evolution points: one per level above 1. */
  evoPoints(id: EnemyId): number {
    const tree = this.evoTree(id);
    const spent = Object.entries(this.state.bestiary[id].evo).reduce((a, [node, rank]) => a + rank * (tree.find((n) => n.id === node)?.cost ?? 1), 0);
    return this.monsterLevelInfo(id).level - 1 - spent;
  }

  evoReachable(id: EnemyId, node: string): boolean {
    const n = evoNode(enemyDef(id).archetype, node);
    return !!n && (n.requires.length === 0 || n.requires.some((r) => this.evoRank(id, r) > 0));
  }

  /** Kills of this monster still needed before an evolution node opens (0 = open). */
  evoKillsLeft(id: EnemyId, node: string): number {
    const n = evoNode(enemyDef(id).archetype, node);
    return n ? Math.max(0, evoKillsNeeded(enemyDef(id), n) - this.state.bestiary[id].kills) : 0;
  }

  canEvolve(id: EnemyId, node: string): boolean {
    const n = evoNode(enemyDef(id).archetype, node);
    return (
      !!n &&
      this.isUnlocked(id) &&
      this.evoPoints(id) >= (n.cost ?? 1) &&
      this.evoRank(id, node) < n.maxRank &&
      this.evoReachable(id, node) &&
      this.evoKillsLeft(id, node) === 0
    );
  }

  evolve(id: EnemyId, node: string): boolean {
    if (!this.canEvolve(id, node)) return false;
    const evo = this.state.bestiary[id].evo;
    evo[node] = (evo[node] ?? 0) + 1;
    return true;
  }

  /** Summed evolution effects of a monster. */
  evo(id: EnemyId): Record<EvoStat, number> {
    const total: Record<EvoStat, number> = { hp: 0, gold: 0, drops: 0, spawn: 0, pack: 0, speed: 0 };
    const ranks = this.state.bestiary[id].evo;
    for (const n of this.evoTree(id)) {
      const r = ranks[n.id] ?? 0;
      if (r) for (const [k, v] of Object.entries(n.effect) as [EvoStat, number][]) total[k] += v * r;
    }
    return total;
  }

  /** Pack size range of a monster, after evolutions that make it arrive in bigger hordes. */
  packOf(id: EnemyId): [number, number] {
    const [lo, hi] = enemyDef(id).pack;
    const extra = Math.floor(this.evo(id).pack);
    return [lo + extra, hi + extra];
  }

  // ---- Forge ----

  canCraft(id: ItemId): boolean {
    const def = itemDef(id);
    const stars = this.state.items[id];
    if (stars >= MAX_STARS) return false;
    const cost = itemCost(def, stars);
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
    const result: OfflineResult = { away, seconds, kills: 0, gold: 0, materials: {}, areas: [], knockouts: 0, loot: [] };
    const add = (area: AreaId, hunters: Shooter[], r: ReturnType<Game['accrue']>) => {
      result.kills += r.kills;
      result.gold += r.gold;
      for (const [m, n] of Object.entries(r.materials) as [MaterialId, number][]) result.materials[m] = (result.materials[m] ?? 0) + n;
      result.areas.push({ area, hunters, ...r });
      for (const n of Object.values(r.knockouts)) result.knockouts += n ?? 0;
      result.loot.push(...r.loot);
    };
    const withYou: Shooter[] = ['main', ...this.helpersHere];
    add(s.area, withYou, this.accrue(s.area, this.farmRates(s.area, withYou, OFFLINE_EFFICIENCY), seconds, true));
    for (const area of AREAS) {
      const group = this.stationedIn(area.id);
      if (area.id === s.area || !group.length) continue;
      add(area.id, group, this.accrue(area.id, this.farmRates(area.id, group, STATION_EFFICIENCY * OFFLINE_EFFICIENCY), seconds, true));
    }
    s.lastSeen = now;
    return result;
  }
}
