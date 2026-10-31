import { cn } from '@/lib/utils';

export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="skeleton"
      className={cn('mator-shimmer bg-slate-200/70', className)}
      {...props}
    />
  );
}

/** Standard transcript loading rhythm. */
export function ThreadSkeleton() {
  return (
    <div
      className="flex flex-col gap-5 px-4 py-5"
      role="status"
      aria-label="Loading conversation"
    >
      <div className="flex items-end gap-3">
        <Skeleton className="size-8 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-16 w-3/4 rounded-2xl" />
        </div>
      </div>
      <div className="flex justify-end">
        <Skeleton className="h-12 w-2/3 rounded-2xl" />
      </div>
      <div className="flex items-end gap-3">
        <Skeleton className="size-8 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-10 w-4/5 rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
