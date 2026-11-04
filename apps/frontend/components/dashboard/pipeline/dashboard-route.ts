export type DashboardPane =
  | 'workspace'
  | 'history'
  | 'crafts'
  | 'profile'
  | 'resumes'
  | 'observer'
  | 'memory'
  | 'research'
  | 'editorial'
  | 'growth'
  | 'settings';

export type LibraryView = 'source' | 'visual' | 'catalog';

// A missing craft ID means keep the last selected craft when leaving its route.
export function getDashboardRoute(pathname: string): {
  pane: DashboardPane | null;
  craftId: string | null | undefined;
  libraryView: LibraryView;
} {
  const libraryView: LibraryView = pathname.endsWith('/source')
    ? 'source'
    : pathname.startsWith('/growth/') ||
        pathname.startsWith('/dashboard/growth/') ||
        pathname.startsWith('/dashboard/crafts/')
      ? 'visual'
      : 'catalog';

  let pane: DashboardPane | null = null;
  let craftId: string | null | undefined;
  if (pathname === '/growth/default-growth-profile') {
    pane = 'growth';
    craftId = 'default-growth-profile';
  } else if (
    pathname.startsWith('/dashboard/growth/') ||
    pathname.startsWith('/dashboard/crafts/')
  ) {
    const id = pathname.split('/')[3];
    pane = 'growth';
    craftId = id || null;
  } else if (pathname === '/dashboard/crafts') pane = 'growth';
  else if (pathname === '/dashboard/history') pane = 'history';
  else if (pathname.startsWith('/dashboard/profile')) pane = 'profile';
  else if (pathname.startsWith('/dashboard/resumes')) pane = 'resumes';
  else if (pathname === '/dashboard/observer') pane = 'observer';
  else if (pathname === '/dashboard/memory') pane = 'memory';
  else if (pathname === '/dashboard/research') pane = 'research';
  else if (pathname === '/dashboard/editorial') pane = 'editorial';
  else if (pathname === '/dashboard/growth') pane = 'growth';
  else if (pathname === '/dashboard/settings') pane = 'settings';
  else if (
    pathname === '/dashboard/workspace' ||
    pathname === '/dashboard/pipeline'
  )
    pane = 'workspace';
  return { pane, craftId, libraryView };
}
