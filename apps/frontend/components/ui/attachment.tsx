import { cn } from '@/lib/utils';

type AttachmentState = 'idle' | 'uploading' | 'processing' | 'error' | 'done';

const stateStyles: Record<AttachmentState, string> = {
  idle: 'border-slate-200',
  uploading: 'border-slate-300',
  processing: 'border-slate-300',
  error: 'border-rose-200 bg-rose-50/60',
  done: 'border-slate-200',
};

export function Attachment({
  state = 'done',
  size = 'default',
  orientation = 'horizontal',
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  state?: AttachmentState;
  size?: 'default' | 'sm' | 'xs';
  orientation?: 'horizontal' | 'vertical';
}) {
  return (
    <div
      data-slot="attachment"
      data-state={state}
      className={cn(
        'relative overflow-hidden rounded-xl border bg-white text-slate-700',
        orientation === 'vertical'
          ? 'flex flex-col'
          : 'flex items-center gap-3',
        size === 'sm'
          ? 'p-1.5 pr-2.5'
          : size === 'xs'
            ? 'gap-2 rounded-lg p-1 pr-2'
            : 'p-2 pr-3',
        stateStyles[state],
        className
      )}
      {...props}
    />
  );
}

export function AttachmentMedia({
  variant = 'icon',
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { variant?: 'icon' | 'image' }) {
  return (
    <div
      data-slot="attachment-media"
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-50 text-slate-500',
        variant === 'image'
          ? 'size-11 ring-1 ring-slate-200 ring-inset [&_img]:size-full [&_img]:object-cover'
          : 'size-8 [&_svg]:size-4',
        className
      )}
      {...props}
    />
  );
}

export function AttachmentContent({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="attachment-content"
      className={cn('min-w-0 flex-1', className)}
      {...props}
    />
  );
}

export function AttachmentTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      data-slot="attachment-title"
      className={cn('truncate text-xs font-semibold text-slate-800', className)}
      {...props}
    />
  );
}

export function AttachmentDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      data-slot="attachment-description"
      className={cn('truncate text-[11px] text-slate-500', className)}
      {...props}
    />
  );
}

export function AttachmentActions({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="attachment-actions"
      className={cn('flex shrink-0 items-center gap-1', className)}
      {...props}
    />
  );
}

export function AttachmentAction({
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      data-slot="attachment-action"
      type="button"
      className={cn(
        'inline-flex size-7 cursor-pointer items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700',
        className
      )}
      {...props}
    />
  );
}

export function AttachmentGroup({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="attachment-group"
      className={cn(
        'mator-snap-x flex gap-2 overflow-x-auto pb-0.5',
        className
      )}
      {...props}
    />
  );
}
