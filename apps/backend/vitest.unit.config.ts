import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/*.{ts,mjs}', 'tests/unit/**/*.{ts,mjs}'],
    exclude: [
      'tests/*.integration.test.ts',
      'tests/hosted-*.test.mjs',
      'tests/support/**',
      'node_modules',
      'dist',
      '.runtime',
    ],
    globals: false,
  },
});
