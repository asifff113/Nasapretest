// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { offlineData, resultsServer, siteCsp } from './build/plugins';

// The site always reads its results from RESULTS_BASE (default "./results", relative to the page).
// In development and preview, RESULTS_DIR picks which folder is served at /results/:
// the repository's examples/ (default) or a real results folder such as ../results.
export default defineConfig({
  base: './',
  // RESULTS_BASE (docs/01_ARCHITECTURE.md §6.3) is read at build time, as is any VITE_ value.
  envPrefix: ['VITE_', 'RESULTS_BASE'],
  plugins: [react(), tailwindcss(), resultsServer(), offlineData(false), siteCsp()],
  define: {
    __OFFLINE__: 'false',
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 600,
  },
});
