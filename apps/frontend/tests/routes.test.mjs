
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { test, expect } from 'vitest';
import assert from 'node:assert/strict';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const pages = [
  'pipeline',
  'workspace',
  'crafts',
  'editorial',
  'growth',
  'history',
  'profile',
  'research',
  'resumes',
  'settings',
];
test('the marketing root is separate and every operator page is nested under dashboard', async () => {
  expect(existsSync(new URL('app/page.tsx', root))).toBeTruthy();
  expect(existsSync(new URL('app/dashboard/page.tsx', root))).toBeTruthy();
  for (const route of pages)
    expect(existsSync(new URL(`app/dashboard/${route}/page.tsx`, root))).toBeTruthy();
  for (const route of [
    'workspace',
    'library',
    'crafts',
    'editorial',
    'history',
    'memory',
    'observer',
    'profile',
    'research',
    'resumes',
    'settings',
    '_automate',
    '%5Fautomate',
  ])
    expect(!existsSync(new URL(`app/${route}`, root))).toBeTruthy();
  expect(existsSync(new URL('app/dashboard/crafts/[craftId]/source/page.tsx', root))).toBeTruthy();
  expect(existsSync(new URL('app/dashboard/growth/[craftId]/page.tsx', root))).toBeTruthy();
  expect(existsSync(new URL('app/growth/default-growth-profile/page.tsx', root))).toBeTruthy();
  expect(existsSync(new URL('app/dashboard/growth/[craftId]/source/page.tsx', root))).toBeTruthy();
  expect(existsSync(new URL('app/dashboard/resumes/[resumeId]/page.tsx', root))).toBeTruthy();
  assert.match(
    await read('app/dashboard/page.tsx'),
    /redirect\(['"]\/dashboard\/workspace['"]\)/,
  );
  expect(await read('components/dashboard/dashboard-shell.tsx')).toMatch(/DashboardShell/);
  expect(await read('components/home/hero-button.tsx')).toMatch(/href="\/dashboard\/workspace"/);
});
test('API proxy remains loopback-only and craft endpoints are allowlisted', async () => {
  const api = await read('app/api/[...path]/route.ts');
  expect(api).toMatch(/allowedHost\(req\)/);
  expect(api).toMatch(/permitted\(target, req.method\)/);
  expect(api).toMatch(/127\.0\.0\.1:/);
  expect(api).toMatch(/Same-origin request required/);
  expect(api).toMatch(/\/api\/linkedin\/oauth\/callback/);
  expect(!api.includes('/_automate')).toBeTruthy();
  expect(api).toMatch(/['"]crafts['"]/);
  expect(api).not.toMatch(/['"]skills['"]/);
});
test('marketing content does not embed old personal portfolio identity', async () => {
  const layout = await read('app/layout.tsx');
  expect(!layout.includes('@/lib/data')).toBeTruthy();
  expect(!layout.includes('profileImage')).toBeTruthy();
  for (const path of [
    'components/navbar.tsx',
    'components/footer.tsx',
    'components/home/hero-text.tsx',
  ])
    expect(!(await read(path)).includes('Sodiq Oladejo')).toBeTruthy();
});
