import { cn } from '@/lib/utils';

type Props = React.HTMLAttributes<HTMLDivElement> & {
  align?: 'start' | 'end';
};

export function Message({ className = '', align = 'start', ...props }: Props) {
  return (
    <div
      data-slot="message"
      className={cn(
        'flex w-full items-end gap-2.5',
        align === 'end' && 'flex-row-reverse',
        className
      )}
      {...props}
    />
  );
}

export function MessageGroup({ className = '', ...props }: Props) {
  return (
    <div
      data-slot="message-group"
      className={cn('flex flex-col gap-4', className)}
      {...props}
    />
  );
}

export function MessageAvatar({ className = '', ...props }: Props) {
  return (
    <div
      data-slot="message-avatar"
      className={cn(
        'flex size-8 shrink-0 items-center justify-center rounded-full bg-slate-800 text-xs font-semibold text-white',
        className
      )}
      {...props}
    />
  );
}

export function MessageContent({ className = '', ...props }: Props) {
  return (
    <div
      data-slot="message-content"
      className={cn('max-w-[min(100%,42rem)] min-w-0 flex-1', className)}
      {...props}
    />
  );
}

export function MessageHeader({ className = '', ...props }: Props) {
  return (
    <div
      className={cn(
        'mb-1 text-[11px] font-semibold tracking-wider text-slate-500 uppercase',
        className
      )}
      {...props}
    />
  );
}

export function MessageFooter({ className = '', ...props }: Props) {
  return (
    <div
      className={cn('mt-1 text-[11px] text-slate-500', className)}
      {...props}
    />
  );
}
