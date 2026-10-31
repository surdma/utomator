'use client';

import {
  Activity,
  Compass,
  Crosshair,
  FileText,
  History,
  NotebookPen,
  UserRound,
  X,
} from 'lucide-react';
import type { DashboardPane } from './use-dashboard-navigation';

type Props = {
  pane: DashboardPane;
  mobileMenu: boolean;
  onClose: () => void;
  onNavigate: (pane: DashboardPane) => void;
};

export default function DashboardSidebar({
  pane,
  mobileMenu,
  onClose,
  onNavigate,
}: Props) {
  return (
    <aside
      data-testid="automation-navigation-sidebar"
      className={
        (mobileMenu
          ? 'fixed inset-y-0 left-0 z-50 block w-[min(85vw,290px)] p-3'
          : 'hidden') +
        ' min-w-0 lg:static lg:block lg:h-full lg:w-auto lg:overflow-hidden lg:p-0'
      }
    >
      <div className="h-full rounded-2xl bg-[#111a25] p-4 text-white shadow-xl shadow-slate-900/10 lg:overflow-hidden">
        <button
          type="button"
          aria-label="Close navigation"
          onClick={onClose}
          className="mb-3 flex min-h-10 w-full items-center justify-end gap-2 rounded-lg px-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 lg:hidden"
        >
          <X className="size-4" />
          Close
        </button>

        {(
          [
            { id: 'pipeline', label: 'Pipeline', icon: Activity },
            { id: 'history', label: 'Run history', icon: History },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onNavigate(item.id)}
            className={
              'flex min-h-10 w-full items-center gap-2.5 rounded-xl px-3 text-left text-xs font-semibold transition ' +
              (pane === item.id
                ? 'bg-teal-500/15 text-teal-200'
                : 'text-slate-300 hover:bg-slate-800')
            }
          >
            <item.icon className="size-4" />
            {item.label}
          </button>
        ))}
        {(
          [
            { id: 'profile', label: 'Account', icon: UserRound },
            { id: 'resumes', label: 'Résumés', icon: FileText },
            { id: 'memory', label: 'Intelligence', icon: NotebookPen },
            { id: 'research', label: 'Creator research', icon: Crosshair },
            { id: 'editorial', label: 'Editorial drafts', icon: FileText },
            { id: 'growth', label: 'Growth', icon: Compass },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onNavigate(item.id)}
            aria-current={
              (item.id === 'profile'
                ? pane === 'profile' || pane === 'settings'
                : pane === item.id)
                ? 'page'
                : undefined
            }
            className={
              'flex min-h-10 w-full items-center gap-2.5 rounded-xl px-3 text-left text-xs font-semibold transition ' +
              ((item.id === 'profile'
                ? pane === 'profile' || pane === 'settings'
                : pane === item.id)
                ? 'bg-teal-500/15 text-teal-200'
                : 'text-slate-300 hover:bg-slate-800')
            }
          >
            <item.icon className="size-4" />
            {item.label}
          </button>
        ))}
      </div>
    </aside>
  );
}
