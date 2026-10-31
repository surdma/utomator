'use client';

import { cn } from '@/lib/utils';
import { MessageScroller as HeadlessMessageScroller } from '@shadcn/react/message-scroller';

/**
 * Styled parts over the @shadcn/react message-scroller engine:
 * turn anchoring, follow-output auto-scroll, preserve-on-prepend,
 * last-anchor opening position, and the log/region accessibility contract.
 */

export function MessageScrollerProvider(
  props: Omit<
    React.ComponentProps<typeof HeadlessMessageScroller.Provider>,
    'autoScroll'
  > & { autoScroll?: boolean }
) {
  return <HeadlessMessageScroller.Provider {...props} />;
}

export function MessageScroller({
  className,
  ...props
}: React.ComponentProps<typeof HeadlessMessageScroller.Root>) {
  return (
    <HeadlessMessageScroller.Root
      className={cn('relative flex min-h-0 flex-1 flex-col', className)}
      {...props}
    />
  );
}

export function MessageScrollerViewport({
  className,
  ...props
}: React.ComponentProps<typeof HeadlessMessageScroller.Viewport>) {
  return (
    <HeadlessMessageScroller.Viewport
      aria-label={props['aria-label'] ?? 'Messages'}
      className={cn(
        'min-h-0 flex-1 overflow-y-auto overscroll-contain',
        className
      )}
      {...props}
    />
  );
}

export function MessageScrollerContent({
  className,
  ...props
}: React.ComponentProps<typeof HeadlessMessageScroller.Content>) {
  return (
    <HeadlessMessageScroller.Content
      className={cn('flex flex-col gap-5 px-4 py-3', className)}
      {...props}
    />
  );
}

export function MessageScrollerItem({
  className,
  ...props
}: React.ComponentProps<typeof HeadlessMessageScroller.Item>) {
  return (
    <HeadlessMessageScroller.Item
      className={cn('min-w-0', className)}
      {...props}
    />
  );
}

/**
 * Jump-to-latest / jump-to-start control. Inert while there is
 * nothing to scroll toward (data-active=false).
 */
export function MessageScrollerButton({
  className,
  ...props
}: React.ComponentProps<typeof HeadlessMessageScroller.Button>) {
  return (
    <HeadlessMessageScroller.Button
      className={cn(
        'absolute right-4 bottom-3 z-10 inline-flex h-8 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 text-[11px] font-bold text-teal-800 shadow-md transition-opacity hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 data-[active=false]:hidden',
        className
      )}
      aria-label="Jump to latest message"
      {...props}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" className="size-3.5">
        <path
          d="M12 5v14m0 0l-5-5m5 5l5-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      Latest
    </HeadlessMessageScroller.Button>
  );
}
