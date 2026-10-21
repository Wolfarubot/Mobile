/**
 * Rewarded ads. There's no ad network wired in yet, so an ad "plays" at once and always pays out; swap this for the
 * ad SDK's rewarded-video call (resolving true only when the viewer earned the reward) when one is added.
 */
export function showRewardedAd(): Promise<boolean> {
  return Promise.resolve(true);
}
