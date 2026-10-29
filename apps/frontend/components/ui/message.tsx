import type { HTMLAttributes } from "react";

type Props = HTMLAttributes<HTMLDivElement>;
export function Message({
  className = "",
  ...props
}: Props & { align?: "start" | "end" }) {
  const { align = "start", ...rest } = props;
  return (
    <div
      data-slot="message"
      className={`flex w-full items-end gap-3 ${align === "end" ? "flex-row-reverse" : ""} ${className}`}
      {...rest}
    />
  );
}
export function MessageAvatar({ className = "", ...props }: Props) {
  return (
    <div
      data-slot="message-avatar"
      className={`flex size-8 shrink-0 items-center justify-center rounded-xl bg-slate-800 text-white text-xs font-semibold ${className}`}
      {...props}
    />
  );
}
export function MessageContent({ className = "", ...props }: Props) {
  return (
    <div
      data-slot="message-content"
      className={`min-w-0 max-w-[min(100%,42rem)] flex-1 ${className}`}
      {...props}
    />
  );
}
export function MessageHeader({ className = "", ...props }: Props) {
  return (
    <div
      className={`mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500 ${className}`}
      {...props}
    />
  );
}
export function MessageFooter({ className = "", ...props }: Props) {
  return (
    <div
      className={`mt-1 text-[11px] text-slate-500 ${className}`}
      {...props}
    />
  );
}
