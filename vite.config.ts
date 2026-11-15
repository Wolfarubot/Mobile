import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';

/** The build's date and commit, sent with feedback so a report can be matched to the code it came from. */
const commit = (() => {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return (process.env.GITHUB_SHA ?? '').slice(0, 7);
  }
})();
const BUILD = `${new Date().toISOString().slice(0, 10)} ${commit}`.trim();

// The Dev settings' progress phases (public/dev-presets.json) ship in every build: the Dev name opens them anywhere.
export default defineConfig(() => ({
  define: { __BUILD__: JSON.stringify(BUILD) },
  // Relative paths so the build works inside the Capacitor WebView.
  base: './',
  build: { target: 'es2020' },
}));
