import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import Navbar from '@/components/navbar';
import Footer from '@/components/footer';
const inter = Inter({
  variable: '--font-sans',
  subsets: ['latin'],
  display: 'swap',
});
const mono = JetBrains_Mono({
  variable: '--font-mono',
  subsets: ['latin'],
  display: 'swap',
});
export const viewport: Viewport = {
  themeColor: '#f8fafc',
  width: 'device-width',
  initialScale: 1,
};
export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  ),
  title: {
    default: 'Utomator | Browser automation with human control',
    template: '%s | Utomator',
  },
  description:
    'Local-first browser workflows for LinkedIn and X. Inspect, explicitly approve, and verify account changes with evidence.',
  applicationName: 'Utomator',
  robots: { index: false, follow: false },
  icons: { icon: '/icon.svg' },
  openGraph: {
    title: 'Utomator',
    description:
      'Local-first, approval-driven browser automation for your accounts.',
    type: 'website',
  },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        className={
          inter.variable +
          ' ' +
          mono.variable +
          ' noise flex min-h-dvh flex-col font-sans'
        }
      >
        <Navbar />
        <div className="flex w-full flex-1 flex-col">{children}</div>
        <Footer />
      </body>
    </html>
  );
}
