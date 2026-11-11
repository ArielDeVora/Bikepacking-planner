import { defineConfig, type Plugin } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { buildId } from './scripts/build-id.mjs';
import { serviceWorker } from './scripts/sw-plugin.mjs';

const BUILD = buildId();

/** Writes version.json next to the app, so open tabs can tell when a newer build is online. */
const versionFile = (): Plugin => ({
  name: 'version-file',
  apply: 'build',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD }) });
  },
});

export default defineConfig({
  base: './',
  plugins: [svelte(), versionFile(), serviceWorker(BUILD)],
  define: { __APP_BUILD__: JSON.stringify(BUILD) },
  build: {
    target: 'es2022',
    sourcemap: true,
    // MapLibre alone is ~1 MB; keep it in its own long-cached chunk.
    chunkSizeWarningLimit: 1200,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'maplibre', test: /node_modules[\\/]maplibre-gl/ },
            { name: 'supabase', test: /node_modules[\\/]@supabase/ },
          ],
        },
      },
    },
  },
  test: { include: ['src/**/*.test.ts'] },
});
