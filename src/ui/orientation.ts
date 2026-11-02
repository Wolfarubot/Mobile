import { Capacitor } from '@capacitor/core';
import { ScreenOrientation, type OrientationLockType } from '@capacitor/screen-orientation';
import type { Orientation } from '../core/state';

/**
 * Settings → Orientation on the phone app: Rotate follows the phone (and its own rotation lock); Portrait, and
 * Landscape left or right (the top of the phone pointing that way), hold the screen there. In a browser it
 * tries the same through the Screen Orientation API, which most only allow in full screen, so it may do nothing.
 */
const LOCKS: Record<Exclude<Orientation, 'rotate'>, OrientationLockType> = {
  portrait: 'portrait-primary',
  landscapeLeft: 'landscape-primary',
  landscapeRight: 'landscape-secondary',
};

/** The setting last applied, to go back to after a minigame. */
let setting: Orientation = 'rotate';

/**
 * Holds the screen the way round it is now (while a minigame plays, so turning the phone can't reshape it).
 * `release` goes back to the Orientation setting.
 */
export function holdOrientation(): void {
  if (setting !== 'rotate') return; // already locked one way round
  if (Capacitor.isNativePlatform()) {
    void ScreenOrientation.orientation()
      .then(({ type }) => ScreenOrientation.lock({ orientation: type as OrientationLockType }))
      .catch(() => {});
    return;
  }
  const so = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
  try {
    if (so?.type) void so.lock?.(so.type).catch(() => {});
  } catch {
    // Not supported here.
  }
}

export function releaseOrientation(): void {
  applyOrientation(setting);
}

export function applyOrientation(o: Orientation): void {
  setting = o;
  if (Capacitor.isNativePlatform()) {
    void (o === 'rotate' ? ScreenOrientation.unlock() : ScreenOrientation.lock({ orientation: LOCKS[o] })).catch(() => {});
    return;
  }
  const so = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
  try {
    if (o === 'rotate') so?.unlock?.();
    else void so?.lock?.(LOCKS[o]).catch(() => {});
  } catch {
    // Not supported here.
  }
}
