'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

export type DashboardPane =
  | 'pipeline'
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

export function useDashboardNavigation(initialPane: DashboardPane) {
  const pathname = usePathname();
  const [pane, setPane] = useState<DashboardPane>(initialPane);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [selectedCraftId, setSelectedCraftId] = useState<string | null>(null);
  const [selectedCraftSlug, setSelectedCraftSlug] = useState<string | null>(
    null
  );

  const libraryView = pathname.endsWith('/source')
    ? 'source'
    : pathname.startsWith('/growth/') ||
        pathname.startsWith('/dashboard/growth/') ||
        pathname.startsWith('/dashboard/crafts/')
      ? 'visual'
      : 'catalog';
  useEffect(() => {
    if (pathname === '/growth/default-growth-profile') {
      setPane('growth');
      setSelectedCraftId('default-growth-profile');
    } else if (
      pathname.startsWith('/dashboard/growth/') ||
      pathname.startsWith('/dashboard/crafts/')
    ) {
      const id = pathname.split('/')[3];
      setPane('growth');
      setSelectedCraftId(id || null);
    } else if (pathname === '/dashboard/crafts') setPane('growth');
    else if (pathname === '/dashboard/history') setPane('history');
    else if (pathname.startsWith('/dashboard/profile')) setPane('profile');
    else if (pathname.startsWith('/dashboard/resumes')) setPane('resumes');
    else if (pathname === '/dashboard/observer') setPane('observer');
    else if (pathname === '/dashboard/memory') setPane('memory');
    else if (pathname === '/dashboard/research') setPane('research');
    else if (pathname === '/dashboard/editorial') setPane('editorial');
    else if (pathname === '/dashboard/growth') setPane('growth');
    else if (pathname === '/dashboard/settings') setPane('settings');
    else if (pathname === '/dashboard/pipeline') setPane('pipeline');
  }, [pathname]);
  function navigate(path: string) {
    if (typeof window !== 'undefined' && window.location.pathname !== path)
      window.history.pushState(null, '', path);
  }
  function navigatePane(
    next:
      | 'pipeline'
      | 'history'
      | 'crafts'
      | 'profile'
      | 'resumes'
      | 'observer'
      | 'memory'
      | 'research'
      | 'editorial'
      | 'growth'
      | 'settings'
  ) {
    if (
      next !== pane &&
      typeof document !== 'undefined' &&
      document.querySelector('[data-career-dirty="true"]') &&
      !window.confirm('Discard unsaved career edits?')
    )
      return;
    setPane(next);
    navigate(
      next === 'pipeline' ? '/dashboard/pipeline' : '/dashboard/' + next
    );
  }
  function navigateSubpage(path: string) {
    if (
      typeof document !== 'undefined' &&
      document.querySelector('[data-career-dirty="true"]') &&
      !window.confirm('Discard unsaved career edits?')
    )
      return;
    setPane(path.startsWith('/dashboard/resumes') ? 'resumes' : 'profile');
    navigate(path);
  }
  function navigateCraft(id: string | null, slug?: string) {
    setPane('growth');
    setSelectedCraftId(id);
    if (id && slug) setSelectedCraftSlug(slug);
    if (!id) setSelectedCraftSlug(null);
    const target = id
      ? '/dashboard/growth/' + encodeURIComponent(id)
      : '/dashboard/growth';
    navigate(id && pathname === target + '/source' ? pathname : target);
  }
  function navigateCraftView(next: 'visual' | 'source') {
    if (!selectedCraftId) return;
    navigate(
      '/dashboard/growth/' +
        encodeURIComponent(selectedCraftId) +
        (next === 'source' ? '/source' : '')
    );
  }

  return {
    pathname,
    pane,
    setPane,
    mobileMenu,
    setMobileMenu,
    selectedCraftId,
    selectedCraftSlug,
    libraryView,
    navigate,
    navigatePane,
    navigateSubpage,
    navigateCraft,
    navigateCraftView,
  };
}
