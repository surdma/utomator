'use client';

import { Button } from '@/components/ui/automate-card';
import StudioDialog from '@/components/ui/studio-dialog';

type Props = {
  deleteOpen: boolean;
  onDeleteDismiss: () => void;
  baselineName?: string;
  deleteError?: string;
  deleteBusy: boolean;
  deleteReadOnly: boolean;
  onDeleteConfirm: () => void;
  leaveOpen: boolean;
  onLeaveDismiss: () => void;
  onLeaveConfirm: () => void;
};

export function CraftLibraryDialogs({
  deleteOpen,
  onDeleteDismiss,
  baselineName,
  deleteError,
  deleteBusy,
  deleteReadOnly,
  onDeleteConfirm,
  leaveOpen,
  onLeaveDismiss,
  onLeaveConfirm,
}: Props) {
  return (
    <>
      <StudioDialog
        open={deleteOpen}
        onDismiss={onDeleteDismiss}
        title="Delete craft"
        description={
          'Permanently remove ' +
          (baselineName || 'this craft') +
          ' from the your personal collection?'
        }
        testId="delete-craft-dialog"
      >
        <p className="text-sm leading-6 text-slate-600">
          This removes its graph and MDX source. This action cannot be undone.
        </p>
        {deleteError && (
          <p role="alert" className="mt-3 text-sm text-rose-700">
            {deleteError}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button onClick={onDeleteDismiss}>Cancel</Button>
          <Button
            variant="danger"
            disabled={deleteBusy || deleteReadOnly}
            onClick={onDeleteConfirm}
          >
            {deleteBusy ? 'Deleting…' : 'Delete craft'}
          </Button>
        </div>
      </StudioDialog>
      <StudioDialog
        open={leaveOpen}
        onDismiss={onLeaveDismiss}
        title="Discard unsaved changes?"
        description="Your unsaved graph or MDX source edits will be lost."
        testId="discard-craft-dialog"
      >
        <div className="flex justify-end gap-2">
          <Button onClick={onLeaveDismiss}>Keep editing</Button>
          <Button variant="danger" onClick={onLeaveConfirm}>
            Discard and leave
          </Button>
        </div>
      </StudioDialog>
    </>
  );
}
