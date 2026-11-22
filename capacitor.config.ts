import type { CapacitorConfig } from '@capacitor/cli';
import { existsSync, readFileSync } from 'node:fs';

/**
 * The Firebase sign-in plugin starts native Firebase as the app opens, which needs the project's
 * android/app/google-services.json: without it the app would close on launch. So until that file is added, the
 * Android build leaves the plugin out (email sign-in still works; Google and Apple say they're unavailable).
 */
const androidPlugins = existsSync('android/app/google-services.json')
  ? undefined
  : Object.keys((JSON.parse(readFileSync('package.json', 'utf8')) as { dependencies: Record<string, string> }).dependencies).filter((d) => d.startsWith('@capacitor/') && d !== '@capacitor/cli' && d !== '@capacitor/core' && d !== '@capacitor/android' && d !== '@capacitor/ios');

const config: CapacitorConfig = {
  appId: 'com.variettestudios.pockethunter',
  appName: 'Pocket Hunter',
  webDir: 'dist',
  android: { backgroundColor: '#14101f', ...(androidPlugins ? { includePlugins: androidPlugins } : {}) },
  ios: { backgroundColor: '#14101f', contentInset: 'never' },
  plugins: {
    // Google and Apple sign in natively, then hand their credential to the Firebase JavaScript SDK (src/ui/account.ts).
    FirebaseAuthentication: { skipNativeAuth: true, providers: ['google.com', 'apple.com'] },
  },
  experimental: {
    // Avoids a Swift Package Manager package-name clash (see the plugin's README).
    ios: { spm: { packageOptions: { '@capacitor-firebase/authentication': { symlink: true } } } },
  },
};

export default config;
