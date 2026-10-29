/**
 * Canonical LinkedIn growth capability inventory.
 *
 * This is a product scope registry, NOT an automation registry.
 * A planned or assisted action cannot be dispatched as an API call.
 * "partial" means only the explicitly listed linked existing workflows run.
 */
export type GrowthPillar = 'research' | 'execution' | 'measurement';
export type GrowthPriority = 'P0' | 'P1' | 'P2';
export type GrowthStatus = 'partial' | 'planned';
export type GrowthMode =
  'official-api' | 'assisted' | 'owner-operated' | 'restricted';
export type GrowthCapability = {
  id: string;
  title: string;
  priority: GrowthPriority;
  pillar: GrowthPillar;
  status: GrowthStatus;
  summary: string;
  actions: readonly string[];
  modes: readonly GrowthMode[];
  availableNow: string;
  requires: string;
  route?: '/dashboard/profile' | '/dashboard/research' | '/dashboard/editorial';
};
export const profileSections = [
  'Profile photo',
  'Banner / cover',
  'Full name and pronunciation',
  'Headline',
  'About',
  'Experience',
  'Education',
  'Featured',
  'Skills',
  'Recommendations',
  'Certifications',
  'Projects',
  'Publications',
  'Volunteering',
  'Honors and awards',
  'Services',
  'Contact information',
  'Custom profile URL',
  'Career preferences',
  'Profile verification',
] as const;

export const growthCapabilities: readonly GrowthCapability[] = [
  {
    id: 'profile',
    title: 'Profile auditing & section optimization',
    priority: 'P0',
    pillar: 'execution',
    status: 'partial',
    summary:
      'Grounded, section-by-section profile quality, positioning and evidence review.',
    actions: [
      'Assess every supported profile section independently using a transparent rubric',
      'Review photo framing, banner hierarchy, name and pronunciation accuracy',
      'Audit and rewrite headline, About, Experience, Education and Featured',
      'Review Skills, Recommendations, Certifications, Projects and Publications',
      'Review volunteering, honors, Services, contact links and custom URL',
      'Check job preferences, verification options and career-specific keywords',
      'Compare original versus proposed claims; reject fabricated achievements',
      'Provide role-specific headline/About variations and prioritized improvements',
      'Preserve drafts, change history and verified post-edit reassessment',
    ],
    modes: ['assisted', 'owner-operated', 'restricted'],
    availableNow:
      'Saved account profiles, selected approval-gated browser workflows, and a manual evidence-based profile planner.',
    requires:
      'Additional section extractors, real field-by-field audit rubric, provenance, and supported permission checks.',
    route: '/dashboard/profile',
  },
  {
    id: 'competitors',
    title: 'Creator, competitor & niche intelligence',
    priority: 'P0',
    pillar: 'research',
    status: 'partial',
    summary:
      'Explain observed positioning and content patterns without inventing private growth history.',
    actions: [
      'Find relevant peers, creators, founders, recruiters and company pages through permitted sources',
      'Maintain a consented creator/competitor watchlist and comparison cohorts',
      'Compare public positioning, career milestones, content pillars and writing styles',
      'Analyze user-supplied post excerpts, formats, hooks, engagement and visible patterns',
      'Construct sourced career/content timelines and mark unavailable early posts',
      'Distinguish observed metrics from hypotheses about audience and conversion',
      'Identify content gaps and collaboration candidates',
      "Produce testable strategies adapted to the owner's career stage",
    ],
    modes: ['assisted', 'owner-operated', 'restricted'],
    availableNow:
      'User-submitted creator research: source-linked reports, positioning comparison and experiment proposals; no automated LinkedIn scraping.',
    requires:
      'Permitted discovery sources, explicit watchlist storage and timestamped comparative evidence.',
    route: '/dashboard/research',
  },
  {
    id: 'content',
    title: 'Post creation, publishing & management',
    priority: 'P0',
    pillar: 'execution',
    status: 'partial',
    summary:
      'Source-aware editorial workflow from idea and approval to authorized publication and records.',
    actions: [
      'Research questions, trends, problems, original case studies and evidence',
      'Draft educational, personal, project, research and hiring posts',
      'Review hooks, readability, originality, citations, audience fit and calls to action',
      'Save, revise, approve, reopen, archive and delete private drafts',
      'Publish approved text-only member posts with an authorized OAuth grant',
      'Track provider post URNs, failed deliveries and uncertain outcomes',
      'Read, edit and delete owned provider posts only with appropriate permissions',
      'Schedule, repurpose, create media assets and manage articles/polls when supported',
      'Associate post-level performance with a campaign or content pillar',
    ],
    modes: ['official-api', 'assisted', 'owner-operated', 'restricted'],
    availableNow:
      'Private editorial lifecycle and explicitly confirmed personal text-post publishing; provider receipts and failure-safe states.',
    requires:
      'OAuth product access and consent for live publishing; permission-specific provider read/update/delete, media, scheduler and metrics integrations.',
    route: '/dashboard/editorial',
  },
  {
    id: 'engagement',
    title: 'Engagement & community discussions',
    priority: 'P1',
    pillar: 'execution',
    status: 'planned',
    summary:
      'Prioritize meaningful replies on owned conversations and avoid manufactured engagement.',
    actions: [
      'Find relevant discussions through permitted evidence',
      'Review and summarize accessible comments on owned content',
      'Prepare context-aware replies and useful contributions',
      'Manage response queue, thread context and moderation requests',
      'React, comment, repost or remove a reaction only with expressly supported provider rights',
      'Track recurring substantive conversations and unanswered requests',
      'Review the quality and outcomes of contributions',
    ],
    modes: ['assisted', 'owner-operated', 'restricted'],
    availableNow:
      'No complete engagement management or automated LinkedIn interaction integration.',
    requires:
      'Permissions and policy review for each mutation, owner review, accessible conversation data and a durable response queue.',
  },
  {
    id: 'network',
    title: 'Audience & professional network development',
    priority: 'P1',
    pillar: 'execution',
    status: 'planned',
    summary:
      'Grow relevant professional relationships rather than maximize connection totals.',
    actions: [
      'Define ideal followers and high-value professional audiences',
      'Research peers, recruiters, collaborators and relevant communities',
      'Prioritize shared interests and authentic introduction opportunities',
      'Draft personalized connection notes for owner delivery',
      'Track manually sent invitations and replies',
      'Maintain relationship context and sensible follow-ups',
      'Compare meaningful relationships with raw network size',
    ],
    modes: ['assisted', 'owner-operated', 'restricted'],
    availableNow:
      'No invitation delivery, network discovery or persistent relationship workflows.',
    requires:
      'Owner-supplied contact context; manual sending; consent and clear restrictions on invitation automation.',
  },
  {
    id: 'company',
    title: 'Company Page & organization growth',
    priority: 'P1',
    pillar: 'execution',
    status: 'planned',
    summary:
      'A distinct organization identity and permission model, not a personal-profile clone.',
    actions: [
      'Audit Page description, tagline, logo, banner, website and call-to-action',
      'Check Page administrator roles before each mutation',
      'Coordinate founder and brand calendars without duplicate copy',
      'Publish company announcements with organization-scoped permissions',
      'Review Page conversations, followers, visitors and content metrics when eligible',
      'Compare eligible competitor Page metrics and native benchmarks',
      'Plan employee advocacy, services, events, Showcase Pages and paid promotion',
    ],
    modes: ['official-api', 'assisted', 'owner-operated', 'restricted'],
    availableNow:
      'No Company Page provider authorization or organization publishing.',
    requires:
      'Organization OAuth scopes, admin-role checks, approved products, independent organization data model.',
  },
  {
    id: 'branding',
    title: 'Personal positioning & professional authority',
    priority: 'P0',
    pillar: 'execution',
    status: 'partial',
    summary:
      'Make expertise recognizable through consistent evidence-backed positioning.',
    actions: [
      'Define career goal, niche, ideal audience and specific professional promise',
      'Select 3–5 sustainable pillars and recognizable voice guidelines',
      'Prioritize verified achievements, projects and proof-of-work',
      'Align profile, Featured items, portfolio, writing and visual identity',
      'Plan credible milestones, guest writing, speaking and collaborations',
      'Detect unsupported claims or contradictory positioning',
      'Measure recognition and qualified opportunity outcomes',
    ],
    modes: ['assisted', 'owner-operated'],
    availableNow:
      'Profile planning and creator research can inform positioning, but no unified, persisted brand strategy module.',
    requires:
      'Versioned owner goals, approved voice samples, evidence taxonomy and brand strategy reviews.',
    route: '/dashboard/profile',
  },
  {
    id: 'jobs',
    title: 'Job search & career opportunity pipeline',
    priority: 'P1',
    pillar: 'execution',
    status: 'planned',
    summary:
      'From job evidence and factual fit scoring to owner-submitted applications and outcomes.',
    actions: [
      'Define target roles, adjacent careers, industries and companies',
      'Record legitimate openings, requirements and source URLs',
      'Match actual qualifications and identify missing skills',
      'Align resume, portfolio and LinkedIn profile for a specific vacancy',
      'Prepare applications, cover letters and interview evidence',
      'Track saved, applied, interviewing, rejected, offer and accepted states',
      'Draft recruiter introductions and respectful follow-ups',
      'Measure application-to-interview and offer outcomes',
    ],
    modes: ['assisted', 'owner-operated', 'restricted'],
    availableNow:
      'Existing resume workspace supports career documents; there is no integrated job search or application tracker.',
    requires:
      'Verified vacancy input, job and application records, user-controlled submission and vacancy freshness checks.',
  },
  {
    id: 'outreach',
    title: 'Outreach, messaging & relationships',
    priority: 'P1',
    pillar: 'execution',
    status: 'planned',
    summary:
      'Context-aware relationship assistance with owner-operated LinkedIn messaging.',
    actions: [
      'Research relevant professional context supplied or legitimately accessible',
      'Draft non-generic connection notes, introductions and collaboration requests',
      'Prepare recruiter, mentor, customer and partnership conversations',
      'Summarize user-provided messages and track next steps',
      'Maintain a response queue and follow-up decisions',
      'Offer respectful opt-out and do-not-contact controls',
      'Record meeting outcomes without falsely claiming a message was sent',
    ],
    modes: ['assisted', 'owner-operated', 'restricted'],
    availableNow:
      'No LinkedIn DM integration, outreach queue or automated sending.',
    requires:
      'Consent and contact records, explicit human delivery, retained evidence and anti-spam constraints.',
  },
  {
    id: 'leads',
    title: 'Lead, customer & partnership CRM',
    priority: 'P2',
    pillar: 'execution',
    status: 'planned',
    summary:
      'Track qualification, conversations, meetings and commercial outcomes.',
    actions: [
      'Define an ideal prospect or partner',
      'Research companies and potential business needs with provenance',
      'Qualify opportunities without inventing buyer intent',
      'Draft proposals and discovery-call agendas',
      'Track discovered, researching, contacted, replied, qualified, meeting, proposal, won and lost',
      'Record do-not-contact preferences and genuine pipeline conversion',
    ],
    modes: ['assisted', 'owner-operated'],
    availableNow: 'No CRM pipeline or lead conversion attribution.',
    requires:
      'Tenant-isolated contact records, source provenance and lifecycle transitions.',
  },
  {
    id: 'longform',
    title: 'Newsletters, events & professional communities',
    priority: 'P2',
    pillar: 'execution',
    status: 'planned',
    summary:
      'Plan deeper thought leadership and substantive professional participation.',
    actions: [
      'Research newsletter themes, draft article/edition outlines and maintain an editorial calendar',
      'Repurpose supported original work into short-form content',
      'Review eligibility to publish newsletters or articles in LinkedIn',
      'Discover relevant events, groups, talks and community questions',
      'Prepare networking questions, attendance goals and follow-up notes',
      'Measure readership and authentic collaboration outcomes',
    ],
    modes: ['assisted', 'owner-operated', 'restricted'],
    availableNow:
      'No LinkedIn newsletter, event or group management integration.',
    requires:
      'Permitted discovery sources, owner-driven participation and eligible publishing features.',
  },
  {
    id: 'analytics',
    title: 'Audience, post & opportunity analytics',
    priority: 'P0',
    pillar: 'measurement',
    status: 'planned',
    summary:
      'Establish defensible baselines and demonstrate useful professional outcomes.',
    actions: [
      'Record profile visits, search appearances, impressions and eligible reach',
      'Track relevant followers, reactions, comments, reposts and discussion quality',
      'Import approved LinkedIn native analytics exports and label collection method',
      'Compare weekly, monthly and quarterly baselines',
      'Compute engagement and follower-growth rates with explicit denominators',
      'Analyze pillar, format, audience and time period performance',
      'Attribute interviews, leads, collaborations and meetings only when evidence allows',
      'Export historical reports with missing-data and uncertainty annotations',
    ],
    modes: ['official-api', 'assisted', 'owner-operated', 'restricted'],
    availableNow:
      'No real LinkedIn audience analytics ingestion or growth baseline dashboard.',
    requires:
      'Authorized API access where available or user-uploaded exports, typed metrics and source snapshots.',
  },
  {
    id: 'reputation',
    title: 'Brand reputation, credibility & account health',
    priority: 'P1',
    pillar: 'measurement',
    status: 'planned',
    summary:
      'Protect the credibility and security of the professional identity over time.',
    actions: [
      'Review factual claims, stale roles, contradictory dates and inflated accomplishments',
      'Audit public contact surfaces, account settings and authorized integrations',
      'Flag user-reported impersonation or inappropriate discussions for owner review',
      'Review privacy and verification settings without changing them secretly',
      'Maintain evidenced claims and publication history',
      'Avoid artificial engagement and mass-automation tactics',
    ],
    modes: ['assisted', 'owner-operated', 'restricted'],
    availableNow:
      'Existing evidence/approval checks cover individual profile workflows, not comprehensive reputation monitoring.',
    requires:
      'Account health checklist, permission inventory, approved source records and owner review.',
  },
  {
    id: 'experiments',
    title: 'Growth experiments & strategy refinement',
    priority: 'P1',
    pillar: 'measurement',
    status: 'planned',
    summary:
      'Test measurable changes with one clear hypothesis and a documented result.',
    actions: [
      'Record account-specific audience and professional goals',
      'Define testable changes to headlines, pillars, formats, hooks or calls to action',
      'Establish baseline, success metric and observation window before changing anything',
      'Track experiment variants, source content and owner approval',
      'Analyze observed changes with caveats about causation and sample size',
      'Choose a justified next iteration based on collected evidence',
    ],
    modes: ['assisted', 'owner-operated'],
    availableNow:
      'Creator Research proposes experiments, but does not execute and measure a versioned experiment program.',
    requires:
      'Real analytics inputs, experiment store, outcome attribution and user approval for changes.',
  },
  {
    id: 'reporting',
    title: 'Advanced reporting & multi-account governance',
    priority: 'P2',
    pillar: 'measurement',
    status: 'planned',
    summary:
      'Separate personal and company ownership, maintain data boundaries and assemble decision-ready reports.',
    actions: [
      'Produce longitudinal multi-module growth reports',
      'Compare personal and company indicators without mixing identity permissions',
      'Export evidence, change receipts and experiment outcomes',
      'Apply tenant and role-scoped access controls for teams',
      'Review connector permissions, audits and data retention',
      'Track which operations were provider-executed versus owner-operated',
    ],
    modes: ['assisted', 'owner-operated', 'restricted'],
    availableNow:
      'Tenant document isolation exists for implemented features, but no shared multi-account reporting product.',
    requires:
      'Scoped roles, owner/company data contracts, source governance and reporting validation.',
  },
] as const;

export const growthJourneys = [
  {
    id: 'profile',
    title: 'Improve my profile',
    sequence: ['profile', 'competitors', 'branding', 'analytics'],
    outcome:
      'A prioritized, evidence-backed section revision plan and a measured follow-up.',
  },
  {
    id: 'audience',
    title: 'Grow my professional audience',
    sequence: [
      'branding',
      'competitors',
      'content',
      'engagement',
      'analytics',
      'experiments',
    ],
    outcome:
      'An authentic editorial and engagement cycle with real performance evidence.',
  },
  {
    id: 'job',
    title: 'Find a better job',
    sequence: ['jobs', 'profile', 'outreach', 'analytics'],
    outcome:
      'Verified opportunities, tailored career evidence, tracked owner-submitted applications.',
  },
  {
    id: 'company',
    title: 'Grow my company',
    sequence: ['company', 'branding', 'content', 'leads', 'analytics'],
    outcome:
      'A distinct organization presence and attributable leads or partnerships.',
  },
  {
    id: 'relationships',
    title: 'Build valuable relationships',
    sequence: ['network', 'outreach', 'engagement', 'leads'],
    outcome:
      'Meaningful conversations, follow-up context and genuine collaborations.',
  },
] as const;

export const growthGuardrails = [
  'No LinkedIn scraping, bulk invitations, unsolicited mass DMs or artificial engagement.',
  'Public facts, owner-supplied evidence, inference and private analytics must remain distinguishable.',
  'No account or organization action without the exact scope, ownership check and user approval.',
  'Never label a drafted message or internal content revision as an external LinkedIn action.',
  'Permission-restricted modules must fail closed; availability can vary by LinkedIn program.',
  'Reported performance must show source, timeframe, denominator and uncertainty.',
] as const;
