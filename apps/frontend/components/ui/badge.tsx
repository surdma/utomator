import { cn } from '@/lib/utils';

type Tone = 'default' | 'outline' | 'teal' | 'orange' | 'rose' | 'amber';

const tones: Record<Tone, string> = {
  default: 'bg-slate-100 text-slate-700',
  outline: 'border border-slate-200 bg-white/60 text-slate-600',
  teal: 'bg-teal-50 text-teal-800 border border-teal-200/70',
  orange: 'bg-orange-50 text-orange-800 border border-orange-200/70',
  rose: 'bg-rose-50 text-rose-700 border border-rose-200/70',
  amber: 'bg-amber-50 text-amber-800 border border-amber-200/70',
};

export function Badge({
  tone = 'default',
  size = 'sm',
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & {
  tone?: Tone;
  size?: 'sm' | 'xs';
}) {
  return (
    <span
      data-slot="badge"
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full font-semibold whitespace-nowrap',
        size === 'xs' ? 'px-1.5 py-0 text-[10px]' : 'px-2 py-0.5 text-[11px]',
        tones[tone],
        className
      )}
      {...props}
    />
  );
}
