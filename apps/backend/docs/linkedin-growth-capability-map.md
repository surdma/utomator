# LinkedIn growth: canonical capability map and delivery boundaries

Status: **15 capability requirements are preserved in a unified Growth workspace of 21 default MDX/visual designs; downstream provider actions remain separately gated.**

The unified UI is now `/dashboard/growth`, with `/dashboard/growth/[craftId]` for its visual graph and `/dashboard/growth/[craftId]/source` for MDX. The six existing Craft IDs and personal variants remain accessible through backwards-compatible routes and the existing backend library. See `docs/plans/growth-unification-spec.md`.

This document translates the owner's comprehensive LinkedIn growth brainstorm into a traceable repository contract. It is not a statement that all actions are available via LinkedIn APIs. The interactive catalog is \`apps/frontend/components/automate/linkedin-growth-capabilities.ts\` and its UI is \`/growth\`. The deeper design-only step vocabulary remains in [linkedin-workflow-implementation-plan.md](./linkedin-workflow-implementation-plan.md).

## Mission and three operating capabilities

Build genuine professional **visibility → authority → credibility → relationships → opportunities**, not artificial follower counts.

1. **Research and intelligence:** owner's evidence, allowed discovery sources, creator and company positioning, trends, jobs and audience context.
2. **Optimization and execution:** section-specific profile revision, brand strategy, content publication, legitimate participation, human-reviewed relationship tasks and careers.
3. **Measurement and continuous improvement:** baselines, evidence-linked reports, experiments, attribution, and documented decisions.

Every workflow should begin with an explicit owner goal and end in an observable artifact or a candid blocked/manual status.

## Capability-delivery labels

- **Partially available:** a narrower, specified working vertical slice is already wired into Utomator. Do not equate a single endpoint or a browser template with full product functionality.
- **Planned:** not an executable Utomator module. The catalog may describe the actions, evidence and prerequisites, but it must not show a fake run/publish/send button.
- **Official API:** only on documented, eligible LinkedIn program/scopes and the authenticated member or organization.
- **Assisted:** internal research, analysis, recommendation or draft; not LinkedIn mutations.
- **Owner operated:** user must send, apply, accept, reply or change settings manually.
- **Restricted:** external permission, agreement, product access or policy restrictions need confirmation. Never imply an open permission exists.

Provider access varies by feature, user role, media, subscription and LinkedIn program. A public URL is not authorization to scrape. Post creation uses the existing consented, member-only text Posts API flow; company publishing is NOT covered by it. No unapproved browser-driven mass messaging, fake reactions, connections or job applications.

## 1. Personal profile management and optimization — P0, partially available

Target section checklist (20):
profile photo; banner; name/pronunciation; headline; About; Experience; Education; Featured; Skills; Recommendations; Certifications; Projects; Publications; Volunteering; Honors/Awards; Services; contact info; custom profile URL; career preferences; identity/work verification.

Each section must get its own evidence input, rubric, current-versus-proposed comparison, factual/provenance checks, and saved human decision. Recommend variants for job seekers, founders, researchers, consultants, creators and employers; audit keyword alignment to real vacancies, cross-section consistency and after-change verification.

**Existing:** saved LinkedIn profile directory, selected approval-gated owner browser workflows, manual profile planner. **Missing:** 20-section end-to-end audit and scoring, profile photo/banner analysis, all individual field handlers and measurable post-edit comparison. **Entry:** \`/profile\`.

## 2. Competitor, creator and niche intelligence — P0, partially available

Discovery and watchlists of peer creators, recruiters, founders, authorities and relevant organizations through permitted sources. Deep audits must separate observed positioning, public chronology, content themes, writing style, visible engagement and conversion links from assumptions about unseen audiences, follower growth or revenue. Reconstruct careers only where dated evidence exists; identify early accessible posts versus unavailable history. Compare matched career stages, translate hypotheses into realistic tests, preserve source URLs, excerpts and collection date.

**Existing:** user-submitted read-only Creator Research, source-linked topic comparison, hypotheses and YAML receipts. **Missing:** permitted live discovery, historical research archive, watchlists and refresh/verification workflows. **Entry:** \`/research\`.

## 3. Content research, creation, post CRUD — P0, partially available

Plan documented content pillars and editorial purposes (educational, tutorial, case study, career milestone, professional narrative, hiring, industry analysis, original research, visual, event and newsletter). Separate internal draft creation/revision/approval from external author-scoped create/read/update/delete; validate evidence, claims, audience and formatting. Media, formats, scheduling and analytics are independent integrations with their own authorization and receipts.

**Existing:** private drafts with provenance/revision state; member OAuth consent and one-confirmation text-post publication with provider URN, errors and ambiguous-delivery lockout. **Missing:** authorized provider read/update/delete, media upload, scheduling, multi-format preview, per-post analytics. **Entry:** \`/editorial\`.

## 4. Engagement and community management — P1, planned

Track real, accessible comments and meaningful discussions; prepare contextual replies, propose constructive reactions/reposts where allowed, maintain a response queue and moderation review. No autonomous mass commenting, like-farming or fabricated conversations.

**Dependency:** eligible read/write permissions, owner approvals, provenance and moderation policies.

## 5. Audience growth and professional networking — P1, planned

Define audience fit; discover relevant people through permitted sources; draft authentic connection notes; let the owner send invitations and record when sent. Track substantive repeated relationships, priorities, context, accepted follow-ups and opt-outs rather than raw follower counts.

**Dependency:** human-operated invitations, permitted research, an explicit relationship store and rate/consent controls.

## 6. Company Page and organization growth — P1, planned

Independent company entity with branding, tagline, assets, CTA, administrators, public materials, founder collaboration and separately planned editorial programs. Organization publishing and Page analytics require appropriate organization permissions, roles and verified API eligibility; never reuse member OAuth subject as Page authority.

**Dependency:** org roles, consent, organization URN, supported post/analytics endpoints, Page permissions and tested tenant isolation.

## 7. Personal branding and professional authority — P0, partially available

Explicit mission, differentiating expertise, audience, evidence of achievements, preferred voice, 3–5 content pillars, portfolio and proof-of-work alignment. Build role-sensitive narratives and collaboration plans without fabricating credentials or popularity. Review contradictions across existing claims and measure recognition via actual opportunities.

**Existing:** profile and creator research can inform a strategy. **Missing:** versioned brand strategy, voice controls, sustained milestones and attribution.

## 8. Job hunting and career development — P1, planned

Target roles/companies, collect real job URLs and requirements, factual fit/gap analysis, resumes/cover letters, verified applications and interview follow-ups. Suggested statuses: saved → applied → interviewing → rejected/offered → accepted/withdrawn, with user-entered timestamps and source evidence. An existing resume editor does not constitute a job search engine. Owner applies to vacancies manually unless an explicitly approved provider contract exists.

**Dependency:** employment-opportunity and application models, legitimate vacancy source, secure documents, notifications, manual handoff.

## 9. Outreach, messaging and relationship development — P1, planned

Research shared professional context, create respectful personalized connection messages and responses, summarize user-provided conversations, queue human-reviewed introductions, record meetings and next steps, and honor do-not-contact requests. Separate recruiter, mentor, founder, customer, investor and collaboration intents.

**Dependency:** consent and source records, private message handling, human-send checkpoints, no generalized LinkedIn DM API assumptions.

## 10. Leads, customers, partnerships and business development — P2, planned

Lightweight CRM: Discovered → Researching → Contacted → Replied → Qualified → Meeting → Proposal → Won/Lost, with Do Not Contact. Record verified needs, proof of contact, proposals, collaboration outcomes and conversion denominator—not speculative lead value or automated unsolicited DM delivery.

**Dependency:** relationship record, state history, tenant isolation and consent metadata.

## 11. Newsletters, long-form publishing, events and communities — P2, planned

Plan and author original long-form material, editorial calendars and newsletter editions; discover eligible professional events/communities via permitted sources; prepare attendance, discussion questions and follow-ups. Post distribution, newsletter publishing, event hosting and group moderation are distinct controlled operations.

**Dependency:** event/editorial content models, approved publication eligibility, owner participation and available metrics.

## 12. Analytics, audits and measurable growth — P0, planned

Separate visibility (profile/search visits, reach/impressions), audience (relevant followers), engagement (reactions, thoughtful comments, reposts) and opportunities (recruiter replies, interviews, meetings, contracts). Every observation requires account, period, source, metric definition, numerator/denominator and limitations. Import authorized LinkedIn native Excel/CSV reports or eligible API data; calculate time-series and comparisons without creating invented metrics. Add exportable history and a reproducible report.

**First complete analytics slice:** owner-provided analytics import → validated metrics schema → tenant persistence → baseline → content/period comparisons → evidence-driven recommendation.

## 13. Brand reputation, credibility and account health — P1, planned

Audit out-of-date claims, contact hygiene, impersonation reports, privacy and authorization, public credibility and harmful/unprofessional engagement patterns. A recommendation is not proof that privacy settings changed; account health cannot be inferred from private LinkedIn data without authorization.

**Dependency:** verified claims register, owner-submitted alerts, security checklist and safe account-state reviews.

## 14. Continuous growth strategy and experimentation — P1, planned

Experiments require test hypothesis, target audience, *one controlled change*, baseline, metric, period, observed result and limitations. Candidate tests: headline, content pillar, hook, format, CTA, posting pattern or Featured item. Record decisions and whether measured differences are credible; do not present correlation as certain causation.

**Dependency:** real analytics, versioned experiment records, owner approval, evaluation and time windows.

## 15. What is technically executable? — cross-cutting boundary

| Operation | Route classification | Reality |
| --- | --- | --- |
| Saved account/profile management and selected edits | Owner-approved local workflows | Narrow current behavior; external controls can change |
| User-supplied creator intelligence | Read-only, assisted | Implemented subset; no autonomous scraping |
| Draft lifecycle | Internal app | Implemented subset |
| Member text-post publishing | Official API + explicit owner consent | Provider-backed; deployment requires valid app/OAuth |
| Owned post read/edit/delete, media and scheduling | Official API only where granted | Not wired |
| Company Page roles, publishing, analytics | Organization permissions | Not wired |
| Personal analytics | Eligible API or owner export | Not wired |
| Profile revisions outside existing supported actions | Assisted/owner-operated | Not wired |
| Competitor private analytics and undocumented follower history | Unavailable | Never guess |
| Automated invitations, mass DMs, artificial engagement, arbitrary applications | Prohibited/unsupported as a generic automation feature | Must remain absent |

Do not repurpose browser automation as a loophole for unsupported API capabilities. Each external action needs permissions, scope, approval, receipts and tests.

## 16. Five complete user journeys — design contracts, not executable macro flows

1. **Improve my profile:** source/evidence intake → 20-section rubric → creator positioning comparison → section-level proposal → explicit human review → verified edits → measured follow-up.
2. **Grow my professional audience:** audience and brand definition → legitimate niche research → original editorial planning → authorized posts and owner interactions → real analytics → next experiment.
3. **Find a better job:** legitimate opportunity source → qualifications/gap analysis → factual resume and profile preparation → owner-applied vacancies → tracked interviews/outcomes.
4. **Grow my company or brand:** organization audit/roles → permitted competitor comparison → founder and Page positioning → company content/relationships → measured leads.
5. **Build valuable relationships:** high-fit individuals → sourced context → thoughtfully drafted owner-delivered messages → follow-up log → documented collaborations.

No multi-stage journey should have a single misleading "Run all" button before every stage's evidence, permissions and manual checkpoints are implemented and proven.

## 17. Delivery priority and acceptance sequencing

| Priority | Modules | Concrete integration gates |
| --- | --- | --- |
| P0 | Profile, competitor intelligence, branding, editorial, analytics | Evidence schema, section coverage, owner review, eligible provider actions, baseline/import, no fabricated signals |
| P1 | Company Page, jobs, outreach, engagement, networking, credibility, experiments | Independent owner/organization roles, durable lifecycle, manual delivery where required, approval, source checks |
| P2 | Leads CRM, newsletter/events/community, multi-account reporting | Scoped records, consent/retention, authorized publishing and measured outcomes |

**Dependency order:** source/evidence and account goals → profile/creator models → content workflow → analytics baseline → controlled experiment loop → separate organization/jobs/outreach lifecycles → CRM and reporting.

**Definition of implementation for every module:**
- Registered user-facing workflow with working entry point and no dead controls.
- Defined source data, validation, tenant/role ownership and retention.
- Concrete input/output contracts, explicit mutations, approvals and durable audit receipts.
- Usable empty/loading/error states and a realistic mobile layout.
- Positive, negative, permission, conflict and provider-failure tests.
- Integration/Dogfood exercise and independent review.
- No "complete" label until these gates pass.

## Repository map

- \`/growth\`: interactive outcome-driven capability map, status and navigation to the subset already available.
- \`apps/frontend/components/automate/linkedin-growth-capabilities.ts\`: machine-readable module scope, prerequisites and target actions; intentionally not imported by SocialWorkflow as executable handlers.
- \`apps/frontend/components/automate/linkedin-growth-hub.tsx\`: UI for the catalog.
- \`apps/backend/docs/linkedin-workflow-implementation-plan.md\`: existing separate blueprint contracts.
- \`apps/backend/src/core/linkedin-creator-research.ts\`: implemented user-evidence research slice.
- \`apps/backend/src/core/linkedin-editorial.ts\`: implemented private editorial slice and publication state.
- \`apps/backend/src/core/linkedin-publisher.ts\`: API-authorized member text publishing, conditional on credentials/consent.
- \`apps/backend/tests/linkedin-growth-capabilities.test.ts\` and \`apps/backend/tests/browser.integration.test.ts\`: invariant and UI/navigation regression proof.

All implemented-status claims must be backed by inspected production routes and actual tests. The delivery map is a shared contract, not a replacement for engineering discovery at each new vertical slice.


## Template authoring, account binding, and presentation contract

- The template library exposes human-readable objectives, capabilities, and a workflow step outline. It does not display or link to generated YAML or low-level data bindings. The execution compiler and structured receipts remain internal application contracts.
- Browsing and **Load on artboard** are allowed before any social account is connected. Loading a supported template persists an editable workflow record; it is not an external action. Planned templates without registered execution contracts cannot be loaded as runnable workflows.
- Starting a LinkedIn **artboard/template** run requires the specific saved account ID, matching profile, and completed connector verification/sync. Frontend controls are disabled until then; Fastify independently calls \`ConnectorService.requireConnected\` so API requests cannot use a handle to bypass the template gate. The existing standalone handle-only audit/login compatibility route (without a supplied or saved graph) remains separate and is not a synced-account execution claim.
- A reusable saved template is **not** permanently authenticated to the account that loaded it. Every execution binds to the currently selected account ID and exact profile URL. Selecting a different LinkedIn identity resets the current workflow selection. User-facing readiness text shows the intended account.
- Do not assume the LinkedIn web UI, DOM, selectors, permissions, or sign-in controls are permanently stable. Each browser run must re-observe the live page, require approval, and verify the final result. A stored template is not evidence of present-day LinkedIn compatibility.
- Existing internal YAML endpoints remain available for compiler tests, auditing, and trusted engineering tools. They must not appear as raw user-facing template previews or "View YAML" shortcuts.
- Tests: load without a connection; inspect the artboard; reject unverified or wrong-account execution; verify planned providers cannot be loaded; preserve research/editorial result visibility without exposing internal receipts.
