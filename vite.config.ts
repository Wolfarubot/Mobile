import { defineConfig } from 'vite';

export default defineConfig({
  // Relative paths so the build works inside the Capacitor WebView.
  base: './',
  build: { target: 'es2020' },
});
