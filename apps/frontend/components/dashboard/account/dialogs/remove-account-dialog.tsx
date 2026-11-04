'use client';

import type { SocialAccount } from '@/components/dashboard/account/account-home';
import StudioDialog from '@/components/ui/studio-dialog';

export function RemoveAccountDialog({
  account,
  saving,
  onDismiss,
  onConfirm,
}: {
  account: SocialAccount | null;
  saving: boolean;
  onDismiss: () => void;
  onConfirm: () => void;
}) {
  return (
    <StudioDialog
      open={Boolean(account)}
      title="Remove this account?"
      description={
        account
          ? `${account.label} will be forgotten here. You can connect it again later.`
          : undefined
      }
      onDismiss={() => !saving && onDismiss()}
    >
      <div className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={onDismiss}
          className="inline-flex min-h-11 cursor-pointer items-center rounded-xl px-4 text-sm font-semibold text-slate-700 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
        >
          Keep account
        </button>
        <button
          type="button"
          disabled={saving || !account}
          onClick={onConfirm}
          className="inline-flex min-h-11 cursor-pointer items-center rounded-xl bg-rose-700 px-4 text-sm font-semibold text-white hover:bg-rose-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-700 disabled:opacity-50"
        >
          {saving ? 'Removing…' : 'Remove account'}
        </button>
      </div>
    </StudioDialog>
  );
}
