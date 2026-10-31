'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { getDashboardRoute, type DashboardPane } from './dashboard-route';

export type { DashboardPane } from './dashboard-route';

export function useDashboardNavigation(initialPane: DashboardPane) {
  const pathname = usePathname();
  const route = getDashboardRoute(pathname);
  const [requestedPane, setPane] = useState<DashboardPane>(initialPane);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [rememberedCraftId, setSelectedCraftId] = useState<string | null>(
    () => getDashboardRoute(pathname).craftId ?? null
  );
  const [selectedCraftSlug, setSelectedCraftSlug] = useState<string | null>(
    null
  );

  const pane = route.pane ?? requestedPane;
  const selectedCraftId =
    route.craftId === undefined ? rememberedCraftId : route.craftId;
  const { libraryView } = route;

  function navigate(path: string) {
    if (typeof window !== 'undefined' && window.location.pathname !== path)
      window.history.pushState(null, '', path);
  }
  function navigatePane(next: DashboardPane) {
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
    setPane(
      path.startsWith('/dashboard/resumes')
        ? 'resumes'
        : path.startsWith('/dashboard/settings')
          ? 'settings'
          : 'profile'
    );
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
