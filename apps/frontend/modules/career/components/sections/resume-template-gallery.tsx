'use client';

export default function ResumeTemplateGallery({
  templateOptions,
}: {
  templateOptions: ReadonlyArray<{
    id: string;
    name: string;
    description: string;
  }>;
}) {
  return (
    <section className="grid gap-5 md:grid-cols-2">
      {templateOptions.map((t) => (
        <article
          key={t.id}
          className="rounded-3xl border border-slate-200 bg-white p-7"
        >
          <div className={`career-template-tile career-template-tile--${t.id}`}>
            <span />
            <span />
            <span />
            <span />
          </div>
          <h2 className="mt-5 font-serif text-xl">{t.name}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {t.description}
          </p>
          <p className="mt-4 text-xs text-slate-500">
            Select this template in any individual résumé editor.
          </p>
        </article>
      ))}
    </section>
  );
}
