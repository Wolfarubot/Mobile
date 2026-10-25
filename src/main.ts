import '@fontsource/pixelify-sans/400.css';
import '@fontsource/pixelify-sans/700.css';
import './ui/fonts';
import './style.css';
import { installEmojiIcons } from './ui/emojiIcons';
import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { OFFLINE_POPUP_SEC } from './core/balance';
import { Field } from './core/field';
import { Game } from './core/game';
import { hasDevBackup, loadDevPhase, loadGame, restoreDevBackup, saveGame, wipeSave } from './core/save';
import { deserialize, newGame, serialize, type FrameRate, type GameState } from './core/state';
import type { AreaId, HunterId } from './core/balance';
import { BattleView } from './render/battle';

// Emoji anywhere in the UI are drawn as pixel-art icons.
installEmojiIcons();
initSound();
import { AppUI } from './ui/app';
import { perfFrame, perfOn } from './ui/perfMeter';
import { SamplerHost } from './ui/samplerHost';
import { initSound } from './ui/sound';

const AUTOSAVE_SEC = 10;
/** The loading screen stays at least this long from launch, and until everything has loaded. */
const SPLASH_MIN_MS = 3000;

/** Fades out the loading screen (index.html) once fonts and images are in and the game has drawn its first frames. */
async function hideSplash(): Promise<void> {
  const splash = document.getElementById('splash');
  if (!splash) return;
  const loaded = document.readyState === 'complete' ? Promise.resolve() : new Promise<void>((r) => window.addEventListener('load', () => r(), { once: true }));
  const frames = new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
  await Promise.all([loaded, document.fonts?.ready, frames]);
  await new Promise((r) => setTimeout(r, Math.max(0, SPLASH_MIN_MS - performance.now())));
  splash.classList.add('gone');
  setTimeout(() => splash.remove(), 500);
}
const UI_REFRESH_SEC = 0.15;
/** Settings → Frame rate: the most frames drawn per second (0: as many as the screen shows). */
const FRAME_CAP: Record<FrameRate, number> = { '30': 30, '60': 60, max: 0 };

async function boot(): Promise<void> {
  const saved = await loadGame();
  const game = new Game(saved ?? newGame());
  const offline = saved ? game.applyOffline() : null;

  let saving = true;
  const save = () => {
    if (saving) void saveGame(game.state);
  };
  const wipe = async () => {
    saving = false;
    await wipeSave();
    location.reload();
  };
  // Settings → Dev → Progress: swap in a progress phase (keeping your save to restore), or restore it.
  const devPhase = async (phase: GameState) => {
    saving = false;
    await loadDevPhase(game.state, phase);
    location.reload();
  };
  const devRestore = async () => {
    saving = false;
    await restoreDevBackup();
    location.reload();
  };

  const field = new Field(game);
  const canvas = document.getElementById('battle') as HTMLCanvasElement;
  const battle = new BattleView(canvas, game, field);
  // Areas → Details → Observe: another area's battlefield with just the Hunters stationed there, run on a copy of
  // the save (what happens in it isn't kept; their real gains go on as usual) and drawn instead of yours.
  let obs: { area: AreaId; game: Game; field: Field; battle: BattleView } | null = null;
  const stopObserving = () => {
    if (!obs) return;
    obs.battle.dispose();
    obs = null;
    battle.setActive(true);
  };
  const observe = (area: AreaId): boolean => {
    stopObserving();
    const group = game.stationedIn(area);
    if (!group.length || area === game.area) return false;
    const state = deserialize(serialize(game.state))!;
    state.area = area;
    for (const [id, h] of Object.entries(state.hunters)) h.station = h.recruited && group.includes(id as HunterId) ? area : null;
    const copy = new Game(state);
    const f = new Field(copy, group[0]);
    obs = { area, game: copy, field: f, battle: new BattleView(canvas, copy, f) };
    battle.setActive(false);
    return true;
  };
  const ui = new AppUI(game, { save, wipe, devPhase, devRestore, hasDevBackup, observe, stopObserving, observing: () => obs?.area ?? null });
  // Measures each farming group on a hidden copy of its battlefield, for offline gains and stationed Hunters.
  new SamplerHost(game, () => field.view);
  if (!game.state.flags.welcome) ui.showWelcome();
  else if (offline && offline.away >= OFFLINE_POPUP_SEC) ui.showOffline(offline);

  // Main loop: simulation runs every frame; the DOM refreshes on a slower cadence.
  let last = performance.now();
  let uiAcc = 0;
  let saveAcc = 0;
  const frame = (now: number) => {
    requestAnimationFrame(frame);
    // Settings → Frame rate: skip screen refreshes past the cap (the next frame simulates the time skipped).
    const cap = FRAME_CAP[game.state.settings.fps];
    if (cap && now - last < 1000 / cap - 2) return;
    const gap = now - last;
    // Clamp so a throttled/backgrounded tab doesn't simulate a huge jump (offline logic covers that).
    const dt = Math.min(0.25, gap / 1000);
    last = now;
    // Settings → Dev → Frame times: how long each part of the frame takes.
    const timed = perfOn();
    let t0 = timed ? performance.now() : 0;
    const lap = () => {
      const t = performance.now();
      const ms = t - t0;
      t0 = t;
      return ms;
    };
    let tick = 0;
    let fieldMs = 0;
    // Substep so fast bullets can't skip past enemies on a slow frame.
    const steps = Math.ceil(dt / (1 / 30));
    for (let i = 0; i < steps; i++) {
      game.tick(dt / steps);
      if (timed) tick += lap();
      field.update(dt / steps);
      if (timed) fieldMs += lap();
    }
    if (obs) {
      // Observing: your field keeps fighting unseen; the observed one runs and is drawn.
      field.drainEvents();
      if (!game.stationedIn(obs.area).length || game.area === obs.area) stopObserving();
    }
    if (obs) {
      const steps2 = Math.ceil(dt / (1 / 30));
      for (let i = 0; i < steps2; i++) {
        obs.game.tick(dt / steps2);
        obs.field.update(dt / steps2);
      }
      obs.battle.update(dt);
      if (!ui.battleHidden()) obs.battle.render();
    } else {
      battle.update(dt);
      // A full-screen view covers the battlefield: it keeps fighting, but isn't drawn.
      if (!ui.battleHidden()) battle.render();
    }
    const render = timed ? lap() : 0;
    uiAcc += dt;
    if (uiAcc >= UI_REFRESH_SEC) {
      uiAcc = 0;
      ui.refresh();
    }
    if (timed) perfFrame(now, gap, { tick, field: fieldMs, render, ui: lap() });
    saveAcc += dt;
    if (saveAcc >= AUTOSAVE_SEC) {
      saveAcc = 0;
      save();
    }
  };
  requestAnimationFrame(frame);
  void hideSplash();

  // Leaving/returning: save on the way out, grant offline progress on the way back.
  let away = false;
  const onHide = () => {
    if (away) return;
    away = true;
    save();
  };
  const onShow = () => {
    if (!away) return;
    away = false;
    last = performance.now();
    const r = game.applyOffline();
    if (r.away >= OFFLINE_POPUP_SEC) ui.showOffline(r);
    ui.refresh();
  };
  document.addEventListener('visibilitychange', () => (document.hidden ? onHide() : onShow()));
  window.addEventListener('pagehide', onHide);

  if (Capacitor.isNativePlatform()) {
    await CapApp.addListener('pause', onHide);
    await CapApp.addListener('resume', onShow);
    await CapApp.addListener('backButton', () => {
      if (!ui.closeModal()) void CapApp.minimizeApp();
    });
  }
}

void boot();
