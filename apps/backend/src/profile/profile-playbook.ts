import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface Coverage {
  id: string;
  label: string;
  platform: 'linkedin' | 'x';
  status: 'implemented' | 'manual' | 'reference';
  source: string;
  note: string;
}

const coverage: Coverage[] = [
  {
    id: 'audit-page',
    label: 'Scoped page inspection',
    platform: 'linkedin',
    status: 'implemented',
    source: 'apps/backend/src/workflows/execute.ts',
    note: 'Read-only, restricted to the selected profile or supported detail pages',
  },
  {
    id: 'audit',
    label: 'Profile and section audit',
    platform: 'linkedin',
    status: 'implemented',
    source: '.playwright-cli/v2-audit-1.js',
    note: 'Read-only snapshot and accessibility evidence; not a full semantic content comparison',
  },
  {
    id: 'edit-profile',
    label: 'Headline and About',
    platform: 'linkedin',
    status: 'implemented',
    source: '.playwright-cli/apply-about.js',
    note: 'Owner-approved copy only; review before save',
  },
  {
    id: 'edit-experience',
    label: 'Experience description',
    platform: 'linkedin',
    status: 'implemented',
    source: '.playwright-cli/apply-bullets.js',
    note: 'Existing position ID required; dates need confirmation',
  },
  {
    id: 'add-skill',
    label: 'Skills',
    platform: 'linkedin',
    status: 'implemented',
    source: '.playwright-cli/add-skills-v2.js',
    note: 'One skill per run, exact autocomplete match',
  },
  {
    id: 'edit-website',
    label: 'Contact website',
    platform: 'linkedin',
    status: 'implemented',
    source: '.playwright-cli/add-websites.js',
    note: 'One confirmed website row per run',
  },
  {
    id: 'edit-services',
    label: 'Services description',
    platform: 'linkedin',
    status: 'implemented',
    source: '.playwright-cli/fix-services.js',
    note: 'Does not change service categories',
  },
  {
    id: 'add-project',
    label: 'Projects and media',
    platform: 'linkedin',
    status: 'implemented',
    source: '.playwright-cli/batch-projects.js',
    note: 'One project per run; association and preview must be inspected',
  },
  {
    id: 'add-featured',
    label: 'Featured link',
    platform: 'linkedin',
    status: 'implemented',
    source: '.playwright-cli/featured-restructure.js',
    note: 'Only adds links; restructuring/removal is not automated',
  },
  {
    id: 'education',
    label: 'Education and credentials',
    platform: 'linkedin',
    status: 'manual',
    source: 'apps/backend/data/seed-profile/docs/linkedin-profile-optimization.md',
    note: 'Dates and credentials need owner confirmation; no writer exists',
  },
  {
    id: 'restructure-featured',
    label: 'Featured reordering/removal',
    platform: 'linkedin',
    status: 'reference',
    source: '.playwright-cli/featured-restructure.js',
    note: 'Historical interaction only, not a validated production workflow',
  },
  {
    id: 'activity',
    label: 'LinkedIn activity cleanup',
    platform: 'linkedin',
    status: 'reference',
    source: '.playwright-cli/delete-post1c.js',
    note: 'No bulk or destructive LinkedIn automation',
  },
  {
    id: 'audit-page',
    label: 'Scoped page inspection',
    platform: 'x',
    status: 'implemented',
    source: 'apps/backend/src/workflows/execute.ts',
    note: 'Read-only inspection of the selected X profile, not arbitrary URLs',
  },
  {
    id: 'audit',
    label: 'Profile audit',
    platform: 'x',
    status: 'implemented',
    source: '.playwright-cli/x-audit.js',
    note: 'Read-only profile observation',
  },
  {
    id: 'edit-profile',
    label: 'Bio, location and website',
    platform: 'x',
    status: 'implemented',
    source: '.playwright-cli/x-apply-fields.js',
    note: 'Explicit fields, approval and fresh-read verification',
  },
  {
    id: 'upload-banner',
    label: 'Banner image',
    platform: 'x',
    status: 'implemented',
    source: '.playwright-cli/x-apply-profile.js',
    note: 'Image crop and Save require review',
  },
  {
    id: 'compose-post',
    label: 'Publish a post',
    platform: 'x',
    status: 'implemented',
    source: '.playwright-cli/x-post-pin.js',
    note: 'Explicit post text and pre-publish approval',
  },
  {
    id: 'pin-post',
    label: 'Pin an existing post',
    platform: 'x',
    status: 'implemented',
    source: '.playwright-cli/x-post-pin2.js',
    note: 'Exact post URL required',
  },
  {
    id: 'delete-post',
    label: 'Delete one post',
    platform: 'x',
    status: 'implemented',
    source: '.playwright-cli/x-cleanup-probe.js',
    note: 'Exact owner URL and two approvals; no bulk sweep',
  },
  {
    id: 'bulk-cleanup',
    label: 'Mass post/repost sweep',
    platform: 'x',
    status: 'reference',
    source: '.playwright-cli/x-patient-sweeper.js',
    note: 'Unsafe to replay. Archived evidence only.',
  },
  {
    id: 'privacy',
    label: 'Settings and privacy',
    platform: 'x',
    status: 'manual',
    source: '.playwright-cli/x-restrict-probe.js',
    note: 'Inspection only; no automatic setting changes',
  },
];

export async function loadAutomationPlaybook() {
  const root = fileURLToPath(new URL('../../../../', import.meta.url));
  const docRoot = fileURLToPath(new URL('../../data/seed-profile/docs/', import.meta.url));
  const guide = await readFile(resolve(docRoot, 'linkedin-profile-optimization.md'), 'utf8');
  const [allArtifacts, rootEntries] = await Promise.all([
    readdir(resolve(root, '.playwright-cli'), { withFileTypes: true }).catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }),
    readdir(root, { withFileTypes: true }),
  ]);
  const artifacts = allArtifacts.filter((f) => f.isFile());
  const rootSnapshots = rootEntries.filter(
    (f) => f.isFile() && /\.(ya?ml|png)$/i.test(f.name) && f.name !== 'pnpm-workspace.yaml',
  );
  const sections = [...guide.matchAll(/^##\s+(.+)$/gm)].map((m) => m[1]);
  return {
    source: 'apps/backend/data/seed-profile/docs/linkedin-profile-optimization.md',
    reviewed: '2026-10-22',
    stages: [
      'Evidence and attribution',
      'Read-only audit',
      'Compare actual vs suggested',
      'Confirm changes',
      'Apply one field',
      'Reopen and verify',
      'Record evidence',
    ],
    guardrails: [
      'Do not infer employer dates, impact metrics, credential details or sole ownership',
      'Preserve already accurate profile content',
      'Obtain approval before any change; never bypass sign-in challenges',
      'Treat historical YAML and PNG as archived evidence, not current UI state',
    ],
    recommended: {
      // Static portfolio examples must never become the active account's draft.
      headline: null,
      about: null,
    },
    sections,
    coverage,
    artifacts: {
      scripts: artifacts
        .filter((f) => f.name.endsWith('.js'))
        .map((f) => f.name)
        .sort(),
      snapshots: artifacts
        .filter((f) => /\.(yml|yaml)$/i.test(f.name))
        .map((f) => f.name)
        .sort(),
      screenshots: artifacts
        .filter((f) => f.name.endsWith('.png'))
        .map((f) => f.name)
        .sort(),
      rootSnapshots: rootSnapshots.map((f) => f.name).sort(),
    },
  };
}
