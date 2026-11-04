'use client';

import type { SocialAccount } from '@/components/dashboard/account/account-home';
import StudioDialog from '@/components/ui/studio-dialog';

export function DisconnectNetworkDialog({
  account,
  linkBusy,
  onDismiss,
  onConfirm,
}: {
  account: SocialAccount | null;
  linkBusy: string | null;
  onDismiss: () => void;
  onConfirm: () => void;
}) {
  return (
    <StudioDialog
      open={Boolean(account)}
      title="Disconnect this network?"
      description={
        account
          ? `${account.label} will be signed out here. You can connect it again later.`
          : undefined
      }
      onDismiss={() => !linkBusy && onDismiss()}
    >
      <div className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          disabled={Boolean(linkBusy)}
          onClick={onDismiss}
          className="inline-flex min-h-11 cursor-pointer items-center rounded-xl px-4 text-sm font-semibold text-slate-700 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
        >
          Stay connected
        </button>
        <button
          type="button"
          disabled={Boolean(linkBusy) || !account}
          onClick={onConfirm}
          className="inline-flex min-h-11 cursor-pointer items-center rounded-xl bg-rose-700 px-4 text-sm font-semibold text-white hover:bg-rose-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-700 disabled:opacity-50"
        >
          {linkBusy ? 'Disconnecting…' : 'Disconnect'}
        </button>
      </div>
    </StudioDialog>
  );
}
