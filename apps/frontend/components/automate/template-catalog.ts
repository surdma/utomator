export type TemplatePlatform =
  'linkedin' | 'x' | 'instagram' | 'github' | 'devto';
export type TemplateCategory =
  'Profile' | 'Showcase' | 'Publishing' | 'Engagement' | 'Planning';
export type CatalogTemplate = {
  id: string;
  platform: TemplatePlatform;
  category: TemplateCategory;
  title: string;
  description: string;
  action?: string;
  capabilities: string[];
  automation: 'supported' | 'planned';
  schedule: 'manual' | 'planned';
};

/** Product catalogue, not an execution registry. Only supported actions have an
 * existing backend handler; everything else is explicitly non-executable. */
export const templateCatalog: readonly CatalogTemplate[] = [
  {
    id: 'li-audit',
    platform: 'linkedin',
    category: 'Profile',
    title: 'Profile baseline and evidence',
    description:
      'Inspect the owner profile without modifying it; preserve provenance for later evaluation. Profile audit recorded.',
    action: 'audit',
    capabilities: [
      'Owner evidence',
      'Human approval',
      'Verified outcomes',
      'Verified result',
    ],
    automation: 'supported',
    schedule: 'manual',
  },
  {
    id: 'li-page',
    platform: 'linkedin',
    category: 'Profile',
    title: 'Section-specific profile audit',
    description:
      'Verify the exact account, approved page URL and section scope before collecting evidence. Section audit recorded.',
    action: 'audit-page',
    capabilities: [
      'Owner evidence',
      'Human approval',
      'Verified outcomes',
      'Verified result',
    ],
    automation: 'supported',
    schedule: 'manual',
  },
  {
    id: 'li-intro',
    platform: 'linkedin',
    category: 'Profile',
    title: 'Headline and About revision',
    description:
      'Check owner-provided facts, audience, keywords and approved replacement text before continuing. Headline or About read-back.',
    action: 'edit-profile',
    capabilities: [
      'Owner evidence',
      'Human approval',
      'Verified outcomes',
      'Verified result',
    ],
    automation: 'supported',
    schedule: 'manual',
  },
  {
    id: 'li-skills',
    platform: 'linkedin',
    category: 'Profile',
    title: 'Skills alignment',
    description:
      'Only add a verified skill that describes real experience and matches the intended professional role. Exact skill read-back.',
    action: 'add-skill',
    capabilities: [
      'Owner evidence',
      'Human approval',
      'Verified outcomes',
      'Verified result',
    ],
    automation: 'supported',
    schedule: 'manual',
  },
  {
    id: 'li-experience',
    platform: 'linkedin',
    category: 'Profile',
    title: 'Experience impact revision',
    description:
      'Confirm position identity, dates, responsibility, achievements and evidence before changing the description. Experience read-back.',
    action: 'edit-experience',
    capabilities: [
      'Owner evidence',
      'Human approval',
      'Verified outcomes',
      'Verified result',
    ],
    automation: 'supported',
    schedule: 'manual',
  },
  {
    id: 'li-contact',
    platform: 'linkedin',
    category: 'Profile',
    title: 'Contact and website correction',
    description:
      'Verify the HTTPS URL and contact row index before changing the owned profile. Contact URL read-back.',
    action: 'edit-website',
    capabilities: [
      'Owner evidence',
      'Human approval',
      'Verified outcomes',
      'Verified result',
    ],
    automation: 'supported',
    schedule: 'manual',
  },
  {
    id: 'li-services',
    platform: 'linkedin',
    category: 'Profile',
    title: 'Services positioning',
    description:
      'Review service offer, intended client, proof and factual claims before saving. Service description read-back.',
    action: 'edit-services',
    capabilities: [
      'Owner evidence',
      'Human approval',
      'Verified outcomes',
      'Verified result',
    ],
    automation: 'supported',
    schedule: 'manual',
  },
  {
    id: 'li-project',
    platform: 'linkedin',
    category: 'Showcase',
    title: 'Project portfolio showcase',
    description:
      'Confirm the project name, true contribution, URL and owner permission before publishing. Project and evidence link read-back.',
    action: 'add-project',
    capabilities: [
      'Owner evidence',
      'Human approval',
      'Verified outcomes',
      'Verified result',
    ],
    automation: 'supported',
    schedule: 'manual',
  },
  {
    id: 'li-featured',
    platform: 'linkedin',
    category: 'Showcase',
    title: 'Featured proof-of-work link',
    description:
      'Verify the Featured URL, title, ownership and relevance to the profile objective. Featured item read-back.',
    action: 'add-featured',
    capabilities: [
      'Owner evidence',
      'Human approval',
      'Verified outcomes',
      'Verified result',
    ],
    automation: 'supported',
    schedule: 'manual',
  },
  {
    id: 'x-audit',
    platform: 'x',
    category: 'Profile',
    title: 'X profile health check',
    description: 'Capture the currently visible profile and collect evidence.',
    action: 'audit',
    capabilities: ['Account audit', 'Screenshots'],
    automation: 'planned',
    schedule: 'manual',
  },
  {
    id: 'x-bio',
    platform: 'x',
    category: 'Profile',
    title: 'Bio & profile optimization',
    description:
      'Update selected X bio, location or website fields with read-back verification.',
    action: 'edit-profile',
    capabilities: ['Bio', 'Location', 'Website'],
    automation: 'planned',
    schedule: 'manual',
  },
  {
    id: 'x-banner',
    platform: 'x',
    category: 'Profile',
    title: 'Profile banner',
    description: 'Choose an approved local image and update the banner.',
    action: 'upload-banner',
    capabilities: ['Banner asset', 'Crop approval'],
    automation: 'planned',
    schedule: 'manual',
  },
  {
    id: 'x-post',
    platform: 'x',
    category: 'Publishing',
    title: 'Publish one X post',
    description: 'Prepare a post and publish after the operator approves it.',
    action: 'compose-post',
    capabilities: ['Text', 'Approval'],
    automation: 'planned',
    schedule: 'manual',
  },
  {
    id: 'x-pin',
    platform: 'x',
    category: 'Publishing',
    title: 'Pin a published post',
    description:
      'Target one exact authored X post and verify its pinned state.',
    action: 'pin-post',
    capabilities: ['Existing post URL', 'Verification'],
    automation: 'planned',
    schedule: 'manual',
  },
  {
    id: 'x-delete',
    platform: 'x',
    category: 'Publishing',
    title: 'Delete an X post',
    description:
      'Remove one exact owned post only after explicit irreversible-action confirmation.',
    action: 'delete-post',
    capabilities: ['Exact post', 'Final confirmation'],
    automation: 'planned',
    schedule: 'manual',
  },
  {
    id: 'x-page',
    platform: 'x',
    category: 'Profile',
    title: 'Inspect one X page',
    description: 'Read the selected profile page without modifying it.',
    action: 'audit-page',
    capabilities: ['Scoped audit'],
    automation: 'planned',
    schedule: 'manual',
  },
  {
    id: 'x-quit',
    platform: 'x',
    category: 'Planning',
    title: 'Quit safely',
    description:
      'End an audit workflow before any browser action with a recorded stop event.',
    action: 'audit',
    capabilities: ['Safe stop stage', 'No mutation'],
    automation: 'planned',
    schedule: 'manual',
  },
  {
    id: 'x-series',
    platform: 'x',
    category: 'Publishing',
    title: 'Scheduled post series',
    description:
      'Queue multiple posts on a time zone-aware calendar and verify each published post.',
    capabilities: ['Multiple posts', 'Schedule', 'De-duplication'],
    automation: 'planned',
    schedule: 'planned',
  },
  {
    id: 'x-bulk',
    platform: 'x',
    category: 'Publishing',
    title: 'Review and delete a post list',
    description:
      'Review a finite owned-post list, confirm every destructive target and record receipts.',
    capabilities: ['Batch review', 'Per-post approval', 'Post IDs'],
    automation: 'planned',
    schedule: 'planned',
  },
  {
    id: 'x-edit',
    platform: 'x',
    category: 'Publishing',
    title: 'Edit published posts',
    description:
      'Requires account-feature eligibility and provider-specific edit support; not a generic update endpoint.',
    capabilities: ['Eligibility check', 'Edit history'],
    automation: 'planned',
    schedule: 'planned',
  },
  {
    id: 'x-engage',
    platform: 'x',
    category: 'Engagement',
    title: 'Engagement review',
    description:
      'Review replies, mentions and performance before deciding how to respond.',
    capabilities: ['Read metrics', 'Suggested replies'],
    automation: 'planned',
    schedule: 'planned',
  },
  {
    id: 'ig-audit',
    platform: 'instagram',
    category: 'Profile',
    title: 'Instagram presence review',
    description:
      'Audit bio, links, profile and content signals after a supported account integration is added.',
    capabilities: ['Professional account', 'Profile review'],
    automation: 'planned',
    schedule: 'planned',
  },
  {
    id: 'ig-image',
    platform: 'instagram',
    category: 'Publishing',
    title: 'Photo & carousel publishing',
    description:
      'Prepare approved image or carousel media for a supported professional account.',
    capabilities: ['Image', 'Carousel', 'Caption'],
    automation: 'planned',
    schedule: 'planned',
  },
  {
    id: 'ig-reels',
    platform: 'instagram',
    category: 'Publishing',
    title: 'Reels publishing',
    description:
      'Prepare video, verify processing and publish with the required Meta permissions.',
    capabilities: ['Video', 'Reels', 'Media processing'],
    automation: 'planned',
    schedule: 'planned',
  },
  {
    id: 'ig-stories',
    platform: 'instagram',
    category: 'Publishing',
    title: 'Stories publishing',
    description:
      'Publish Story content only where account type and platform permissions allow.',
    capabilities: ['Story', 'Account eligibility'],
    automation: 'planned',
    schedule: 'planned',
  },
  {
    id: 'ig-comments',
    platform: 'instagram',
    category: 'Engagement',
    title: 'Comments & moderation',
    description:
      'Review comments and stage account-authorized replies or moderation actions.',
    capabilities: ['Comments', 'Reply review'],
    automation: 'planned',
    schedule: 'planned',
  },
  {
    id: 'ig-calendar',
    platform: 'instagram',
    category: 'Planning',
    title: 'Instagram content calendar',
    description:
      'Coordinate planned posts, carousels and reels against a scheduling queue.',
    capabilities: ['Calendar', 'Publishing slots'],
    automation: 'planned',
    schedule: 'planned',
  },
  {
    id: 'gh-profile',
    platform: 'github',
    category: 'Profile',
    title: 'GitHub profile overview',
    description:
      'Inspect owned repositories and profile signals after GitHub authorization is supported.',
    capabilities: ['Repository profile', 'Authorized API'],
    automation: 'planned',
    schedule: 'planned',
  },
  {
    id: 'devto-profile',
    platform: 'devto',
    category: 'Publishing',
    title: 'Dev.to article publishing',
    description:
      'Draft and publish articles with verified author permissions once the Dev.to connector is available.',
    capabilities: ['Article drafts', 'Author verification'],
    automation: 'planned',
    schedule: 'planned',
  },
  {
    id: 'cross-platform',
    platform: 'x',
    category: 'Planning',
    title: 'Cross-platform content adaptation',
    description:
      'Adapt approved source content into distinct X, LinkedIn and Instagram variants with explicit review.',
    capabilities: ['Channel variants', 'Campaign dependencies'],
    automation: 'planned',
    schedule: 'planned',
  },
];
export const templateCategories: readonly TemplateCategory[] = [
  'Profile',
  'Showcase',
  'Publishing',
  'Engagement',
  'Planning',
];
