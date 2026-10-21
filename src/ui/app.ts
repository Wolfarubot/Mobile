import {
  modSlotCount,
  SPELLS,
  staffSpell,
  ASCEND_LEVEL,
  ASCEND_NODE,
  WEAPON_CLASSES,
  WEAPON_ARCHETYPES,
  weaponArchetype,
  MAX_LEVEL,
  MAIN_ASCEND_LEVEL,
  MAIN_MAX_LEVEL,
  EMPOWER_SESSIONS_PER_LEVEL,
  MAX_MONSTER_LEVEL,
  EMPOWER_UNLOCK_KILLS,
  TRAIN_UNLOCK_KILLS,
  enemyDef,
  FLYING,
  GUARDIAN_ENEMY,
  EMPOWER,
  type EnemyId,
  type TreeNode,
  RESIST_MULT,
  WEAK_MULT,
  DAMAGE_TYPES,
  type DamageType,
  type WeaponClass,
  type WeaponClassDef,
  slotAccepts,
  areaDef,
  areaEnemies,
  AREAS,
  ARCHETYPES,
  describeGear,
  describeEffect,
  effectBase,
  ARMOR_TYPES,
  GEAR_STAR_POWER,
  enemyDrops,
  enemyExtraDrops,
  dropRarity,
  lootChance,
  SUMMON_TYPES,
  tomeSummonType,
  ENEMIES,
  enemyUnlockCost,
  GEAR,
  gearArea,
  GEAR_KINDS,
  MAX_STARS,
  itemLevel,
  itemMaxStars,
  gearCost,
  gearColor,
  gearDef,
  gearTypes,
  SPECIAL_TYPE,
  gearTotals,
  GEAR_STATS,
  gearSummary,
  hitText,
  weaponHit,
  HUNTERS,
  hunterDef,
  hunterAbilities,
  hunterWeaponsNote,
  MAIN_ABILITIES,
  MAIN_SHORT,
  TAP_ABILITIES,
  type TapAbilityId,
  itemCost,
  ITEMS,
  materialDef,
  MATERIALS,
  nextAreaOf,
  EVENTS,
  eventDef,
  type EventDef,
  RARITIES,
  REFINES,
  ENCHANTS,
  ENERGY_MAX,
  isUniqueEnchant,
  enchantTierHit,
  modValue,
  modPower,
  modPerfect,
  STATION_CAPACITY,
  STATION_EFFICIENCY,
  type AreaId,
  type EnemyDef,
  type GearDef,
  type GearStat,
  type GearId,
  type HunterDef,
  type HunterId,
  type ItemDef,
  type MaterialId,
  type Rarity,
} from '../core/balance';
import { fmt, fmtDps, fmtTime } from '../core/format';
import { Game, type FarmRates, type TreeKind } from '../core/game';
import type { OfflineResult } from '../core/offline';
import { COOLDOWN_POSITIONS, deserialize, TAB_IDS, type GameState, type GearMod, type AudioSettings, type BuyAmount, type CooldownPos, type DpsCorner, type FxKey, type IndicatorStyle, type GearItem, type TabId, type Wearer } from '../core/state';
import { queuePortrait } from '../render/battle';
import { drawFramedBar, TIMER_COLOR } from '../render/hudBars';
import { gearIconUrl, spriteUrl } from '../render/sprites';
import { MATERIAL_SPRITES } from '../core/materialSprites';
import { GEAR_SPRITES } from '../core/gearSprites';
import { NODE_SPRITES } from '../core/nodeSprites';
import { hunterIconHtml } from './hunterIcons';
import { buzz, setHaptics } from './haptics';
import { AREA_MUSIC, GUARDIAN_MUSIC, playMusic, setMusicVolume, SWARM_MUSIC } from './music';
import { pressSound, setSfxVolume, sfx } from './sound';
import { JOURNAL, type JournalEntry } from '../core/journal';
import { App as CapApp } from '@capacitor/app';
import { MINIGAMES, runMinigame } from './minigames';
import { applyAreaTheme, applyUiStyle } from './theme';
import { playCutscene, TIME_EATER_CUTSCENE } from './cutscene';
import { applyFont, fontDef, FONTS } from './fonts';
import { GainPops } from './gainPops';
import { ARCHETYPE_TAG_ICONS, ARMOR_TAG_ICONS, DAMAGE_TAG_ICONS, EFFECT_TAG_ICONS, FEATURE_TAG_ICONS, SPECIAL_TAG_ICON, SUMMON_TAG_ICONS, tagIconHtml } from './tagIcons';

type Tab = TabId;
/** What treeView needs to draw and drive a skill or evolution tree. */
interface TreeAdapter {
  nodes: TreeNode[];
  /** Which tree this is in NODE_SPRITES ("main", a Hunter id, + "+" for Ascended, or "evo:<monster>"). */
  spriteTree: string;
  rank: (id: string) => number;
  points: () => number;
  active: () => boolean;
  inactiveText: string;
  waitText: () => string;
  pointName: string;
  reachable: (id: string) => boolean;
  canLearn: (id: string) => boolean;
  learn: (id: string) => boolean;
  verb: string;
  /** Why a node is still closed beyond its prerequisites (e.g. kills needed), or null. */
  gate?: (id: string) => string | null;
  /** Nodes not shown yet (the Ascend node until the first tree is complete). */
  hidden?: (id: string) => boolean;
  /** Points spent in the tree and needed before a row opens (null if the row has no gate). */
  rowGate?: (row: number) => { have: number; need: number } | null;
  /** Called after a node is learned. */
  after?: (id: string) => void;
}
const INV_SUBS = ['equipment', 'crafting', 'materials'] as const;
type InvSub = (typeof INV_SUBS)[number];
/** Inventory Equipment filters. Types cycle in this order; weapons are split by how they fight. */
const INV_TYPES = [
  { id: 'all', name: 'All types', icon: '🎒' },
  { id: 'melee', name: 'Melee', icon: '⚔️' },
  { id: 'ranged', name: 'Ranged', icon: '🏹' },
  { id: 'magic', name: 'Magic', icon: '🪄' },
  { id: 'armor', name: 'Armor', icon: '🦺' },
  { id: 'accessory', name: 'Accessories', icon: '💍' },
  { id: 'upgrades', name: 'Upgrades', icon: '⛺' },
] as const;
type InvType = (typeof INV_TYPES)[number]['id'];
const LEVEL_FILTERS = [
  { id: 'any', name: 'Any', min: 0, max: Infinity },
  { id: '1', name: '1★', min: 1, max: 1 },
  { id: '2', name: '2★', min: 2, max: 2 },
  { id: '3', name: '3★', min: 3, max: 3 },
  { id: '4', name: '4★', min: 4, max: 4 },
  { id: '5', name: '5★', min: 5, max: 5 },
] as const;
type LevelFilter = (typeof LEVEL_FILTERS)[number]['id'];
interface InvFilter {
  type: InvType;
  rarity: Rarity | 'any';
  level: LevelFilter;
  /** A damage type, or 'special' for Special weapons (Elemental Cataclysm). */
  dtype: DamageType | 'any' | 'special';
  /** A stat the piece raises (area size, crit, attack rate...), for building toward one. */
  bonus: GearStat | 'any';
}
const NO_FILTER: InvFilter = { type: 'all', rarity: 'any', level: 'any', dtype: 'any', bonus: 'any' };
/** The Bonuses filter: every stat gear can raise, in the order a player thinks of them. */
const BONUS_FILTERS: Array<{ id: GearStat; name: string; icon: string }> = [
  { id: 'damage', name: 'Damage', icon: '⚔️' },
  { id: 'rate', name: 'Attack speed', icon: '⚡' },
  { id: 'crit', name: 'Crit chance', icon: '🎯' },
  { id: 'radius', name: 'Area size', icon: '💥' },
  { id: 'range', name: 'Range', icon: '📏' },
  { id: 'pierce', name: 'Pierce', icon: '➡️' },
  { id: 'stun', name: 'Stun time', icon: '💫' },
  { id: 'guard', name: 'Shield', icon: '🛡️' },
  { id: 'gold', name: 'Gold', icon: '🪙' },
  { id: 'drops', name: 'Drops', icon: '💎' },
];
/** Does a gear recipe match a filter (its type, rarity, damage type and bonus; stars aside)? */
const gearMatches = (gd: GearDef, f: InvFilter): boolean =>
  (f.type === 'all' || GEAR_TYPE[gd.kind] === f.type) &&
  (f.rarity === 'any' || gd.rarity === f.rarity) &&
  (f.dtype === 'any' || (f.dtype === 'special' ? !!gd.special : gearTypes(gd).includes(f.dtype))) &&
  (f.bonus === 'any' || (gearTotals(gd, 1)[f.bonus] ?? 0) > 0);
const filtering = (f: InvFilter): boolean => f.type !== 'all' || f.rarity !== 'any' || f.level !== 'any' || f.dtype !== 'any' || f.bonus !== 'any';
/** The chips under a Filter button: one per active filter, then Clear. */
function filterChips(chips: HTMLElement, f: InvFilter, clear: () => void): void {
  chips.innerHTML = '';
  if (f.type !== 'all') {
    const t = INV_TYPES.find((x) => x.id === f.type)!;
    chips.appendChild(el('span', 'filter-chip', `${t.icon} ${t.name}`));
  }
  if (f.rarity !== 'any') {
    const c = el('span', 'filter-chip', RARITIES[f.rarity].name);
    c.style.color = RARITIES[f.rarity].color;
    chips.appendChild(c);
  }
  if (f.level !== 'any') chips.appendChild(el('span', 'filter-chip', LEVEL_FILTERS.find((l) => l.id === f.level)!.name));
  if (f.dtype !== 'any') {
    const dt = f.dtype === 'special' ? SPECIAL_TYPE : DAMAGE_TYPES[f.dtype];
    const c = el('span', 'filter-chip', `${dt.icon} ${dt.name}`);
    c.style.color = dt.color;
    chips.appendChild(c);
  }
  if (f.bonus !== 'any') {
    const b = BONUS_FILTERS.find((x) => x.id === f.bonus)!;
    chips.appendChild(el('span', 'filter-chip', `${b.icon} ${b.name}`));
  }
  if (filtering(f)) {
    const btn = el('button', 'filter-clear', '✕ Clear');
    btn.addEventListener('click', clear);
    chips.appendChild(btn);
  }
}
/** Which filter type a gear kind falls under ('weapon' gear is ranged: bows, crossbows, rifles). */
const GEAR_TYPE: Record<string, InvType> = { weapon: 'ranged', melee: 'melee', magic: 'magic', armor: 'armor', accessory: 'accessory' };

const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;

/** Who an Upgrade affects: every Hunter, or one area's monsters. */
/** Holding an area tile this long travels there; two taps this close together open its details. */
const AREA_HOLD_MS = 550;
const DOUBLE_TAP_MS = 350;
/** One-time tips wait at least this long after the last popup opened or closed. */
const POPUP_GAP_MS = 30_000;
/** Holding a tab this long raises (or drops) the full-screen menu. */
const MENU_HOLD_MS = 450;

const upgradeReach = (it: ItemDef): string => (it.area ? `affects the ${areaDef(it.area.id).name}` : it.once ? 'crafted once' : 'works in every area');

/** A star rank for inside a `.stars` element: filled stars, then the rest dimmed. */
const starsHtml = (n: number): string => `${'★'.repeat(n)}<span class="off">${'★'.repeat(Math.max(0, MAX_STARS - n))}</span>`;
/** A piece of gear's icon: its pixel art when it has some (GEAR_SPRITES), otherwise its emoji. */
/** A tree node's pixel icon (see NODE_SPRITES), or its emoji. */
const nodeIcon = (t: { spriteTree: string }, n: TreeNode, cls = 'gi'): string => {
  const url = gearIconUrl(NODE_SPRITES[`${t.spriteTree}/${n.id}`]);
  return url ? `<img class="${cls}" src="${url}" alt="">` : n.icon;
};
/** An Upgrade's icon: its pixel sprite if it has one (the Energy Potions), otherwise its emoji. */
const upgradeIcon = (it: ItemDef): string => {
  const url = it.sprite ? gearIconUrl(it.sprite) : null;
  return url ? `<img class="gi" src="${url}" alt="">` : it.icon;
};

const gearIcon = (gd: GearDef): string => {
  const url = gearIconUrl(GEAR_SPRITES[gd.id]);
  return url ? `<img class="gi" src="${url}" alt="">` : gd.icon;
};

/**
 * Sets an element's HTML only when it changed: refreshes run several times a second, and rewriting identical
 * HTML still costs a restyle and an emoji-to-icon pass every time.
 */
const htmlCache = new WeakMap<Element, string>();
function setHtml(e: Element, html: string): void {
  if (htmlCache.get(e) === html) return;
  htmlCache.set(e, html);
  e.innerHTML = html;
}

/** A material's icon (its pixel art, or its coloured gem if it has none); size '' inline or 'big'. */
const gemHtml = (m: MaterialId, size = ''): string => {
  const url = gearIconUrl(MATERIAL_SPRITES[m]);
  return url ? `<img class="gem-ic ${size}" src="${url}" alt="">` : `<i class="gem ${size}" style="background:${materialDef(m).color}"></i>`;
};

/** DOM layer: top bar, area controls, tabbed panels and modals. Refreshes numbers on a timer. */
export class AppUI {
  private refreshers: Array<() => void> = [];
  /**
   * Farming rates and DPS for display, computed at most once a second each: they change slowly, and late games
   * show many of them (every Hunter card), so recomputing them on every refresh made the menus stutter.
   */
  private shownCache = new Map<string, { t: number; v: unknown }>();
  private cached<T>(key: string, f: () => T): T {
    const now = performance.now();
    const hit = this.shownCache.get(key);
    if (hit && now - hit.t < 1000) return hit.v as T;
    const v = f();
    this.shownCache.set(key, { t: now, v });
    return v;
  }
  private rates(area: AreaId, hunters: HunterId[], eff: number): FarmRates {
    return this.cached(`r:${area}:${hunters.join(',')}:${eff}`, () => this.game.ratesFor(area, hunters, eff));
  }
  private dpsOf(who: Wearer): number {
    return this.cached(`d:${who}`, () => this.game.dpsOf(who));
  }
  private panel = $('#panel');
  private modal = $('#modal');
  private modalClose: (() => void) | null = null;
  /** The open full-screen Hunter view, with its own refreshers. */
  private detail: { el: HTMLElement; refreshers: Array<() => void> } | null = null;
  /** A card shown over the Battle Field (e.g. a crafting recipe), with its own refresh. */
  private fieldCard: { el: HTMLElement; update: () => void } | null = null;
  /** Which tree an ascended Hunter's Skills tab last showed. */
  private treePick = new Map<Wearer, TreeKind>();
  /** The full-screen gear picker, above the Hunter view. */
  private picker: HTMLElement | null = null;
  private equipScreen: HTMLElement | null = null;
  private gearListOpen = false;
  private equipRefresh: (() => void) | null = null;
  private tab: Tab = 'hunters';
  /** The open sub-tab of the Inventory tab. */
  private invSub: InvSub = 'equipment';
  /** Filters on the Inventory's Equipment sub-tab (kept for the session). */
  private invFilter: InvFilter = { ...NO_FILTER };
  private craftFilter: InvFilter = { ...NO_FILTER };
  /** Equipment's Modify toggle: show only pieces that can be refined or enchanted, and open Modify when one is tapped. */
  private modifyMode = false;
  /** The open sub-tab of the monster view. */
  private monsterSub: 'stats' | 'evolution' = 'stats';
  /** The area selected in the Areas tab. */
  private selectedArea: AreaId | null = null;
  /** The Hunter whose card is shown under the Hunters grid. */
  private selectedHunter: Wearer = 'main';
  /** The monster whose card is pinned under the Bestiary's grid. */
  private selectedBeast: EnemyId | null = null;
  /** The event whose card is pinned under the Events tab's tiles. */
  private selectedEvent: string | null = null;
  /** The last area tile tapped, for double-taps (tiles are rebuilt on each tap). */
  private areaTap: { id: AreaId | null; at: number } = { id: null, at: 0 };
  /** The menu raised to full screen over the battlefield. */
  private menuFull = false;
  /** When the last popup opened or closed (performance.now), to space out the one-time tips. */
  private lastPopup = -Infinity;

  constructor(
    private game: Game,
    private hooks: {
      save: () => void;
      wipe: () => Promise<void>;
      devPhase: (phase: GameState) => Promise<void>;
      devRestore: () => Promise<void>;
      hasDevBackup: () => Promise<boolean>;
    },
  ) {
    document.querySelectorAll<HTMLButtonElement>('.tabs button').forEach((b) =>
      b.addEventListener('click', () => {
        if (b.dataset.tab === 'events' && !game.eventsOpen) this.showEventsLocked();
        else if (b.dataset.tab === 'areas' && !this.areasOpen) this.showAreasLocked();
        else this.setTab(b.dataset.tab as Tab);
      }),
    );
    $('#menuBtn').addEventListener('click', () => this.openMenu());
    // Any tap may change what the cached rates and DPS show (training, stationing, equipping): recompute them.
    document.addEventListener('pointerdown', () => this.shownCache.clear(), true);
    // A buzz when a button is pressed (on click, so a scroll that starts on a button doesn't buzz).
    document.addEventListener(
      'click',
      (e) => {
        const btn = (e.target as HTMLElement).closest?.('button');
        if (btn && !(btn as HTMLButtonElement).disabled) {
          buzz();
          pressSound(btn.closest('.tabs, .subtabs') ? 'tab' : 'button');
        }
      },
      true,
    );
    // Button press feedback: a quick squeeze, held long enough to see even on a fast tap.
    document.addEventListener(
      'pointerdown',
      (e) => {
        const btn = (e.target as HTMLElement).closest?.('button');
        if (!btn || (btn as HTMLButtonElement).disabled) return;
        btn.classList.add('pressing');
        const t0 = performance.now();
        const release = () => {
          window.removeEventListener('pointerup', release, true);
          window.removeEventListener('pointercancel', release, true);
          setTimeout(() => btn.classList.remove('pressing'), Math.max(0, 90 - (performance.now() - t0)));
        };
        window.addEventListener('pointerup', release, true);
        window.addEventListener('pointercancel', release, true);
      },
      true,
    );
    this.menuGestures();
    this.applySettings();
    // Panels that depend on which areas/enemies/Hunters exist are rebuilt when those change.
    // Materials picked up on the battlefield pop up in its bottom left.
    const pops = new GainPops($('#gainPops'), (m) => gemHtml(m), fmt);
    game.on((e) => {
      // Not during a Guardian fight: the fight matters more than its drops.
      if (e.type === 'gains' && !game.guardianActive && game.state.settings.pickups) for (const [m, n] of Object.entries(e.materials) as [MaterialId, number][]) pops.add(m, n);
      if (e.type === 'travel' || e.type === 'guardianChallenge') pops.clear();
      if (e.type === 'areaUnlocked' || e.type === 'unlock') sfx('unlock');
      else if (e.type === 'recruit') sfx('recruit');
      else if (e.type === 'eventComplete' || e.type === 'finalGuardian') sfx('eventWon');
      else if (e.type === 'eventStart') sfx('eventStart');
      else if (e.type === 'guardianFail') sfx('guardianEscapes');
      else if (e.type === 'loot' && !e.salvaged) sfx('gearDrop');
      if (e.type === 'areaUnlocked' || e.type === 'travel' || e.type === 'unlock' || e.type === 'recruit') this.setTab(this.tab, true);
      else if (e.type === 'eventComplete') this.setTab(this.tab, true); // may have made Hunters available
      else if (e.type === 'finalGuardian' && this.game.state.events['guardian-rift'].completed === 1) this.showRiftConquered();
      else if (e.type === 'eventStart' || e.type === 'eventEnd' || e.type === 'guardianFail') this.refresh();
      else if (e.type === 'loot') {
        const d = gearDef(e.gear);
        this.toast(e.salvaged ? `♻️ Looted and salvaged: ${d.icon} ${d.name}` : `🎁 Loot! ${d.icon} ${d.name}${e.stars > 1 ? ` ${e.stars}★` : ''}`);
        if (this.tab === 'inventory') this.setTab('inventory', true);
      }
    });
    this.setTab('hunters');
    // The music follows the battlefield: the area's track, or a Guardian's or swarm's while one is on.
    const pickMusic = () => {
      const area = game.state.area;
      const ev = game.activeEvent && eventDef(game.activeEvent.id);
      playMusic(game.guardianActive ? GUARDIAN_MUSIC[area] : ev?.kind === 'swarm' ? SWARM_MUSIC : AREA_MUSIC[area]);
    };
    pickMusic();
    setInterval(pickMusic, 500);
  }

  setTab(tab: Tab, keepScroll = false): void {
    if (tab !== this.tab || this.invSub !== 'crafting') this.closeFieldCard();
    // Gear shown in the Equipment list counts as seen once you leave it (its "!" stays up while you look).
    if (this.gearListOpen && !(tab === 'inventory' && this.invSub === 'equipment')) this.game.state.seen.gearUid = this.game.state.nextGearUid - 1;
    this.gearListOpen = false;
    this.tab = tab;
    document.querySelectorAll<HTMLButtonElement>('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    const scroll = keepScroll ? this.panel.scrollTop : 0;
    this.refreshers = [];
    this.panel.innerHTML = '';
    if (tab === 'hunters') this.buildHunters();
    else if (tab === 'areas') this.buildAreas();
    else if (tab === 'beasts') this.buildBestiary();
    else if (tab === 'inventory') this.buildInventory();
    else this.buildEvents();
    this.panel.scrollTop = scroll;
    this.refresh();
  }

  /** Cheap update of all visible numbers. */
  refresh(): void {
    const g = this.game;
    const s = g.state;
    const area = areaDef(g.area);
    $('#gold').textContent = fmt(s.gold);
    $('#dps').textContent = fmtDps(g.dps);
    $('#dpsMeter').className = `dps-meter dps-${s.settings.dpsCorner}${s.settings.dps ? '' : ' hidden'}`;
    $('#gainPops').className = `gain-pops gp-${s.settings.pickupCorner}${s.settings.pickups ? '' : ' hidden'}`;
    $('#areaName').textContent = area.name;
    $('#areaLabel').classList.toggle('hidden', !this.menuFull);
    applyAreaTheme(g.area);
    this.fieldCard?.update();

    $('.tabs button[data-tab=events]').classList.toggle('locked', !g.eventsOpen);
    $('.tabs button[data-tab=areas]').classList.toggle('locked', !this.areasOpen);
    // One-time tips, never two within POPUP_GAP of each other (or of any other popup).
    const tipReady = s.flags.welcome && !this.modalClose && !this.detail && performance.now() - this.lastPopup >= POPUP_GAP_MS;
    if (tipReady) {
      if (g.eventsOpen && !s.flags.eventsIntro) this.showEventsIntro();
      else if (!s.flags.trainIntro && g.trainUnlocked && s.gold >= g.trainPurchase('main', 1).cost) this.showTrainIntro();
      else if (!s.flags.wolfIntro && !s.bestiary.wolf.unlocked && s.gold >= enemyUnlockCost(enemyDef('wolf'))) this.showWolfIntro();
      else if (!s.flags.craftIntro && this.firstCraftable()) this.showCraftIntro();
      else if (!s.flags.empowerIntro && g.empowerUnlocked) this.showEmpowerIntro();
    }
    $('#menuBtn .alert-mark').classList.toggle('hidden', !g.unreadJournal().length);
    // "!" marks: red on tabs and sub-tabs, white on the new things themselves.
    this.syncSeen();
    $('#eventsBadge').classList.toggle('hidden', !EVENTS.some((e) => e.area === g.area && this.newEvent(e.id)));
    const newRecipes = GEAR.some((gd) => this.newRecipe(gd));
    const newGear = s.inventory.some((it) => it.uid > s.seen.gearUid);
    $('#forgeBadge').classList.toggle('hidden', !newRecipes && !newGear);
    this.panel.querySelector('.craft-dot')?.classList.toggle('hidden', !newRecipes);
    this.panel.querySelector('.gear-dot')?.classList.toggle('hidden', !newGear);
    $('#beastBadge').classList.toggle('hidden', !ENEMIES.some((e) => this.newBeast(e) || (g.isUnlocked(e.id) && g.evoPoints(e.id) > 0)));
    $('#huntersBadge').classList.toggle(
      'hidden',
      !HUNTERS.some((h) => g.canRecruit(h.id) || (s.hunters[h.id].recruited && g.skillPoints(h.id) > 0)) && g.skillPoints('main') <= 0,
    );

    for (const r of this.refreshers) r();
    if (this.detail) for (const r of this.detail.refreshers) r();
  }

  // ---- Hunters tab: your Hunter's training + the Hunter Guild ----

  /** The Train ×1 / ×10 / ×100 / MAX switch. Every copy (Hunters tab, Hunter view) shows the same choice. */
  private amountsBar(extra = '', label = 'Train'): HTMLElement {
    const g = this.game;
    const amounts = el('div', `amounts ${extra}`);
    amounts.appendChild(el('span', 'amounts-label', label));
    const opts: BuyAmount[] = [1, 10, 100, 'max'];
    const buttons = opts.map((a) => {
      const b = el('button', '', a === 'max' ? 'MAX' : `×${a}`);
      b.addEventListener('click', () => {
        g.state.buyAmount = a;
        this.refresh();
      });
      amounts.appendChild(b);
      return b;
    });
    this.refreshers.push(() => buttons.forEach((x, i) => x.classList.toggle('active', opts[i] === g.state.buyAmount)));
    return amounts;
  }

  /**
   * Hunters tab: a 3-wide grid of Hunter icons (you, your recruits, then the next few to come). A border glows
   * when you can afford to train (or recruit) them, and unspent skill points show on the corner. Selecting one
   * pins their card to the bottom of the menu; tap the card for their full view.
   */
  private buildHunters(): void {
    const g = this.game;
    const recruited = HUNTERS.filter((h) => g.state.hunters[h.id].recruited);
    const upcoming = HUNTERS.filter((h) => !g.state.hunters[h.id].recruited).slice(0, NEXT_HUNTERS_SHOWN);
    const list: Wearer[] = ['main', ...recruited.map((h) => h.id), ...upcoming.map((h) => h.id)];
    if (!list.includes(this.selectedHunter)) this.selectedHunter = 'main';
    const grid = el('div', 'hunter-grid');
    const tiles = list.map((who) => {
      const def = who === 'main' ? null : hunterDef(who);
      const tile = el('button', 'hunter-tile') as HTMLButtonElement;
      tile.style.setProperty('--hc', def ? def.color : '#7c5cff');
      tile.innerHTML = `<i>${wearerIcon(who)}</i><span class="ht-name">${def ? def.name : esc(mainName())}</span><small class="ht-lv"></small><b class="sp-dot hidden" title="Unspent skill points"></b>`;
      tile.classList.toggle('selected', who === this.selectedHunter);
      tile.addEventListener('click', () => {
        if (this.selectedHunter === who) return;
        this.selectedHunter = who;
        this.setTab('hunters', true);
      });
      grid.appendChild(tile);
      return { who, def, tile, lv: $('.ht-lv', tile), dot: $('.sp-dot', tile) };
    });
    this.refreshers.push(() => {
      for (const { who, def, tile, lv, dot } of tiles) {
        const joined = !def || g.state.hunters[def.id].recruited;
        const open = joined || g.hunterAvailable(def!.id);
        tile.classList.toggle('locked', !open);
        let ready = false;
        if (joined) {
          const p = g.trainPurchase(who);
          ready = g.trainUnlocked && p.count > 0 && g.state.gold >= p.cost;
          lv.textContent = `Lv ${g.levelOf(who)}`;
          const points = g.skillPoints(who);
          dot.textContent = String(points);
          dot.classList.toggle('hidden', points <= 0);
        } else {
          ready = g.canRecruit(def!.id);
          lv.textContent = open ? 'Recruit' : 'Locked';
        }
        tile.classList.toggle('ready', ready);
      }
    });
    this.panel.appendChild(grid);
    // The selected Hunter's card, pinned to the bottom so it's in reach wherever the grid is scrolled.
    const dock = el('div', 'hunter-dock');
    dock.appendChild(this.hunterCard(this.selectedHunter));
    this.panel.appendChild(dock);
  }

  /** A Train button and a progress bar toward the next level, kept up to date. `compact` is the card's version. */
  private trainParts(who: Wearer, compact = false): { btn: HTMLButtonElement; bar: HTMLElement } {
    const g = this.game;
    const btn = el('button', 'buy') as HTMLButtonElement;
    const bar = el('div', 'train-bar');
    bar.innerHTML = '<i></i><span></span>';
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const level = g.levelOf(who);
      if (g.train(who)) {
        sfx(g.levelOf(who) > level ? 'levelUp' : 'train');
        bumpCard(btn);
        this.refresh();
      }
    });
    this.refreshers.push(() => {
      const p = g.trainPurchase(who);
      const { level, into, need } = g.levelInfo(who);
      if (!g.trainUnlocked) {
        setHtml(btn, `🔒 Train<small>Slay ${fmt(Math.min(g.slimeKills, TRAIN_UNLOCK_KILLS))} / ${TRAIN_UNLOCK_KILLS} slimes</small>`);
        btn.disabled = true;
        $('i', bar).style.width = '0%';
        $('span', bar).textContent = compact ? '' : `${into}/${need}`;
        return;
      }
      setHtml(btn, p.count === 0 ? (g.ascended(who) ? 'Max level' : `Lv ${level} cap<small>Ascend in Skills</small>`) : `Train${p.count > 1 ? ` ×${p.count}` : ''}<small>🪙 ${fmt(p.cost)}</small>`);
      btn.disabled = p.count === 0 || g.state.gold < p.cost;
      $('i', bar).style.width = `${(into / need) * 100}%`;
      // The card's bar is just the bar; the numbers are in the full view.
      const capped = p.count === 0;
      $('i', bar).style.width = capped ? '100%' : `${(into / need) * 100}%`;
      $('span', bar).textContent = compact ? '' : capped ? (g.ascended(who) ? 'Max' : 'Ascend') : `${into}/${need}`;
    });
    return { btn, bar };
  }

  /** Train button with its progress bar, for the full view. */
  private trainButton(who: Wearer): HTMLElement {
    const wrap = el('div', 'train');
    const { btn, bar } = this.trainParts(who);
    wrap.append(btn, bar);
    return wrap;
  }

  /**
   * Compact Hunter card. Top row: art (level underneath, skill-point dot on its corner); name, ability,
   * location & DPS and training progress; a big Train (or Recruit) button. Below: equipped gear, full width.
   * Tap the card for the full view.
   */
  private hunterCard(who: Wearer): HTMLElement {
    const g = this.game;
    const def = who === 'main' ? null : hunterDef(who);
    const card = el('div', 'hunter-card');
    card.setAttribute('role', 'button');
    card.innerHTML = `
      <div class="hc-top">
        <div class="hc-art">${portraitHtml(who)}</div>
        <div class="hc-info">
          <div class="card-corner"><b class="sp-dot hidden" title="Unspent skill points"></b><span class="expand-tag">Expand ›</span></div>
          <div class="hc-name">${def ? `${def.name} <small>the ${g.titleOf(def.id)}</small>` : `${esc(mainName())} <small>the ${g.titleOf('main')}</small>`}</div>
          <div class="hc-ability">${def ? def.short : MAIN_SHORT}</div>
          <div class="hc-status"></div>
        </div>
      </div>
      <div class="hc-train"><span class="hc-lv"></span><div class="hc-mid"></div><div class="hc-action"></div></div>
      <div class="hc-gear"></div>`;
    // Only recruited Hunters open their full view (a locked card's story and Recruit button are all there is).
    const recruitedNow = () => !def || g.state.hunters[def.id].recruited;
    card.addEventListener('click', () => {
      if (recruitedNow()) this.openHunterDetail(who);
      // Not recruited yet: their story and what they do, in full.
      else if (def)
        this.showSheet(`${wearerIcon(def.id)} ${def.name} the ${def.title}`, (body) => {
          body.innerHTML = `<p>${def.story}</p><p>${def.ability}</p><p class="hint">${g.hunterAvailable(def.id) ? `Recruit for 🪙 ${fmt(def.recruitCost)}` : `🔒 ${unlockText(g, def)}`}</p>`;
        });
    });
    this.refreshers.push(() => card.classList.toggle('no-expand', !recruitedNow()));
    if (def && !recruitedNow()) $('.expand-tag', card).textContent = 'Story ›';
    const mid = $('.hc-mid', card);
    const action = $('.hc-action', card);
    const lv = $('.hc-lv', card);
    const gearEl = $('.hc-gear', card);
    const status = $('.hc-status', card);
    const dot = $('.sp-dot', card);
    const gearHtml = (items: Array<GearItem | null>) =>
      g
        .slotsOf(who)
        .map((slot, i) => {
          const it = items[i];
          return it
            ? `<span class="gear-chip rar" style="--rc:${gearColor(it.base)}">${gearIcon(gearDef(it.base))} ${gearDef(it.base).name}</span>`
            : `<span class="gear-chip empty">${GEAR_KINDS[slot.kind].icon} ${slot.label}</span>`;
        })
        .join('');
    if (def && !g.state.hunters[def.id].recruited) {
      const recruitBtn = el('button', 'buy') as HTMLButtonElement;
      recruitBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        g.recruit(def.id);
      });
      action.appendChild(recruitBtn);
      gearEl.remove();
      this.refreshers.push(() => {
        const open = g.hunterAvailable(def.id);
        card.classList.toggle('locked', !open);
        // Locked: a short story of how to win them over replaces their ability and location.
        $('.hc-ability', card).textContent = def.short;
        status.textContent = open ? 'Available to recruit' : '';
        status.classList.toggle('hidden', !open);
        setHtml(mid, open ? 'Recruit to start training' : `🔒 ${unlockText(g, def)}`);
        setHtml(recruitBtn, open ? `Recruit<small>🪙 ${fmt(def.recruitCost)}</small>` : '🔒<small>Locked</small>');
        recruitBtn.disabled = !g.canRecruit(def.id);
      });
      return card;
    }
    const { btn, bar } = this.trainParts(who, true);
    mid.appendChild(bar);
    action.appendChild(btn);
    let gearKey = '';
    this.refreshers.push(() => {
      const points = g.skillPoints(who);
      lv.textContent = `Lv ${g.levelOf(who)}`;
      dot.textContent = String(points);
      dot.classList.toggle('hidden', points <= 0);
      const station = def ? g.state.hunters[def.id].station : g.area;
      const down = def && station && station !== g.area ? (this.rates(station, g.stationedIn(station), STATION_EFFICIENCY).stunned[def.id] ?? 0) : 0;
      setHtml(status, `${station ? `📍 ${areaDef(station).name}` : '💤 Resting'} · ⚔️ ${fmt(this.dpsOf(who))} DPS${down >= 0.05 ? ' · <b class="warn">💫 overwhelmed</b>' : ''}`);
      const items = g.equipped(who);
      const k = items.map((it) => (it ? `${it.uid}:${it.stars}` : '-')).join('|');
      if (k !== gearKey) {
        gearKey = k;
        gearEl.innerHTML = gearHtml(items);
      }
    });
    return card;
  }

  /**
   * Full-screen Hunter view with sub-tabs: Overview (training, abilities, stats, station), Equipment, Skills (the
   * branching skill tree) and, for your Hunter, Abilities (tap abilities unlocked in the tree, swapped here).
   * Closing returns to the battlefield.
   */
  private openHunterDetail(who: Wearer, sub: 'overview' | 'equipment' | 'skills' = 'overview'): void {
    if (this.detail) this.dropDetail();
    const g = this.game;
    const def = who === 'main' ? null : hunterDef(who);
    const view = el('div', 'hunter-detail floating-close');
    view.innerHTML = `
      <div class="hd-scroll">
        <div class="hd-hero hero-head">
          ${portraitHtml(who, 'big')}
          <div class="hd-title hero-plate">
            <h2>${def ? def.name : esc(mainName())}</h2>
            <div class="hd-sub"></div>
          </div>
        </div>
        <div class="subtabs">
          <button data-sub="overview">📊 Overview</button>
          <button data-sub="equipment">🛡️ Equipment</button>
          <button data-sub="skills">🌳 Skills <b class="sp-count hidden"></b></button>
        </div>
        <div class="hd-body" data-sub="overview"></div>
        <div class="hd-body" data-sub="equipment"></div>
        <div class="hd-body" data-sub="skills"></div>
      </div>
      <button class="hd-close hd-float-close" aria-label="Close">✕</button>`;
    document.body.appendChild(view);
    $('.hd-close', view).addEventListener('click', () => this.closeHunterDetail());
    this.detail = { el: view, refreshers: [] };
    const pane = (name: string) => $(`.hd-body[data-sub=${name}]`, view);
    const show = (name: string) => {
      view.querySelectorAll<HTMLElement>('.subtabs button[data-sub]').forEach((b) => b.classList.toggle('on', b.dataset.sub === name));
      view.querySelectorAll<HTMLElement>('.hd-body').forEach((b) => b.classList.toggle('hidden', b.dataset.sub !== name));
    };
    view.querySelectorAll<HTMLButtonElement>('.subtabs button[data-sub]').forEach((b) => b.addEventListener('click', () => show(b.dataset.sub!)));
    show(sub);

    const main = this.refreshers;
    this.refreshers = [];
    const recruited = !def || g.state.hunters[def.id].recruited;

    // Overview
    const overview = pane('overview');
    if (def && !recruited) {
      const btn = el('button', 'buy hd-recruit') as HTMLButtonElement;
      btn.addEventListener('click', () => {
        if (g.recruit(def.id)) this.openHunterDetail(who); // rebuild with the full view
      });
      overview.appendChild(btn);
      this.refreshers.push(() => {
        btn.innerHTML = g.hunterAvailable(def.id) ? `Recruit<small>🪙 ${fmt(def.recruitCost)}</small>` : `🔒 ${unlockText(g, def)}`;
        btn.disabled = !g.canRecruit(def.id);
      });
    } else {
      overview.appendChild(sectionTitle('Training'));
      overview.appendChild(this.amountsBar());
      overview.appendChild(this.trainButton(who));
    }
    // Abilities: their passives and actives, then the weapons they can use.
    overview.appendChild(sectionTitle('Abilities'));
    overview.insertAdjacentHTML('beforeend', abilitiesHtml(def));
    // Your Hunter: their tap abilities, right under their abilities.
    if (!def) overview.appendChild(this.abilitiesList());
    // Equipment: tap a slot to pick from unequipped gear that fits.
    const equipment = pane('equipment');
    equipment.appendChild(sectionTitle('Equipment'));
    if (recruited) equipment.appendChild(this.equipmentList(who));
    else equipment.appendChild(el('p', 'hd-note', `Slots: ${g.slotsOf(who).map((sl) => `${GEAR_KINDS[sl.kind].icon} ${sl.label}`).join(' · ')}. Recruit them to equip gear.`));
    overview.appendChild(sectionTitle(recruited ? 'Stats' : 'Stats when recruited'));
    const headline = el('div', 'hd-stats hd-headline');
    overview.appendChild(headline);
    const stats = el('div', 'hd-stats');
    overview.appendChild(stats);
    const arch = g.weaponItem(who) ? gearDef(g.weaponItem(who)!.base) : null;
    const archLine = arch?.archetype ? ` ${weaponArchetype(arch)!.name}: ${weaponArchetype(arch)!.desc}` : '';
    overview.appendChild(el('p', 'hd-style', `${g.weaponClassOf(who) ? `⚔️ Attacks with their weapon: ${g.weaponClassOf(who)!.describe}${archLine}` : '⚔️ Unarmed: fires a basic bolt. Equip a weapon to fight with its attacks.'}${def?.special ? ` ✨ ${def.special.describe}` : ''}${def?.wall ? ` 🦴 ${def.wall.name}: ${def.wall.describe}` : ''}`));
    const effectNote = el('p', 'hd-style hd-effect');
    overview.appendChild(effectNote);
    this.refreshers.push(() => {
      const wItem = g.weaponItem(who);
      const special = !!(wItem && gearDef(wItem.base).special);
      // A Special weapon's many elements read as one line, not one per element.
      const lines: Array<[string, DamageType, number]> = special ? [] : g.damageTypesOf(who).map((t) => ['Attacks', t, g.procFor(who, t)]);
      if (g.specialCooldown(who) !== null) for (const t of g.damageTypesOf(who, 'long', true)) lines.push([def?.special?.name ?? '', t, g.procOf(who, 'long', true)]);
      effectNote.innerHTML = lines
        .filter(([, t, p]) => p > 0 && DAMAGE_TYPES[t].effect)
        .map(([what, t, p]) => `${DAMAGE_TYPES[t].icon} <b>${what}</b> (${Math.round(p * 100)}% chance): ${DAMAGE_TYPES[t].effect}.`)
        .concat(special && g.procOf(who) > 0 ? [`${SPECIAL_TYPE.icon} <b>Attacks</b> (${Math.round(g.procOf(who) * 100)}% chance): each element's own status effect.`] : [])
        .join('<br>');
    });
    if (def && recruited) {
      overview.appendChild(sectionTitle('Station'));
      overview.appendChild(this.stationControls(def));
    }

    // Abilities (your Hunter): tap abilities unlocked in the skill tree; one is equipped at a time.

    // Skills: once they've ascended, a switch at the top flips between the new tree and the first one.
    const skills = pane('skills');
    const firstTree = this.treeView(this.hunterTree(who));
    if (g.ascended(who)) {
      const newTree = this.treeView(this.hunterTree(who, 'ascended'));
      const sw = el('div', 'subtabs tree-switch');
      sw.innerHTML = `<button data-tree="ascended">${who === 'main' ? "⚔️ Slayer's tree" : '🌟 Ascended tree'}</button><button data-tree="base">📜 First tree</button>`;
      const pick = (which: TreeKind) => {
        this.treePick.set(who, which);
        sw.querySelectorAll<HTMLElement>('button').forEach((b) => b.classList.toggle('on', b.dataset.tree === which));
        newTree.classList.toggle('hidden', which !== 'ascended');
        firstTree.classList.toggle('hidden', which !== 'base');
      };
      sw.querySelectorAll<HTMLButtonElement>('button').forEach((b) => b.addEventListener('click', () => pick(b.dataset.tree as TreeKind)));
      skills.append(sw, newTree, firstTree);
      pick(this.treePick.get(who) ?? 'ascended');
    } else skills.appendChild(firstTree);

    const spCount = $('.sp-count', view);
    const subLine = $('.hd-sub', view);
    // The location opens the all-areas Hunter view (delegated: the line is redrawn as things change).
    subLine.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.where-btn')) this.openWorld(def?.id ?? null);
    });
    let subHtml = '';
    this.refreshers.push(() => {
      const points = recruited ? g.skillPoints(who) : 0;
      spCount.textContent = String(points);
      spCount.classList.toggle('hidden', points <= 0);
      const station = def ? g.state.hunters[def.id].station : g.area;
      const html = [
        `<span>the ${g.titleOf(who)}${recruited ? ` · Lv ${g.levelOf(who)}` : ''}</span>`,
        recruited ? `<button class="where where-btn">${station ? `📍 ${areaDef(station).name}` : '💤 Resting'} <b>›</b></button>` : '',
      ].join('');
      // Only redrawn when it changes, so a tap on the location button isn't lost mid-press.
      if (html !== subHtml) subLine.innerHTML = subHtml = html;
      headline.innerHTML = `<div><b>${fmt(this.dpsOf(who))}</b>DPS</div>${recruited ? `<div><b>${fmt(g.killsBy(who))}</b>Enemies slain</div>` : ''}`;
      const cells: Array<[string, string]> = [
        ['Damage', fmt(g.shotDamage(who))],
        ['Attack rate', `${g.shooterRate(who).toFixed(2)}/s`],
        ['Range', fmt(g.shooterRange(who))],
        ['Stun time', `${g.stunTime(false, who).toFixed(2)}s`],
        ['Shield', g.guardOf(who) ? `${g.guardOf(who)} hit${g.guardOf(who) > 1 ? 's' : ''}` : '—'],
        ['Crit chance', `${Math.round(g.critChanceOf(who) * 100)}%`],
      ];
      if (!def) cells.push(['Tap damage', fmt(g.tapDamage)], ['Tap size', fmt(g.tapRadius)]);
      const types = g.damageTypesOf(who);
      const special = !!(g.weaponItem(who) && gearDef(g.weaponItem(who)!.base).special);
      const typeHtml = special
        ? `<span style="color:${SPECIAL_TYPE.color}" class="dt-cell">${SPECIAL_TYPE.icon} ${SPECIAL_TYPE.name}</span>`
        : types.map((t) => `<span style="color:${DAMAGE_TYPES[t].color}" class="dt-cell">${DAMAGE_TYPES[t].icon} ${DAMAGE_TYPES[t].name}</span>`).join(' ');
      cells.splice(1, 0, [special ? 'Damage type' : types.length > 1 ? (g.perShotOf(who) ? 'Damage types (by shot)' : 'Damage types (split)') : 'Damage type', typeHtml]);
      const cd = g.specialCooldown(who);
      if (cd !== null) {
        const potion = def?.special?.kind === 'potion';
        const hit = fmt(g.shotDamage(who) * g.specialDamageMult(who));
        if (def?.special?.summon)
          cells.push(
            [`${def.special.summon.look === 'wolf' ? 'Wolf' : 'Puppet'} bite (${DAMAGE_TYPES[g.damageTypeOf(who, 'long', true)].name})`, fmt(g.shotDamage(who) * g.specialDamageMult(who) * (g.specialRadius(who) / def.special.radius))],
            [`${def.special.name} every`, `${cd}s`],
          );
        else cells.push(
          [`${potion ? 'Puddle' : 'Fireball'} damage (${DAMAGE_TYPES[g.damageTypeOf(who, 'long', true)].name})`, potion ? `${hit}/tick` : hit],
          [potion ? 'Puddle size' : 'Blast size', fmt(g.specialRadius(who))],
          [potion ? 'Potion every' : 'Fireball every', `${cd}s`],
        );
      }
      const pierce = g.pierceOf(who);
      if (pierce) cells.push(['Pierce', String(pierce)]);
      if (def?.bane) cells.splice(1, 0, [`vs ${ARCHETYPES[def.bane.archetype].name}`, fmt(g.shotDamage(who, def.bane.archetype))]);
      if (def?.swapRange) cells.splice(1, 0, ['Short-range', fmt(g.shotDamage(who, undefined, 'short'))]);
      stats.innerHTML = cells.map(([k, v]) => `<div><b>${v}</b>${k}</div>`).join('');
    });

    this.detail.refreshers = this.refreshers;
    this.refreshers = main;
    this.refresh();
  }

  /** A Hunter's skill tree as a generic tree for treeView. */
  private hunterTree(who: Wearer, which: TreeKind = 'base'): TreeAdapter {
    const g = this.game;
    return {
      nodes: g.skillTree(who, which),
      spriteTree: which === 'base' ? who : `${who}+`,
      rank: (id) => g.skill(who, id, which),
      points: () => g.skillPoints(who),
      active: () => who === 'main' || g.state.hunters[who].recruited,
      inactiveText: 'Recruit them to start spending skill points.',
      waitText: () =>
        g.levelOf(who) >= g.maxLevel(who)
          ? 'Every skill point is spent.'
          : `Next skill point at Lv ${g.levelOf(who) + 1}. Train to level up.`,
      pointName: 'skill point',
      reachable: (id) => g.nodeReachable(who, id, which),
      rowGate: (row) => {
        const need = g.rowGate(who, row, which);
        return need > 0 ? { have: g.pointsIn(who, which), need } : null;
      },
      canLearn: (id) => g.canLearn(who, id, which),
      learn: (id) => g.learn(who, id, which),
      verb: 'Acquire',
      // The gold Ascend node only shows once the first tree is complete.
      hidden: (id) => which === 'base' && id === ASCEND_NODE.id && !g.baseTreeComplete(who),
      after: (id) => {
        if (which !== 'base' || id !== ASCEND_NODE.id) return;
        if (who === 'main') {
          this.openHunterDetail(who, 'skills');
          this.showModal(
            `<h2>⚔️ You are the Slayer!</h2><p>${esc(mainName())} ${mainHunterName ? 'is' : 'are'} now <b>the Slayer</b>. The Slayer's tree is open, and training goes on to <b>Lv ${MAIN_MAX_LEVEL}</b>: the level curve starts over (1 session to Lv ${MAIN_ASCEND_LEVEL + 1}), at the same training price.</p>`,
            [{ label: 'Onward' }],
          );
          return;
        }
        const def = hunterDef(who);
        this.openHunterDetail(who, 'skills');
        this.showModal(
          `<h2>🌟 ${def.name} ascended!</h2><p>${def.name} is now <b>the ${def.ascendedTitle}</b>. A new skill tree is open, and training goes on to <b>Lv ${MAX_LEVEL}</b>: the level curve starts over (1 session to Lv ${ASCEND_LEVEL + 1}), at the same training price.</p>`,
          [{ label: 'Onward' }],
        );
      },
    };
  }

  /** A monster's evolution tree as a generic tree for treeView. */
  private monsterTree(id: EnemyId): TreeAdapter {
    const g = this.game;
    return {
      nodes: g.evoTree(id),
      spriteTree: `evo:${id}`,
      rank: (n) => g.evoRank(id, n),
      points: () => g.evoPoints(id),
      active: () => g.isUnlocked(id),
      inactiveText: 'Unlock it to start evolving it.',
      waitText: () => `Next evolution point at Lv ${g.monsterLevelInfo(id).level + 1}. Empower to level up.`,
      pointName: 'evolution point',
      reachable: (n) => g.evoReachable(id, n),
      canLearn: (n) => g.canEvolve(id, n),
      learn: (n) => g.evolve(id, n),
      verb: 'Evolve',
      gate: (n) => {
        const left = g.evoKillsLeft(id, n);
        return left > 0 ? `Slay ${fmt(left)} more ${enemyDef(id).name}${left === 1 ? '' : 's'}` : null;
      },
    };
  }

  /** A branching tree (skills or evolutions): tap a node for details and to spend a point on it. */
  private treeView(t: TreeAdapter): HTMLElement {
    const nodes = t.nodes;
    const ROW = 112;
    const rows = Math.max(...nodes.map((n) => n.row)) + 1;
    const H = rows * ROW;
    const wrap = el('div', 'skills');
    const head = el('div', 'skills-head');
    wrap.appendChild(head);
    const tree = el('div', 'tree');
    tree.style.height = `${H}px`;
    // Three columns, or five for your Hunter's wider trees. Columns can be halves (1.5) to stagger a row,
    // e.g. four nodes across centred under five.
    const cols = Math.max(3, Math.ceil(Math.max(...nodes.map((n) => n.col)) + 1));
    tree.classList.toggle('wide', cols > 3);
    const pos = (n: TreeNode) => ({ x: ((n.col + 0.5) / cols) * 300, y: n.row * ROW + ROW / 2 - 8 });
    const lines = nodes.flatMap((n) =>
      n.requires.map((r) => {
        const a = pos(nodes.find((x) => x.id === r)!);
        const b = pos(n);
        return `<line data-from="${r}" data-to="${n.id}" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" vector-effect="non-scaling-stroke" />`;
      }),
    );
    tree.innerHTML = `<svg viewBox="0 0 300 ${H}" preserveAspectRatio="none">${lines.join('')}</svg>`;
    const buttons = nodes.map((n) => {
      const b = el('button', 'tnode') as HTMLButtonElement;
      const p = pos(n);
      b.style.left = `${(p.x / 300) * 100}%`;
      b.style.top = `${p.y}px`;
      b.innerHTML = `<span class="tn-icon">${nodeIcon(t, n, 'ni')}<em></em></span><span class="tn-name">${n.name}</span>${(n.cost ?? 1) > 1 ? `<span class="tn-cost">${n.cost} pts</span>` : ''}`;
      if (n.id === ASCEND_NODE.id) b.classList.add('ascend');
      b.addEventListener('click', () => this.openTreeNode(t, n));
      tree.appendChild(b);
      return { n, b };
    });
    // A locked row has a bar across its top: points spent in this tree out of what opens the row ("3/5").
    const gates = [...new Set(nodes.map((n) => n.row))].flatMap((row) => {
      if (!t.rowGate?.(row)) return [];
      const bar = el('div', 'tree-gate');
      bar.style.top = `${row * ROW - 20}px`;
      bar.innerHTML = '<canvas></canvas><span></span>';
      tree.appendChild(bar);
      return [{ row, bar }];
    });
    wrap.appendChild(tree);
    this.refreshers.push(() => {
      for (const { row, bar } of gates) {
        const gt = t.rowGate!(row)!;
        const open = gt.have >= gt.need;
        bar.classList.toggle('hidden', open || (t.hidden ? nodes.filter((n) => n.row === row).every((n) => t.hidden!(n.id)) : false));
        // The framed bar at 2× its pixels: 10 frame pixels tall, as wide as the row band.
        const cv = $<HTMLCanvasElement>('canvas', bar);
        const w = Math.max(30, Math.round(bar.clientWidth / 2));
        if (cv.width !== w || cv.height !== 10) {
          cv.width = w;
          cv.height = 10;
        }
        const cg = cv.getContext('2d')!;
        cg.clearRect(0, 0, w, 10);
        drawFramedBar(cg, 0, 0, 1, w, 10, gt.have / gt.need, TIMER_COLOR);
        $('span', bar).textContent = `🔒 ${Math.min(gt.have, gt.need)}/${gt.need}`;
      }
      const points = t.points();
      const active = t.active();
      if (!active) head.textContent = t.inactiveText;
      else if (points > 0) head.innerHTML = `<b>${points}</b> ${t.pointName}${points > 1 ? 's' : ''} to spend. Tap a glowing node.`;
      else head.textContent = t.waitText();
      head.classList.toggle('has', active && points > 0);
      for (const { n, b } of buttons) {
        const rank = t.rank(n.id);
        b.classList.toggle('learned', rank > 0);
        b.classList.toggle('maxed', rank >= n.maxRank);
        b.classList.toggle('available', t.canLearn(n.id));
        b.classList.toggle('locked', !t.reachable(n.id));
        b.classList.toggle('gated', !!t.gate?.(n.id));
        b.classList.toggle('hidden', !!t.hidden?.(n.id));
        $('em', b).textContent = `${rank}/${n.maxRank}`;
      }
      tree.querySelectorAll<SVGLineElement>('line').forEach((l) => {
        l.classList.toggle('on', t.rank(l.dataset.from!) > 0);
        l.classList.toggle('hidden', !!t.hidden?.(l.dataset.to!));
      });
    });
    return wrap;
  }

  /**
   * A tree node's details: under its name, the points it needs and the points you have; then what it does,
   * and a big button to spend the points ("Acquire" a skill, "Evolve" a monster).
   */
  private openTreeNode(t: TreeAdapter, n: TreeNode): void {
    this.showSheet(`${nodeIcon(t, n)} ${n.name}`, (body, close) => {
      const rank = t.rank(n.id);
      const needs = n.requires.map((r) => t.nodes.find((x) => x.id === r)!.name);
      const cost = n.cost ?? 1;
      const have = Math.max(0, t.points());
      const maxed = rank >= n.maxRank;
      body.innerHTML = `<div class="node-points">${
        maxed
          ? '<div>Fully learned</div>'
          : `<div>Points required <b>${cost}</b></div><div class="${have >= cost ? 'ok' : 'short'}">Points available <b>${have}</b></div>`
      }</div><p class="gear-now">${n.desc}</p><p>Rank ${rank} / ${n.maxRank}</p>${
        t.rowGate?.(n.row) && t.rowGate(n.row)!.have < t.rowGate(n.row)!.need
          ? `<p>🔒 Spend ${t.rowGate(n.row)!.need} points in this tree to open this row (${t.rowGate(n.row)!.have}/${t.rowGate(n.row)!.need}).</p>`
          : !t.reachable(n.id)
            ? `<p>🔒 Needs a point in ${needs.join(' or ')} first.</p>`
            : ''
      }${t.gate?.(n.id) ? `<p>🔒 ${t.gate(n.id)} to open this evolution.</p>` : ''}`;
      const btn = el('button', 'buy node-buy', maxed ? 'Maxed' : n.id === ASCEND_NODE.id ? 'Ascend' : t.verb) as HTMLButtonElement;
      btn.disabled = !t.canLearn(n.id);
      btn.addEventListener('click', () => {
        if (!t.learn(n.id)) return;
        sfx('learn');
        close();
        // Maxed (or a one-rank node): done. Otherwise stay open for the next rank, even if it can't be afforded yet.
        if (t.rank(n.id) < n.maxRank) this.openTreeNode(t, n);
        t.after?.(n.id);
      });
      body.appendChild(btn);
    });
  }

  /**
   * Your Hunter's tap ability: just the one equipped, with a Change button that opens the list of those unlocked
   * (the plain blast, then each elemental one learned in the tree).
   */
  private abilitiesList(): HTMLElement {
    const g = this.game;
    const wrap = el('div', 'abilities');
    wrap.appendChild(sectionTitle('Tap Abilities'));
    const info = (id: TapAbilityId | null): { icon: string; name: string; desc: string } => {
      const a = id && TAP_ABILITIES.find((t) => t.id === id);
      if (!a) return { icon: '💥', name: 'Blast', desc: "A plain blast in your weapon's damage type." };
      const dt = DAMAGE_TYPES[a.damageType];
      return { icon: a.icon, name: a.name, desc: `${a.desc} <span style="color:${dt.color}">${dt.icon} ${dt.name}</span>` };
    };
    const cardHtml = (id: TapAbilityId | null) => {
      const i = info(id);
      return `<div class="ab-icon">${i.icon}</div><div class="ab-info"><div class="ab-name">${i.name}</div><p>${i.desc}</p></div>`;
    };
    const card = el('div', 'card ability-card');
    const face = el('div', 'ab-face');
    const change = el('button', 'buy ab-equip', 'Change') as HTMLButtonElement;
    card.append(face, change);
    wrap.appendChild(card);
    change.addEventListener('click', () =>
      this.showSheet('Tap Abilities', (body, close) => {
        for (const id of [null, ...TAP_ABILITIES.map((t) => t.id)] as Array<TapAbilityId | null>) {
          if (id !== null && !g.tapAbilityUnlocked(id)) continue;
          const row = el('div', `card ability-card${id === g.tapAbility ? ' equipped' : ''}`);
          row.innerHTML = cardHtml(id);
          const btn = el('button', 'buy ab-equip', id === g.tapAbility ? 'Equipped' : 'Equip') as HTMLButtonElement;
          btn.disabled = id === g.tapAbility;
          btn.addEventListener('click', () => {
            if (!g.setTapAbility(id)) return;
            this.hooks.save();
            this.refresh();
            close();
          });
          row.appendChild(btn);
          body.appendChild(row);
        }
        body.appendChild(el('p', 'hd-note', 'Unlock more in the Skills tab.'));
      }),
    );
    let shown: TapAbilityId | null | undefined;
    this.refreshers.push(() => {
      if (shown === g.tapAbility) return;
      shown = g.tapAbility;
      face.innerHTML = cardHtml(shown);
    });
    return wrap;
  }

  /** Removes the full-screen view without rebuilding the panel. */
  private dropDetail(): void {
    this.detail?.el.remove();
    this.detail = null;
  }

  /** Closes the full-screen Hunter view. Returns false if it wasn't open. */
  private closeHunterDetail(): boolean {
    if (!this.detail) return false;
    this.dropDetail();
    this.setTab(this.tab, true);
    return true;
  }

  /** Rest / area chips for a recruited Hunter, plus their yield where stationed. */
  private stationControls(def: HunterDef): HTMLElement {
    const g = this.game;
    const wrap = el('div', 'station');
    const chips = el('div', 'chips');
    wrap.appendChild(chips);
    const yieldEl = el('div', 'yield');
    wrap.appendChild(yieldEl);
    const rest = el('button', 'chip', 'Rest') as HTMLButtonElement;
    rest.addEventListener('click', () => {
      g.station(def.id, null);
      this.refresh();
    });
    chips.appendChild(rest);
    const areaChips = AREAS.map((a) => {
      const c = el('button', 'chip', a.name.split(' ').pop()!) as HTMLButtonElement;
      c.addEventListener('click', () => {
        g.station(def.id, a.id);
        this.refresh();
      });
      chips.appendChild(c);
      return { a, c };
    });
    this.refreshers.push(() => {
      const st = g.state.hunters[def.id];
      rest.classList.toggle('on', !st.station);
      for (const { a, c } of areaChips) {
        c.classList.toggle('on', st.station === a.id);
        c.disabled = !g.isAreaUnlocked(a.id) || !g.canStation(def.id, a.id);
        const n = g.stationedIn(a.id).length;
        c.textContent = `${a.name.split(' ').pop()} ${n}/${STATION_CAPACITY}`;
      }
      if (!st.station) yieldEl.textContent = 'Resting. Station them in an area to earn.';
      else if (st.station === g.area) yieldEl.textContent = `Fighting beside you in ${areaDef(st.station).name}.`;
      else {
        const group = g.stationedIn(st.station);
        yieldEl.innerHTML = yieldHtml(this.rates(st.station, group, STATION_EFFICIENCY), `${areaDef(st.station).name}${group.length > 1 ? ` (with ${group.length - 1} other${group.length > 2 ? 's' : ''})` : ''}`);
      }
    });
    return wrap;
  }

  // ---- Equipment ----

  /** A Hunter's equipment, one row per slot; tap a slot to choose from unequipped gear that fits. */
  private equipmentList(who: Wearer): HTMLElement {
    const g = this.game;
    const wrap = el('div', 'equip-list');
    const rows = g.slotsOf(who).map((slot, i) => {
      const b = el('button', 'card eq-card') as HTMLButtonElement;
      b.addEventListener('click', () => this.openSlotPicker(who, i));
      wrap.appendChild(b);
      return { slot, b };
    });
    const summary = el('div', 'gear-summary');
    wrap.appendChild(summary);
    let key = '';
    this.refreshers.push(() => {
      const items = g.equipped(who);
      // Reginald the Artificer in their area: the gear works a star better (shown as +1★, and its stats at that).
      const tuned = g.tinkerFor(who);
      const k = `${tuned};` + items.map((it) => (it ? `${it.uid}:${it.stars}:${JSON.stringify(it.mods ?? [])}` : '-')).join('|');
      if (k === key) return;
      key = k;
      rows.forEach(({ slot, b }, i) => {
        const it = items[i];
        const gd = it ? gearDef(it.base) : null;
        b.classList.toggle('empty', !it);
        b.classList.toggle('rar', !!it);
        b.style.setProperty('--rc', gd ? gearColor(gd.id) : '');
        // Option A: the icon in a rarity-framed box; the slot, name, rarity and stars beside it, then its damage
        // types and stats as chips.
        const chips = gd && it ? gearSummary(gd, g.effStars(it, who)).split(', ').filter(Boolean).map((t) => `<span class="eq-chip">${t}</span>`) : [];
        // Its built-in effects on gold tiles, then its modifiers: Refines on grey tiles, Enchants on violet ones.
        if (gd) for (const bi of gd.builtIn ?? []) chips.push(`<span class="eq-chip mod-builtin${isUniqueEnchant(ENCHANTS[bi.id]) ? ' unique' : ''}">${ENCHANTS[bi.id].name}</span>`);
        if (gd && it)
          for (const m of it.mods ?? [])
            if (m) chips.push(m.kind === 'refine' ? `<span class="eq-chip mod-refine">${REFINES[m.stat].text(modValue(m, gd))}</span>` : `<span class="eq-chip mod-enchant">${ENCHANTS[m.id].name}</span>`);
        b.innerHTML = `<span class="eq-ic">${gd ? gearIcon(gd) : GEAR_KINDS[slot.kind].icon}</span><div class="eq-info"><small class="eq-slot">${slot.label}</small><b class="eq-name">${gd ? gd.name : 'Empty'}</b>${
          gd && it
            ? `<span class="eq-rar"><em>${RARITIES[gd.rarity].name}</em><span class="stars">${starsHtml(it.stars)}</span>${tuned ? `<span class="tuned" title="Tuned by Reginald the Artificer">+${tuned}★</span>` : ''}</span><div class="eq-chips">${dtypeTag(gd)}${chips.join('')}</div>`
            : '<span class="eq-empty">Tap to equip</span>'
        }</div><span class="eq-chev">›</span>`;
      });
      // Tiles past two rows fold into a "…" tile (the rest are in the item's details).
      requestAnimationFrame(() => rows.forEach(({ b }) => foldChips(b.querySelector<HTMLElement>('.eq-chips'))));
      const stats = describeGear(g.gear(who));
      const short = g.slotsOf(who).some((sl) => sl.role === 'short') ? describeGear(g.gear(who, 'short')) : '';
      summary.textContent = stats || short ? `Total: ${stats || 'nothing yet'}${short ? ` · pistols: ${short}` : ''}` : '';
    });
    return wrap;
  }

  /**
   * Full-screen gear picker for one slot: the equipped item's card on top, the item you're inspecting
   * below it (with what changes if you swap), and your whole inventory as a grid at the bottom.
   */
  private openSlotPicker(who: Wearer, slot: number, preselect?: number): void {
    this.closePicker();
    const g = this.game;
    const def = g.slotsOf(who)[slot];
    const view = el('div', 'hunter-detail picker floating-close');
    view.innerHTML = `
      <div class="hd-scroll">
        <h2 class="pk-title">${wearerName(who)} · ${def.label}</h2>
        <div class="section-title"><span>Equipped</span></div>
        <div class="pk-equipped"></div>
        <div class="section-title pk-inspect-title"><span>Inspecting</span></div>
        <div class="pk-inspect"></div>
        <div class="section-title"><span>Inventory</span><span class="pk-count"></span></div>
        <div class="inventory pk-grid"></div>
      </div>
      <button class="hd-close hd-float-close" aria-label="Close">✕</button>`;
    document.body.appendChild(view);
    this.picker = view;
    $('.hd-close', view).addEventListener('click', () => this.closePicker());
    const fits = (it: GearItem) => slotAccepts(def, gearDef(it.base));
    // Start on the best piece that fits and nobody is wearing.
    let selected: number | null =
      preselect ?? g.state.inventory.filter((it) => fits(it) && !g.wearerOf(it.uid)).sort((a, b) => b.stars - a.stars)[0]?.uid ?? null;

    const render = () => {
      const current = g.equipped(who)[slot];
      // Equipped
      const eq = $('.pk-equipped', view);
      if (current) {
        eq.innerHTML = gearCardHtml(current);
        const off = el('button', 'buy secondary-btn', 'Unequip') as HTMLButtonElement;
        off.addEventListener('click', () => {
          g.equip(who, slot, null);
          render();
        });
        eq.firstElementChild!.appendChild(off);
      } else {
        eq.innerHTML = `<div class="gear-card empty"><div class="gc-head"><i>${GEAR_KINDS[def.kind].icon}</i><div><b>Empty</b><small>${def.label} slot</small></div></div></div>`;
      }
      // Inspecting
      const insp = $('.pk-inspect', view);
      const item = selected !== null ? g.gearItem(selected) : undefined;
      $('.pk-inspect-title', view).classList.toggle('hidden', !item);
      insp.innerHTML = '';
      if (item) {
        insp.innerHTML = gearCardHtml(item, current && current.uid !== item.uid ? current : null);
        const worn = g.wearerOf(item.uid);
        const btn = el('button', 'buy') as HTMLButtonElement;
        if (current?.uid === item.uid) {
          btn.textContent = 'Equipped';
          btn.disabled = true;
        } else if (!fits(item)) {
          btn.textContent = `Doesn't fit the ${def.label} slot`;
          btn.disabled = true;
        } else if (worn) {
          // Equipping takes it off whoever has it on.
          btn.textContent = `Take from ${wearerName(worn.who)}`;
        } else {
          btn.textContent = current ? 'Equip (swap)' : 'Equip';
        }
        btn.addEventListener('click', () => {
          if (!g.equip(who, slot, item.uid)) return;
          selected = current?.uid ?? null; // keep the old piece in view for comparison
          render();
        });
        insp.firstElementChild!.appendChild(btn);
      }
      // Inventory grid: everything, with what fits this slot first.
      const grid = $('.pk-grid', view);
      grid.innerHTML = '';
      const rank = (it: GearItem) => RARITY_ORDER.indexOf(gearDef(it.base).rarity);
      const inv = [...g.state.inventory].sort((a, b) => Number(fits(b)) - Number(fits(a)) || rank(b) - rank(a) || b.uid - a.uid);
      $('.pk-count', view).textContent = `${inv.length} item${inv.length === 1 ? '' : 's'}`;
      if (!inv.length) grid.innerHTML = '<p class="empty-inv">Empty. Craft gear in Inventory → Crafting.</p>';
      for (const it of inv) {
        const gd = gearDef(it.base);
        const worn = g.wearerOf(it.uid);
        const tile = el('button', `inv-tile rar${fits(it) ? '' : ' misfit'}${it.uid === selected ? ' selected' : ''}`) as HTMLButtonElement;
        tile.style.setProperty('--rc', gearColor(gd.id));
        tile.innerHTML = `<i>${gearIcon(gd)}</i><span>${gd.name}</span><small class="stars">${starsHtml(it.stars)}</small>${worn ? `<em>${wearerIcon(worn.who)}</em>` : ''}`;
        tile.addEventListener('click', () => {
          selected = it.uid;
          render();
          $('.hd-scroll', view).scrollTo({ top: 0, behavior: 'smooth' });
        });
        grid.appendChild(tile);
      }
    };
    render();
  }

  /** Closes the gear picker (back to the Hunter view). Returns false if it wasn't open. */
  private closePicker(): boolean {
    if (!this.picker) return false;
    this.picker.remove();
    this.picker = null;
    this.equipRefresh?.();
    this.refresh();
    return true;
  }

  /**
   * Equip screen for one piece: every Hunter (you and the Guild Hunters you've recruited) with the gear they're
   * wearing below their icon, each in a frame of its rarity. Tapping a Hunter opens their gear picker for the
   * slot the piece fits, with the piece already picked, ready to swap in.
   */
  private openEquipScreen(uid: number): void {
    this.closeEquipScreen();
    const g = this.game;
    const item = g.gearItem(uid);
    if (!item) return;
    const gd = gearDef(item.base);
    const view = el('div', 'hunter-detail equip-screen floating-close');
    view.innerHTML = `
      <div class="hd-scroll">
        <h2 class="pk-title">Equip ${gd.name}</h2>
        <div class="es-item"></div>
        <div class="section-title"><span>Choose a Hunter</span></div>
        <div class="es-grid"></div>
      </div>
      <button class="hd-close hd-float-close" aria-label="Close">✕</button>`;
    document.body.appendChild(view);
    this.equipScreen = view;
    $('.hd-close', view).addEventListener('click', () => this.closeEquipScreen());
    const who: Wearer[] = ['main', ...HUNTERS.filter((h) => g.state.hunters[h.id].recruited).map((h) => h.id)];
    const render = () => {
      if (!g.gearItem(uid)) return this.closeEquipScreen();
      $('.es-item', view).innerHTML = gearCardHtml(g.gearItem(uid)!);
      const worn = g.wearerOf(uid);
      const grid = $('.es-grid', view);
      grid.innerHTML = '';
      for (const w of who) {
        const slots = g.slotsOf(w);
        const fit = slots.findIndex((sl) => slotAccepts(sl, gd));
        const b = el('button', `card es-hunter${fit < 0 ? ' misfit' : ''}${worn?.who === w ? ' wearing' : ''}`) as HTMLButtonElement;
        const gear = g
          .equipped(w)
          .map((it, i) => {
            const d = it ? gearDef(it.base) : null;
            return `<span class="es-slot${d ? ' rar' : ''}${it?.uid === uid ? ' this' : ''}" style="${d ? `--rc:${gearColor(d.id)}` : ''}" title="${d ? d.name : slots[i].label}">${d ? gearIcon(d) : ''}</span>`;
          })
          .join('');
        b.innerHTML = `${portraitHtml(w)}<b class="es-name">${wearerName(w)}</b><small class="es-note">${worn?.who === w ? 'Wearing it' : fit < 0 ? "Can't use it" : `Lv ${g.levelOf(w)}`}</small><div class="es-gear">${gear}</div>`;
        b.disabled = fit < 0;
        b.addEventListener('click', () => this.openSlotPicker(w, fit, uid));
        grid.appendChild(b);
      }
    };
    render();
    this.equipRefresh = render;
  }

  /** Closes the Equip screen. Returns false if it wasn't open. */
  private closeEquipScreen(): boolean {
    if (!this.equipScreen) return false;
    this.equipScreen.remove();
    this.equipScreen = null;
    this.equipRefresh = null;
    this.refresh();
    return true;
  }

  /**
   * After crafting a piece: an "Equip?" button in the corner (the Train buttons' side, so by handedness) that drains
   * from right to left and goes once it's empty. Tapping it opens the Equip screen for the new piece.
   */
  private showEquipPrompt(uid: number): void {
    document.querySelector('.equip-prompt')?.remove();
    const btn = el('button', 'equip-prompt buy') as HTMLButtonElement;
    btn.innerHTML = `<span>Equip?</span><i class="ep-timer"></i>`;
    btn.style.setProperty('--ep-time', `${EQUIP_PROMPT_SECONDS}s`);
    document.body.appendChild(btn);
    const done = setTimeout(() => btn.remove(), EQUIP_PROMPT_SECONDS * 1000);
    btn.addEventListener('click', () => {
      clearTimeout(done);
      btn.remove();
      this.closeFieldCard();
      this.openEquipScreen(uid);
    });
  }

  /** Details for one inventory piece: upgrade or salvage. */
  private openGearDetail(uid: number): void {
    const g = this.game;
    const item = g.gearItem(uid);
    if (!item) return;
    const gd = gearDef(item.base);
    this.showSheet(`${gearIcon(gd)} ${gd.name}`, (body, close) => {
      const worn = g.wearerOf(uid);
      const cost = g.gearUpgradeCost(uid);
      body.innerHTML = `
        <p><b class="rarity-tag" style="--rc:${gearColor(gd.id)}">${RARITIES[gd.rarity].name}</b> ${gearKindName(gd)} · <span class="stars">${starsHtml(item.stars)}</span></p>
        ${worn ? `<p class="worn-by">${wearerIcon(worn.who)} Worn by <b>${wearerName(worn.who)}</b></p>` : ''}
        ${featureTags(gd, item.stars)}
        ${statTable(gd, cost ? [{ label: `Now ${item.stars}★`, stars: item.stars }, { label: `Next ${item.stars + 1}★`, stars: item.stars + 1 }] : [{ label: `${item.stars}★`, stars: item.stars }]) || (gd.effect ? '' : '<p class="gear-now">No bonuses: plain everyday wear.</p>')}
        ${modSlotsHtml(g, uid)}
        ${cost ? `<div class="fc-label">Upgrade cost</div><div class="fc-cost">${recipeHtml(g, cost, g.gearUpgradeGold(uid) ?? 0)}</div>` : Object.keys(gd.stats).length || gd.effect ? '<p>Fully upgraded.</p>' : '<p>Nothing to upgrade.</p>'}`;
      // Under the modifier slots: Modify (once Kargesh or Marceline has joined).
      if (g.modifiable(uid)) {
        const rb = el('button', 'buy refine-open', '🛠️ Modify') as HTMLButtonElement;
        rb.addEventListener('click', () => {
          close();
          this.openModify(uid);
        });
        body.querySelector('.mod-slots')?.after(rb);
      }
      const actions = el('div', 'actions');
      const equip = el('button', 'buy', '🎽 Equip') as HTMLButtonElement;
      equip.addEventListener('click', () => {
        close();
        this.openEquipScreen(uid);
      });
      actions.appendChild(equip);
      if (cost) {
        const up = el('button', 'buy', `Upgrade to ${item.stars + 1}★`) as HTMLButtonElement;
        up.disabled = !g.canUpgradeGear(uid);
        up.addEventListener('click', () => {
          g.upgradeGear(uid);
          close();
          this.openGearDetail(uid);
        });
        actions.appendChild(up);
      }
      const salvage = el('button', 'buy danger-btn', worn ? 'Worn: unequip to salvage' : 'Salvage') as HTMLButtonElement;
      salvage.disabled = !!worn;
      salvage.addEventListener('click', () => {
        const refund = g.salvageValue(uid);
        close();
        const gold = g.salvageGold(uid);
        this.showModal(`<h2>Salvage ${gd.name}?</h2><p>You'll get back half of its materials${gold ? ', and half of what its modifiers cost' : ''}:</p><div class="cost" style="justify-content:center">${costHtml(g, refund, false)}${gold ? `<span>🪙 ${fmt(gold)}</span>` : ''}</div>`, [
          { label: 'Cancel', secondary: true },
          { label: 'Salvage', action: () => g.salvageGear(uid) },
        ]);
      });
      actions.appendChild(salvage);
      body.appendChild(actions);
    });
  }

  /**
   * Modify a piece. The slots come first, then the choices area, then the Refine and Enchant buttons.
   * Choosing one lights up the empty slots; picking a slot (confirming first if it already holds a modifier,
   * which will be replaced) brings up Roll, which draws `modChoices` random modifiers (2 to start). Their boxes
   * shake for a second, then fade in left to right shedding pixels (falling metal for Refine, rising magic for
   * Enchant), and a perfect roll gets its border. Pick one and it goes in the slot. A paid-for roll waits on
   * the piece until you pick, even if you close the window.
   */
  private openModify(uid: number): void {
    const g = this.game;
    const item = g.gearItem(uid);
    if (!item) return;
    const gd = gearDef(item.base);
    const waiting = g.pendingMod(uid);
    let action: 'refine' | 'enchant' | null = waiting?.kind ?? null;
    let slot: number | null = waiting?.slot ?? null;
    let last: number | null = null; // the slot just filled
    let anim: 'shake' | 'reveal' | null = null;
    /**
     * What the piece does now: its hit, its stats with the refinements it holds added in, how it deals its damage
     * types and their status effects, and its own abilities (at its stars), so you can see what a roll would add to.
     */
    const pieceHtml = (): string => {
      const now = g.gearItem(uid) ?? item;
      const total = gearTotals(gd, now.stars);
      for (const m of now.mods ?? []) if (m?.kind === 'refine' && m.stat in GEAR_STATS) total[m.stat as GearStat] = (total[m.stat as GearStat] ?? 0) + modValue(m, gd);
      const hit = weaponHit(gd, now.stars);
      const stats = [hit ? hitText(hit) : '', describeGear(total)].filter(Boolean).join(', ');
      return `${stats ? `<p class="gear-now"><b>${stats}</b></p>` : ''}${featureTags(gd, now.stars)}`;
    };
    this.showSheet(`🛠️ Modify ${gearIcon(gd)} ${gd.name}`, (body) => {
      const draw = () => {
        const slots = g.modSlots(uid);
        const pending = g.pendingMod(uid);
        const busy = !!pending || !!anim;
        const choices = pending
          ? `<div class="filter-label">${anim ? (pending.kind === 'refine' ? 'Refining…' : 'Enchanting…') : 'Choose one'}</div><div class="mod-choices">${pending.options
              .map((m, i) => {
                const perfect = modPerfect(m) && !anim;
                const inner = anim === 'shake' ? `<span class="roll-dice">🎲</span>` : `${modText(m, gd)}${perfect ? ' <em class="perfect-tag">Perfect</em>' : ''}`;
                return `<button class="mod-choice ${pending.kind}${anim === 'shake' ? ' shaking' : ''}${perfect ? ' perfect' : ''}" data-choice="${i}"${anim ? ' disabled' : ''}>${inner}</button>`;
              })
              .join('')}</div>`
          : action
            ? `<p class="refine-note">${slot === null ? 'Pick a slot.' : `🎲 Roll draws ${g.modChoices} random ${action === 'refine' ? 'refinements' : 'enchantments'} (stronger on rarer gear); pick one for the slot. A roll at the top of its range is perfect.`}</p>${
                g.state.blessings[action] > 0
                  ? `<p class="refine-note mg-bless">✨ Blessed by ${action === 'refine' ? "Kargesh's Forge Strike" : "Marceline's Rune Match"}: this roll tries ${g.state.blessings[action]} extra time${g.state.blessings[action] > 1 ? 's' : ''} for each choice (${Math.round(g.perfectChance(g.state.blessings[action]) * 100)}% perfect instead of ${Math.round(g.perfectChance(0) * 100)}%).</p>`
                  : ''
              }`
            : '<p class="refine-note">Choose Refine or Enchant: the empty slots light up. Rolling draws random choices to pick from.</p>';
        body.innerHTML = `
          <p><b class="rarity-tag" style="--rc:${gearColor(gd.id)}">${RARITIES[gd.rarity].name}</b> ${gearKindName(gd)} · <span class="stars">${starsHtml(item.stars)}</span> · ${slots.length} modifier slot${slots.length === 1 ? '' : 's'}</p>
          <div class="filter-label">This piece</div>
          <div class="mod-piece">${pieceHtml()}</div>
          <div class="filter-label">${action && slot === null ? 'Choose a slot' : 'Slots'}</div>
          <div class="refine-slots">${slots
            .map((m, i) => {
              const perfect = !!m && modPerfect(m);
              const cls = ['refine-slot', action && !m && !busy ? 'open' : '', i === slot ? 'on' : '', perfect ? 'perfect' : '', i === last ? 'fresh' : ''].filter(Boolean).join(' ');
              return `<button class="${cls}" data-slot="${i}"${action && !busy ? '' : ' disabled'}>${m ? `${modText(m, gd)}${perfect ? ' <em class="perfect-tag">Perfect</em>' : ''}` : '<i>Empty slot</i>'}</button>`;
            })
            .join('')}</div>
          ${choices}
          <div class="mod-actions">
            ${g.refineOpen ? `<button class="mod-action${action === 'refine' ? ' on' : ''}" data-action="refine"${busy ? ' disabled' : ''}><b>⚒️ Refine</b><small>Equipment Stat Bonuses</small></button>` : ''}
            ${g.enchantOpen ? `<button class="mod-action${action === 'enchant' ? ' on' : ''}" data-action="enchant"${busy ? ' disabled' : ''}><b>✨ Enchant</b><small>Elemental and Magical Bonuses</small></button>` : ''}
          </div>
          ${!g.refineOpen ? '<p class="refine-note">Recruit Kargesh the Blacksmith (Ember Mines) to Refine.</p>' : ''}
          ${!g.enchantOpen ? '<p class="refine-note">Recruit Marceline the Enchantress (Venom Caverns) to Enchant.</p>' : ''}`;
        // The choice boxes shake for a second, then each is revealed in turn.
        const reveal = (kind: 'refine' | 'enchant') => {
          this.hooks.save();
          last = null;
          anim = 'shake';
          draw();
          setTimeout(() => {
            if (!body.isConnected) return;
            anim = 'reveal';
            draw();
            const boxes = Array.from(body.querySelectorAll<HTMLElement>('.mod-choice'));
            let left = boxes.length;
            const done = () => {
              if (--left > 0 || !body.isConnected) return;
              anim = null;
              draw();
            };
            boxes.forEach((box, i) => setTimeout(() => revealWithPixels(box, REVEAL_PIXELS[kind], kind === 'refine' ? 1 : -1, done), i * 220));
            if (!boxes.length) done();
          }, 1000);
        };
        // Its cost: some of the piece's recipe, plus golem metals (Refine) or gems (Enchant); a reroll costs the same.
        const costOf = (kind: 'refine' | 'enchant') => {
          const row = el('div', 'fc-cost mod-cost');
          row.innerHTML = recipeHtml(g, kind === 'refine' ? g.refineCostOf(uid) : g.enchantCostOf(uid), g.modGoldOf(uid, kind));
          return row;
        };
        if (action && slot !== null && !pending) {
          const go = el('button', 'buy refine-go') as HTMLButtonElement;
          go.innerHTML = `🎲 Roll ${g.modChoices} ${action === 'refine' ? 'Refinements' : 'Enchantments'}`;
          go.disabled = !(action === 'refine' ? g.canRefine(uid, slot) : g.canEnchant(uid, slot));
          body.appendChild(costOf(action));
          go.addEventListener('click', () => {
            if (slot === null || !action || anim) return;
            const kind = action;
            if (!g.rollMod(uid, slot, kind)) return;
            reveal(kind);
          });
          body.appendChild(go);
        }
        // Waiting choices: Reroll swaps them all for a fresh roll, for the same cost, without leaving the window.
        if (pending && !anim) {
          const kind = pending.kind;
          const again = el('button', 'buy refine-go reroll') as HTMLButtonElement;
          again.innerHTML = `🎲 Reroll ${g.modChoices} ${kind === 'refine' ? 'Refinements' : 'Enchantments'}`;
          again.disabled = !g.canReroll(uid);
          again.addEventListener('click', () => {
            if (anim || !g.rerollMod(uid)) return;
            reveal(kind);
          });
          // Right under the choices it replaces.
          $('.mod-choices', body).after(costOf(kind), again);
        }
        body.querySelectorAll<HTMLButtonElement>('.mod-choice').forEach((b) =>
          b.addEventListener('click', () => {
            if (anim) return;
            const at = g.pendingMod(uid)?.slot ?? null;
            const m = g.chooseMod(uid, Number(b.dataset.choice));
            if (!m) return;
            this.hooks.save();
            this.toast(`${modPerfect(m) ? '🌟 Perfect! ' : m.kind === 'refine' ? '⚒️ ' : '✨ '}${gd.name}: ${modText(m, gd)}`);
            last = at;
            slot = null;
            draw();
          }),
        );
        body.querySelectorAll<HTMLButtonElement>('.mod-action').forEach((b) =>
          b.addEventListener('click', () => {
            action = b.dataset.action as 'refine' | 'enchant';
            slot = null;
            last = null;
            draw();
          }),
        );
        body.querySelectorAll<HTMLButtonElement>('.refine-slot').forEach((b) =>
          b.addEventListener('click', () => {
            const i = Number(b.dataset.slot);
            const held = g.modSlots(uid)[i];
            const choose = () => {
              slot = i;
              last = null;
              draw();
            };
            if (!held || slot === i) return choose();
            // An occupied slot: confirm replacing what's there.
            const wrap = el('div', 'mod-confirm-wrap');
            wrap.innerHTML = `<div class="modal-box mod-confirm"><h2>Replace modifier?</h2><p>Using this slot will replace its existing modifier:</p><p class="mod-confirm-cur">${modText(held, gd)}</p><div class="buttons"><button class="secondary mc-cancel">Cancel</button><button class="buy mc-ok">Confirm</button></div></div>`;
            $('.mc-cancel', wrap).addEventListener('click', () => wrap.remove());
            $('.mc-ok', wrap).addEventListener('click', () => {
              wrap.remove();
              choose();
            });
            this.modal.appendChild(wrap);
          }),
        );
      };
      draw();
    });
  }

  /** A modal with arbitrary content and a Close button. */
  private showSheet(title: string, build: (body: HTMLElement, close: () => void) => void): void {
    this.modal.innerHTML = `<div class="modal-box sheet"><h2>${title}</h2><div class="sheet-body"></div><div class="buttons"></div></div>`;
    const close = () => {
      this.modal.classList.add('hidden');
      this.modalClose = null;
      this.refresh();
    };
    build($('.sheet-body', this.modal), close);
    const btn = el('button', 'secondary', 'Close');
    btn.addEventListener('click', close);
    $('.buttons', this.modal).appendChild(btn);
    this.modalClose = close;
    this.modal.classList.remove('hidden');
  }

  // ---- Areas tab ----

  /**
   * Areas tab: a 3-wide grid of area icons, each with slots for the Hunters stationed there. Selecting an
   * area shows its description and monsters below, with Details (the full area card) and Travel.
   */
  private buildAreas(): void {
    const g = this.game;
    if (!this.selectedArea || !g.isAreaUnlocked(this.selectedArea)) this.selectedArea = g.area;
    const grid = el('div', 'area-grid');
    this.panel.appendChild(grid);
    const tiles = AREAS.map((a) => {
      const cell = el('div', 'area-cell');
      const tile = el('button', 'area-tile') as HTMLButtonElement;
      tile.innerHTML = `<i>${a.icon}</i><span>${a.name}</span>`;
      tile.style.setProperty('--ac', a.palette[2]);
      this.areaGestures(tile, a.id);
      const slots = el('div', 'area-hunters');
      cell.append(tile, slots);
      grid.appendChild(cell);
      return { a, tile, slots };
    });
    this.refreshers.push(() => {
      for (const { a, tile, slots } of tiles) {
        const open = g.isAreaUnlocked(a.id);
        tile.classList.toggle('locked', !open);
        tile.classList.toggle('here', g.area === a.id);
        tile.classList.toggle('selected', this.selectedArea === a.id);
        tile.innerHTML = open ? `<i>${a.icon}</i><span>${a.name}</span>${g.area === a.id ? '<b class="you-here">📍</b>' : ''}` : '<i>🔒</i><span>???</span>';
        const here = open ? g.stationedIn(a.id) : [];
        slots.innerHTML = Array.from({ length: STATION_CAPACITY }, (_, i) => {
          const h = here[i];
          return h ? `<span class="mini-hunter" style="--hc:${hunterDef(h).color}" title="${hunterDef(h).name}">${wearerIcon(h)}</span>` : '<span class="mini-hunter empty"></span>';
        }).join('');
      }
    });

    // The selected area
    const a = areaDef(this.selectedArea);
    const panel = el('div', 'card area-panel');
    panel.innerHTML = `<h3><span>${a.icon} ${a.name}</span></h3><p>${a.blurb}</p><div class="monster-icons"></div><p class="area-hint">Double-tap an area for its details · hold one to travel there</p>`;
    // Full-screen menu: the selected area's name heads the tab, right under the tabs.
    if (this.menuFull) {
      const head = el('div', 'area-head');
      head.innerHTML = `<span>${a.icon} ${a.name}</span>`;
      this.panel.prepend(head);
    }
    this.panel.appendChild(panel);
    // Details and Travel sit in a bar pinned to the bottom of the menu, so they're in reach wherever you've scrolled.
    const bar = el('div', 'area-actions');
    bar.innerHTML = `${this.menuFull ? '' : `<span class="aa-name">${a.icon} ${a.name}</span>`}<div class="actions">${this.menuFull ? '<button class="buy secondary-btn hunters-btn">Hunters</button>' : ''}<button class="buy secondary-btn details">Details</button><button class="buy travel">Travel</button></div>`;
    bar.querySelector('.hunters-btn')?.addEventListener('click', () => this.openWorld(null, a.id));
    const icons = $('.monster-icons', panel);
    for (const e of areaEnemies(a.id)) {
      const known = g.state.bestiary[e.id].unlocked;
      const m = el('div', `monster-icon${known ? '' : ' unknown'}`);
      m.innerHTML = `<canvas></canvas><small>${known ? e.name : '???'}</small>`;
      icons.appendChild(m);
      queuePortrait($<HTMLCanvasElement>('canvas', m), e.id);
    }
    $('.details', bar).addEventListener('click', () => this.openAreaDetail(a.id));
    const travel = $<HTMLButtonElement>('.travel', bar);
    travel.addEventListener('click', () => g.travel(a.id));
    this.refreshers.push(() => {
      const here = g.area === a.id;
      travel.disabled = here || g.eventRunning;
      travel.textContent = here ? 'You are here' : 'Travel';
    });

    const stats = el('div', 'card');
    stats.innerHTML = `<h3>Records</h3><div class="stats"></div>`;
    this.panel.appendChild(stats);
    this.refreshers.push(() => {
      const s = g.state;
      const rows: Array<[string, string]> = [
        ['Areas unlocked', `${g.unlockedAreas.length} / ${AREAS.length}`],
        ['Guardians slain', fmt(s.stats.guardians)],
        ['Monsters slain', fmt(s.stats.totalKills)],
        ['Monsters escaped', fmt(s.stats.escaped)],
        ['Gold earned', fmt(s.stats.totalGold)],
        ['Taps', fmt(s.stats.taps)],
      ];
      $('.stats', stats).innerHTML = rows.map(([k, v]) => `<span>${k}</span><span>${v}</span>`).join('');
    });
    this.panel.appendChild(bar);
  }

  /** Full-screen area card: stats, events, stationed Hunters and every monster with its drop. */
  private openAreaDetail(id: AreaId): void {
    if (this.detail) this.dropDetail();
    const g = this.game;
    const a = areaDef(id);
    const view = el('div', 'hunter-detail area-detail');
    view.innerHTML = `
      <div class="hd-top"><button class="hd-close" aria-label="Close">✕</button><span>Areas</span></div>
      <div class="hd-scroll">
        <div class="hd-hero">
          <div class="area-tile big" style="--ac:${a.palette[2]}"><i>${a.icon}</i></div>
          <div class="hd-title"><h2>${a.name}</h2><div class="hd-sub"><span>${a.blurb}</span></div></div>
        </div>
        <div class="hd-body"></div>
      </div>`;
    document.body.appendChild(view);
    $('.hd-close', view).addEventListener('click', () => this.closeHunterDetail());
    this.detail = { el: view, refreshers: [] };
    const body = $('.hd-body', view);
    const main = this.refreshers;
    this.refreshers = [];

    body.appendChild(sectionTitle('Stats'));
    const mastery = el('div', 'mastery-wrap');
    body.appendChild(mastery);
    const stats = el('div', 'hd-stats');
    body.appendChild(stats);

    const events = EVENTS.filter((e) => e.area === id);
    if (events.length) {
      body.appendChild(sectionTitle('Events'));
      const list = el('div', 'area-events');
      body.appendChild(list);
      this.refreshers.push(() => {
        list.innerHTML = events
          .map((e) => {
            const st = g.state.events[e.id];
            const unlocked = g.eventUnlocked(e.id);
            return `<div class="row"><div class="icon">${e.icon}</div><div class="info"><div class="name">${e.name}</div><div class="sub">${
              unlocked ? `Run ${fmt(st.runs)} time${st.runs === 1 ? '' : 's'} · completed ${fmt(st.completed)}` : `🔒 Unlocks at ${fmt(e.unlockKills)} ${unlockNoun(e)} slain here`
            }</div></div></div>`;
          })
          .join('');
      });
    }

    const activeTitle = sectionTitle('Active Hunters');
    activeTitle.classList.add('center');
    body.appendChild(activeTitle);
    body.appendChild(this.activeHunters(id));

    body.appendChild(sectionTitle('Monsters'));
    const monsters = el('div', 'area-monsters');
    body.appendChild(monsters);
    for (const e of areaEnemies(id)) {
      const known = g.state.bestiary[e.id].unlocked;
      const row = el('div', `row${known ? '' : ' locked'}`);
      row.innerHTML = `<canvas class="portrait"></canvas><div class="info"><div class="name">${known ? e.name : '???'} <small>${ARCHETYPES[e.archetype].icon} ${ARCHETYPES[e.archetype].name}</small></div><div class="drop">${known ? dropsText(e) : `${gemHtml(e.material)} Drops <b>???</b>`}</div><div class="sub">${known ? e.blurb : 'Unlock it in the Bestiary.'}</div>${known ? affinityHtml(e, true) : ''}</div>`;
      monsters.appendChild(row);
      queuePortrait($<HTMLCanvasElement>('canvas', row), e.id);
    }

    this.refreshers.push(() => {
      const st = g.state.areas[id];
      const next = nextAreaOf(id);
      // The last area is cleared by beating its Guardian (the Time Eater) at least once.
      const cleared = next ? g.isAreaUnlocked(next.id) : (g.state.events[`guardian-${id}`]?.completed ?? 0) > 0;
      mastery.innerHTML = cleared
        ? `<div class="mastery done"><span>${next ? '✓ Guardian defeated' : `✓ ${enemyDef(GUARDIAN_ENEMY[id]).name} defeated`}</span></div>`
        : `<div class="mastery"><i style="width:${Math.min(1, st.kills / a.mastery) * 100}%"></i><span>Mastery ${fmt(st.kills)} / ${fmt(a.mastery)}</span></div>`;
      const guardian = g.state.events[`guardian-${id}`];
      const runs = events.reduce((sum, e) => sum + g.state.events[e.id].runs, 0);
      const cells: Array<[string, string]> = [
        ['Monsters slain', fmt(st.kills)],
        ['Guardian slain', guardian ? fmt(guardian.completed) : '—'],
        ['Events run', fmt(runs)],
        ['Gold earned', `🪙 ${fmt(st.gold)}`],
        ['Escaped', fmt(st.escaped)],
        ['Knockouts', fmt(st.knockouts)],
      ];
      stats.innerHTML = cells.map(([k, v]) => `<div><b>${v}</b>${k}</div>`).join('');
    });

    this.detail.refreshers = this.refreshers;
    this.refreshers = main;
    this.refresh();
  }

  /** The Active Hunters row: one slot per space in the area; tap any slot to manage who's here. */
  private activeHunters(id: AreaId): HTMLElement {
    const g = this.game;
    const wrap = el('div', 'active-hunters');
    const you = el('div', 'you-here-line');
    const row = el('div', 'active-slots');
    const yieldEl = el('div', 'active-yield');
    wrap.append(you, row, yieldEl);
    let key = '';
    this.refreshers.push(() => {
      const here = g.stationedIn(id);
      you.innerHTML = g.area === id ? `${portraitHtml('main', 'mini')}<span>📍 ${esc(mainName())} ${mainHunterName ? 'is' : 'are'} hunting here</span>` : '';
      you.classList.toggle('hidden', g.area !== id);
      const k = `${here.join(',')}|${g.area}`;
      if (k !== key) {
        key = k;
        row.innerHTML = '';
        for (let i = 0; i < STATION_CAPACITY; i++) {
          const h = here[i];
          const slot = el('button', `active-slot${h ? '' : ' empty'}`) as HTMLButtonElement;
          slot.innerHTML = h
            ? `${portraitHtml(h)}<b>${hunterDef(h).name}</b><small>Lv ${g.levelOf(h)}</small>`
            : '<span class="plus">+</span><small>Assign a Hunter</small>';
          slot.addEventListener('click', () => this.openAssign(id, h ?? null));
          row.appendChild(slot);
        }
      }
      yieldEl.innerHTML = here.length && g.area !== id ? yieldHtml(this.rates(id, here, STATION_EFFICIENCY), 'Together they earn') : '';
    });
    return wrap;
  }

  /**
   * Full-screen Hunter assignment for an area: its slots on top, every recruited Hunter in a grid below.
   * Drag a Hunter onto a slot to assign them (bumping whoever was there if the area is full), or drag one out
   * of a slot to unassign them. Or tap a Hunter and use Assign / Unassign.
   */
  private openAssign(id: AreaId, preselect: HunterId | null): void {
    this.closePicker();
    const g = this.game;
    const a = areaDef(id);
    const view = el('div', 'hunter-detail picker assign');
    view.innerHTML = `
      <div class="hd-top"><button class="hd-close" aria-label="Close">✕</button><span>${a.icon} ${a.name} · Active Hunters</span></div>
      <div class="hd-scroll">
        <p class="hd-note assign-tip">Drag a Hunter into a slot, double-tap one to assign it, or tap one for Assign / Unassign.</p>
        <button class="buy secondary-btn all-areas">🗺️ All Areas</button>
        <div class="active-slots assign-slots"></div>
        <div class="section-title"><span>Your Hunters</span></div>
        <div class="assign-grid"></div>
      </div>`;
    document.body.appendChild(view);
    this.picker = view;
    $('.hd-close', view).addEventListener('click', () => this.closePicker());
    let selected: HunterId | null = preselect;
    $('.all-areas', view).addEventListener('click', () => this.openWorld(selected, id));
    const recruited = HUNTERS.filter((h) => g.state.hunters[h.id].recruited).map((h) => h.id);

    const assign = (h: HunterId, bump: HunterId | null = null) => {
      if (g.state.hunters[h].station === id) return;
      if (!g.canStation(h, id) && bump) g.station(bump, null);
      g.station(h, id);
    };
    const unassign = (h: HunterId) => {
      if (g.state.hunters[h].station === id) g.station(h, null);
    };

    const render = () => {
      const here = g.stationedIn(id);
      const slots = $('.assign-slots', view);
      slots.innerHTML = '';
      for (let i = 0; i < STATION_CAPACITY; i++) {
        const h = here[i];
        const slot = el('div', `active-slot${h ? '' : ' empty'}${h && h === selected ? ' selected' : ''}`);
        slot.dataset.slot = String(i);
        if (h) slot.dataset.hunter = h;
        slot.innerHTML = h ? `${portraitHtml(h)}<b>${hunterDef(h).name}</b><small>Lv ${g.levelOf(h)}</small>` : '<span class="plus">+</span><small>Empty</small>';
        slots.appendChild(slot);
      }
      const grid = $('.assign-grid', view);
      grid.innerHTML = '';
      grid.dataset.drop = 'grid';
      if (!recruited.length) grid.innerHTML = '<p class="hd-note">Recruit Hunters from the Hunters tab first.</p>';
      for (const h of recruited) {
        const st = g.state.hunters[h].station;
        const tile = el('div', `assign-tile${h === selected ? ' selected' : ''}${st === id ? ' here' : ''}`);
        tile.dataset.hunter = h;
        tile.innerHTML = `${portraitHtml(h)}<b>${hunterDef(h).name}</b><small>${st === id ? '✓ Here' : st ? `📍 ${areaDef(st).name.split(' ').pop()}` : '💤 Resting'}</small>`;
        grid.appendChild(tile);
      }
      // The selected Hunter gets its Assign / Unassign button right on its icon (in the slot and the grid).
      if (selected) {
        const h = selected;
        const isHere = g.state.hunters[h].station === id;
        const full = !g.canStation(h, id);
        view.querySelectorAll<HTMLElement>(`[data-hunter="${h}"]`).forEach((holder) => {
          const btn = el('button', `buy tile-action${isHere ? ' danger-btn' : ''}`, isHere ? 'Unassign' : full ? 'Full' : 'Assign') as HTMLButtonElement;
          btn.disabled = !isHere && full;
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (isHere) unassign(h);
            else assign(h);
            render();
          });
          holder.appendChild(btn);
        });
      }
    };
    let lastTap = { h: null as HunterId | null, at: 0 };

    // Tap to select, drag to move (pointer events, so it works with touch).
    const scroll = $('.hd-scroll', view);
    scroll.addEventListener('pointerdown', (ev) => {
      if ((ev.target as HTMLElement).closest('.tile-action')) return; // its own click handler
      const src = (ev.target as HTMLElement).closest<HTMLElement>('[data-hunter]');
      if (!src) return;
      const h = src.dataset.hunter as HunterId;
      const fromSlot = src.classList.contains('active-slot');
      const start = { x: ev.clientX, y: ev.clientY };
      let ghost: HTMLElement | null = null;
      const move = (e: PointerEvent) => {
        if (!ghost && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 8) {
          ghost = el('div', 'drag-ghost');
          ghost.innerHTML = portraitHtml(h);
          document.body.appendChild(ghost);
          src.classList.add('dragging');
        }
        if (ghost) {
          e.preventDefault();
          ghost.style.left = `${e.clientX}px`;
          ghost.style.top = `${e.clientY}px`;
          view.querySelectorAll('.drop-over').forEach((x) => x.classList.remove('drop-over'));
          (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest('.active-slot, .assign-grid')?.classList.add('drop-over');
        }
      };
      const up = (e: PointerEvent) => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        src.classList.remove('dragging');
        if (!ghost) {
          // A double tap assigns straight away when there's room; a single tap selects.
          const now = performance.now();
          if (lastTap.h === h && now - lastTap.at < 350 && g.state.hunters[h].station !== id && g.canStation(h, id)) {
            assign(h);
            lastTap = { h: null, at: 0 };
          } else {
            lastTap = { h, at: now };
            selected = h;
          }
          render();
          return;
        }
        ghost.remove();
        const target = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest<HTMLElement>('.active-slot, .assign-grid');
        if (target?.classList.contains('active-slot') && !fromSlot) assign(h, (target.dataset.hunter as HunterId) ?? null);
        else if (target?.classList.contains('assign-grid') && fromSlot) unassign(h);
        selected = h;
        render();
      };
      window.addEventListener('pointermove', move, { passive: false });
      window.addEventListener('pointerup', up);
    });
    render();
  }

  /** Area tile gestures: tap selects it, double-tap opens its details, holding it travels there. */
  private areaGestures(tile: HTMLElement, id: AreaId): void {
    const g = this.game;
    tile.addEventListener('contextmenu', (e) => e.preventDefault());
    tile.addEventListener('pointerdown', (ev) => {
      if (!g.isAreaUnlocked(id)) return;
      const start = { x: ev.clientX, y: ev.clientY };
      let over = false;
      const end = () => {
        clearTimeout(timer);
        tile.classList.remove('holding');
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', cancel);
      };
      const timer = setTimeout(() => {
        over = true;
        end();
        this.holdTravel(id);
      }, AREA_HOLD_MS);
      const move = (e: PointerEvent) => {
        if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) cancel(); // scrolling, not holding
      };
      const cancel = () => {
        over = true;
        end();
      };
      const up = () => {
        end();
        if (over) return;
        const now = performance.now();
        if (this.areaTap.id === id && now - this.areaTap.at < DOUBLE_TAP_MS) {
          this.areaTap = { id: null, at: 0 };
          this.openAreaDetail(id);
          return;
        }
        this.areaTap = { id, at: now };
        if (this.selectedArea !== id) {
          this.selectedArea = id;
          this.setTab('areas', true);
        }
      };
      tile.classList.add('holding');
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', cancel);
    });
  }

  /** Holding an area tile: travel there. */
  private holdTravel(id: AreaId): void {
    const g = this.game;
    navigator.vibrate?.(25);
    this.selectedArea = id;
    if (g.area === id) this.toast(`You're already in ${areaDef(id).name}`);
    else if (g.eventRunning) this.toast('Finish the event first!');
    else {
      g.travel(id);
      this.toast(`Traveled to ${areaDef(id).name}!`);
    }
    this.setTab('areas', true);
  }

  /**
   * The all-areas Hunter view: every area with its stations, and every recruited Hunter as an icon along
   * the bottom. Drag a Hunter onto an area with room to station them there, onto a Hunter in a full area to
   * swap the two, or onto the tray to rest them. Tapping one shows its name with Details and Assign / Unassign.
   */
  private openWorld(preselect: HunterId | null = null, focus: AreaId | null = null): void {
    this.closePicker();
    const g = this.game;
    const view = el('div', 'hunter-detail picker world');
    view.innerHTML = `
      <div class="hd-top"><button class="hd-close" aria-label="Close">✕</button><span>🗺️ All Areas · Hunters</span></div>
      <div class="hd-scroll">
        <p class="hd-note">Drag a Hunter onto an area to station them there, or onto a Hunter in a full area to swap them. Tap one for Details and Assign.</p>
        <div class="world-grid"></div>
      </div>
      <div class="world-foot">
        <div class="world-bar hidden"></div>
        <div class="world-tray"><div class="wt-label">Your Hunters · drop one here to rest</div><div class="wt-icons"></div></div>
      </div>`;
    document.body.appendChild(view);
    this.picker = view;
    $('.hd-close', view).addEventListener('click', () => this.closePicker());
    const recruited = HUNTERS.filter((h) => g.state.hunters[h.id].recruited).map((h) => h.id);
    let selected: HunterId | null = preselect && recruited.includes(preselect) ? preselect : null;
    /** Assign mode: waiting for a tap on the area to send the selected Hunter to. */
    let picking = false;

    /** Moves `h` into `area`; if it's full, swaps with `bump` (who takes `h`'s old place, or rests). */
    const moveTo = (h: HunterId, area: AreaId, bump: HunterId | null): boolean => {
      const from = g.state.hunters[h].station;
      if (from === area || !g.isAreaUnlocked(area)) return false;
      if (g.canStation(h, area)) g.station(h, area);
      else if (bump) {
        g.station(bump, null);
        g.station(h, area);
        g.station(bump, from);
      } else {
        this.toast(`${areaDef(area).name} is full`);
        return false;
      }
      return true;
    };

    const render = () => {
      const grid = $('.world-grid', view);
      grid.innerHTML = '';
      for (const a of AREAS) {
        const open = g.isAreaUnlocked(a.id);
        const here = open ? g.stationedIn(a.id) : [];
        const cell = el('div', `world-cell${open ? '' : ' locked'}${a.id === focus ? ' focus' : ''}`);
        if (open) cell.dataset.area = a.id;
        if (picking && open && selected && g.state.hunters[selected].station !== a.id) cell.classList.add(g.canStation(selected, a.id) ? 'can-drop' : 'can-swap');
        cell.innerHTML = `<div class="area-tile world-tile" style="--ac:${a.palette[2]}">${
          open ? `<i>${a.icon}</i><span>${a.name}</span>${g.area === a.id ? '<b class="you-here">📍</b>' : ''}` : '<i>🔒</i><span>???</span>'
        }</div><div class="world-slots"></div>`;
        const slots = $('.world-slots', cell);
        for (let i = 0; i < STATION_CAPACITY; i++) {
          const h = here[i];
          const slot = el('div', `world-slot${h ? '' : ' empty'}${h && h === selected ? ' selected' : ''}`);
          if (h) {
            slot.dataset.hunter = h;
            slot.innerHTML = portraitHtml(h, 'wh');
          }
          slots.appendChild(slot);
        }
        grid.appendChild(cell);
      }
      const tray = $('.wt-icons', view);
      tray.innerHTML = recruited.length ? '' : '<p class="hd-note">Recruit Hunters from the Hunters tab first.</p>';
      for (const h of recruited) {
        const st = g.state.hunters[h].station;
        const icon = el('div', `wt-hunter${h === selected ? ' selected' : ''}${st ? ' away' : ''}`);
        icon.dataset.hunter = h;
        icon.innerHTML = `${portraitHtml(h, 'wh')}<i class="wt-where">${st ? areaDef(st).icon : '💤'}</i>`;
        tray.appendChild(icon);
      }
      const bar = $('.world-bar', view);
      bar.classList.toggle('hidden', !selected);
      if (selected) {
        const h = selected;
        const st = g.state.hunters[h].station;
        if (picking) {
          bar.innerHTML = `${portraitHtml(h, 'wh')}<div class="wb-name"><b>${hunterDef(h).name}</b><small>Tap an area to send them there</small></div><div class="wb-actions"><button class="buy secondary-btn wb-cancel">Cancel</button></div>`;
          $('.wb-cancel', bar).addEventListener('click', () => {
            picking = false;
            render();
          });
        } else {
          bar.innerHTML = `${portraitHtml(h, 'wh')}<div class="wb-name"><b>${hunterDef(h).name}</b><small>${st ? `📍 ${areaDef(st).name}` : '💤 Resting'} · Lv ${g.levelOf(h)}</small></div><div class="wb-actions"><button class="buy secondary-btn wb-details">Details</button><button class="buy ${st ? 'danger-btn wb-unassign' : 'wb-assign'}">${st ? 'Unassign' : 'Assign'}</button></div>`;
          $('.wb-details', bar).addEventListener('click', () => {
            this.closePicker();
            this.openHunterDetail(h);
          });
          bar.querySelector('.wb-unassign')?.addEventListener('click', () => {
            g.station(h, null);
            this.refresh();
            render();
          });
          bar.querySelector('.wb-assign')?.addEventListener('click', () => {
            picking = true;
            render();
          });
        }
      }
    };

    // Assign mode: tapping an area sends the selected Hunter there (onto a Hunter in a full one: a swap).
    $('.world-grid', view).addEventListener('click', (e) => {
      if (!picking || !selected) return;
      const t = e.target as HTMLElement;
      const cell = t.closest<HTMLElement>('.world-cell[data-area]');
      if (!cell) return;
      const bump = (t.closest<HTMLElement>('.world-slot')?.dataset.hunter as HunterId | undefined) ?? null;
      const area = cell.dataset.area as AreaId;
      if (!g.canStation(selected, area) && !bump) {
        this.toast(`${areaDef(area).name} is full: tap a Hunter there to swap`);
        return;
      }
      if (moveTo(selected, area, bump)) {
        picking = false;
        this.refresh();
        render();
      }
    });

    // Tap to select, drag to move (pointer events, so it works with touch).
    let preview: HTMLElement | null = null;
    const clearHover = () => {
      view.querySelectorAll('.drop-over, .drop-full, .drop-swap').forEach((x) => x.classList.remove('drop-over', 'drop-full', 'drop-swap'));
      preview?.remove();
      preview = null;
    };
    /** What's under the pointer for a Hunter being dragged. */
    const targetAt = (x: number, y: number) => {
      const hit = document.elementFromPoint(x, y) as HTMLElement | null;
      const cell = hit?.closest<HTMLElement>('.world-cell[data-area]') ?? null;
      const slot = hit?.closest<HTMLElement>('.world-slot') ?? null;
      const tray = hit?.closest<HTMLElement>('.world-tray') ?? null;
      return { cell, slot, tray, area: (cell?.dataset.area as AreaId | undefined) ?? null, occupant: (slot?.dataset.hunter as HunterId | undefined) ?? null };
    };
    view.addEventListener('pointerdown', (ev) => {
      if (picking || (ev.target as HTMLElement).closest('button')) return;
      const src = (ev.target as HTMLElement).closest<HTMLElement>('[data-hunter]');
      if (!src) return;
      const h = src.dataset.hunter as HunterId;
      const start = { x: ev.clientX, y: ev.clientY };
      let ghost: HTMLElement | null = null;
      const move = (e: PointerEvent) => {
        if (!ghost && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 8) {
          ghost = el('div', 'drag-ghost');
          ghost.innerHTML = portraitHtml(h);
          document.body.appendChild(ghost);
          src.classList.add('dragging');
          if (selected !== h) {
            selected = h;
            render(); // shows their name in the bar (src stays in place until the drop)
          }
        }
        if (!ghost) return;
        e.preventDefault();
        ghost.style.left = `${e.clientX}px`;
        ghost.style.top = `${e.clientY}px`;
        clearHover();
        ghost.classList.remove('hidden');
        const t = targetAt(e.clientX, e.clientY);
        const from = g.state.hunters[h].station;
        if (t.tray && from) t.tray.classList.add('drop-over');
        if (!t.cell || !t.area || t.area === from) return;
        if (g.canStation(h, t.area)) t.cell.classList.add('drop-over');
        else if (t.occupant && t.slot) {
          // Full: hovering a Hunter shows the swap, above the slot so the finger doesn't hide it.
          t.cell.classList.add('drop-swap');
          preview = el('div', 'swap-preview');
          preview.innerHTML = `${portraitHtml(t.occupant, 'wh')}<b>↓</b>${portraitHtml(h, 'wh')}`;
          document.body.appendChild(preview);
          const r = t.slot.getBoundingClientRect();
          preview.style.left = `${r.left + r.width / 2}px`;
          preview.style.top = `${r.top - 6}px`;
          ghost.classList.add('hidden'); // the line-up already shows who's coming in
        } else t.cell.classList.add('drop-full');
      };
      const up = (e: PointerEvent) => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        src.classList.remove('dragging');
        if (!ghost) {
          selected = selected === h ? null : h;
          render();
          return;
        }
        ghost.remove();
        clearHover();
        const t = targetAt(e.clientX, e.clientY);
        if (t.tray && g.state.hunters[h].station) g.station(h, null);
        else if (t.area) moveTo(h, t.area, t.occupant);
        selected = h;
        this.refresh();
        render();
      };
      window.addEventListener('pointermove', move, { passive: false });
      window.addEventListener('pointerup', up);
    });
    render();
    if (focus) requestAnimationFrame(() => view.querySelector('.world-cell.focus')?.scrollIntoView({ block: 'center' }));
  }

  // ---- Full-screen menu ----

  /**
   * Long-pressing a tab, or swiping the tab bar up, raises the menu over the battlefield (under the top
   * bar); a red strip above the tabs, a swipe down, or another long press drops it back.
   */
  private menuGestures(): void {
    const tabs = $('.tabs');
    let suppress = false;
    tabs.addEventListener(
      'click',
      (e) => {
        if (!suppress) return;
        suppress = false;
        e.stopPropagation();
        e.preventDefault();
      },
      true,
    );
    tabs.addEventListener('contextmenu', (e) => e.preventDefault());
    tabs.addEventListener('pointerdown', (ev) => {
      suppress = false;
      const btn = (ev.target as HTMLElement).closest<HTMLButtonElement>('button[data-tab]');
      const startY = ev.clientY;
      const startX = ev.clientX;
      let done = false;
      const end = () => {
        clearTimeout(timer);
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', end);
        window.removeEventListener('pointercancel', end);
      };
      const timer = setTimeout(() => {
        done = suppress = true;
        end();
        navigator.vibrate?.(25);
        const tab = btn?.dataset.tab as Tab | undefined;
        if (tab && (tab !== 'events' || this.game.eventsOpen) && (tab !== 'areas' || this.areasOpen)) this.tab = tab;
        this.setMenuFull(!this.menuFull);
      }, MENU_HOLD_MS);
      const move = (e: PointerEvent) => {
        const dy = e.clientY - startY;
        if (Math.hypot(e.clientX - startX, dy) > 10) clearTimeout(timer);
        if (done || Math.abs(dy) < 36 || Math.abs(dy) < Math.abs(e.clientX - startX)) return;
        done = suppress = true;
        end();
        this.setMenuFull(dy < 0);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', end);
      window.addEventListener('pointercancel', end);
    });
    $('#menuDrop').addEventListener('click', () => this.setMenuFull(false));
  }

  /** Raises the menu to full screen (the battlefield keeps running underneath) or drops it back. */
  private setMenuFull(on: boolean): boolean {
    if (on === this.menuFull) return false;
    const app = $('#app');
    const wrap = $('.battle-wrap');
    // The battlefield keeps its size while hidden, so the fight carries on as it was.
    wrap.style.height = on ? `${wrap.clientHeight}px` : '';
    this.menuFull = on;
    app.classList.toggle('menu-full', on);
    this.closeFieldCard();
    this.setTab(this.tab, true);
    return true;
  }

  // ---- Bestiary tab (enemy roster, per area) ----

  /**
   * Bestiary tab, like the Hunters tab: each area's monsters as a 4-wide grid of portraits (the current area
   * first), a border glowing when you can afford to Empower (or unlock) one and unspent evolution points on the
   * corner. Selecting one pins its card to the bottom of the menu; tap the card for its full view.
   */
  private buildBestiary(): void {
    const g = this.game;
    const order = [g.area, ...g.unlockedAreas.filter((a) => a !== g.area)];
    const all = order.flatMap((a) => areaEnemies(a));
    // The current area's first monster until you pick one.
    if (!all.some((d) => d.id === this.selectedBeast)) this.selectedBeast = all[0].id;
    // The monster on the pinned card has been looked at.
    if (this.selectedBeast && this.newBeast(enemyDef(this.selectedBeast))) this.markSeen('beasts', this.selectedBeast);
    const tiles: Array<{ def: EnemyDef; tile: HTMLElement; lv: HTMLElement; dot: HTMLElement }> = [];
    for (const areaId of order) {
      this.panel.appendChild(sectionTitle(`${areaDef(areaId).name}${areaId === g.area ? ' · here' : ''}`));
      const grid = el('div', 'hunter-grid');
      for (const def of areaEnemies(areaId)) {
        const tile = el('button', 'hunter-tile beast-tile') as HTMLButtonElement;
        tile.innerHTML = `<canvas class="bt-portrait"></canvas><span class="ht-name">${def.name}</span><small class="ht-lv"></small><b class="sp-dot hidden" title="Unspent evolution points"></b><span class="alert-mark white tile-new hidden"></span>`;
        tile.classList.toggle('selected', def.id === this.selectedBeast);
        const mark = $('.tile-new', tile);
        this.refreshers.push(() => mark.classList.toggle('hidden', def.id === this.selectedBeast || !this.newBeast(def)));
        tile.addEventListener('click', () => {
          if (this.selectedBeast === def.id) return;
          this.selectedBeast = def.id;
          this.setTab('beasts', true);
        });
        grid.appendChild(tile);
        queuePortrait($<HTMLCanvasElement>('canvas', tile), def.id);
        tiles.push({ def, tile, lv: $('.ht-lv', tile), dot: $('.sp-dot', tile) });
      }
      this.panel.appendChild(grid);
    }
    this.refreshers.push(() => {
      for (const { def, tile, lv, dot } of tiles) {
        let ready: boolean;
        if (g.state.bestiary[def.id].unlocked) {
          const level = g.monsterLevelInfo(def.id).level;
          lv.textContent = `Lv ${level}`;
          ready = g.empowerUnlocked && level < MAX_MONSTER_LEVEL && g.state.gold >= g.empowerPurchase(def.id, 1).cost;
          const points = g.evoPoints(def.id);
          dot.textContent = String(points);
          dot.classList.toggle('hidden', points <= 0);
        } else {
          lv.textContent = 'Unlock';
          ready = false;
        }
        // Still locked: a greyed-out square, with a silver (not gold) outline once you can afford to unlock it.
        const locked = !g.state.bestiary[def.id].unlocked;
        tile.classList.toggle('beast-locked', locked);
        tile.classList.toggle('unlockable', locked && g.state.gold >= enemyUnlockCost(def));
        tile.classList.toggle('ready', ready);
      }
    });
    const next = nextAreaOf(g.unlockedAreas[g.unlockedAreas.length - 1]);
    if (next) {
      const teaser = el('div', 'card');
      teaser.innerHTML = `<p style="margin:0">🔒 More monsters await in <b>${next.name}</b>.</p>`;
      this.panel.appendChild(teaser);
    }
    // The selected monster's card, pinned to the bottom so it's in reach wherever the grid is scrolled.
    const dock = el('div', 'hunter-dock');
    this.buildBeast(enemyDef(this.selectedBeast!), dock);
    this.panel.appendChild(dock);
  }

  private buildBeast(def: EnemyDef, parent: HTMLElement): void {
    const g = this.game;
    const card = el('div', 'beast');
    card.innerHTML = `
      <div class="beast-head">
        <canvas class="portrait"></canvas>
        <div class="info"><div class="card-corner"></div><div class="name"></div><div class="blurb">${def.blurb}</div>${dropHtml(def)}</div>
      </div>
      ${affinityHtml(def, true)}
      <div class="beast-actions"></div>`;
    parent.appendChild(card);
    queuePortrait($<HTMLCanvasElement>('canvas', card), def.id);

    const actions = $('.beast-actions', card);
    const unlockBtn = el('button', 'buy') as HTMLButtonElement;
    unlockBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      g.unlockEnemy(def.id);
    });
    const unlocked = g.state.bestiary[def.id].unlocked;
    // Unlocked: level, progress and an Empower button, like a Hunter's Train row. Tap the card to evolve.
    const row = el('div', 'hc-train');
    row.innerHTML = '<span class="hc-lv"></span><div class="hc-mid"></div><div class="hc-action"></div>';
    const dot = el('b', 'sp-dot hidden');
    dot.title = 'Unspent evolution points';
    if (unlocked) {
      const { btn, bar } = this.empowerParts(def.id);
      $('.hc-mid', row).appendChild(bar);
      $('.hc-action', row).appendChild(btn);
      actions.appendChild(row);
      $('.card-corner', card).append(dot, el('span', 'expand-tag', 'Expand ›'));
      card.setAttribute('role', 'button');
      card.addEventListener('click', () => this.openMonsterDetail(def.id));
    } else actions.append(unlockBtn);

    const arch = ARCHETYPES[def.archetype];
    this.refreshers.push(() => {
      const b = g.state.bestiary[def.id];
      card.classList.toggle('locked', !b.unlocked);
      setHtml($('.name', card), `${def.name}<span class="archetype">${arch.icon} ${arch.name}</span>${beastTags(def)}${b.unlocked ? '' : ' <small>locked</small>'}`);
      if (!b.unlocked) {
        const cost = enemyUnlockCost(def);
        setHtml(unlockBtn, `Unlock · drops ${enemyDrops(def).map((m) => `${gemHtml(m)} ${materialDef(m).name}`).join(' + ')}<small>🪙 ${fmt(cost)}</small>`);
        unlockBtn.disabled = g.state.gold < cost;
        return;
      }
      $('.hc-lv', row).textContent = `Lv ${g.monsterLevelInfo(def.id).level}`;
      const points = g.evoPoints(def.id);
      dot.textContent = String(points);
      dot.classList.toggle('hidden', points <= 0);
    });
  }

  /**
   * An Empower button and a progress bar toward the monster's next level. `compact` is the Bestiary tab's card,
   * whose button always empowers once (the ×1/×10/×100/MAX switch is for the full view).
   */
  private empowerParts(id: EnemyId, compact = false): { btn: HTMLButtonElement; bar: HTMLElement } {
    const g = this.game;
    const amount = (): BuyAmount => (compact ? 1 : g.state.buyAmount);
    const btn = el('button', 'buy') as HTMLButtonElement;
    const bar = el('div', 'train-bar');
    bar.innerHTML = '<i></i><span></span>';
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (g.empower(id, amount())) {
        sfx('empower');
        bumpCard(btn);
        this.refresh();
      }
    });
    this.refreshers.push(() => {
      const p = g.empowerPurchase(id, amount());
      const { level, into, need } = g.monsterLevelInfo(id);
      const maxed = level >= MAX_MONSTER_LEVEL;
      setHtml(
        btn,
        maxed
          ? 'Max level<small>fully evolved</small>'
          : g.empowerUnlocked
            ? `Empower${p.count > 1 ? ` ×${p.count}` : ''}<small>🪙 ${fmt(p.cost)}</small>`
            : `🔒 Empower<small>${fmt(g.slimeKills)}/${EMPOWER_UNLOCK_KILLS} slimes</small>`,
      );
      btn.disabled = maxed || !g.empowerUnlocked || g.state.gold < p.cost || !g.isUnlocked(id);
      $('i', bar).style.width = `${(into / need) * 100}%`;
      $('span', bar).textContent = compact ? '' : maxed ? 'Max' : `${into}/${need}`;
    });
    return { btn, bar };
  }

  /** Full-screen monster view: Empower, what it's worth now, and its evolution tree. */
  private openMonsterDetail(id: EnemyId): void {
    if (this.detail) this.dropDetail();
    const g = this.game;
    const def = enemyDef(id);
    const arch = ARCHETYPES[def.archetype];
    const view = el('div', 'hunter-detail floating-close');
    view.innerHTML = `
      <div class="hd-scroll">
        <div class="hd-hero hero-head">
          <canvas class="portrait big-portrait"></canvas>
          <div class="hd-title hero-plate">
            <h2>${def.name}</h2>
            <div class="hd-sub"></div>
            ${beastTags(def) ? `<div class="beast-tags">${beastTags(def)}</div>` : ''}
          </div>
        </div>
        <div class="hero-lore">
          <p class="lore-text">${def.blurb}</p>
          <div class="lore-drops"><div class="lore-label">Drops</div>${dropListHtml(def)}</div>
        </div>
        ${affinityHtml(def)}
      </div>
      <button class="hd-close hd-float-close" aria-label="Close">✕</button>`;
    document.body.appendChild(view);
    queuePortrait($<HTMLCanvasElement>('canvas', view), id, def.area);
    $('.hd-close', view).addEventListener('click', () => this.closeHunterDetail());
    this.detail = { el: view, refreshers: [] };
    const scroll = $('.hd-scroll', view);
    const main = this.refreshers;
    this.refreshers = [];

    // Sub-tabs, like the Hunter view: Stats (Empower and what it's worth) and Evolution (its tree).
    const tabs = el('div', 'subtabs');
    tabs.innerHTML = `<button data-sub="stats">📊 Stats</button><button data-sub="evolution">🧬 Evolution <b class="sp-count hidden"></b></button>`;
    scroll.appendChild(tabs);
    const body = el('div', 'hd-body');
    const evoPane = el('div', 'hd-body');
    scroll.append(body, evoPane);
    const show = (sub: 'stats' | 'evolution') => {
      this.monsterSub = sub;
      tabs.querySelectorAll<HTMLElement>('button').forEach((b) => b.classList.toggle('on', b.dataset.sub === sub));
      body.classList.toggle('hidden', sub !== 'stats');
      evoPane.classList.toggle('hidden', sub !== 'evolution');
    };
    tabs.querySelectorAll<HTMLButtonElement>('button').forEach((b) => b.addEventListener('click', () => show(b.dataset.sub as 'stats' | 'evolution')));
    show(this.monsterSub);

    body.appendChild(sectionTitle('Empower'));
    body.appendChild(
      el(
        'p',
        'hd-note',
        g.empowerUnlocked
          ? `Each session: +${Math.round(EMPOWER.hp * 1000) / 10}% HP, +${Math.round(EMPOWER.gold * 1000) / 10}% gold, +${Math.round(EMPOWER.drops * 1000) / 10}% material drops and +${Math.round(EMPOWER.spawn * 1000) / 10}% spawns. Every ${EMPOWER_SESSIONS_PER_LEVEL} sessions is a level, and every level earns an evolution point, up to Lv ${MAX_MONSTER_LEVEL} (fully evolved).`
          : `🔒 Slay ${EMPOWER_UNLOCK_KILLS} slimes to unlock Empower.`,
      ),
    );
    body.appendChild(this.amountsBar('', 'Empower'));
    const wrap = el('div', 'train');
    const { btn, bar } = this.empowerParts(id);
    wrap.append(btn, bar);
    body.appendChild(wrap);

    body.appendChild(sectionTitle('Stats'));
    const stats = el('div', 'hd-stats');
    // (kills of this monster are shown here too; evolutions open with them)
    body.appendChild(stats);

    evoPane.appendChild(this.treeView(this.monsterTree(id)));
    const evoCount = $('.sp-count', tabs);
    this.refreshers.push(() => {
      const points = g.isUnlocked(id) ? g.evoPoints(id) : 0;
      evoCount.textContent = String(points);
      evoCount.classList.toggle('hidden', points <= 0);
    });

    this.refreshers.push(() => {
      const st = g.enemyStats(id);
      const evo = g.evo(id);
      const [lo, hi] = g.packOf(id);
      $('.hd-sub', view).innerHTML = `<span>${arch.name} · Lv ${g.monsterLevelInfo(id).level}</span><span class="where">${areaDef(def.area).name}</span>`;
      const cells: Array<[string, string]> = [
        ['Slain', fmt(g.state.bestiary[id].kills)],
        ['HP', fmt(st.hp)],
        ['Gold', fmt(st.gold)],
        ['Drop chance', st.dropChance >= 1 ? `${(st.dropChance * 100).toFixed(0)}%<small>${Math.floor(st.dropChance)} guaranteed${st.dropChance % 1 ? ` + ${Math.round((st.dropChance % 1) * 100)}%` : ''}</small>` : `${(st.dropChance * 100).toFixed(1)}%`],
        ['Spawns', `${st.spawnRate.toFixed(2)}/s`],
        ['Pack size', lo === hi ? String(lo) : `${lo}–${hi}`],
        ['Speed', `${Math.round(st.speed)}${evo.speed ? ` (+${Math.round(evo.speed * 100)}%)` : ''}`],
      ];
      const legacies = g.legacyDrops(def.archetype);
      if (legacies.length) cells.push(['Legacy drops', legacies.map((d) => `${gemHtml(d.material)}<small>${materialDef(d.material).name}</small>`).join('')]);
      stats.innerHTML = cells.map(([k, v]) => `<div><b>${v}</b>${k}</div>`).join('');
    });

    this.detail.refreshers = this.refreshers;
    this.refreshers = main;
    this.refresh();
  }

  // ---- Inventory tab: sub-tabs for Equipment (crafted gear), Crafting (gear + Upgrades) and Materials ----

  private buildInventory(): void {
    const bar = el('div', 'subtabs inv-subtabs');
    bar.innerHTML = `<button data-sub="equipment"><img class="ei" src="${gearIconUrl('weapons/015')}" alt="">Equipment<span class="alert-mark corner hidden gear-dot"></span></button><button data-sub="crafting">🔨 Crafting<span class="alert-mark corner hidden craft-dot"></span></button><button data-sub="materials">💎 Materials</button>`;
    this.panel.appendChild(bar);
    // Only the open sub-tab is built (late games hold thousands of pieces and hundreds of recipes); switching
    // rebuilds the tab with the other one.
    const pane = el('div', 'inv-pane');
    this.panel.appendChild(pane);
    bar.querySelectorAll<HTMLElement>('button').forEach((b) => b.classList.toggle('on', b.dataset.sub === this.invSub));
    bar.querySelectorAll<HTMLButtonElement>('button').forEach((b) =>
      b.addEventListener('click', () => {
        if (b.dataset.sub === this.invSub) return;
        this.invSub = b.dataset.sub as InvSub;
        if (this.invSub !== 'crafting') this.closeFieldCard();
        this.setTab('inventory');
      }),
    );
    if (this.invSub === 'materials') this.buildMaterials(pane);
    else if (this.invSub === 'equipment') this.buildGearList(pane);
    else this.buildCrafting(pane);
  }

  /** Every material, with how many you hold (hidden until you've met a monster that drops it); tap one for details. */
  private buildMaterials(pane: HTMLElement): void {
    const g = this.game;
    const mats = el('div', 'mats');
    pane.appendChild(mats);
    pane.appendChild(el('p', 'hd-note', 'Monsters drop materials when slain. Spend them in Crafting. Tap a material for details.'));
    const tiles = MATERIALS.map((m) => {
      const tile = el('button', 'mat') as HTMLButtonElement;
      tile.addEventListener('click', () => this.openMaterialDetail(m.id));
      mats.appendChild(tile);
      return { m, tile };
    });
    let key = '';
    this.refreshers.push(() => {
      const k = tiles.map(({ m }) => `${this.materialKnown(m.id) ? 1 : 0}:${fmt(g.state.materials[m.id])}`).join('|');
      if (k === key) return;
      key = k;
      for (const { m, tile } of tiles) {
        const known = this.materialKnown(m.id);
        const source = ENEMIES.find((e) => enemyDrops(e).includes(m.id))!;
        const hint = g.isAreaUnlocked(source.area) ? (source.guardianOnly ? `the ${source.name}` : `${source.name}s`) : '???';
        tile.classList.toggle('unknown', !known);
        tile.disabled = !known;
        tile.innerHTML = `${gemHtml(m.id)}<span>${known ? m.name : hint}</span><b>${known ? fmt(g.state.materials[m.id]) : ''}</b>`;
      }
    });
  }

  /** You've met a material once you've unlocked a monster that drops it or held some. */
  private materialKnown(id: MaterialId): boolean {
    const g = this.game;
    return g.state.materials[id] > 0 || (g.state.stats.matGained[id] ?? 0) > 0 || ENEMIES.some((e) => enemyDrops(e).includes(id) && g.isUnlocked(e.id));
  }

  /** A material's details: icon, name, flavour, how many you hold and have ever gained, and who drops it. */
  private openMaterialDetail(id: MaterialId): void {
    const g = this.game;
    const m = materialDef(id);
    this.showSheet(`<span class="mat-title">${gemHtml(id, 'big')}${m.name}</span>`, (body, close) => {
      body.innerHTML = `<p class="gear-now">${m.desc}</p>
        <div class="hd-stats mat-stats"><div><b>${fmt(g.state.materials[id])}</b>You have</div><div><b>${fmt(g.state.stats.matGained[id] ?? 0)}</b>Gained in total</div></div>
        <p class="droppers-title">Dropped by</p>
        <div class="droppers"></div>`;
      const list = $('.droppers', body);
      for (const e of ENEMIES.filter((x) => enemyDrops(x).includes(id))) {
        const seen = g.isAreaUnlocked(e.area);
        const b = el('button', `dropper${seen ? '' : ' unknown'}`) as HTMLButtonElement;
        b.innerHTML = `<canvas class="portrait"></canvas><span><b>${seen ? e.name : '???'}</b><small>${seen ? `${areaDef(e.area).name}${g.isUnlocked(e.id) ? '' : ' · locked'}` : 'Somewhere further on'}</small></span>`;
        b.disabled = !seen;
        if (seen) {
          queuePortrait($<HTMLCanvasElement>('canvas', b), e.id);
          b.addEventListener('click', () => {
            close();
            this.openMonsterDetail(e.id);
          });
        }
        list.appendChild(b);
      }
    });
  }

  /** Every crafted piece and Upgrade, narrowed by the Filter sheet; tap one for details. */
  private buildGearList(pane: HTMLElement): void {
    const g = this.game;
    this.gearListOpen = true;
    const invTitle = sectionTitle('Equipment');
    pane.appendChild(invTitle);
    const bar = el('div', 'filter-bar');
    const modifyOpen = g.refineOpen || g.enchantOpen;
    bar.innerHTML = `<button class="filter-btn">⚙️ Filter</button>${modifyOpen ? '<button class="filter-btn mod-btn">🛠️ Modify</button>' : ''}<div class="filter-chips"></div>${g.autoSalvageOpen ? '<button class="filter-btn as-btn">♻️ Auto Salvage</button>' : ''}`;
    $('.filter-btn', bar).addEventListener('click', () => this.openInvFilter());
    // Modify (once Kargesh or Marceline joins): between Filter and Auto Salvage.
    const modBtn = bar.querySelector<HTMLButtonElement>('.mod-btn');
    modBtn?.addEventListener('click', () => {
      this.modifyMode = !this.modifyMode;
      this.refresh();
    });
    if (!modifyOpen) this.modifyMode = false;
    const asBtn = bar.querySelector<HTMLButtonElement>('.as-btn');
    if (asBtn) {
      asBtn.addEventListener('click', () => this.openAutoSalvage());
      // Lit while any rarity is set to salvage.
      this.refreshers.push(() => asBtn.classList.toggle('on', g.state.settings.autoSalvage.length > 0));
    }
    pane.appendChild(bar);
    const inv = el('div', 'inventory');
    pane.appendChild(inv);
    let invKey: string | null = null;
    let invPager: IntersectionObserver | null = null;
    this.refreshers.push(() => {
      const f = this.invFilter;
      const lv = LEVEL_FILTERS.find((l) => l.id === f.level)!;
      const refining = this.modifyMode && modifyOpen;
      modBtn?.classList.toggle('on', refining);
      const rank = (it: GearItem) => RARITY_ORDER.indexOf(gearDef(it.base).rarity);
      const gear = g.state.inventory
        .filter((it) => {
          if (refining && !g.modifiable(it.uid)) return false;
          return gearMatches(gearDef(it.base), f) && it.stars >= lv.min && it.stars <= lv.max;
        })
        // Rarest first; within a rarity, newest first.
        .sort((a, b) => rank(b) - rank(a) || b.uid - a.uid);
      // Upgrades have no rarity, damage type or gear bonus, so those filters hide them.
      const upgrades =
        !refining && (f.type === 'all' || f.type === 'upgrades') && f.rarity === 'any' && f.dtype === 'any' && f.bonus === 'any'
          ? ITEMS.filter((it) => g.state.items[it.id] > 0 && g.state.items[it.id] >= lv.min && g.state.items[it.id] <= lv.max)
          : [];
      const k = [
        JSON.stringify(f),
        refining,
        gear.map((it) => `${it.uid}:${it.stars}:${g.wearerOf(it.uid)?.who ?? ''}:${g.modSlots(it.uid).filter(Boolean).length}`).join('|'),
        upgrades.map((it) => `${it.id}:${g.state.items[it.id]}`).join('|'),
      ].join('/');
      if (k === invKey) return;
      invKey = k;
      const total = g.state.inventory.length + ITEMS.filter((it) => g.state.items[it.id] > 0).length;
      const shown = gear.length + upgrades.length;
      const on = filtering(f);
      invTitle.innerHTML = refining
        ? `<span>🛠️ Modify</span><span>${shown} piece${shown === 1 ? '' : 's'} with modifier slots</span>`
        : `<span>Equipment</span><span>${on ? `${shown} of ${total}` : total} item${total === 1 ? '' : 's'}</span>`;
      $('.filter-btn', bar).classList.toggle('on', on);
      filterChips($('.filter-chips', bar), f, () => {
        this.invFilter = { ...NO_FILTER };
        this.refresh();
      });
      inv.innerHTML = '';
      if (!total) inv.innerHTML = '<p class="empty-inv">Empty. Craft equipment in Crafting, then equip it from a Hunter\'s card.</p>';
      else if (!shown)
        inv.innerHTML = refining
          ? '<p class="empty-inv">Nothing to modify yet: Very Rare and rarer gear has modifier slots.</p>'
          : '<p class="empty-inv">Nothing matches these filters.</p>';
      const makers: Array<() => HTMLElement> = [
        ...gear.map((it) => () => {
          const gd = gearDef(it.base);
          const worn = g.wearerOf(it.uid);
          const tile = el('button', 'inv-tile rar') as HTMLButtonElement;
          tile.style.setProperty('--rc', gearColor(gd.id));
          const slots = g.modSlots(it.uid);
          tile.innerHTML = `<i>${gearIcon(gd)}</i><span>${gd.name}</span><small class="stars">${starsHtml(it.stars)}</small>${worn ? `<em>${wearerIcon(worn.who)}</em>` : ''}${slots.length ? `<b class="mod-pips">${slots.map((m) => (m ? (modPerfect(m) ? '★' : '◆') : '◇')).join('')}</b>` : ''}${it.uid > g.state.seen.gearUid ? '<span class="alert-mark white tile-new"></span>' : ''}`;
          tile.addEventListener('click', () => (refining ? this.openModify(it.uid) : this.openGearDetail(it.uid)));
          return tile;
        }),
        ...upgrades.map((it) => () => {
          const tile = el('button', 'inv-tile upgrade rar') as HTMLButtonElement;
          tile.style.setProperty('--rc', RARITIES[it.rarity].color);
          tile.innerHTML = `<i>${upgradeIcon(it)}</i><span>${it.name}</span><small class="stars">${it.once ? 'Crafted' : starsHtml(g.state.items[it.id])}</small><em>⛺</em>`;
          tile.addEventListener('click', () => this.openUpgradeDetail(it));
          return tile;
        }),
      ];
      // Late games hold thousands of pieces: draw a page of tiles now and the next page as you scroll near the
      // end, so opening the tab never builds them all at once.
      invPager?.disconnect();
      let next = 0;
      const sentinel = el('div', 'inv-more');
      const page = () => {
        const frag = document.createDocumentFragment();
        for (const end = Math.min(makers.length, next + INV_PAGE); next < end; next++) frag.appendChild(makers[next]());
        inv.insertBefore(frag, sentinel);
        if (next >= makers.length) {
          invPager?.disconnect();
          sentinel.remove();
        }
      };
      inv.appendChild(sentinel);
      page();
      if (next < makers.length) {
        const pager = new IntersectionObserver(
          (es) => {
            if (!es.some((e) => e.isIntersecting)) return;
            page();
            // Still in range after a page (a short page, or scrolled right to the end)? Observing it afresh
            // reports it again, so the next page follows.
            if (next < makers.length) {
              pager.unobserve(sentinel);
              pager.observe(sentinel);
            }
          },
          { root: this.panel, rootMargin: '600px 0px' },
        );
        invPager = pager;
        pager.observe(sentinel);
      }
    });
  }

  /**
   * The Equipment (or Crafting) filters: a Type cycler, Rarity, Damage type, Bonuses (a stat the piece raises) and,
   * for crafted gear, Level. Changes apply as you tap.
   */
  private openInvFilter(which: 'equipment' | 'crafting' = 'equipment'): void {
    const get = () => (which === 'crafting' ? this.craftFilter : this.invFilter);
    const put = (f: InvFilter) => {
      if (which === 'crafting') this.craftFilter = f;
      else this.invFilter = f;
    };
    this.showSheet('⚙️ Filter', (body, close) => {
      const draw = () => {
        const f = get();
        const t = INV_TYPES.find((x) => x.id === f.type)!;
        body.innerHTML = `
          <div class="filter-label">Type</div>
          <div class="type-cycler"><button data-step="-1" aria-label="Previous type">‹</button><button class="cyc-cur" data-step="1">${t.icon} ${t.name}</button><button data-step="1" aria-label="Next type">›</button></div>
          <div class="filter-label">Rarity</div>
          <div class="filter-options rarity-options">
            <button data-rarity="any" class="${f.rarity === 'any' ? 'on' : ''}">Any</button>
            ${(Object.keys(RARITIES) as Rarity[])
              .map((r) => `<button data-rarity="${r}" class="${f.rarity === r ? 'on' : ''}" style="--rc:${RARITIES[r].color}">${RARITIES[r].name}</button>`)
              .join('')}
          </div>
          <div class="filter-label">Damage type</div>
          <div class="filter-options">
            <button data-dtype="any" class="${f.dtype === 'any' ? 'on' : ''}">Any</button>
            ${(Object.keys(DAMAGE_TYPES) as DamageType[])
              .map((t) => `<button data-dtype="${t}" class="${f.dtype === t ? 'on' : ''}">${DAMAGE_TYPES[t].icon} ${DAMAGE_TYPES[t].name}</button>`)
              .join('')}
            <button data-dtype="special" class="${f.dtype === 'special' ? 'on' : ''}">${SPECIAL_TYPE.icon} ${SPECIAL_TYPE.name}</button>
          </div>
          <div class="filter-label">Bonuses</div>
          <div class="filter-options">
            <button data-bonus="any" class="${f.bonus === 'any' ? 'on' : ''}">Any</button>
            ${BONUS_FILTERS.map((b) => `<button data-bonus="${b.id}" class="${f.bonus === b.id ? 'on' : ''}">${b.icon} ${b.name}</button>`).join('')}
          </div>
          ${
            which === 'equipment'
              ? `<div class="filter-label">Level</div>
          <div class="filter-options">
            ${LEVEL_FILTERS.map((l) => `<button data-level="${l.id}" class="${f.level === l.id ? 'on' : ''}">${l.name}</button>`).join('')}
          </div>`
              : ''
          }
          <button class="secondary filter-reset">Clear filters</button>`;
        const set = (next: Partial<InvFilter>) => {
          put({ ...get(), ...next });
          this.refresh();
          draw();
        };
        body.querySelectorAll<HTMLButtonElement>('.type-cycler button').forEach((b) =>
          b.addEventListener('click', () => {
            const i = INV_TYPES.findIndex((x) => x.id === get().type);
            set({ type: INV_TYPES[(i + Number(b.dataset.step) + INV_TYPES.length) % INV_TYPES.length].id });
          }),
        );
        body.querySelectorAll<HTMLButtonElement>('[data-rarity]').forEach((b) => b.addEventListener('click', () => set({ rarity: b.dataset.rarity as Rarity | 'any' })));
        body.querySelectorAll<HTMLButtonElement>('[data-dtype]').forEach((b) => b.addEventListener('click', () => set({ dtype: b.dataset.dtype as DamageType | 'any' })));
        body.querySelectorAll<HTMLButtonElement>('[data-level]').forEach((b) => b.addEventListener('click', () => set({ level: b.dataset.level as LevelFilter })));
        body.querySelectorAll<HTMLButtonElement>('[data-bonus]').forEach((b) => b.addEventListener('click', () => set({ bonus: b.dataset.bonus as GearStat | 'any' })));
        $('.filter-reset', body).addEventListener('click', () => {
          set({ ...NO_FILTER });
          close();
        });
      };
      draw();
    });
  }

  /** An Upgrade's current and next effect, with a button to upgrade it. */
  private openUpgradeDetail(it: ItemDef): void {
    const g = this.game;
    this.showSheet(`${upgradeIcon(it)} ${it.name}`, (body, close) => {
      const lv = g.state.items[it.id];
      const maxed = lv >= itemMaxStars(it);
      const owned = it.once ? (lv ? 'Crafted' : 'Not crafted yet') : `<span class="stars">${starsHtml(lv)}</span>`;
      body.innerHTML = `<p class="gear-now"><b class="rarity-tag" style="--rc:${RARITIES[it.rarity].color}">${RARITIES[it.rarity].name}</b> upgrade · ${upgradeReach(it)} · ${owned}</p><p><b>${it.describe(itemLevel(it, it.once ? 1 : lv))}</b>${maxed || it.once ? '' : ` → ${it.describe(itemLevel(it, lv + 1))}`}</p>${
        maxed ? '' : `<div class="fc-label">${lv ? 'Upgrade cost' : 'Recipe'}</div><div class="fc-cost">${recipeHtml(g, itemCost(it, lv))}</div>`
      }`;
      const btn = el('button', 'buy', maxed ? (it.once ? 'Crafted' : 'MAX') : it.once || !lv ? 'Craft' : 'Upgrade') as HTMLButtonElement;
      btn.style.width = '100%';
      btn.disabled = !g.canCraft(it.id);
      btn.addEventListener('click', () => {
        if (!g.craft(it.id)) return;
        sfx('craft');
        close();
        this.openUpgradeDetail(it);
      });
      body.appendChild(btn);
    });
  }

  /**
   * Crafting: every known recipe (the newest area's first, narrowed by its own Filter), then the Upgrades split into Available (still to craft or upgrade) and Completed (5★), as
   * 5-wide grids of icons (greyed out when you can't afford them); tap one for its card over the Battle Field.
   */
  private buildCrafting(pane: HTMLElement): void {
    const g = this.game;
    let tiles: Array<{ tile: HTMLElement; ready: () => boolean; badge: () => string }> = [];
    const craftTitle = sectionTitle('Craft Equipment');
    pane.appendChild(craftTitle);
    const bar = el('div', 'filter-bar');
    bar.innerHTML = '<button class="filter-btn">⚙️ Filter</button><div class="filter-chips"></div>';
    $('.filter-btn', bar).addEventListener('click', () => this.openInvFilter('crafting'));
    pane.appendChild(bar);
    const gearGrid = el('div', 'craft-grid');
    pane.appendChild(gearGrid);
    const note = el('p', 'hd-note');
    pane.appendChild(note);
    // The newest recipes first: gear from the latest area at the top, then back through older areas.
    let gearKey = '';
    const buildGear = () => {
      const f = this.craftFilter;
      const known = GEAR.filter((x) => !x.starter && this.gearKnown(x));
      const list = known.filter((gd) => gearMatches(gd, f) && f.type !== 'upgrades').sort((a, b) => gearArea(b) - gearArea(a));
      const key = JSON.stringify(f) + list.map((gd) => gd.id).join(',');
      if (key === gearKey) return;
      gearKey = key;
      const on = filtering(f);
      craftTitle.innerHTML = `<span>Craft Equipment</span><span>${on ? `${list.length} of ${known.length}` : known.length} recipe${known.length === 1 ? '' : 's'}</span>`;
      $('.filter-btn', bar).classList.toggle('on', on);
      filterChips($('.filter-chips', bar), f, () => {
        this.craftFilter = { ...NO_FILTER };
        this.refresh();
      });
      gearGrid.innerHTML = '';
      tiles = [];
      for (const gd of list) {
        const tile = el('button', 'craft-tile rar') as HTMLButtonElement;
        tile.style.setProperty('--rc', gearColor(gd.id));
        tile.innerHTML = `<i>${gearIcon(gd)}</i><em></em><span class="alert-mark white tile-new hidden"></span>`;
        tile.title = gd.name;
        tile.addEventListener('click', () => {
          this.markSeen('recipes', gd.id);
          this.openCraftCard({ gear: gd });
          this.refresh();
        });
        const mark = $('.tile-new', tile);
        this.refreshers.push(() => mark.classList.toggle('hidden', !this.newRecipe(gd)));
        gearGrid.appendChild(tile);
        tiles.push({ tile, ready: () => g.canCraftGear(gd.id), badge: () => String(g.state.inventory.filter((it) => it.base === gd.id).length || '') });
      }
      if (!list.length && known.length) gearGrid.innerHTML = '<p class="empty-inv">No recipes match these filters.</p>';
      const lockedGear = GEAR.filter((gd) => !gd.starter && !this.gearKnown(gd)).length;
      note.textContent = lockedGear ? `🔒 ${lockedGear} more recipes show up once you've found their materials.` : '';
      note.classList.toggle('hidden', !lockedGear);
    };

    // Upgrades move from Available to Completed at 5★, so this section is rebuilt when that changes.
    const upgrades = el('div');
    pane.appendChild(upgrades);
    let upTiles: typeof tiles = [];
    let crafted = '';
    const buildUpgrades = () => {
      upgrades.innerHTML = '';
      upTiles = [];
      // Upgrades have no rarity, damage type or gear bonus: those filters (or a gear type) hide them.
      const f = this.craftFilter;
      if (!((f.type === 'all' || f.type === 'upgrades') && f.rarity === 'any' && f.dtype === 'any' && f.bonus === 'any')) return;
      for (const [title, list] of [
        ['Available Upgrades', ITEMS.filter((it) => g.state.items[it.id] < itemMaxStars(it))],
        ['Completed Upgrades', ITEMS.filter((it) => g.state.items[it.id] >= itemMaxStars(it))],
      ] as const) {
        if (!list.length) continue;
        upgrades.appendChild(sectionTitle(title));
        const grid = el('div', 'craft-grid');
        upgrades.appendChild(grid);
        for (const it of list) {
          const tile = el('button', 'craft-tile rar') as HTMLButtonElement;
          tile.style.setProperty('--rc', RARITIES[it.rarity].color);
          tile.innerHTML = `<i>${upgradeIcon(it)}</i><em></em>`;
          tile.title = it.name;
          tile.addEventListener('click', () => this.openCraftCard({ item: it }));
          grid.appendChild(tile);
          upTiles.push({
            tile,
            ready: () => g.canCraft(it.id) || g.state.items[it.id] >= itemMaxStars(it),
            badge: () => (g.state.items[it.id] ? (it.once ? '✓' : `${g.state.items[it.id]}★`) : ''),
          });
        }
      }
    };
    this.refreshers.push(() => {
      buildGear();
      const k = JSON.stringify(this.craftFilter) + ITEMS.map((it) => (g.state.items[it.id] >= itemMaxStars(it) ? 1 : 0)).join('');
      if (k !== crafted) {
        crafted = k;
        buildUpgrades();
      }
      for (const t of [...tiles, ...upTiles]) {
        t.tile.classList.toggle('short', !t.ready());
        $('em', t.tile).textContent = t.badge();
      }
    });
  }

  /**
   * A recipe's card over the Battle Field: the item's details, its recipe with what you hold, how many you
   * own, and a Craft (or Upgrade) button. It stays open so you can craft again.
   */
  private openCraftCard(what: { gear: GearDef } | { item: ItemDef }): void {
    const g = this.game;
    this.closeFieldCard();
    const card = el('div', 'field-card');
    const gd = 'gear' in what ? what.gear : null;
    const it = 'item' in what ? what.item : null;
    const name = gd ? gd.name : it!.name;
    card.innerHTML = `
      <button class="fc-close" aria-label="Close"><span class="close-x"></span></button>
      <div class="fc-scroll"><div class="fc-head"><i class="fc-icon" style="--rc:${gd ? gearColor(gd.id) : RARITIES[it!.rarity].color}">${gd ? gearIcon(gd) : upgradeIcon(it!)}</i><div>
        <h3>${name}</h3>
        <small>${gd ? `<b class="fc-rarity" style="--rc:${gearColor(gd.id)}">${RARITIES[gd.rarity].name}</b> ${gearKindName(gd).toLowerCase()}` : `<b class="fc-rarity" style="--rc:${RARITIES[it!.rarity].color}">${RARITIES[it!.rarity].name}</b> upgrade · ${upgradeReach(it!)}`}</small>
      </div></div>
      ${gd ? featureTags(gd) : ''}
      <p class="fc-effect"></p>
      <div class="fc-owned"></div>
      <div class="fc-label">Recipe</div>
      <div class="fc-cost"></div></div>
      <button class="buy fc-craft"></button>`;
    $('.fc-close', card).addEventListener('click', () => this.closeFieldCard());
    // The details scroll between the pinned close button and Craft button; the last line fades while there's more.
    const scroller = $('.fc-scroll', card);
    const fade = () => scroller.classList.toggle('more', scroller.scrollTop + scroller.clientHeight < scroller.scrollHeight - 2);
    scroller.addEventListener('scroll', fade, { passive: true });
    requestAnimationFrame(fade);
    // Tapping anywhere off the card closes it (a recipe tile opens its own card instead).
    const offTap = (e: Event) => {
      if (!card.isConnected) return document.removeEventListener('click', offTap, true);
      const t = e.target as HTMLElement;
      if (card.contains(t) || t.closest('.craft-tile, .equip-prompt')) return;
      this.closeFieldCard();
      document.removeEventListener('click', offTap, true);
    };
    setTimeout(() => document.addEventListener('click', offTap, true));
    const btn = $<HTMLButtonElement>('.fc-craft', card);
    btn.addEventListener('click', () => {
      const ok = gd ? g.craftGear(gd.id) : g.craft(it!.id);
      if (!ok) return;
      sfx('craft');
      if (typeof ok === 'object') this.showEquipPrompt(ok.uid);
      this.toast(gd ? `Crafted ${gd.name}!` : g.state.items[it!.id] > 1 ? `Upgraded ${it!.name} to ${g.state.items[it!.id]}★!` : `Crafted ${it!.name}!`);
      bumpCard(btn);
      this.refresh();
    });
    const update = () => {
      if (gd) {
        const owned = g.state.inventory.filter((x) => x.base === gd.id).length;
        $('.fc-effect', card).innerHTML = `${statTable(gd, [
          { label: '1★', stars: 1 },
          { label: `${MAX_STARS}★`, stars: MAX_STARS },
        ])}`;
        $('.fc-owned', card).innerHTML = `In your equipment: <b>${owned}</b>`;
        $('.fc-cost', card).innerHTML = recipeHtml(g, gearCost(gd, 0));
        btn.textContent = 'Craft';
        btn.disabled = !g.canCraftGear(gd.id);
      } else {
        const item = it!;
        const lv = g.state.items[item.id];
        const maxed = lv >= itemMaxStars(item);
        const at = (stars: number) => item.describe(itemLevel(item, stars));
        const top = itemMaxStars(item);
        $('.fc-effect', card).innerHTML = item.once
          ? `<b>${at(1)}</b>`
          : lineTable(
              lv
                ? [[`Now ${lv}★`, at(lv)], ...(maxed ? [] : ([[`Next ${lv + 1}★`, at(lv + 1)]] as Array<[string, string]>)), ...(lv + 1 < top ? ([[`Max ${top}★`, at(top)]] as Array<[string, string]>) : [])]
                : [
                    ['1★', at(1)],
                    [`${top}★`, at(top)],
                  ],
            );
        $('.fc-owned', card).innerHTML = item.once ? (lv ? 'Owned: <b>crafted</b>' : 'Owned: <b>not crafted yet</b>') : lv ? `Owned: <b class="stars">${starsHtml(lv)}</b>${maxed ? ' · MAX' : ''}` : 'Owned: <b>not crafted yet</b>';
        $('.fc-cost', card).innerHTML = maxed ? (item.once ? '<p>Crafted.</p>' : '<p>Fully upgraded.</p>') : recipeHtml(g, itemCost(item, lv));
        btn.textContent = maxed ? (item.once ? 'Crafted' : 'MAX') : lv ? 'Upgrade' : 'Craft';
        btn.disabled = !g.canCraft(item.id);
      }
    };
    // Over the battlefield; with the menu raised to full screen, it floats under the top bar instead.
    if (this.menuFull) {
      card.classList.add('floating');
      document.body.appendChild(card);
    } else $('.battle-wrap').appendChild(card);
    this.fieldCard = { el: card, update };
    update();
  }

  /** Closes the card over the Battle Field, if one is open. */
  private closeFieldCard(): void {
    this.fieldCard?.el.remove();
    this.fieldCard = null;
  }

  /** A short message that pops up over the Battle Field and fades away. */
  /**
   * Auto Salvage (Inventory → Equipment, from the Restless Graveyard), a menu like the Filter: pick rarities, and
   * looted gear of those rarities is salvaged the moment it drops. "Salvage now" clears out the unequipped
   * pieces of those rarities you already have.
   */
  private openAutoSalvage(): void {
    this.showSheet('♻️ Auto Salvage', (body) => body.appendChild(this.autoSalvageCard()));
  }

  private autoSalvageCard(): HTMLElement {
    const g = this.game;
    const st = g.state.settings;
    const card = el('div', 'auto-salvage');
    const rarities = Object.keys(RARITIES) as Rarity[];
    card.innerHTML = `<p class="as-head">Tap the rarities to salvage: looted gear of those rarities turns straight into half its materials as it drops. Equipped gear is never touched.</p><div class="as-chips">${rarities
      .map((r) => `<button class="chip as-chip" data-r="${r}" style="--rc:${RARITIES[r].color}">${RARITIES[r].name}</button>`)
      .join('')}</div><button class="buy as-now"></button>`;
    const now = $<HTMLButtonElement>('.as-now', card);
    const spare = () => g.state.inventory.filter((it) => st.autoSalvage.includes(gearDef(it.base).rarity) && !gearDef(it.base).starter && !g.wearerOf(it.uid)).length;
    const draw = () => {
      card.querySelectorAll<HTMLButtonElement>('.as-chip').forEach((b) => b.classList.toggle('on', st.autoSalvage.includes(b.dataset.r as Rarity)));
      const n = spare();
      now.innerHTML = `<span class="as-confirm">Confirm</span><small>${n ? `Salvages ${n} unequipped piece${n === 1 ? '' : 's'} of these rarities` : 'Nothing unequipped of these rarities'}</small>`;
      now.disabled = !n;
    };
    card.querySelectorAll<HTMLButtonElement>('.as-chip').forEach((b) =>
      b.addEventListener('click', () => {
        const r = b.dataset.r as Rarity;
        st.autoSalvage = st.autoSalvage.includes(r) ? st.autoSalvage.filter((x) => x !== r) : rarities.filter((x) => x === r || st.autoSalvage.includes(x));
        this.hooks.save();
        draw();
      }),
    );
    now.addEventListener('click', () => {
      const n = spare();
      this.showModal(`<h2>♻️ Salvage ${n} piece${n === 1 ? '' : 's'}?</h2><p>Every unequipped ${st.autoSalvage.map((r) => RARITIES[r].name).join(', ')} piece goes, for half its materials. Equipped gear is kept.</p>`, [
        { label: 'Cancel', secondary: true },
        {
          label: 'Salvage',
          action: () => {
            const done = g.salvageRarities(st.autoSalvage);
            this.toast(`♻️ Salvaged ${done} piece${done === 1 ? '' : 's'}`);
            this.hooks.save();
            this.setTab('inventory', true);
          },
        },
      ]);
    });
    draw();
    return card;
  }

  private toast(text: string): void {
    const t = el('div', 'toast', text);
    // Over the battlefield, or floating near the top while it's hidden (full-screen menu, open views).
    if (this.menuFull || this.picker || this.detail) {
      t.classList.add('floating');
      document.body.appendChild(t);
    } else $('.battle-wrap').appendChild(t);
    t.addEventListener('animationend', () => t.remove());
  }

  /** Recipes are shown once every material in them comes from a monster you've unlocked (or you hold some). */
  /** A recipe shows once you've found at least one of every material it needs. */
  private gearKnown(gd: GearDef): boolean {
    const g = this.game;
    return (Object.keys(gd.recipe) as MaterialId[]).every((m) => g.state.materials[m] > 0 || (g.state.stats.matGained[m] ?? 0) > 0);
  }

  // ---- Events tab: the energy bar, then each area's events as tiles; the selected one's card pinned below ----

  private buildEvents(): void {
    const g = this.game;
    // Looking at the Events tab: what's ready now has been seen (until it next runs).
    this.refreshers.push(() => {
      for (const e of EVENTS) if (this.newEvent(e.id)) this.markSeen('events', e.id);
    });
    this.panel.appendChild(this.energyBar());
    const order = [g.area, ...g.unlockedAreas.filter((a) => a !== g.area)];
    const shown = order.flatMap((a) => EVENTS.filter((e) => e.area === a));
    // This area's first event that's ready (or its first) until you pick one.
    if (!shown.some((e) => e.id === this.selectedEvent)) this.selectedEvent = (shown.find((e) => e.area === g.area && g.eventReady(e.id)) ?? shown[0])?.id ?? null;
    for (const areaId of order) {
      const here = EVENTS.filter((e) => e.area === areaId);
      if (!here.length) continue;
      this.panel.appendChild(sectionTitle(`${areaDef(areaId).name}${areaId === g.area ? ' · here' : ''}`));
      const grid = el('div', 'hunter-grid event-grid');
      for (const ev of here) grid.appendChild(this.eventTile(ev));
      this.panel.appendChild(grid);
    }
    if (!shown.length) this.panel.appendChild(el('p', 'hd-note', 'No events here yet.'));
    if (this.selectedEvent) {
      const dock = el('div', 'hunter-dock');
      dock.appendChild(this.eventCard(eventDef(this.selectedEvent)));
      this.panel.appendChild(dock);
    }
  }

  /** The energy bar: five gold segments, the last one filling as it recharges. */
  private energyBar(): HTMLElement {
    const g = this.game;
    const bar = el('div', 'energy-bar');
    bar.innerHTML = `<div class="en-head"><b>⚡ Energy</b><span class="en-text"></span></div><div class="en-segs">${'<span class="en-seg"><i></i></span>'.repeat(ENERGY_MAX)}</div>`;
    const fills = [...bar.querySelectorAll<HTMLElement>('.en-seg i')];
    const text = $('.en-text', bar);
    this.refreshers.push(() => {
      const e = g.energy;
      fills.forEach((f, i) => (f.style.width = `${Math.max(0, Math.min(1, e - i)) * 100}%`));
      const whole = Math.floor(e + 1e-9);
      text.textContent = whole >= ENERGY_MAX ? `${ENERGY_MAX} / ${ENERGY_MAX} · full` : `${whole} / ${ENERGY_MAX} · +1 in ${fmtTime(g.energyNextIn)}`;
    });
    return bar;
  }

  /** The icon for an event: the crown for a Guardian, the swarming monster for a swarm, a minigame's own. */
  private eventIcon(ev: EventDef, cls: string): { html: string; draw: (root: HTMLElement) => void } {
    const swarmer = ev.kind === 'swarm' ? (ENEMIES.find((e) => e.area === ev.area && e.archetype === ev.archetype && e.unlock === 0) ?? ENEMIES.find((e) => e.area === ev.area && e.archetype === ev.archetype)) : undefined;
    if (swarmer) return { html: `<canvas class="${cls}"></canvas>`, draw: (root) => queuePortrait($<HTMLCanvasElement>(`canvas.${cls}`, root), swarmer.id) };
    return { html: `<i class="${cls}">${ev.kind === 'guardian' ? '👑' : ev.icon}</i>`, draw: () => {} };
  }

  /** Energy cost as gold pips. */
  private energyPips(ev: EventDef): string {
    return `<span class="ev-pips" title="Energy cost">${'<b></b>'.repeat(this.game.energyCost(ev.id))}</span>`;
  }

  private eventTile(ev: EventDef): HTMLElement {
    const g = this.game;
    const tile = el('button', 'hunter-tile event-tile') as HTMLButtonElement;
    const icon = this.eventIcon(ev, 'et-icon');
    // Minigames go by the game's own name on a tile ("Hunting Practice", not "Galladair's Hunting Practice").
    const short = ev.kind === 'guardian' ? 'Guardian' : ev.kind === 'minigame' ? ev.name.replace(/^.*?'s /, '') : ev.name;
    tile.innerHTML = `${icon.html}<span class="ht-name">${short}</span>${this.energyPips(ev)}<small class="ht-lv"></small>`;
    icon.draw(tile);
    tile.classList.toggle('selected', ev.id === this.selectedEvent);
    tile.addEventListener('click', () => {
      if (this.selectedEvent === ev.id) return;
      this.selectedEvent = ev.id;
      this.setTab('events', true);
    });
    const lv = $('.ht-lv', tile);
    this.refreshers.push(() => {
      const unlocked = g.eventUnlocked(ev.id);
      const running = this.eventLive(ev);
      tile.classList.toggle('locked', !unlocked);
      tile.classList.toggle('ready', g.eventReady(ev.id) && !running);
      tile.classList.toggle('live', running);
      lv.textContent = !unlocked ? '🔒 Locked' : running ? '● Live' : g.energyWait(ev.id) > 0 ? fmtTime(g.energyWait(ev.id)) : ev.kind !== 'minigame' && g.eventRunning ? 'Busy' : 'Ready';
    });
    return tile;
  }

  /** The event is on the battlefield right now. */
  private eventLive(ev: EventDef): boolean {
    const g = this.game;
    return (ev.kind === 'guardian' && g.guardianActive && g.area === ev.area) || g.activeEvent?.id === ev.id;
  }

  /** The selected event's card: what it is, what it pays, its energy cost, and Start / Play. */
  private eventCard(ev: EventDef): HTMLElement {
    const g = this.game;
    const card = el('div', 'beast event-card');
    const icon = this.eventIcon(ev, 'ec-icon');
    const cost = g.energyCost(ev.id);
    card.innerHTML = `<div class="beast-head">${icon.html}<div class="info"><div class="name">${ev.name}</div><div class="blurb">${ev.blurb}</div></div></div><div class="ev-status"></div><div class="ev-foot"><span class="ev-cost">Cost ${this.energyPips(ev)} <b>${cost}</b> energy</span><button class="buy"></button></div>`;
    icon.draw(card);
    const btn = $<HTMLButtonElement>('.buy', card);
    const status = $('.ev-status', card);
    btn.addEventListener('click', () => {
      if (ev.kind === 'minigame') this.playMinigame(ev);
      else if (g.startEvent(ev.id)) this.refresh();
    });
    this.refreshers.push(() => {
      const kills = g.eventProgress(ev.id);
      const unlocked = g.eventUnlocked(ev.id);
      const running = this.eventLive(ev);
      const wait = g.energyWait(ev.id);
      card.classList.toggle('locked', !unlocked);
      card.classList.toggle('running', running);
      card.classList.toggle('ready', g.eventReady(ev.id));
      const next = nextAreaOf(ev.area);
      const rewards: string[] = [];
      if (ev.kind === 'guardian') rewards.push(next && !g.isAreaUnlocked(next.id) ? `unlocks ${next.name}` : 'a Guardian bounty of gold and materials');
      for (const h of g.huntersUnlockedBy(ev.id)) rewards.push(`${wearerIcon(h)} ${hunterDef(h).name} the ${hunterDef(h).title} joins`);
      if (ev.kind === 'minigame') rewards.push(`for ${ev.rewards!.par} points: ${rewardText(g.minigameReward(ev.id, ev.rewards!.par))}${g.state.events[ev.id]?.best ? ` · best ${g.state.events[ev.id].best}` : ''}`);
      const extra = rewards.length ? `<small>Reward: ${rewards.join(' · ')}</small>` : '';
      if (!unlocked && ev.kind === 'minigame') {
        const h = hunterDef(ev.hunter!);
        status.innerHTML = `<small>🔒 Recruit ${wearerIcon(h.id)} ${h.name} the ${h.title} to play</small>`;
        btn.innerHTML = '🔒';
        btn.disabled = true;
      } else if (!unlocked && g.eventWaitingOn(ev.id) && kills >= ev.unlockKills) {
        const w = g.eventWaitingOn(ev.id)!;
        status.innerHTML = `<small>🔒 Survive the ${w.icon} ${w.name} first</small>`;
        btn.innerHTML = '🔒';
        btn.disabled = true;
      } else if (!unlocked) {
        status.innerHTML = `<div class="mastery"><i style="width:${Math.min(1, kills / ev.unlockKills) * 100}%"></i><span>🔒 Slay ${fmt(kills)} / ${fmt(ev.unlockKills)} ${unlockNoun(ev)} in ${areaDef(ev.area).name}</span></div>`;
        btn.innerHTML = '🔒';
        btn.disabled = true;
      } else if (running) {
        const left = ev.kind === 'guardian' ? (g.bossAlive ? g.bossTimer : ev.duration) : (g.activeEvent?.left ?? 0);
        status.innerHTML = `<b class="ev-live">● Running · ${Math.ceil(left)}s left</b>`;
        btn.innerHTML = 'Live';
        btn.disabled = true;
      } else if (wait > 0) {
        status.innerHTML = extra;
        btn.innerHTML = `Need energy<small>${fmtTime(wait)}</small>`;
        btn.disabled = true;
      } else {
        status.innerHTML = extra;
        btn.innerHTML = ev.kind === 'minigame' ? 'Play' : g.eventRunning ? 'Busy<small>another event</small>' : 'Start';
        btn.disabled = !g.eventReady(ev.id);
      }
    });
    return card;
  }

  /** Starts a minigame on its own screen; at the end it pays out and shows what you earned. */
  private playMinigame(ev: EventDef): void {
    const g = this.game;
    const mg = ev.minigame && MINIGAMES[ev.minigame];
    if (!mg || !g.startEvent(ev.id)) return;
    this.refresh();
    const best = g.state.events[ev.id]?.best ?? 0;
    const bless = ev.blessing;
    runMinigame({
      title: mg.title,
      intro: mg.intro + (bless ? `<p class="mg-bless">${blessingIntro(g, ev)}</p>` : ''),
      area: ev.area,
      decor: mg.decor,
      lives: mg.lives,
      best,
      create: mg.create,
      onEnd: (score) => {
        const r = g.finishMinigame(ev.id, score);
        const record = score > best && best > 0 ? '<p class="mg-best">New best!</p>' : '';
        const tier = g.blessingFor(ev.id, score);
        const blessed = bless && tier > 0 ? `<p class="mg-bless">✨ Blessed: your next ${bless.kind === 'refine' ? 'Refine' : 'Enchant'} rolls ${tier} extra time${tier > 1 ? 's' : ''} (${Math.round(g.perfectChance(tier) * 100)}% perfect a roll)</p>` : '';
        return `${record}<p>${score > 0 ? rewardText(r) : 'No rewards this time.'}</p>${blessed}`;
      },
      onClose: () => this.refresh(),
    });
  }

  /** The first time the Time Eater falls: the Hunters' attempt to kill it, then the Void Rift is conquered. */
  private showRiftConquered(): void {
    this.lastPopup = performance.now();
    playCutscene(TIME_EATER_CUTSCENE, () => this.showRiftConqueredCard());
  }

  private showRiftConqueredCard(): void {
    this.showModal(
      `<h2>⏳ The Time Eater is defeated!</h2><p>You've conquered the <b>${areaDef('rift').name}</b>, the end of the known world.</p><p>The Rift still teems with monsters to hunt, and the Time Eater can be fought again whenever it's ready.</p>`,
      [{ label: 'Onward' }],
    );
  }

  /** The Areas tab opens with the second area (the Fey Grove). */
  private get areasOpen(): boolean {
    return this.game.unlockedAreas.length > 1;
  }

  /** Tapping the greyed-out Areas tab explains how to open it. */
  private showAreasLocked(): void {
    this.showModal(
      `<h2>🔒 Areas</h2><p>Beat the <b>${areaDef('forest').name} Guardian</b> to unlock the ${areaDef('glade').name}, and the Areas tab with it.</p><p>The Guardian Challenge opens in Events once you've slain ${fmt(areaDef('forest').mastery)} monsters in the ${areaDef('forest').name} and survived its Slime Swarm.</p>`,
      [{ label: 'OK' }],
    );
  }

  /** Tapping the greyed-out Events tab explains how to open it. */
  private showEventsLocked(): void {
    const forest = areaDef('forest');
    const first = EVENTS.find((e) => e.area === 'forest')!; // listed in unlock order
    const kills = Math.min(this.game.eventProgress(first.id), first.unlockKills);
    this.showModal(
      `<h2>🔒 Events</h2><p>Slay ${fmt(first.unlockKills)} ${unlockNoun(first)} in the ${forest.name} to unlock Events, starting with the ${first.name}.</p><p><b>${fmt(kills)} / ${fmt(first.unlockKills)}</b></p>`,
      [{ label: 'OK' }],
    );
  }

  /** Shown once, the very first time the game opens. */
  showWelcome(replay = false): void {
    if (!replay) this.game.state.flags.welcome = true;
    this.showModal(
      `<h2>Welcome!</h2>
       <p>This is <b>Pocket Hunter</b>, an idle swarm slaying game!</p>
       <p>Start your journey by tapping on the monsters while your Hunter attacks.</p>
       <p>You can change the name of your Hunter in ${sprite(MENU_SPRITES.settings)} <b>Settings</b>, from the menu at the top right.</p>`,
      [
        { label: 'Name my Hunter', secondary: true, action: () => this.openSettings() },
        { label: "Let's hunt!" },
      ],
    );
  }

  /** The first recipe (gear or Upgrade) you have the materials for, if any. */
  private firstCraftable(): string | null {
    const g = this.game;
    const gear = GEAR.find((gd) => this.gearKnown(gd) && g.canCraftGear(gd.id));
    if (gear) return gear.name;
    return ITEMS.find((it) => !it.area && g.canCraft(it.id))?.name ?? null;
  }

  /** Shown once, when you first have the materials to craft something. */
  private showCraftIntro(replay = false): void {
    if (!replay) this.game.state.flags.craftIntro = true;
    const first = this.firstCraftable();
    this.showModal(
      `<h2>🔨 Ready to craft!</h2>
       <p>${first ? `You've gathered enough materials to craft your first item: <b>${first}</b>.` : 'Once you gather enough materials, you can craft your first item.'}</p>
       <p>Monsters drop materials when slain. Spend them in <b>Inventory → Crafting</b> on gear for your Hunters and on Upgrades that make everyone stronger.</p>`,
      [
        { label: 'Later', secondary: true },
        {
          label: 'Go to Crafting',
          action: () => {
            this.dropDetail();
            this.invSub = 'crafting';
            this.setTab('inventory');
          },
        },
      ],
    );
  }

  /** Shown once, when you can first afford to unlock the wolf: also how to raise the menu to full screen. */
  private showWolfIntro(replay = false): void {
    if (!replay) this.game.state.flags.wolfIntro = true;
    this.showModal(
      `<h2>🐺 A new monster!</h2>
       <p>The wolf is now ready to be unlocked! Scroll down in the <b>Bestiary</b> to see the wolf.</p>
       <p>Additionally, you can <b>swipe up</b> on the tab bar, or <b>long press</b> it, to expand the menu. To close the expanded menu, you can swipe down, long press again, or press the <b>red arrow</b> button to drop it down.</p>`,
      [
        { label: 'Later', secondary: true },
        { label: 'Go to Bestiary', action: () => this.goTo('beasts') },
      ],
    );
  }

  /** Shown once, when the 100th slime falls: Empower opens in the Bestiary. */
  private showEmpowerIntro(replay = false): void {
    if (!replay) this.game.state.flags.empowerIntro = true;
    if (this.tab === 'beasts') this.setTab('beasts', true);
    this.showModal(
      `<h2>👾 Empower unlocked!</h2>
       <p>You've slain ${EMPOWER_UNLOCK_KILLS} slimes. In the <b>Bestiary</b>, unlock new monsters to join an area's horde, and <b>Empower</b> them with gold: tougher, but they pay more gold and drop more materials.</p>
       <p>Every level earns an <b>evolution point</b>. Tap a monster to evolve it; slaying more of it opens further evolutions. It all applies wherever they're hunted, including by stationed Hunters.</p>`,
      [
        { label: 'Later', secondary: true },
        { label: 'Go to Bestiary', action: () => this.goTo('beasts') },
      ],
    );
  }

  /** Shown once, the first time you can afford to train your Hunter. */
  private showTrainIntro(replay = false): void {
    if (!replay) this.game.state.flags.trainIntro = true;
    this.showModal(
      `<h2>💪 Time to train!</h2>
       <p>You have enough gold to <b>Train</b> your Hunter! Tap <b>Train</b> in the Hunters tab to increase your strength!</p>
       <p>After training enough, your Hunter will level up, granting <b>Skill Points</b> that can unlock more power and abilities.</p>
       <p>Open the Hunter's card to see more details, upgrade their abilities, and change their equipment!</p>
       <p>In the full card, the <b>×1 / ×10 / ×100 / MAX</b> switch under Training sets how many levels each tap of Train buys; MAX buys as many as you can afford. Your choice applies to every Hunter's Train button.</p>`,
      [
        { label: 'Later', secondary: true },
        { label: 'Go to Hunters', action: () => this.goTo('hunters') },
      ],
    );
  }

  /** Shown once, when the first Guardian Challenge unlocks. */
  private showEventsIntro(replay = false): void {
    if (!replay) this.game.state.flags.eventsIntro = true;
    this.showModal(
      `<h2>🎉 Events unlocked!</h2>
       <p>${this.game.eventUnlocked('guardian-forest') ? '<b>Guardian Challenge</b>' : `<b>${eventDef('slimeSwarm').name}</b>`} is ready in the ${areaDef('forest').name}.</p>
       <p>The Events tab shows the events of every area you've opened. Slay monsters in an area to unlock its events. Each event costs ⚡ <b>energy</b> to start: a swarm 1, a Guardian 1 to 3 (more in later areas), a minigame 3. You hold up to 5, and one comes back every 20 minutes, even while you're away.</p>`,
      [
        { label: 'Later', secondary: true },
        { label: 'Go to Events', action: () => (this.game.eventsOpen ? this.goTo('events') : this.showEventsLocked()) },
      ],
    );
  }

  // ---- "New" marks: what the player hasn't looked at yet ----

  private seenCache = new Map<string, { arr: string[]; len: number; set: Set<string> }>();

  private seenSet(kind: 'recipes' | 'beasts' | 'events'): Set<string> {
    const arr = this.game.state.seen[kind];
    let c = this.seenCache.get(kind);
    if (!c || c.arr !== arr || c.len !== arr.length) this.seenCache.set(kind, (c = { arr, len: arr.length, set: new Set(arr) }));
    return c.set;
  }

  private markSeen(kind: 'recipes' | 'beasts' | 'events', id: string): void {
    if (this.seenSet(kind).has(id)) return;
    this.game.state.seen[kind].push(id);
  }

  /** A recipe you can now see but haven't opened. */
  private newRecipe(gd: GearDef): boolean {
    return !gd.starter && !this.seenSet('recipes').has(gd.id) && this.gearKnown(gd);
  }

  /** A monster you've unlocked, or can afford to, that you haven't looked at. */
  private newBeast(def: EnemyDef): boolean {
    const g = this.game;
    if (this.seenSet('beasts').has(def.id)) return false;
    return g.state.bestiary[def.id].unlocked || (g.isAreaUnlocked(def.area) && g.state.gold >= enemyUnlockCost(def));
  }

  /** An event that's ready to start and hasn't been seen in the Events tab since it became ready. */
  private newEvent(id: string): boolean {
    return this.game.eventReady(id) && !this.seenSet('events').has(id);
  }

  /**
   * Keeps the seen lists in step: a save from before them counts everything it already had as seen, and an event
   * that's running or cooling down drops out so it's new again when it's next ready.
   */
  private syncSeen(): void {
    const g = this.game;
    const seen = g.state.seen;
    if (!seen.init) {
      seen.init = true;
      seen.recipes = GEAR.filter((gd) => !gd.starter && this.gearKnown(gd)).map((gd) => gd.id);
      seen.beasts = ENEMIES.filter((e) => g.state.bestiary[e.id].unlocked).map((e) => e.id);
      seen.gearUid = g.state.nextGearUid - 1;
    }
    if (seen.events.some((id) => !g.eventReady(id))) seen.events = seen.events.filter((id) => g.eventReady(id));
  }

  /** Switches tab from anywhere, closing a full-screen view (e.g. Tutorials) on the way. */
  private goTo(tab: Tab): void {
    this.dropDetail();
    this.setTab(tab);
  }

  // ---- Menu (top right): Tutorials, Journal, Settings, Quit ----

  private openMenu(): void {
    const unread = this.game.unreadJournal().length;
    const item = (id: string, icon: string, name: string, extra = '') => `<button type="button" class="menu-item" data-menu="${id}"><span class="mi-icon">${icon}</span><span class="mi-name">${name}</span>${extra}</button>`;
    this.showModal(
      `<h2>Menu</h2><div class="menu-list">
        ${item('tutorials', sprite(MENU_SPRITES.tutorials), 'Tutorials')}
        ${item('journal', sprite(MENU_SPRITES.journal), 'Journal Entries', unread ? `<span class="alert-mark" title="${unread} new"></span>` : '')}
        ${item('settings', sprite(MENU_SPRITES.settings), 'Settings')}
        ${item('quit', sprite(MENU_SPRITES.quit), 'Quit')}
      </div>`,
      [{ label: 'Close', secondary: true }],
    );
    const open: Record<string, () => void> = {
      tutorials: () => this.openTutorials(),
      journal: () => this.openJournal(),
      settings: () => this.openSettings(),
      quit: () => this.confirmQuit(),
    };
    this.modal.querySelectorAll<HTMLElement>('[data-menu]').forEach((b) =>
      b.addEventListener('click', () => {
        this.modalClose?.();
        open[b.dataset.menu!]();
      }),
    );
  }

  private confirmQuit(): void {
    this.showModal(`<h2>Quit</h2><p>Close the game? Your progress is saved, and your Hunters keep hunting while you're away.</p>`, [
      { label: 'No', secondary: true },
      {
        label: 'Yes',
        action: () => {
          this.hooks.save();
          void CapApp.exitApp().catch(() => window.close());
        },
      },
    ]);
  }

  // ---- Journal ----

  /** The Journal: entries unlocked so far (new ones flagged until opened), and how many are still hidden. */
  private openJournal(entry?: JournalEntry): void {
    if (this.detail) this.dropDetail();
    const g = this.game;
    const view = el('div', 'hunter-detail settings journal');
    view.innerHTML = `
      <div class="hd-top"><button class="hd-close" aria-label="${entry ? 'Back' : 'Close'}">${entry ? '‹' : '✕'}</button><span>${entry ? esc(entry.title) : 'Journal'}</span></div>
      <div class="hd-scroll"></div>`;
    document.body.appendChild(view);
    $('.hd-close', view).addEventListener('click', () => (entry ? this.openJournal() : this.closeHunterDetail()));
    this.detail = { el: view, refreshers: [] };
    const body = $('.hd-scroll', view);
    if (entry) {
      if (!g.state.seen.journal.includes(entry.id)) {
        g.state.seen.journal.push(entry.id);
        this.hooks.save();
        this.refresh();
      }
      const page = el('div', 'card journal-page');
      page.innerHTML = `<div class="jp-icon">${journalIcon(entry)}</div>${entry.body
        .split(/\n\s*\n/)
        .map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`)
        .join('')}`;
      body.appendChild(page);
      return;
    }
    const open = JOURNAL.filter((e) => g.journalUnlocked(e));
    if (!open.length) body.appendChild(el('p', 'empty', 'No entries yet.'));
    for (const e of open) {
      const b = el('button', 'card tut-row');
      const isNew = !g.state.seen.journal.includes(e.id);
      b.innerHTML = `<span class="tut-icon">${journalIcon(e)}</span><span class="tut-text"><b>${esc(e.title)}</b><small>${esc(e.body.split('\n')[0].slice(0, 80))}${e.body.length > 80 ? '…' : ''}</small></span>${isNew ? '<span class="alert-mark white"></span>' : ''}<span class="tut-go">›</span>`;
      b.addEventListener('click', () => this.openJournal(e));
      body.appendChild(b);
    }
    const hidden = JOURNAL.length - open.length;
    if (hidden) body.appendChild(el('p', 'journal-more', `${hidden} more ${hidden === 1 ? 'entry' : 'entries'} still to find.`));
  }

  // ---- Tutorials ----

  /** Full-screen Tutorials menu (opened from the main menu): replay the tips, and pages on weapon types and damage types. */
  private openTutorials(page: 'menu' | 'weapons' | 'damage' = 'menu'): void {
    if (this.detail) this.dropDetail();
    const title = page === 'menu' ? 'Tutorials' : page === 'weapons' ? 'Weapon types' : 'Damage types';
    const view = el('div', 'hunter-detail settings tutorials');
    view.innerHTML = `
      <div class="hd-top"><button class="hd-close" aria-label="${page === 'menu' ? 'Close' : 'Back'}">${page === 'menu' ? '✕' : '‹'}</button><span>${title}</span></div>
      <div class="hd-scroll"></div>`;
    document.body.appendChild(view);
    // Back goes up a level: a guide to the Tutorials menu; the menu itself closes.
    $('.hd-close', view).addEventListener('click', () => (page === 'menu' ? this.closeHunterDetail() : this.openTutorials()));
    this.detail = { el: view, refreshers: [] };
    const body = $('.hd-scroll', view);
    if (page === 'weapons') this.buildWeaponGuide(body);
    else if (page === 'damage') this.buildDamageGuide(body);
    else this.buildTutorialMenu(body);
  }

  private buildTutorialMenu(body: HTMLElement): void {
    const row = (icon: string, name: string, text: string, open: () => void) => {
      const b = el('button', 'card tut-row');
      b.innerHTML = `<span class="tut-icon">${icon}</span><span class="tut-text"><b>${name}</b><small>${text}</small></span><span class="tut-go">›</span>`;
      b.addEventListener('click', open);
      body.appendChild(b);
    };
    body.appendChild(sectionTitle('Guides'));
    row(sprite(MENU_SPRITES.weapons), 'Weapon types', 'How each kind of weapon attacks: range, speed, reloads, knockback and more.', () => this.openTutorials('weapons'));
    row(sprite(MENU_SPRITES.damage), 'Damage types & status effects', 'What each damage type does, weaknesses and resistances.', () => this.openTutorials('damage'));
    body.appendChild(sectionTitle('Tips'));
    row(sprite(MENU_SPRITES.welcome), 'Welcome', 'Getting started.', () => this.showWelcome(true));
    row(sprite(MENU_SPRITES.training), 'Training', `Making your Hunter stronger (opens after ${TRAIN_UNLOCK_KILLS} slimes).`, () => this.showTrainIntro(true));
    row(sprite(MENU_SPRITES.crafting), 'Crafting', 'Materials, gear and Upgrades.', () => this.showCraftIntro(true));
    row(sprite(MENU_SPRITES.wolf), 'New monsters & the full-screen menu', 'Unlocking the wolf, and raising the menu over the battlefield.', () => this.showWolfIntro(true));
    row(sprite(MENU_SPRITES.empower), 'Empower', `Unlocking and empowering monsters (opens after ${EMPOWER_UNLOCK_KILLS} slimes).`, () => this.showEmpowerIntro(true));
    row(sprite(MENU_SPRITES.eventsLocked), 'Unlocking Events', 'How to open the Events tab.', () => this.showEventsLocked());
    row(sprite(MENU_SPRITES.events), 'Events', 'Guardian Challenges, swarms, minigames and energy.', () => this.showEventsIntro(true));
    // The story so far, once you've seen it.
    if ((this.game.state.events['guardian-rift']?.completed ?? 0) > 0) row(sprite(MENU_SPRITES.timeEater), 'The Time Eater', 'Replay the cutscene from the Void Rift.', () => playCutscene(TIME_EATER_CUTSCENE));
  }

  private buildWeaponGuide(body: HTMLElement): void {
    const intro = el('div', 'card setting');
    intro.innerHTML = `<p>Each type comes in three archetypes: its standard form and two takes that trade one strength for another (a Maul slams slower over a much larger area, a Mallet quicker over a smaller one), so a new weapon can change how a Hunter fights, not just how hard.</p><p>Every hit starts from the weapon's own damage (the starting Short Sword and Short Bow: 1), which upgrading it raises; training, skills, Upgrades and armor or accessory bonuses multiply it. Heavier types have higher base damage for their rarity.</p><p>Your Hunter can wield any weapon and attacks the way it does. Guild Hunters keep their own signature attack; their weapon's type reshapes its speed, damage and range.</p><p>Every type trades speed, damage, reach and crowd hits, so none is simply best. Melee hits knock surviving monsters back.</p>`;
    body.appendChild(intro);
    const groups: Array<[string, WeaponClass[]]> = [
      ['Ranged', ['shortbow', 'longbow', 'crossbow', 'pistol', 'rifle', 'repeater']],
      ['Melee', ['dagger', 'sword', 'glaive', 'spear', 'hammer']],
      ['Magic', ['wand', 'scepter', 'staff', 'focus', 'tome']],
    ];
    for (const [name, classes] of groups) {
      body.appendChild(sectionTitle(name));
      for (const id of classes) {
        const c = WEAPON_CLASSES[id];
        const known = GEAR.filter((gd) => gd.weaponClass === id && this.gearKnown(gd));
        const card = el('div', 'card setting tut-card');
        const [, a1, a2] = WEAPON_ARCHETYPES[id];
        card.innerHTML = `<div class="setting-name">${CLASS_ICONS[id]} ${c.name}</div><p>${c.describe}</p><div class="tut-traits">${weaponTraits(c)
          .map((t) => `<span class="tut-trait">${t}</span>`)
          .join('')}</div><p class="tut-archetypes">Also comes as a <b>${a1.name}</b> (${a1.desc.charAt(0).toLowerCase()}${a1.desc.slice(1, -1)}) or a <b>${a2.name}</b> (${a2.desc.charAt(0).toLowerCase()}${a2.desc.slice(1, -1)}).</p>${known.length ? `<p class="tut-examples">${known.map((gd) => `${gearIcon(gd)} ${gd.name}`).join(' · ')}</p>` : ''}`;
        body.appendChild(card);
      }
    }
  }

  private buildDamageGuide(body: HTMLElement): void {
    const intro = el('div', 'card setting');
    intro.innerHTML = `<p>Every attack deals a damage type: a weapon's own, or the Hunter's if the weapon has none.</p>
      <p>Monsters can be <b>Weak</b> to a type (×${WEAK_MULT} damage) or <b>Resist</b> it (×${RESIST_MULT}); their Bestiary card shows which.</p>
      <p>Most types can inflict a <b>status effect</b>. A weapon's proc chance sets how often. A monster holds one of each effect at a time, and a new one refreshes it. <b>Bleeding</b> is the exception: it stacks.</p>`;
    body.appendChild(intro);
    body.appendChild(sectionTitle('Damage types'));
    for (const t of Object.keys(DAMAGE_TYPES) as DamageType[]) {
      const d = DAMAGE_TYPES[t];
      const card = el('div', 'card setting tut-card');
      card.innerHTML = `<div class="setting-name">${damageTypeHtml(t)}${STATUS_NAMES[t] ? ` <span class="tut-status">${STATUS_NAMES[t]}</span>` : ''}</div><p>${d.effect ? `${d.effect}.` : 'No status effect: pure damage that few monsters resist.'}</p>`;
      body.appendChild(card);
    }
  }

  // ---- Settings ----

  /**
   * Settings' Audio card: a switch and a volume slider for all audio, and under it the same for music and for sound
   * effects (greyed out while all audio is off). Sliders apply as they move and save when let go.
   */
  private audioSettings(): HTMLElement {
    const a = this.game.state.settings.audio;
    const card = el('div', 'card setting audio-setting');
    const row = (label: string, sw: 'on' | 'musicOn' | 'sfxOn', vol: 'master' | 'music' | 'sfx', sub: boolean) =>
      `<div class="audio-row${sub ? ' sub-row' : ''}"><span class="ar-name">${label}</span><div class="segmented" data-sw="${sw}"><button data-v="on">On</button><button data-v="off">Off</button></div><div class="ar-vol"><input type="range" min="0" max="100" step="5" data-vol="${vol}" aria-label="${label} volume"><b></b></div></div>`;
    card.innerHTML = `<div class="setting-name">Music &amp; sound effects</div><p>Switch all audio off, or music and sound effects each on their own; the sliders set how loud.</p>${row('All audio', 'on', 'master', false)}<div class="fx-list sub-list audio-subs">${row('Music', 'musicOn', 'music', true)}${row('Sound effects', 'sfxOn', 'sfx', true)}</div>`;
    const draw = () => {
      $('.audio-subs', card).classList.toggle('disabled', !a.on);
      card.querySelectorAll<HTMLElement>('[data-sw]').forEach((seg) => {
        const key = seg.dataset.sw as 'on' | 'musicOn' | 'sfxOn';
        seg.querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
          b.classList.toggle('on', (b.dataset.v === 'on') === a[key]);
          b.disabled = key !== 'on' && !a.on;
        });
      });
      card.querySelectorAll<HTMLInputElement>('[data-vol]').forEach((inp) => {
        const key = inp.dataset.vol as 'master' | 'music' | 'sfx';
        inp.value = String(a[key]);
        inp.style.setProperty('--p', `${a[key]}%`);
        inp.disabled = !a.on || (key === 'music' && !a.musicOn) || (key === 'sfx' && !a.sfxOn);
        inp.nextElementSibling!.textContent = `${a[key]}%`;
      });
    };
    card.querySelectorAll<HTMLElement>('[data-sw]').forEach((seg) =>
      seg.querySelectorAll<HTMLButtonElement>('button').forEach((b) =>
        b.addEventListener('click', () => {
          a[seg.dataset.sw as 'on' | 'musicOn' | 'sfxOn'] = b.dataset.v === 'on';
          applyAudio(a);
          this.hooks.save();
          draw();
        }),
      ),
    );
    card.querySelectorAll<HTMLInputElement>('[data-vol]').forEach((inp) => {
      const key = inp.dataset.vol as 'master' | 'music' | 'sfx';
      inp.addEventListener('input', () => {
        a[key] = Number(inp.value);
        applyAudio(a);
        draw();
      });
      // Let go: save, and play a sample of the sound effects at their new volume.
      inp.addEventListener('change', () => {
        this.hooks.save();
        if (key !== 'music') sfx('train');
      });
    });
    draw();
    return card;
  }

  /** Puts per-player preferences into effect (e.g. which side Train buttons sit on). */
  private applySettings(): void {
    document.body.classList.toggle('left-handed', this.game.state.settings.leftHanded);
    mainHunterName = this.game.state.settings.name.trim();
    setHaptics(this.game.state.settings.haptics);
    applyAudio(this.game.state.settings.audio);
    applyFont(this.game.state.settings.font);
    applyUiStyle(this.game.state.settings.uiStyle);
    requestAnimationFrame(refitAffinities);
    void document.fonts?.ready.then(refitAffinities);
    const nav = $('.tabs');
    for (const t of this.game.state.settings.tabOrder) nav.appendChild($(`.tabs button[data-tab=${t}]`));
  }

  /** Full-screen Settings page. */
  private openSettings(): void {
    if (this.detail) this.dropDetail();
    const g = this.game;
    const view = el('div', 'hunter-detail settings');
    view.innerHTML = `
      <div class="hd-top"><button class="hd-close" aria-label="Close">✕</button><span>Settings</span></div>
      <div class="hd-scroll"></div>`;
    document.body.appendChild(view);
    $('.hd-close', view).addEventListener('click', () => this.closeHunterDetail());
    this.detail = { el: view, refreshers: [] };
    const body = $('.hd-scroll', view);

    // Audio first: the setting most people look for.
    body.appendChild(sectionTitle('Audio'));
    body.appendChild(this.audioSettings());

    body.appendChild(sectionTitle('Your Hunter'));
    const nameCard = el('div', 'card setting');
    nameCard.innerHTML = `<div class="setting-name">Name</div><p>What your Hunter is called on their card and around the game.</p><input class="name-input" type="text" maxlength="${MAX_NAME_LENGTH}" placeholder="You" autocomplete="off" spellcheck="false" />`;
    const input = $<HTMLInputElement>('.name-input', nameCard);
    input.value = g.state.settings.name;
    input.addEventListener('input', () => {
      g.state.settings.name = input.value.slice(0, MAX_NAME_LENGTH);
      this.applySettings();
    });
    input.addEventListener('change', () => this.hooks.save());
    input.addEventListener('keydown', (e) => e.key === 'Enter' && input.blur());
    body.appendChild(nameCard);

    body.appendChild(sectionTitle('Controls'));
    const hand = el('div', 'card setting');
    hand.innerHTML = `<div class="setting-name">Handedness</div><p>Which side of the Hunter cards the Train button sits on.</p><div class="segmented"><button data-v="left">Left-handed</button><button data-v="right">Right-handed</button></div>`;
    const buttons = hand.querySelectorAll<HTMLButtonElement>('.segmented button');
    const sync = () => buttons.forEach((b) => b.classList.toggle('on', (b.dataset.v === 'left') === g.state.settings.leftHanded));
    buttons.forEach((b) =>
      b.addEventListener('click', () => {
        g.state.settings.leftHanded = b.dataset.v === 'left';
        this.applySettings();
        this.hooks.save();
        sync();
      }),
    );
    sync();
    body.appendChild(hand);

    body.appendChild(sectionTitle('Battlefield'));
    // A setting with a row of choices; `get`/`set` read and write it. `enabled` greys it out (and locks it)
    // while the setting it belongs to is off.
    const syncs: Array<() => void> = [];
    const choices = <T extends string>(title: string, blurb: string, opts: Array<[T, string]>, get: () => T, set: (v: T) => void, enabled: () => boolean = () => true) => {
      const card = el('div', 'card setting');
      card.innerHTML = `<div class="setting-name">${title}</div><p>${blurb}</p><div class="segmented">${opts.map(([v, label]) => `<button data-v="${v}">${label}</button>`).join('')}</div>`;
      const btns = card.querySelectorAll<HTMLButtonElement>('.segmented button');
      const draw = () => {
        const on = enabled();
        card.classList.toggle('disabled', !on);
        btns.forEach((b) => {
          b.classList.toggle('on', b.dataset.v === get());
          b.disabled = !on;
        });
      };
      btns.forEach((b) =>
        b.addEventListener('click', () => {
          if (!enabled()) return;
          set(b.dataset.v as T);
          this.hooks.save();
          syncs.forEach((f) => f());
        }),
      );
      syncs.push(draw);
      draw();
      body.appendChild(card);
    };
    const st = g.state.settings;
    const styles: Array<[IndicatorStyle, string]> = [['fancy', 'Fancy'], ['basic', 'Basic']];
    choices(
      'Event timer & Guardian bar',
      "Where an event's timer and a Guardian's health bar go on the battlefield. They always sit clear of the cooldown icons and the DPS meter.",
      [['bottom', 'Bottom'], ['top', 'Top']],
      () => st.hudPos,
      (v) => (st.hudPos = v),
    );
    /**
     * A setting with a Show / Hide switch and its options underneath in the same card (smaller), greyed out
     * and locked while it's hidden, like the Effects groups.
     */
    const group = (title: string, blurb: string, get: () => boolean, set: (on: boolean) => void, subs: Array<{ label: string; opts: Array<[string, string]>; get: () => string; set: (v: string) => void }>) => {
      const card = el('div', 'card setting');
      card.innerHTML = `<div class="setting-name">${title}</div><p>${blurb}</p><div class="segmented fx-master"><button data-v="on">Show</button><button data-v="off">Hide</button></div><div class="fx-list sub-list">${subs
        .map((sb, i) => `<div class="sub-row" data-i="${i}"><span>${sb.label}</span><div class="segmented">${sb.opts.map(([v, l]) => `<button data-v="${v}">${l}</button>`).join('')}</div></div>`)
        .join('')}</div>`;
      const draw = () => {
        const on = get();
        card.querySelectorAll<HTMLButtonElement>('.fx-master button').forEach((b) => b.classList.toggle('on', (b.dataset.v === 'on') === on));
        $('.sub-list', card).classList.toggle('disabled', !on);
        card.querySelectorAll<HTMLElement>('.sub-row').forEach((row) => {
          const sb = subs[Number(row.dataset.i)];
          row.querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
            b.classList.toggle('on', b.dataset.v === sb.get());
            b.disabled = !on;
          });
        });
      };
      card.querySelectorAll<HTMLButtonElement>('.fx-master button').forEach((b) =>
        b.addEventListener('click', () => {
          set(b.dataset.v === 'on');
          this.hooks.save();
          draw();
        }),
      );
      card.querySelectorAll<HTMLElement>('.sub-row').forEach((row) =>
        row.querySelectorAll<HTMLButtonElement>('button').forEach((b) =>
          b.addEventListener('click', () => {
            if (!get()) return;
            subs[Number(row.dataset.i)].set(b.dataset.v!);
            this.hooks.save();
            draw();
          }),
        ),
      );
      draw();
      body.appendChild(card);
    };
    group(
      'DPS meter',
      'Your total damage per second, in a corner of the battlefield.',
      () => st.dps,
      (on) => {
        st.dps = on;
        this.refresh();
      },
      [
        {
          label: 'Corner',
          opts: [['tl', '↖ Top left'], ['tr', '↗ Top right'], ['bl', '↙ Bottom left'], ['br', '↘ Bottom right']],
          get: () => st.dpsCorner,
          set: (v) => {
            st.dpsCorner = v as DpsCorner;
            this.refresh();
          },
        },
      ],
    );
    group(
      'Pick-up pop-ups',
      "Materials you've just gained, in a corner of the battlefield: a line per material counting up while more comes in. Ores and gems push out the rest. Hidden during Guardian fights.",
      () => st.pickups,
      (on) => {
        st.pickups = on;
        this.refresh();
      },
      [
        {
          label: 'Corner',
          opts: [['tl', '↖ Top left'], ['tr', '↗ Top right'], ['bl', '↙ Bottom left'], ['br', '↘ Bottom right']],
          get: () => st.pickupCorner,
          set: (v) => {
            st.pickupCorner = v as DpsCorner;
            this.refresh();
          },
        },
      ],
    );
    group(
      'Cooldown icons',
      "Icons for abilities that recharge (like Andrejz's potions, Glimmer's fireballs and item abilities). They grey out when used and refill from the top down.",
      () => st.cooldowns,
      (on) => (st.cooldowns = on),
      [
        { label: 'Position', opts: COOLDOWN_POSITIONS.map((p) => [p, p[0].toUpperCase() + p.slice(1)]), get: () => st.cooldownPos, set: (v) => (st.cooldownPos = v as CooldownPos) },
        { label: 'Style', opts: styles, get: () => st.cooldownStyle, set: (v) => (st.cooldownStyle = v as IndicatorStyle) },
      ],
    );
    group(
      'Reload indicator',
      'Text over a Hunter waiting on their weapon: "RELOADING!" (pistols, rifles, repeaters) or "RECHARGING!" (staffs), and "SUMMONING!" (tomes) if Summoning is on. It fades from right to left as the wait runs out.',
      () => st.reloads,
      (on) => (st.reloads = on),
      [
        { label: 'Position', opts: [['above', 'Above'], ['below', 'Below']], get: () => st.reloadPos, set: (v) => (st.reloadPos = v as 'above' | 'below') },
        { label: 'Style', opts: styles, get: () => st.reloadStyle, set: (v) => (st.reloadStyle = v as IndicatorStyle) },
        { label: 'Summoning', opts: [['off', 'Off'], ['on', 'On']], get: () => (st.summonText ? 'on' : 'off'), set: (v) => (st.summonText = v === 'on') },
      ],
    );

    body.appendChild(sectionTitle('Effects'));
    // A group of effects with a master switch and a switch for each kind (greyed out while the group is off).
    const fxGroup = (title: string, blurb: string, master: FxKey, kinds: Array<[FxKey, string]>) => {
      const fx = st.fx;
      const card = el('div', 'card setting');
      card.innerHTML = `<div class="setting-name">${title}</div><p>${blurb}</p><div class="segmented fx-master"><button data-v="on">Show</button><button data-v="off">Hide</button></div><div class="fx-list">${kinds
        .map(([k, label]) => `<div class="fx-row" data-k="${k}"><span>${label}</span><div class="segmented"><button data-v="on">On</button><button data-v="off">Off</button></div></div>`)
        .join('')}</div>`;
      const draw = () => {
        card.querySelectorAll<HTMLButtonElement>('.fx-master button').forEach((b) => b.classList.toggle('on', (b.dataset.v === 'on') === fx[master]));
        $('.fx-list', card).classList.toggle('disabled', !fx[master]);
        card.querySelectorAll<HTMLElement>('.fx-row').forEach((row) => {
          const k = row.dataset.k as FxKey;
          row.querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
            b.classList.toggle('on', (b.dataset.v === 'on') === fx[k]);
            b.disabled = !fx[master];
          });
        });
      };
      card.querySelectorAll<HTMLButtonElement>('.fx-master button').forEach((b) =>
        b.addEventListener('click', () => {
          fx[master] = b.dataset.v === 'on';
          this.hooks.save();
          draw();
        }),
      );
      card.querySelectorAll<HTMLElement>('.fx-row').forEach((row) =>
        row.querySelectorAll<HTMLButtonElement>('button').forEach((b) =>
          b.addEventListener('click', () => {
            if (!fx[master]) return;
            fx[row.dataset.k as FxKey] = b.dataset.v === 'on';
            this.hooks.save();
            draw();
          }),
        ),
      );
      draw();
      body.appendChild(card);
    };
    fxGroup('Damage numbers', 'Numbers that pop up when monsters are hit.', 'damage', [
      ['dmgNormal', 'Normal hits'],
      ['dmgCrit', 'Critical hits'],
      ['dmgResist', 'Resisted hits'],
      ['dmgWeak', 'Weak-spot hits'],
    ]);
    fxGroup('Status effect particles', 'What monsters show while affected by a status effect.', 'status', [
      ['burn', `${fxIcon('fire')} Burning embers`],
      ['poison', `${fxIcon('poison')} Poison bubbles`],
      ['bleed', `${fxIcon('physical')} Bleeding drips`],
      ['chill', `${fxIcon('frost')} Frost tint`],
      ['acid', `${fxIcon('acid')} Acid puddles`],
      ['radiant', `${fxIcon('radiant')} Radiant bursts`],
      ['decay', `${fxIcon('decay')} Decay aura`],
      ['arcane', `${fxIcon('arcane')} Arcane sparks`],
      ['void', `${fxIcon('void')} Void gravity wells`],
    ]);
    choices('Area effect style', 'Fancy draws spells as animated pixel art (explosions, fireballs, lightning strikes, sun strikes, black holes, shield flashes, puffs as monsters fall) and puddles, bursts and auras as clusters of coloured pixel squares; Basic draws them as plain circles.', styles, () => st.aoeStyle, (v) => (st.aoeStyle = v));
    choices('Haptics', 'A short vibration when you press a button or tap the battlefield (not when you swipe or scroll).', [['off', 'Off'], ['light', 'Light'], ['medium', 'Medium'], ['strong', 'Strong']], () => st.haptics, (v) => {
      st.haptics = v;
      setHaptics(v);
      buzz();
    });
    choices('Clarity Border', 'A white outline round Hunters, monsters and their projectiles, so they stand out from the ground and the scenery. Low is a faint edge; Strong a bright one.', [['off', 'Off'], ['low', 'Low'], ['moderate', 'Moderate'], ['strong', 'Strong']], () => st.clarity, (v) => (st.clarity = v));

    const tabsCard = el('div', 'card setting');
    tabsCard.innerHTML = `<div class="setting-name">Tab order</div><p>The order of the tabs along the bottom of the screen, left to right. Drag a row or use the arrows.</p><div class="tab-order"></div><button class="secondary tab-order-reset">Reset to default</button>`;
    const list = $('.tab-order', tabsCard);
    const reset = $<HTMLButtonElement>('.tab-order-reset', tabsCard);
    const setOrder = (order: TabId[]) => {
      g.state.settings.tabOrder = order;
      this.applySettings();
      this.hooks.save();
      drawOrder();
    };
    const drawOrder = () => {
      const order = g.state.settings.tabOrder;
      list.innerHTML = '';
      order.forEach((t, i) => {
        const tabBtn = $(`.tabs button[data-tab=${t}]`);
        const row = el('div', 'tab-order-row');
        row.dataset.tab = t;
        row.innerHTML = `<span class="tor-grip" aria-hidden="true">⠿</span><span class="tor-num">${i + 1}</span><i>${$('i', tabBtn).textContent}</i><b>${tabBtn.childNodes[1].textContent!.trim()}</b><button class="tor-up" aria-label="Move left">▲</button><button class="tor-down" aria-label="Move right">▼</button>`;
        const move = (d: number) => {
          const next = [...order];
          [next[i], next[i + d]] = [next[i + d], next[i]];
          setOrder(next);
        };
        const up = $<HTMLButtonElement>('.tor-up', row);
        const down = $<HTMLButtonElement>('.tor-down', row);
        up.disabled = i === 0;
        down.disabled = i === order.length - 1;
        up.addEventListener('click', () => move(-1));
        down.addEventListener('click', () => move(1));
        row.addEventListener('pointerdown', (e) => dragRow(e, row));
        list.appendChild(row);
      });
      reset.disabled = order.every((t, i) => t === TAB_IDS[i]);
    };
    /** Drag a row (anywhere but its arrow buttons) up or down; the others make room as it passes them. */
    const dragRow = (e: PointerEvent, row: HTMLElement) => {
      if ((e.target as HTMLElement).closest('button') || (e.pointerType === 'mouse' && e.button !== 0)) return;
      e.preventDefault();
      row.setPointerCapture(e.pointerId);
      row.classList.add('lifted');
      list.classList.add('sorting');
      const startY = e.clientY;
      const startTop = row.offsetTop;
      const follow = (y: number) => (row.style.transform = `translateY(${y - startY - (row.offsetTop - startTop)}px)`);
      const onMove = (ev: PointerEvent) => {
        const others = ([...list.children] as HTMLElement[]).filter((r) => r !== row);
        // The dragged row goes before the first row whose middle is below the pointer.
        const before = others.find((r) => {
          const rect = r.getBoundingClientRect();
          return ev.clientY < rect.top + rect.height / 2;
        });
        if (row.nextElementSibling !== (before ?? null)) list.insertBefore(row, before ?? null);
        follow(ev.clientY);
      };
      const onUp = () => {
        row.removeEventListener('pointermove', onMove);
        row.removeEventListener('pointerup', onUp);
        row.removeEventListener('pointercancel', onUp);
        row.classList.remove('lifted');
        list.classList.remove('sorting');
        row.style.transform = '';
        const next = ([...list.children] as HTMLElement[]).map((r) => r.dataset.tab as TabId);
        if (next.some((t, i) => t !== g.state.settings.tabOrder[i])) setOrder(next);
        else drawOrder();
      };
      row.addEventListener('pointermove', onMove);
      row.addEventListener('pointerup', onUp);
      row.addEventListener('pointercancel', onUp);
    };
    reset.addEventListener('click', () => setOrder([...TAB_IDS]));
    drawOrder();
    body.appendChild(tabsCard);

    body.appendChild(sectionTitle('Display'));
    const fontCard = el('div', 'card setting');
    fontCard.innerHTML = `<div class="setting-name">Font</div><p>The lettering used in menus and on the battlefield.</p><div class="font-options"></div>`;
    const fontList = $('.font-options', fontCard);
    const fontButtons = FONTS.map((f) => {
      const b = el('button', 'font-option') as HTMLButtonElement;
      b.style.fontFamily = f.family;
      b.innerHTML = `<b>${f.name}</b><small>Slay the horde! 123</small>`;
      b.addEventListener('click', () => {
        g.state.settings.font = f.id;
        this.applySettings();
        this.hooks.save();
        syncFont();
      });
      fontList.appendChild(b);
      return { f, b };
    });
    const syncFont = () => fontButtons.forEach(({ f, b }) => b.classList.toggle('on', fontDef(g.state.settings.font).id === f.id));
    syncFont();
    body.appendChild(fontCard);
    choices(
      'Menu style',
      'Parchment frames menus in wood and parchment, recoloured to match each area; Classic keeps the original flat cards.',
      [['parchment', 'Parchment'], ['classic', 'Classic']],
      () => st.uiStyle,
      (v) => {
        st.uiStyle = v;
        this.applySettings();
      },
    );

    body.appendChild(sectionTitle('Save'));
    const wipe = el('div', 'card setting');
    wipe.innerHTML = `<div class="setting-name">Reset all progress</div><p>Deletes your save: areas, Hunters, gear and materials. It cannot be undone.</p><button class="buy danger-btn">Reset…</button>`;
    $('.danger-btn', wipe).addEventListener('click', () =>
      this.showModal('<h2>Reset everything?</h2><p>This deletes your save: areas, Hunters, items and materials. It cannot be undone.</p>', [
        { label: 'Cancel', secondary: true },
        { label: 'Delete', action: () => void this.hooks.wipe() },
      ]),
    );
    body.appendChild(wipe);

    // Dev: jump to any point of the game to try an area's monsters and gear.
    body.appendChild(sectionTitle('Dev'));
    const dev = el('div', 'card setting dev-progress');
    dev.innerHTML = `<div class="setting-name">Progress</div><p>Load a saved point in the game: the start of an area (gear made from the last Guardian's materials) or its end, just before its Guardian falls, with Hunters, gear and monsters where a typical player would have them. Your own save is kept, and comes back with Restore.</p><button class="buy dev-load">Load a phase…</button><button class="secondary dev-mats">Materials for every piece you can reach</button><button class="secondary dev-restore hidden">Restore my save</button>`;
    $('.dev-load', dev).addEventListener('click', () => void this.openDevPhases());
    $('.dev-mats', dev).addEventListener('click', () => {
      const reach = Math.max(...g.unlockedAreas.map((a) => AREAS.findIndex((x) => x.id === a) + 1));
      for (const gd of GEAR) if (gearArea(gd) <= reach) for (const [m, n] of Object.entries(gd.recipe) as [MaterialId, number][]) g.state.materials[m] += n;
      this.hooks.save();
      this.toast(`🧰 Added the materials to craft every piece from ${AREAS.slice(0, reach).length} area${reach === 1 ? '' : 's'}`);
    });
    const restore = $<HTMLButtonElement>('.dev-restore', dev);
    restore.addEventListener('click', () =>
      this.showModal('<h2>Restore your save?</h2><p>The phase you are playing is replaced by the save you had before loading one.</p>', [
        { label: 'Cancel', secondary: true },
        { label: 'Restore', action: () => void this.hooks.devRestore() },
      ]),
    );
    void this.hooks.hasDevBackup().then((has) => restore.classList.toggle('hidden', !has));
    body.appendChild(dev);
  }

  /** Settings → Dev → Progress: every area's start and end, recorded from a typical player's run (public/dev-presets.json). */
  private async openDevPhases(): Promise<void> {
    let presets: Record<string, unknown>;
    try {
      presets = (await (await fetch('./dev-presets.json')).json()) as Record<string, unknown>;
    } catch {
      this.toast('Could not load the progress phases');
      return;
    }
    const phase = (key: string): GameState | null => {
      const st = presets[key] ? deserialize(JSON.stringify(presets[key])) : null;
      if (!st) return null;
      // Keep your settings, skip the tutorial tips, and start fresh (no offline gains).
      st.settings = structuredClone(this.game.state.settings);
      for (const k of Object.keys(st.flags) as Array<keyof GameState['flags']>) st.flags[k] = true;
      st.lastSeen = Date.now();
      return st;
    };
    const summary = (key: string) => {
      const st = phase(key);
      if (!st) return '';
      const gm = new Game(st);
      const hunters = HUNTERS.filter((h) => st.hunters[h.id].recruited).length;
      return `Lv ${gm.levelOf('main')}${hunters ? ` · ${hunters} Hunter${hunters === 1 ? '' : 's'}` : ''}`;
    };
    const rows = AREAS.map((a) => {
      const btn = (key: string, label: string) =>
        presets[key] ? `<button class="secondary dev-phase" data-key="${key}"><b>${label}</b><small>${summary(key)}</small></button>` : `<button class="secondary" disabled><b>${label}</b><small>Not recorded</small></button>`;
      return `<div class="dev-row"><div class="dev-area">${a.icon} ${a.name}</div>${btn(`${a.id}-start`, 'Start')}${btn(`${a.id}-end`, 'Before Guardian')}</div>`;
    }).join('');
    this.showModal(`<h2>🛠️ Progress phases</h2><p>Loading one replaces the game you're playing; your own save is kept until you Restore it.</p><div class="dev-phases">${rows}</div>`, [{ label: 'Close', secondary: true }]);
    this.modal.querySelectorAll<HTMLButtonElement>('.dev-phase').forEach((b) =>
      b.addEventListener('click', () => {
        const st = phase(b.dataset.key!);
        if (st) void this.hooks.devPhase(st);
      }),
    );
  }

  // ---- Modals ----

  showModal(html: string, buttons: Array<{ label: string; secondary?: boolean; action?: () => void }>): void {
    this.modal.innerHTML = `<div class="modal-box">${html}<div class="buttons"></div></div>`;
    const wrap = $('.buttons', this.modal);
    this.lastPopup = performance.now();
    const close = () => {
      this.modal.classList.add('hidden');
      this.modalClose = null;
      this.lastPopup = performance.now(); // the gap before the next tip counts from when this one closes
    };
    for (const b of buttons) {
      const btn = el('button', b.secondary ? 'secondary' : '', b.label);
      btn.addEventListener('click', () => {
        close();
        b.action?.();
        this.refresh();
      });
      wrap.appendChild(btn);
    }
    this.modalClose = close;
    this.modal.classList.remove('hidden');
  }

  /** Closes the open modal, else the Hunter view (Android back button). Returns false if neither was open. */
  closeModal(): boolean {
    if (!this.modalClose) return this.closePicker() || this.closeEquipScreen() || this.closeHunterDetail() || this.setMenuFull(false);
    this.modalClose();
    return true;
  }

  /**
   * Welcome back: the gold gained while away and the materials from the furthest area hunted (up to six, with
   * dots when there's more). "Details" opens a full page with everything: all the materials and, area by
   * area, who hunted there, the monsters they slew and what it paid out.
   */
  showOffline(r: OfflineResult): void {
    const gained = (m: Partial<Record<MaterialId, number>>) => (Object.entries(m) as [MaterialId, number][]).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
    const all = gained(r.materials);
    // The furthest area that brought anything back (its materials are the newest and rarest).
    const order = (id: AreaId) => AREAS.findIndex((a) => a.id === id);
    const furthest = [...r.areas].filter((a) => gained(a.materials).length).sort((a, b) => order(b.area) - order(a.area))[0];
    const shown = (furthest ? gained(furthest.materials) : all).slice(0, 6);
    const matsHtml = shown.length
      ? `<div class="offline-mats">${shown
          .map(([m, n]) => `<div class="offline-mat" title="${materialDef(m).name}">${gemHtml(m)}<span>${materialDef(m).name}</span><b>+${fmt(n)}</b></div>`)
          .join('')}</div>${all.length > shown.length ? '<div class="offline-more" aria-label="More materials in Details">• • •</div>' : ''}`
      : '';
    this.showModal(
      `<h2>Welcome back!</h2>
       <p class="offline-times">Offline time: <b>${fmtTime(r.away)}</b><br>Max offline gains time: <b>${fmtTime(this.game.offlineCapSec())}</b></p>
       <div class="reward">+🪙 ${fmt(r.gold)}</div>
       ${matsHtml}
       ${r.loot.length ? `<p class="offline-loot">🎁 ${r.loot.length} piece${r.loot.length === 1 ? '' : 's'} of loot${r.loot.some((l) => l.salvaged) ? ` (${r.loot.filter((l) => l.salvaged).length} auto-salvaged)` : ''}</p>` : ''}
       ${r.knockouts > 0 ? '<p class="ko-tip">💫 Some Hunters were knocked out while you were away. See Details.</p>' : ''}
       <button class="buy offline-details-btn">Details</button>`,
      [{ label: 'Collect' }],
    );
    $('.offline-details-btn', this.modal).addEventListener('click', () => this.showOfflineDetails(r));
  }

  /** The full away report, on its own scrolling page: every material gained, then each area's breakdown. */
  private showOfflineDetails(r: OfflineResult): void {
    const gained = (m: Partial<Record<MaterialId, number>>) => (Object.entries(m) as [MaterialId, number][]).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
    const rows = r.areas
      .map((a) => {
        const name = (h: (typeof a.hunters)[number]) => (h === 'main' ? esc(mainName()) : `${wearerIcon(h)} ${hunterDef(h).name}`);
        const who = a.hunters.map(name).join(' + ');
        // Only Hunters that were actually knocked out get a count.
        const kos = a.hunters
          .filter((h) => (a.knockouts[h] ?? 0) > 0)
          .map((h) => `${name(h)} ×${fmt(a.knockouts[h]!)}`)
          .join(', ');
        const am = gained(a.materials)
          .map(([m, n]) => `<span class="am">${gemHtml(m)}${fmt(n)}</span>`)
          .join(' ');
        const loot = a.loot.length ? `<div>🎁 ${a.loot.map((l) => `${gearIcon(gearDef(l.gear))}${l.salvaged ? '♻️' : ''}`).join(' ')}</div>` : '';
        return `<div class="offline-area"><div><b>${areaDef(a.area).icon} ${areaDef(a.area).name}</b> <small>${who}</small></div><div>⚔️ ${fmt(a.kills)} monsters slain · 🪙 ${fmt(a.gold)}</div>${am ? `<div class="offline-area-mats">${am}</div>` : ''}${loot}${
          kos ? `<div class="knockouts">💫 Knocked out: ${kos}</div>` : ''
        }</div>`;
      })
      .join('');
    const mats = gained(r.materials)
      .map(([m, n]) => `<div class="offline-mat" title="${materialDef(m).name}">${gemHtml(m)}<span>${materialDef(m).name}</span><b>+${fmt(n)}</b></div>`)
      .join('');
    const RARITY_KEYS = Object.keys(RARITIES) as Rarity[];
    // Loot drops by piece, rarest first: the pieces kept, and apart from them the ones Auto Salvage turned into materials.
    const lootTiles = (salvaged: boolean): string => {
      const pieces = new Map<GearId, number>();
      for (const l of r.loot) if (l.salvaged === salvaged) pieces.set(l.gear, (pieces.get(l.gear) ?? 0) + 1);
      return [...pieces.entries()]
        .sort((a, b) => RARITY_KEYS.indexOf(gearDef(b[0]).rarity) - RARITY_KEYS.indexOf(gearDef(a[0]).rarity))
        .map(([id, n]) => {
          const gd = gearDef(id);
          return `<div class="offline-mat" style="--rc:${gearColor(id)}" title="${gd.name}">${gearIcon(gd)}<span style="color:var(--rc)">${gd.name}</span><b>×${n}</b></div>`;
        })
        .join('');
    };
    const loot = lootTiles(false);
    const salvaged = lootTiles(true);
    this.modal.innerHTML = `<div class="modal-box fullpage"><h2>While you were away</h2><div class="sheet-body">
      <p class="offline-total">${fmtTime(r.away)} away · 🪙 ${fmt(r.gold)} · ⚔️ ${fmt(r.kills)} monsters slain</p>
      ${mats ? `<h3>Materials</h3><div class="offline-mats all">${mats}</div>` : ''}
      ${loot ? `<h3>Loot drops</h3><div class="offline-mats all">${loot}</div>` : ''}
      ${salvaged ? `<h3>Salvaged equipment</h3><div class="offline-mats all">${salvaged}</div>` : ''}
      <h3>By area</h3><div class="offline-areas">${rows}</div>
      ${r.knockouts > 0 ? '<p class="ko-tip">Knocked-out Hunters stop fighting. Get stronger (or pick an easier area) to keep monsters from slipping through.</p>' : ''}
    </div><div class="buttons"></div></div>`;
    const close = () => {
      this.modal.classList.add('hidden');
      this.modalClose = null;
      this.lastPopup = performance.now();
      this.refresh();
    };
    const back = el('button', 'secondary', 'Back');
    back.addEventListener('click', () => this.showOffline(r));
    const collect = el('button', '', 'Collect');
    collect.addEventListener('click', close);
    $('.buttons', this.modal).append(back, collect);
    this.modalClose = close;
    this.modal.classList.remove('hidden');
  }
}

/** Equipment tiles drawn at a time (more follow as you scroll). */
const INV_PAGE = 48;

/** "≈ 🪙 1.2K/min · <gem>3 /min" for a stationed Hunter. */
function yieldHtml(r: FarmRates, where: string): string {
  const mats = (Object.entries(r.materials) as [MaterialId, number][])
    .filter(([, n]) => n * 60 >= 0.05)
    .map(([m, n]) => `${gemHtml(m)}${fmt(n * 60)}`)
    .join(' ');
  const down = Math.max(0, ...Object.values(r.stunned).map((x) => x ?? 0));
  const warn = down >= 0.05 ? `<div class="knockouts">💫 Stunned ${Math.round(down * 100)}% of the time: too weak for this area</div>` : '';
  return `<div class="yield">${where ? `${where}: ` : ''}≈ 🪙 ${fmt(r.gold * 60)}/min${mats ? ` · ${mats} /min` : ''}</div>${warn}`;
}

const STAT_LABELS: Record<GearStat, string> = {
  damage: 'damage',
  rate: 'attack rate',
  range: 'range',
  crit: 'crit',
  stun: 'stun time',
  guard: 'shield',
  gold: 'gold',
  drops: 'drops',
  radius: 'area size',
  pierce: 'pierce',
};

/** A difference in one stat, e.g. "+20% damage" or "−3 range". */
function statDelta(k: GearStat, d: number): string {
  const flat = k === 'range' || k === 'guard' || k === 'pierce';
  const v = flat ? Math.round(Math.abs(d)) : `${Math.round(Math.abs(d) * 100)}%`;
  const sign = k === 'stun' ? (d > 0 ? '−' : '+') : d > 0 ? '+' : '−';
  return `${sign}${v} ${STAT_LABELS[k]}`;
}

/** A piece of gear's full card; with `vs`, each stat shows how it compares to that piece. */
function gearCardHtml(it: GearItem, vs: GearItem | null = null): string {
  const gd = gearDef(it.base);
  const st = gearTotals(gd, it.stars);
  const other = vs ? gearTotals(gearDef(vs.base), vs.stars) : {};
  const keys = [...new Set([...Object.keys(st), ...(vs ? Object.keys(other) : [])])] as GearStat[];
  const lines = keys
    .map((k) => {
      const a = st[k] ?? 0;
      const b = other[k] ?? 0;
      const d = a - b;
      const shown = a !== 0 && describeGear({ [k]: a }) ? `<span class="${a < 0 ? 'penalty' : ''}">${describeGear({ [k]: a })}</span>` : `<s>no ${STAT_LABELS[k]}</s>`;
      const cmp = vs && Math.abs(d) > 1e-9 ? `<span class="${d > 0 ? 'up' : 'down'}">${d > 0 ? '▲' : '▼'} ${statDelta(k, d)}</span>` : '';
      return `<li>${shown}${cmp}</li>`;
    })
    .join('');
  // A weapon's base damage per hit comes first (compared with the weapon it would replace).
  const hit = weaponHit(gd, it.stars);
  const otherHit = vs ? weaponHit(gearDef(vs.base), vs.stars) : 0;
  // It sits beside the damage-type tags in the card's head.
  const hitHtml = hit
    ? `<b class="gc-dmg">${hitText(hit)}</b>${vs && otherHit && Math.abs(hit - otherHit) > 1e-9 ? `<span class="${hit > otherHit ? 'up' : 'down'}">${hit > otherHit ? '▲' : '▼'} ${Number(Math.abs(hit - otherHit).toFixed(2))}</span>` : ''}`
    : '';
  const all =
    lines +
    (gd.special
      ? `<li class="gc-effect">${specialText(gd)}</li>`
      : '') +
    (!gd.special && gearTypes(gd).length > 1
      ? `<li class="gc-effect">${gd.perShot ? `Each projectile deals one of its types in turn, at full damage` : `Each hit is split evenly between its ${gearTypes(gd).length} types`}</li>`
      : '') +
    (gd.typeBonus ? `<li class="gc-effect">${DAMAGE_TYPES[gd.typeBonus.type].icon} +${Math.round(gd.typeBonus.bonus * GEAR_STAR_POWER[it.stars] * 100)}% ${DAMAGE_TYPES[gd.typeBonus.type].name} damage</li>` : '') +
    // Built-in effects (always there), then the modifier slots: filled ones, then the empty ones.
    (gd.builtIn ?? [])
      .map((bi) => {
        const en = ENCHANTS[bi.id];
        const m: GearMod = { kind: 'enchant', id: bi.id, q: bi.q, p: bi.p };
        return `<li class="gc-builtin${isUniqueEnchant(en) ? ' unique' : ''}">${en.icon} ${en.name}: ${en.text(modValue(m, gd), modPower(m, gd), enchantTierHit(gd))}</li>`;
      })
      .join('') +
    (it.mods ?? []).filter(Boolean).map((m) => `<li class="gc-mod ${m!.kind}${modPerfect(m!) ? ' perfect' : ''}">${modText(m!, gd)}</li>`).join('') +
    `<li class="gc-mod gc-slot">◇ Empty modifier slot</li>`.repeat(Math.max(0, modSlotCount(gd) - (it.mods ?? []).filter(Boolean).length)) +
    (gd.effect ? `<li class="gc-effect">✨ ${describeEffect(gd.effect, it.stars)}</li>` : '') +
    (gd.bane ? `<li class="gc-effect">${ARCHETYPES[gd.bane.archetype].icon} +${Math.round(gd.bane.bonus * GEAR_STAR_POWER[it.stars] * 100)}% damage vs ${ARCHETYPES[gd.bane.archetype].name}s</li>` : '') +
    (gd.findDrop ? `<li class="gc-effect">💎 ${it.stars >= gd.findDrop.stars ? '' : `At ${gd.findDrop.stars}★: `}${gd.findDrop.chance * 100}% chance for ${materialDef(gd.findDrop.material).name} from ${ARCHETYPES[gd.findDrop.archetype].name.toLowerCase()} kills</li>` : '');
  return `<div class="gear-card rar" style="--rc:${gearColor(gd.id)}"><div class="gc-head"><i>${gearIcon(gd)}</i><div><b>${gd.name}</b><small>${RARITIES[gd.rarity].name} ${gearKindName(gd).toLowerCase()} · <span class="stars">${starsHtml(it.stars)}</span></small><div class="gc-typeline">${procTypeTags(gd)}${hitHtml}</div></div></div><ul class="gc-stats">${all}</ul></div>`;
}

/**
 * The menu screens' icons (Menu, Tutorials): free-standing item sprites only, never the framed ability-style icons,
 * so each screen keeps one look.
 */
const MENU_SPRITES = {
  tutorials: 'wands-books/062',
  journal: 'rpg-items/289',
  settings: 'custom/002',
  quit: 'things/024',
  weapons: 'weapons-free/001',
  damage: 'rpg-items/297',
  welcome: 'rpg-items/300',
  training: 'rpg-items/001',
  crafting: 'resources3/003',
  wolf: 'resources1/032',
  empower: 'custom/001',
  eventsLocked: 'resources3/029',
  events: 'instruments/033',
  timeEater: 'jewelry/042',
};

/** Sets the sound effect and music volumes from Settings' Audio card (a switched-off one plays at 0). */
function applyAudio(a: AudioSettings): void {
  const all = a.on ? a.master / 100 : 0;
  setSfxVolume(a.sfxOn ? all * (a.sfx / 100) : 0);
  setMusicVolume(a.musicOn ? all * (a.music / 100) : 0);
}

/** Your Hunter's name (Settings), shown on their card and wherever they're named. */
let mainHunterName = '';
const mainName = () => mainHunterName || 'You';
export const MAX_NAME_LENGTH = 16;

/** Escapes text typed by the player before it goes into HTML. */
/** A pixel sprite from public/icons ("<pack>/<NNN>"), drawn like an emoji's icon (the menu screens use these directly). */
function sprite(key: string): string {
  return `<img class="ei" src="${gearIconUrl(key)}" alt="" draggable="false">`;
}

/** A Journal entry's icon: a pixel icon ("<pack>/<NNN>") or an emoji. */
function journalIcon(e: JournalEntry): string {
  const url = /^[\w-]+\/\d+$/.test(e.icon) ? gearIconUrl(e.icon) : null;
  return url ? `<img class="px-icon" src="${url}" alt="">` : esc(e.icon);
}

/**
 * A Hunter's abilities (the Abilities section of their Overview): a framed box with each one on its own line (its name, whether it's
 * Active or Passive, and what it does), then the weapons they can use.
 */
function abilitiesHtml(def: HunterDef | null): string {
  const list = def ? hunterAbilities(def) : MAIN_ABILITIES;
  const uses = def ? hunterWeaponsNote(def) : '';
  return `<div class="hero-abilities">${list
    .map((a) => `<div class="ha-row"><span class="ha-kind ${a.kind}">${a.kind === 'active' ? 'Active' : 'Passive'}</span><p><b class="ha-name">${a.name}:</b> ${a.text}</p></div>`)
    .join('')}${uses ? `<div class="ha-uses">${uses}</div>` : ''}</div>`;
}

function esc(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}


/** A piece's kind for display: its weapon class ("Longbow") or its gear kind ("Armor"). */
const gearKindName = (gd: GearDef): string => (gd.weaponClass ? weaponArchetype(gd)!.name : gd.armorType ? `${ARMOR_TYPES[gd.armorType].icon} ${ARMOR_TYPES[gd.armorType].name}` : GEAR_KINDS[gd.kind].name);

/** How a weapon attacks (for your Hunter), what an armor kind is good at, and any special effect (at `stars`). */
/** How a weapon differs from the rest of its class (its stabs, a staff's bolts, a focus's wave). */
function tweakText(gd: GearDef): string {
  const t = gd.tweak!;
  const parts: string[] = [];
  if (t.thrusts) parts.push(`${t.thrusts} stabs per attack (or daggers thrown)${t.rate && t.rate < 1 ? ', but slower' : t.rate && t.rate > 1 ? ', and faster' : ''}`);
  else if (t.rate) parts.push(`${t.rate < 1 ? 'Slower' : 'Faster'} attacks`);
  if (t.bolts) parts.push(`${t.bolts} bolts before its big spell`);
  if (t.wave) parts.push('Sends out a wave that travels twice as far, hitting monsters as it passes, instead of bursting around you');
  return parts.join('; ');
}

/** Short names for gear effects, for their tags (the full text is in the tag's popup). */
const EFFECT_TAG: Record<NonNullable<GearDef['effect']>['kind'], string> = { thorns: 'Thorns', block: 'Shield Burst', evade: 'Evasion', pulse: 'Pulse', summon: 'Summoner', wave: 'Wave', strike: 'Lightning Strike', chill: 'Chill Aura', spell: 'Spell', unique: 'Unique' };

/** Keeps a row of tiles to two lines: the tiles past them are hidden and the last one shown becomes "...". */
function foldChips(box: HTMLElement | null): void {
  if (!box) return;
  const tiles = Array.from(box.children) as HTMLElement[];
  tiles.forEach((t) => t.classList.remove('folded'));
  box.querySelector('.eq-more')?.remove();
  // Which line a tile sits on, by its middle (tiles on one line differ in height, so their tops differ too).
  const mid = (t: HTMLElement) => t.offsetTop + t.offsetHeight / 2;
  const lines: number[] = [];
  for (const m of tiles.map(mid).sort((a, b) => a - b)) if (!lines.length || m - lines[lines.length - 1] > 8) lines.push(m);
  if (lines.length <= 2) return;
  const limit = lines[1] + 8;
  const shown = tiles.filter((t) => mid(t) <= limit);
  tiles.filter((t) => mid(t) > limit).forEach((t) => t.classList.add('folded'));
  const more = el('span', 'eq-chip eq-more', '...');
  box.appendChild(more);
  // Make room for it on the second line.
  for (let i = shown.length - 1; i > 0 && mid(more) > limit; i--) shown[i].classList.add('folded');
}

/** A tag naming one of a piece's features (`icon`: a tag icon key); tapping it opens a popup with `tip` (HTML) in full. */
function featTag(icon: string, name: string, tip: string, color = 'var(--gold)', cls = ''): string {
  return `<button type="button" class="dtype-tag feat-tag${cls}" style="--dc:${color}" data-tip="${esc(tip)}"><span class="ic">${tagIconHtml(icon)}</span>${name}</button>`;
}

/** The short name for how a weapon differs from the rest of its class. */
function tweakName(gd: GearDef): string {
  const t = gd.tweak!;
  return t.thrusts ? 'Flurry' : t.bolts ? 'Bolts' : t.wave ? 'Wave Focus' : t.rate && t.rate < 1 ? 'Slow' : 'Quick';
}

/**
 * Everything a piece does beyond its stats, as tappable tags (like a monster's elements): its damage types (how it
 * splits them, their status effects), its weapon class and tweaks, armor kind, own abilities, bane and finds (at
 * `stars`). Each tag's popup has the full description.
 */
function featureTags(gd: GearDef, stars = 1): string {
  const tags: string[] = [];
  const types = gearTypes(gd);
  if (gd.special) tags.push(featTag(SPECIAL_TAG_ICON, SPECIAL_TYPE.name, specialText(gd), SPECIAL_TYPE.color, ' special-type'));
  else
    for (const t of types) {
      const d = DAMAGE_TYPES[t];
      const how =
        types.length === 1
          ? `Deals <b>${d.name}</b> damage.`
          : gd.perShot
            ? `Each projectile deals one of its types in turn, at full damage: ${types.map((x) => DAMAGE_TYPES[x].name).join(', ')}.`
            : `Each hit is split evenly between its ${types.length} types: ${types.map((x) => DAMAGE_TYPES[x].name).join(', ')}.`;
      const proc = gd.proc && d.effect ? `<br><b>${Math.round(gd.proc * 100)}%</b> chance per hit · ${d.effect}` : '';
      tags.push(featTag(DAMAGE_TAG_ICONS[t], d.name, how + proc, d.color));
    }
  if (gd.typeBonus) {
    const d = DAMAGE_TYPES[gd.typeBonus.type];
    const pct = Math.round(gd.typeBonus.bonus * GEAR_STAR_POWER[stars] * 100);
    tags.push(featTag(DAMAGE_TAG_ICONS[gd.typeBonus.type], `+${pct}% ${d.name}`, `+${pct}% ${d.name} damage, whatever deals it.`, d.color));
  }
  if (gd.weaponClass) tags.push(featTag(FEATURE_TAG_ICONS.weapon, WEAPON_CLASSES[gd.weaponClass].name, WEAPON_CLASSES[gd.weaponClass].describe));
  // Its archetype, when it isn't the standard one: what this take on the class trades.
  if (gd.weaponClass && gd.archetype) {
    const a = weaponArchetype(gd)!;
    tags.push(featTag(FEATURE_TAG_ICONS.archetype, a.name, `<b>${a.name}</b>, a kind of ${WEAPON_CLASSES[gd.weaponClass].name.toLowerCase()}: ${a.desc}`));
  }
  // Built-in effects: always on the piece, at fixed rolls (a unique one on Artifact and Exalted gear).
  for (const bi of gd.builtIn ?? []) {
    const en = ENCHANTS[bi.id];
    const m = { kind: 'enchant' as const, id: bi.id, q: bi.q, p: bi.p };
    const text = en.text(modValue(m, gd), modPower(m, gd), enchantTierHit(gd));
    tags.push(featTag(isUniqueEnchant(en) ? EFFECT_TAG_ICONS.unique : FEATURE_TAG_ICONS.builtIn, en.name, `<b>${isUniqueEnchant(en) ? 'Unique' : 'Built-in'}</b>: ${text.charAt(0).toUpperCase()}${text.slice(1)}.`, isUniqueEnchant(en) ? '#ff8ad0' : 'var(--gold)'));
  }
  if (gd.tweak) tags.push(featTag(FEATURE_TAG_ICONS.tweak, tweakName(gd), tweakText(gd)));
  const spell = staffSpell(gd);
  if (spell) tags.push(featTag(FEATURE_TAG_ICONS.spell, SPELLS[spell].name, `After its bolts, this staff casts <b>${SPELLS[spell].name}</b>: ${SPELLS[spell].desc}`));
  if (gd.weaponClass === 'tome') {
    const st = SUMMON_TYPES[tomeSummonType(gd)];
    tags.push(featTag(SUMMON_TAG_ICONS[tomeSummonType(gd)], st.name, `Summon type: <b>${st.name}</b>. Bonuses to ${st.name} summons make its creatures hit harder.`));
  }
  if (gd.armorType) tags.push(featTag(ARMOR_TAG_ICONS[gd.armorType], ARMOR_TYPES[gd.armorType].name, ARMOR_TYPES[gd.armorType].desc));
  if (gd.ability) tags.push(featTag(FEATURE_TAG_ICONS.ability, 'Ability', gd.ability));
  if (gd.effect)
    tags.push(featTag(gd.effect.kind === 'summon' ? SUMMON_TAG_ICONS[gd.effect.type] : EFFECT_TAG_ICONS[gd.effect.kind], gd.effect.kind === 'summon' ? `${gd.effect.name}s` : EFFECT_TAG[gd.effect.kind], `${describeEffect(gd.effect, stars)}${'base' in gd.effect ? '<br><small>Own damage, raised by your bonuses, not your weapon.</small>' : ''}`));
  if (gd.bane) {
    const a = ARCHETYPES[gd.bane.archetype];
    tags.push(featTag(ARCHETYPE_TAG_ICONS[gd.bane.archetype], `${a.name} Bane`, `+${Math.round(gd.bane.bonus * GEAR_STAR_POWER[stars] * 100)}% damage against ${a.name}s.`));
  }
  if (gd.findDrop) {
    const f = gd.findDrop;
    tags.push(featTag(FEATURE_TAG_ICONS.finder, 'Finder', `At ${f.stars}★: your ${ARCHETYPES[f.archetype].name.toLowerCase()} kills have a ${f.chance * 100}% chance to drop ${materialDef(f.material).name}${stars >= f.stars ? '.' : ` (now ${stars}★).`}`));
  }
  return tags.length ? `<div class="feat-tags">${tags.join('')}</div>` : '';
}

/** Tapping a feature tag opens its popup just under it; the next tap anywhere closes it. */
if (typeof document !== 'undefined')
  document.addEventListener(
    'click',
    (e) => {
      const old = document.querySelector<HTMLElement>('.feat-tip');
      const tag = (e.target as HTMLElement).closest?.<HTMLElement>('.feat-tag');
      if (old) {
        old.remove();
        if (!tag || old.dataset.for === tag.dataset.tip) {
          e.stopPropagation();
          e.preventDefault();
          return;
        }
      }
      if (!tag) return;
      e.stopPropagation();
      e.preventDefault();
      const tip = document.createElement('div');
      tip.className = 'feat-tip';
      tip.dataset.for = tag.dataset.tip ?? '';
      tip.style.setProperty('--dc', tag.style.getPropertyValue('--dc'));
      tip.innerHTML = `<b>${tag.innerHTML}</b><p>${tag.dataset.tip ?? ''}</p>`;
      document.body.appendChild(tip);
      const r = tag.getBoundingClientRect();
      const w = tip.offsetWidth;
      const h = tip.offsetHeight;
      const left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2));
      const top = r.bottom + 6 + h > window.innerHeight - 8 ? r.top - h - 6 : r.bottom + 6;
      Object.assign(tip.style, { left: `${left}px`, top: `${top}px` });
    },
    true,
  );

/** What counts toward unlocking an event: its archetype ("slimes") or any monster. */
/** The intro line for a minigame that blesses Refine or Enchant: its score tiers and what they do. */
function blessingIntro(g: Game, ev: EventDef): string {
  const b = ev.blessing!;
  const what = b.kind === 'refine' ? 'Refine' : 'Enchant';
  return `✨ Score ${b.tiers.join(' / ')} to bless your next ${what} with 1 / 2 / 3 extra rolls: ${b.tiers.map((_, i) => `${Math.round(g.perfectChance(i + 1) * 100)}%`).join(' / ')} perfect a roll instead of ${Math.round(g.perfectChance(0) * 100)}%.`;
}

/** A minigame's rewards in words: gold, then each material. */
function rewardText(r: { gold: number; materials: Partial<Record<MaterialId, number>> }): string {
  return [`🪙 ${fmt(r.gold)}`, ...Object.entries(r.materials).map(([m, n]) => `${gemHtml(m as MaterialId)} ${fmt(n!)} ${materialDef(m as MaterialId).name}`)].join(' · ');
}

const unlockNoun = (ev: EventDef): string => (ev.unlockArchetype ? `${ARCHETYPES[ev.unlockArchetype].name.toLowerCase()}s` : 'monsters');

/** How many not-yet-recruited Hunters the Hunters tab shows. */
const NEXT_HUNTERS_SHOWN = 3;

/** What a Hunter needs before they can be recruited, e.g. "Beat the Restless Graveyard Guardian (1/2)". */
function unlockText(g: Game, def: HunterDef): string {
  const ev = eventDef(def.unlock.event);
  const done = Math.min(g.eventCompletions(ev.id), def.unlock.times);
  const count = def.unlock.times > 1 ? ` ${def.unlock.times} times (${done}/${def.unlock.times})` : '';
  const what = ev.kind === 'guardian' ? `Beat the ${areaDef(ev.area).name} Guardian` : `Survive a ${ev.name} in the ${areaDef(ev.area).name}`;
  return `${what}${count}`;
}

/** A Hunter's art: their sprite if one was added, otherwise their icon on their colour. */
function portraitHtml(who: Wearer, size = ''): string {
  const url = spriteUrl(who === 'main' ? 'hunter' : `hunters/${who}`);
  const color = who === 'main' ? '#7c5cff' : hunterDef(who).color;
  return `<div class="hunter-art ${size}" style="--hc:${color}">${url ? `<img src="${url}" alt="">` : `<span>${wearerIcon(who)}</span>`}</div>`;
}

/** Rarities from commonest to rarest. */
const RARITY_ORDER = Object.keys(RARITIES) as Rarity[];

/** How long the "Equip?" button stays up after crafting a piece. */
const EQUIP_PROMPT_SECONDS = 6;

function wearerName(who: Wearer): string {
  return who === 'main' ? esc(mainName()) : hunterDef(who).name;
}

function wearerIcon(who: Wearer): string {
  return hunterIconHtml(who);
}

/** Material cost list; with `check`, amounts you can't afford are highlighted. */
/** Swells the Hunter or monster card holding `from` for a moment (restarting if it's already mid-bump). */
function bumpCard(from: HTMLElement): void {
  const card = from.closest<HTMLElement>('.hunter-card, .beast');
  if (!card) return;
  card.classList.remove('bump');
  void card.offsetWidth; // restart the animation on rapid taps
  card.classList.add('bump');
  card.addEventListener('animationend', () => card.classList.remove('bump'), { once: true });
}

/** What a monster drops (both materials when it has two), and whether it can carry gear. */
function dropsText(e: EnemyDef): string {
  // Rarer drops are tagged with how rare they are (a golem's Obsidian, Iron Ore...).
  const extra = enemyExtraDrops(e).map((d) => {
    const r = dropRarity(d.share);
    return `${gemHtml(d.material)} <b>${materialDef(d.material).name}</b>${r === 'common' ? '' : ` <small style="color:${RARITIES[r].color}">(${RARITIES[r].name})</small>`}`;
  });
  const all = [`${gemHtml(e.material)} <b>${materialDef(e.material).name}</b>`, ...extra];
  const mats = all.length > 2 ? `${all.slice(0, -1).join(', ')} and ${all[all.length - 1]}` : all.join(' and ');
  return `Drops ${mats}${lootChance(e.id) > 0 ? ' · 🎁 can carry gear' : ''}`;
}

/** A monster's tags: Flying (passes over the scenery) and Ranged (shoots from afar). */
function beastTags(def: EnemyDef): string {
  const tags = [FLYING.has(def.id) ? '<span class="beast-tag flying" title="Flies over rocks, trees and graves">Flying</span>' : '', def.ranged ? '<span class="beast-tag ranged" title="Shoots projectiles from afar">Ranged</span>' : ''];
  return tags.join('');
}

/** A monster's drops, one per line (rarer ones tagged with how rare), and whether it can carry gear. */
function dropListHtml(e: EnemyDef): string {
  const rows = [`<div class="lore-drop">${gemHtml(e.material)}<b>${materialDef(e.material).name}</b></div>`];
  for (const d of enemyExtraDrops(e)) {
    const r = dropRarity(d.share);
    rows.push(`<div class="lore-drop">${gemHtml(d.material)}<b>${materialDef(d.material).name}</b>${r === 'common' ? '' : `<small style="color:${RARITIES[r].color}">${RARITIES[r].name}</small>`}</div>`);
  }
  if (lootChance(e.id) > 0) rows.push('<div class="lore-drop lore-gear">Can also carry gear</div>');
  return rows.join('');
}

function dropHtml(e: EnemyDef): string {
  return `<div class="drop-line">${dropsText(e)}</div>`;
}

/**
 * An enemy's weaknesses and resistances as damage-type tags: a row each, or (`compact`, for cards) both on a
 * single row of icon chips.
 */
function affinityHtml(e: EnemyDef, compact = false): string {
  const tag = compact ? damageTypeChip : damageTypeHtml;
  const row = (label: string, cls: string, types: DamageType[]) =>
    types.length ? `<div class="aff ${cls}"><span class="aff-label">${label}</span>${types.map(tag).join('')}</div>` : '';
  return compact
    ? `<div class="affinities compact">${row('Weak', 'weak', e.weak)}${row('Resists', 'resist', e.resist)}</div>`
    : `<div class="affinities">${row(`Weak ×${WEAK_MULT}`, 'weak', e.weak)}${row(`Resists ×${RESIST_MULT}`, 'resist', e.resist)}</div>`;
}

/** A damage type tag whose name can be hidden (icon only) when its row runs out of room. */
function damageTypeChip(t: DamageType): string {
  const d = DAMAGE_TYPES[t];
  return `<span class="dtype-tag" style="--dc:${d.color}" title="${d.name}"><span class="ic">${tagIconHtml(DAMAGE_TAG_ICONS[t])}</span><span class="dt-name">${d.name}</span></span>`;
}

/** Shows a compact affinity row with names if it fits on one line, else icons only. */
function fitAffinities(rows: HTMLElement[]): void {
  // All the writes, then all the reads, then the writes again: one layout for the lot, not one per row.
  for (const row of rows) row.classList.remove('icons');
  const over = rows.map((row) => row.clientWidth > 0 && row.scrollWidth > row.clientWidth + 1);
  rows.forEach((row, i) => over[i] && row.classList.add('icons'));
}

/**
 * Keeps every compact affinity row fitted: when it appears and whenever its width changes (the observer reports
 * new rows once laid out, all in one batch), and when the font changes.
 */
const affinityResize = typeof ResizeObserver !== 'undefined' ? new ResizeObserver((entries) => fitAffinities(entries.map((e) => e.target as HTMLElement))) : null;
function refitAffinities(): void {
  fitAffinities(Array.from(document.querySelectorAll<HTMLElement>('.affinities.compact')));
}
/**
 * The square of an icon that holds its visible pixels (icons carry transparent margins), as fractions of its size,
 * found once per image.
 */
const iconCrops = new Map<string, Promise<{ x: number; y: number; side: number; solid: number } | null>>();
function iconCrop(img: HTMLImageElement): Promise<{ x: number; y: number; side: number; solid: number } | null> {
  let crop = iconCrops.get(img.src);
  if (!crop) {
    crop = (img.complete ? Promise.resolve() : new Promise<void>((done) => img.addEventListener('load', () => done(), { once: true })))
      .then(() => {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        if (!w || !h) return null;
        const cv = document.createElement('canvas');
        cv.width = w;
        cv.height = h;
        const cx = cv.getContext('2d', { willReadFrequently: true })!;
        cx.drawImage(img, 0, 0);
        const px = cx.getImageData(0, 0, w, h).data;
        let x0 = w, y0 = h, x1 = -1, y1 = -1, filled = 0;
        for (let y = 0; y < h; y++)
          for (let x = 0; x < w; x++)
            if (px[(y * w + x) * 4 + 3] > 16) {
              filled++;
              if (x < x0) x0 = x;
              if (x > x1) x1 = x;
              if (y < y0) y0 = y;
              if (y > y1) y1 = y;
            }
        if (x1 < 0) return null;
        const side = Math.max(x1 - x0 + 1, y1 - y0 + 1);
        // `solid`: how much of its visible box is painted (a framed icon fills it; a sprite has gaps).
        return { x: ((x0 + x1 + 1) / 2 - side / 2) / w, y: ((y0 + y1 + 1) / 2 - side / 2) / h, side: side / Math.max(w, h), solid: filled / ((x1 - x0 + 1) * (y1 - y0 + 1)) };
      })
      .catch(() => null);
    iconCrops.set(img.src, crop);
  }
  return crop;
}

/**
 * Icon buttons (sub-tabs, Filter, Tap Ability and Modify buttons): their leading icon goes in a well of its own,
 * which it fills edge to edge (cropped like a tag's), with the button art's outline lying over it and rounding its
 * corners. The well is added as the icon appears, whichever code drew the button.
 */
const ICON_BUTTONS = '.subtabs button, .filter-btn, .ab-equip, .mod-action > b';
function wellIcon(img: HTMLImageElement): void {
  const host = img.parentElement;
  if (!host || !host.matches(ICON_BUTTONS) || host.firstElementChild !== img || (img.previousSibling && img.previousSibling.textContent?.trim())) return;
  const well = document.createElement('span');
  well.className = 'ic btn-ic';
  host.insertBefore(well, img);
  well.appendChild(img);
  // A sprite with empty margins is cropped to fill the well; an icon painted edge to edge (its own square, like
  // the Filter gears) sits just inside the frame instead, so the frame doesn't cover its edges.
  void iconCrop(img).then((c) => {
    if (!c) return;
    if (c.solid < 0.9) fillTagIcon(img);
    else well.classList.add('full');
  });
}
if (typeof MutationObserver !== 'undefined' && typeof document !== 'undefined')
  new MutationObserver((muts) => {
    for (const m of muts)
      m.addedNodes.forEach((n) => {
        if (!(n instanceof HTMLElement)) return;
        if (n.matches('img.ei')) wellIcon(n as HTMLImageElement);
        else n.querySelectorAll<HTMLImageElement>('img.ei').forEach(wellIcon);
      });
  }).observe(document.body, { childList: true, subtree: true });

/** Fills a tag's icon box with the icon's visible pixels, edge to edge. */
function fillTagIcon(img: HTMLImageElement): void {
  void iconCrop(img).then((c) => {
    if (!c) return;
    const scale = 100 / c.side;
    Object.assign(img.style, { position: 'absolute', width: `${scale}%`, height: `${scale}%`, left: `${-c.x * scale}%`, top: `${-c.y * scale}%`, maxWidth: 'none' });
  });
}
if (typeof MutationObserver !== 'undefined' && typeof document !== 'undefined')
  new MutationObserver((muts) => {
    for (const m of muts)
      m.addedNodes.forEach((n) => {
        if (!(n instanceof HTMLElement)) return;
        // Tags only: icon buttons' wells decide for themselves (see wellIcon).
        if (n.matches('.ic:not(.btn-ic) > img.ei')) fillTagIcon(n as HTMLImageElement);
        else n.querySelectorAll<HTMLImageElement>('.ic:not(.btn-ic) > img.ei').forEach(fillTagIcon);
      });
  }).observe(document.body, { childList: true, subtree: true });

if (typeof MutationObserver !== 'undefined' && typeof document !== 'undefined')
  new MutationObserver((muts) => {
    for (const m of muts)
      m.addedNodes.forEach((n) => {
        if (!(n instanceof HTMLElement)) return;
        const rows = n.matches('.affinities.compact') ? [n] : Array.from(n.querySelectorAll<HTMLElement>('.affinities.compact'));
        if (affinityResize) rows.forEach((row) => affinityResize.observe(row));
        else fitAffinities(rows);
      });
  }).observe(document.body, { childList: true, subtree: true });

/** A piece's modifier slots (Very Rare and up): what each holds, or that it's empty. */
function modSlotsHtml(g: Game, uid: number): string {
  const item = g.gearItem(uid);
  const slots = g.modSlots(uid);
  if (!item || !slots.length) return '';
  const gd = gearDef(item.base);
  return `<div class="mod-slots"><div class="filter-label">Modifiers</div>${slots
    .map((m) => `<div class="mod-slot${m ? ' full' : ''}${m && modPerfect(m) ? ' perfect' : ''}">${m ? `${modText(m, gd)}${modPerfect(m) ? ' <em class="perfect-tag">Perfect</em>' : ''}` : '<i>Empty slot</i>'}</div>`)
    .join('')}${g.refineOpen || g.enchantOpen ? '' : '<p class="refine-note">Recruit Kargesh the Blacksmith (Ember Mines) to Refine, or Marceline the Enchantress (Venom Caverns) to Enchant.</p>'}</div>`;
}

/**
 * A roll's reveal, like the battlefield's RELOADING! / RECHARGING! text in reverse: a choice box appears from left
 * to right over 0.8s, and its edge sheds pixels (metal and sparks falling for Refine, magic rising for Enchant).
 */
const REVEAL_PIXELS = {
  refine: ['#8a8f96', '#c4c8cc', '#5a5f66', '#ff3a2a', '#ff7a3a'],
  enchant: ['#ffffff', '#ffd34d', '#e8a800', '#5ab0ff', '#9fd8ff'],
};
function revealWithPixels(box: HTMLElement, palette: string[], fall: 1 | -1, done: () => void): void {
  const host = box.parentElement ?? box;
  const start = performance.now();
  const ms = 800;
  const step = (now: number) => {
    if (!box.isConnected) return;
    const p = Math.min(1, (now - start) / ms);
    box.style.clipPath = `inset(-6px ${(1 - p) * 100}% -6px -6px)`;
    // Pixels break off the moving edge, all the way down the box.
    const hb = host.getBoundingClientRect();
    const bb = box.getBoundingClientRect();
    const edge = bb.left - hb.left + bb.width * p;
    for (let i = 0; i < 4 && p < 1; i++) {
      const px = document.createElement('i');
      px.className = 'roll-px';
      const size = 2 + Math.random() * 3;
      Object.assign(px.style, { left: `${edge - Math.random() * 6}px`, top: `${bb.top - hb.top + Math.random() * bb.height}px`, width: `${size}px`, height: `${size}px`, background: palette[(Math.random() * palette.length) | 0] });
      host.appendChild(px);
      const dx = (Math.random() - 0.5) * 30;
      const dy = fall * (14 + Math.random() * 30);
      px.animate([{ transform: 'translate(0,0)', opacity: 1 }, { transform: `translate(${dx}px, ${dy}px)`, opacity: 0 }], { duration: 450 + Math.random() * 300, easing: fall > 0 ? 'cubic-bezier(.4,0,1,1)' : 'ease-out' }).onfinish = () => px.remove();
    }
    if (p < 1) requestAnimationFrame(step);
    else {
      box.style.clipPath = '';
      setTimeout(done, 200);
    }
  };
  box.style.clipPath = 'inset(-6px 100% -6px -6px)';
  requestAnimationFrame(step);
}

/** A modifier in words, with its icon (its rolled value on this piece). */
function modText(m: GearMod, gd: GearDef): string {
  const v = modValue(m, gd);
  return m.kind === 'refine' ? `${REFINES[m.stat].icon} ${REFINES[m.stat].text(v)}` : `${ENCHANTS[m.id].icon} ${ENCHANTS[m.id].name}: ${ENCHANTS[m.id].text(v, modPower(m, gd), enchantTierHit(gd))}`;
}

/**
 * A weapon's damage types as tags with the chance each sets off its status effect ("Decay 21%"); tapping one
 * explains the effect. The Elemental Cataclysm's Special tag stays as it is.
 */
function procTypeTags(gd: GearDef): string {
  if (gd.special) return specialTypeHtml();
  return gearTypes(gd)
    .map((t) => {
      const d = DAMAGE_TYPES[t];
      const pct = gd.proc && d.effect ? Math.round(gd.proc * 100) : 0;
      const tip = d.effect ? `${pct ? `${pct}% chance each hit to set off its effect` : "This weapon doesn't set off its effect"}: <b>${d.effect}</b>.` : `${d.name} damage.`;
      return `<button type="button" class="dtype-tag feat-tag" style="--dc:${d.color}" data-tip="${esc(tip)}"><span class="ic">${tagIconHtml(DAMAGE_TAG_ICONS[t])}</span>${d.name}${pct ? `<span class="pct">${pct}%</span>` : ''}</button>`;
    })
    .join('');
}

/** A weapon's damage type as a small coloured tag ('' for gear without one). */
function dtypeTag(gd: GearDef): string {
  return gd.special ? specialTypeHtml() : gearTypes(gd).map(damageTypeHtml).join('');
}

/** What a Special weapon does with its many elements, in words. */
function specialText(gd: GearDef): string {
  const types = gearTypes(gd);
  return `${SPECIAL_TYPE.icon} Special: ${gd.perShot ? 'each projectile deals the next element in turn' : 'its hits split between its elements'} (${types.map((t) => DAMAGE_TYPES[t].icon).join('')}), starting with ${DAMAGE_TYPES[types[0]].name}${gd.proc ? `; each can trigger its status effect (${Math.round(gd.proc * 100)}% chance)` : ''}`;
}

/** The Special damage type's tag (weapons that change elements, or deal too many to list). */
function specialTypeHtml(): string {
  return `<span class="dtype-tag special-type" style="--dc:${SPECIAL_TYPE.color}"><span class="ic">${tagIconHtml(SPECIAL_TAG_ICON)}</span>${SPECIAL_TYPE.name}</span>`;
}

/** A damage type's tag icon on its own, in its colour's frame (the status effect rows in Settings). */
function fxIcon(t: DamageType): string {
  return `<span class="fx-ic" style="--dc:${DAMAGE_TYPES[t].color}">${tagIconHtml(DAMAGE_TAG_ICONS[t])}</span>`;
}

function damageTypeHtml(t: DamageType): string {
  const d = DAMAGE_TYPES[t];
  return `<span class="dtype-tag" style="--dc:${d.color}"><span class="ic">${tagIconHtml(DAMAGE_TAG_ICONS[t])}</span>${d.name}</span>`;
}

/** A recipe as one line per material: its gem and name, and how many you hold of how many it takes; gold last. */
function recipeHtml(g: Game, cost: Partial<Record<MaterialId, number>>, gold = 0): string {
  return (
    (Object.entries(cost) as [MaterialId, number][])
      .map(([m, n]) => `<div class="fc-mat${g.state.materials[m] < n ? ' short' : ''}">${gemHtml(m)}<span>${materialDef(m).name}</span><b>${fmt(g.state.materials[m])} / ${fmt(n)}</b></div>`)
      .join('') + (gold > 0 ? `<div class="fc-mat${g.state.gold < gold ? ' short' : ''}"><span class="gem">🪙</span><span>Gold</span><b>${fmt(g.state.gold)} / ${fmt(gold)}</b></div>` : '')
  );
}

/** One gear stat's value on its own (the stat's name goes in its row's label): "+20%", "−9%", "+2". */
function statValue(k: GearStat, v: number): string {
  const sign = (x: number) => (x < 0 ? '−' : '+');
  switch (k) {
    case 'range':
      return `${sign(v)}${Math.round(Math.abs(v))}`;
    case 'guard':
    case 'pierce':
      return `${sign(v)}${Math.floor(Math.abs(v))}`;
    case 'stun':
      return `${v > 0 ? '−' : '+'}${Math.round(Math.abs(v) * 100)}%`;
    default:
      return `${sign(v)}${Math.round(Math.abs(v) * 100)}%`;
  }
}

/**
 * A piece's stats as a table, one stat per row and one column per star count (e.g. 1★ and 5★, or Now and Next),
 * its ability's own damage last. Empty when the piece raises nothing.
 */
function statTable(gd: GearDef, cols: Array<{ label: string; stars: number }>): string {
  const totals = cols.map((c) => gearTotals(gd, c.stars));
  const keys = BONUS_FILTERS.map((b) => b.id).filter((k) => totals.some((t) => (t[k] ?? 0) !== 0));
  const rows = keys.map((k) => `<div class="st-row"><span>${BONUS_FILTERS.find((b) => b.id === k)!.name}</span>${totals.map((t) => `<b>${statValue(k, t[k] ?? 0)}</b>`).join('')}</div>`);
  // A weapon's own hit damage grows with its stars too.
  if (gd.weaponClass) rows.unshift(`<div class="st-row"><span>Hit damage</span>${cols.map((c) => `<b>${fmt(weaponHit(gd, c.stars))}</b>`).join('')}</div>`);
  if (gd.effect && 'base' in gd.effect)
    rows.push(`<div class="st-row"><span>${gd.effect.kind === 'summon' ? 'Summon' : 'Ability'} damage</span>${cols.map((c) => `<b>${fmt(effectBase(gd.effect!, c.stars))}</b>`).join('')}</div>`);
  if (!rows.length) return '';
  return `<div class="stat-table" style="--cols:${cols.length}"><div class="st-row st-head"><span></span>${cols.map((c) => `<b>${c.label}</b>`).join('')}</div>${rows.join('')}</div>`;
}

/** Lines that read top to bottom: a label on the left, its text on the right. */
function lineTable(rows: Array<[string, string]>): string {
  return `<div class="stat-table" style="--cols:1">${rows.map(([k, v]) => `<div class="st-row"><span>${k}</span><b>${v}</b></div>`).join('')}</div>`;
}

function costHtml(g: Game, cost: Partial<Record<MaterialId, number>>, check = true): string {
  return (Object.entries(cost) as [MaterialId, number][])
    .map(([m, n]) =>
      check ? `<span class="${g.state.materials[m] < n ? 'short' : ''}">${gemHtml(m)}${fmt(g.state.materials[m])}/${fmt(n)}</span>` : `<span>${gemHtml(m)}${fmt(n)}</span>`,
    )
    .join('');
}

const CLASS_ICONS: Record<WeaponClass, string> = {
  dagger: '🗡️',
  sword: '⚔️',
  glaive: '🪓',
  spear: '🔱',
  hammer: '🔨',
  shortbow: '🏹',
  longbow: '🏹',
  crossbow: '🎯',
  pistol: '🔫',
  rifle: '🔫',
  repeater: '💥',
  wand: '🪄',
  scepter: '🪬',
  staff: '🪵',
  focus: '💎',
  tome: '📖',
};

/** The status effect each damage type inflicts. */
const STATUS_NAMES: Partial<Record<DamageType, string>> = {
  physical: 'Bleeding',
  fire: 'Burning',
  acid: 'Acid puddle',
  frost: 'Chilled',
  radiant: 'Radiant burst',
  poison: 'Poisoned',
  arcane: 'Exposed',
  decay: 'Decay aura',
  lightning: 'Arcing',
  void: 'Gravity well',
};

/** Short, player-facing traits of a weapon type for the Tutorials page. */
function weaponTraits(c: WeaponClassDef): string[] {
  const speed = (r: number) => (r >= 1.3 ? 'Very fast' : r >= 1 ? 'Fast' : r >= 0.75 ? 'Steady' : r >= 0.55 ? 'Slow' : 'Very slow');
  const knock = (k: number) => (k >= 300 ? 'Extreme' : k >= 180 ? 'Strong' : 'Light');
  const out: string[] = [];
  if (c.summon) out.push(`🐾 Summon lasts ${c.summon.duration}s`);
  else out.push(`⏱️ ${speed(c.rate)}`);
  out.push(`💢 ${c.damage >= 1.5 ? 'Heavy' : c.damage <= 0.6 ? 'Light' : 'Medium'} hits`);
  if (c.attack === 'shot') out.push(`📏 ${Math.round(c.range * 100)}% range`);
  else if (c.attack === 'dagger') out.push('📏 Close, or thrown');
  else if (c.attack === 'stab') out.push('📏 Medium thrust');
  else if (c.attack === 'sweep') out.push('📏 Close sweep');
  else if (c.attack === 'slam') out.push('📏 Slams all around');
  else if (c.attack === 'nova') out.push(c.wave ? '🌊 A wave outward' : '📏 Around the Hunter');
  else out.push('📏 Whole field');
  if (c.thrusts) out.push(`🔪 ${c.thrusts} stabs`);
  if (c.volley) out.push(`🎇 ${c.volley}-shot volleys`);
  if (c.pierce) out.push(`➡️ Pierces ${c.pierce}`);
  if (c.followThrough) out.push('➡️ Follow-through');
  if (c.bounces) out.push(`↪️ Bounces ${c.bounces}`);
  if (c.spell) out.push(`💥 Big spell every ${c.spell.every + 1}`);
  if (c.mag && !c.spell) out.push(`🔄 ${c.mag} shots, then reload`);
  if (c.spell) out.push('🔄 Recharges after its spell');
  if (c.knock) out.push(`💨 ${knock(c.knock)} knockback`);
  return out;
}

function sectionTitle(text: string): HTMLElement {
  const t = el('div', 'section-title');
  t.innerHTML = `<span>${text}</span>`;
  return t;
}

function el(tag: string, cls = '', text = ''): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}
