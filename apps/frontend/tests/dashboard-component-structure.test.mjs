import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

const root = resolve(import.meta.dirname, '..');
const component = (path) => resolve(root, 'components/dashboard', path);

test('dashboard has one routed shell and no obsolete automate component tree', () => {
  assert.equal(existsSync(resolve(root, 'components/automate')), false);
  assert.equal(existsSync(component('dashboard-shell.tsx')), true);
  for (const feature of [
    'career',
    'connections',
    'crafts',
    'editorial',
    'growth',
    'intelligence',
    'pipeline',
    'research',
    'reviews',
    'settings',
    'workflows',
  ]) {
    assert.equal(existsSync(component(feature)), true, feature);
  }
});

test('retired Mator UI modules cannot return without a reference audit', () => {
  assert.equal(existsSync(component('intelligence-studio.tsx')), false);
  assert.equal(existsSync(component('linkedin-growth-hub.tsx')), false);
  assert.equal(existsSync(component('career/section-editor.tsx')), true);
  assert.equal(existsSync(component('workflows/workflow-step-card.tsx')), true);
});

test('dashboard pages consume the shared dashboard shell', () => {
  for (const route of ['pipeline', 'settings', 'growth', 'history', 'resumes']) {
    const page = readFileSync(
      resolve(root, 'app/dashboard', route, 'page.tsx'),
      'utf8'
    );
    assert.match(page, /components\/dashboard\/dashboard-shell/);
    assert.doesNotMatch(page, /components\/automate/);
  }
});
