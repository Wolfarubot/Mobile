import { Preferences } from '@capacitor/preferences';
import { deserialize, serialize, type GameState } from './state';

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
