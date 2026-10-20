import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import type { HapticLevel } from '../core/state';

/**
 * Haptic feedback for button presses and battlefield taps (not swipes or scrolls): a short tap of the phone's
 * vibration motor at the strength picked in Settings, or none when it's off. Off a phone, browsers that can
 * vibrate get a matching short buzz.
 */
let level: HapticLevel = 'medium';

export function setHaptics(l: HapticLevel): void {
  level = l;
}

const STYLES: Record<Exclude<HapticLevel, 'off'>, ImpactStyle> = { light: ImpactStyle.Light, medium: ImpactStyle.Medium, strong: ImpactStyle.Heavy };
const BUZZ_MS: Record<Exclude<HapticLevel, 'off'>, number> = { light: 8, medium: 14, strong: 24 };

export function buzz(): void {
  if (level === 'off') return;
  if (Capacitor.isNativePlatform()) void Haptics.impact({ style: STYLES[level] }).catch(() => {});
  else navigator.vibrate?.(BUZZ_MS[level]);
}
