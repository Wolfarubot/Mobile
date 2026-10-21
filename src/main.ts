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
import { newGame, type GameState } from './core/state';
import { BattleView } from './render/battle';

// Emoji anywhere in the UI are drawn as pixel-art icons.
installEmojiIcons();
initSound();
import { AppUI } from './ui/app';
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
  const battle = new BattleView(document.getElementById('battle') as HTMLCanvasElement, game, field);
  const ui = new AppUI(game, { save, wipe, devPhase, devRestore, hasDevBackup });
  // Measures each farming group on a hidden copy of its battlefield, for offline gains and stationed Hunters.
  new SamplerHost(game, () => field.view);
  if (!game.state.flags.welcome) ui.showWelcome();
  else if (offline && offline.away >= OFFLINE_POPUP_SEC) ui.showOffline(offline);

  // Main loop: simulation runs every frame; the DOM refreshes on a slower cadence.
  let last = performance.now();
  let uiAcc = 0;
  let saveAcc = 0;
  const frame = (now: number) => {
    // Clamp so a throttled/backgrounded tab doesn't simulate a huge jump (offline logic covers that).
    const dt = Math.min(0.25, (now - last) / 1000);
    last = now;
    // Substep so fast bullets can't skip past enemies on a slow frame.
    const steps = Math.ceil(dt / (1 / 30));
    for (let i = 0; i < steps; i++) {
      game.tick(dt / steps);
      field.update(dt / steps);
    }
    battle.update(dt);
    battle.render();
    uiAcc += dt;
    if (uiAcc >= UI_REFRESH_SEC) {
      uiAcc = 0;
      ui.refresh();
    }
    saveAcc += dt;
    if (saveAcc >= AUTOSAVE_SEC) {
      saveAcc = 0;
      save();
    }
    requestAnimationFrame(frame);
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
