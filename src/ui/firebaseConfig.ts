/**
 * The Firebase project's web app settings (Firebase console → Project settings → Your apps → the web app → SDK setup
 * and configuration), for the pocket-hunter-d6a1e project. These are public by design (they name the project; they aren't a password): who may sign in
 * and what they may touch is set in Firebase itself. With any of them empty, sign-in stays off.
 *
 * They can also come from the build's environment (VITE_FIREBASE_API_KEY and so on), which wins over the values here.
 */
const env = import.meta.env as Record<string, string | undefined>;

export const FIREBASE_CONFIG = {
  apiKey: env.VITE_FIREBASE_API_KEY ?? 'AIzaSyDA0519Gx-_LimJodeQp43AO6ozBX2aEfk',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN ?? 'pocket-hunter-d6a1e.firebaseapp.com',
  projectId: env.VITE_FIREBASE_PROJECT_ID ?? 'pocket-hunter-d6a1e',
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET ?? 'pocket-hunter-d6a1e.firebasestorage.app',
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '782309206230',
  appId: env.VITE_FIREBASE_APP_ID ?? '1:782309206230:web:3a14abf259ac4d48444177',
};

/** Whether the project's settings are filled in. */
export const FIREBASE_CONFIGURED = !!(FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.projectId && FIREBASE_CONFIG.appId);
