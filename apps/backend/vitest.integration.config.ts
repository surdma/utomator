import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/*.integration.test.ts'],
    exclude: ['tests/support/**', 'node_modules', 'dist', '.runtime'],
    globals: false,
  },
});
