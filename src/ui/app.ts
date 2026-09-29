import {
  EMPOWER_LEVEL,
  EMPOWER_UNLOCK_KILLS,
  enemyDef,
  EMPOWER,
  type EnemyId,
  type TreeNode,
  RESIST_MULT,
  WEAK_MULT,
  DAMAGE_TYPES,
  type DamageType,
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
  GEAR_MAX_LEVEL,
  gearCost,
  gearColor,
  gearDef,
  gearStats,
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
import { fmt, fmtTime } from '../core/format';
import type { FarmRates, Game } from '../core/game';
import type { OfflineResult } from '../core/offline';
import { TAB_IDS, type BuyAmount, type GearItem, type TabId, type Wearer } from '../core/state';
import { drawEnemyPortrait } from '../render/battle';
import { spriteUrl } from '../render/sprites';
import { applyAreaTheme } from './theme';

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
}
const INV_SUBS = ['materials', 'equipment', 'crafting'] as const;
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
  { id: '1-3', name: 'Lv 1–3', min: 1, max: 3 },
  { id: '4-6', name: 'Lv 4–6', min: 4, max: 6 },
  { id: '7-9', name: 'Lv 7–9', min: 7, max: 9 },
  { id: '10+', name: 'Lv 10+', min: 10, max: Infinity },
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

const gemHtml = (m: MaterialId) => `<i class="gem" style="background:${materialDef(m).color}"></i>`;

/** DOM layer: top bar, area controls, tabbed panels and modals. Refreshes numbers on a timer. */
export class AppUI {
  private refreshers: Array<() => void> = [];
  private panel = $('#panel');
  private modal = $('#modal');
  private modalClose: (() => void) | null = null;
  /** The open full-screen Hunter view, with its own refreshers. */
  private detail: { el: HTMLElement; refreshers: Array<() => void> } | null = null;
  /** The full-screen gear picker, above the Hunter view. */
  private picker: HTMLElement | null = null;
  private tab: Tab = 'hunters';
  /** The open sub-tab of the Inventory tab. */
  private invSub: InvSub = 'materials';
  /** Filters on the Inventory's Equipment sub-tab (kept for the session). */
  private invFilter: InvFilter = { ...NO_FILTER };
  /** The area selected in the Areas tab. */
  private selectedArea: AreaId | null = null;

  constructor(
    private game: Game,
    private hooks: { save: () => void; wipe: () => Promise<void> },
  ) {
    document.querySelectorAll<HTMLButtonElement>('.tabs button').forEach((b) =>
      b.addEventListener('click', () => {
        if (b.dataset.tab === 'events' && !game.eventsOpen) this.showEventsLocked();
        else this.setTab(b.dataset.tab as Tab);
      }),
    );
    $('#settingsBtn').addEventListener('click', () => this.openSettings());
    this.applySettings();
    // Panels that depend on which areas/enemies/Hunters exist are rebuilt when those change.
    game.on((e) => {
      if (e.type === 'areaUnlocked' || e.type === 'travel' || e.type === 'unlock' || e.type === 'recruit') this.setTab(this.tab, true);
      else if (e.type === 'eventComplete') this.setTab(this.tab, true); // may have made Hunters available
      else if (e.type === 'eventStart' || e.type === 'eventEnd' || e.type === 'guardianFail') this.refresh();
    });
    this.setTab('hunters');
  }

  setTab(tab: Tab, keepScroll = false): void {
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
    $('#dps').textContent = fmt(g.dps);
    $('#areaName').textContent = area.name;
    applyAreaTheme(g.area);

    $('.tabs button[data-tab=events]').classList.toggle('locked', !g.eventsOpen);
    if (g.eventsOpen && !s.flags.eventsIntro && !this.modalClose && !this.detail) this.showEventsIntro();
    else if (!s.flags.trainIntro && s.flags.welcome && !this.modalClose && !this.detail && s.gold >= g.trainPurchase('main', 1).cost) this.showTrainIntro();
    else if (!s.flags.empowerIntro && g.empowerUnlocked && !this.modalClose && !this.detail) this.showEmpowerIntro();
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
      if (g.train(who)) this.refresh();
    });
    this.refreshers.push(() => {
      const p = g.trainPurchase(who);
      const { level, into, need } = g.levelInfo(who);
      btn.innerHTML = `Train${p.count > 1 ? ` ×${p.count}` : ''}<small>🪙 ${fmt(p.cost)}</small>`;
      btn.disabled = g.state.gold < p.cost;
      $('i', bar).style.width = `${(into / need) * 100}%`;
      // The card's bar is just the bar; the numbers are in the full view.
      $('span', bar).textContent = compact ? '' : `Lv ${level} · ${into}/${need} to Lv ${level + 1}`;
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
          <div class="hc-name">${def ? `${def.name} <small>the ${def.title}</small>` : `${esc(mainName())} <small>the Monster Hunter</small>`}</div>
          <div class="hc-ability">${def ? def.ability : MAIN_ABILITY}</div>
          <div class="hc-status"></div>
        </div>
      </div>
      <div class="hc-train"><span class="hc-lv"></span><div class="hc-mid"></div><div class="hc-action"></div></div>
      <div class="hc-gear"></div>
      <b class="sp-dot hidden" title="Unspent skill points"></b>`;
    card.addEventListener('click', () => this.openHunterDetail(who));
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
        status.textContent = open ? 'Available to recruit' : `📍 ${areaDef(def.area).name}`;
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
      const k = items.map((it) => (it ? `${it.uid}:${it.level}` : '-')).join('|');
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
    const view = el('div', 'hunter-detail');
    view.innerHTML = `
      <div class="hd-top"><button class="hd-close" aria-label="Close">✕</button><span>${def ? 'Hunters' : 'Your Hunter'}</span></div>
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
      </div>`;
    document.body.appendChild(view);
    $('.hd-close', view).addEventListener('click', () => this.closeHunterDetail());
    this.detail = { el: view, refreshers: [] };
    const pane = (name: string) => $(`.hd-body[data-sub=${name}]`, view);
    const show = (name: string) => {
      view.querySelectorAll<HTMLElement>('.subtabs button').forEach((b) => b.classList.toggle('on', b.dataset.sub === name));
      view.querySelectorAll<HTMLElement>('.hd-body').forEach((b) => b.classList.toggle('hidden', b.dataset.sub !== name));
    };
    view.querySelectorAll<HTMLButtonElement>('.subtabs button').forEach((b) => b.addEventListener('click', () => show(b.dataset.sub!)));
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

    // Skills
    pane('skills').appendChild(this.treeView(this.hunterTree(who)));

    const spCount = $('.sp-count', view);
    this.refreshers.push(() => {
      const points = recruited ? g.skillPoints(who) : 0;
      spCount.textContent = String(points);
      spCount.classList.toggle('hidden', points <= 0);
      const station = def ? g.state.hunters[def.id].station : g.area;
      $('.hd-sub', view).innerHTML = [
        `<span>${def ? `the ${def.title}` : 'the Monster Hunter'}${recruited ? ` · Lv ${g.levelOf(who)}` : ''}</span>`,
        recruited ? `<span class="where">${station ? `📍 ${areaDef(station).name}` : '💤 Resting'}</span>` : '',
        def && hunterPerk(def) ? `<span class="perk">${hunterPerk(def)}</span>` : '',
      ].join('');
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
  private hunterTree(who: Wearer): TreeAdapter {
    const g = this.game;
    return {
      nodes: g.skillTree(who),
      rank: (id) => g.skill(who, id),
      points: () => g.skillPoints(who),
      active: () => who === 'main' || g.state.hunters[who].recruited,
      inactiveText: 'Recruit them to start spending skill points.',
      waitText: () => `Next skill point at Lv ${g.levelOf(who) + 1}. Train to level up.`,
      pointName: 'skill point',
      reachable: (id) => g.nodeReachable(who, id),
      canLearn: (id) => g.canLearn(who, id),
      learn: (id) => g.learn(who, id),
      verb: 'Learn',
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
        return `<line data-from="${r}" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" vector-effect="non-scaling-stroke" />`;
      }),
    );
    tree.innerHTML = `<svg viewBox="0 0 300 ${H}" preserveAspectRatio="none">${lines.join('')}</svg>`;
    const buttons = nodes.map((n) => {
      const b = el('button', 'tnode') as HTMLButtonElement;
      const p = pos(n);
      b.style.left = `${(p.x / 300) * 100}%`;
      b.style.top = `${p.y}px`;
      b.innerHTML = `<span class="tn-icon">${n.icon}<em></em></span><span class="tn-name">${n.name}</span>`;
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
        $('em', b).textContent = `${rank}/${n.maxRank}`;
      }
      tree.querySelectorAll<SVGLineElement>('line').forEach((l) => l.classList.toggle('on', t.rank(l.dataset.from!) > 0));
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
      const btn = el('button', 'buy', rank >= n.maxRank ? 'Maxed' : `${t.verb} · 1 ${t.pointName} (${Math.max(0, t.points())} left)`) as HTMLButtonElement;
      btn.style.width = '100%';
      btn.disabled = !t.canLearn(n.id);
      btn.addEventListener('click', () => {
        if (!t.learn(n.id)) return;
        close();
        this.openTreeNode(t, n);
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
      const k = items.map((it) => (it ? `${it.uid}:${it.level}` : '-')).join('|');
      if (k === key) return;
      key = k;
      rows.forEach(({ slot, b }, i) => {
        const it = items[i];
        const gd = it ? gearDef(it.base) : null;
        b.classList.toggle('empty', !it);
        b.classList.toggle('rar', !!it);
        b.style.setProperty('--rc', gd ? gearColor(gd.id) : '');
        b.innerHTML = `<i>${gd ? gd.icon : GEAR_KINDS[slot.kind].icon}</i><div><small>${slot.label}</small><b>${gd ? gd.name : 'Empty'}</b><span class="sub">${
          gd && it ? `${dtypeTag(gd)}${RARITIES[gd.rarity].name} · Lv ${it.level} · ${describeGear(gearStats(gd, it.level))}` : 'Tap to equip'
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
    const view = el('div', 'hunter-detail picker');
    view.innerHTML = `
      <div class="hd-top"><button class="hd-close" aria-label="Close">✕</button><span>${wearerName(who)} · ${def.label}</span></div>
      <div class="hd-scroll">
        <div class="section-title"><span>Equipped</span></div>
        <div class="pk-equipped"></div>
        <div class="section-title pk-inspect-title"><span>Inspecting</span></div>
        <div class="pk-inspect"></div>
        <div class="section-title"><span>Inventory</span><span class="pk-count"></span></div>
        <div class="inventory pk-grid"></div>
      </div>`;
    document.body.appendChild(view);
    this.picker = view;
    $('.hd-close', view).addEventListener('click', () => this.closePicker());
    const fits = (it: GearItem) => slotAccepts(def, gearDef(it.base).kind);
    // Start on the best piece that fits and nobody is wearing.
    let selected: number | null =
      g.state.inventory.filter((it) => fits(it) && !g.wearerOf(it.uid)).sort((a, b) => b.level - a.level)[0]?.uid ?? null;

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
      const inv = [...g.state.inventory].sort((a, b) => Number(fits(b)) - Number(fits(a)) || b.level - a.level);
      $('.pk-count', view).textContent = `${inv.length} item${inv.length === 1 ? '' : 's'}`;
      if (!inv.length) grid.innerHTML = '<p class="empty-inv">Empty. Craft gear in Inventory → Crafting.</p>';
      for (const it of inv) {
        const gd = gearDef(it.base);
        const worn = g.wearerOf(it.uid);
        const tile = el('button', `inv-tile rar${fits(it) ? '' : ' misfit'}${it.uid === selected ? ' selected' : ''}`) as HTMLButtonElement;
        tile.style.setProperty('--rc', gearColor(gd.id));
        tile.innerHTML = `<i>${gd.icon}</i><span>${gd.name}</span><small>Lv ${it.level}</small>${worn ? `<em>${wearerIcon(worn.who)}</em>` : ''}`;
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
        <p>${dtypeTag(gd)}<b class="rarity-tag" style="--rc:${gearColor(gd.id)}">${RARITIES[gd.rarity].name}</b> ${GEAR_KINDS[gd.kind].name} · Lv ${item.level} / ${GEAR_MAX_LEVEL}${worn ? ` · worn by ${wearerName(worn.who)}` : ''}</p>
        <p class="gear-now">${describeGear(gearStats(gd, item.level))}</p>
        ${cost ? `<p class="gear-next">Next: <b>${describeGear(gearStats(gd, item.level + 1))}</b></p><div class="cost">${costHtml(g, cost)}</div>` : '<p>Fully upgraded.</p>'}`;
      const actions = el('div', 'actions');
      if (cost) {
        const up = el('button', 'buy', 'Upgrade') as HTMLButtonElement;
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
      tile.addEventListener('click', () => {
        if (!g.isAreaUnlocked(a.id)) return;
        this.selectedArea = a.id;
        this.setTab('areas', true);
      });
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
    panel.innerHTML = `<h3><span>${a.icon} ${a.name}</span></h3><p>${a.blurb}</p><div class="monster-icons"></div>`;
    this.panel.appendChild(panel);
    // Details and Travel sit in a bar pinned to the bottom of the menu, so they're in reach wherever you've scrolled.
    const bar = el('div', 'area-actions');
    bar.innerHTML = `<span class="aa-name">${a.icon} ${a.name}</span><div class="actions"><button class="buy secondary-btn details">Details</button><button class="buy travel">Travel</button></div>`;
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
              unlocked ? `Run ${fmt(st.runs)} time${st.runs === 1 ? '' : 's'} · completed ${fmt(st.completed)}` : `🔒 Unlocks at ${fmt(e.unlockKills)} slain here`
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
      row.innerHTML = `<canvas class="portrait"></canvas><div class="info"><div class="name">${known ? e.name : '???'} <small>${ARCHETYPES[e.archetype].icon} ${ARCHETYPES[e.archetype].name}</small></div><div class="drop">${gemHtml(e.material)} Drops <b>${known ? mat.name : '???'}</b></div><div class="sub">${known ? e.blurb : 'Unlock it in the Bestiary.'}</div>${known ? affinityHtml(e) : ''}</div>`;
      monsters.appendChild(row);
      requestAnimationFrame(() => drawEnemyPortrait($<HTMLCanvasElement>('canvas', row), e.id));
    }

    this.refreshers.push(() => {
      const st = g.state.areas[id];
      const next = nextAreaOf(id);
      const cleared = !next || g.isAreaUnlocked(next.id);
      mastery.innerHTML = cleared
        ? `<div class="mastery done"><span>${next ? '✓ Guardian defeated' : '✓ The final area'}</span></div>`
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
        <div class="active-slots assign-slots"></div>
        <div class="section-title"><span>Your Hunters</span></div>
        <div class="assign-grid"></div>
      </div>`;
    document.body.appendChild(view);
    this.picker = view;
    $('.hd-close', view).addEventListener('click', () => this.closePicker());
    let selected: HunterId | null = preselect;
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
        <div class="info"><div class="name"></div><div class="blurb">${def.blurb}</div>${dropHtml(def)}</div>
      </div>
      ${affinityHtml(def)}
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
      card.appendChild(dot);
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
      if (g.empower(id)) this.refresh();
    });
    this.refreshers.push(() => {
      const p = g.empowerPurchase(id);
      const { level, into, need } = g.monsterLevelInfo(id);
      if (g.empowerUnlocked) btn.innerHTML = `Empower${p.count > 1 ? ` ×${p.count}` : ''}<small>🪙 ${fmt(p.cost)}</small>`;
      else btn.innerHTML = `🔒 Empower<small>${fmt(g.slimeKills)}/${EMPOWER_UNLOCK_KILLS} slimes</small>`;
      btn.disabled = !g.empowerUnlocked || g.state.gold < p.cost || !g.isUnlocked(id);
      $('i', bar).style.width = `${(into / need) * 100}%`;
      $('span', bar).textContent = compact ? '' : `Lv ${level} · ${into}/${need} to Lv ${level + 1}`;
    });
    return { btn, bar };
  }

  /** Full-screen monster view: Empower, what it's worth now, and its evolution tree. */
  private openMonsterDetail(id: EnemyId): void {
    if (this.detail) this.dropDetail();
    const g = this.game;
    const def = enemyDef(id);
    const arch = ARCHETYPES[def.archetype];
    const view = el('div', 'hunter-detail');
    view.innerHTML = `
      <div class="hd-top"><button class="hd-close" aria-label="Close">✕</button><span>Bestiary</span></div>
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
      </div>`;
    document.body.appendChild(view);
    requestAnimationFrame(() => drawEnemyPortrait($<HTMLCanvasElement>('canvas', view), id));
    $('.hd-close', view).addEventListener('click', () => this.closeHunterDetail());
    this.detail = { el: view, refreshers: [] };
    const body = $('.hd-scroll', view);
    const main = this.refreshers;
    this.refreshers = [];

    body.appendChild(sectionTitle('Empower'));
    body.appendChild(
      el(
        'p',
        'hd-note',
        g.empowerUnlocked
          ? `Each session: +${EMPOWER.hp * 100}% HP, +${EMPOWER.gold * 100}% gold and +${EMPOWER.drops * 100}% material drops, and every level multiplies them (×${EMPOWER_LEVEL.hp} HP, ×${EMPOWER_LEVEL.gold} gold, ×${EMPOWER_LEVEL.drops} drops). Every level earns an evolution point.`
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

    body.appendChild(sectionTitle('Evolution'));
    body.appendChild(this.treeView(this.monsterTree(id)));

    this.refreshers.push(() => {
      const st = g.enemyStats(id);
      const evo = g.evo(id);
      const [lo, hi] = g.packOf(id);
      $('.hd-sub', view).innerHTML = `<span>${arch.icon} ${arch.name} · Lv ${g.monsterLevelInfo(id).level}</span><span class="where">📍 ${areaDef(def.area).name}</span>`;
      const cells: Array<[string, string]> = [
        ['Slain', fmt(g.state.bestiary[id].kills)],
        ['HP', fmt(st.hp)],
        ['Gold', fmt(st.gold)],
        ['Drop chance', `${(st.dropChance * 100).toFixed(1)}%`],
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

  // ---- Inventory tab: sub-tabs for Materials, Equipment (crafted gear) and Crafting (gear + Upgrades) ----

  private buildInventory(): void {
    const bar = el('div', 'subtabs inv-subtabs');
    bar.innerHTML = `<button data-sub="materials">💎 Materials</button><button data-sub="equipment">🛡️ Equipment</button><button data-sub="crafting">🔨 Crafting <span class="badge dot hidden craft-dot"></span></button>`;
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
        this.panel.scrollTop = 0;
      }),
    );
    this.buildMaterials(panes.materials);
    this.buildGearList(panes.equipment);
    this.buildCrafting(panes.crafting);
    show(this.invSub);
  }

  /** Every material, with how many you hold and which monster drops it (hidden until you've met it). */
  private buildMaterials(pane: HTMLElement): void {
    const g = this.game;
    const mats = el('div', 'mats');
    pane.appendChild(mats);
    pane.appendChild(el('p', 'hd-note', 'Monsters drop materials when slain. Spend them in Crafting.'));
    this.refreshers.push(() => {
      mats.innerHTML = MATERIALS.map((m) => {
        const source = ENEMIES.find((e) => e.material === m.id)!;
        const known = g.isUnlocked(source.id) || g.state.materials[m.id] > 0;
        const hint = g.isAreaUnlocked(source.area) ? `${source.name}s` : '???';
        return `<div class="mat ${known ? '' : 'unknown'}">${gemHtml(m.id)}<span>${known ? m.name : hint}</span><b>${known ? fmt(g.state.materials[m.id]) : ''}</b></div>`;
      }).join('');
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
          it.level >= lv.min &&
          it.level <= lv.max
        );
      });
      // Upgrades have no rarity or damage type, so those filters hide them.
      const upgrades =
        (f.type === 'all' || f.type === 'upgrades') && f.rarity === 'any' && f.dtype === 'any'
          ? ITEMS.filter((it) => g.state.items[it.id] > 0 && g.state.items[it.id] >= lv.min && g.state.items[it.id] <= lv.max)
          : [];
      const k = [
        JSON.stringify(f),
        gear.map((it) => `${it.uid}:${it.level}:${g.wearerOf(it.uid)?.who ?? ''}`).join('|'),
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
        tile.innerHTML = `<i>${gd.icon}</i><span>${gd.name}</span><small>Lv ${it.level}</small>${worn ? `<em>${wearerIcon(worn.who)}</em>` : ''}`;
        tile.addEventListener('click', () => this.openGearDetail(it.uid));
        inv.appendChild(tile);
      }
      for (const it of upgrades) {
        const tile = el('button', 'inv-tile upgrade') as HTMLButtonElement;
        tile.innerHTML = `<i>${it.icon}</i><span>${it.name}</span><small>Lv ${g.state.items[it.id]}</small><em>⛺</em>`;
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
      const maxed = lv >= it.maxLevel;
      body.innerHTML = `<p class="gear-now">Permanent upgrade · Lv ${lv} / ${it.maxLevel}</p><p><b>${it.describe(lv)}</b>${maxed ? '' : ` → ${it.describe(lv + 1)}`}</p>${
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
  private buildCrafting(pane: HTMLElement): void {
    const g = this.game;
    pane.appendChild(sectionTitle('Craft Equipment'));
    for (const gd of GEAR) this.buildGearRecipe(gd, pane);
    const lockedGear = GEAR.filter((gd) => !this.gearKnown(gd)).length;
    if (lockedGear) {
      const teaser = el('div', 'card');
      teaser.innerHTML = `<p style="margin:0">🔒 ${lockedGear} more recipes need materials from monsters you haven't met yet.</p>`;
      pane.appendChild(teaser);
    }

    pane.appendChild(sectionTitle('Upgrades'));
    for (const it of ITEMS) {
      const row = el('div', 'row');
      row.innerHTML = `<div class="icon">${it.icon}</div><div class="info"><div class="name"></div><div class="sub"></div><div class="cost"></div></div><button class="buy">Craft</button>`;
      const btn = $<HTMLButtonElement>('.buy', row);
      btn.addEventListener('click', () => g.craft(it.id) && this.refresh());
      pane.appendChild(row);
      this.refreshers.push(() => {
        const lv = g.state.items[it.id];
        const maxed = lv >= it.maxLevel;
        $('.name', row).innerHTML = `${it.name} <small>${lv ? `Lv ${lv}` : 'not crafted'}${maxed ? ' · MAX' : ''}</small>`;
        $('.sub', row).innerHTML = lv ? `${it.describe(lv)}${maxed ? '' : ` → <b>${it.describe(lv + 1)}</b>`}` : `<b>${it.describe(1)}</b>`;
        const cost = itemCost(it, lv);
        $('.cost', row).innerHTML = maxed
          ? ''
          : (Object.entries(cost) as [MaterialId, number][])
              .map(([m, n]) => `<span class="${g.state.materials[m] < n ? 'short' : ''}">${gemHtml(m)}${fmt(g.state.materials[m])}/${fmt(n)}</span>`)
              .join('');
        btn.textContent = maxed ? 'MAX' : lv ? 'Upgrade' : 'Craft';
        btn.disabled = !g.canCraft(it.id);
      });
    }
  }

  /** Recipes are shown once every material in them comes from a monster you've unlocked (or you hold some). */
  private gearKnown(gd: GearDef): boolean {
    const g = this.game;
    return (Object.keys(gd.recipe) as MaterialId[]).every((m) => g.state.materials[m] > 0 || ENEMIES.some((e) => e.material === m && g.isUnlocked(e.id)));
  }

  private buildGearRecipe(gd: GearDef, parent: HTMLElement): void {
    if (!this.gearKnown(gd)) return;
    const g = this.game;
    const row = el('div', 'row');
    row.innerHTML = `<div class="icon">${gd.icon}</div><div class="info"><div class="name"><span style="color:${gearColor(gd.id)}">${gd.name}</span> <small>${RARITIES[gd.rarity].name} ${GEAR_KINDS[gd.kind].name.toLowerCase()}</small> ${dtypeTag(gd)}</div><div class="sub"><b>${describeGear(gearStats(gd, 1))}</b> per level</div><div class="cost"></div></div><button class="buy">Craft</button>`;
    const btn = $<HTMLButtonElement>('.buy', row);
    btn.addEventListener('click', () => g.craftGear(gd.id) && this.refresh());
    parent.appendChild(row);
    this.refreshers.push(() => {
      $('.cost', row).innerHTML = costHtml(g, gearCost(gd, 0));
      btn.disabled = !g.canCraftGear(gd.id);
    });
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
      const kills = g.state.areas[ev.area].kills;
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
        status.innerHTML = `<div class="mastery"><i style="width:${Math.min(1, kills / ev.unlockKills) * 100}%"></i><span>🔒 Slay ${fmt(kills)} / ${fmt(ev.unlockKills)} here</span></div>`;
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

  /** Tapping the greyed-out Events tab explains how to open it. */
  private showEventsLocked(): void {
    const forest = areaDef('forest');
    const kills = Math.min(this.game.state.areas.forest.kills, forest.mastery);
    this.showModal(`<h2>🔒 Events</h2><p>Slay ${fmt(forest.mastery)} monsters in the ${forest.name} to unlock Events and the Guardian Challenge.</p><p><b>${fmt(kills)} / ${fmt(forest.mastery)}</b></p>`, [{ label: 'OK' }]);
  }

  /** Shown once, the very first time the game opens. */
  showWelcome(): void {
    this.game.state.flags.welcome = true;
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

  /** Shown once, when the 100th slime falls: Empower opens in the Bestiary. */
  private showEmpowerIntro(): void {
    this.game.state.flags.empowerIntro = true;
    if (this.tab === 'beasts') this.setTab('beasts', true);
    this.showModal(
      `<h2>👾 Empower unlocked!</h2>
       <p>You've slain ${EMPOWER_UNLOCK_KILLS} slimes. In the <b>Bestiary</b>, unlock new monsters to join an area's horde, and <b>Empower</b> them with gold: tougher, but they pay more gold and drop more materials.</p>
       <p>Every level earns an <b>evolution point</b>. Tap a monster to evolve it; slaying more of it opens further evolutions. It all applies wherever they're hunted, including by stationed Hunters.</p>`,
      [
        { label: 'Later', secondary: true },
        { label: 'Go to Bestiary', action: () => this.setTab('beasts') },
      ],
    );
  }

  /** Shown once, the first time you can afford to train your Hunter. */
  private showTrainIntro(): void {
    this.game.state.flags.trainIntro = true;
    this.showModal(
      `<h2>💪 Time to train!</h2>
       <p>You have enough gold to <b>Train</b> your Hunter! Tap <b>Train</b> in the Hunters tab to increase your strength!</p>
       <p>After training enough, your Hunter will level up, granting <b>Skill Points</b> that can unlock more power and abilities.</p>
       <p>Open the Hunter's card to see more details, upgrade their abilities, and change their equipment!</p>`,
      [
        { label: 'Later', secondary: true },
        { label: 'Go to Hunters', action: () => this.setTab('hunters') },
      ],
    );
  }

  /** Shown once, when the first Guardian Challenge unlocks. */
  private showEventsIntro(): void {
    this.game.state.flags.eventsIntro = true;
    this.showModal(
      `<h2>🎉 Events unlocked!</h2>
       <p>The <b>Guardian Challenge</b> is ready in the ${areaDef('forest').name}.</p>
       <p>The Events tab shows the events for the area you're in. Slay monsters there to unlock them. After you start one, it goes on cooldown before it can run again. Travel to another area to see its events.</p>`,
      [
        { label: 'Later', secondary: true },
        { label: 'Go to Events', action: () => this.setTab('events') },
      ],
    );
  }

  // ---- Settings ----

  /** Puts per-player preferences into effect (e.g. which side Train buttons sit on). */
  private applySettings(): void {
    document.body.classList.toggle('left-handed', this.game.state.settings.leftHanded);
    mainHunterName = this.game.state.settings.name.trim();
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
    const close = () => {
      this.modal.classList.add('hidden');
      this.modalClose = null;
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
    if (!this.modalClose) return this.closePicker() || this.closeHunterDetail();
    this.modalClose();
    return true;
  }

  showOffline(r: OfflineResult): void {
    const capped = r.away > r.seconds;
    const rows = r.areas
      .map((a) => {
        const name = (h: (typeof a.hunters)[number]) => (h === 'main' ? esc(mainName()) : `${hunterDef(h).icon} ${hunterDef(h).name}`);
        const who = a.hunters.map(name).join(' + ');
        // Only Hunters that were actually knocked out get a count.
        const kos = a.hunters
          .filter((h) => (a.knockouts[h] ?? 0) > 0)
          .map((h) => `${name(h)} ×${fmt(a.knockouts[h]!)}`)
          .join(', ');
        const mats = (Object.entries(a.materials) as [MaterialId, number][])
          .filter(([, n]) => n > 0)
          .map(([m, n]) => `${gemHtml(m)}${fmt(n)}`)
          .join(' ');
        return `<div class="offline-area"><div><b>${areaDef(a.area).name}</b> <small>${who}</small></div><div>🪙 ${fmt(a.gold)} · ${fmt(a.kills)} slain${mats ? ` · ${mats}` : ''}</div>${
          kos ? `<div class="knockouts">💫 Knocked out: ${kos}</div>` : ''
        }</div>`;
      })
      .join('');
    this.showModal(
      `<h2>Welcome back!</h2>
       <p>You were away for ${fmtTime(r.away)}.${capped ? ` (Hunters rest after ${fmtTime(r.seconds)}.)` : ''}</p>
       <div class="reward">+🪙 ${fmt(r.gold)}</div>
       <div class="offline-areas">${rows}</div>
       ${r.knockouts > 0 ? '<p class="ko-tip">Knocked-out Hunters stop fighting. Get stronger (or pick an easier area) to keep monsters from slipping through.</p>' : ''}`,
      [{ label: 'Collect' }],
    );
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
  const st = gearStats(gd, it.level);
  const other = vs ? gearStats(gearDef(vs.base), vs.level) : {};
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
    .join('') +
    (gd.damageType && gd.proc && DAMAGE_TYPES[gd.damageType].effect
      ? `<li class="gc-effect">${DAMAGE_TYPES[gd.damageType].icon} ${Math.round(gd.proc * 100)}% chance · ${DAMAGE_TYPES[gd.damageType].effect}</li>`
      : '');
  return `<div class="gear-card rar" style="--rc:${gearColor(gd.id)}"><div class="gc-head"><i>${gd.icon}</i><div><b>${gd.name}</b><small>${RARITIES[gd.rarity].name} ${GEAR_KINDS[gd.kind].name.toLowerCase()} · Lv ${it.level} / ${GEAR_MAX_LEVEL}</small>${dtypeTag(gd)}</div></div><ul class="gc-stats">${lines}</ul></div>`;
}

/** Your Hunter's name (Settings), shown on their card and wherever they're named. */
let mainHunterName = '';
const mainName = () => mainHunterName || 'You';
export const MAX_NAME_LENGTH = 16;

/** Escapes text typed by the player before it goes into HTML. */
function esc(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** How many not-yet-recruited Hunters the Hunters tab shows. */
const NEXT_HUNTERS_SHOWN = 3;

/** What a Hunter needs before they can be recruited, e.g. "Beat the Old Graveyard Guardian (1/2)". */
function unlockText(g: Game, def: HunterDef): string {
  const ev = eventDef(def.unlock.event);
  const done = Math.min(g.eventCompletions(ev.id), def.unlock.times);
  const count = def.unlock.times > 1 ? ` ${def.unlock.times} times (${done}/${def.unlock.times})` : '';
  const what = ev.kind === 'guardian' ? `Beat the ${areaDef(ev.area).name} Guardian` : `Complete the ${ev.name} in ${areaDef(ev.area).name}`;
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
/** What a monster drops. */
function dropHtml(e: EnemyDef): string {
  return `<div class="drop-line">${gemHtml(e.material)} Drops <b>${materialDef(e.material).name}</b></div>`;
}

/** An enemy's weaknesses and resistances as rows of damage-type tags. */
function affinityHtml(e: EnemyDef): string {
  const row = (label: string, cls: string, types: DamageType[]) =>
    types.length ? `<div class="aff ${cls}"><span>${label}</span>${types.map(damageTypeHtml).join('')}</div>` : '';
  return `<div class="affinities">${row(`Weak ×${WEAK_MULT}`, 'weak', e.weak)}${row(`Resists ×${RESIST_MULT}`, 'resist', e.resist)}</div>`;
}

/** A weapon's damage type as a small coloured tag ('' for gear without one). */
function dtypeTag(gd: GearDef): string {
  return gd.damageType ? damageTypeHtml(gd.damageType) : '';
}

function damageTypeHtml(t: DamageType): string {
  const d = DAMAGE_TYPES[t];
  return `<span class="dtype-tag" style="--dc:${d.color}">${d.icon} ${d.name}</span>`;
}

function costHtml(g: Game, cost: Partial<Record<MaterialId, number>>, check = true): string {
  return (Object.entries(cost) as [MaterialId, number][])
    .map(([m, n]) =>
      check ? `<span class="${g.state.materials[m] < n ? 'short' : ''}">${gemHtml(m)}${fmt(g.state.materials[m])}/${fmt(n)}</span>` : `<span>${gemHtml(m)}${fmt(n)}</span>`,
    )
    .join('');
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
