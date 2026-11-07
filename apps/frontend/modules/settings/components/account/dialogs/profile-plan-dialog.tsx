'use client';

import StudioDialog from '@/components/ui/studio-dialog';
import { growthJourneys, profileSections } from '@/modules/growth';
import { workFor } from '@/modules/settings/components/account/account-format';

export function ProfilePlanDialog({
  open,
  onDismiss,
}: {
  open: boolean;
  onDismiss: () => void;
}) {
  return (
    <StudioDialog
      open={open}
      title="Improve my profile"
      description="A prioritized, evidence-backed section revision plan and a measured follow-up."
      onDismiss={onDismiss}
    >
      <ul className="grid gap-2 sm:grid-cols-2">
        {workFor(growthJourneys[0].sequence).map((step) => (
          <li key={step} className="text-sm font-medium text-[#111a25]">
            {step}
          </li>
        ))}
      </ul>
      <ul className="mt-4 grid gap-x-6 gap-y-1 border-t border-slate-100 pt-4 sm:grid-cols-2">
        {profileSections.map((section) => (
          <li key={section} className="text-sm leading-7 text-slate-600">
            {section}
          </li>
        ))}
      </ul>
    </StudioDialog>
  );
}
