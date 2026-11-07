import { defineConfig } from 'vitest/config';
import base from './vitest.config.ts';

export default defineConfig({
  ...base,
  test: {
    ...base.test,
    // Hosted OIDC/gateway/worker suites are self-contained loopback tests
    // (mock identity provider, ephemeral 127.0.0.1 servers, in-process workers)
    // and must run under their own script; they are deliberately excluded from
    // the default `test` run so it stays fast and server-free.
    exclude: (base.test.exclude ?? []).filter((pattern) => pattern !== 'tests/hosted-*.test.mjs'),
  },
});
