/**
 * Rewarded ads (AdMob, through @capacitor-community/admob), for the game's three ad spots: the Daily Check-in, the
 * energy refill and doubling offline earnings. Each spot has its own AdMob ad unit, so AdMob reports them apart.
 *
 * - The web version has no ads: an ad "plays" at once and always pays out.
 * - Builds other than the release build (`npm run build:release`) show Google's test ads, so nobody clicks the game's
 *   own live ads while testing (which can get the AdMob account suspended).
 * - Before the first ad, Google's consent message is shown where the law asks for one (Europe's GDPR; set up in
 *   AdMob -> Privacy & messaging).
 *
 * showRewardedAd() resolves true only once the player has watched far enough to earn the reward.
 */
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';

export type AdSpot = 'checkIn' | 'energy' | 'offline';

/** AdMob ad unit IDs, by platform and spot (not secret: they ship inside the app). */
const AD_UNITS: Record<'android' | 'ios', Partial<Record<AdSpot, string>>> = {
  android: {
    checkIn: 'ca-app-pub-4449157620018312/7981817706',
    energy: 'ca-app-pub-4449157620018312/1472249675',
  },
  ios: {},
};
/** A spot without its own ad unit yet borrows this one's. */
const FALLBACK_SPOT: AdSpot = 'checkIn';

/** Real ads only in the release build. */
const TESTING = import.meta.env.MODE !== 'release';

type AdMobModule = typeof import('@capacitor-community/admob');

let ready: Promise<AdMobModule | null> | null = null;
let showing = false;
let unavailable: () => void = () => {};
/** Ad units with an ad loaded and waiting. */
const loaded = new Set<string>();

/** Called when an ad was asked for but none could be shown (no connection, or none to fill the spot). */
export function onAdUnavailable(f: () => void): void {
  unavailable = f;
}

function platform(): 'android' | 'ios' | null {
  const p = Capacitor.getPlatform();
  return (p === 'android' || p === 'ios') && Capacitor.isPluginAvailable('AdMob') ? p : null;
}

function unitFor(spot: AdSpot): string | null {
  const p = platform();
  if (!p) return null;
  return AD_UNITS[p][spot] ?? AD_UNITS[p][FALLBACK_SPOT] ?? null;
}

/** Asks for consent where needed and starts the ads SDK (once). Null if ads can't run on this device. */
export function initAds(): Promise<AdMobModule | null> {
  ready ??= (async () => {
    if (!platform()) return null;
    try {
      const m = await import('@capacitor-community/admob');
      const { AdMob, AdmobConsentStatus } = m;
      let consent = await AdMob.requestConsentInfo().catch(() => null);
      if (consent?.isConsentFormAvailable && consent.status === AdmobConsentStatus.REQUIRED) consent = await AdMob.showConsentForm().catch(() => consent);
      if (consent && !consent.canRequestAds) return null;
      await AdMob.initialize();
      // Have the first ad of each spot ready before it's asked for.
      for (const spot of ['checkIn', 'energy', 'offline'] as AdSpot[]) void prepare(m, spot);
      return m;
    } catch {
      return null;
    }
  })();
  return ready;
}

async function prepare(m: AdMobModule, spot: AdSpot): Promise<boolean> {
  const adId = unitFor(spot);
  if (!adId) return false;
  if (loaded.has(adId)) return true;
  try {
    await m.AdMob.prepareRewardVideoAd({ adId, isTesting: TESTING, immersiveMode: true });
    loaded.add(adId);
    return true;
  } catch {
    return false;
  }
}

/** Shows a rewarded ad for a spot. True once the reward is earned; false if it was closed early or none could play. */
export async function showRewardedAd(spot: AdSpot): Promise<boolean> {
  if (!platform()) return true;
  if (showing) return false;
  showing = true;
  try {
    const m = await initAds();
    const adId = unitFor(spot);
    if (!m || !adId || !(await prepare(m, spot))) {
      unavailable();
      return false;
    }
    const { AdMob, RewardAdPluginEvents } = m;
    const handles: PluginListenerHandle[] = [];
    const result = await new Promise<boolean>((resolve) => {
      let earned = false;
      const listen = AdMob.addListener as unknown as (event: string, f: () => void) => Promise<PluginListenerHandle>;
      const on = async (event: string, f: () => void) => handles.push(await listen(event, f));
      void Promise.all([
        on(RewardAdPluginEvents.Rewarded, () => (earned = true)),
        on(RewardAdPluginEvents.Dismissed, () => resolve(earned)),
        on(RewardAdPluginEvents.FailedToShow, () => resolve(false)),
      ]).then(() => {
        loaded.delete(adId);
        // The call itself settles on the reward (or fails to show); closing the ad settles the promise above.
        AdMob.showRewardVideoAd({ adId }).then(
          () => (earned = true),
          () => resolve(earned),
        );
      });
    });
    for (const h of handles) void h.remove();
    // The next ad for this spot loads while the game plays on.
    void prepare(m, spot);
    return result;
  } finally {
    showing = false;
  }
}
