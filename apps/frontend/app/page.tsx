import { Bricolage_Grotesque } from 'next/font/google';
import HeroText from '@/components/home/hero-text';
import HeroButton from '@/components/home/hero-button';
import DispatchStage from '@/components/home/dispatch-stage';

const display = Bricolage_Grotesque({
  subsets: ['latin'],
  weight: '600',
  display: 'swap',
});

export default function Home() {
  return (
    <main className="relative flex w-full flex-1 flex-col overflow-x-clip">
      <style>{`
        body {
          --bg: #d5d0c4;
          --bg-secondary: #cbc6b8;
          --bg-card: #e7e1d4;
          --text-primary: #1a211c;
          --text-secondary: #3d4942;
          --text-muted: #3d4942;
          --border: rgba(26, 33, 28, 0.16);
          --border-hover: rgba(26, 33, 28, 0.32);
          background: #d5d0c4;
          color: #1a211c;
        }
        body ::selection {
          background: #e07a2f;
          color: #1a211c;
        }
      `}</style>
      <section
        aria-label="Utomator automation workflow preview"
        className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-12 px-6 py-10 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] md:gap-14 md:px-8 md:py-14 lg:py-16"
      >
        <div>
          <HeroText displayClassName={display.className} />
          <HeroButton />
        </div>
        <DispatchStage />
      </section>
    </main>
  );
}
