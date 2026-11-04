import HeroButton from '@/components/home/hero-button';
import HeroText from '@/components/home/hero-text';
import PageTransition from '@/components/page-transistion';

const steps = [
  {
    index: '01',
    title: 'Inspect',
    body: 'Review the account and page',
    active: false,
  },
  {
    index: '02',
    title: 'Approve',
    body: 'Confirm each proposed change',
    active: true,
  },
  {
    index: '03',
    title: 'Verify',
    body: 'Recheck the live result and evidence',
    active: false,
  },
] as const;

export default function Home() {
  return (
    <main className="relative flex w-full flex-1 flex-col bg-[#f5f7f8]">
      <PageTransition />

      <section className="relative flex w-full grow items-center overflow-x-clip py-6 sm:py-8 md:py-10 lg:py-6">
        <div
          className="pointer-events-none absolute top-1/4 -left-32 h-[600px] w-[600px]"
          style={{
            background:
              'radial-gradient(circle, rgba(34,211,238,0.16) 0%, transparent 70%)',
          }}
        />
        <div
          className="pointer-events-none absolute right-0 bottom-0 h-[600px] w-[600px]"
          style={{
            background:
              'radial-gradient(circle, rgba(15,118,110,0.1) 0%, transparent 70%)',
          }}
        />

        <div className="mx-auto w-full max-w-7xl px-6 md:px-8">
          <div className="grid grid-cols-1 items-center gap-8 md:grid-cols-5 md:gap-6 lg:gap-12">
            <div className="flex flex-col gap-5 md:col-span-3 md:gap-6 lg:gap-8">
              <HeroText />
              <HeroButton />
            </div>

            <div className="hidden justify-center md:col-span-2 md:flex md:justify-end">
              <div
                className="relative mx-auto w-full max-w-sm overflow-hidden rounded-3xl border border-cyan-400/20 bg-[#111a25] p-6 text-slate-50 shadow-2xl shadow-slate-900/20"
                aria-label="Utomator automation workflow preview"
              >
                <div className="mb-8 flex items-center justify-between gap-4">
                  <span className="font-mono text-sm tracking-widest text-cyan-300">
                    UTOMATOR
                  </span>
                  <span className="rounded-full border border-teal-300/30 px-3 py-1 text-xs text-teal-200">
                    Local first
                  </span>
                </div>
                <div className="space-y-3">
                  {steps.map((step, index) => (
                    <div key={step.index}>
                      {index > 0 ? (
                        <div className="ml-6 h-6 w-px bg-cyan-400/50" />
                      ) : null}
                      <div
                        className={
                          'rounded-2xl border bg-slate-900 p-4 ' +
                          (step.active
                            ? 'border-cyan-400/50'
                            : 'border-slate-700')
                        }
                      >
                        <div
                          className={
                            'text-xs tracking-wide uppercase ' +
                            (step.active ? 'text-cyan-300' : 'text-slate-400')
                          }
                        >
                          {step.index} · {step.title}
                        </div>
                        <div className="mt-2 font-semibold">{step.body}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
