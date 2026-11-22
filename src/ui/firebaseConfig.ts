/**
 * The Firebase project's web app settings (Firebase console → Project settings → Your apps → the web app → SDK setup
 * and configuration). These are public by design (they name the project; they aren't a password): who may sign in
 * and what they may touch is set in Firebase itself. Empty until the project is set up: then sign-in stays off.
 *
 * They can also come from the build's environment (VITE_FIREBASE_API_KEY and so on), which wins over the values here.
 */
const env = import.meta.env as Record<string, string | undefined>;

export const FIREBASE_CONFIG = {
  apiKey: env.VITE_FIREBASE_API_KEY ?? '',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN ?? '',
  projectId: env.VITE_FIREBASE_PROJECT_ID ?? '',
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET ?? '',
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '',
  appId: env.VITE_FIREBASE_APP_ID ?? '',
};

/** Whether the project's settings are filled in. */
export const FIREBASE_CONFIGURED = !!(FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.projectId && FIREBASE_CONFIG.appId);
