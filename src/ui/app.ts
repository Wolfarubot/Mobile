import { HEROES, heroDps, isBossStage, KILLS_PER_STAGE, MAX_TICKETS, PRESTIGE_MIN_STAGE, SHARD_BONUS, TICKET_REGEN_SEC, zoneFor } from '../core/balance';
import { fmt, fmtTime } from '../core/format';
import type { Game } from '../core/game';
import type { OfflineResult } from '../core/offline';
import type { BuyAmount } from '../core/state';
import { bladeStorm } from '../minigames/blades';
import { hordeRush } from '../minigames/horde';
import { runMinigame } from '../minigames/runner';
import { powerStrike } from '../minigames/strike';
import type { MinigameDef } from '../minigames/types';

export const MINIGAMES: MinigameDef[] = [hordeRush, bladeStorm, powerStrike];

type Tab = 'slayers' | 'arena' | 'souls';

const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;

/** DOM layer: top bar, stage progress, tabbed panels and modals. Refreshes numbers on a timer. */
export class AppUI {
  private refreshers: Array<() => void> = [];
  private panel = $('#panel');
  private modal = $('#modal');
  private modalClose: (() => void) | null = null;
  minigameActive = false;

  constructor(
    private game: Game,
    private hooks: { save: () => void; wipe: () => Promise<void> },
  ) {
    document.querySelectorAll<HTMLButtonElement>('.tabs button').forEach((b) =>
      b.addEventListener('click', () => this.setTab(b.dataset.tab as Tab)),
    );
    $('#bossBtn').addEventListener('click', () => game.fightBoss());
    this.setTab('slayers');
  }

  setTab(tab: Tab): void {
    document.querySelectorAll<HTMLButtonElement>('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    this.refreshers = [];
    this.panel.innerHTML = '';
    this.panel.scrollTop = 0;
    if (tab === 'slayers') this.buildSlayers();
    else if (tab === 'arena') this.buildArena();
    else this.buildSouls();
    this.refresh();
  }

  /** Cheap per-frame-ish update of all visible numbers. */
  refresh(): void {
    const g = this.game;
    const s = g.state;
    $('#gold').textContent = fmt(s.gold);
    $('#dps').textContent = fmt(g.dps);
    $('#zone').textContent = zoneFor(s.stage).name;
    $('#stageLabel').textContent = `Stage ${s.stage}${g.isBoss ? ' · BOSS' : ''}`;

    const bossStage = isBossStage(s.stage) && !s.farming;
    const kills = bossStage ? 0 : s.kills;
    $('#killsFill').style.width = `${(kills / KILLS_PER_STAGE) * 100}%`;
    $('#killsText').textContent = bossStage ? 'Defeat the boss!' : s.farming ? 'Farming · boss ready' : `${s.kills} / ${KILLS_PER_STAGE}`;
    $('#bossBtn').classList.toggle('hidden', !g.canFightBoss);
    $('#frenzy').classList.toggle('hidden', s.frenzyTime <= 0);
    $('#frenzyTime').textContent = fmtTime(s.frenzyTime);

    const badge = $('#ticketBadge');
    badge.textContent = String(s.tickets);
    badge.classList.toggle('hidden', s.tickets <= 0);

    for (const r of this.refreshers) r();
  }

  // ---- Slayers tab ----

  private buildSlayers(): void {
    const g = this.game;
    const amounts = el('div', 'amounts');
    const opts: BuyAmount[] = [1, 10, 100, 'max'];
    for (const a of opts) {
      const b = el('button', '', a === 'max' ? 'MAX' : `×${a}`);
      b.addEventListener('click', () => {
        g.state.buyAmount = a;
        amounts.querySelectorAll('button').forEach((x, i) => x.classList.toggle('active', opts[i] === a));
      });
      b.classList.toggle('active', g.state.buyAmount === a);
      amounts.appendChild(b);
    }
    this.panel.appendChild(amounts);

    this.addShopRow(
      '👊',
      () => `Your Strike <small>Lv ${g.state.tapLevel}</small>`,
      () => `<b>${fmt(g.tapDamage)}</b> per tap · 5% crit ×5`,
      () => g.tapPurchase(),
      () => g.buyTap(),
      () => true,
    );

    HEROES.forEach((h, i) => {
      this.addShopRow(
        h.icon,
        () => (g.heroUnlocked(i) ? `${h.name} <small>Lv ${g.state.heroes[i]}</small>` : '??? <small>Locked</small>'),
        () => {
          if (!g.heroUnlocked(i)) return `Hire the ${HEROES[i - 1].name} to unlock`;
          const lv = g.state.heroes[i];
          const now = heroDps(h, lv) * g.shardMult;
          const next = heroDps(h, lv + g.heroPurchase(i).count) * g.shardMult;
          return lv === 0 ? `+<b>${fmt(next)}</b> DPS` : `<b>${fmt(now)}</b> DPS → ${fmt(next)}`;
        },
        () => g.heroPurchase(i),
        () => g.buyHero(i),
        () => g.heroUnlocked(i),
        // Only show one locked teaser beyond the unlocked heroes.
        () => i === 0 || g.heroUnlocked(i) || g.heroUnlocked(i - 1),
      );
    });
  }

  private addShopRow(
    icon: string,
    name: () => string,
    sub: () => string,
    price: () => { count: number; cost: number },
    buy: () => boolean,
    unlocked: () => boolean,
    visible: () => boolean = () => true,
  ): void {
    const row = el('div', 'row');
    row.innerHTML = `<div class="icon">${icon}</div><div class="info"><div class="name"></div><div class="sub"></div></div><button class="buy"></button>`;
    const nameEl = $('.name', row);
    const subEl = $('.sub', row);
    const btn = $<HTMLButtonElement>('.buy', row);
    btn.addEventListener('click', () => {
      if (buy()) this.refresh();
    });
    this.panel.appendChild(row);

    let lastKey = '';
    this.refreshers.push(() => {
      row.classList.toggle('hidden', !visible());
      const ok = unlocked();
      row.classList.toggle('locked', !ok);
      const p = price();
      // Avoid rewriting innerHTML when nothing changed (keeps taps responsive).
      const key = `${name()}|${sub()}|${p.count}|${p.cost}`;
      if (key !== lastKey) {
        lastKey = key;
        nameEl.innerHTML = name();
        subEl.innerHTML = sub();
        btn.innerHTML = `${ok ? `Level +${p.count}` : 'Locked'}<small>🪙 ${fmt(p.cost)}</small>`;
      }
      btn.disabled = !ok || this.game.state.gold < p.cost;
    });
  }

  // ---- Arena tab ----

  private buildArena(): void {
    const g = this.game;
    const tickets = el('div', 'card');
    tickets.innerHTML = `<div class="tickets"><span>Arena Tickets</span><span class="t"></span></div><p class="regen" style="margin:6px 0 0"></p>`;
    this.panel.appendChild(tickets);
    const info = el('div', 'card');
    info.innerHTML = `<p style="margin:0">Minigames pay out <b style="color:var(--gold)">gold</b> based on your stage, plus a <b style="color:#ffb04d">Frenzy</b> that doubles all damage. Tickets refill over time, even while the app is closed.</p>`;
    this.panel.appendChild(info);
    this.refreshers.push(() => {
      const s = g.state;
      $('.t', tickets).textContent = '🎟️'.repeat(s.tickets) + '▫️'.repeat(MAX_TICKETS - s.tickets);
      $('.regen', tickets).textContent = g.ticketsFull ? 'Tickets full, go play!' : `Next ticket in ${fmtTime(TICKET_REGEN_SEC - s.ticketProgress)}`;
    });

    for (const def of MINIGAMES) {
      const card = el('div', 'card mg-card');
      card.innerHTML = `<div class="icon">${def.icon}</div><div class="info"><h3>${def.name}</h3><p>${def.tagline}</p><div class="best"></div></div><button class="play">Play<br><small>🎟️ 1</small></button>`;
      const btn = $<HTMLButtonElement>('.play', card);
      btn.addEventListener('click', () => this.playMinigame(def));
      this.panel.appendChild(card);
      this.refreshers.push(() => {
        const best = g.state.stats.best[def.id];
        $('.best', card).textContent = best ? `Best: ★ ${best}` : 'Not played yet';
        btn.disabled = g.state.tickets <= 0;
      });
    }
  }

  private playMinigame(def: MinigameDef): void {
    if (this.minigameActive || !this.game.useTicket()) return;
    this.minigameActive = true;
    runMinigame(def, (r) => {
      this.minigameActive = false;
      const prevBest = this.game.state.stats.best[def.id] ?? 0;
      const reward = this.game.grantMinigame(def.id, r.units, r.score);
      this.hooks.save();
      this.showModal(
        `<h2>${def.icon} ${def.name}</h2>
         <p>${r.summary}</p>
         <p style="font-size:22px;color:var(--text);font-weight:900">★ ${r.score}${r.score > prevBest && r.score > 0 ? ' <span style="color:var(--gold)">NEW BEST!</span>' : ''}</p>
         <div class="reward">+🪙 ${fmt(reward.gold)}</div>
         ${reward.frenzy > 0 ? `<div class="reward frenzy">🔥 +${fmtTime(reward.frenzy)} Frenzy (×2 damage)</div>` : ''}`,
        [{ label: 'Collect' }],
      );
      this.refresh();
    });
  }

  // ---- Souls tab ----

  private buildSouls(): void {
    const g = this.game;
    const card = el('div', 'card');
    card.innerHTML = `
      <h3>🔮 Soul Shards: <span class="shards"></span></h3>
      <p>Each shard permanently grants +${SHARD_BONUS * 100}% damage. Ascend to reset your stage, gold and slayers in exchange for shards. Reach stage ${PRESTIGE_MIN_STAGE} to ascend.</p>
      <p class="pending"></p>
      <button class="big-btn">Ascend</button>`;
    const btn = $<HTMLButtonElement>('.big-btn', card);
    btn.addEventListener('click', () => {
      const n = g.pendingShards;
      if (n <= 0) return;
      this.showModal(
        `<h2>Ascend?</h2><p>You will restart at stage 1 and lose all gold and slayer levels.</p><div class="reward" style="color:#c89bff">+${n} Soul Shards</div><p>New bonus: +${Math.round((g.state.shards + n) * SHARD_BONUS * 100)}% damage</p>`,
        [
          { label: 'Cancel', secondary: true },
          {
            label: 'Ascend',
            action: () => {
              g.prestige();
              this.hooks.save();
              this.setTab('slayers');
            },
          },
        ],
      );
    });
    this.panel.appendChild(card);

    const stats = el('div', 'card');
    stats.innerHTML = `<h3>Records</h3><div class="stats"></div><button class="danger-link">Reset all progress</button>`;
    $('.danger-link', stats).addEventListener('click', () =>
      this.showModal('<h2>Reset everything?</h2><p>This deletes your save, including Soul Shards. It cannot be undone.</p>', [
        { label: 'Cancel', secondary: true },
        { label: 'Delete', action: () => void this.hooks.wipe() },
      ]),
    );
    this.panel.appendChild(stats);

    this.refreshers.push(() => {
      const s = g.state;
      const n = g.pendingShards;
      $('.shards', card).textContent = `${s.shards} (+${Math.round(s.shards * SHARD_BONUS * 100)}%)`;
      $('.pending', card).innerHTML =
        n > 0 ? `Ascending now grants <b style="color:#c89bff">+${n} shards</b>.` : `Highest stage: ${s.maxStage} / ${PRESTIGE_MIN_STAGE}`;
      btn.disabled = n <= 0;
      btn.textContent = n > 0 ? `Ascend for +${n} 🔮` : `Ascend (stage ${PRESTIGE_MIN_STAGE})`;
      const rows: Array<[string, string]> = [
        ['Highest stage', String(s.maxStage)],
        ['Monsters slain', fmt(s.stats.totalKills)],
        ['Gold earned', fmt(s.stats.totalGold)],
        ['Taps', fmt(s.stats.taps)],
        ['Ascensions', String(s.stats.prestiges)],
      ];
      $('.stats', stats).innerHTML = rows.map(([k, v]) => `<span>${k}</span><span>${v}</span>`).join('');
    });
  }

  // ---- Modals ----

  get modalOpen(): boolean {
    return !this.modal.classList.contains('hidden');
  }

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

  /** Closes the open modal (Android back button). Returns false if none was open. */
  closeModal(): boolean {
    if (!this.modalClose) return false;
    this.modalClose();
    return true;
  }

  showOffline(r: OfflineResult): void {
    const capped = r.away > r.seconds;
    this.showModal(
      `<h2>Welcome back!</h2>
       <p>You were away for ${fmtTime(r.away)}.${capped ? ` (Slayers rest after ${fmtTime(r.seconds)}.)` : ''}</p>
       <p>Your slayers defeated <b style="color:var(--text)">${fmt(r.kills)}</b> monsters.</p>
       <div class="reward">+🪙 ${fmt(r.gold)}</div>`,
      [{ label: 'Collect' }],
    );
  }
}

function el(tag: string, cls = '', text = ''): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}
