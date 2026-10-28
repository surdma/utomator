import type { HTMLAttributes } from "react";
type Props = HTMLAttributes<HTMLDivElement>;
export function Bubble({ className = "", ...props }: Props & { muted?: boolean }) {
  const { muted = false, ...rest } = props;
  return <div data-slot="bubble" className={`rounded-2xl border px-4 py-3 text-[13px] leading-relaxed shadow-sm ${muted ? "border-slate-800 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700"} ${className}`} {...rest} />;
}
export function BubbleContent(props: Props) { return <div data-slot="bubble-content" {...props} />; }
