'use client';

export default function CareerStudioHeader({
  sourceView,
  galleryView,
  detail,
}: {
  sourceView: boolean;
  galleryView: boolean;
  detail: { label: string } | null | undefined;
}) {
  return (
    <header className="flex flex-col gap-2">
      <p className="text-xs font-bold tracking-widest text-teal-700 uppercase">
        Résumé studio
      </p>
      <h1 className="font-serif text-3xl tracking-tight text-slate-900">
        {sourceView
          ? 'Career source'
          : galleryView
            ? 'Document templates'
            : detail
              ? 'Edit your résumé'
              : 'Your résumé library'}
      </h1>
      <p className="max-w-2xl text-sm leading-6 text-slate-600">
        {sourceView
          ? 'Career information you enter and review is used to start new résumés.'
          : galleryView
            ? 'Compare document styles for different job applications.'
            : detail
              ? 'Edit individual sections without a crowded form.'
              : 'Manage separate résumé versions for different roles and companies.'}
      </p>
    </header>
  );
}
