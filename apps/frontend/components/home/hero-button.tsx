import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';

const focus =
  'focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-[3px] focus-visible:outline-[#1A211C]';

export default function HeroButton() {
  return (
    <div className="mt-8 flex flex-wrap items-center gap-3">
      <Link
        href="/dashboard/workspace"
        className={`inline-flex min-h-11 cursor-pointer touch-manipulation items-center gap-2 bg-[#1A211C] px-5 text-sm font-semibold transition-colors duration-200 ease-out hover:bg-[#24302A] active:scale-[0.98] motion-reduce:transform-none ${focus}`}
        style={{ color: '#F4EFE4' }}
      >
        Open workspace
        <ArrowUpRight aria-hidden="true" className="size-4" />
      </Link>
      <Link
        href="/dashboard/growth"
        className={`inline-flex min-h-11 cursor-pointer touch-manipulation items-center px-3 text-sm font-semibold text-[#1A211C] underline-offset-4 hover:underline ${focus}`}
      >
        Growth
      </Link>
    </div>
  );
}
