import type { HTMLAttributes, ButtonHTMLAttributes } from 'react';
type Props = HTMLAttributes<HTMLDivElement>;
export function Card({ className = '', ...props }: Props) {
  return (
    <div
      data-slot="card"
      className={`rounded-2xl border border-slate-200 bg-white shadow-[0_6px_28px_-20px_rgba(15,23,42,.35)] ${className}`}
      {...props}
    />
  );
}
export function CardHeader({ className = '', ...props }: Props) {
  return <div className={`px-5 pt-5 pb-3 ${className}`} {...props} />;
}
export function CardContent({ className = '', ...props }: Props) {
  return <div className={`px-5 pb-5 ${className}`} {...props} />;
}
export function CardTitle({
  className = '',
  ...props
}: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      className={`text-sm font-bold tracking-tight text-slate-900 ${className}`}
      {...props}
    />
  );
}
export function CardDescription({
  className = '',
  ...props
}: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={`mt-1 text-xs leading-5 text-slate-500 ${className}`}
      {...props}
    />
  );
}
type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'default';
};
export function Button({
  className = '',
  variant = 'secondary',
  size = 'default',
  ...props
}: ButtonProps) {
  const styles = {
    primary: 'bg-slate-900 text-white hover:bg-slate-700',
    secondary:
      'border border-slate-200 bg-white text-slate-800 hover:bg-slate-100',
    ghost: 'text-slate-600 hover:bg-slate-100',
    danger: 'bg-rose-50 text-rose-700 hover:bg-rose-100',
  };
  return (
    <button
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-3 font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:cursor-not-allowed disabled:opacity-40 ${size === 'sm' ? 'text-xs' : 'text-sm'} ${styles[variant]} ${className}`}
      {...props}
    />
  );
}
