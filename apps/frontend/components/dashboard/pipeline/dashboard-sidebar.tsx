'use client';

import {
  Activity,
  Compass,
  Crosshair,
  FileText,
  NotebookPen,
} from 'lucide-react';
import type { DashboardPane } from './use-dashboard-navigation';

type Props = {
  pane: DashboardPane;
  onNavigate: (pane: DashboardPane) => void;
};

/** Desktop rail. Run history and account live in the app bar's account menu. */
export default function DashboardSidebar({ pane, onNavigate }: Props) {
  const topItems = [
    { id: 'workspace', label: 'Workspace', icon: Activity },
  ] as const;
  const items = [
    { id: 'resumes', label: 'Résumés', icon: FileText },
    { id: 'memory', label: 'Intelligence', icon: NotebookPen },
    { id: 'research', label: 'Creator research', icon: Crosshair },
    { id: 'editorial', label: 'Editorial drafts', icon: FileText },
    { id: 'growth', label: 'Growth', icon: Compass },
  ] as const;

  return (
    <aside
      data-testid="automation-navigation-sidebar"
      className="hidden min-w-0 lg:flex lg:h-full lg:w-auto lg:overflow-hidden"
    >
      <div className="h-full w-full rounded-2xl bg-[#111a25] p-4 text-white shadow-xl shadow-slate-900/10 lg:overflow-hidden">
        {topItems.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onNavigate(item.id)}
            aria-current={pane === item.id ? 'page' : undefined}
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
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onNavigate(item.id)}
            aria-current={pane === item.id ? 'page' : undefined}
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
      </div>
    </aside>
  );
}
