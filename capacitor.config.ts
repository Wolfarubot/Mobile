import type { CapacitorConfig } from '@capacitor/cli';
import { existsSync, readFileSync } from 'node:fs';

/**
 * The Firebase sign-in plugin starts native Firebase as the app opens, which needs the project's Firebase file
 * (android/app/google-services.json, ios/App/App/GoogleService-Info.plist): without it the app would close on launch.
 * So until that file is added, a platform's build leaves the plugin out (email sign-in still works; Google and Apple
 * say they're unavailable).
 */
const otherPlugins = Object.keys((JSON.parse(readFileSync('package.json', 'utf8')) as { dependencies: Record<string, string> }).dependencies).filter(
  (d) => d.startsWith('@capacitor/') && d !== '@capacitor/cli' && d !== '@capacitor/core' && d !== '@capacitor/android' && d !== '@capacitor/ios',
);
const androidPlugins = existsSync('android/app/google-services.json') ? undefined : otherPlugins;
const iosPlugins = existsSync('ios/App/App/GoogleService-Info.plist') ? undefined : otherPlugins;

const config: CapacitorConfig = {
  appId: 'com.variettestudios.pockethunter',
  appName: 'Pocket Hunter',
  webDir: 'dist',
  android: { backgroundColor: '#14101f', ...(androidPlugins ? { includePlugins: androidPlugins } : {}) },
  ios: { backgroundColor: '#14101f', contentInset: 'never', ...(iosPlugins ? { includePlugins: iosPlugins } : {}) },
  plugins: {
    // Google and Apple sign in natively, then hand their credential to the Firebase JavaScript SDK (src/ui/account.ts).
    FirebaseAuthentication: { skipNativeAuth: true, providers: ['google.com', 'apple.com'] },
  },
  experimental: {
    // Avoids a Swift Package Manager package-name clash, and links only the Google sign-in SDK, not Facebook's (see the
    // plugin's README).
    ios: {
      spm: {
        swiftToolsVersion: '6.1',
        packageOptions: { '@capacitor-firebase/authentication': { symlink: true } },
        packageTraits: { '@capacitor-firebase/authentication': ['Google'] },
      },
    },
  },
};

export default config;
