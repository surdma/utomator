import PageTransition from "@/components/page-transistion";
import HeroText from "@/components/home/hero-text";
import ProductVisual from "@/components/home/product-visual";
import HeroButton from "@/components/home/hero-button";

export default function Home() {
  return (
    <main className="relative flex w-full flex-1 flex-col">
      <PageTransition />

      {/* ── Hero ────────────────────────────────────────── */}
      <section className="relative flex w-full grow items-center overflow-x-clip py-6 sm:py-8 md:py-10 lg:py-6">
        {/* Background radial */}
        <div
          className="absolute top-1/4 -left-32 w-[600px] h-[600px] pointer-events-none"
          style={{
            background:
              "radial-gradient(circle, rgba(6,182,212,0.08) 0%, transparent 70%)",
          }}
        />
        <div
          className="absolute bottom-0 right-0 w-[600px] h-[600px] pointer-events-none"
          style={{
            background:
              "radial-gradient(circle, rgba(139,92,246,0.06) 0%, transparent 70%)",
          }}
        />

        <div className="max-w-7xl mx-auto px-6 md:px-8 w-full">
          <div className="grid grid-cols-1 items-center gap-8 md:grid-cols-5 md:gap-6 lg:gap-12">
            {/* Text: 3 of 5 columns */}
            <div className="flex flex-col gap-5 md:col-span-3 md:gap-6 lg:gap-8">
              <HeroText />
              <HeroButton />
            </div>

            {/* Product visual: 2 of 5 columns */}
            <div className="hidden md:flex justify-center md:col-span-2 md:justify-end">
              <ProductVisual />
            </div>
          </div>
        </div>
      </section>

    </main>
  );
}
