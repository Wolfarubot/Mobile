import './style.css';
import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { OFFLINE_MIN_SEC } from './core/balance';
import { Game } from './core/game';
import { loadGame, saveGame, wipeSave } from './core/save';
import { newGame } from './core/state';
import { BattleView } from './render/battle';
import { AppUI } from './ui/app';

const AUTOSAVE_SEC = 10;
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

  const battle = new BattleView(document.getElementById('battle') as HTMLCanvasElement, game);
  const ui = new AppUI(game, { save, wipe });
  if (offline && offline.away >= OFFLINE_MIN_SEC) ui.showOffline(offline);

  // Main loop: simulation runs every frame; the DOM refreshes on a slower cadence.
  let last = performance.now();
  let uiAcc = 0;
  let saveAcc = 0;
  const frame = (now: number) => {
    // Clamp so a throttled/backgrounded tab doesn't simulate a huge jump (offline logic covers that).
    const dt = Math.min(0.25, (now - last) / 1000);
    last = now;
    game.tick(dt);
    if (!ui.minigameActive) {
      battle.update(dt);
      battle.render();
    }
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
    if (r.away >= OFFLINE_MIN_SEC && !ui.minigameActive) ui.showOffline(r);
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
