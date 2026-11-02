'use client';

export default function CareerStudioNav({
  pathname,
  detail,
  go,
}: {
  pathname: string;
  detail: { label: string } | null | undefined;
  go: (path: string) => void;
}) {
  return (
    <nav
      aria-label="Résumé studio navigation"
      className="flex flex-wrap gap-2 border-b border-slate-200 pb-4"
    >
      {[
        ['Library', '/dashboard/resumes'],
        ['Career source', '/dashboard/resumes/profile'],
        ['Templates', '/dashboard/resumes/templates'],
      ].map(([name, path]) => (
        <button
          key={path}
          type="button"
          onClick={() => go(path)}
          className={
            'rounded-xl px-4 py-3 text-sm font-semibold ' +
            (pathname === path
              ? 'bg-teal-700 text-white'
              : 'bg-white text-slate-700 hover:bg-slate-100')
          }
        >
          {name}
        </button>
      ))}
      {detail && (
        <span className="self-center px-3 text-xs text-slate-500">
          / {detail.label}
        </span>
      )}
    </nav>
  );
}
