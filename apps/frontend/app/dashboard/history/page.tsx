import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import DashboardShell from '@/components/dashboard/dashboard-shell';

export const metadata: Metadata = {
  title: 'Run history | Utomator',
  robots: { index: false, follow: false },
};

export default async function RunHistoryPage() {
  const host = (await headers()).get('host') || '';
  if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host)) notFound();
  return <DashboardShell initialPane="history" />;
}
