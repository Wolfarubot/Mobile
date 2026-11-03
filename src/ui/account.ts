/**
 * Player accounts (Menu → Account): signing in with Google, Apple or an email address, signing out, and deleting
 * the account. Cloud saves will hang off the signed-in account.
 *
 * The online service (Firebase Authentication) isn't connected yet, so `ACCOUNTS_READY` is false: every sign-in
 * fails with `unavailable` and the Account page says sign-in is on its way. Connecting it means filling in
 * `backend` below with the Firebase calls; the page only uses this module's functions.
 */

export type AuthProvider = 'google' | 'apple' | 'email';

export interface AccountUser {
  /** The account's id with the online service. */
  uid: string;
  provider: AuthProvider;
  /** The address the account signed in with (Apple's can be a private relay address). */
  email: string;
  /** A display name, when the provider gives one. */
  name?: string;
}

/** Why a sign-in (or other account action) didn't go through. */
export type AccountErrorCode = 'unavailable' | 'cancelled' | 'wrongPassword' | 'noAccount' | 'emailInUse' | 'weakPassword' | 'badEmail' | 'network' | 'failed';

export class AccountError extends Error {
  constructor(readonly code: AccountErrorCode) {
    super(code);
  }
}

/** True once the online service is connected. */
export const ACCOUNTS_READY = false;

/** The calls the online service will provide. */
interface Backend {
  signIn(provider: 'google' | 'apple'): Promise<AccountUser>;
  signInEmail(email: string, password: string): Promise<AccountUser>;
  createEmail(email: string, password: string): Promise<AccountUser>;
  resetPassword(email: string): Promise<void>;
  signOut(): Promise<void>;
  deleteAccount(): Promise<void>;
}

const unavailable = (): Promise<never> => Promise.reject(new AccountError('unavailable'));
const backend: Backend = {
  signIn: unavailable,
  signInEmail: unavailable,
  createEmail: unavailable,
  resetPassword: unavailable,
  signOut: unavailable,
  deleteAccount: unavailable,
};

let user: AccountUser | null = null;
const listeners = new Set<() => void>();
const changed = (u: AccountUser | null) => {
  user = u;
  for (const f of listeners) f();
};

/** The signed-in account, or null. */
export function currentUser(): AccountUser | null {
  return user;
}

/** Calls `f` whenever the signed-in account changes; returns a function that stops it. */
export function onAccountChange(f: () => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

export async function signIn(provider: 'google' | 'apple'): Promise<AccountUser> {
  const u = await backend.signIn(provider);
  changed(u);
  return u;
}

/** Signs in with an email address and password (`create`: makes a new account first). */
export async function signInEmail(email: string, password: string, create: boolean): Promise<AccountUser> {
  const u = await (create ? backend.createEmail(email, password) : backend.signInEmail(email, password));
  changed(u);
  return u;
}

export function resetPassword(email: string): Promise<void> {
  return backend.resetPassword(email);
}

export async function signOut(): Promise<void> {
  if (user?.uid.startsWith('dev-')) return changed(null);
  await backend.signOut();
  changed(null);
}

/** Deletes the account and everything stored online for it. The game on this device is kept. */
export async function deleteAccount(): Promise<void> {
  if (user?.uid.startsWith('dev-')) return changed(null);
  await backend.deleteAccount();
  changed(null);
}

/** Dev builds only: pretend to be signed in, to see the signed-in Account page (`__account.fake('google', 'a@b.c')`). */
export function devFakeSignIn(provider: AuthProvider, email: string, name?: string): void {
  if (import.meta.env.DEV) changed({ uid: `dev-${provider}`, provider, email, name });
}
