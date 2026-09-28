import {
  BH_UPGRADES,
  BOSS_EVERY,
  isBossStage,
  itemCost,
  ITEMS,
  KILLS_PER_STAGE,
  materialDef,
  MATERIALS,
  MAX_TICKETS,
  PRESTIGE_MIN_STAGE,
  SHARD_BONUS,
  TICKET_REGEN_SEC,
  UPGRADES,
  zoneFor,
  ZONES,
  type MaterialId,
} from '../core/balance';
import { fmt, fmtTime } from '../core/format';
import type { Game, MinigameReward } from '../core/game';
import type { OfflineResult } from '../core/offline';
import type { BuyAmount } from '../core/state';
import { bladeStorm } from '../minigames/blades';
import { runMinigame } from '../minigames/runner';
import { skySiege } from '../minigames/skysiege';
import { powerStrike } from '../minigames/strike';
import type { MinigameDef } from '../minigames/types';

export const MINIGAMES: MinigameDef[] = [skySiege, bladeStorm, powerStrike];

type Tab = 'upgrades' | 'forge' | 'arena' | 'souls';

const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;

const gemHtml = (m: MaterialId) => `<i class="gem" style="background:${materialDef(m).color}"></i>`;

/** DOM layer: top bar, stage controls, tabbed panels and modals. Refreshes numbers on a timer. */
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
    $('#prevStage').addEventListener('click', () => game.setStage(game.state.stage - 1));
    $('#nextStage').addEventListener('click', () => game.setStage(game.state.stage + 1));
    $('#autoBtn').addEventListener('click', () => {
      game.toggleAutoAdvance();
      this.refresh();
    });
    this.setTab('upgrades');
  }

  setTab(tab: Tab): void {
    document.querySelectorAll<HTMLButtonElement>('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    this.refreshers = [];
    this.panel.innerHTML = '';
    this.panel.scrollTop = 0;
    if (tab === 'upgrades') this.buildUpgrades();
    else if (tab === 'forge') this.buildForge();
    else if (tab === 'arena') this.buildArena();
    else this.buildSouls();
    this.refresh();
  }

  /** Cheap update of all visible numbers. */
  refresh(): void {
    const g = this.game;
    const s = g.state;
    $('#gold').textContent = fmt(s.gold);
    $('#dps').textContent = fmt(g.dps);
    $('#zone').textContent = zoneFor(s.stage).name;
    $('#stageLabel').textContent = `Stage ${s.stage}${g.isBoss ? ' · BOSS' : ''}`;

    const boss = isBossStage(s.stage);
    $('#killsFill').style.width = boss ? '100%' : `${(s.stageKills / KILLS_PER_STAGE) * 100}%`;
    $('#killsFill').style.background = boss ? 'linear-gradient(90deg,#b8324a,#ff4d6d)' : '';
    $('#killsText').textContent = boss
      ? `Boss · ${Math.ceil(s.bossTimer)}s`
      : `${s.stageKills} / ${KILLS_PER_STAGE}${s.stage < s.maxStage ? ` · farming (best ${s.maxStage})` : ''}`;
    $<HTMLButtonElement>('#prevStage').disabled = s.stage <= 1;
    const next = $<HTMLButtonElement>('#nextStage');
    next.disabled = s.stage >= s.maxStage;
    // Nudge the player back toward the frontier after a retreat.
    next.classList.toggle('pulse', !s.autoAdvance && s.stage === s.maxStage - 1);
    $('#autoBtn').classList.toggle('on', s.autoAdvance);
    $('#frenzy').classList.toggle('hidden', s.frenzyTime <= 0);
    $('#frenzyTime').textContent = fmtTime(s.frenzyTime);

    const badge = $('#ticketBadge');
    badge.textContent = String(s.tickets);
    badge.classList.toggle('hidden', s.tickets <= 0);
    $('#forgeBadge').classList.toggle('hidden', !ITEMS.some((it) => g.canCraft(it.id)));

    for (const r of this.refreshers) r();
  }

  // ---- Train tab (gold upgrades) ----

  private buildUpgrades(): void {
    const g = this.game;
    const strip = el('div', 'stat-strip');
    this.panel.appendChild(strip);
    this.refreshers.push(() => {
      strip.innerHTML = `
        <div><b>${fmt(g.damage)}</b>damage</div>
        <div><b>${g.fireRate.toFixed(1)}/s</b>${g.projectiles > 1 ? `×${g.projectiles} shots` : 'attack rate'}</div>
        <div><b>${g.spawnRate.toFixed(1)}/s</b>enemy spawns</div>`;
    });

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

    for (const u of UPGRADES) {
      const row = el('div', 'row');
      row.innerHTML = `<div class="icon">${u.icon}</div><div class="info"><div class="name"></div><div class="sub"></div></div><button class="buy"></button>`;
      const btn = $<HTMLButtonElement>('.buy', row);
      btn.addEventListener('click', () => g.buyUpgrade(u.id) && this.refresh());
      this.panel.appendChild(row);
      let key = '';
      this.refreshers.push(() => {
        const lv = g.state.upgrades[u.id];
        const p = g.upgradePurchase(u.id);
        const maxed = p.count <= 0;
        const k = `${lv}|${p.count}|${p.cost}`;
        if (k !== key) {
          key = k;
          $('.name', row).innerHTML = `${u.name} <small>Lv ${lv}${u.maxLevel ? ` / ${u.maxLevel}` : ''}</small>`;
          $('.sub', row).innerHTML = maxed
            ? u.describe(lv)
            : lv === 0
              ? `<b>${u.describe(p.count)}</b>`
              : `${u.describe(lv)} → <b>${u.describe(lv + p.count)}</b>`;
          btn.innerHTML = maxed ? 'MAX' : `Level +${p.count}<small>🪙 ${fmt(p.cost)}</small>`;
        }
        btn.disabled = maxed || g.state.gold < p.cost;
      });
    }

    const tip = el('div', 'card');
    tip.innerHTML = `<p style="margin:0">Tap the battlefield to fire a blast. Every ${BOSS_EVERY}th stage is a boss; if you get overrun you fall back a stage. Use ◀ ▶ to farm earlier zones for their materials.</p>`;
    this.panel.appendChild(tip);
  }

  // ---- Forge tab (materials → items) ----

  private buildForge(): void {
    const g = this.game;
    const mats = el('div', 'mats');
    this.panel.appendChild(mats);
    this.refreshers.push(() => {
      const seen = new Set(g.unlockedMaterials);
      mats.innerHTML = MATERIALS.map((m) => {
        const known = seen.has(m.id) || g.state.materials[m.id] > 0;
        const zone = ZONES.find((z) => z.material === m.id)!;
        return `<div class="mat ${known ? '' : 'unknown'}">${gemHtml(m.id)}<span>${known ? m.name : zone.name}</span><b>${known ? fmt(g.state.materials[m.id]) : '?'}</b></div>`;
      }).join('');
    });

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

  // ---- Arena tab ----

  private buildArena(): void {
    const g = this.game;
    const tickets = el('div', 'card');
    tickets.innerHTML = `<div class="tickets"><span>Arena Tickets</span><span class="t"></span></div><p class="regen" style="margin:6px 0 0"></p>`;
    this.panel.appendChild(tickets);
    this.refreshers.push(() => {
      const s = g.state;
      $('.t', tickets).textContent = '🎟️'.repeat(s.tickets) + '▫️'.repeat(MAX_TICKETS - s.tickets);
      $('.regen', tickets).textContent = g.ticketsFull ? 'Tickets full, go play!' : `Next ticket in ${fmtTime(TICKET_REGEN_SEC - s.ticketProgress)}`;
    });

    MINIGAMES.forEach((def, i) => {
      const card = el('div', `card mg-card${i === 0 ? ' featured' : ''}`);
      card.innerHTML = `<div class="icon">${def.icon}</div><div class="info"><h3>${def.name}</h3><p>${def.tagline}</p><div class="rewards">${def.rewards}</div><div class="best"></div></div><button class="play">Play<br><small>🎟️ 1</small></button>`;
      const btn = $<HTMLButtonElement>('.play', card);
      btn.addEventListener('click', () => this.playMinigame(def));
      this.panel.appendChild(card);
      this.refreshers.push(() => {
        const best = g.state.stats.best[def.id];
        $('.best', card).textContent = best ? `Best: ★ ${best}` : 'Not played yet';
        btn.disabled = g.state.tickets <= 0;
      });

      if (def === skySiege) this.buildHangar();
    });
  }

  /** Sky Siege's permanent upgrade tree, bought with Stars. */
  private buildHangar(): void {
    const g = this.game;
    const title = el('div', 'section-title');
    this.panel.appendChild(title);
    this.refreshers.push(() => (title.innerHTML = `<span>🚀 Sky Siege Hangar</span><span style="color:var(--gold)">⭐ ${g.state.stars}</span>`));
    for (const u of BH_UPGRADES) {
      const row = el('div', 'row');
      row.innerHTML = `<div class="icon">${u.icon}</div><div class="info"><div class="name"></div><div class="sub"></div></div><button class="buy"></button>`;
      const btn = $<HTMLButtonElement>('.buy', row);
      btn.addEventListener('click', () => g.buyBh(u.id) && this.refresh());
      this.panel.appendChild(row);
      this.refreshers.push(() => {
        const lv = g.state.bh[u.id];
        const cost = g.bhCost(u.id);
        const maxed = !Number.isFinite(cost);
        $('.name', row).innerHTML = `${u.name} <small>Lv ${lv} / ${u.maxLevel}</small>`;
        $('.sub', row).innerHTML = maxed ? u.describe(lv) : `${u.describe(lv)} → <b>${u.describe(lv + 1)}</b>`;
        btn.innerHTML = maxed ? 'MAX' : `Upgrade<small>⭐ ${cost}</small>`;
        btn.disabled = maxed || g.state.stars < cost;
      });
    }
  }

  private playMinigame(def: MinigameDef): void {
    if (this.minigameActive || !this.game.useTicket()) return;
    this.minigameActive = true;
    runMinigame(def, this.game, (r) => {
      this.minigameActive = false;
      const prevBest = this.game.state.stats.best[def.id] ?? 0;
      const reward = this.game.grantMinigame({ id: def.id, score: r.score, units: r.units, materials: r.materials, stars: r.stars });
      this.hooks.save();
      this.showModal(
        `<h2>${def.icon} ${def.name}</h2>
         <p>${r.summary}</p>
         <p style="font-size:22px;color:var(--text);font-weight:900">★ ${r.score}${r.score > prevBest && r.score > 0 ? ' <span style="color:var(--gold)">NEW BEST!</span>' : ''}</p>
         ${rewardHtml(reward)}`,
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
      <p>Each shard permanently grants +${SHARD_BONUS * 100}% damage. Ascending resets your stage, gold and training in exchange for shards. <b>Materials, forged items and Hangar upgrades are kept.</b> Reach stage ${PRESTIGE_MIN_STAGE} to ascend.</p>
      <p class="pending"></p>
      <button class="big-btn">Ascend</button>`;
    const btn = $<HTMLButtonElement>('.big-btn', card);
    btn.addEventListener('click', () => {
      const n = g.pendingShards;
      if (n <= 0) return;
      this.showModal(
        `<h2>Ascend?</h2><p>You will restart at stage 1 and lose gold and training levels. Items and materials stay.</p><div class="reward" style="color:#c89bff">+${n} Soul Shards</div><p>New bonus: +${Math.round((g.state.shards + n) * SHARD_BONUS * 100)}% damage</p>`,
        [
          { label: 'Cancel', secondary: true },
          {
            label: 'Ascend',
            action: () => {
              g.prestige();
              this.hooks.save();
              this.setTab('upgrades');
            },
          },
        ],
      );
    });
    this.panel.appendChild(card);

    const stats = el('div', 'card');
    stats.innerHTML = `<h3>Records</h3><div class="stats"></div><button class="danger-link">Reset all progress</button>`;
    $('.danger-link', stats).addEventListener('click', () =>
      this.showModal('<h2>Reset everything?</h2><p>This deletes your save, including Soul Shards and items. It cannot be undone.</p>', [
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
        ['Times overrun', fmt(s.stats.deaths)],
        ['Ascensions', String(s.stats.prestiges)],
      ];
      $('.stats', stats).innerHTML = rows.map(([k, v]) => `<span>${k}</span><span>${v}</span>`).join('');
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
       <p>You were away for ${fmtTime(r.away)}.${capped ? ` (Your hero rests after ${fmtTime(r.seconds)}.)` : ''}</p>
       <p>Your hero held the line and slew <b style="color:var(--text)">${fmt(r.kills)}</b> monsters.</p>
       <div class="reward">+🪙 ${fmt(r.gold)}</div>
       ${r.materials > 0 ? `<div class="reward" style="font-size:18px;color:${materialDef(r.material).color}">+${fmt(r.materials)} ${materialDef(r.material).name}</div>` : ''}`,
      [{ label: 'Collect' }],
    );
  }
}

function rewardHtml(r: MinigameReward): string {
  const mats = (Object.entries(r.materials) as [MaterialId, number][])
    .map(([m, n]) => `<span style="color:${materialDef(m).color}">+${n} ${materialDef(m).name}</span>`)
    .join(' · ');
  return `
    ${r.gold > 0 ? `<div class="reward">+🪙 ${fmt(r.gold)}</div>` : ''}
    ${mats ? `<div class="reward" style="font-size:15px">${mats}</div>` : ''}
    ${r.stars > 0 ? `<div class="reward" style="font-size:18px">+⭐ ${r.stars} Stars</div>` : ''}
    ${r.frenzy > 0 ? `<div class="reward frenzy">🔥 +${fmtTime(r.frenzy)} Frenzy (×2 damage)</div>` : ''}`;
}

function el(tag: string, cls = '', text = ''): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}
