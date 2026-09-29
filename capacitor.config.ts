import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.wolfarubot.monsterhorde',
  appName: 'Pocket Hunter',
  webDir: 'dist',
  android: { backgroundColor: '#14101f' },
  ios: { backgroundColor: '#14101f', contentInset: 'never' },
};

export default config;
