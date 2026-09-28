import {
  areaDef,
  areaEnemies,
  AREAS,
  ARCHETYPES,
  BOUNTY_DROP_PER_LEVEL,
  BOUNTY_GOLD_PER_LEVEL,
  BOUNTY_SPEED_PER_LEVEL,
  describeGear,
  ENEMIES,
  ENEMY_UPGRADE_MAX,
  enemyUnlockCost,
  GEAR,
  GEAR_KINDS,
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
  type EventDef,
  RARITIES,
  STATION_EFFICIENCY,
  SWARM_PER_LEVEL,
  type EnemyDef,
  type EnemyUpgrade,
  type GearDef,
  type HunterDef,
  type MaterialId,
} from '../core/balance';
import { fmt, fmtTime } from '../core/format';
import type { FarmRates, Game } from '../core/game';
import type { OfflineResult } from '../core/offline';
import type { BuyAmount, GearItem, Wearer } from '../core/state';
import { drawEnemyPortrait } from '../render/battle';
import { spriteUrl } from '../render/sprites';

type Tab = 'hunters' | 'areas' | 'beasts' | 'equipment' | 'events';

const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;

const gemHtml = (m: MaterialId) => `<i class="gem" style="background:${materialDef(m).color}"></i>`;

/** DOM layer: top bar, area controls, tabbed panels and modals. Refreshes numbers on a timer. */
export class AppUI {
  private refreshers: Array<() => void> = [];
  private panel = $('#panel');
  private modal = $('#modal');
  private modalClose: (() => void) | null = null;
  /** The open full-screen Hunter view, with its own refreshers. */
  private detail: { el: HTMLElement; who: Wearer; refreshers: Array<() => void> } | null = null;
  private tab: Tab = 'hunters';

  constructor(
    private game: Game,
    private hooks: { save: () => void; wipe: () => Promise<void> },
  ) {
    document.querySelectorAll<HTMLButtonElement>('.tabs button').forEach((b) =>
      b.addEventListener('click', () => this.setTab(b.dataset.tab as Tab)),
    );
    // Panels that depend on which areas/enemies/Hunters exist are rebuilt when those change.
    game.on((e) => {
      if (e.type === 'areaUnlocked' || e.type === 'travel' || e.type === 'unlock' || e.type === 'recruit') this.setTab(this.tab, true);
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
    else if (tab === 'equipment') this.buildEquipment();
    else this.buildEvents();
    this.panel.scrollTop = scroll;
    this.refresh();
  }

  /** Cheap update of all visible numbers. */
  refresh(): void {
    const g = this.game;
    const s = g.state;
    const area = areaDef(g.area);
    const idx = AREAS.indexOf(area);
    $('#gold').textContent = fmt(s.gold);
    $('#dps').textContent = fmt(g.dps);
    $('#areaNum').textContent = `Area ${idx + 1} of ${AREAS.length}`;
    $('#areaName').textContent = area.name;

    const ready = EVENTS.filter((e) => e.area === g.area && g.eventReady(e.id)).length;
    const badge = $('#eventsBadge');
    badge.textContent = String(ready);
    badge.classList.toggle('hidden', ready <= 0);
    $('#forgeBadge').classList.toggle('hidden', !ITEMS.some((it) => g.canCraft(it.id)));
    $('#beastBadge').classList.toggle(
      'hidden',
      !ENEMIES.some((e) => !s.bestiary[e.id].unlocked && g.isAreaUnlocked(e.area) && s.gold >= enemyUnlockCost(e)),
    );
    $('#huntersBadge').classList.toggle(
      'hidden',
      !HUNTERS.some((h) => g.canRecruit(h.id) || (s.hunters[h.id].recruited && g.skillPoints(h.id) > 0)) && g.skillPoints('main') <= 0,
    );

    for (const r of this.refreshers) r();
    if (this.detail) for (const r of this.detail.refreshers) r();
  }

  // ---- Hunters tab: your Hunter's training + the Hunter Guild ----

  private buildHunters(): void {
    const g = this.game;
    const amounts = el('div', 'amounts');
    amounts.appendChild(el('span', 'amounts-label', 'Train'));
    const opts: BuyAmount[] = [1, 10, 100, 'max'];
    const buttons = opts.map((a) => {
      const b = el('button', '', a === 'max' ? 'MAX' : `×${a}`);
      b.addEventListener('click', () => {
        g.state.buyAmount = a;
        buttons.forEach((x, i) => x.classList.toggle('active', opts[i] === a));
        this.refresh();
      });
      b.classList.toggle('active', g.state.buyAmount === a);
      amounts.appendChild(b);
      return b;
    });
    this.panel.appendChild(amounts);

    this.panel.appendChild(sectionTitle('Your Hunter'));
    this.panel.appendChild(this.hunterCard('main'));

    this.panel.appendChild(sectionTitle('Hunter Guild'));
    const tip = el('div', 'card');
    tip.innerHTML = `<p style="margin:0">Train Hunters with gold: each session adds damage, and every level earns a skill point. Tap a Hunter for their skills, stats and gear. Station them in areas to keep earning there while you hunt elsewhere (${Math.round(STATION_EFFICIENCY * 100)}% efficiency, offline too).</p>`;
    this.panel.appendChild(tip);
    for (const h of HUNTERS) this.panel.appendChild(this.hunterCard(h.id));
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
      $('span', bar).textContent = compact ? `${into}/${need} to Lv ${level + 1}` : `Lv ${level} · ${into}/${need} to Lv ${level + 1}`;
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
          <div class="hc-name">${def ? `${def.name} <small>the ${def.title}</small>` : 'You <small>the Monster Hunter</small>'}</div>
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
      card.classList.add('locked');
      gearEl.remove();
      this.refreshers.push(() => {
        status.textContent = g.isAreaUnlocked(def.area) ? 'Available to recruit' : `Found in ${areaDef(def.area).name}`;
        mid.textContent = g.isAreaUnlocked(def.area) ? 'Recruit to start training' : `Unlock ${areaDef(def.area).name} to recruit`;
        recruitBtn.innerHTML = g.isAreaUnlocked(def.area) ? `Recruit<small>🪙 ${fmt(def.recruitCost)}</small>` : '🔒<small>Locked</small>';
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
      const down = def && station && station !== g.area ? (g.farmRates(station, [def.id], STATION_EFFICIENCY).stunned[def.id] ?? 0) : 0;
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

  /** Full-screen Hunter view: training, skills, stats, kills, equipment and station. Closing returns to the battlefield. */
  private openHunterDetail(who: Wearer): void {
    if (this.detail) this.dropDetail();
    const g = this.game;
    const def = who === 'main' ? null : hunterDef(who);
    const view = el('div', 'hunter-detail');
    view.innerHTML = `
      <div class="hd-top"><button class="hd-close" aria-label="Close">✕</button><span>${def ? 'Hunter Guild' : 'Your Hunter'}</span></div>
      <div class="hd-scroll">
        <div class="hd-hero">
          ${portraitHtml(who, 'big')}
          <div class="hd-title">
            <h2>${def ? def.name : 'You'}</h2>
            <div class="hd-sub"></div>
          </div>
        </div>
        <p class="hd-ability">${def ? def.ability : MAIN_ABILITY}</p>
        ${def ? `<p class="hd-style">${def.style.describe}</p>` : ''}
        <div class="hd-body"></div>
      </div>`;
    document.body.appendChild(view);
    const body = $('.hd-body', view);
    $('.hd-close', view).addEventListener('click', () => this.closeHunterDetail());
    this.detail = { el: view, who, refreshers: [] };

    const main = this.refreshers;
    this.refreshers = [];
    const recruited = !def || g.state.hunters[def.id].recruited;
    if (def && !recruited) {
      const btn = el('button', 'buy hd-recruit') as HTMLButtonElement;
      btn.addEventListener('click', () => {
        if (g.recruit(def.id)) this.openHunterDetail(who); // rebuild with the full view
      });
      body.appendChild(btn);
      this.refreshers.push(() => {
        btn.innerHTML = g.isAreaUnlocked(def.area) ? `Recruit<small>🪙 ${fmt(def.recruitCost)}</small>` : `Found in ${areaDef(def.area).name}`;
        btn.disabled = !g.canRecruit(def.id);
      });
    }

    if (recruited) {
      body.appendChild(sectionTitle('Training'));
      body.appendChild(this.trainButton(who));
      body.appendChild(this.skillTree(who));
    }

    body.appendChild(sectionTitle(recruited ? 'Stats' : 'Stats when recruited'));
    const headline = el('div', 'hd-stats hd-headline');
    body.appendChild(headline);
    const stats = el('div', 'hd-stats');
    body.appendChild(stats);

    body.appendChild(sectionTitle('Equipment'));
    if (recruited) body.appendChild(this.gearRow(who));
    else body.appendChild(el('p', 'hd-note', `Slots: ${g.slotsOf(who).map((sl) => `${GEAR_KINDS[sl.kind].icon} ${sl.label}`).join(' · ')}. Recruit them to equip gear.`));

    if (def && recruited) {
      body.appendChild(sectionTitle('Station'));
      body.appendChild(this.stationControls(def));
    }

    this.refreshers.push(() => {
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

  /** Skill points and the skills they buy. */
  private skillTree(who: Wearer): HTMLElement {
    const g = this.game;
    const wrap = el('div', 'skills');
    const head = el('div', 'skills-head');
    wrap.appendChild(head);
    const rows = g.skillsOf(who).map((k) => {
      const row = el('div', 'row skill');
      row.innerHTML = `<div class="icon">${k.icon}</div><div class="info"><div class="name"></div><div class="sub"></div></div><button class="buy learn">+</button>`;
      const btn = $<HTMLButtonElement>('.learn', row);
      btn.addEventListener('click', () => g.learn(who, k.id) && this.refresh());
      wrap.appendChild(row);
      return { k, row, btn };
    });
    this.refreshers.push(() => {
      const points = g.skillPoints(who);
      const { level } = g.levelInfo(who);
      head.innerHTML = points > 0 ? `<b>${points}</b> skill point${points > 1 ? 's' : ''} to spend` : `Next skill point at Lv ${level + 1}`;
      head.classList.toggle('has', points > 0);
      for (const { k, row, btn } of rows) {
        const lv = g.skill(who, k.id);
        const maxed = k.maxLevel !== undefined && lv >= k.maxLevel;
        $('.name', row).innerHTML = `${k.name} <small>${lv}${k.maxLevel ? ` / ${k.maxLevel}` : ''}</small>`;
        $('.sub', row).innerHTML = maxed ? k.describe(lv) : lv === 0 ? `<b>${k.describe(1)}</b>` : `${k.describe(lv)} → <b>${k.describe(lv + 1)}</b>`;
        btn.textContent = maxed ? 'MAX' : '+';
        btn.disabled = !g.canLearn(who, k.id);
      }
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
        c.disabled = !g.isAreaUnlocked(a.id);
        const other = g.stationedAt(a.id);
        c.textContent = `${a.name.split(' ').pop()}${other && other !== def.id ? ` (${hunterDef(other).icon})` : ''}`;
      }
      if (!st.station) yieldEl.textContent = 'Resting. Station them in an area to earn.';
      else if (st.station === g.area) yieldEl.textContent = `Fighting beside you in ${areaDef(st.station).name}.`;
      else yieldEl.innerHTML = yieldHtml(g.farmRates(st.station, [def.id], STATION_EFFICIENCY), areaDef(st.station).name);
    });
    return wrap;
  }

  // ---- Equipment ----

  /** A Hunter's equipment slots; tap one to pick gear for it. */
  private gearRow(who: Wearer): HTMLElement {
    const g = this.game;
    const wrap = el('div', 'gear-wrap');
    const row = el('div', 'gear-slots');
    wrap.appendChild(row);
    const summary = el('div', 'gear-summary');
    wrap.appendChild(summary);
    const buttons = g.slotsOf(who).map((slot, i) => {
      const b = el('button', 'slot') as HTMLButtonElement;
      b.addEventListener('click', () => this.openSlotPicker(who, i));
      row.appendChild(b);
      return { slot, b };
    });
    let key = '';
    this.refreshers.push(() => {
      const items = g.equipped(who);
      const k = items.map((it) => (it ? `${it.uid}:${it.level}` : '-')).join('|');
      if (k === key) return;
      key = k;
      buttons.forEach(({ slot, b }, i) => {
        const it = items[i];
        b.classList.toggle('empty', !it);
        b.classList.toggle('rar', !!it);
        b.style.setProperty('--rc', it ? gearColor(it.base) : '');
        b.innerHTML = it
          ? `<i>${gearDef(it.base).icon}</i><span>${gearDef(it.base).name}</span><small>${slot.label} · Lv ${it.level}</small>`
          : `<i>${GEAR_KINDS[slot.kind].icon}</i><span>Empty</span><small>${slot.label}</small>`;
      });
      const stats = describeGear(g.gear(who));
      const short = g.slotsOf(who).some((sl) => sl.role === 'short') ? describeGear(g.gear(who, 'short')) : '';
      summary.textContent = stats || short ? `Gear: ${stats || 'nothing yet'}${short ? ` · pistols: ${short}` : ''}` : '';
    });
    return wrap;
  }

  /** Bottom sheet listing gear that fits a slot. */
  private openSlotPicker(who: Wearer, slot: number): void {
    const g = this.game;
    const def = g.slotsOf(who)[slot];
    const current = g.equipped(who)[slot];
    this.showSheet(`${wearerName(who)} · ${def.label}`, (body, close) => {
      const fits = g.state.inventory.filter((it) => gearDef(it.base).kind === def.kind).sort((a, b) => b.level - a.level);
      if (current) {
        const off = el('button', 'buy secondary-btn', 'Unequip') as HTMLButtonElement;
        off.addEventListener('click', () => {
          g.equip(who, slot, null);
          close();
        });
        body.appendChild(off);
      }
      if (!fits.length) {
        const p = el('p', '', `No ${GEAR_KINDS[def.kind].name.toLowerCase()} gear in your inventory yet. Craft some in the Equipment tab.`);
        body.appendChild(p);
        return;
      }
      for (const it of fits) {
        const gd = gearDef(it.base);
        const worn = g.wearerOf(it.uid);
        const row = el('button', `pick-row rar${current?.uid === it.uid ? ' on' : ''}`) as HTMLButtonElement;
        row.style.setProperty('--rc', gearColor(gd.id));
        row.innerHTML = `<i>${gd.icon}</i><div><b>${gd.name}</b> <small>${RARITIES[gd.rarity].name} · Lv ${it.level}</small><div class="sub">${describeGear(gearStats(gd, it.level))}</div>${
          worn ? `<div class="worn">Worn by ${wearerName(worn.who)}${worn.who === who && worn.slot === slot ? ' (this slot)' : ''}</div>` : ''
        }</div>`;
        row.addEventListener('click', () => {
          g.equip(who, slot, it.uid);
          close();
        });
        body.appendChild(row);
      }
    });
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
        <p><b class="rarity-tag" style="--rc:${gearColor(gd.id)}">${RARITIES[gd.rarity].name}</b> ${GEAR_KINDS[gd.kind].name} · Lv ${item.level} / ${GEAR_MAX_LEVEL}${worn ? ` · worn by ${wearerName(worn.who)}` : ''}</p>
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

  private buildAreas(): void {
    const g = this.game;
    AREAS.forEach((a, i) => {
      const card = el('div', 'card area-card');
      card.innerHTML = `<h3><span>${a.name}</span><small>Area ${i + 1}</small></h3><p>${a.blurb}</p><div class="enemy-chips"></div><div class="status"></div><div class="actions"></div>`;
      this.panel.appendChild(card);
      const chips = $('.enemy-chips', card);
      chips.innerHTML = areaEnemies(a.id)
        .map(
          (e) =>
            `<span class="enemy-chip" data-id="${e.id}"><i style="background:${e.color}"></i>${g.isAreaUnlocked(a.id) ? e.name : '???'}<span class="archetype">${ARCHETYPES[e.archetype].icon}</span></span>`,
        )
        .join('');
      const actions = $('.actions', card);
      const travel = el('button', 'buy', 'Travel here') as HTMLButtonElement;
      travel.addEventListener('click', () => g.travel(a.id));
      actions.appendChild(travel);

      this.refreshers.push(() => {
        const unlocked = g.isAreaUnlocked(a.id);
        const here = g.area === a.id;
        card.classList.toggle('here', here);
        card.classList.toggle('locked', !unlocked);
        chips
          .querySelectorAll<HTMLElement>('.enemy-chip')
          .forEach((c) => c.classList.toggle('locked', !g.state.bestiary[c.dataset.id as EnemyDef['id']].unlocked));
        travel.classList.toggle('hidden', !unlocked || here);
        const status = $('.status', card);
        if (!unlocked) {
          const prev = AREAS[i - 1];
          status.innerHTML = `<p style="margin:0">🔒 Defeat the <b>${prev.name} Guardian</b> to unlock. (${fmt(Math.min(g.state.areas[prev.id].kills, prev.mastery))} / ${fmt(prev.mastery)} mastery)</p>`;
          return;
        }
        const st = g.state.areas[a.id];
        const helper = g.stationedAt(a.id);
        const next = AREAS[i + 1];
        const cleared = !next || g.isAreaUnlocked(next.id);
        const mastery = cleared
          ? `<div class="mastery done"><span>${next ? '✓ Guardian defeated' : '✓ The final area'}</span></div>`
          : `<div class="mastery"><i style="width:${Math.min(1, st.kills / a.mastery) * 100}%"></i><span>${
              st.kills >= a.mastery ? '⚔️ Guardian Challenge unlocked in Events' : `Mastery ${fmt(st.kills)} / ${fmt(a.mastery)}`
            }</span></div>`;
        const roster = areaEnemies(a.id);
        const cells: Array<[string, string]> = [
          ['Slain', fmt(st.kills)],
          ['Gold earned', `🪙 ${fmt(st.gold)}`],
          ['Escaped', fmt(st.escaped)],
          ['Knockouts', fmt(st.knockouts)],
          ['Monsters', `${roster.filter((e) => g.state.bestiary[e.id].unlocked).length} / ${roster.length}`],
          ['Stationed', helper ? `${hunterDef(helper).icon} ${hunterDef(helper).name}` : '—'],
        ];
        status.innerHTML = `${here ? '<p class="here-line">📍 <b>You are here</b></p>' : ''}${mastery}<div class="area-stats">${cells
          .map(([k, v]) => `<div><b>${v}</b>${k}</div>`)
          .join('')}</div>${helper && !here ? yieldHtml(g.farmRates(a.id, [helper], STATION_EFFICIENCY), `${hunterDef(helper).name} earns`) : ''}`;
      });
    });

    const stats = el('div', 'card');
    stats.innerHTML = `<h3>Records</h3><div class="stats"></div><button class="danger-link">Reset all progress</button>`;
    $('.danger-link', stats).addEventListener('click', () =>
      this.showModal('<h2>Reset everything?</h2><p>This deletes your save: areas, Hunters, items and materials. It cannot be undone.</p>', [
        { label: 'Cancel', secondary: true },
        { label: 'Delete', action: () => void this.hooks.wipe() },
      ]),
    );
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
  }

  // ---- Bestiary tab (enemy roster, per area) ----

  private buildBestiary(): void {
    const g = this.game;
    const intro = el('div', 'card');
    intro.innerHTML = `<p style="margin:0">Unlock new monsters to join an area's horde. Each drops its own material. <b>Swarm</b> brings more of them; <b>Bounty</b> makes them pay more but run faster. Upgrades are permanent and apply wherever they're hunted, including by stationed Hunters.</p>`;
    this.panel.appendChild(intro);
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
        <div class="info"><div class="name"></div><div class="blurb">${def.blurb}</div></div>
      </div>
      <div class="beast-stats"></div>
      <div class="beast-actions"></div>`;
    this.panel.appendChild(card);
    requestAnimationFrame(() => drawEnemyPortrait($<HTMLCanvasElement>('canvas', card), def.id));

    const actions = $('.beast-actions', card);
    const unlockBtn = el('button', 'buy') as HTMLButtonElement;
    unlockBtn.addEventListener('click', () => g.unlockEnemy(def.id));
    const upgradeBtn = (kind: EnemyUpgrade) => {
      const b = el('button', 'buy') as HTMLButtonElement;
      b.addEventListener('click', () => g.buyEnemyUpgrade(def.id, kind) && this.refresh());
      return b;
    };
    const swarmBtn = upgradeBtn('swarm');
    const bountyBtn = upgradeBtn('bounty');
    if (g.state.bestiary[def.id].unlocked) actions.append(swarmBtn, bountyBtn);
    else actions.append(unlockBtn);

    const arch = ARCHETYPES[def.archetype];
    this.refreshers.push(() => {
      const b = g.state.bestiary[def.id];
      const st = g.enemyStats(def.id);
      const mat = materialDef(def.material);
      card.classList.toggle('locked', !b.unlocked);
      $('.name', card).innerHTML = `${def.name}<span class="archetype">${arch.icon} ${arch.name}</span>${b.unlocked ? '' : ' <small style="color:var(--muted)">locked</small>'}`;
      $('.beast-stats', card).innerHTML = `
        <div><b>${fmt(st.hp)}</b>HP</div>
        <div><b>${Math.round(st.speed)}</b>speed</div>
        <div><b>${(b.unlocked ? st.spawnRate : def.spawn).toFixed(2)}/s</b>spawns</div>
        <div><b>${fmt(st.gold)}</b>gold</div>`;
      if (!b.unlocked) {
        const cost = enemyUnlockCost(def);
        unlockBtn.innerHTML = `Unlock · drops ${gemHtml(def.material)} ${mat.name}<small>🪙 ${fmt(cost)}</small>`;
        unlockBtn.disabled = g.state.gold < cost;
        return;
      }
      const sc = g.enemyUpgradeCost(def.id, 'swarm');
      const bc = g.enemyUpgradeCost(def.id, 'bounty');
      swarmBtn.innerHTML = `Swarm ${b.swarm}/${ENEMY_UPGRADE_MAX}<span>+${Math.round(SWARM_PER_LEVEL * 100)}% spawns</span><small>${Number.isFinite(sc) ? `🪙 ${fmt(sc)}` : 'MAX'}</small>`;
      bountyBtn.innerHTML = `Bounty ${b.bounty}/${ENEMY_UPGRADE_MAX}<span>+${Math.round(BOUNTY_GOLD_PER_LEVEL * 100)}% gold, +${Math.round(BOUNTY_DROP_PER_LEVEL * 100)}% drops, +${Math.round(BOUNTY_SPEED_PER_LEVEL * 100)}% speed</span><small>${Number.isFinite(bc) ? `🪙 ${fmt(bc)}` : 'MAX'}</small>`;
      swarmBtn.disabled = g.state.gold < sc;
      bountyBtn.disabled = g.state.gold < bc;
    });
  }

  // ---- Equipment tab (materials → gear and Camp Upgrades) ----

  private buildEquipment(): void {
    const g = this.game;
    const mats = el('div', 'mats');
    this.panel.appendChild(mats);
    this.refreshers.push(() => {
      mats.innerHTML = MATERIALS.map((m) => {
        const source = ENEMIES.find((e) => e.material === m.id)!;
        const known = g.isUnlocked(source.id) || g.state.materials[m.id] > 0;
        const hint = g.isAreaUnlocked(source.area) ? `${source.name}s` : '???';
        return `<div class="mat ${known ? '' : 'unknown'}">${gemHtml(m.id)}<span>${known ? m.name : hint}</span><b>${known ? fmt(g.state.materials[m.id]) : ''}</b></div>`;
      }).join('');
    });

    // Inventory: every crafted piece; tap for details.
    const invTitle = sectionTitle('Inventory');
    this.panel.appendChild(invTitle);
    const inv = el('div', 'inventory');
    this.panel.appendChild(inv);
    let invKey = '';
    this.refreshers.push(() => {
      const k = g.state.inventory.map((it) => `${it.uid}:${it.level}:${g.wearerOf(it.uid)?.who ?? ''}`).join('|');
      if (k === invKey) return;
      invKey = k;
      invTitle.innerHTML = `<span>Inventory</span><span>${g.state.inventory.length} item${g.state.inventory.length === 1 ? '' : 's'}</span>`;
      inv.innerHTML = '';
      if (!g.state.inventory.length) inv.innerHTML = '<p class="empty-inv">Empty. Craft equipment below, then equip it from the Hunters tab.</p>';
      for (const it of g.state.inventory) {
        const gd = gearDef(it.base);
        const worn = g.wearerOf(it.uid);
        const tile = el('button', 'inv-tile rar') as HTMLButtonElement;
        tile.style.setProperty('--rc', gearColor(gd.id));
        tile.innerHTML = `<i>${gd.icon}</i><span>${gd.name}</span><small>Lv ${it.level}</small>${worn ? `<em>${wearerIcon(worn.who)}</em>` : ''}`;
        tile.addEventListener('click', () => this.openGearDetail(it.uid));
        inv.appendChild(tile);
      }
    });

    this.panel.appendChild(sectionTitle('Craft Equipment'));
    for (const gd of GEAR) this.buildGearRecipe(gd);
    const lockedGear = GEAR.filter((gd) => !this.gearKnown(gd)).length;
    if (lockedGear) {
      const teaser = el('div', 'card');
      teaser.innerHTML = `<p style="margin:0">🔒 ${lockedGear} more recipes need materials from monsters you haven't met yet.</p>`;
      this.panel.appendChild(teaser);
    }

    this.panel.appendChild(sectionTitle('Camp Upgrades'));
    for (const it of ITEMS) {
      const row = el('div', 'row');
      row.innerHTML = `<div class="icon">${it.icon}</div><div class="info"><div class="name"></div><div class="sub"></div><div class="cost"></div></div><button class="buy">Craft</button>`;
      const btn = $<HTMLButtonElement>('.buy', row);
      btn.addEventListener('click', () => g.craft(it.id) && this.refresh());
      this.panel.appendChild(row);
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

  private buildGearRecipe(gd: GearDef): void {
    if (!this.gearKnown(gd)) return;
    const g = this.game;
    const row = el('div', 'row');
    row.innerHTML = `<div class="icon">${gd.icon}</div><div class="info"><div class="name"><span style="color:${gearColor(gd.id)}">${gd.name}</span> <small>${RARITIES[gd.rarity].name} ${GEAR_KINDS[gd.kind].name.toLowerCase()}</small></div><div class="sub"><b>${describeGear(gearStats(gd, 1))}</b> per level</div><div class="cost"></div></div><button class="buy">Craft</button>`;
    const btn = $<HTMLButtonElement>('.buy', row);
    btn.addEventListener('click', () => g.craftGear(gd.id) && this.refresh());
    this.panel.appendChild(row);
    this.refreshers.push(() => {
      $('.cost', row).innerHTML = costHtml(g, gearCost(gd, 0));
      btn.disabled = !g.canCraftGear(gd.id);
    });
  }

  // ---- Events tab: each area's events, unlocked by slaying monsters there, then on a cooldown ----

  private buildEvents(): void {
    const g = this.game;
    const intro = el('div', 'card');
    intro.innerHTML = `<p style="margin:0">Events for the area you're in. Slay monsters here to unlock them. After you start one, it goes on cooldown before it can run again. Travel to another area to see its events.</p>`;
    this.panel.appendChild(intro);
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
      const extra = ev.kind !== 'guardian' ? '' : next && !g.isAreaUnlocked(next.id) ? `Reward: unlocks ${next.name}` : 'Reward: a Guardian bounty of gold and materials';
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
    if (!this.modalClose) return this.closeHunterDetail();
    this.modalClose();
    return true;
  }

  showOffline(r: OfflineResult): void {
    const capped = r.away > r.seconds;
    const rows = r.areas
      .map((a) => {
        const name = (h: (typeof a.hunters)[number]) => (h === 'main' ? 'You' : `${hunterDef(h).icon} ${hunterDef(h).name}`);
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

/** A Hunter's art: their sprite if one was added, otherwise their icon on their colour. */
function portraitHtml(who: Wearer, size = ''): string {
  const url = spriteUrl(who === 'main' ? 'hunter' : `hunters/${who}`);
  const color = who === 'main' ? '#7c5cff' : hunterDef(who).color;
  return `<div class="hunter-art ${size}" style="--hc:${color}">${url ? `<img src="${url}" alt="">` : `<span>${wearerIcon(who)}</span>`}</div>`;
}

function wearerName(who: Wearer): string {
  return who === 'main' ? 'Your Hunter' : hunterDef(who).name;
}

function wearerIcon(who: Wearer): string {
  return who === 'main' ? '🧑' : hunterDef(who).icon;
}

/** Material cost list; with `check`, amounts you can't afford are highlighted. */
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
