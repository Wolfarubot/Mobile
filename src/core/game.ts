import { JOURNAL, type JournalEntry } from './journal';
import {
  weaponArchetype,
  withArchetype,
  modSlotCount,
  weaponOnlyEnchant,
  type MeleeArt,
  staffSpell,
  type SpellId,
  ASCEND_LEVEL,
  ASCEND_NODE,
  ASCENDED_TREES,
  MAIN_SLOTS,
  WEAPON_CLASSES,
  weaponUptime,
  weaponHitsPerAttack,
  type WeaponClassDef,
  dropsFrom,
  GOLDEN_DROPS,
  GOLDEN_GOLD,
  rollLoot,
  enemyExtraDrops,
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
  ENERGY_AD,
  ENERGY_ADS_PER_DAY,
  ENERGY_MAX_NO_ADS,
  DAILY_QUESTS,
  DAILY_KILLS,
  WEEKLY_QUESTS,
  WEEKLY_KILLS,
  WEEKLY_DAILIES,
  GEMS_DAILY,
  GEMS_WEEKLY,
  GEMS_CHECKIN,
  type Quest,
  PREMIUM_ITEMS,
  premiumItem,
  SHOP_DAILY_ITEMS,
  type PremiumId,
  type PremiumItem,
  type QuestKind,
  BUFF_CRIT,
  BUFF_CRIT_DMG,
  BUFF_ENCORE,
  BUFF_GOLD,
  BUFF_HYMN,
  BUFF_KEEN_EYE,
  BUFF_SLAYER,
  BUFF_SLAYER_TIME,
  MINIGAME_BUFFS,
  minigameStars,
  type MinigameId,
  ENERGY_MAX,
  ENERGY_REGEN,
  eventEnergyCost,
  EMPOWER_UNLOCK_KILLS,
  TRAIN_UNLOCK_KILLS,
  empowerMult,
  EMPOWER_GROWTH,
  MAX_EMPOWER_SESSIONS,
  monsterLevel,
  empowerBaseCost,
  MONSTER_EVO_TREES,
  potionValue,
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
  gearTier,
  GEAR,
  WEAPON_KINDS,
  GROUP_DAMAGE,
  weaponGroup,
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
  type EventDef,
  EVENTS,
  enemyUnlockCost,
  MAX_STARS,
  itemLevel,
  itemMaxStars,
  GEAR_STUN_CAP,
  gearCost,
  GEAR_STAR_POWER,
  AOE_PER_LEVEL,
  MAX_EFFECTIVE_STARS,
  MOD_QUALITY_STEPS,
  MOD_CHOICES,
  REFINES,
  WEAPON_ONLY_REFINES,
  ENCHANTS,
  enchantTierHit,
  type EnchantDef,
  type EnchantId,
  modCost,
  modGold,
  gearUpgradeGold,
  modValue,
  modPower,
  type RefineStat,
  gearTypes,
  gearDef,
  gearStats,
  gearTotals,
  type GearDef,
  type GearEffect,
  type SummonType,
  GUARDIAN_GOLD_MULT,
  MINIGAME_INCOME,
  MINIGAME_INCOME_NEW,
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
  rowGates,
  isGolem,
  MAIN_RANGE,
  maxAffordable,
  nextAreaOf,
  OFFLINE_BASE_SEC,
  OFFLINE_EFFICIENCY,
  SAMPLE_MIN_SECONDS,
  OFFLINE_POTIONS,
  OFFLINE_POTION_SEC,
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
import { type BuyAmount, type GameState, type GearItem, type GearMod, type PendingMod, type Training, type Wearer } from './state';

/** A piece's enchantments and refinements: its built-in effects first, then what's in its modifier slots. */
export function allMods(item: GearItem): Array<GearMod | null> {
  const def = gearDef(item.base);
  return [...(def.builtIn ?? []).map((b): GearMod => ({ kind: 'enchant', id: b.id, q: b.q, p: b.p })), ...(item.mods ?? [])];
}

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
  | { type: 'loot'; gear: GearId; stars: number; salvaged: boolean }
  /** Materials a kill on the field dropped (for the battlefield's pick-up pop-ups). */
  | { type: 'gains'; materials: Partial<Record<MaterialId, number>> };

/** Wilhelm's two weapon slots: 'long' is his usual weapon, 'short' the one he switches to up close. */
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
  /** Ted's Double or Nothing, when it came up on this kill. */
  luck?: 'double' | 'bust';
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
  /** Evolutions with their own behaviour on the battlefield (0: none). Chance a slain one splits in two. */
  split: number;
  /** Chance one that dies Burning leaves burning sticks behind. */
  fireTrail: number;
  /** Lunges at Hunters who come close. */
  lunge: boolean;
  /** Chance a slain one rises again (once, at half HP). */
  rise: number;
  /** Chance a slain one bursts, hurting the monsters around it. */
  burst: number;
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
  private aoeCache = new Map<Shooter, { key: string; v: number }>();
  private stationRates = new Map<AreaId, { key: string; rates: FarmRates; age: number }>();
  /** The wall clock (ms), for daily and weekly resets; tests set their own. */
  clock: () => number = () => Date.now();
  private questAge = 0;
  /** Okrin's Giant Slayer is working on the Guardian Challenge in progress. */
  private slayer = false;
  /** Offline gains are being worked out (timed buffs don't count). */
  private away = false;
  /** goldPerSecond's last measure, and seconds since. */
  private goldRate: number | null = null;
  private goldRateAge = 0;
  private listeners: Array<(e: GameEvent) => void> = [];
  rng: () => number;

  constructor(state: GameState, rng: () => number = Math.random) {
    this.state = state;
    this.rng = rng;
    // Evolution trees change (the Skill Trees editor): ranks past a node's new max, or in a node that's gone, are
    // given back as points.
    for (const [id, b] of Object.entries(state.bestiary) as [EnemyId, GameState['bestiary'][EnemyId]][]) {
      const tree = MONSTER_EVO_TREES[id];
      if (!tree) continue;
      for (const [node, rank] of Object.entries(b.evo)) {
        const n = tree.find((x) => x.id === node);
        if (!n) delete b.evo[node];
        else if (rank > n.maxRank) b.evo[node] = n.maxRank;
      }
    }
    // Gear that no longer fits its slot (shields became accessories): moved to the wearer's free accessory slot,
    // or taken off.
    for (const [who, uids] of Object.entries(state.equipment) as [Wearer, Array<number | null>][]) {
      const slots = this.slotsOf(who);
      uids.forEach((uid, i) => {
        const item = uid != null ? state.inventory.find((it) => it.uid === uid) : undefined;
        if (!item || !slots[i] || slotAccepts(slots[i], gearDef(item.base))) return;
        uids[i] = null;
        const free = slots.findIndex((sl, j) => uids[j] == null && slotAccepts(sl, gearDef(item.base)));
        if (free >= 0) uids[free] = uid;
      });
    }
  }

  on(fn: (e: GameEvent) => void): void {
    this.listeners.push(fn);
  }

  private emit(e: GameEvent): void {
    for (const fn of this.listeners) fn(e);
  }

  /** What crafted area Upgrades (the Idols) do to an area's monsters: their spawn rate (golems excepted). */
  areaUpgrades(area: AreaId): { spawn: number } {
    const out = { spawn: 1 };
    for (const it of ITEMS) if (it.area?.id === area && this.state.items[it.id] > 0) out.spawn *= it.area.spawn(this.item(it.id));
    return out;
  }

  /** An Upgrade's strength (in steps) at its current stars. */
  private item(id: ItemId): number {
    return itemLevel(itemDef(id), this.state.items[id]);
  }

  /** Seconds away that count toward offline progress: 4 hours, plus 2 for each Energy Potion crafted. */
  offlineCapSec(): number {
    return OFFLINE_BASE_SEC + OFFLINE_POTIONS.filter((id) => this.state.items[id] > 0).length * OFFLINE_POTION_SEC;
  }

  // ---- Combat stats (read by Field every frame) ----

  /**
   * Your main Hunter's damage per hit: their weapon's base damage (the starting Short Sword: 1), multiplied
   * by training, skills and the % damage on their armor and accessory.
   */
  get damage(): number {
    return this.weaponHitOf('main') * powerDamage(this.state.main.trains) * this.skillDamageMult('main') * (1 + this.gear('main').damage) * this.premiumMult('damage');
  }

  /** Base damage per hit of the weapon a Hunter holds (UNARMED_HIT without one). */
  weaponHitOf(who: Shooter, mode: GearMode = 'long'): number {
    const slots = this.slotsOf(who);
    const i = slots.findIndex((sl) => WEAPON_KINDS.includes(sl.kind) && (!sl.role || sl.role === mode));
    const item = i >= 0 ? this.equipped(who)[i] : null;
    const def = item ? gearDef(item.base) : null;
    return def?.weaponClass ? weaponHit(def, this.effStars(item!, who)) : UNARMED_HIT;
  }

  get fireRate(): number {
    return BASE_FIRE_RATE * this.skillRateMult('main') * (1 + this.gear('main').rate) * this.inspireFor('main') * this.hymn;
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
   * multiply it by (training, skills, % damage, Guild Hunters' bane), everything their
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
  /** Where a Hunter is fighting: your Hunter in your area, a Guild Hunter where they're stationed (null: nowhere). */
  areaOfHunter(who: Shooter): AreaId | null {
    return who === 'main' ? this.state.area : this.state.hunters[who].recruited ? this.state.hunters[who].station : null;
  }

  /** Extra stars on a Hunter's gear from an Artificer (Reginald) fighting in the same area. */
  tinkerFor(who: Shooter): number {
    const at = this.areaOfHunter(who);
    if (!at) return 0;
    let n = 0;
    for (const h of HUNTERS) if (h.tinker && this.state.hunters[h.id].recruited && this.state.hunters[h.id].station === at) n += h.tinker;
    return n;
  }

  /** The stars a piece works at for this wearer: its own, plus an Artificer's touch (up to one past 5★). */
  effStars(item: GearItem, who: Shooter): number {
    return Math.min(MAX_EFFECTIVE_STARS, item.stars + this.tinkerFor(who));
  }

  gearEffects(who: Shooter): Array<{ uid: number; def: GearDef; effect: GearEffect; stars: number }> {
    const out: Array<{ uid: number; def: GearDef; effect: GearEffect; stars: number }> = [];
    for (const item of this.equipped(who)) {
      const def = item ? gearDef(item.base) : null;
      if (!item || !def) continue;
      if (def.effect) out.push({ uid: item.uid, def, effect: def.effect, stars: this.effStars(item, who) });
      // Enchanted armor specials (Thorns, Evasion, Shield Burst): their rolled chance, and damage from their
      // rolled power × the piece's area.
      allMods(item).forEach((m, slot) => {
        const en = m?.kind === 'enchant' ? ENCHANTS[m.id] : null;
        if (!m || !en?.effect) return;
        const chance = modValue(m, def);
        const effect = (en.effect.kind === 'evade' ? { ...en.effect, chance } : 'base' in en.effect ? { ...en.effect, chance, base: modPower(m, def) * enchantTierHit(def) } : en.effect) as GearEffect;
        out.push({ uid: -(item.uid * 8 + slot + 1), def: { ...def, icon: en.icon, name: `${en.name} (${def.name})` }, effect, stars: 1 });
      });
    }
    return out;
  }

  /** The enchantments on a piece, with their rolled chance (`v`) and power (`p`), and the piece they're on. */
  private enchantsOf(item: GearItem | null): Array<{ en: EnchantDef; v: number; p: number; def: GearDef }> {
    if (!item) return [];
    const def = gearDef(item.base);
    return allMods(item).flatMap((m) => (m?.kind === 'enchant' ? [{ en: ENCHANTS[m.id], v: modValue(m, def), p: modPower(m, def), def }] : []));
  }

  /** Pieces a Hunter wears that aren't weapons (their armor and accessories). */
  private wornNonWeapons(who: Shooter): GearItem[] {
    return this.equipped(who).filter((it): it is GearItem => !!it && !WEAPON_KINDS.includes(gearDef(it.base).kind));
  }

  /**
   * Enchantments that act on a Hunter's weapon (infusions, Potency, Fireburst): the weapon's own, and any on
   * their accessories (which can carry weapon enchantments for whatever weapon the wearer holds).
   */
  private weaponEnchants(who: Shooter, mode: GearMode = 'long'): Array<{ en: EnchantDef; v: number; p: number; def: GearDef }> {
    return [this.weaponItem(who, mode), ...this.wornNonWeapons(who)].flatMap((it) => this.enchantsOf(it));
  }

  /** Fireburst (on the weapon or an accessory): each kill has `chance` to burst for this much base damage around it. */
  killBurst(who: Shooter): { base: number; radius: number; damageType: DamageType; chance: number } | null {
    const e = this.weaponEnchants(who).find(({ en }) => en.onKill);
    return e?.en.onKill ? { ...e.en.onKill, chance: e.v, base: e.p * enchantTierHit(e.def) } : null;
  }

  /** A Hunter's melee arts (enchantments on their melee weapon): each with its chance and power (× a hit). */
  meleeArts(who: Shooter, mode: GearMode = 'long'): Array<{ art: MeleeArt; chance: number; power: number }> {
    const item = this.weaponItem(who, mode);
    if (!item) return [];
    return this.enchantsOf(item).flatMap(({ en, v, p }) => (en.melee ? [{ art: en.melee, chance: v, power: p }] : []));
  }

  /** Enchantments set off by a Hunter's attacks (Thunder Call, the pulses), from anything they wear. */
  attackEnchants(who: Shooter): Array<{ effect: GearEffect; chance: number }> {
    const out: Array<{ effect: GearEffect; chance: number }> = [];
    for (const item of this.equipped(who))
      if (item)
        for (const { en, v, p } of this.enchantsOf(item))
          if (en.onAttack && 'base' in en.onAttack) out.push({ chance: v, effect: { ...en.onAttack, base: p * enchantTierHit(gearDef(item.base)) } as GearEffect });
    return out;
  }

  /**
   * Status chance of one damage type of a Hunter's hits: an infused type uses its infusion's rolled chance,
   * the weapon's own types its own; Potency adds to both.
   */
  procFor(who: Shooter, t: DamageType, mode: GearMode = 'long', special = false): number {
    if (special) return this.procOf(who, mode, true);
    const item = this.weaponItem(who, mode);
    const own = item ? gearTypes(gearDef(item.base)) : [];
    const inf = this.weaponEnchants(who, mode).find(({ en }) => en.infuse === t && !own.includes(t));
    if (!inf) return this.procOf(who, mode);
    const potency = item ? this.weaponEnchants(who, mode).reduce((sum, { en, v }) => sum + (en.potency ? v : 0), 0) : 0;
    return Math.min(1, inf.v + potency + this.gear(who).statusChance);
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
    const out: Record<TreeStat, number> = { damage: 0, rate: 0, recovery: 0, crit: 0, range: 0, pierce: 0, radius: 0, bane: 0, guard: 0, rally: 0, gold: 0, drops: 0, tapPower: 0, tapSize: 0, bolts: 0, cooldown: 0, duration: 0, critDamage: 0, multishot: 0 };
    for (const which of ['base', 'ascended'] as const)
      for (const node of this.skillTree(who, which)) {
        const rank = this.skill(who, node.id, which);
        if (rank > 0) for (const [k, v] of Object.entries(node.effect) as [TreeStat, number][]) out[k] += v * rank;
      }
    return out;
  }

  /** Crit chance: a base chance, plus what a Hunter's gear and skills add. */
  critChanceOf(shooter: Shooter): number {
    const w = this.weaponItem(shooter);
    const arch = w ? (weaponArchetype(gearDef(w.base))?.crit ?? 0) : 0;
    return BASE_CRIT_CHANCE + this.gear(shooter).crit + this.tree(shooter).crit + arch + (this.buffOn('shootingGallery') ? BUFF_CRIT : 0);
  }

  private critFactor(shooter: Shooter): number {
    return 1 + this.critChanceOf(shooter) * (this.critMultOf(shooter) - 1);
  }

  /** Extra enemies each shot passes through (gear, skills and the weapon class). */
  pierceOf(shooter: Shooter, mode?: GearMode): number {
    return Math.floor(this.gear(shooter, mode).pierce) + this.tree(shooter).pierce + (this.weaponClassOf(shooter, mode)?.pierce ?? 0);
  }

  /** Multiplier on a Hunter's area effects (fireballs, puddles, novas). */
  radiusMult(shooter: Shooter): number {
    return (1 + this.gear(shooter).radius + this.tree(shooter).radius + this.enchantBoost(shooter, 'radius')) * this.aoeScale(shooter);
  }

  /** Every area effect grows with the Hunter's level (AOE_PER_LEVEL), wherever they fight. */
  aoeScale(shooter: Shooter): number {
    // Called for every area hit: remember each Hunter's level until their training changes.
    const t = this.training(shooter);
    const key = `${t.trains}:${t.ascendAt ?? ''}`;
    let c = this.aoeCache.get(shooter);
    if (!c || c.key !== key) this.aoeCache.set(shooter, (c = { key, v: 1 + AOE_PER_LEVEL * (this.levelOf(shooter) - 1) }));
    return c.v;
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
   * gear reduce it per Hunter.
   */
  stunTime(boss = false, shooter: Shooter = 'main'): number {
    const recovery = SKILL_RECOVERY ** this.tree(shooter).recovery;
    const gear = 1 - Math.min(GEAR_STUN_CAP, this.gear(shooter).stun);
    return (boss ? BOSS_STUN_TIME : STUN_TIME) * recovery * gear;
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
    return this.weaponHitOf(shooter, mode) * powerDamage(this.state.hunters[shooter].trains) * this.skillDamageMult(shooter) * bane * (1 + this.gear(shooter, mode).damage) * (1 + this.gearBane(shooter, archetype)) * this.premiumMult('damage');
  }

  /** Extra damage from a Hunter's gear against an archetype (the Fang Talisman vs Beasts, the Slime Vial vs Slimes). */
  gearBane(who: Shooter, archetype?: Archetype): number {
    if (!archetype) return 0;
    let b = 0;
    for (const item of this.equipped(who)) {
      const d = item ? gearDef(item.base) : null;
      if (item && d?.bane?.archetype === archetype) b += d.bane.bonus * GEAR_STAR_POWER[this.effStars(item, who)];
    }
    return b;
  }

  /** Attacks per second. */
  shooterRate(shooter: Shooter, mode?: GearMode): number {
    const cls = this.weaponClassOf(shooter, mode)?.rate ?? 1;
    if (shooter === 'main') return this.fireRate * cls;
    return HELPER_FIRE_RATE * this.skillRateMult(shooter) * (1 + this.gear(shooter, mode).rate) * cls * this.inspireFor(shooter) * this.hymn;
  }

  /**
   * How far a Hunter can attack, in world units. A shot's range is scaled by their weapon's class; a sweeping,
   * stabbing or bursting weapon reaches only as far as it does (range bonuses count a quarter).
   */
  shooterRange(shooter: Shooter, mode?: GearMode): number {
    const cls = this.weaponClassOf(shooter, mode);
    const bonus = this.gear(shooter, mode).range + this.tree(shooter).range;
    // A slam reaches as far as its (area-sized) ring.
    if (cls?.attack === 'slam') return cls.reach! * this.radiusMult(shooter) + bonus / 4;
    if (cls && (cls.attack === 'sweep' || cls.attack === 'stab' || cls.attack === 'nova')) return cls.reach! + bonus / 4;
    return MAIN_RANGE * (cls?.range ?? 1) + bonus;
  }

  /** The class of the weapon a Hunter has equipped (for Wilhelm, the one for `mode`), or null. */
  weaponClassOf(who: Shooter, mode: GearMode = 'long'): WeaponClassDef | null {
    const slots = this.slotsOf(who);
    const i = slots.findIndex((sl) => WEAPON_KINDS.includes(sl.kind) && (!sl.role || sl.role === mode));
    const item = i >= 0 ? this.equipped(who)[i] : null;
    const id = item ? gearDef(item.base).weaponClass : undefined;
    if (!id) return null;
    // Its archetype first (a Maul, a Carbine...), then its own tweaks.
    let cls = withArchetype(WEAPON_CLASSES[id], weaponArchetype(gearDef(item!.base)));
    // The weapon's own tweaks to its class: more stabs (and slower), more or fewer bolts before a staff's spell,
    // a focus that sends out a wave (reaching twice as far).
    const tw = gearDef(item!.base).tweak;
    if (tw) {
      cls = { ...cls };
      if (tw.thrusts) cls.thrusts = tw.thrusts;
      if (tw.rate) cls.rate *= tw.rate;
      if (tw.bolts && cls.spell) {
        cls.spell = { ...cls.spell, every: tw.bolts };
        cls.mag = tw.bolts + 1;
      }
      if (tw.wave) {
        cls.wave = true;
        cls.reach = (cls.reach ?? 110) * 2;
      }
    }
    // Refined knockback and magazine size change the class's own numbers for this piece.
    let knock = 0;
    let mag = 0;
    let reload = 0;
    let size = 0;
    // (Accessories can carry these for whatever weapon their wearer holds.)
    for (const it of [item!, ...this.wornNonWeapons(who)])
      for (const m of it.mods ?? [])
        if (m?.kind === 'refine' && (m.stat === 'knock' || m.stat === 'mag' || m.stat === 'reload' || m.stat === 'size')) {
          const v = modValue(m, gearDef(it.base));
          if (m.stat === 'knock') knock += v;
          else if (m.stat === 'mag') mag += v;
          else if (m.stat === 'size') size += v;
          else reload += v;
        }
    // Shot modifiers, from the weapon itself: Multishot and Ricochet refinements, and the built-in shot effects
    // (Multishot, Piercing Shots, Ricochet Shots).
    let multishot = 0;
    let bounces = 0;
    let pierce = 0;
    for (const m of item!.mods ?? [])
      if (m?.kind === 'refine' && (m.stat === 'multishot' || m.stat === 'ricochet')) {
        const v = modValue(m, gearDef(item!.base));
        if (m.stat === 'multishot') multishot += v;
        else bounces += v;
      }
    for (const { en, v } of this.enchantsOf(item!))
      if (en.shot === 'multishot') multishot += v;
      else if (en.shot === 'ricochet') bounces += v;
      else if (en.shot === 'pierce') pierce += v;
    if (!knock && !mag && !reload && !size && !multishot && !bounces && !pierce) return cls;
    // Quick Reload shortens reloads (and a staff's recharge), down to 40% at most.
    // Size lengthens a melee weapon's reach (its sweep, thrust, stabs or slam).
    const reach = cls.reach && gearDef(item!.base).kind === 'melee' ? cls.reach * (1 + size) : cls.reach;
    return {
      ...cls,
      knock: cls.knock && cls.knock * (1 + knock),
      mag: cls.mag && Math.round(cls.mag * (1 + mag)),
      reload: cls.reload && cls.reload * Math.max(0.4, 1 - reload),
      reach,
      multishot: multishot ? (cls.multishot ?? 0) + multishot : cls.multishot,
      bounces: bounces ? (cls.bounces ?? 0) + bounces : cls.bounces,
      pierce: pierce ? (cls.pierce ?? 0) + pierce : cls.pierce,
    };
  }

  /**
   * Expected damage per second of a Hunter against an archetype, ignoring overkill, travel time and stuns.
   * Each weapon class has a `farm` factor for how well it works against a crowd (AoE > 1).
   */
  dpsOf(shooter: Shooter, archetype?: Archetype): number {
    const cls = this.weaponClassOf(shooter);
    const perAttack = cls?.farm ?? 1;
    // Guns spend part of their time reloading.
    const uptime = weaponUptime(cls) * weaponHitsPerAttack(cls);
    return this.shotDamage(shooter, archetype) * (this.shooterRate(shooter) * perAttack * uptime + this.specialHitRate(shooter)) * this.critFactor(shooter);
  }

  /**
   * The damage type a Hunter deals: their weapon's (for Wilhelm, the weapon of that mode), or Physical when
   * the slot is empty or holds an untyped piece. Specials have their own type, except summons, which copy the
   * weapon's.
   */
  damageTypeOf(who: Shooter, mode: GearMode = 'long', special = false): DamageType {
    return this.damageTypesOf(who, mode, special)[0];
  }

  /**
   * Every damage type a Hunter's attacks deal: their weapon's (several for a multi-type weapon), or Physical.
   * A hit is split evenly between them, unless the weapon fires one type per projectile (see perShotOf).
   */
  damageTypesOf(who: Shooter, mode: GearMode = 'long', special = false): DamageType[] {
    const sp = who === 'main' ? undefined : hunterDef(who).special;
    if (special && sp && !sp.summon) return [sp.damageType];
    const item = this.weaponItem(who, mode);
    // A weapon's own types (Physical bare-handed), then any infusions add (from the weapon or an accessory).
    const own = item ? gearTypes(gearDef(item.base)) : [];
    const types: DamageType[] = own.length ? [...own] : ['physical'];
    for (const { en } of this.weaponEnchants(who, mode)) if (en.infuse && !types.includes(en.infuse)) types.push(en.infuse);
    return types;
  }

  /** Does a Hunter's multi-type weapon fire one type per projectile (rather than splitting each hit)? */
  perShotOf(who: Shooter, mode: GearMode = 'long'): boolean {
    const item = this.weaponItem(who, mode);
    return !!item && !!gearDef(item.base).perShot && this.damageTypesOf(who, mode).length > 1;
  }

  /** Multiplier on a Hunter's damage of one type, from their gear's type bonuses (on top of everything else). */
  typeBonus(who: Shooter, t: DamageType): number {
    let b = 0;
    for (const item of this.equipped(who)) {
      const d = item ? gearDef(item.base) : null;
      if (item && d?.typeBonus?.type === t) b += d.typeBonus.bonus * GEAR_STAR_POWER[this.effStars(item, who)];
      // An infusion's rolled bonus to its own type.
      for (const { en, p } of this.enchantsOf(item)) if (en.infuse === t) b += p;
    }
    return 1 + b;
  }

  /**
   * Average damage-type multiplier of a Hunter against an enemy (weakness/resistance), blending their normal
   * attacks and their special by how much of their damage each deals. Used by the background model.
   */
  typeMultVs(shooter: Shooter, enemy: EnemyId): number {
    // Status effects (burns, puddles, bursts...) add some damage on top, as often as they proc.
    // Several types (split hits or one type per projectile) average out over their share of the damage.
    const vs = (types: DamageType[], proc: number) =>
      types.reduce((sum, t) => sum + typeMult(t, enemy) * this.typeBonus(shooter, t) * (1 + ((STATUS_MODEL[t] ?? 1) - 1) * proc), 0) / types.length;
    const normal = vs(this.damageTypesOf(shooter), this.procOf(shooter));
    const sp = this.specialHitRate(shooter);
    if (!sp) return normal;
    const shots = this.shooterRate(shooter);
    return (shots * normal + sp * vs(this.damageTypesOf(shooter, 'long', true), this.procOf(shooter, 'long', true))) / (shots + sp);
  }

  /**
   * Chance a hit triggers its damage type's status effect: the weapon's own chance (for Wilhelm, that mode's
   * weapon), or none without one. Specials use their own chance (Glimmer's fireballs always burn).
   */
  procOf(who: Shooter, mode: GearMode = 'long', special = false): number {
    if (special && who !== 'main' && !this.summonSpecial(who)) return hunterDef(who).special?.proc ?? 0;
    const item = this.weaponItem(who, mode);
    if (!item) return 0;
    // Potency enchantments (on the weapon or an accessory) and accessories' status chance (potions too) add to the weapon's own chance.
    const potency = this.weaponEnchants(who, mode).reduce((sum, { en, v }) => sum + (en.potency ? v : 0), 0);
    return Math.min(1, (gearDef(item.base).proc ?? 0) + potency + this.gear(who).statusChance);
  }

  /** Rarity behind a Hunter's status effects: their weapon's, or Common for their own attacks and specials. */
  procRarity(who: Shooter, mode: GearMode = 'long', special = false): Rarity {
    const item = special && !this.summonSpecial(who) ? null : this.weaponItem(who, mode);
    return item ? gearDef(item.base).rarity : 'common';
  }

  /**
   * Is a Hunter's special a summon (Deku's wolves, Theon's puppets)? Their creatures copy the Hunter's weapon:
   * its damage type, and its chance to inflict that type's status effect.
   */
  summonSpecial(who: Shooter): boolean {
    return who !== 'main' && !!hunterDef(who).special?.summon;
  }

  /** The piece in a Hunter's weapon slot for a mode, if any. */
  /** The spell a Hunter's staff casts after its bolts (null for other weapons, or a Physical staff). */
  spellOf(who: Shooter, mode: GearMode = 'long'): SpellId | null {
    const item = this.weaponItem(who, mode);
    return item ? staffSpell(gearDef(item.base)) : null;
  }

  weaponItem(who: Shooter, mode: GearMode = 'long'): GearItem | null {
    const slots = this.slotsOf(who);
    const i = slots.findIndex((sl) => WEAPON_KINDS.includes(sl.kind) && (!sl.role || sl.role === mode));
    return i >= 0 ? this.equipped(who)[i] : null;
  }

  // ---- Special attacks (Andrejz's potions, Glimmer's fireballs) ----

  /** Stats of the piece in a Hunter's weapon slot (zeros when empty). Its damage and attack rate power their special. */
  weaponStats(who: Shooter): Partial<Record<GearStat, number>> {
    const slots = this.slotsOf(who);
    const i = slots.findIndex((sl) => WEAPON_KINDS.includes(sl.kind));
    const item = i >= 0 ? this.equipped(who)[i] : null;
    return item ? gearStats(gearDef(item.base), this.effStars(item, who)) : {};
  }

  /** Seconds between special attacks, or null if the Hunter has none. */
  specialCooldown(shooter: Shooter): number | null {
    return shooter === 'main' ? null : (hunterDef(shooter).special?.cooldown ?? null);
  }

  /** Multiplier on shot damage for each hit of the special: its base × (1 + weapon damage). */
  specialDamageMult(shooter: Shooter): number {
    const sp = shooter === 'main' ? undefined : hunterDef(shooter).special;
    // The weapon powers it through the shot it multiplies (every hit starts from the weapon's damage).
    return sp ? sp.damage : 0;
  }

  /** Radius of the special: its base × (1 + weapon attack rate) × area bonuses (skills, gear). */
  specialRadius(shooter: Shooter): number {
    const sp = shooter === 'main' ? undefined : hunterDef(shooter).special;
    return sp ? sp.radius * (1 + (this.weaponStats(shooter).rate ?? 0)) * this.radiusMult(shooter) : 0;
  }

  /** The special's damage in shot-equivalents per second against a crowd (for DPS and the farm model). */
  private specialHitRate(shooter: Shooter): number {
    const sp = shooter === 'main' ? undefined : hunterDef(shooter).special;
    if (!sp) return 0;
    // Wider specials catch more of the crowd.
    const reach = this.specialRadius(shooter) / sp.radius;
    return (sp.ticks * sp.crowd * reach * this.specialDamageMult(shooter)) / (sp.cooldown * this.cooldownMult(shooter));
  }

  /** Your main Hunter's DPS. */
  get dps(): number {
    return this.dpsOf('main');
  }

  shooterGold(shooter: Shooter): number {
    return (shooter === 'main' ? 1 : (hunterDef(shooter).gold ?? 1)) * (1 + this.gear(shooter).gold + this.tree(shooter).gold);
  }

  shooterDrops(shooter: Shooter): number {
    return (shooter === 'main' ? 1 : (hunterDef(shooter).drops ?? 1)) * (1 + this.gear(shooter).drops + this.tree(shooter).drops);
  }

  // ---- Equipment ----

  /** A Hunter's equipment slots. */
  slotsOf(who: Wearer): SlotDef[] {
    return who === 'main' ? MAIN_SLOTS : (hunterDef(who).slots ?? DEFAULT_SLOTS);
  }

  gearItem(uid: number): GearItem | undefined {
    // An index from uid to position, rebuilt whenever it no longer matches the inventory (late saves hold thousands).
    const inv = this.state.inventory;
    let at = this.gearIndex.get(uid);
    if (at === undefined || inv[at]?.uid !== uid) {
      this.gearIndex = new Map(inv.map((g, i) => [g.uid, i]));
      at = this.gearIndex.get(uid);
    }
    return at === undefined ? undefined : inv[at];
  }
  private gearIndex = new Map<number, number>();

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
    const total: Record<GearStat, number> = { damage: 0, rate: 0, range: 0, crit: 0, stun: 0, guard: 0, gold: 0, drops: 0, radius: 0, pierce: 0, cooldown: 0, critDamage: 0, duration: 0, statusChance: 0, bowDamage: 0, gunDamage: 0, meleeDamage: 0, magicDamage: 0 };
    const slots = this.slotsOf(who);
    this.equipped(who).forEach((item, i) => {
      if (!item || (slots[i].role && slots[i].role !== mode)) return;
      for (const [k, v] of Object.entries(gearTotals(gearDef(item.base), this.effStars(item, who))) as [GearStat, number][]) total[k] += v;
      // Refined stats add to the piece's own (knockback and magazine size change its weapon class instead).
      for (const m of item.mods ?? []) if (m?.kind === 'refine' && m.stat in total) total[m.stat as GearStat] += modValue(m, gearDef(item.base));
    });
    // Potions being felt right now.
    for (const p of this.potions.get(who) ?? []) total[p.stat] += p.value;
    // Quivers, Ammo Pouches, Gauntlets and Talismans: their group's damage counts only with a weapon of that group.
    const weapon = this.weaponItem(who, mode);
    const cls = weapon && gearDef(weapon.base).weaponClass;
    if (cls) total.damage += total[GROUP_DAMAGE[weaponGroup(cls)]];
    return total;
  }

  // ---- Refinements that aren't plain gear stats: summed over everything a Hunter wears ----

  /** The total of one Refine stat across a Hunter's gear (accessories carry them for any weapon). */
  modStat(who: Shooter, stat: RefineStat): number {
    let v = 0;
    for (const it of this.equipped(who)) if (it) for (const m of it.mods ?? []) if (m?.kind === 'refine' && m.stat === stat) v += modValue(m, gearDef(it.base));
    return v;
  }

  /** A Hunter's crit damage multiplier (the Brutal refine and Brutal Criticals raise it). */
  critMultOf(who: Shooter): number {
    return CRIT_MULT * (1 + this.modStat(who, 'critDmg') + this.tree(who).critDamage + this.gear(who).critDamage + (this.buffOn('shootingGallery') ? BUFF_CRIT_DMG : 0));
  }

  // ---- Potions (accessories): drunk on their cooldown in a fight, a boost for a while ----

  private potions = new Map<Shooter, Array<{ uid: number; stat: GearStat; value: number; left: number }>>();

  /** A Hunter drinks a potion: its boost (at the piece's stars) lasts its duration, longer with Extended Effects. */
  drinkPotion(who: Shooter, uid: number, e: Extract<GearEffect, { kind: 'potion' }>, stars: number): void {
    const list = (this.potions.get(who) ?? []).filter((p) => p.uid !== uid);
    list.push({ uid, stat: e.stat, value: potionValue(e, stars), left: e.duration * this.effectDurationMult(who) });
    this.potions.set(who, list);
  }

  /** Seconds left on each potion a Hunter is feeling, by the piece's uid. */
  potionsOn(who: Shooter): Array<{ uid: number; stat: GearStat; left: number }> {
    return this.potions.get(who) ?? [];
  }

  private tickPotions(dt: number): void {
    for (const [who, list] of this.potions) {
      const left = list.filter((p) => (p.left -= dt) > 0);
      if (left.length) this.potions.set(who, left);
      else this.potions.delete(who);
    }
  }

  /** How much stronger a Hunter's status effects are: more damage, or longer / stronger for ones that deal none (Virulence). */
  statusStrength(who: Shooter): number {
    return 1 + this.enchantBoost(who, 'status');
  }

  /** Multiplier on how long a Hunter's summons last (Binding). */
  summonDurationMult(who: Shooter): number {
    return 1 + this.enchantBoost(who, 'summonDur');
  }

  /** The total of Virulence, Binding or Haste across a Hunter's gear (Enchantments). */
  private enchantBoost(who: Shooter, boost: 'status' | 'summonDur' | 'cooldown' | 'radius'): number {
    let v = 0;
    for (const it of this.equipped(who)) if (it) for (const e of this.enchantsOf(it)) if (e.en.boost === boost) v += e.v;
    return v;
  }

  /** Multiplier on a Hunter's gear ability cooldowns (Haste), never below 40%. */
  cooldownMult(who: Shooter): number {
    return Math.max(0.4, 1 - this.enchantBoost(who, 'cooldown') - this.tree(who).cooldown - this.gear(who).cooldown) * (this.buffOn('puppetShow') ? 1 - BUFF_ENCORE : 1);
  }

  /** How much longer the status effects a Hunter sets off last (Extended Effects, and gear). */
  effectDurationMult(who: Shooter): number {
    return 1 + this.tree(who).duration + this.gear(who).duration;
  }

  // ---- Modify: Refine (Kargesh) and Enchant (Marceline) roll random modifiers into a piece's slots ----

  /** Refine opens once Kargesh the Blacksmith is recruited. */
  get refineOpen(): boolean {
    return this.state.hunters.blacksmith.recruited;
  }

  /** Enchant opens once Marceline the Enchantress is recruited. */
  get enchantOpen(): boolean {
    return this.state.hunters.enchantress.recruited;
  }

  /** A piece's modifier slots, each empty (null) or holding its modifier. */
  modSlots(uid: number): Array<GearMod | null> {
    const item = this.gearItem(uid);
    if (!item) return [];
    const n = modSlotCount(gearDef(item.base));
    return Array.from({ length: n }, (_, i) => item.mods?.[i] ?? null);
  }

  /** Can this piece be modified (refined or enchanted) at all? */
  modifiable(uid: number): boolean {
    return (this.refineOpen || this.enchantOpen) && this.modSlots(uid).length > 0;
  }

  /** Can this piece be refined at all (Refine open, and it has modifier slots)? */
  refinable(uid: number): boolean {
    return this.refineOpen && this.modSlots(uid).length > 0;
  }

  /** Refine stats that can roll on this piece. */
  refinesFor(uid: number): RefineStat[] {
    const item = this.gearItem(uid);
    // Accessories are flexible: they take every refinement (one with nothing to act on, like Magazine Size for a
    // Hunter without a gun, simply does nothing).
    return item ? (Object.keys(REFINES) as RefineStat[]).filter((st) => REFINES[st].fits(gearDef(item.base)) || (gearDef(item.base).kind === 'accessory' && !WEAPON_ONLY_REFINES.has(st))) : [];
  }

  /**
   * Enchantments that can roll into a slot of this piece: ones that fit it (an accessory takes any but spells and
   * melee arts), minus an infusion of a type it already deals and anything another slot already holds (one of
   * each per piece).
   */
  enchantsFor(uid: number, slot = -1): EnchantId[] {
    const item = this.gearItem(uid);
    if (!item) return [];
    const def = gearDef(item.base);
    const own = gearTypes(def);
    const others = this.modSlots(uid).filter((m, i) => i !== slot && m?.kind === 'enchant') as Array<{ kind: 'enchant'; id: EnchantId }>;
    return (Object.keys(ENCHANTS) as EnchantId[]).filter((id) => {
      const en = ENCHANTS[id];
      // Accessories take most enchantments, but not spells or melee arts (those belong to their weapons).
      return !en.builtInOnly && (en.fits(def) || (def.kind === 'accessory' && !weaponOnlyEnchant(en))) && !(en.infuse && own.includes(en.infuse)) && !others.some((m) => m.id === id) && !def.builtIn?.some((b) => b.id === id);
    });
  }

  /** Materials to refine a slot of this piece: some of its recipe, plus golem metals. */
  refineCostOf(uid: number): Partial<Record<MaterialId, number>> {
    const item = this.gearItem(uid);
    return item ? modCost(gearDef(item.base), 'refine') : {};
  }

  /** Materials to enchant a slot of this piece: some of its recipe, plus golem gems. */
  enchantCostOf(uid: number): Partial<Record<MaterialId, number>> {
    const item = this.gearItem(uid);
    return item ? modCost(gearDef(item.base), 'enchant') : {};
  }

  /** Gold a Refine or Enchant roll of this piece also costs. */
  modGoldOf(uid: number, kind: 'refine' | 'enchant'): number {
    const item = this.gearItem(uid);
    return item ? modGold(gearDef(item.base), kind) : Infinity;
  }

  canRefine(uid: number, slot: number): boolean {
    return this.refinable(uid) && slot >= 0 && slot < this.modSlots(uid).length && this.refinesFor(uid).length > 0 && this.hasMaterials(this.refineCostOf(uid)) && this.state.gold >= this.modGoldOf(uid, 'refine');
  }

  canEnchant(uid: number, slot: number): boolean {
    return this.enchantOpen && slot >= 0 && slot < this.modSlots(uid).length && this.enchantsFor(uid, slot).length > 0 && this.hasMaterials(this.enchantCostOf(uid)) && this.state.gold >= this.modGoldOf(uid, 'enchant');
  }

  /**
   * A random quality step (0 to MOD_QUALITY_STEPS, the top one a perfect roll). A blessing rolls it `extra` more
   * times and keeps the best, so a perfect roll is likelier.
   */
  private rollQuality(extra = 0): number {
    let q = 0;
    for (let i = 0; i <= extra && q < MOD_QUALITY_STEPS; i++) q = Math.max(q, Math.min(MOD_QUALITY_STEPS, Math.floor(this.rng() * (MOD_QUALITY_STEPS + 1))));
    return q;
  }

  /** Chance one option of a roll comes out perfect, with `extra` blessed rolls. */
  perfectChance(extra = 0): number {
    return 1 - (MOD_QUALITY_STEPS / (MOD_QUALITY_STEPS + 1)) ** (extra + 1);
  }

  /**
   * How many choices a roll offers (pick one). 2 to start; crafted items will raise it, up to 5 by the
   * Void Rift.
   */
  get modChoices(): number {
    return MOD_CHOICES;
  }

  /** The choices a piece is waiting on you to pick from (a roll you've paid for), if any. */
  pendingMod(uid: number): PendingMod | null {
    return this.gearItem(uid)?.pending ?? null;
  }

  /**
   * Rolls a slot, for gold: `modChoices` random modifiers that fit the piece (different ones while there are
   * enough), each at a random strength. They wait on the piece until you pick one (see chooseMod).
   */
  rollMod(uid: number, slot: number, kind: 'refine' | 'enchant'): GearMod[] | null {
    const item = this.gearItem(uid);
    if (!item || item.pending || !(kind === 'refine' ? this.canRefine(uid, slot) : this.canEnchant(uid, slot))) return null;
    const options: GearMod[] = [];
    // A blessing from Kargesh's or Marceline's minigame: this roll's qualities get extra tries (a charge used up now).
    const extra = this.blessingCharges(kind) > 0 ? this.state.blessings[kind] : 0;
    if (extra) this.spendBuff(kind === 'refine' ? 'forgeStrike' : 'runeMatch');
    if (kind === 'refine') {
      let pool = this.refinesFor(uid);
      for (let i = 0; i < this.modChoices; i++) {
        if (!pool.length) pool = this.refinesFor(uid);
        const stat = pool[Math.min(pool.length - 1, Math.floor(this.rng() * pool.length))];
        pool = pool.filter((x) => x !== stat);
        options.push({ kind: 'refine', stat, q: this.rollQuality(extra) });
      }
    } else {
      let pool = this.enchantsFor(uid, slot);
      for (let i = 0; i < this.modChoices; i++) {
        if (!pool.length) pool = this.enchantsFor(uid, slot);
        const total = pool.reduce((sum, id) => sum + ENCHANTS[id].weight, 0);
        let r = this.rng() * total;
        const id = pool.find((x) => (r -= ENCHANTS[x].weight) < 0) ?? pool[pool.length - 1];
        pool = pool.filter((x) => x !== id);
        // A perfect chance rolls its power twice and keeps the better one.
        const q = this.rollQuality(extra);
        let p = this.rollQuality(extra);
        if (q >= MOD_QUALITY_STEPS && ENCHANTS[id].power) p = Math.max(p, this.rollQuality());
        options.push({ kind: 'enchant', id, q, p });
      }
    }
    this.spend(kind === 'refine' ? this.refineCostOf(uid) : this.enchantCostOf(uid));
    this.state.gold -= this.modGoldOf(uid, kind);
    item.pending = { slot, kind, options };
    return options;
  }

  /** Picks one of a roll's choices: it goes into the rolled slot, replacing what was there. */
  chooseMod(uid: number, index: number): GearMod | null {
    const item = this.gearItem(uid);
    const p = item?.pending;
    const mod = p?.options[index];
    if (!item || !p || !mod) return null;
    item.mods = this.modSlots(uid);
    item.mods[p.slot] = mod;
    item.pending = undefined;
    return mod;
  }

  /** The waiting choices can be swapped for a fresh roll (it costs what a roll does). */
  canReroll(uid: number): boolean {
    const p = this.pendingMod(uid);
    return !!p && (p.kind === 'refine' ? this.canRefine(uid, p.slot) : this.canEnchant(uid, p.slot));
  }

  /** Rolls the waiting slot again, for the same cost as a roll: its choices are replaced by new ones. */
  rerollMod(uid: number): GearMod[] | null {
    const item = this.gearItem(uid);
    const p = item?.pending;
    if (!item || !p || !this.canReroll(uid)) return null;
    item.pending = undefined;
    const options = this.rollMod(uid, p.slot, p.kind);
    if (!options) item.pending = p;
    return options;
  }

  /** Refines a slot and takes the first choice (a quick roll; the Modify window lets you pick). */
  refine(uid: number, slot: number): GearMod | null {
    return this.rollMod(uid, slot, 'refine') ? this.chooseMod(uid, 0) : null;
  }

  /** Enchants a slot and takes the first choice. */
  enchant(uid: number, slot: number): GearMod | null {
    return this.rollMod(uid, slot, 'enchant') ? this.chooseMod(uid, 0) : null;
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

  /** Gold to upgrade a piece to its next star (null when it can't be upgraded). */
  gearUpgradeGold(uid: number): number | null {
    const item = this.gearItem(uid);
    return item && this.gearUpgradeCost(uid) ? gearUpgradeGold(gearDef(item.base), item.stars) : null;
  }

  /** Upgrading costs materials and gold. */
  canUpgradeGear(uid: number): boolean {
    const cost = this.gearUpgradeCost(uid);
    return !!cost && this.hasMaterials(cost) && this.state.gold >= (this.gearUpgradeGold(uid) ?? Infinity);
  }

  upgradeGear(uid: number): boolean {
    if (!this.canUpgradeGear(uid)) return false;
    this.state.gold -= this.gearUpgradeGold(uid)!;
    this.spend(this.gearUpgradeCost(uid)!);
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
    // The modifiers it holds now (not ones they replaced: those costs are gone) return what they cost too.
    for (const mod of this.modSlots(uid))
      if (mod) for (const [m, n] of Object.entries(modCost(gearDef(item.base), mod.kind)) as [MaterialId, number][]) out[m] = (out[m] ?? 0) + n;
    for (const m of Object.keys(out) as MaterialId[]) out[m] = Math.floor(out[m]! * SALVAGE_REFUND);
    return out;
  }

  /** Gold returned for salvaging a piece: half what its current modifiers cost. */
  salvageGold(uid: number): number {
    const item = this.gearItem(uid);
    if (!item) return 0;
    return Math.floor(this.modSlots(uid).reduce((sum, mod) => sum + (mod ? modGold(gearDef(item.base), mod.kind) : 0), 0) * SALVAGE_REFUND);
  }

  /** Destroys a piece for some of its materials. Worn gear can't be salvaged: take it off first. */
  salvageGear(uid: number): boolean {
    if (!this.gearItem(uid) || this.wearerOf(uid)) return false;
    const refund = this.salvageValue(uid);
    this.state.gold += this.salvageGold(uid);
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

  /** The Guardian's health: less with a Giant Slayer charge spent on this challenge (as if hit harder). */
  get guardianHp(): number {
    return areaDef(this.state.area).guardian / (this.slayer ? 1 + BUFF_SLAYER : 1);
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

  /**
   * Unlocked once enough monsters have been slain in its area (and the area is open). A Guardian Challenge also
   * waits for its area's first event to be survived once (unless that Guardian has been beaten before), and a
   * minigame opens once the Hunter who stars in it has been recruited.
   */
  eventUnlocked(id: string): boolean {
    const def = EVENTS.find((e) => e.id === id); // e.g. the final area has no Guardian Challenge
    if (!def || !this.isAreaUnlocked(def.area)) return false;
    if (def.kind === 'minigame') return !!def.hunter && this.state.hunters[def.hunter].recruited;
    if (def.requires && this.eventCompletions(def.requires.event) < def.requires.times && this.eventCompletions(id) === 0) return false;
    return this.eventProgress(id) >= def.unlockKills;
  }

  /** What still stands between an event and unlocking: the event it waits on, if its kills are done. */
  eventWaitingOn(id: string): EventDef | null {
    const def = EVENTS.find((e) => e.id === id);
    if (!def?.requires || this.eventCompletions(id) > 0 || this.eventCompletions(def.requires.event) >= def.requires.times) return null;
    return eventDef(def.requires.event);
  }

  /** Kills counting toward unlocking an event: every kill in its area, or only its archetype's (e.g. slimes). */
  eventProgress(id: string): number {
    const def = EVENTS.find((e) => e.id === id);
    if (!def) return 0;
    if (!def.unlockArchetype) return this.state.areas[def.area].kills;
    return ENEMIES.filter((e) => e.area === def.area && e.archetype === def.unlockArchetype).reduce((n, e) => n + this.state.bestiary[e.id].kills, 0);
  }

  /** Event energy now (fractional: the next point fills in over ENERGY_REGEN seconds). */
  get energy(): number {
    return this.state.energy;
  }

  /** Energy an event costs to start. */
  energyCost(id: string): number {
    return eventEnergyCost(eventDef(id));
  }

  /** Seconds until the next whole point of energy (0 when full). */
  get energyNextIn(): number {
    const e = this.state.energy;
    return e >= this.energyMax ? 0 : (Math.floor(e + 1e-9) + 1 - e) * this.energyRegen;
  }

  // ---- Minigame buffs ----

  /** A minigame buff's tank: seconds left (timed) or charges. */
  buffLeft(id: MinigameId): number {
    return this.state.buffs[id] ?? 0;
  }

  /** A buff is working: charges held, or time left (timed ones only while you play, not for time away). */
  buffOn(id: MinigameId): boolean {
    return this.buffLeft(id) > 0 && !(this.away && MINIGAME_BUFFS[id].kind === 'timed');
  }

  /** Battle Hymn's attack speed multiplier. */
  private get hymn(): number {
    return this.buffOn('pixieSerenade') ? 1 + BUFF_HYMN : 1;
  }

  /** What a play of a minigame adds to its buff for a score (nothing for a score of 0). */
  buffGain(mg: MinigameId, id: string, score: number): number {
    const b = MINIGAME_BUFFS[mg];
    const par = eventDef(id).rewards?.par ?? 1;
    if (score <= 0) return 0;
    const k = Math.max(0.5, Math.min(1.5, score / par));
    if (b.kind === 'timed') return b.per * k * this.premiumMult('buffTime');
    const extra = this.premiumBonus('charges');
    // Forge Strike and Rune Match: only a score that earns a blessing.
    if (eventDef(id).blessing) return this.blessingFor(id, score) > 0 ? b.per + extra : 0;
    return Math.max(1, Math.round(b.per * k)) + extra;
  }

  private fillBuff(mg: MinigameId, id: string, score: number): void {
    const add = this.buffGain(mg, id, score);
    if (add > 0) this.state.buffs[mg] = Math.min(this.buffCap(mg), this.buffLeft(mg) + add);
  }

  /** The most a buff's tank holds (more with the Lasting Blessings and Overflowing Charges upgrades). */
  buffCap(id: MinigameId): number {
    const b = MINIGAME_BUFFS[id];
    return b.kind === 'timed' ? b.cap * this.premiumMult('buffTime') : b.cap + 3 * this.premiumBonus('charges');
  }

  // ---- Permanent upgrades (Exalted Gems) ----

  /** The items of a kind you own, added up (Overflowing Charges: extra charges a play). */
  premiumBonus(kind: PremiumId): number {
    let v = 0;
    for (const id of this.state.premium) {
      const it = premiumItem(id);
      if (it?.kind === kind) v += it.value;
    }
    return v;
  }

  /** A kind's multiplier, on top of everything else: 1 + its items' bonuses. */
  premiumMult(kind: PremiumId): number {
    return 1 + this.premiumBonus(kind);
  }

  ownsPremium(id: string): boolean {
    return this.state.premium.includes(id);
  }

  /** Today's items on sale (picked when the day turns; bought ones stay on the stall, sold). */
  get shopItems(): PremiumItem[] {
    this.rollQuests();
    return this.state.shop.items.map((id) => premiumItem(id)!).filter(Boolean);
  }

  /** Buys one of today's items. */
  buyPremium(id: string): boolean {
    const it = premiumItem(id);
    if (!it || this.ownsPremium(id) || !this.state.shop.items.includes(id) || this.state.gems < it.cost) return false;
    this.state.gems -= it.cost;
    this.state.premium.push(id);
    return true;
  }

  /** A day's six items: a shuffle of the ones you don't own, seeded by the date so it holds all day. */
  private stockShop(day: string): void {
    let h = 2166136261;
    for (let i = 0; i < day.length; i++) h = Math.imul(h ^ day.charCodeAt(i), 16777619);
    const rand = () => {
      h = Math.imul(h ^ (h >>> 15), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      h ^= h >>> 16;
      return (h >>> 0) / 4294967296;
    };
    const pool = PREMIUM_ITEMS.filter((it) => !this.ownsPremium(it.id)).map((it) => it.id);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    this.state.shop = { day, items: pool.slice(0, SHOP_DAILY_ITEMS) };
  }

  /** Seconds for a point of energy (less with Second Wind). */
  get energyRegen(): number {
    return ENERGY_REGEN / this.premiumMult('energy');
  }

  /** Spends a charge of a charge buff; false if there was none. */
  private spendBuff(id: MinigameId): boolean {
    const n = this.buffLeft(id);
    if (n < 1) return false;
    this.state.buffs[id] = n - 1;
    if (n - 1 <= 0) {
      delete this.state.buffs[id];
      if (id === 'forgeStrike') this.state.blessings.refine = 0;
      if (id === 'runeMatch') this.state.blessings.enchant = 0;
    }
    return true;
  }

  /** Blessed Refines or Enchants left. */
  blessingCharges(kind: 'refine' | 'enchant'): number {
    return this.buffLeft(kind === 'refine' ? 'forgeStrike' : 'runeMatch');
  }

  /** The most energy refills to on its own: 5, or 20 once ads are removed. */
  get energyMax(): number {
    return this.state.noAds ? ENERGY_MAX_NO_ADS : ENERGY_MAX;
  }

  /** Energy ads left today (none once ads are removed). */
  get adsLeft(): number {
    this.rollQuests();
    return this.state.noAds ? 0 : Math.max(0, ENERGY_ADS_PER_DAY - this.state.quests.ads);
  }

  /** A rewarded ad was watched: ENERGY_AD more energy, past the max if need be (3 a day). */
  adEnergy(): boolean {
    if (this.adsLeft <= 0) return false;
    this.state.energy += ENERGY_AD;
    this.state.quests.ads++;
    return true;
  }

  /** Ads removed (a purchase): no more ad offers, and a bar of 20 that refills to 20. */
  removeAds(): void {
    this.state.noAds = true;
  }

  // ---- Exalted Gems and daily / weekly quests ----

  /** Gems bought in the store. */
  addGems(n: number): void {
    this.state.gems += n;
  }

  /** Starts a new day's (and week's) quests when the local date moves on. */
  rollQuests(): void {
    const q = this.state.quests;
    const now = this.clock();
    const day = dayKey(now);
    const week = weekKey(now);
    if (q.week !== week) {
      q.week = week;
      q.weekly = this.makeQuests(WEEKLY_QUESTS, WEEKLY_KILLS, true);
      q.weeklyClaimed = false;
      q.weekKills = this.state.stats.totalKills;
    }
    if (this.state.shop.day !== day) this.stockShop(day);
    if (q.day !== day) {
      q.day = day;
      q.daily = this.makeQuests(DAILY_QUESTS, DAILY_KILLS, false);
      q.dailyClaimed = false;
      q.checkIn = false;
      q.dailyDone = false;
      q.ads = 0;
      q.dayKills = this.state.stats.totalKills;
    }
  }

  /** Quests of the kinds you can do now, topped up with monster slaying to three; the week adds days of dailies. */
  private makeQuests(defs: Array<{ kind: QuestKind; need: number }>, kills: number, weekly: boolean): Quest[] {
    const open = (kind: QuestKind) => EVENTS.some((e) => e.kind === kind && this.eventUnlocked(e.id));
    const out: Quest[] = defs.filter((d) => open(d.kind)).map((d) => ({ ...d, have: 0 }));
    if (out.length < defs.length) out.push({ kind: 'kills', need: kills, have: 0 });
    if (weekly) out.push({ kind: 'dailies', need: WEEKLY_DAILIES, have: 0 });
    return out;
  }

  /** Counts progress toward today's and this week's quests of a kind. */
  private questProgress(kind: QuestKind, n = 1): void {
    this.rollQuests();
    const q = this.state.quests;
    for (const quest of [...q.daily, ...q.weekly]) if (quest.kind === kind) quest.have = Math.min(quest.need, quest.have + n);
    this.checkQuests();
  }

  /** Kill quests catch up with your kills; finishing every daily counts a day toward the week's. */
  private checkQuests(): void {
    const q = this.state.quests;
    const kills = this.state.stats.totalKills;
    for (const quest of q.daily) if (quest.kind === 'kills') quest.have = Math.min(quest.need, Math.max(0, kills - q.dayKills));
    for (const quest of q.weekly) if (quest.kind === 'kills') quest.have = Math.min(quest.need, Math.max(0, kills - q.weekKills));
    if (!q.dailyDone && questsDone(q.daily)) {
      q.dailyDone = true;
      for (const quest of q.weekly) if (quest.kind === 'dailies') quest.have = Math.min(quest.need, quest.have + 1);
    }
  }

  /** Today's quests (refreshed). */
  get dailyQuests(): Quest[] {
    this.rollQuests();
    this.checkQuests();
    return this.state.quests.daily;
  }

  get weeklyQuests(): Quest[] {
    this.rollQuests();
    this.checkQuests();
    return this.state.quests.weekly;
  }

  /** Collects GEMS_DAILY once every daily quest is done (once a day). */
  claimDaily(): boolean {
    const q = this.state.quests;
    if (q.dailyClaimed || !questsDone(this.dailyQuests)) return false;
    q.dailyClaimed = true;
    this.state.gems += GEMS_DAILY;
    return true;
  }

  claimWeekly(): boolean {
    const q = this.state.quests;
    if (q.weeklyClaimed || !questsDone(this.weeklyQuests)) return false;
    q.weeklyClaimed = true;
    this.state.gems += GEMS_WEEKLY;
    return true;
  }

  /** The daily check-in bonus (after an ad, or straight away once ads are removed), once a day. */
  claimCheckIn(): boolean {
    this.rollQuests();
    if (this.state.quests.checkIn) return false;
    this.state.quests.checkIn = true;
    this.state.gems += GEMS_CHECKIN;
    return true;
  }

  /** Something in the quest log waiting to be collected. */
  get questsClaimable(): boolean {
    const q = this.state.quests;
    return (!q.checkIn && this.state.quests.day === dayKey(this.clock())) || (!q.dailyClaimed && questsDone(this.dailyQuests)) || (!q.weeklyClaimed && questsDone(this.weeklyQuests));
  }

  /** Seconds until there's enough energy for an event (0 if there already is). */
  energyWait(id: string): number {
    return Math.max(0, (this.energyCost(id) - this.state.energy) * this.energyRegen);
  }

  /** Something (a Guardian or a timed event) is running right now. */
  get eventRunning(): boolean {
    return this.guardianActive || this.activeEvent !== null;
  }

  eventReady(id: string): boolean {
    // Minigames are played on their own screen, so they don't wait for (or block) the battlefield's events.
    const mini = eventDef(id).kind === 'minigame';
    return this.eventUnlocked(id) && this.energyWait(id) <= 0 && (mini || !this.eventRunning);
  }

  /** Starts an event, travelling to its area first, and spends its energy. */
  startEvent(id: string): boolean {
    if (!this.eventReady(id)) return false;
    const def = eventDef(id);
    const st = this.state.events[id];
    this.state.energy = Math.max(0, this.state.energy - this.energyCost(id));
    if (def.kind === 'minigame') {
      // Played on its own screen; its rewards come from finishMinigame.
      st.runs++;
      this.emit({ type: 'eventStart', event: id });
      return true;
    }
    if (def.area !== this.state.area) this.travel(def.area);
    st.runs++;
    if (def.kind === 'guardian') {
      this.guardianActive = true;
      // Okrin's Giant Slayer: a charge is spent on this challenge.
      this.slayer = this.spendBuff('icebreaker');
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

  /**
   * A minigame's rewards for a score. Gold: `par` points earn MINIGAME_INCOME_NEW seconds of your gold income while
   * its area is the furthest you've reached, MINIGAME_INCOME seconds' after that (so it keeps up with your income),
   * and never less than its old pay of Guardian bounties of the furthest area per point. Materials: one per `per` points.
   */
  minigameReward(id: string, score: number): { gold: number; materials: Partial<Record<MaterialId, number>> } {
    const def = eventDef(id);
    const r = def.rewards;
    if (!r || score <= 0) return { gold: 0, materials: {} };
    const top = this.unlockedAreas[this.unlockedAreas.length - 1];
    const floor = Math.max(areaDef(def.area).gold, areaDef(top).gold) * GUARDIAN_GOLD_MULT * r.gold * score;
    const income = this.goldPerSecond() * (def.area === top ? MINIGAME_INCOME_NEW : MINIGAME_INCOME) * (score / r.par);
    const gold = Math.max(floor, income);
    const materials: Partial<Record<MaterialId, number>> = {};
    for (const m of r.materials) {
      const n = Math.floor(score / m.per);
      if (n > 0) materials[m.material] = n;
    }
    return { gold, materials };
  }

  /**
   * Your gold income per second: where you are (with the Hunters beside you) plus every stationed group. Measured
   * from the farming rates, refreshed every few seconds.
   */
  goldPerSecond(): number {
    if (this.goldRate === null || this.goldRateAge >= 5) {
      const s = this.state;
      let gold = this.ratesFor(s.area, ['main', ...this.helpersHere]).gold;
      for (const area of AREAS) {
        const group = area.id === s.area ? [] : this.stationedIn(area.id);
        if (group.length) gold += this.ratesFor(area.id, group, STATION_EFFICIENCY).gold;
      }
      this.goldRate = gold;
      this.goldRateAge = 0;
    }
    return this.goldRate;
  }

  /** Stars (0 to 3) a minigame score earns. */
  starsFor(id: string, score: number): number {
    return score > 0 ? minigameStars(eventDef(id)).filter((t) => score >= t).length : 0;
  }

  /** Extra quality rolls a minigame score earns (0 to 3), for the ones that bless Refine or Enchant. */
  blessingFor(id: string, score: number): number {
    const b = eventDef(id).blessing;
    return b ? b.tiers.filter((t) => score >= t).length : 0;
  }

  /** A minigame ended with `score`: pays out its rewards and counts as completed. */
  finishMinigame(id: string, score: number): { gold: number; materials: Partial<Record<MaterialId, number>> } {
    const reward = this.minigameReward(id, score);
    const s = this.state;
    s.gold += reward.gold;
    s.stats.totalGold += reward.gold;
    for (const [m, n] of Object.entries(reward.materials)) this.gainMaterial(m as MaterialId, n!);
    if (score > 0) this.completeEvent(id);
    // Kargesh's and Marceline's minigames: a blessing on the next Refine / Enchant, by score (the better one stays).
    const def = eventDef(id);
    if (def.blessing) {
      const tier = this.blessingFor(id, score);
      if (tier > 0) s.blessings[def.blessing.kind] = Math.max(this.blessingCharges(def.blessing.kind) > 0 ? s.blessings[def.blessing.kind] : 0, tier);
    }
    if (def.minigame) this.fillBuff(def.minigame, id, score);
    const st = s.events[id];
    if (st) st.best = Math.max(st.best ?? 0, score);
    return reward;
  }

  private completeEvent(id: string): void {
    const st = this.state.events[id];
    if (!st) return;
    st.completed++;
    const kind = eventDef(id).kind;
    this.questProgress(kind);
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

  /** Refills event energy (also used for time away). */
  private coolEvents(seconds: number): void {
    // Refills up to the max; an overcharged bar (from an ad) just waits to be spent.
    if (this.state.energy < this.energyMax) this.state.energy = Math.min(this.energyMax, this.state.energy + seconds / this.energyRegen);
    this.goldRateAge += seconds;
  }

  /** Field calls this when it puts the Guardian on the field. */
  bossSpawned(): void {
    this.bossAlive = true;
    this.bossTimer = GUARDIAN_TIME + (this.slayer ? BUFF_SLAYER_TIME : 0);
  }

  private endGuardian(): void {
    this.guardianActive = false;
    this.slayer = false;
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
      hp: area.hp * def.hp * emp('hp') * (1 + evo.hp),
      speed: area.speed * def.speed * (1 + evo.speed) * swarm.speed,
      gold: area.gold * def.gold * emp('gold') * (1 + evo.gold) * this.areaPerk(def.area).gold * (this.buffOn('graveRobbing') ? 1 + BUFF_GOLD : 1) * this.premiumMult('gold'),
      spawnRate: b.unlocked ? Math.max(def.spawn * emp('spawn') * (1 + evo.spawn) * (isGolem(def) ? 1 : idol.spawn) * swarm.spawn, swarm.spawn ? (ev?.minSpawn?.[id] ?? 0) : 0) : 0,
      dropChance: BASE_DROP_CHANCE * emp('drops') * (1 + evo.drops) * (this.buffOn('huntingPractice') ? 1 + BUFF_KEEN_EYE : 1) * this.premiumMult('drops'),
      material: def.material,
      split: Math.min(1, evo.split),
      fireTrail: Math.min(1, evo.fireTrail),
      lunge: evo.lunge > 0,
      rise: Math.min(1, evo.rise),
      burst: Math.min(1, evo.burst),
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
    this.tickPotions(dt);
    this.questAge += dt;
    if (this.questAge >= 5) {
      this.questAge = 0;
      this.rollQuests();
      this.checkQuests();
    }
    // Timed minigame buffs run down while you play.
    for (const id of Object.keys(s.buffs) as MinigameId[]) if (MINIGAME_BUFFS[id].kind === 'timed') s.buffs[id] = Math.max(0, s.buffs[id]! - dt);
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
        cached = { key, rates: this.ratesFor(area.id, group, STATION_EFFICIENCY), age: 0 };
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

  /** Auto Salvage shows up once you've reached the Restless Graveyard. */
  get autoSalvageOpen(): boolean {
    return this.state.areas.graveyard.unlocked;
  }

  /** Ted the Gambler's odds in an area (where he's stationed, your area included): double, bust. */
  gambleIn(area: AreaId): { double: number; bust: number } | null {
    for (const h of HUNTERS) if (h.gamble && this.state.hunters[h.id].recruited && this.state.hunters[h.id].station === area) return h.gamble;
    return null;
  }

  /** What Double or Nothing pays on average in an area (1 without Ted there), for the estimated farm rates. */
  gambleMult(area: AreaId): number {
    const g = this.gambleIn(area);
    return g ? 1 + g.double - g.bust : 1;
  }

  /** Field calls this for every enemy killed. */
  registerKill(type: EnemyId, boss: boolean, shooter: Shooter = 'main', golden = false): KillReward {
    const s = this.state;
    const e = this.enemyStats(type);
    // The kill's drops, gathered up for one 'gains' event (not the auto-salvaged gear's refunds).
    const got: Partial<Record<MaterialId, number>> = {};
    const gain = (m: MaterialId, n: number): void => {
      if (n <= 0) return;
      this.gainMaterial(m, n);
      got[m] = (got[m] ?? 0) + n;
    };
    const told = (): void => {
      if (Object.keys(got).length) this.emit({ type: 'gains', materials: got });
    };
    s.stats.totalKills++;
    s.stats.hunterKills[shooter] = (s.stats.hunterKills[shooter] ?? 0) + 1;
    if (boss) {
      const gold = areaDef(s.area).gold * GUARDIAN_GOLD_MULT;
      s.gold += gold;
      s.stats.totalGold += gold;
      s.areas[s.area].gold += gold;
      gain(e.material, BOSS_MATERIAL_DROP);
      this.dropLoot(s.area); // every Guardian carries a piece
      s.stats.guardians++;
      const next = this.lockedNext;
      this.endGuardian();
      told(); // once the fight's over, so its drops pop up (the pop-ups are hidden during the fight)
      this.completeEvent(`guardian-${s.area}`);
      if (next) {
        s.areas[next].unlocked = true;
        this.emit({ type: 'areaUnlocked', area: next });
      } else if (!nextAreaOf(s.area)) this.emit({ type: 'finalGuardian' });
      return { gold, material: e.material, amount: BOSS_MATERIAL_DROP };
    }
    // Double or Nothing (Ted in this area): the kill pays twice, or nothing at all.
    const odds = this.gambleIn(enemyDef(type).area);
    const roll = odds ? this.rng() : 1;
    const luck = odds && roll < odds.double ? 'double' : odds && roll < odds.double + odds.bust ? 'bust' : undefined;
    const lm = luck === 'double' ? 2 : luck === 'bust' ? 0 : 1;
    const gold = e.gold * this.shooterGold(shooter) * lm * (golden ? GOLDEN_GOLD : 1);
    s.gold += gold;
    s.stats.totalGold += gold;
    s.areas[enemyDef(type).area].gold += gold;
    s.bestiary[type].kills++;
    // Past 100% a kill drops several: each full 100% is a sure drop, the rest the chance of one more.
    const chance = e.dropChance * this.shooterDrops(shooter) * (golden ? GOLDEN_DROPS : 1);
    const amount = dropsFrom(chance, this.rng()) * lm;
    gain(e.material, amount);
    // More drops (a Forest Wolf's Beast Bone, a golem's rarer stones), each at its share of the chance.
    for (const d of enemyExtraDrops(enemyDef(type))) gain(d.material, dropsFrom(chance * d.share, this.rng()) * lm);
    // Legacies of fully evolved monsters of its archetype (every slime's chance at Royal Slime).
    for (const d of this.legacyDrops(enemyDef(type).archetype)) gain(d.material, dropsFrom(chance * d.share, this.rng()) * lm);
    s.areas[enemyDef(type).area].kills++;
    // Gear that finds extra materials (the Slime Vial at 5★: Royal Slime from slimes).
    for (const item of this.equipped(shooter)) {
      const fd = item ? gearDef(item.base).findDrop : undefined;
      if (item && fd && item.stars >= fd.stars && enemyDef(type).archetype === fd.archetype && this.rng() < fd.chance) gain(fd.material, 1);
    }
    told();
    // Scavenged Goods (a Goblin evolution): its own extra chance of a piece of loot from its area.
    const loot = (lootChance(type) + this.evo(type).loot) * this.areaPerk(enemyDef(type).area).loot;
    if (loot > 0 && this.rng() < loot) this.dropLoot(enemyDef(type).area);
    return { gold, material: amount > 0 ? e.material : null, amount, luck };
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
      return {
        sh,
        stunTime: this.stunTime(false, sh),
        // A shield regains one charge every GUARD_RECHARGE seconds, however many it holds.
        guardRate: this.guardOf(sh) > 0 ? 1 / GUARD_RECHARGE : 0,
        /** Effective hits per second, counting pellets and how many monsters each attack reaches. */
        shots: this.shooterRate(sh) + this.specialHitRate(sh),
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
    const luck = this.gambleMult(area);
    for (const e of roster) {
      const k = e.spawnRate * killFrac.get(e.id)! * efficiency;
      out.kills[e.id] = k;
      out.killsTotal += k;
      out.gold += k * e.gold * goldPerk * luck;
      out.materials[e.material] = (out.materials[e.material] ?? 0) + k * e.dropChance * dropPerk * luck;
      for (const d of [...enemyExtraDrops(enemyDef(e.id)), ...this.legacyDrops(e.archetype)]) out.materials[d.material] = (out.materials[d.material] ?? 0) + k * e.dropChance * dropPerk * d.share * luck;
    }
    for (const h of hunters) {
      out.stuns[h.sh] = h.stunRate * efficiency;
      out.stunned[h.sh] = h.down;
      out.share[h.sh] = (this.dpsOf(h.sh) * (1 - h.down)) / hunters.reduce((sum, x) => sum + this.dpsOf(x.sh) * (1 - x.down), 0) || 1 / hunters.length;
    }
    return out;
  }

  /**
   * What a group's background battlefield sample (sampler.ts) depends on: who's in it, their strength and gear,
   * and the area's monsters, rounded so small steps (one training session) don't throw the sample away.
   */
  sampleSig(area: AreaId, group: Shooter[]): string {
    const r = (n: number) => (Number.isFinite(n) && n !== 0 ? Number(n.toPrecision(2)) : n);
    const hunters = group.map((sh) => [
      sh,
      r(this.dpsOf(sh)),
      r(this.shooterRange(sh)),
      r(this.shooterRate(sh)),
      this.guardOf(sh),
      this.equipped(sh).map((it) => (it ? `${it.base}${it.stars}` : '')),
    ]);
    const monsters = this.roster(area).map((e) => [e.id, r(e.hp), r(e.speed), r(e.spawnRate), r(e.gold), r(e.dropChance)]);
    return JSON.stringify([hunters, monsters, r(this.areaPerk(area).gold)]);
  }

  /**
   * Rates measured on an area's background battlefield for this group (whatever strength it was measured at),
   * scaled by `efficiency`; null if there's no sample of this group there yet.
   */
  measuredRates(area: AreaId, group: Shooter[], efficiency = 1): FarmRates | null {
    const smp = this.state.samples[area];
    if (!smp || smp.seconds < SAMPLE_MIN_SECONDS || smp.group.length !== group.length || !group.every((sh) => smp.group.includes(sh))) return null;
    const per = efficiency / smp.seconds;
    const out: FarmRates = { kills: {}, killsTotal: 0, gold: smp.gold * per, materials: {}, stuns: {}, stunned: {}, share: {} };
    for (const [id, n] of Object.entries(smp.kills) as [EnemyId, number][]) {
      out.kills[id] = n * per;
      out.killsTotal += n * per;
    }
    for (const [m, n] of Object.entries(smp.materials) as [MaterialId, number][]) out.materials[m] = n * per;
    const hk = group.reduce((sum, sh) => sum + (smp.hunterKills[sh] ?? 0), 0);
    for (const sh of group) {
      out.stuns[sh] = (smp.stuns[sh] ?? 0) * per;
      out.stunned[sh] = Math.min(1, (smp.down[sh] ?? 0) / smp.seconds);
      out.share[sh] = hk > 0 ? (smp.hunterKills[sh] ?? 0) / hk : 1 / group.length;
    }
    return out;
  }

  /** A group's farming rates in an area: measured on its background battlefield if it has been, else estimated. */
  ratesFor(area: AreaId, group: Shooter[], efficiency = 1): FarmRates {
    return this.measuredRates(area, group, efficiency) ?? this.farmRates(area, group, efficiency);
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
      lootRate += rate * (lootChance(id) + this.evo(id).loot);
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

  /**
   * A node is reachable once any node it hangs from has a rank (the root always is) and its row is open: enough
   * points spent in this tree (see rowGates). Ascend needs the whole first tree.
   */
  nodeReachable(who: Wearer, id: string, which: TreeKind = 'base'): boolean {
    if (which === 'base' && id === 'ascend') return this.baseTreeComplete(who);
    const node = this.treeNode(who, id, which);
    return !!node && this.rowOpen(who, node.row, which) && (node.requires.length === 0 || node.requires.some((r) => this.skill(who, r, which) > 0));
  }

  /** Points spent in one of a Hunter's trees. */
  pointsIn(who: Wearer, which: TreeKind = 'base'): number {
    return this.skillTree(who, which).reduce((a, n) => a + this.skill(who, n.id, which) * (n.cost ?? 1), 0);
  }

  /** Points needed in a tree before a row of it opens (0 if it's open from the start). */
  rowGate(who: Wearer, row: number, which: TreeKind = 'base'): number {
    return rowGates(which === 'base' ? who : `${who}+`)[row] ?? 0;
  }

  rowOpen(who: Wearer, row: number, which: TreeKind = 'base'): boolean {
    return this.pointsIn(who, which) >= this.rowGate(who, row, which);
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

  /** Whether a Journal entry's unlock condition has been met. */
  journalUnlocked(e: JournalEntry): boolean {
    const u = e.unlock;
    switch (u.kind) {
      case 'start':
        return true;
      case 'kills':
        return (this.state.bestiary[u.enemy]?.kills ?? 0) >= u.count;
      case 'monster':
        return !!this.state.bestiary[u.enemy]?.unlocked;
      case 'area':
        return !!this.state.areas[u.area]?.unlocked;
      case 'event':
        return this.eventCompletions(u.event) >= u.times;
      case 'hunter':
        return !!this.state.hunters[u.hunter]?.recruited;
      case 'level':
        return this.levelOf('main') >= u.level;
    }
  }

  /** Journal entries unlocked but not yet read. */
  unreadJournal(): JournalEntry[] {
    return JOURNAL.filter((e) => this.journalUnlocked(e) && !this.state.seen.journal.includes(e.id));
  }

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
    this.outfitRecruit(id);
    // New recruits join you where you are, if there's room.
    this.station(id, this.state.area);
    this.emit({ type: 'recruit', hunter: id });
    return true;
  }

  /**
   * A new recruit comes with gear of their own, about as good as yours: for each of their slots, a new 1★ piece
   * that fits it, from the recipes whose materials you've found, as close as possible to (but not above) the tier
   * of what your Hunter wears in that kind of slot (or your best piece if you've nothing of that kind on).
   */
  private outfitRecruit(id: HunterId): void {
    const s = this.state;
    const mine = this.equipped('main').filter((it): it is GearItem => !!it).map((it) => gearDef(it.base));
    if (!mine.length) return;
    const best = Math.max(...mine.map(gearTier));
    const found = (gd: GearDef) => (Object.keys(gd.recipe) as MaterialId[]).every((m) => s.materials[m] > 0 || (s.stats.matGained[m] ?? 0) > 0);
    const pool = GEAR.filter((gd) => !gd.starter && !gd.special && found(gd));
    this.slotsOf(id).forEach((slot, i) => {
      if (this.equipped(id)[i]) return;
      const fits = pool.filter((gd) => slotAccepts(slot, gd));
      if (!fits.length) return;
      const like = mine.find((gd) => slotAccepts(slot, gd));
      const target = like ? gearTier(like) : best;
      const under = fits.filter((gd) => gearTier(gd) <= target + 1e-9);
      const pick = (under.length ? under : fits).reduce((a, b) => (under.length ? gearTier(b) > gearTier(a) : gearTier(b) < gearTier(a)) ? b : a);
      const item: GearItem = { uid: s.nextGearUid++, base: pick.id, stars: 1 };
      s.inventory.push(item);
      this.equip(id, i, item.uid);
    });
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

  /** A monster's own evolution tree (its archetype's nodes, ending in its own Legacy). */
  evoTree(id: EnemyId): EvoNode[] {
    return MONSTER_EVO_TREES[id];
  }

  /** The drops every monster of an archetype gains from the Legacies of its fully evolved monsters. */
  legacyDrops(archetype: Archetype): Array<{ material: MaterialId; share: number }> {
    const out: Array<{ material: MaterialId; share: number }> = [];
    for (const e of ENEMIES) {
      if (e.archetype !== archetype || e.guardianOnly) continue;
      const cap = MONSTER_EVO_TREES[e.id].find((n) => n.legacy);
      if (cap?.legacy && this.evoRank(e.id, cap.id) > 0) out.push(cap.legacy);
    }
    return out;
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
    const n = evoNode(id, node);
    return !!n && (n.requires.length === 0 || n.requires.some((r) => this.evoRank(id, r) > 0));
  }

  /** Kills of this monster still needed before an evolution node opens (0 = open). */
  evoKillsLeft(id: EnemyId, node: string): number {
    const n = evoNode(id, node);
    return n ? Math.max(0, evoKillsNeeded(enemyDef(id), n) - this.state.bestiary[id].kills) : 0;
  }

  canEvolve(id: EnemyId, node: string): boolean {
    const n = evoNode(id, node);
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
    const total: Record<EvoStat, number> = { hp: 0, gold: 0, drops: 0, spawn: 0, pack: 0, speed: 0, split: 0, fireTrail: 0, lunge: 0, loot: 0, rise: 0, burst: 0 };
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
    if (stars >= itemMaxStars(def)) return false;
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

  /**
   * Doubles a time-away's gold and materials (after watching an ad), once. The report's numbers double with them.
   */
  doubleOffline(r: OfflineResult): boolean {
    if (r.doubled || (r.gold <= 0 && !Object.keys(r.materials).length)) return false;
    r.doubled = true;
    this.state.gold += r.gold;
    this.state.stats.totalGold += r.gold;
    r.gold *= 2;
    for (const [m, n] of Object.entries(r.materials) as [MaterialId, number][]) {
      this.gainMaterial(m, n);
      r.materials[m] = n * 2;
    }
    for (const a of r.areas) {
      a.gold *= 2;
      for (const m of Object.keys(a.materials) as MaterialId[]) a.materials[m]! *= 2;
    }
    return true;
  }

  /** Applies progress for time spent away: you (plus anyone stationed with you) and every stationed Hunter. */
  applyOffline(now = Date.now()): OfflineResult {
    const s = this.state;
    const { away, seconds } = capAway((now - s.lastSeen) / 1000, this.offlineCapSec());
    this.coolEvents(away);
    // Timed buffs only run while you play, so they don't count while you're away.
    this.away = true;
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
    // The Dreamcatcher upgrades: more of everything earned while away.
    const dream = this.premiumMult('offline');
    add(s.area, withYou, this.accrue(s.area, this.ratesFor(s.area, withYou, OFFLINE_EFFICIENCY * dream), seconds, true));
    for (const area of AREAS) {
      const group = this.stationedIn(area.id);
      if (area.id === s.area || !group.length) continue;
      add(area.id, group, this.accrue(area.id, this.ratesFor(area.id, group, STATION_EFFICIENCY * OFFLINE_EFFICIENCY * dream), seconds, true));
    }
    s.lastSeen = now;
    this.away = false;
    // With ads removed, the gold and materials come doubled (what watching the ad would do).
    if (s.noAds) this.doubleOffline(result);
    return result;
  }
}

/** The local date as YYYY-MM-DD (daily quests reset at local midnight). */
export function dayKey(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** The local date of the week's Monday (weekly quests reset at midnight going into Monday). */
export function weekKey(t: number): string {
  const d = new Date(t);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return dayKey(d.getTime());
}

export const questsDone = (list: Quest[]): boolean => list.length > 0 && list.every((q) => q.have >= q.need);
