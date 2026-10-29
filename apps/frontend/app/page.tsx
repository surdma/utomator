import PageTransition from '@/components/page-transistion';
import HeroText from '@/components/home/hero-text';
import HeroButton from '@/components/home/hero-button';

export default function Home() {
  return (
    <main className="relative flex w-full flex-1 flex-col">
      <PageTransition />

      {/* ── Hero ────────────────────────────────────────── */}
      <section className="relative flex w-full grow items-center overflow-x-clip py-6 sm:py-8 md:py-10 lg:py-6">
        {/* Background radial */}
        <div
          className="pointer-events-none absolute top-1/4 -left-32 h-[600px] w-[600px]"
          style={{
            background:
              'radial-gradient(circle, rgba(6,182,212,0.08) 0%, transparent 70%)',
          }}
        />
        <div
          className="pointer-events-none absolute right-0 bottom-0 h-[600px] w-[600px]"
          style={{
            background:
              'radial-gradient(circle, rgba(139,92,246,0.06) 0%, transparent 70%)',
          }}
        />

        <div className="mx-auto w-full max-w-7xl px-6 md:px-8">
          <div className="grid grid-cols-1 items-center gap-8 md:grid-cols-5 md:gap-6 lg:gap-12">
            {/* Text: 3 of 5 columns */}
            <div className="flex flex-col gap-5 md:col-span-3 md:gap-6 lg:gap-8">
              <HeroText />
              <HeroButton />
            </div>

            {/* Image: 2 of 5 columns */}
            <div className="hidden justify-center md:col-span-2 md:flex md:justify-end">
              <div
                className="relative mx-auto w-full max-w-sm overflow-hidden rounded-3xl border border-cyan-500/20 bg-slate-950 p-6 text-slate-50 shadow-2xl shadow-cyan-900/20"
                aria-label="Utomator automation workflow preview"
              >
                <div className="mb-8 flex items-center justify-between gap-4">
                  <span className="font-mono text-sm tracking-widest text-cyan-300">
                    UTOMATOR
                  </span>
                  <span className="rounded-full border border-emerald-400/30 px-3 py-1 text-xs text-emerald-300">
                    Local first
                  </span>
                </div>
                <div className="space-y-3">
                  <div className="rounded-2xl border border-slate-700 bg-slate-900 p-4">
                    <div className="text-xs tracking-wide text-slate-400 uppercase">
                      01 · Inspect
                    </div>
                    <div className="mt-2 font-semibold">
                      Review the account and page
                    </div>
                  </div>
                  <div className="ml-6 h-6 w-px bg-cyan-500/50" />
                  <div className="rounded-2xl border border-cyan-500/50 bg-slate-900 p-4">
                    <div className="text-xs tracking-wide text-cyan-300 uppercase">
                      02 · Approve
                    </div>
                    <div className="mt-2 font-semibold">
                      Confirm each proposed change
                    </div>
                  </div>
                  <div className="ml-6 h-6 w-px bg-cyan-500/50" />
                  <div className="rounded-2xl border border-slate-700 bg-slate-900 p-4">
                    <div className="text-xs tracking-wide text-slate-400 uppercase">
                      03 · Verify
                    </div>
                    <div className="mt-2 font-semibold">
                      Recheck the live result and evidence
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
