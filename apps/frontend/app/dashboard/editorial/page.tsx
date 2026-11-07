import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import DashboardShell from '@/modules/shell';

export const metadata: Metadata = {
  title: 'Editorial drafts | Utomator',
  robots: { index: false, follow: false },
};

export default async function Page() {
  const host = (await headers()).get('host') || '';
  if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host)) notFound();
  return <DashboardShell initialPane="editorial" />;
}
