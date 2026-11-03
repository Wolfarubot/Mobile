import { execSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

/** `npm run build:release`: leaves the Dev settings' progress phases (public/dev-presets.json) out of the build. */
const dropDevFiles = (): Plugin => ({
  name: 'drop-dev-files',
  apply: 'build',
  closeBundle() {
    rmSync(resolve(import.meta.dirname, 'dist/dev-presets.json'), { force: true });
  },
});

/** The build's date and commit, sent with feedback so a report can be matched to the code it came from. */
const commit = (() => {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return (process.env.GITHUB_SHA ?? '').slice(0, 7);
  }
})();
const BUILD = `${new Date().toISOString().slice(0, 10)} ${commit}`.trim();

export default defineConfig(({ mode }) => ({
  define: { __BUILD__: JSON.stringify(BUILD) },
  // Relative paths so the build works inside the Capacitor WebView.
  base: './',
  build: { target: 'es2020' },
  plugins: mode === 'release' ? [dropDevFiles()] : [],
}));
