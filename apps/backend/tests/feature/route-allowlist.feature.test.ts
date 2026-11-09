import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

process.env.NODE_ENV = 'test';
const { buildApp } = await import('../../src/main.js');

describe('interface routes', () => {
  let app: ReturnType<typeof buildApp> | undefined;

  afterEach(async () => {
    await app?.close();
  });

  it('serves health on the composition root', async () => {
    app = buildApp();
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });

  it('registers run routes from the interface layer', () => {
    const source = readFileSync(path.resolve('src/interface/http/runs.ts'), 'utf8');
    expect(source).toContain('registerRunRoutes');
  });
});
