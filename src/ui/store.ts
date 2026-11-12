/**
 * In-app purchases: removing ads and packs of Exalted Gems. No store billing is wired in yet, so while
 * STORE_TEST_MODE is on a purchase goes through at once without charging anything (the shop says so); swap
 * `purchase` for the billing plugin's call (resolving true only once the payment has gone through) before release.
 */
export const STORE_TEST_MODE = true;

export interface Product {
  id: string;
  name: string;
  /** Shown price (the store's own, localised, once billing is in). */
  price: string;
  /** Exalted Gems it gives. */
  gems?: number;
  /** Bonus gems, shown as "+N bonus". */
  bonus?: number;
  /** Its pixel icon. */
  icon?: string;
}

export const REMOVE_ADS: Product = { id: 'remove_ads', name: 'Remove Ads', price: '$4.99' };

export const GEM_PACKS: Product[] = [
  // The art grows with the pack: a pouch, a bag of treasure, a chest, a gilded chest, one spilling over, a crate
  // brimming with it.
  { id: 'gems_50', name: 'Pouch of Gems', price: '$0.99', gems: 50, icon: 'things/011' },
  { id: 'gems_275', name: 'Bag of Gems', price: '$4.99', gems: 250, bonus: 25, icon: 'things/005' },
  { id: 'gems_600', name: 'Chest of Gems', price: '$9.99', gems: 500, bonus: 100, icon: 'things/066' },
  { id: 'gems_1300', name: 'Trove of Gems', price: '$19.99', gems: 1000, bonus: 300, icon: 'things/069' },
  { id: 'gems_3500', name: 'Hoard of Gems', price: '$49.99', gems: 2500, bonus: 1000, icon: 'things/010' },
  { id: 'gems_7500', name: 'Vault of Gems', price: '$99.99', gems: 5000, bonus: 2500, icon: 'things/009' },
];

export function purchase(_id: string): Promise<boolean> {
  return Promise.resolve(STORE_TEST_MODE);
}
