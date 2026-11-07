'use client';

import { LogOut } from 'lucide-react';
import type {
  MatorSettingsMasked,
  MatorSettingsSavePatch,
} from '@/modules/mator';
import { SwitchRow } from '@/modules/settings/components/account/account-switch-row';

export function PreferencesSection({
  mator,
  matorBusy,
  hosted,
  onPatchMator,
}: {
  mator: MatorSettingsMasked | null;
  matorBusy: boolean;
  hosted: boolean;
  onPatchMator: (patch: MatorSettingsSavePatch) => void;
}) {
  return (
    <section
      aria-labelledby="account-preferences-heading"
      className="flex flex-col gap-4"
    >
      <header>
        <h1
          id="account-preferences-heading"
          className="font-serif text-3xl tracking-tight text-[#111a25]"
        >
          Preferences
        </h1>
        <p className="mt-3 max-w-xl text-base leading-7 text-slate-600">
          Choose how much Mator does on its own, and how it talks with you.
        </p>
      </header>
      <div className="rounded-3xl bg-white px-6 shadow-[0_20px_50px_-36px_rgba(17,26,37,0.45)] sm:px-8">
        <SwitchRow
          label="Ask before changes"
          hint="Mator shows a change and waits. Turn this off to let those changes apply right away."
          checked={!(mator?.autoApprove ?? false)}
          disabled={matorBusy || !mator}
          onChange={(ask) => void onPatchMator({ autoApprove: !ask })}
        />
        <SwitchRow
          label="Keep older chats short"
          hint="Mator sets aside earlier messages so a long conversation stays easy to follow."
          checked={mator?.squashPipelineHistory ?? false}
          disabled={matorBusy || !mator}
          onChange={(value) =>
            void onPatchMator({ squashPipelineHistory: value })
          }
        />
        <SwitchRow
          label="Read notes aloud"
          hint="Mator speaks short explanations while you work together."
          checked={mator?.howTtsEnabled ?? true}
          disabled={matorBusy || !mator}
          onChange={(value) => void onPatchMator({ howTtsEnabled: value })}
        />
        <SwitchRow
          label="Check messages first"
          hint="Mator reviews what you send before it prepares the next step."
          testId="mator-moderation-toggle"
          checked={mator?.moderationEnabled ?? false}
          disabled={matorBusy || !mator}
          onChange={(value) => void onPatchMator({ moderationEnabled: value })}
        />
      </div>
      {hosted ? (
        <form
          method="post"
          action="/auth/logout"
          className="border-t border-slate-200 pt-8"
        >
          <h2 className="text-base font-semibold text-[#111a25]">Sign out</h2>
          <p className="mt-1 max-w-md text-sm leading-6 text-slate-600">
            This signs you out of Utomator. Your linked networks stay as they
            are.
          </p>
          <button
            type="submit"
            className="mt-4 inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-800 hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
          >
            <LogOut className="size-4" aria-hidden="true" />
            Sign out
          </button>
        </form>
      ) : null}
    </section>
  );
}
