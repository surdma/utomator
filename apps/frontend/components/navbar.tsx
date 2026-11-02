'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import Logo from '@/components/logo';
const links = [
  { title: 'Workspace', href: '/dashboard/workspace' },
  { title: 'Growth', href: '/dashboard/growth' },
  { title: 'Crafts', href: '/dashboard/crafts' },
];
export default function Navbar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  if (pathname !== '/') return null;
  return (
    <header
      className="relative z-30 border-b"
      style={{ borderColor: 'var(--border)' }}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6 md:h-20 md:px-8">
        <Logo />
        <nav
          aria-label="Product navigation"
          className="hidden items-center gap-7 md:flex"
        >
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm font-medium transition-colors hover:text-cyan-600"
              style={{ color: 'var(--text-secondary)' }}
            >
              {link.title}
            </Link>
          ))}
        </nav>
        <button
          type="button"
          className="rounded-lg border px-3 py-2 text-sm md:hidden"
          aria-expanded={open}
          aria-controls="mobile-product-nav"
          onClick={() => setOpen(!open)}
        >
          Menu
        </button>
      </div>
      {open && (
        <nav
          id="mobile-product-nav"
          aria-label="Mobile product navigation"
          className="flex flex-col gap-4 border-t px-6 py-5 md:hidden"
          style={{ borderColor: 'var(--border)' }}
        >
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="text-sm font-medium"
            >
              {link.title}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
