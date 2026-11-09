import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.{ts,mjs}'],
    exclude: [
      'tests/feature/**',
      'tests/frontend-quality.test.ts',
      'tests/connector-sync-playwright.mjs',
      'tests/connector-states.test.ts',
      'tests/connector-sync.test.ts',
      'tests/mator-groq.e2e.test.ts',
      'tests/mock-provider.test.ts',
      'tests/support/**',
      'node_modules',
      '.next',
      'dist',
    ],
    globals: false,
  },
});
