import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/feature/**/*.{ts,mjs}'],
    exclude: ['node_modules', '.next', 'dist'],
    globals: false,
  },
});