/**
 * Player accounts (Menu → Account): signing in with Google, Apple or an email address, signing out, and deleting
 * the account. Cloud saves will hang off the signed-in account.
 *
 * The online service is Firebase Authentication. Its project settings live in firebaseConfig.ts; until they're filled
 * in, `ACCOUNTS_READY` is false, every sign-in fails with `unavailable` and the Account page says sign-in is on its way.
 *
 * The Firebase JavaScript SDK holds the signed-in account everywhere. In a browser, Google and Apple sign in through
 * Firebase's pop-up. In the Android and iOS apps they sign in natively (the @capacitor-firebase/authentication
 * plugin: the system's own Google account picker, Sign in with Apple), and the credential it returns signs in the
 * JavaScript SDK. Email and password go straight through the JavaScript SDK on every platform. The page only uses
 * this module's functions.
 */
import { Capacitor } from '@capacitor/core';
import { FIREBASE_CONFIG, FIREBASE_CONFIGURED } from './firebaseConfig';

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
export type AccountErrorCode = 'unavailable' | 'cancelled' | 'wrongPassword' | 'noAccount' | 'emailInUse' | 'weakPassword' | 'badEmail' | 'network' | 'recentLogin' | 'tooMany' | 'failed';

export class AccountError extends Error {
  constructor(readonly code: AccountErrorCode) {
    super(code);
  }
}

/** True once the online service is connected (its project settings are filled in). */
export const ACCOUNTS_READY = FIREBASE_CONFIGURED;

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

/** Firebase's error codes (and the native plugin's cancel messages), as ours. */
function accountError(e: unknown): AccountError {
  if (e instanceof AccountError) return e;
  const code = String((e as { code?: unknown })?.code ?? '');
  const msg = String((e as { message?: unknown })?.message ?? '').toLowerCase();
  const map: Record<string, AccountErrorCode> = {
    'auth/wrong-password': 'wrongPassword',
    'auth/invalid-credential': 'wrongPassword',
    'auth/invalid-login-credentials': 'wrongPassword',
    'auth/user-not-found': 'noAccount',
    'auth/email-already-in-use': 'emailInUse',
    'auth/weak-password': 'weakPassword',
    'auth/invalid-email': 'badEmail',
    'auth/missing-email': 'badEmail',
    'auth/network-request-failed': 'network',
    'auth/requires-recent-login': 'recentLogin',
    'auth/too-many-requests': 'tooMany',
    // A sign-in method that isn't switched on in the Firebase project yet.
    'auth/operation-not-allowed': 'unavailable',
    'auth/popup-closed-by-user': 'cancelled',
    'auth/cancelled-popup-request': 'cancelled',
    'auth/user-cancelled': 'cancelled',
  };
  if (map[code]) return new AccountError(map[code]);
  // The native sign-in sheets report backing out in their own words.
  if (/cancel|canceled|dismiss|1001|12501/.test(code + ' ' + msg)) return new AccountError('cancelled');
  return new AccountError('failed');
}

type FirebaseAuth = typeof import('firebase/auth');
let ready: Promise<{ fb: FirebaseAuth; auth: import('firebase/auth').Auth; app: import('firebase/app').FirebaseApp }> | null = null;

/** Firebase, loaded on first use (and at start-up, to restore a signed-in account). */
function firebase() {
  if (!FIREBASE_CONFIGURED) return Promise.reject(new AccountError('unavailable'));
  ready ??= (async () => {
    const [{ initializeApp }, fb] = await Promise.all([import('firebase/app'), import('firebase/auth')]);
    const app = initializeApp(FIREBASE_CONFIG);
    // In the apps the account is kept in the web view's storage, so it's still signed in next time.
    const auth = Capacitor.isNativePlatform() ? fb.initializeAuth(app, { persistence: fb.indexedDBLocalPersistence }) : fb.getAuth(app);
    fb.onAuthStateChanged(auth, (u) => changed(u ? toUser(u) : null));
    return { fb, auth, app };
  })();
  return ready;
}

/** Which way an account signed in: its first provider Firebase knows. */
function toUser(u: import('firebase/auth').User): AccountUser {
  const p = u.providerData[0]?.providerId;
  const provider: AuthProvider = p === 'google.com' ? 'google' : p === 'apple.com' ? 'apple' : 'email';
  return { uid: u.uid, provider, email: u.email ?? u.providerData[0]?.email ?? '', ...(u.displayName ? { name: u.displayName } : {}) };
}

/** Runs a Firebase call, turning what goes wrong into an AccountError. */
async function call<T>(f: (x: Awaited<ReturnType<typeof firebase>>) => Promise<T>): Promise<T> {
  const x = await firebase();
  try {
    return await f(x);
  } catch (e) {
    throw accountError(e);
  }
}

const backend: Backend = FIREBASE_CONFIGURED
  ? {
      signIn: (provider) =>
        call(async ({ fb, auth }) => {
          if (!Capacitor.isNativePlatform()) {
            const p = provider === 'google' ? new fb.GoogleAuthProvider() : new fb.OAuthProvider('apple.com');
            if (provider === 'apple') (p as import('firebase/auth').OAuthProvider).addScope('email');
            return toUser((await fb.signInWithPopup(auth, p)).user);
          }
          // Natively: the system's sign-in sheet, then its credential signs in the JavaScript SDK. (Left out of a
          // build without the project's native settings: see capacitor.config.ts.)
          if (!Capacitor.isPluginAvailable('FirebaseAuthentication')) throw new AccountError('unavailable');
          const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
          if (provider === 'google') {
            const r = await FirebaseAuthentication.signInWithGoogle({ skipNativeAuth: true });
            const cred = fb.GoogleAuthProvider.credential(r.credential?.idToken, r.credential?.accessToken);
            return toUser((await fb.signInWithCredential(auth, cred)).user);
          }
          const r = await FirebaseAuthentication.signInWithApple({ skipNativeAuth: true, scopes: ['email', 'name'] });
          const cred = new fb.OAuthProvider('apple.com').credential({ idToken: r.credential?.idToken, rawNonce: r.credential?.nonce });
          return toUser((await fb.signInWithCredential(auth, cred)).user);
        }),
      signInEmail: (email, password) => call(async ({ fb, auth }) => toUser((await fb.signInWithEmailAndPassword(auth, email, password)).user)),
      createEmail: (email, password) => call(async ({ fb, auth }) => toUser((await fb.createUserWithEmailAndPassword(auth, email, password)).user)),
      resetPassword: (email) => call(({ fb, auth }) => fb.sendPasswordResetEmail(auth, email)),
      signOut: () =>
        call(async ({ fb, auth }) => {
          if (Capacitor.isNativePlatform()) {
            const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
            await FirebaseAuthentication.signOut().catch(() => {});
          }
          await fb.signOut(auth);
        }),
      deleteAccount: () =>
        call(async ({ fb, auth, app }) => {
          if (!auth.currentUser) throw new AccountError('failed');
          // The cloud save goes first, while the account can still reach it.
          const { doc, deleteDoc, getFirestore } = await import('firebase/firestore');
          await deleteDoc(doc(getFirestore(app), 'saves', auth.currentUser.uid));
          await fb.deleteUser(auth.currentUser);
          if (Capacitor.isNativePlatform()) {
            const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
            await FirebaseAuthentication.signOut().catch(() => {});
          }
        }),
    }
  : {
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

/** The Firebase app, once the online service is connected (for the cloud save). */
export async function firebaseApp(): Promise<import('firebase/app').FirebaseApp> {
  return (await firebase()).app;
}

/** At start-up: restores the account signed in last time (when the online service is connected). */
export function initAccounts(): void {
  if (FIREBASE_CONFIGURED) void firebase().catch(() => {});
}

/** Dev builds only: pretend to be signed in, to see the signed-in Account page (`__account.fake('google', 'a@b.c')`). */
export function devFakeSignIn(provider: AuthProvider, email: string, name?: string): void {
  if (import.meta.env.DEV) changed({ uid: `dev-${provider}`, provider, email, name });
}
