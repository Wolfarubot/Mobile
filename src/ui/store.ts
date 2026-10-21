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
}

export const REMOVE_ADS: Product = { id: 'remove_ads', name: 'Remove Ads', price: '$4.99' };

export const GEM_PACKS: Product[] = [
  { id: 'gems_50', name: 'Pouch of Gems', price: '$0.99', gems: 50 },
  { id: 'gems_275', name: 'Bag of Gems', price: '$4.99', gems: 250, bonus: 25 },
  { id: 'gems_600', name: 'Chest of Gems', price: '$9.99', gems: 500, bonus: 100 },
  { id: 'gems_1300', name: 'Trove of Gems', price: '$19.99', gems: 1000, bonus: 300 },
  { id: 'gems_3500', name: 'Hoard of Gems', price: '$49.99', gems: 2500, bonus: 1000 },
];

export function purchase(_id: string): Promise<boolean> {
  return Promise.resolve(STORE_TEST_MODE);
}
