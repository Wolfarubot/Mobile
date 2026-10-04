import {
  ASCEND_LEVEL,
  ASCEND_NODE,
  WEAPON_CLASSES,
  MAX_LEVEL,
  MAIN_ASCEND_LEVEL,
  MAIN_MAX_LEVEL,
  EMPOWER_SESSIONS_PER_LEVEL,
  MAX_MONSTER_LEVEL,
  EMPOWER_UNLOCK_KILLS,
  TRAIN_UNLOCK_KILLS,
  enemyDef,
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
  ENEMIES,
  enemyUnlockCost,
  GEAR,
  GEAR_KINDS,
  GEAR_STATS,
  MAX_STARS,
  itemLevel,
  gearCost,
  gearColor,
  gearDef,
  gearStats,
  gearSummary,
  hitText,
  weaponHit,
  HUNTERS,
  hunterDef,
  hunterPerk,
  MAIN_ABILITY,
  itemCost,
  ITEMS,
  materialDef,
  MATERIALS,
  nextAreaOf,
  EVENTS,
  eventDef,
  type EventDef,
  RARITIES,
  STATION_CAPACITY,
  STATION_EFFICIENCY,
  type AreaId,
  type EnemyDef,
  type GearDef,
  type GearStat,
  type HunterDef,
  type HunterId,
  type ItemDef,
  type MaterialId,
  type Rarity,
} from '../core/balance';
import { fmt, fmtDps, fmtTime } from '../core/format';
import type { FarmRates, Game, TreeKind } from '../core/game';
import type { OfflineResult } from '../core/offline';
import { COOLDOWN_POSITIONS, TAB_IDS, type BuyAmount, type CooldownPos, type DpsCorner, type FxKey, type IndicatorStyle, type GearItem, type TabId, type Wearer } from '../core/state';
import { drawEnemyPortrait } from '../render/battle';
import { spriteUrl } from '../render/sprites';
import { applyAreaTheme } from './theme';
import { playCutscene, TIME_EATER_CUTSCENE } from './cutscene';
import { applyFont, fontDef, FONTS } from './fonts';

type Tab = TabId;
/** What treeView needs to draw and drive a skill or evolution tree. */
interface TreeAdapter {
  nodes: TreeNode[];
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
  dtype: DamageType | 'any';
}
const NO_FILTER: InvFilter = { type: 'all', rarity: 'any', level: 'any', dtype: 'any' };
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

const upgradeReach = (it: ItemDef): string => (it.area ? `affects the ${areaDef(it.area.id).name}` : 'boosts every Hunter');

/** A star rank for inside a `.stars` element: filled stars, then the rest dimmed. */
const starsHtml = (n: number): string => `${'★'.repeat(n)}<span class="off">${'★'.repeat(Math.max(0, MAX_STARS - n))}</span>`;
const gemHtml = (m: MaterialId, size = '') => `<i class="gem ${size}" style="background:${materialDef(m).color}"></i>`;

/** DOM layer: top bar, area controls, tabbed panels and modals. Refreshes numbers on a timer. */
export class AppUI {
  private refreshers: Array<() => void> = [];
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
  private tab: Tab = 'hunters';
  /** The open sub-tab of the Inventory tab. */
  private invSub: InvSub = 'equipment';
  /** Filters on the Inventory's Equipment sub-tab (kept for the session). */
  private invFilter: InvFilter = { ...NO_FILTER };
  /** The open sub-tab of the monster view. */
  private monsterSub: 'stats' | 'evolution' = 'stats';
  /** The area selected in the Areas tab. */
  private selectedArea: AreaId | null = null;
  /** The last area tile tapped, for double-taps (tiles are rebuilt on each tap). */
  private areaTap: { id: AreaId | null; at: number } = { id: null, at: 0 };
  /** The menu raised to full screen over the battlefield. */
  private menuFull = false;
  /** When the last popup opened or closed (performance.now), to space out the one-time tips. */
  private lastPopup = -Infinity;

  constructor(
    private game: Game,
    private hooks: { save: () => void; wipe: () => Promise<void> },
  ) {
    document.querySelectorAll<HTMLButtonElement>('.tabs button').forEach((b) =>
      b.addEventListener('click', () => {
        if (b.dataset.tab === 'events' && !game.eventsOpen) this.showEventsLocked();
        else if (b.dataset.tab === 'areas' && !this.areasOpen) this.showAreasLocked();
        else this.setTab(b.dataset.tab as Tab);
      }),
    );
    $('#settingsBtn').addEventListener('click', () => this.openSettings());
    this.menuGestures();
    this.applySettings();
    // Panels that depend on which areas/enemies/Hunters exist are rebuilt when those change.
    game.on((e) => {
      if (e.type === 'areaUnlocked' || e.type === 'travel' || e.type === 'unlock' || e.type === 'recruit') this.setTab(this.tab, true);
      else if (e.type === 'eventComplete') this.setTab(this.tab, true); // may have made Hunters available
      else if (e.type === 'finalGuardian' && this.game.state.events['guardian-rift'].completed === 1) this.showRiftConquered();
      else if (e.type === 'eventStart' || e.type === 'eventEnd' || e.type === 'guardianFail') this.refresh();
    });
    this.setTab('hunters');
  }

  setTab(tab: Tab, keepScroll = false): void {
    if (tab !== this.tab || this.invSub !== 'crafting') this.closeFieldCard();
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
    const ready = EVENTS.filter((e) => e.area === g.area && g.eventReady(e.id)).length;
    const badge = $('#eventsBadge');
    badge.textContent = String(ready);
    badge.classList.toggle('hidden', ready <= 0);
    const craftable = ITEMS.some((it) => g.canCraft(it.id));
    $('#forgeBadge').classList.toggle('hidden', !craftable);
    this.panel.querySelector('.craft-dot')?.classList.toggle('hidden', !craftable);
    $('#beastBadge').classList.toggle(
      'hidden',
      !ENEMIES.some((e) => (!s.bestiary[e.id].unlocked && g.isAreaUnlocked(e.area) && s.gold >= enemyUnlockCost(e)) || (g.isUnlocked(e.id) && g.evoPoints(e.id) > 0)),
    );
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

  private buildHunters(): void {
    const g = this.game;
    // Stays pinned to the top of the panel while the cards scroll under it.
    this.panel.appendChild(this.amountsBar('sticky-amounts'));

    this.panel.appendChild(this.hunterCard('main'));
    // Recruited Hunters, then only the next few still to come (unlocked by their area's events).
    const recruited = HUNTERS.filter((h) => g.state.hunters[h.id].recruited);
    const upcoming = HUNTERS.filter((h) => !g.state.hunters[h.id].recruited).slice(0, NEXT_HUNTERS_SHOWN);
    for (const h of [...recruited, ...upcoming]) this.panel.appendChild(this.hunterCard(h.id));
  }

  /** A Train button and a progress bar toward the next level, kept up to date. `compact` is the card's version. */
  private trainParts(who: Wearer, compact = false): { btn: HTMLButtonElement; bar: HTMLElement } {
    const g = this.game;
    const btn = el('button', 'buy') as HTMLButtonElement;
    const bar = el('div', 'train-bar');
    bar.innerHTML = '<i></i><span></span>';
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (g.train(who)) {
        bumpCard(btn);
        this.refresh();
      }
    });
    this.refreshers.push(() => {
      const p = g.trainPurchase(who);
      const { level, into, need } = g.levelInfo(who);
      if (!g.trainUnlocked) {
        btn.innerHTML = `🔒 Train<small>Slay ${fmt(Math.min(g.slimeKills, TRAIN_UNLOCK_KILLS))} / ${TRAIN_UNLOCK_KILLS} slimes</small>`;
        btn.disabled = true;
        $('i', bar).style.width = '0%';
        $('span', bar).textContent = compact ? '' : `Lv ${level}`;
        return;
      }
      if (p.count === 0) btn.innerHTML = g.ascended(who) ? 'Max level' : `Lv ${level} cap<small>Ascend in Skills</small>`;
      else btn.innerHTML = `Train${p.count > 1 ? ` ×${p.count}` : ''}<small>🪙 ${fmt(p.cost)}</small>`;
      btn.disabled = p.count === 0 || g.state.gold < p.cost;
      $('i', bar).style.width = `${(into / need) * 100}%`;
      // The card's bar is just the bar; the numbers are in the full view.
      const capped = p.count === 0;
      $('i', bar).style.width = capped ? '100%' : `${(into / need) * 100}%`;
      $('span', bar).textContent = compact ? '' : capped ? (g.ascended(who) ? `Lv ${level} · max level` : `Lv ${level} · ascend to go on`) : `Lv ${level} · ${into}/${need} to Lv ${level + 1}`;
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
          <div class="hc-ability">${def ? def.ability : MAIN_ABILITY}</div>
          <div class="hc-status"></div>
        </div>
      </div>
      <div class="hc-train"><span class="hc-lv"></span><div class="hc-mid"></div><div class="hc-action"></div></div>
      <div class="hc-gear"></div>`;
    // Only recruited Hunters open their full view (a locked card's story and Recruit button are all there is).
    const recruitedNow = () => !def || g.state.hunters[def.id].recruited;
    card.addEventListener('click', () => {
      if (recruitedNow()) this.openHunterDetail(who);
    });
    this.refreshers.push(() => card.classList.toggle('no-expand', !recruitedNow()));
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
            ? `<span class="gear-chip rar" style="--rc:${gearColor(it.base)}">${gearDef(it.base).icon} ${gearDef(it.base).name}</span>`
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
        $('.hc-ability', card).textContent = open ? def.ability : def.story;
        status.textContent = open ? 'Available to recruit' : '';
        status.classList.toggle('hidden', !open);
        mid.innerHTML = open ? 'Recruit to start training' : `🔒 ${unlockText(g, def)}`;
        recruitBtn.innerHTML = open ? `Recruit<small>🪙 ${fmt(def.recruitCost)}</small>` : '🔒<small>Locked</small>';
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
      const down = def && station && station !== g.area ? (g.farmRates(station, g.stationedIn(station), STATION_EFFICIENCY).stunned[def.id] ?? 0) : 0;
      status.innerHTML = `${station ? `📍 ${areaDef(station).name}` : '💤 Resting'} · ⚔️ ${fmt(g.dpsOf(who))} DPS${down >= 0.05 ? ' · <b class="warn">💫 overwhelmed</b>' : ''}`;
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
   * Full-screen Hunter view with sub-tabs: Overview (training, stats, station), Equipment (slots; tap one to
   * pick from unequipped gear) and Skills (the branching skill tree). Closing returns to the battlefield.
   */
  private openHunterDetail(who: Wearer, sub: 'overview' | 'equipment' | 'skills' = 'overview'): void {
    if (this.detail) this.dropDetail();
    const g = this.game;
    const def = who === 'main' ? null : hunterDef(who);
    const view = el('div', 'hunter-detail floating-close');
    view.innerHTML = `
      <div class="hd-scroll">
        <div class="hd-hero">
          ${portraitHtml(who, 'big')}
          <div class="hd-title">
            <h2>${def ? def.name : esc(mainName())}</h2>
            <div class="hd-sub"></div>
          </div>
        </div>
        <p class="hd-ability">${def ? def.ability : MAIN_ABILITY}</p>
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
    overview.appendChild(sectionTitle(recruited ? 'Stats' : 'Stats when recruited'));
    const headline = el('div', 'hd-stats hd-headline');
    overview.appendChild(headline);
    const stats = el('div', 'hd-stats');
    overview.appendChild(stats);
    if (def) overview.appendChild(el('p', 'hd-style', def.style.describe));
    const effectNote = el('p', 'hd-style hd-effect');
    overview.appendChild(effectNote);
    this.refreshers.push(() => {
      const lines: Array<[string, DamageType, number]> = [['Attacks', g.damageTypeOf(who), g.procOf(who)]];
      if (g.specialCooldown(who) !== null) lines.push([def?.style.kind === 'potion' ? 'Potions' : 'Fireballs', g.damageTypeOf(who, 'long', true), g.procOf(who, 'long', true)]);
      effectNote.innerHTML = lines
        .filter(([, t, p]) => p > 0 && DAMAGE_TYPES[t].effect)
        .map(([what, t, p]) => `${DAMAGE_TYPES[t].icon} <b>${what}</b> (${Math.round(p * 100)}% chance): ${DAMAGE_TYPES[t].effect}.`)
        .join('<br>');
    });
    if (def && recruited) {
      overview.appendChild(sectionTitle('Station'));
      overview.appendChild(this.stationControls(def));
    }

    // Equipment
    const equipment = pane('equipment');
    if (recruited) equipment.appendChild(this.equipmentList(who));
    else equipment.appendChild(el('p', 'hd-note', `Slots: ${g.slotsOf(who).map((sl) => `${GEAR_KINDS[sl.kind].icon} ${sl.label}`).join(' · ')}. Recruit them to equip gear.`));

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
        def && hunterPerk(def) ? `<span class="perk">${hunterPerk(def)}</span>` : '',
      ].join('');
      // Only redrawn when it changes, so a tap on the location button isn't lost mid-press.
      if (html !== subHtml) subLine.innerHTML = subHtml = html;
      headline.innerHTML = `<div><b>${fmt(g.dpsOf(who))}</b>DPS</div>${recruited ? `<div><b>${fmt(g.killsBy(who))}</b>Enemies slain</div>` : ''}`;
      const cells: Array<[string, string]> = [
        ['Damage', fmt(g.shotDamage(who))],
        ['Attack rate', `${g.shooterRate(who).toFixed(2)}/s${who === 'main' && g.projectiles > 1 ? ` ×${g.projectiles}` : ''}`],
        ['Range', fmt(g.shooterRange(who))],
        ['Stun time', `${g.stunTime(false, who).toFixed(2)}s`],
        ['Shield', g.guardOf(who) ? `${g.guardOf(who)} hit${g.guardOf(who) > 1 ? 's' : ''}` : '—'],
        ['Crit chance', `${Math.round(g.critChanceOf(who) * 100)}%`],
      ];
      if (!def) cells.push(['Tap damage', fmt(g.tapDamage)], ['Tap size', fmt(g.tapRadius)]);
      const dt = DAMAGE_TYPES[g.damageTypeOf(who)];
      cells.splice(1, 0, ['Damage type', `<span style="color:${dt.color}" class="dt-cell">${dt.icon} ${dt.name}</span>`]);
      const cd = g.specialCooldown(who);
      if (cd !== null) {
        const potion = def?.style.kind === 'potion';
        const hit = fmt(g.shotDamage(who) * g.specialDamageMult(who));
        cells.push(
          [`${potion ? 'Puddle' : 'Fireball'} damage (${DAMAGE_TYPES[g.damageTypeOf(who, 'long', true)].name})`, potion ? `${hit}/tick` : hit],
          [potion ? 'Puddle size' : 'Blast size', fmt(g.specialRadius(who))],
          [potion ? 'Potion every' : 'Fireball every', `${cd}s`],
        );
      }
      const pierce = g.pierceOf(who) + (def?.style.pierce ?? 0);
      if (pierce) cells.push(['Pierce', String(pierce)]);
      if (def?.bane) cells.splice(1, 0, [`vs ${ARCHETYPES[def.bane.archetype].name}`, fmt(g.shotDamage(who, def.bane.archetype))]);
      if (def?.style.closeRange) cells.splice(1, 0, ['Pistols', `${fmt(g.shotDamage(who, undefined, 'short'))} ×2`]);
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
      canLearn: (id) => g.canLearn(who, id, which),
      learn: (id) => g.learn(who, id, which),
      verb: 'Learn',
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
    const pos = (n: TreeNode) => ({ x: ((n.col + 0.5) / 3) * 300, y: n.row * ROW + ROW / 2 - 8 });
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
      b.innerHTML = `<span class="tn-icon">${n.icon}<em></em></span><span class="tn-name">${n.name}</span>${(n.cost ?? 1) > 1 ? `<span class="tn-cost">${n.cost} pts</span>` : ''}`;
      if (n.id === ASCEND_NODE.id) b.classList.add('ascend');
      b.addEventListener('click', () => this.openTreeNode(t, n));
      tree.appendChild(b);
      return { n, b };
    });
    wrap.appendChild(tree);
    this.refreshers.push(() => {
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

  /** A tree node's details, with a button to spend a point on it. */
  private openTreeNode(t: TreeAdapter, n: TreeNode): void {
    this.showSheet(`${n.icon} ${n.name}`, (body, close) => {
      const rank = t.rank(n.id);
      const needs = n.requires.map((r) => t.nodes.find((x) => x.id === r)!.name);
      body.innerHTML = `<p class="gear-now">${n.desc}</p><p>Rank ${rank} / ${n.maxRank}</p>${
        !t.reachable(n.id) ? `<p>🔒 Needs a point in ${needs.join(' or ')} first.</p>` : ''
      }${t.gate?.(n.id) ? `<p>🔒 ${t.gate(n.id)} to open this evolution.</p>` : ''}`;
      const cost = n.cost ?? 1;
      const btn = el(
        'button',
        'buy',
        rank >= n.maxRank ? 'Maxed' : `${n.id === ASCEND_NODE.id ? 'Ascend' : t.verb} · ${cost} ${t.pointName}${cost > 1 ? 's' : ''} (${Math.max(0, t.points())} left)`,
      ) as HTMLButtonElement;
      btn.style.width = '100%';
      btn.disabled = !t.canLearn(n.id);
      btn.addEventListener('click', () => {
        if (!t.learn(n.id)) return;
        close();
        // Maxed (or a one-rank node): done. Otherwise stay open for the next rank, even if it can't be afforded yet.
        if (t.rank(n.id) < n.maxRank) this.openTreeNode(t, n);
        t.after?.(n.id);
      });
      body.appendChild(btn);
    });
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
        yieldEl.innerHTML = yieldHtml(g.farmRates(st.station, group, STATION_EFFICIENCY), `${areaDef(st.station).name}${group.length > 1 ? ` (with ${group.length - 1} other${group.length > 2 ? 's' : ''})` : ''}`);
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
      const b = el('button', 'equip-row') as HTMLButtonElement;
      b.addEventListener('click', () => this.openSlotPicker(who, i));
      wrap.appendChild(b);
      return { slot, b };
    });
    const summary = el('div', 'gear-summary');
    wrap.appendChild(summary);
    let key = '';
    this.refreshers.push(() => {
      const items = g.equipped(who);
      const k = items.map((it) => (it ? `${it.uid}:${it.stars}` : '-')).join('|');
      if (k === key) return;
      key = k;
      rows.forEach(({ slot, b }, i) => {
        const it = items[i];
        const gd = it ? gearDef(it.base) : null;
        b.classList.toggle('empty', !it);
        b.classList.toggle('rar', !!it);
        b.style.setProperty('--rc', gd ? gearColor(gd.id) : '');
        b.innerHTML = `<i>${gd ? gd.icon : GEAR_KINDS[slot.kind].icon}</i><div><small>${slot.label}</small><b>${gd ? gd.name : 'Empty'}</b><span class="sub">${
          gd && it ? `${dtypeTag(gd)}${RARITIES[gd.rarity].name} · <span class="stars">${starsHtml(it.stars)}</span> · ${gearSummary(gd, it.stars)}` : 'Tap to equip'
        }</span></div><span class="chev">›</span>`;
      });
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
  private openSlotPicker(who: Wearer, slot: number): void {
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
    const fits = (it: GearItem) => slotAccepts(def, gearDef(it.base).kind);
    // Start on the best piece that fits and nobody is wearing.
    let selected: number | null =
      g.state.inventory.filter((it) => fits(it) && !g.wearerOf(it.uid)).sort((a, b) => b.stars - a.stars)[0]?.uid ?? null;

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
          btn.textContent = `Worn by ${wearerName(worn.who)}`;
          btn.disabled = true;
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
      const inv = [...g.state.inventory].sort((a, b) => Number(fits(b)) - Number(fits(a)) || b.stars - a.stars);
      $('.pk-count', view).textContent = `${inv.length} item${inv.length === 1 ? '' : 's'}`;
      if (!inv.length) grid.innerHTML = '<p class="empty-inv">Empty. Craft gear in Inventory → Crafting.</p>';
      for (const it of inv) {
        const gd = gearDef(it.base);
        const worn = g.wearerOf(it.uid);
        const tile = el('button', `inv-tile rar${fits(it) ? '' : ' misfit'}${it.uid === selected ? ' selected' : ''}`) as HTMLButtonElement;
        tile.style.setProperty('--rc', gearColor(gd.id));
        tile.innerHTML = `<i>${gd.icon}</i><span>${gd.name}</span><small class="stars">${starsHtml(it.stars)}</small>${worn ? `<em>${wearerIcon(worn.who)}</em>` : ''}`;
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
    this.refresh();
    return true;
  }

  /** Details for one inventory piece: upgrade or salvage. */
  private openGearDetail(uid: number): void {
    const g = this.game;
    const item = g.gearItem(uid);
    if (!item) return;
    const gd = gearDef(item.base);
    this.showSheet(`${gd.icon} ${gd.name}`, (body, close) => {
      const worn = g.wearerOf(uid);
      const cost = g.gearUpgradeCost(uid);
      body.innerHTML = `
        <p>${dtypeTag(gd)}<b class="rarity-tag" style="--rc:${gearColor(gd.id)}">${RARITIES[gd.rarity].name}</b> ${gearKindName(gd)} · <span class="stars">${starsHtml(item.stars)}</span>${worn ? ` · worn by ${wearerName(worn.who)}` : ''}</p>
        ${weaponLine(gd)}
        <p class="gear-now">${gearSummary(gd, item.stars) || 'No bonuses: plain everyday wear.'}</p>
        ${cost ? `<p class="gear-next">Next: <b>${gearSummary(gd, item.stars + 1)}</b></p><div class="cost">${costHtml(g, cost)}</div>` : Object.keys(gd.stats).length ? '<p>Fully upgraded.</p>' : '<p>Nothing to upgrade.</p>'}`;
      const actions = el('div', 'actions');
      if (cost) {
        const up = el('button', 'buy', `Upgrade to ${item.stars + 1}★`) as HTMLButtonElement;
        up.disabled = !(Object.entries(cost) as [MaterialId, number][]).every(([m, n]) => g.state.materials[m] >= n);
        up.addEventListener('click', () => {
          g.upgradeGear(uid);
          close();
          this.openGearDetail(uid);
        });
        actions.appendChild(up);
      }
      const salvage = el('button', 'buy danger-btn', 'Salvage') as HTMLButtonElement;
      salvage.addEventListener('click', () => {
        const refund = g.salvageValue(uid);
        close();
        this.showModal(`<h2>Salvage ${gd.name}?</h2><p>You'll get back half of its materials:</p><div class="cost" style="justify-content:center">${costHtml(g, refund, false)}</div>`, [
          { label: 'Cancel', secondary: true },
          { label: 'Salvage', action: () => g.salvageGear(uid) },
        ]);
      });
      actions.appendChild(salvage);
      body.appendChild(actions);
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
          return h ? `<span class="mini-hunter" style="--hc:${hunterDef(h).color}" title="${hunterDef(h).name}">${hunterDef(h).icon}</span>` : '<span class="mini-hunter empty"></span>';
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
      requestAnimationFrame(() => drawEnemyPortrait($<HTMLCanvasElement>('canvas', m), e.id));
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
      const mat = materialDef(e.material);
      const row = el('div', `row${known ? '' : ' locked'}`);
      row.innerHTML = `<canvas class="portrait"></canvas><div class="info"><div class="name">${known ? e.name : '???'} <small>${ARCHETYPES[e.archetype].icon} ${ARCHETYPES[e.archetype].name}</small></div><div class="drop">${gemHtml(e.material)} Drops <b>${known ? mat.name : '???'}</b></div><div class="sub">${known ? e.blurb : 'Unlock it in the Bestiary.'}</div>${known ? affinityHtml(e, true) : ''}</div>`;
      monsters.appendChild(row);
      requestAnimationFrame(() => drawEnemyPortrait($<HTMLCanvasElement>('canvas', row), e.id));
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
      yieldEl.innerHTML = here.length && g.area !== id ? yieldHtml(g.farmRates(id, here, STATION_EFFICIENCY), 'Together they earn') : '';
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

  private buildBestiary(): void {
    const g = this.game;
    if (g.empowerUnlocked) this.panel.appendChild(this.amountsBar('sticky-amounts', 'Empower'));
    // Current area first, then the rest in order.
    const order = [g.area, ...g.unlockedAreas.filter((a) => a !== g.area)];
    for (const areaId of order) {
      this.panel.appendChild(sectionTitle(`${areaDef(areaId).name}${areaId === g.area ? ' · here' : ''}`));
      for (const def of areaEnemies(areaId)) this.buildBeast(def);
    }
    const next = nextAreaOf(g.unlockedAreas[g.unlockedAreas.length - 1]);
    if (next) {
      const teaser = el('div', 'card');
      teaser.innerHTML = `<p style="margin:0">🔒 More monsters await in <b>${next.name}</b>.</p>`;
      this.panel.appendChild(teaser);
    }
  }

  private buildBeast(def: EnemyDef): void {
    const g = this.game;
    const card = el('div', 'beast');
    card.innerHTML = `
      <div class="beast-head">
        <canvas class="portrait"></canvas>
        <div class="info"><div class="card-corner"></div><div class="name"></div><div class="blurb">${def.blurb}</div>${dropHtml(def)}</div>
      </div>
      ${affinityHtml(def, true)}
      <div class="beast-actions"></div>`;
    this.panel.appendChild(card);
    requestAnimationFrame(() => drawEnemyPortrait($<HTMLCanvasElement>('canvas', card), def.id));

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
      const mat = materialDef(def.material);
      card.classList.toggle('locked', !b.unlocked);
      $('.name', card).innerHTML = `${def.name}<span class="archetype">${arch.icon} ${arch.name}</span>${b.unlocked ? '' : ' <small style="color:var(--muted)">locked</small>'}`;
      if (!b.unlocked) {
        const cost = enemyUnlockCost(def);
        unlockBtn.innerHTML = `Unlock · drops ${gemHtml(def.material)} ${mat.name}<small>🪙 ${fmt(cost)}</small>`;
        unlockBtn.disabled = g.state.gold < cost;
        return;
      }
      $('.hc-lv', row).textContent = `Lv ${g.monsterLevelInfo(def.id).level}`;
      const points = g.evoPoints(def.id);
      dot.textContent = String(points);
      dot.classList.toggle('hidden', points <= 0);
    });
  }

  /** An Empower button and a progress bar toward the monster's next level. `compact` is the card's version. */
  private empowerParts(id: EnemyId, compact = false): { btn: HTMLButtonElement; bar: HTMLElement } {
    const g = this.game;
    const btn = el('button', 'buy') as HTMLButtonElement;
    const bar = el('div', 'train-bar');
    bar.innerHTML = '<i></i><span></span>';
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (g.empower(id)) {
        bumpCard(btn);
        this.refresh();
      }
    });
    this.refreshers.push(() => {
      const p = g.empowerPurchase(id);
      const { level, into, need } = g.monsterLevelInfo(id);
      const maxed = level >= MAX_MONSTER_LEVEL;
      if (maxed) btn.innerHTML = 'Max level<small>fully evolved</small>';
      else if (g.empowerUnlocked) btn.innerHTML = `Empower${p.count > 1 ? ` ×${p.count}` : ''}<small>🪙 ${fmt(p.cost)}</small>`;
      else btn.innerHTML = `🔒 Empower<small>${fmt(g.slimeKills)}/${EMPOWER_UNLOCK_KILLS} slimes</small>`;
      btn.disabled = maxed || !g.empowerUnlocked || g.state.gold < p.cost || !g.isUnlocked(id);
      $('i', bar).style.width = `${(into / need) * 100}%`;
      $('span', bar).textContent = compact ? '' : maxed ? `Lv ${level} · max level` : `Lv ${level} · ${into}/${need} to Lv ${level + 1}`;
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
        <div class="hd-hero">
          <canvas class="portrait big-portrait"></canvas>
          <div class="hd-title">
            <h2>${def.name}</h2>
            <div class="hd-sub"></div>
          </div>
        </div>
        <p class="hd-ability">${def.blurb}</p>
        ${dropHtml(def)}
        ${affinityHtml(def)}
      </div>
      <button class="hd-close hd-float-close" aria-label="Close">✕</button>`;
    document.body.appendChild(view);
    requestAnimationFrame(() => drawEnemyPortrait($<HTMLCanvasElement>('canvas', view), id));
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
      $('.hd-sub', view).innerHTML = `<span>${arch.icon} ${arch.name} · Lv ${g.monsterLevelInfo(id).level}</span><span class="where">📍 ${areaDef(def.area).name}</span>`;
      const cells: Array<[string, string]> = [
        ['Slain', fmt(g.state.bestiary[id].kills)],
        ['HP', fmt(st.hp)],
        ['Gold', fmt(st.gold)],
        ['Drop chance', st.dropChance >= 1 ? `${(st.dropChance * 100).toFixed(0)}%<small>${Math.floor(st.dropChance)} guaranteed${st.dropChance % 1 ? ` + ${Math.round((st.dropChance % 1) * 100)}%` : ''}</small>` : `${(st.dropChance * 100).toFixed(1)}%`],
        ['Spawns', `${st.spawnRate.toFixed(2)}/s`],
        ['Pack size', lo === hi ? String(lo) : `${lo}–${hi}`],
        ['Speed', `${Math.round(st.speed)}${evo.speed ? ` (+${Math.round(evo.speed * 100)}%)` : ''}`],
      ];
      stats.innerHTML = cells.map(([k, v]) => `<div><b>${v}</b>${k}</div>`).join('');
    });

    this.detail.refreshers = this.refreshers;
    this.refreshers = main;
    this.refresh();
  }

  // ---- Inventory tab: sub-tabs for Equipment (crafted gear), Crafting (gear + Upgrades) and Materials ----

  private buildInventory(): void {
    const bar = el('div', 'subtabs inv-subtabs');
    bar.innerHTML = `<button data-sub="equipment">🛡️ Equipment</button><button data-sub="crafting">🔨 Crafting <span class="badge dot hidden craft-dot"></span></button><button data-sub="materials">💎 Materials</button>`;
    this.panel.appendChild(bar);
    const panes = {} as Record<InvSub, HTMLElement>;
    for (const sub of INV_SUBS) {
      panes[sub] = el('div', 'inv-pane');
      this.panel.appendChild(panes[sub]);
    }
    const show = (sub: InvSub) => {
      this.invSub = sub;
      bar.querySelectorAll<HTMLElement>('button').forEach((b) => b.classList.toggle('on', b.dataset.sub === sub));
      for (const k of INV_SUBS) panes[k].classList.toggle('hidden', k !== sub);
    };
    bar.querySelectorAll<HTMLButtonElement>('button').forEach((b) =>
      b.addEventListener('click', () => {
        show(b.dataset.sub as InvSub);
        if (this.invSub !== 'crafting') this.closeFieldCard();
        this.panel.scrollTop = 0;
      }),
    );
    this.buildMaterials(panes.materials);
    this.buildGearList(panes.equipment);
    this.buildCrafting(panes.crafting);
    show(this.invSub);
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
        const source = ENEMIES.find((e) => e.material === m.id)!;
        const hint = g.isAreaUnlocked(source.area) ? `${source.name}s` : '???';
        tile.classList.toggle('unknown', !known);
        tile.disabled = !known;
        tile.innerHTML = `${gemHtml(m.id)}<span>${known ? m.name : hint}</span><b>${known ? fmt(g.state.materials[m.id]) : ''}</b>`;
      }
    });
  }

  /** You've met a material once you've unlocked a monster that drops it or held some. */
  private materialKnown(id: MaterialId): boolean {
    const g = this.game;
    return g.state.materials[id] > 0 || (g.state.stats.matGained[id] ?? 0) > 0 || ENEMIES.some((e) => e.material === id && g.isUnlocked(e.id));
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
      for (const e of ENEMIES.filter((x) => x.material === id)) {
        const seen = g.isAreaUnlocked(e.area);
        const b = el('button', `dropper${seen ? '' : ' unknown'}`) as HTMLButtonElement;
        b.innerHTML = `<canvas class="portrait"></canvas><span><b>${seen ? e.name : '???'}</b><small>${seen ? `${areaDef(e.area).name}${g.isUnlocked(e.id) ? '' : ' · locked'}` : 'Somewhere further on'}</small></span>`;
        b.disabled = !seen;
        if (seen) {
          requestAnimationFrame(() => drawEnemyPortrait($<HTMLCanvasElement>('canvas', b), e.id));
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
    const invTitle = sectionTitle('Equipment');
    pane.appendChild(invTitle);
    const bar = el('div', 'filter-bar');
    bar.innerHTML = `<button class="filter-btn">⚙️ Filter</button><div class="filter-chips"></div>`;
    $('.filter-btn', bar).addEventListener('click', () => this.openInvFilter());
    pane.appendChild(bar);
    const inv = el('div', 'inventory');
    pane.appendChild(inv);
    let invKey: string | null = null;
    this.refreshers.push(() => {
      const f = this.invFilter;
      const lv = LEVEL_FILTERS.find((l) => l.id === f.level)!;
      const gear = g.state.inventory.filter((it) => {
        const gd = gearDef(it.base);
        return (
          (f.type === 'all' || GEAR_TYPE[gd.kind] === f.type) &&
          (f.rarity === 'any' || gd.rarity === f.rarity) &&
          (f.dtype === 'any' || gd.damageType === f.dtype) &&
          it.stars >= lv.min &&
          it.stars <= lv.max
        );
      });
      // Upgrades have no rarity or damage type, so those filters hide them.
      const upgrades =
        (f.type === 'all' || f.type === 'upgrades') && f.rarity === 'any' && f.dtype === 'any'
          ? ITEMS.filter((it) => g.state.items[it.id] > 0 && g.state.items[it.id] >= lv.min && g.state.items[it.id] <= lv.max)
          : [];
      const k = [
        JSON.stringify(f),
        gear.map((it) => `${it.uid}:${it.stars}:${g.wearerOf(it.uid)?.who ?? ''}`).join('|'),
        upgrades.map((it) => `${it.id}:${g.state.items[it.id]}`).join('|'),
      ].join('/');
      if (k === invKey) return;
      invKey = k;
      const total = g.state.inventory.length + ITEMS.filter((it) => g.state.items[it.id] > 0).length;
      const shown = gear.length + upgrades.length;
      const filtering = f.type !== 'all' || f.rarity !== 'any' || f.level !== 'any' || f.dtype !== 'any';
      invTitle.innerHTML = `<span>Equipment</span><span>${filtering ? `${shown} of ${total}` : total} item${total === 1 ? '' : 's'}</span>`;
      $('.filter-btn', bar).classList.toggle('on', filtering);
      const chips = $('.filter-chips', bar);
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
      if (f.level !== 'any') chips.appendChild(el('span', 'filter-chip', lv.name));
      if (f.dtype !== 'any') {
        const c = el('span', 'filter-chip', `${DAMAGE_TYPES[f.dtype].icon} ${DAMAGE_TYPES[f.dtype].name}`);
        c.style.color = DAMAGE_TYPES[f.dtype].color;
        chips.appendChild(c);
      }
      if (filtering) {
        const clear = el('button', 'filter-clear', '✕ Clear');
        clear.addEventListener('click', () => {
          this.invFilter = { ...NO_FILTER };
          this.refresh();
        });
        chips.appendChild(clear);
      }
      inv.innerHTML = '';
      if (!total) inv.innerHTML = '<p class="empty-inv">Empty. Craft equipment in Crafting, then equip it from a Hunter\'s card.</p>';
      else if (!shown)
        inv.innerHTML = '<p class="empty-inv">Nothing matches these filters.</p>';
      for (const it of gear) {
        const gd = gearDef(it.base);
        const worn = g.wearerOf(it.uid);
        const tile = el('button', 'inv-tile rar') as HTMLButtonElement;
        tile.style.setProperty('--rc', gearColor(gd.id));
        tile.innerHTML = `<i>${gd.icon}</i><span>${gd.name}</span><small class="stars">${starsHtml(it.stars)}</small>${worn ? `<em>${wearerIcon(worn.who)}</em>` : ''}`;
        tile.addEventListener('click', () => this.openGearDetail(it.uid));
        inv.appendChild(tile);
      }
      for (const it of upgrades) {
        const tile = el('button', 'inv-tile upgrade rar') as HTMLButtonElement;
        tile.style.setProperty('--rc', RARITIES[it.rarity].color);
        tile.innerHTML = `<i>${it.icon}</i><span>${it.name}</span><small class="stars">${starsHtml(g.state.items[it.id])}</small><em>⛺</em>`;
        tile.addEventListener('click', () => this.openUpgradeDetail(it));
        inv.appendChild(tile);
      }
    });
  }

  /** The Equipment filters: a Type cycler, Rarity and Level. Changes apply as you tap. */
  private openInvFilter(): void {
    this.showSheet('⚙️ Filter', (body, close) => {
      const draw = () => {
        const f = this.invFilter;
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
          </div>
          <div class="filter-label">Level</div>
          <div class="filter-options">
            ${LEVEL_FILTERS.map((l) => `<button data-level="${l.id}" class="${f.level === l.id ? 'on' : ''}">${l.name}</button>`).join('')}
          </div>
          <button class="secondary filter-reset">Clear filters</button>`;
        const set = (next: Partial<InvFilter>) => {
          this.invFilter = { ...this.invFilter, ...next };
          this.refresh();
          draw();
        };
        body.querySelectorAll<HTMLButtonElement>('.type-cycler button').forEach((b) =>
          b.addEventListener('click', () => {
            const i = INV_TYPES.findIndex((x) => x.id === this.invFilter.type);
            set({ type: INV_TYPES[(i + Number(b.dataset.step) + INV_TYPES.length) % INV_TYPES.length].id });
          }),
        );
        body.querySelectorAll<HTMLButtonElement>('[data-rarity]').forEach((b) => b.addEventListener('click', () => set({ rarity: b.dataset.rarity as Rarity | 'any' })));
        body.querySelectorAll<HTMLButtonElement>('[data-dtype]').forEach((b) => b.addEventListener('click', () => set({ dtype: b.dataset.dtype as DamageType | 'any' })));
        body.querySelectorAll<HTMLButtonElement>('[data-level]').forEach((b) => b.addEventListener('click', () => set({ level: b.dataset.level as LevelFilter })));
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
    this.showSheet(`${it.icon} ${it.name}`, (body, close) => {
      const lv = g.state.items[it.id];
      const maxed = lv >= MAX_STARS;
      body.innerHTML = `<p class="gear-now"><b class="rarity-tag" style="--rc:${RARITIES[it.rarity].color}">${RARITIES[it.rarity].name}</b> upgrade · ${upgradeReach(it)} · <span class="stars">${starsHtml(lv)}</span></p><p><b>${it.describe(itemLevel(it, lv))}</b>${maxed ? '' : ` → ${it.describe(itemLevel(it, lv + 1))}`}</p>${
        maxed ? '' : `<div class="cost">${costHtml(g, itemCost(it, lv))}</div>`
      }`;
      const btn = el('button', 'buy', maxed ? 'MAX' : 'Upgrade') as HTMLButtonElement;
      btn.style.width = '100%';
      btn.disabled = !g.canCraft(it.id);
      btn.addEventListener('click', () => {
        if (!g.craft(it.id)) return;
        close();
        this.openUpgradeDetail(it);
      });
      body.appendChild(btn);
    });
  }

  /** Gear recipes you know, then Upgrades. */
  /**
   * Crafting: every known recipe, then the Upgrades split into Available (still to craft or upgrade) and Completed (5★), as
   * 5-wide grids of icons (greyed out when you can't afford them); tap one for its card over the Battle Field.
   */
  private buildCrafting(pane: HTMLElement): void {
    const g = this.game;
    const tiles: Array<{ tile: HTMLElement; ready: () => boolean; badge: () => string }> = [];
    pane.appendChild(sectionTitle('Craft Equipment'));
    const gearGrid = el('div', 'craft-grid');
    pane.appendChild(gearGrid);
    for (const gd of GEAR.filter((x) => !x.starter && this.gearKnown(x))) {
      const tile = el('button', 'craft-tile') as HTMLButtonElement;
      tile.innerHTML = `<i>${gd.icon}</i><em></em>`;
      tile.title = gd.name;
      tile.addEventListener('click', () => this.openCraftCard({ gear: gd }));
      gearGrid.appendChild(tile);
      tiles.push({ tile, ready: () => g.canCraftGear(gd.id), badge: () => String(g.state.inventory.filter((it) => it.base === gd.id).length || '') });
    }
    const lockedGear = GEAR.filter((gd) => !gd.starter && !this.gearKnown(gd)).length;
    if (lockedGear) pane.appendChild(el('p', 'hd-note', `🔒 ${lockedGear} more recipes need materials from monsters you haven't met yet.`));

    // Upgrades move from Available to Completed at 5★, so this section is rebuilt when that changes.
    const upgrades = el('div');
    pane.appendChild(upgrades);
    let upTiles: typeof tiles = [];
    let crafted = '';
    const buildUpgrades = () => {
      upgrades.innerHTML = '';
      upTiles = [];
      for (const [title, list] of [
        ['Available Upgrades', ITEMS.filter((it) => g.state.items[it.id] < MAX_STARS)],
        ['Completed Upgrades', ITEMS.filter((it) => g.state.items[it.id] >= MAX_STARS)],
      ] as const) {
        if (!list.length) continue;
        upgrades.appendChild(sectionTitle(title));
        const grid = el('div', 'craft-grid');
        upgrades.appendChild(grid);
        for (const it of list) {
          const tile = el('button', 'craft-tile') as HTMLButtonElement;
          tile.innerHTML = `<i>${it.icon}</i><em></em>`;
          tile.title = it.name;
          tile.addEventListener('click', () => this.openCraftCard({ item: it }));
          grid.appendChild(tile);
          upTiles.push({
            tile,
            ready: () => g.canCraft(it.id) || g.state.items[it.id] >= MAX_STARS,
            badge: () => (g.state.items[it.id] ? `${g.state.items[it.id]}★` : ''),
          });
        }
      }
    };
    this.refreshers.push(() => {
      const k = ITEMS.map((it) => (g.state.items[it.id] >= MAX_STARS ? 1 : 0)).join('');
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
      <button class="fc-close" aria-label="Close">✕</button>
      <div class="fc-head"><i class="fc-icon" style="--rc:${gd ? gearColor(gd.id) : RARITIES[it!.rarity].color}">${gd ? gd.icon : it!.icon}</i><div>
        <h3>${name}</h3>
        <small>${gd ? `<b class="fc-rarity" style="--rc:${gearColor(gd.id)}">${RARITIES[gd.rarity].name}</b> ${gearKindName(gd).toLowerCase()} ${dtypeTag(gd)}` : `<b class="fc-rarity" style="--rc:${RARITIES[it!.rarity].color}">${RARITIES[it!.rarity].name}</b> upgrade · ${upgradeReach(it!)}`}</small>
      </div></div>
      ${gd ? weaponLine(gd) : ''}
      <p class="fc-effect"></p>
      <div class="fc-owned"></div>
      <div class="fc-label">Recipe</div>
      <div class="fc-cost"></div>
      <button class="buy fc-craft"></button>`;
    $('.fc-close', card).addEventListener('click', () => this.closeFieldCard());
    const btn = $<HTMLButtonElement>('.fc-craft', card);
    btn.addEventListener('click', () => {
      const ok = gd ? g.craftGear(gd.id) : g.craft(it!.id);
      if (!ok) return;
      this.toast(gd ? `Crafted ${gd.name}!` : g.state.items[it!.id] > 1 ? `Upgraded ${it!.name} to ${g.state.items[it!.id]}★!` : `Crafted ${it!.name}!`);
      bumpCard(btn);
      this.refresh();
    });
    const update = () => {
      if (gd) {
        const owned = g.state.inventory.filter((x) => x.base === gd.id).length;
        $('.fc-effect', card).innerHTML = `1★: <b>${gearSummary(gd, 1)}</b> · 5★: <b>${gearSummary(gd, MAX_STARS)}</b>`;
        $('.fc-owned', card).innerHTML = `In your equipment: <b>${owned}</b>`;
        $('.fc-cost', card).innerHTML = recipeHtml(g, gearCost(gd, 0));
        btn.textContent = 'Craft';
        btn.disabled = !g.canCraftGear(gd.id);
      } else {
        const item = it!;
        const lv = g.state.items[item.id];
        const maxed = lv >= MAX_STARS;
        const at = (stars: number) => item.describe(itemLevel(item, stars));
        $('.fc-effect', card).innerHTML = lv ? `${at(lv)}${maxed ? '' : ` → <b>${at(lv + 1)}</b>`}` : `<b>${at(1)}</b>`;
        $('.fc-owned', card).innerHTML = lv ? `Owned: <b class="stars">${starsHtml(lv)}</b>${maxed ? ' · MAX' : ''}` : 'Owned: <b>not crafted yet</b>';
        $('.fc-cost', card).innerHTML = maxed ? '<p>Fully upgraded.</p>' : recipeHtml(g, itemCost(item, lv));
        btn.textContent = maxed ? 'MAX' : lv ? 'Upgrade' : 'Craft';
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
  private gearKnown(gd: GearDef): boolean {
    const g = this.game;
    return (Object.keys(gd.recipe) as MaterialId[]).every((m) => g.state.materials[m] > 0 || ENEMIES.some((e) => e.material === m && g.isUnlocked(e.id)));
  }

  // ---- Events tab: each area's events, unlocked by slaying monsters there, then on a cooldown ----

  private buildEvents(): void {
    const g = this.game;
    this.panel.appendChild(sectionTitle(areaDef(g.area).name));
    const here = EVENTS.filter((e) => e.area === g.area);
    for (const ev of here) this.buildEventCard(ev);
    if (!here.length) this.panel.appendChild(el('p', 'hd-note', 'No events here yet.'));
  }

  private buildEventCard(ev: EventDef): void {
    const g = this.game;
    const card = el('div', 'row event-card');
    card.innerHTML = `<div class="icon">${ev.icon}</div><div class="info"><div class="name">${ev.name}</div><div class="sub">${ev.blurb}</div><div class="ev-status"></div></div><button class="buy"></button>`;
    const btn = $<HTMLButtonElement>('.buy', card);
    const status = $('.ev-status', card);
    btn.addEventListener('click', () => {
      if (g.startEvent(ev.id)) this.refresh();
    });
    this.panel.appendChild(card);
    this.refreshers.push(() => {
      const kills = g.eventProgress(ev.id);
      const unlocked = g.eventUnlocked(ev.id);
      const running = (ev.kind === 'guardian' && g.guardianActive && g.area === ev.area) || g.activeEvent?.id === ev.id;
      const cd = g.eventCooldown(ev.id);
      card.classList.toggle('locked', !unlocked);
      card.classList.toggle('running', running);
      card.classList.toggle('ready', g.eventReady(ev.id));
      const next = nextAreaOf(ev.area);
      const rewards: string[] = [];
      if (ev.kind === 'guardian') rewards.push(next && !g.isAreaUnlocked(next.id) ? `unlocks ${next.name}` : 'a Guardian bounty of gold and materials');
      for (const h of g.huntersUnlockedBy(ev.id)) rewards.push(`${hunterDef(h).icon} ${hunterDef(h).name} the ${hunterDef(h).title} joins`);
      const extra = rewards.length ? `Reward: ${rewards.join(' · ')}` : '';
      if (!unlocked) {
        status.innerHTML = `<div class="mastery"><i style="width:${Math.min(1, kills / ev.unlockKills) * 100}%"></i><span>🔒 Slay ${fmt(kills)} / ${fmt(ev.unlockKills)} ${unlockNoun(ev)} here</span></div>`;
        btn.innerHTML = '🔒';
        btn.disabled = true;
      } else if (running) {
        const left = ev.kind === 'guardian' ? (g.bossAlive ? g.bossTimer : ev.duration) : (g.activeEvent?.left ?? 0);
        status.innerHTML = `<b class="ev-live">● Running · ${Math.ceil(left)}s left</b>`;
        btn.innerHTML = 'Live';
        btn.disabled = true;
      } else if (cd > 0) {
        status.innerHTML = extra ? `<small>${extra}</small>` : '';
        btn.innerHTML = `Cooldown<small>${fmtTime(cd)}</small>`;
        btn.disabled = true;
      } else {
        status.innerHTML = extra ? `<small>${extra}</small>` : '';
        btn.innerHTML = g.eventRunning ? 'Busy<small>another event</small>' : 'Start';
        btn.disabled = !g.eventReady(ev.id);
      }
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

  /** The Areas tab opens with the second area (the Faerie Glade). */
  private get areasOpen(): boolean {
    return this.game.unlockedAreas.length > 1;
  }

  /** Tapping the greyed-out Areas tab explains how to open it. */
  private showAreasLocked(): void {
    this.showModal(
      `<h2>🔒 Areas</h2><p>Beat the <b>${areaDef('forest').name} Guardian</b> to unlock the ${areaDef('glade').name}, and the Areas tab with it.</p><p>The Guardian Challenge opens in Events once you've slain ${fmt(areaDef('forest').mastery)} monsters in the ${areaDef('forest').name}.</p>`,
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
       <p>You can change the name of your Hunter in the ⚙️ settings.</p>`,
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
       <p>Open the Hunter's card to see more details, upgrade their abilities, and change their equipment!</p>`,
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
       <p>The Events tab shows the events for the area you're in. Slay monsters there to unlock them. After you start one, it goes on cooldown before it can run again. Travel to another area to see its events.</p>`,
      [
        { label: 'Later', secondary: true },
        { label: 'Go to Events', action: () => (this.game.eventsOpen ? this.goTo('events') : this.showEventsLocked()) },
      ],
    );
  }

  /** Switches tab from anywhere, closing a full-screen view (e.g. Tutorials) on the way. */
  private goTo(tab: Tab): void {
    this.dropDetail();
    this.setTab(tab);
  }

  // ---- Tutorials ----

  /** Full-screen Tutorials menu (opened from the top of Settings): replay the tips, and pages on weapon types and damage types. */
  private openTutorials(page: 'menu' | 'weapons' | 'damage' = 'menu'): void {
    if (this.detail) this.dropDetail();
    const title = page === 'menu' ? 'Tutorials' : page === 'weapons' ? 'Weapon types' : 'Damage types';
    const view = el('div', 'hunter-detail settings tutorials');
    view.innerHTML = `
      <div class="hd-top"><button class="hd-close" aria-label="Back">‹</button><span>${title}</span></div>
      <div class="hd-scroll"></div>`;
    document.body.appendChild(view);
    // Back goes up a level: a guide to the Tutorials menu, the menu to Settings.
    $('.hd-close', view).addEventListener('click', () => (page === 'menu' ? this.openSettings() : this.openTutorials()));
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
    row('⚔️', 'Weapon types', 'How each kind of weapon attacks: range, speed, reloads, knockback and more.', () => this.openTutorials('weapons'));
    row('🔥', 'Damage types & status effects', 'What each damage type does, weaknesses and resistances.', () => this.openTutorials('damage'));
    body.appendChild(sectionTitle('Tips'));
    row('👋', 'Welcome', 'Getting started.', () => this.showWelcome(true));
    row('💪', 'Training', `Making your Hunter stronger (opens after ${TRAIN_UNLOCK_KILLS} slimes).`, () => this.showTrainIntro(true));
    row('🔨', 'Crafting', 'Materials, gear and Upgrades.', () => this.showCraftIntro(true));
    row('🐺', 'New monsters & the full-screen menu', 'Unlocking the wolf, and raising the menu over the battlefield.', () => this.showWolfIntro(true));
    row('👾', 'Empower', `Unlocking and empowering monsters (opens after ${EMPOWER_UNLOCK_KILLS} slimes).`, () => this.showEmpowerIntro(true));
    row('🔒', 'Unlocking Events', 'How to open the Events tab.', () => this.showEventsLocked());
    row('🎉', 'Events', 'Guardian Challenges, swarms and cooldowns.', () => this.showEventsIntro(true));
    // The story so far, once you've seen it.
    if ((this.game.state.events['guardian-rift']?.completed ?? 0) > 0) row('⏳', 'The Time Eater', 'Replay the cutscene from the Void Rift.', () => playCutscene(TIME_EATER_CUTSCENE));
  }

  private buildWeaponGuide(body: HTMLElement): void {
    const intro = el('div', 'card setting');
    intro.innerHTML = `<p>Every hit starts from the weapon's own damage (the starting Short Sword and Short Bow: 1), which upgrading it raises; training, skills, Upgrades and armor or accessory bonuses multiply it. Heavier types have higher base damage for their rarity.</p><p>Your Hunter can wield any weapon and attacks the way it does. Guild Hunters keep their own signature attack; their weapon's type reshapes its speed, damage and range.</p><p>Every type trades speed, damage, reach and crowd hits, so none is simply best. Melee hits knock surviving monsters back.</p>`;
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
        card.innerHTML = `<div class="setting-name">${CLASS_ICONS[id]} ${c.name}</div><p>${c.describe}</p><div class="tut-traits">${weaponTraits(c)
          .map((t) => `<span class="tut-trait">${t}</span>`)
          .join('')}</div>${known.length ? `<p class="tut-examples">${known.map((gd) => `${gd.icon} ${gd.name}`).join(' · ')}</p>` : ''}`;
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

  /** Puts per-player preferences into effect (e.g. which side Train buttons sit on). */
  private applySettings(): void {
    document.body.classList.toggle('left-handed', this.game.state.settings.leftHanded);
    mainHunterName = this.game.state.settings.name.trim();
    applyFont(this.game.state.settings.font);
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

    const tutorials = el('button', 'card tut-row');
    tutorials.innerHTML = `<span class="tut-icon">📖</span><span class="tut-text"><b>Tutorials</b><small>Replay the tips, and guides to weapon types, damage types and status effects.</small></span><span class="tut-go">›</span>`;
    tutorials.addEventListener('click', () => this.openTutorials());
    body.appendChild(tutorials);

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
    hand.innerHTML = `<div class="setting-name">Handedness</div><p>Which side of the Hunter cards the Train button sits on.</p><div class="segmented"><button data-v="left">✋ Left-handed</button><button data-v="right">Right-handed 🤚</button></div>`;
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
    const styles: Array<[IndicatorStyle, string]> = [['fancy', '✨ Fancy'], ['basic', 'Basic']];
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
      'Cooldown icons',
      "Icons for abilities that recharge (like Reginald's potions, Glimmer's fireballs and item abilities). They grey out when used and refill from the top down.",
      () => st.cooldowns,
      (on) => (st.cooldowns = on),
      [
        { label: 'Position', opts: COOLDOWN_POSITIONS.map((p) => [p, p[0].toUpperCase() + p.slice(1)]), get: () => st.cooldownPos, set: (v) => (st.cooldownPos = v as CooldownPos) },
        { label: 'Style', opts: styles, get: () => st.cooldownStyle, set: (v) => (st.cooldownStyle = v as IndicatorStyle) },
      ],
    );
    group(
      'Reload indicator',
      'Text over a Hunter waiting on their weapon: "RELOADING!" (pistols, rifles, repeaters), "RECHARGING!" (staffs) or "SUMMONING!" (tomes). It fades from right to left as the wait runs out.',
      () => st.reloads,
      (on) => (st.reloads = on),
      [
        { label: 'Position', opts: [['above', 'Above'], ['below', 'Below']], get: () => st.reloadPos, set: (v) => (st.reloadPos = v as 'above' | 'below') },
        { label: 'Style', opts: styles, get: () => st.reloadStyle, set: (v) => (st.reloadStyle = v as IndicatorStyle) },
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
      ['burn', '🔥 Burning embers'],
      ['poison', '☠️ Poison bubbles'],
      ['bleed', '🩸 Bleeding drips'],
      ['chill', '❄️ Frost tint'],
      ['acid', '🧪 Acid puddles'],
      ['radiant', '✨ Radiant bursts'],
      ['decay', '🍂 Decay aura'],
      ['arcane', '🔮 Arcane sparks'],
    ]);
    choices('Area effect style', 'Fancy draws puddles, fireballs, explosions, bursts and auras as clusters of coloured pixel squares; Basic draws them as plain circles.', styles, () => st.aoeStyle, (v) => (st.aoeStyle = v));

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
    if (!this.modalClose) return this.closePicker() || this.closeHunterDetail() || this.setMenuFull(false);
    this.modalClose();
    return true;
  }

  /**
   * Welcome back: the gold and materials gained while away. "Details" opens the breakdown by area: who hunted
   * there, the monsters they slew, and what each area paid out.
   */
  showOffline(r: OfflineResult): void {
    const capped = r.away > r.seconds;
    const mats = (Object.entries(r.materials) as [MaterialId, number][]).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
    // A few materials get their names; more than fit are icons and counts, two columns going down.
    const compact = mats.length > 6;
    const matsHtml = mats.length
      ? `<div class="offline-mats${compact ? ' compact' : ''}">${mats
          .map(([m, n]) => `<div class="offline-mat" title="${materialDef(m).name}">${gemHtml(m)}${compact ? '' : `<span>${materialDef(m).name}</span>`}<b>+${fmt(n)}</b></div>`)
          .join('')}</div>`
      : '';
    const rows = r.areas
      .map((a) => {
        const name = (h: (typeof a.hunters)[number]) => (h === 'main' ? esc(mainName()) : `${hunterDef(h).icon} ${hunterDef(h).name}`);
        const who = a.hunters.map(name).join(' + ');
        // Only Hunters that were actually knocked out get a count.
        const kos = a.hunters
          .filter((h) => (a.knockouts[h] ?? 0) > 0)
          .map((h) => `${name(h)} ×${fmt(a.knockouts[h]!)}`)
          .join(', ');
        const am = (Object.entries(a.materials) as [MaterialId, number][])
          .filter(([, n]) => n > 0)
          .map(([m, n]) => `${gemHtml(m)}${fmt(n)}`)
          .join(' ');
        return `<div class="offline-area"><div><b>${areaDef(a.area).icon} ${areaDef(a.area).name}</b> <small>${who}</small></div><div>⚔️ ${fmt(a.kills)} monsters slain · 🪙 ${fmt(a.gold)}</div>${am ? `<div>${am}</div>` : ''}${
          kos ? `<div class="knockouts">💫 Knocked out: ${kos}</div>` : ''
        }</div>`;
      })
      .join('');
    this.showModal(
      `<h2>Welcome back!</h2>
       <p>You were away for ${fmtTime(r.away)}.${capped ? ` (Hunters rest after ${fmtTime(r.seconds)}.)` : ''}</p>
       <div class="reward">+🪙 ${fmt(r.gold)}</div>
       ${matsHtml}
       ${r.knockouts > 0 ? '<p class="ko-tip">💫 Some Hunters were knocked out while you were away. See Details.</p>' : ''}
       <button class="secondary offline-details-btn">Details ▾</button>
       <div class="offline-details hidden">
         <p class="offline-total">⚔️ ${fmt(r.kills)} monsters slain in all</p>
         <div class="offline-areas">${rows}</div>
         ${r.knockouts > 0 ? '<p class="ko-tip">Knocked-out Hunters stop fighting. Get stronger (or pick an easier area) to keep monsters from slipping through.</p>' : ''}
       </div>`,
      [{ label: 'Collect' }],
    );
    const btn = $('.offline-details-btn', this.modal);
    btn.addEventListener('click', () => {
      const open = $('.offline-details', this.modal).classList.toggle('hidden') === false;
      btn.textContent = open ? 'Hide details ▴' : 'Details ▾';
    });
  }
}

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
  const st = gearStats(gd, it.stars);
  const other = vs ? gearStats(gearDef(vs.base), vs.stars) : {};
  const keys = [...new Set([...Object.keys(st), ...(vs ? Object.keys(other) : [])])] as GearStat[];
  const lines = keys
    .map((k) => {
      const a = st[k] ?? 0;
      const b = other[k] ?? 0;
      const d = a - b;
      const shown = a > 0 && describeGear({ [k]: a }) ? GEAR_STATS[k](a) : `<s>no ${STAT_LABELS[k]}</s>`;
      const cmp = vs && Math.abs(d) > 1e-9 ? `<span class="${d > 0 ? 'up' : 'down'}">${d > 0 ? '▲' : '▼'} ${statDelta(k, d)}</span>` : '';
      return `<li>${shown}${cmp}</li>`;
    })
    .join('');
  // A weapon's base damage per hit comes first (compared with the weapon it would replace).
  const hit = weaponHit(gd, it.stars);
  const otherHit = vs ? weaponHit(gearDef(vs.base), vs.stars) : 0;
  const hitLine = hit
    ? `<li><b>${hitText(hit)}</b>${vs && otherHit && Math.abs(hit - otherHit) > 1e-9 ? `<span class="${hit > otherHit ? 'up' : 'down'}">${hit > otherHit ? '▲' : '▼'} ${Number(Math.abs(hit - otherHit).toFixed(2))}</span>` : ''}</li>`
    : '';
  const all =
    hitLine +
    lines +
    (gd.damageType && gd.proc && DAMAGE_TYPES[gd.damageType].effect
      ? `<li class="gc-effect">${DAMAGE_TYPES[gd.damageType].icon} ${Math.round(gd.proc * 100)}% chance · ${DAMAGE_TYPES[gd.damageType].effect}</li>`
      : '');
  return `<div class="gear-card rar" style="--rc:${gearColor(gd.id)}"><div class="gc-head"><i>${gd.icon}</i><div><b>${gd.name}</b><small>${RARITIES[gd.rarity].name} ${gearKindName(gd).toLowerCase()} · <span class="stars">${starsHtml(it.stars)}</span></small>${dtypeTag(gd)}</div></div><ul class="gc-stats">${all}</ul></div>`;
}

/** Your Hunter's name (Settings), shown on their card and wherever they're named. */
let mainHunterName = '';
const mainName = () => mainHunterName || 'You';
export const MAX_NAME_LENGTH = 16;

/** Escapes text typed by the player before it goes into HTML. */
function esc(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}


/** A piece's kind for display: its weapon class ("Longbow") or its gear kind ("Armor"). */
const gearKindName = (gd: GearDef): string => (gd.weaponClass ? WEAPON_CLASSES[gd.weaponClass].name : GEAR_KINDS[gd.kind].name);

/** How a weapon attacks (for your Hunter), or '' for other gear. */
const weaponLine = (gd: GearDef): string =>
  (gd.weaponClass ? `<p class="weapon-line">⚔️ ${WEAPON_CLASSES[gd.weaponClass].describe}</p>` : '') + (gd.ability ? `<p class="weapon-line">✨ ${gd.ability}</p>` : '');

/** What counts toward unlocking an event: its archetype ("slimes") or any monster. */
const unlockNoun = (ev: EventDef): string => (ev.unlockArchetype ? `${ARCHETYPES[ev.unlockArchetype].name.toLowerCase()}s` : 'monsters');

/** How many not-yet-recruited Hunters the Hunters tab shows. */
const NEXT_HUNTERS_SHOWN = 3;

/** What a Hunter needs before they can be recruited, e.g. "Beat the Old Graveyard Guardian (1/2)". */
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

function wearerName(who: Wearer): string {
  return who === 'main' ? esc(mainName()) : hunterDef(who).name;
}

function wearerIcon(who: Wearer): string {
  return who === 'main' ? '🧑' : hunterDef(who).icon;
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

/** What a monster drops. */
function dropHtml(e: EnemyDef): string {
  return `<div class="drop-line">${gemHtml(e.material)} Drops <b>${materialDef(e.material).name}</b></div>`;
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
  return `<span class="dtype-tag" style="--dc:${d.color}" title="${d.name}">${d.icon}<span class="dt-name"> ${d.name}</span></span>`;
}

/** Shows a compact affinity row with names if it fits on one line, else icons only. */
function fitAffinities(row: HTMLElement): void {
  row.classList.remove('icons');
  if (row.clientWidth > 0 && row.scrollWidth > row.clientWidth + 1) row.classList.add('icons');
}

/** Keeps every compact affinity row fitted: when it appears, when its width changes, and when the font changes. */
const affinityResize = typeof ResizeObserver !== 'undefined' ? new ResizeObserver((entries) => entries.forEach((e) => fitAffinities(e.target as HTMLElement))) : null;
function refitAffinities(): void {
  document.querySelectorAll<HTMLElement>('.affinities.compact').forEach(fitAffinities);
}
if (typeof MutationObserver !== 'undefined' && typeof document !== 'undefined')
  new MutationObserver((muts) => {
    for (const m of muts)
      m.addedNodes.forEach((n) => {
        if (!(n instanceof HTMLElement)) return;
        const rows = n.matches('.affinities.compact') ? [n] : Array.from(n.querySelectorAll<HTMLElement>('.affinities.compact'));
        for (const row of rows) {
          affinityResize?.observe(row);
          fitAffinities(row);
        }
      });
  }).observe(document.body, { childList: true, subtree: true });

/** A weapon's damage type as a small coloured tag ('' for gear without one). */
function dtypeTag(gd: GearDef): string {
  return gd.damageType ? damageTypeHtml(gd.damageType) : '';
}

function damageTypeHtml(t: DamageType): string {
  const d = DAMAGE_TYPES[t];
  return `<span class="dtype-tag" style="--dc:${d.color}">${d.icon} ${d.name}</span>`;
}

/** A recipe as one line per material: its gem and name, and how many you hold of how many it takes. */
function recipeHtml(g: Game, cost: Partial<Record<MaterialId, number>>): string {
  return (Object.entries(cost) as [MaterialId, number][])
    .map(([m, n]) => `<div class="fc-mat${g.state.materials[m] < n ? ' short' : ''}">${gemHtml(m)}<span>${materialDef(m).name}</span><b>${fmt(g.state.materials[m])} / ${fmt(n)}</b></div>`)
    .join('');
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
  else if (c.attack === 'nova') out.push('📏 Around the Hunter');
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
