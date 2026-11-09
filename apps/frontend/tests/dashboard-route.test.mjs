import { expect, test } from 'vitest';
import { getDashboardRoute } from '../modules/pipeline/components/dashboard-route.ts';

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
    expect(getDashboardRoute(path).pane).toEqual(pane);
  }
});

test('nested growth and legacy craft paths preserve the selected item', () => {
  const visual = getDashboardRoute('/dashboard/growth/example');
  expect(visual).toEqual({
    pane: 'growth',
    craftId: 'example',
    libraryView: 'visual',
  });
  const source = getDashboardRoute('/dashboard/crafts/example/source');
  expect(source).toEqual({
    pane: 'growth',
    craftId: 'example',
    libraryView: 'source',
  });
  expect(getDashboardRoute('/growth/default-growth-profile').craftId).toEqual(
    'default-growth-profile',
  );
});

test('non-craft routes do not erase the remembered craft selection', () => {
  const history = getDashboardRoute('/dashboard/history');
  expect(history.craftId).toEqual(undefined);
  expect(history.libraryView).toEqual('catalog');
  expect(getDashboardRoute('/unsupported').pane).toEqual(null);
});
