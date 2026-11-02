'use client';

export default function EditorialStudioHeader() {
  return (
    <header className="rounded-3xl bg-[#111e2b] px-6 py-7 text-white">
      <p className="text-xs font-bold tracking-widest text-teal-300 uppercase">
        LinkedIn / Editorial workflow
      </p>
      <h1 className="mt-3 font-serif text-3xl">Draft, review and refine.</h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
        Prepare posts for your own account, cite research evidence, maintain
        revision history, approve content and archive old drafts. This is
        private draft management, not LinkedIn publishing.
      </p>
    </header>
  );
}
