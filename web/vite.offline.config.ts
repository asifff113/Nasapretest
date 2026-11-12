// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
// The offline build (docs/04_UI.md §4.12, ADR-07): one HTML file with the code, styles, fonts and
// every file listed in offline/set.json inlined. It makes no network request at all.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { offlineCsp, offlineData } from './build/plugins';

export default defineConfig({
  base: './',
  // One file and nothing else: the map outlines in public/ are not part of the offline set.
  publicDir: false,
  plugins: [react(), tailwindcss(), offlineData(true), offlineCsp(), viteSingleFile({ removeViteModuleLoader: true })],
  define: {
    __OFFLINE__: 'true',
  },
  build: {
    target: 'es2022',
    outDir: 'dist-offline',
    emptyOutDir: true,
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    chunkSizeWarningLimit: 20_000,
  },
});
