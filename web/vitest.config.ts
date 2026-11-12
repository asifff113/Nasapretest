// Part of CaseFile Earth. Written with AI assistance; see docs/AI_USE.md.
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { offlineData } from './build/plugins';

export default defineConfig({
  plugins: [react(), offlineData(false)],
  define: { __OFFLINE__: 'false' },
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.{ts,tsx}'],
  },
});
