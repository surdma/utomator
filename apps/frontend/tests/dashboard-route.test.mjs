import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getDashboardRoute } from '../components/dashboard/pipeline/dashboard-route.ts';

test('dashboard pages resolve their active pane without effect-driven state', () => {
  for (const [path, pane] of [
    ['/dashboard/workspace', 'workspace'],
    ['/dashboard/pipeline', 'workspace'],
    ['/dashboard/history', 'history'],
    ['/dashboard/settings', 'settings'],
    ['/dashboard/resumes/profile', 'resumes'],
    ['/dashboard/profile/details', 'profile'],
    ['/dashboard/growth', 'growth'],
  ]) {
    assert.equal(getDashboardRoute(path).pane, pane, path);
  }
});

test('nested growth and legacy craft paths preserve the selected item', () => {
  const visual = getDashboardRoute('/dashboard/growth/example');
  assert.deepEqual(visual, {
    pane: 'growth',
    craftId: 'example',
    libraryView: 'visual',
  });
  const source = getDashboardRoute('/dashboard/crafts/example/source');
  assert.deepEqual(source, {
    pane: 'growth',
    craftId: 'example',
    libraryView: 'source',
  });
  assert.equal(
    getDashboardRoute('/growth/default-growth-profile').craftId,
    'default-growth-profile'
  );
});

test('non-craft routes do not erase the remembered craft selection', () => {
  const history = getDashboardRoute('/dashboard/history');
  assert.equal(history.craftId, undefined);
  assert.equal(history.libraryView, 'catalog');
  assert.equal(getDashboardRoute('/unsupported').pane, null);
});
