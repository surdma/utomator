'use client';

import Link from 'next/link';
import { Activity, ExternalLink, Menu, RotateCcw } from 'lucide-react';
import { AppMark } from '@/components/logo';
import { Button } from '@/components/ui/automate-card';

type Props = {
  available: 'checking' | 'ready' | 'offline';
  mobileMenu: boolean;
  onToggleNavigation: () => void;
  onOpenTracking: () => void;
  onRefresh: () => void;
};

export default function DashboardHeader({
  available,
  mobileMenu,
  onToggleNavigation,
  onOpenTracking,
  onRefresh,
}: Props) {
  return (
    <div className="shrink-0 border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-[1760px] items-center justify-between gap-3 px-4 py-3 md:px-6">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            className="lg:hidden"
            type="button"
            aria-label="Toggle navigation"
            aria-expanded={mobileMenu}
            onClick={onToggleNavigation}
          >
            <Menu className="size-5" />
          </Button>
          <AppMark className="size-10" />
          <div>
            <p className="text-sm leading-tight font-extrabold tracking-[-.02em]">
              Utomator{' '}
              <span className="font-medium text-slate-400">/ Studio</span>
            </p>
            <p className="text-[11px] text-slate-500">
              Local automation, evidence first
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={
              'hidden items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold sm:inline-flex ' +
              (available === 'ready'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-amber-200 bg-amber-50 text-amber-800')
            }
          >
            <span
              className={
                'size-2 rounded-full ' +
                (available === 'ready' ? 'bg-emerald-500' : 'bg-amber-500')
              }
            />
            {available === 'ready'
              ? 'Engine connected'
              : available === 'checking'
                ? 'Connecting'
                : 'Engine offline'}
          </span>

          <Button
            variant="ghost"
            size="sm"
            type="button"
            aria-label="Open run tracking"
            onClick={onOpenTracking}
          >
            <Activity className="size-4" />
            <span className="hidden sm:inline">Tracking</span>
          </Button>
          <Button variant="ghost" size="sm" onClick={onRefresh}>
            <RotateCcw className="size-4" />{' '}
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          <Link
            href="/"
            className="inline-flex min-h-10 items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-950"
          >
            Portfolio <ExternalLink className="size-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
