'use client';

import StudioDialog from '@/components/ui/studio-dialog';

export type ProfileDraft = {
  displayName: string;
  email: string;
  location: string;
  about: string;
  headline?: string;
  website?: string;
  skills?: string;
  experience?: string;
  education?: string;
  avatarUrl?: string;
};

export function ProfileEditorDialog({
  open,
  draft,
  saving,
  onDismiss,
  onDraftChange,
  onSubmit,
}: {
  open: boolean;
  draft: ProfileDraft | null;
  saving: boolean;
  onDismiss: () => void;
  onDraftChange: (
    updater: (current: ProfileDraft) => ProfileDraft | null,
  ) => void;
  onSubmit: () => void;
}) {
  return (
    <StudioDialog
      open={open}
      title="Edit personal details"
      description="This is how you appear inside Utomator."
      onDismiss={() => !saving && onDismiss()}
      testId="account-profile-dialog"
    >
      {draft ? (
        <form
          className="flex flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          {(
            [
              ['displayName', 'Display name', 'text', 150],
              ['email', 'Email', 'email', 180],
              ['location', 'Location', 'text', 180],
            ] as const
          ).map(([key, label, type, max]) => (
            <label
              key={key}
              className="block text-sm font-semibold text-slate-800"
            >
              {label}
              <input
                required={key === 'displayName'}
                type={type}
                autoComplete={key === 'email' ? 'email' : 'off'}
                maxLength={max}
                value={draft[key]}
                onChange={(event) =>
                  onDraftChange(
                    (current) =>
                      current && { ...current, [key]: event.target.value },
                  )
                }
                className="mt-2 block min-h-11 w-full rounded-xl border border-slate-200 px-3 text-base font-normal text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
              />
            </label>
          ))}
          <label className="block text-sm font-semibold text-slate-800">
            About
            <textarea
              rows={4}
              maxLength={1200}
              value={draft.about}
              onChange={(event) =>
                onDraftChange(
                  (current) =>
                    current && { ...current, about: event.target.value },
                )
              }
              className="mt-2 block w-full resize-y rounded-xl border border-slate-200 px-3 py-3 text-base leading-7 font-normal text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
            />
          </label>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={onDismiss}
              className="inline-flex min-h-11 cursor-pointer items-center rounded-xl px-4 text-sm font-semibold text-slate-700 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex min-h-11 cursor-pointer items-center rounded-xl bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save details'}
            </button>
          </div>
        </form>
      ) : null}
    </StudioDialog>
  );
}
