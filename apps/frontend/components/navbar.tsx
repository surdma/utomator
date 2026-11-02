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

const item =
  'inline-flex min-h-11 cursor-pointer touch-manipulation items-center text-sm font-medium text-[#3D4942] transition-colors duration-200 hover:text-[#1A211C] focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-[3px] focus-visible:outline-[#1A211C]';

export default function Navbar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  if (pathname !== '/') return null;
  return (
    <header className="relative z-30 border-b border-[#1A211C]/15">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6 md:h-20 md:px-8">
        <Logo />
        <nav
          aria-label="Product navigation"
          className="hidden items-center gap-6 md:flex"
        >
          {links.map((link) => (
            <Link key={link.href} href={link.href} className={item}>
              {link.title}
            </Link>
          ))}
        </nav>
        <button
          type="button"
          className="inline-flex min-h-11 min-w-11 cursor-pointer touch-manipulation items-center justify-center border border-[#1A211C]/20 px-3 text-sm font-medium text-[#1A211C] focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-[3px] focus-visible:outline-[#1A211C] md:hidden"
          aria-expanded={open}
          aria-controls="mobile-product-nav"
          onClick={() => setOpen(!open)}
        >
          {open ? 'Close' : 'Menu'}
        </button>
      </div>
      {open && (
        <nav
          id="mobile-product-nav"
          aria-label="Mobile product navigation"
          className="flex flex-col gap-1 border-t border-[#1A211C]/15 px-6 py-3 md:hidden"
        >
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className={item}
            >
              {link.title}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
