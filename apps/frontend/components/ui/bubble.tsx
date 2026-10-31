import { cn } from '@/lib/utils';

type Props = React.HTMLAttributes<HTMLDivElement> & {
  variant?: 'default' | 'outline' | 'muted';
  align?: 'start' | 'end';
};

export function Bubble({ className = '', variant, align, ...props }: Props) {
  const variantClasses = {
    default: 'border-slate-200 bg-white text-slate-700',
    muted: 'border-slate-800 bg-slate-900 text-white',
    outline: 'border-slate-300 bg-transparent text-slate-700 shadow-none',
  } as const;
  return (
    <div
      data-slot="bubble"
      className={cn(
        'rounded-2xl border px-4 py-3 text-[13px] leading-relaxed shadow-sm',
        variant ? variantClasses[variant] : variantClasses.default,
        align === 'end' && 'text-right',
        className
      )}
      {...props}
    />
  );
}

export function BubbleContent({
  className = '',
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="bubble-content" className={className} {...props} />;
}
