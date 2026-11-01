'use client';

import { useState } from 'react';
import { Check, ClipboardCopy, ShieldAlert, ShieldCheck } from 'lucide-react';
import { AlertDialog } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type Status = 'staged' | 'applied' | 'rejected' | 'incomplete' | 'error';

const statusTone: Record<
  Status,
  { tone: Parameters<typeof Badge>[0]['tone']; label: string }
> = {
  staged: { tone: 'orange', label: 'Staged · awaiting approval' },
  applied: { tone: 'teal', label: 'Applied' },
  rejected: { tone: 'rose', label: 'Rejected' },
  incomplete: { tone: 'amber', label: 'Incomplete' },
  error: { tone: 'rose', label: 'Failed' },
};

type Props = {
  status: Status;
  action?: string | null;
  text?: string | null;
  attachment?: React.ReactNode;
  onConfirm?: () => void;
  onReject?: () => void;
  busy?: boolean;
  className?: string;
};

/**
 * The human-approval surface. A staged change never applies without
 * Confirm; Reject asks once more via AlertDialog (destructive).
 */
export function Confirmation({
  status,
  action,
  text,
  attachment,
  onConfirm,
  onReject,
  busy,
  className,
}: Props) {
  const [rejectOpen, setRejectOpen] = useState(false);
  const meta = statusTone[status] ?? statusTone.staged;

  return (
    <div
      data-slot="confirmation"
      data-status={status}
      data-testid="mator-confirmation"
      className={cn(
        'min-w-0 max-w-full overflow-hidden rounded-xl border bg-white shadow-sm',
        status === 'staged'
          ? 'border-orange-200'
          : status === 'rejected'
            ? 'border-rose-200'
            : status === 'incomplete'
              ? 'border-amber-200'
              : status === 'error'
                ? 'border-rose-300'
                : 'border-teal-200',
        className
      )}
    >
      <div className="flex items-center justify-between gap-2 px-3 pt-2.5">
        <Badge tone={meta.tone} size="xs">
          {status === 'applied' && action === 'run step' ? 'Run started' : meta.label}
        </Badge>
        {action && (
          <span className="truncate text-[11px] text-slate-400">{action}</span>
        )}
      </div>
      {text && (
        <p className="mt-1.5 break-words px-3 text-[13px] leading-relaxed text-slate-800 [overflow-wrap:anywhere]">
          {text}
        </p>
      )}
      {attachment && <div className="mt-2 px-3">{attachment}</div>}
      {status === 'staged' && (
        <div className="mt-2.5 flex items-center gap-2 border-t border-orange-100 bg-orange-50/50 px-3 py-2.5">
          <p className="flex-1 text-[11px] font-semibold text-orange-900">
            Confirm to apply, or reject to leave everything untouched.
          </p>
          <button
            type="button"
            data-testid="mator-stage-reject"
            disabled={busy}
            onClick={() => setRejectOpen(true)}
            className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-xl border border-rose-200 bg-white px-2.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ShieldAlert className="size-3.5" aria-hidden="true" />
            Reject
          </button>
          <button
            type="button"
            data-testid="mator-stage-confirm"
            disabled={busy}
            onClick={() => onConfirm?.()}
            className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-xl bg-orange-700 px-2.5 text-xs font-semibold text-white hover:bg-orange-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ShieldCheck className="size-3.5" aria-hidden="true" />
            Confirm
          </button>
        </div>
      )}
      <AlertDialog
        open={rejectOpen}
        onOpenChange={(confirm) => {
          setRejectOpen(false);
          if (confirm) onReject?.();
        }}
        title="Reject this staged change?"
      >
        Nothing has been applied yet. Rejecting marks this proposal as rejected
        in the thread — no settings, posts, or profile fields change.
      </AlertDialog>
    </div>
  );
}

/** Copy action used across ai-elements message footers. */
export function useCopyAction() {
  const [copied, setCopied] = useState(false);
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
      return true;
    } catch {
      return false;
    }
  };
  const icon = copied ? (
    <Check className="size-3.5" aria-hidden="true" />
  ) : (
    <ClipboardCopy className="size-3.5" aria-hidden="true" />
  );
  return { copied, copy, icon };
}
