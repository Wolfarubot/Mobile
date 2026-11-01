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

export function applyOrientation(o: Orientation): void {
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
