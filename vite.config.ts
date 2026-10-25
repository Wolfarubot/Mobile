import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

/** `npm run build:release`: leaves the Dev settings' progress phases (public/dev-presets.json) out of the build. */
const dropDevFiles = (): Plugin => ({
  name: 'drop-dev-files',
  apply: 'build',
  closeBundle() {
    rmSync(resolve(__dirname, 'dist/dev-presets.json'), { force: true });
  },
});

export default defineConfig(({ mode }) => ({
  // Relative paths so the build works inside the Capacitor WebView.
  base: './',
  build: { target: 'es2020' },
  plugins: mode === 'release' ? [dropDevFiles()] : [],
}));
