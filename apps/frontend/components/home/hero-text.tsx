export default function HeroText({
  displayClassName,
}: {
  displayClassName: string;
}) {
  return (
    <div className="flex max-w-xl flex-col gap-5">
      <p className="font-mono text-xs tracking-[0.2em] text-[#3D4942] uppercase">
        On this machine
      </p>
      <h1
        className={`${displayClassName} text-[2.55rem] leading-[0.92] font-semibold tracking-[-0.045em] text-balance text-[#1A211C] sm:text-6xl lg:text-[4.15rem]`}
      >
        Utomator holds the run.
      </h1>
      <p className="max-w-[34ch] text-base leading-relaxed text-[#3D4942] sm:text-lg">
        Inspect the page. Approve the change. Keep the evidence.
      </p>
    </div>
  );
}
