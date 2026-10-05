import { Preferences } from '@capacitor/preferences';
import { deserialize, serialize, type GameState } from './state';

// Kept from the game's first name so existing saves still load.
const KEY = 'monster-horde-save';

// Capacitor Preferences maps to SharedPreferences (Android) / UserDefaults (iOS),
// which survive WebView storage clears. On the web it falls back to localStorage.
export async function loadGame(): Promise<GameState | null> {
  try {
    const { value } = await Preferences.get({ key: KEY });
    return deserialize(value);
  } catch {
    return null;
  }
}

export async function saveGame(state: GameState): Promise<void> {
  state.lastSeen = Date.now();
  try {
    await Preferences.set({ key: KEY, value: serialize(state) });
  } catch {
    // Saving is best effort; the next autosave will retry.
  }
}

export async function wipeSave(): Promise<void> {
  await Preferences.remove({ key: KEY });
}

// Settings → Dev → Progress: loading a phase keeps your own save here until you restore it.
const BACKUP_KEY = 'monster-horde-dev-backup';

export async function hasDevBackup(): Promise<boolean> {
  try {
    return (await Preferences.get({ key: BACKUP_KEY })).value !== null;
  } catch {
    return false;
  }
}

/**
 * Replaces the save with a Dev progress phase. The save it replaces is kept as the backup, unless one is
 * kept already (so loading phase after phase still restores to your own game).
 */
export async function loadDevPhase(current: GameState, phase: GameState): Promise<void> {
  if (!(await hasDevBackup())) await Preferences.set({ key: BACKUP_KEY, value: serialize(current) });
  await Preferences.set({ key: KEY, value: serialize(phase) });
}

/** Puts the save kept by loadDevPhase back. */
export async function restoreDevBackup(): Promise<void> {
  const { value } = await Preferences.get({ key: BACKUP_KEY });
  if (value === null) return;
  await Preferences.set({ key: KEY, value });
  await Preferences.remove({ key: BACKUP_KEY });
}
