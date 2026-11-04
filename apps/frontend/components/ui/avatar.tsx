import Image from 'next/image';
import { cn } from '@/lib/utils';

export function Avatar({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="avatar"
      className={cn(
        'flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full select-none',
        className,
      )}
      {...props}
    />
  );
}

export function AvatarImage({
  alt,
  className,
  ...props
}: React.ComponentProps<typeof Image>) {
  return (
    <Image
      data-slot="avatar-image"
      alt={alt}
      unoptimized
      width={64}
      height={64}
      className={cn('size-full object-cover', className)}
      {...props}
    />
  );
}

export function AvatarFallback({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      data-slot="avatar-fallback"
      className={cn(
        'flex size-full items-center justify-center text-[11px] font-bold',
        className,
      )}
      {...props}
    />
  );
}
