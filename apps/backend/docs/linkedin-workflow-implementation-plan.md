# LinkedIn workflow implementation contract

This document is the **complete product specification and phased engineering plan**, not a statement
that each blueprint already runs. The owner-facing module coverage and priorities are tracked
separately in [linkedin-growth-capability-map.md](./linkedin-growth-capability-map.md). The
SocialWorkflow engine executes nine registered profile audit/edit actions. Separately, Creator
Research is a completed five-stage, read-only pipeline with a validated input form, local or
tenant-scoped persistence, source digests, API endpoints and a downloadable YAML execution receipt.
The ProfilePlanner remains a separate six-stage, manual, read-only optimization plan.

## Verified architectural limits

- The current SocialWorkflow compiler accepts a linear graph with 4 to 24 steps, a single registered
  action, allowlisted step kinds, and typed local bindings.
- It cannot run arbitrary YAML operations. These blueprint operation names are **design contracts**,
  not registered runtime handlers.
- Competitor data must be user-supplied or obtained through permitted sources, with timestamps and
  provenance. Do not scrape LinkedIn pages through unauthorized automation.
- LinkedIn DMs, invitations, and job applications require the human owner to perform the final
  action unless an expressly authorized integration is available.
- Post create/read/update/delete must use the official API, proper member or organization
  permissions, eligible content formats, and read-back receipts. Do not masquerade browser clicks as
  an approved provider API.
- Never infer private competitor metrics, invent career achievements, or report a proposal as a
  published result.

## Acceptance criteria for each production pipeline

1. Declare input schema, evidence source, scope, and authorization before execution.
2. Register each stage as a real handler with durable typed output (or mark it human-operated).
3. Fail closed on missing data, permission, stale sources, unsupported provider actions, and
   rejected approval.
4. Preserve drafts and review history; require separate confirmation for destructive actions.
5. Emit source-linked artifacts, YAML/JSON execution receipts, and honest statuses (completed,
   awaiting-human, blocked, failed).
6. Test successful execution, missing input, denied permission, provider errors, replay/idempotency,
   and real user interaction.
7. Do not expose the template as executable until handler, tests, and integration checks have
   passed.

## Feature blueprints and stage contracts

The examples below are a **design-only YAML vocabulary**, deliberately distinct from the executable
`SocialWorkflow` and `SocialStep` schemas. The latter remain the only formats accepted by the
current compiler.

### Personal profile assessment

```yaml
apiVersion: 'utomator.dev/v1'
kind: 'LinkedInWorkflowBlueprint'
metadata:
  id: 'profile-audit'
  title: 'Personal profile assessment'
spec:
  platform: 'linkedin'
  execution: 'design-only'
  inputSchema: 'owner-export/v1'
  outputSchema: 'section-audit/v1'
  trigger: 'operator'
  steps:
    - id: 'ingest-owner-export'
      operation: 'ingest-owner-export'
      input: 'owner-export/v1'
      output: 'ingest-owner-export/v1'
      gate: 'human-review'
    - id: 'verify-claims'
      operation: 'verify-claims'
      input: 'ingest-owner-export/v1'
      output: 'verify-claims/v1'
      gate: 'source-validation'
    - id: 'score-each-section'
      operation: 'score-each-section'
      input: 'verify-claims/v1'
      output: 'score-each-section/v1'
      gate: 'source-validation'
    - id: 'prioritize-gaps'
      operation: 'prioritize-gaps'
      input: 'score-each-section/v1'
      output: 'prioritize-gaps/v1'
      gate: 'source-validation'
    - id: 'approve-recommendations'
      operation: 'approve-recommendations'
      input: 'prioritize-gaps/v1'
      output: 'approve-recommendations/v1'
      gate: 'human-review'
    - id: 'produce-revision-plan'
      operation: 'produce-revision-plan'
      input: 'approve-recommendations/v1'
      output: 'section-audit/v1'
      gate: 'source-validation'
```

### Individual profile section optimization

```yaml
apiVersion: 'utomator.dev/v1'
kind: 'LinkedInWorkflowBlueprint'
metadata:
  id: 'section-optimization'
  title: 'Individual profile section optimization'
spec:
  platform: 'linkedin'
  execution: 'design-only'
  inputSchema: 'profile-section/v1'
  outputSchema: 'approved-section-diff/v1'
  trigger: 'operator'
  steps:
    - id: 'select-section'
      operation: 'select-section'
      input: 'profile-section/v1'
      output: 'select-section/v1'
      gate: 'source-validation'
    - id: 'load-original-and-job-goal'
      operation: 'load-original-and-job-goal'
      input: 'select-section/v1'
      output: 'load-original-and-job-goal/v1'
      gate: 'source-validation'
    - id: 'identify-evidence-gaps'
      operation: 'identify-evidence-gaps'
      input: 'load-original-and-job-goal/v1'
      output: 'identify-evidence-gaps/v1'
      gate: 'source-validation'
    - id: 'draft-factual-revision'
      operation: 'draft-factual-revision'
      input: 'identify-evidence-gaps/v1'
      output: 'draft-factual-revision/v1'
      gate: 'source-validation'
    - id: 'compare-before-after'
      operation: 'compare-before-after'
      input: 'draft-factual-revision/v1'
      output: 'compare-before-after/v1'
      gate: 'source-validation'
    - id: 'approve-selected-change'
      operation: 'approve-selected-change'
      input: 'compare-before-after/v1'
      output: 'approved-section-diff/v1'
      gate: 'human-review'
```

### Creator and niche intelligence

```yaml
apiVersion: 'utomator.dev/v1'
kind: 'LinkedInWorkflowBlueprint'
metadata:
  id: 'creator-intelligence'
  title: 'Creator and niche intelligence'
spec:
  platform: 'linkedin'
  execution: 'design-only'
  inputSchema: 'permitted-public-sources/v1'
  outputSchema: 'creator-comparison/v1'
  trigger: 'operator'
  steps:
    - id: 'define-niche'
      operation: 'define-niche'
      input: 'permitted-public-sources/v1'
      output: 'define-niche/v1'
      gate: 'source-validation'
    - id: 'select-evidence-sources'
      operation: 'select-evidence-sources'
      input: 'define-niche/v1'
      output: 'select-evidence-sources/v1'
      gate: 'source-validation'
    - id: 'extract-public-positioning'
      operation: 'extract-public-positioning'
      input: 'select-evidence-sources/v1'
      output: 'extract-public-positioning/v1'
      gate: 'source-validation'
    - id: 'compare-content-pillars'
      operation: 'compare-content-pillars'
      input: 'extract-public-positioning/v1'
      output: 'compare-content-pillars/v1'
      gate: 'source-validation'
    - id: 'record-inference-confidence'
      operation: 'record-inference-confidence'
      input: 'compare-content-pillars/v1'
      output: 'record-inference-confidence/v1'
      gate: 'source-validation'
    - id: 'deliver-adaptable-tactics'
      operation: 'deliver-adaptable-tactics'
      input: 'record-inference-confidence/v1'
      output: 'creator-comparison/v1'
      gate: 'source-validation'
```

### Creator career and audience journey

```yaml
apiVersion: 'utomator.dev/v1'
kind: 'LinkedInWorkflowBlueprint'
metadata:
  id: 'journey-reconstruction'
  title: 'Creator career and audience journey'
spec:
  platform: 'linkedin'
  execution: 'design-only'
  inputSchema: 'dated-public-evidence/v1'
  outputSchema: 'growth-hypotheses/v1'
  trigger: 'operator'
  steps:
    - id: 'construct-dated-timeline'
      operation: 'construct-dated-timeline'
      input: 'dated-public-evidence/v1'
      output: 'construct-dated-timeline/v1'
      gate: 'source-validation'
    - id: 'mark-missing-history'
      operation: 'mark-missing-history'
      input: 'construct-dated-timeline/v1'
      output: 'mark-missing-history/v1'
      gate: 'source-validation'
    - id: 'compare-early-late-posts'
      operation: 'compare-early-late-posts'
      input: 'mark-missing-history/v1'
      output: 'compare-early-late-posts/v1'
      gate: 'source-validation'
    - id: 'tag-observed-vs-inferred'
      operation: 'tag-observed-vs-inferred'
      input: 'compare-early-late-posts/v1'
      output: 'tag-observed-vs-inferred/v1'
      gate: 'source-validation'
    - id: 'assess-transferability'
      operation: 'assess-transferability'
      input: 'tag-observed-vs-inferred/v1'
      output: 'assess-transferability/v1'
      gate: 'source-validation'
    - id: 'deliver-experiment-brief'
      operation: 'deliver-experiment-brief'
      input: 'assess-transferability/v1'
      output: 'growth-hypotheses/v1'
      gate: 'source-validation'
```

### LinkedIn post create read update delete

```yaml
apiVersion: 'utomator.dev/v1'
kind: 'LinkedInWorkflowBlueprint'
metadata:
  id: 'content-crud'
  title: 'LinkedIn post create read update delete'
spec:
  platform: 'linkedin'
  execution: 'design-only'
  inputSchema: 'owned-post-and-auth/v1'
  outputSchema: 'provider-post-receipt/v1'
  trigger: 'operator'
  steps:
    - id: 'authorize-owner-and-scope'
      operation: 'authorize-owner-and-scope'
      input: 'owned-post-and-auth/v1'
      output: 'authorize-owner-and-scope/v1'
      gate: 'human-review'
    - id: 'prepare-content-with-evidence'
      operation: 'prepare-content-with-evidence'
      input: 'authorize-owner-and-scope/v1'
      output: 'prepare-content-with-evidence/v1'
      gate: 'source-validation'
    - id: 'preview-and-approve'
      operation: 'preview-and-approve'
      input: 'prepare-content-with-evidence/v1'
      output: 'preview-and-approve/v1'
      gate: 'human-review'
    - id: 'call-permitted-posts-api'
      operation: 'call-permitted-posts-api'
      input: 'preview-and-approve/v1'
      output: 'call-permitted-posts-api/v1'
      gate: 'source-validation'
    - id: 'read-back-post-result'
      operation: 'read-back-post-result'
      input: 'call-permitted-posts-api/v1'
      output: 'read-back-post-result/v1'
      gate: 'source-validation'
    - id: 'archive-provider-receipt'
      operation: 'archive-provider-receipt'
      input: 'read-back-post-result/v1'
      output: 'provider-post-receipt/v1'
      gate: 'source-validation'
```

### Editorial calendar and repurposing

```yaml
apiVersion: 'utomator.dev/v1'
kind: 'LinkedInWorkflowBlueprint'
metadata:
  id: 'editorial-calendar'
  title: 'Editorial calendar and repurposing'
spec:
  platform: 'linkedin'
  execution: 'design-only'
  inputSchema: 'approved-ideas/v1'
  outputSchema: 'scheduled-content-plan/v1'
  trigger: 'operator'
  steps:
    - id: 'research-topic-evidence'
      operation: 'research-topic-evidence'
      input: 'approved-ideas/v1'
      output: 'research-topic-evidence/v1'
      gate: 'source-validation'
    - id: 'select-content-pillars'
      operation: 'select-content-pillars'
      input: 'research-topic-evidence/v1'
      output: 'select-content-pillars/v1'
      gate: 'source-validation'
    - id: 'generate-original-variants'
      operation: 'generate-original-variants'
      input: 'select-content-pillars/v1'
      output: 'generate-original-variants/v1'
      gate: 'source-validation'
    - id: 'check-claims-and-rights'
      operation: 'check-claims-and-rights'
      input: 'generate-original-variants/v1'
      output: 'check-claims-and-rights/v1'
      gate: 'human-review'
    - id: 'approve-time-slots'
      operation: 'approve-time-slots'
      input: 'check-claims-and-rights/v1'
      output: 'approve-time-slots/v1'
      gate: 'human-review'
    - id: 'queue-authorized-publication'
      operation: 'queue-authorized-publication'
      input: 'approve-time-slots/v1'
      output: 'scheduled-content-plan/v1'
      gate: 'source-validation'
```

### Comments and community participation

```yaml
apiVersion: 'utomator.dev/v1'
kind: 'LinkedInWorkflowBlueprint'
metadata:
  id: 'engagement'
  title: 'Comments and community participation'
spec:
  platform: 'linkedin'
  execution: 'design-only'
  inputSchema: 'owned-comments-or-export/v1'
  outputSchema: 'reviewed-reply-queue/v1'
  trigger: 'operator'
  steps:
    - id: 'load-permitted-conversations'
      operation: 'load-permitted-conversations'
      input: 'owned-comments-or-export/v1'
      output: 'load-permitted-conversations/v1'
      gate: 'source-validation'
    - id: 'identify-questions'
      operation: 'identify-questions'
      input: 'load-permitted-conversations/v1'
      output: 'identify-questions/v1'
      gate: 'source-validation'
    - id: 'draft-contextual-response'
      operation: 'draft-contextual-response'
      input: 'identify-questions/v1'
      output: 'draft-contextual-response/v1'
      gate: 'source-validation'
    - id: 'reject-spam-and-duplicates'
      operation: 'reject-spam-and-duplicates'
      input: 'draft-contextual-response/v1'
      output: 'reject-spam-and-duplicates/v1'
      gate: 'source-validation'
    - id: 'approve-replies'
      operation: 'approve-replies'
      input: 'reject-spam-and-duplicates/v1'
      output: 'approve-replies/v1'
      gate: 'human-review'
    - id: 'record-manual-or-authorized-actions'
      operation: 'record-manual-or-authorized-actions'
      input: 'approve-replies/v1'
      output: 'reviewed-reply-queue/v1'
      gate: 'human-review'
```

### Network and follower development

```yaml
apiVersion: 'utomator.dev/v1'
kind: 'LinkedInWorkflowBlueprint'
metadata:
  id: 'audience-growth'
  title: 'Network and follower development'
spec:
  platform: 'linkedin'
  execution: 'design-only'
  inputSchema: 'audience-goals/v1'
  outputSchema: 'relationship-priorities/v1'
  trigger: 'operator'
  steps:
    - id: 'define-relevant-audience'
      operation: 'define-relevant-audience'
      input: 'audience-goals/v1'
      output: 'define-relevant-audience/v1'
      gate: 'source-validation'
    - id: 'review-permitted-network-context'
      operation: 'review-permitted-network-context'
      input: 'define-relevant-audience/v1'
      output: 'review-permitted-network-context/v1'
      gate: 'source-validation'
    - id: 'identify-shared-relevance'
      operation: 'identify-shared-relevance'
      input: 'review-permitted-network-context/v1'
      output: 'identify-shared-relevance/v1'
      gate: 'source-validation'
    - id: 'draft-personalized-introduction'
      operation: 'draft-personalized-introduction'
      input: 'identify-shared-relevance/v1'
      output: 'draft-personalized-introduction/v1'
      gate: 'source-validation'
    - id: 'owner-manual-outreach'
      operation: 'owner-manual-outreach'
      input: 'draft-personalized-introduction/v1'
      output: 'owner-manual-outreach/v1'
      gate: 'human-review'
    - id: 'evaluate-relationship-quality'
      operation: 'evaluate-relationship-quality'
      input: 'owner-manual-outreach/v1'
      output: 'relationship-priorities/v1'
      gate: 'source-validation'
```

### Company Page optimization and growth

```yaml
apiVersion: 'utomator.dev/v1'
kind: 'LinkedInWorkflowBlueprint'
metadata:
  id: 'company-page'
  title: 'Company Page optimization and growth'
spec:
  platform: 'linkedin'
  execution: 'design-only'
  inputSchema: 'company-admin-export/v1'
  outputSchema: 'page-growth-plan/v1'
  trigger: 'operator'
  steps:
    - id: 'check-admin-permissions'
      operation: 'check-admin-permissions'
      input: 'company-admin-export/v1'
      output: 'check-admin-permissions/v1'
      gate: 'human-review'
    - id: 'audit-company-profile'
      operation: 'audit-company-profile'
      input: 'check-admin-permissions/v1'
      output: 'audit-company-profile/v1'
      gate: 'source-validation'
    - id: 'benchmark-authorized-competitors'
      operation: 'benchmark-authorized-competitors'
      input: 'audit-company-profile/v1'
      output: 'benchmark-authorized-competitors/v1'
      gate: 'source-validation'
    - id: 'align-founder-and-page-content'
      operation: 'align-founder-and-page-content'
      input: 'benchmark-authorized-competitors/v1'
      output: 'align-founder-and-page-content/v1'
      gate: 'source-validation'
    - id: 'approve-page-actions'
      operation: 'approve-page-actions'
      input: 'align-founder-and-page-content/v1'
      output: 'approve-page-actions/v1'
      gate: 'human-review'
    - id: 'track-leads-and-reach'
      operation: 'track-leads-and-reach'
      input: 'approve-page-actions/v1'
      output: 'page-growth-plan/v1'
      gate: 'source-validation'
```

### Professional positioning and authority

```yaml
apiVersion: 'utomator.dev/v1'
kind: 'LinkedInWorkflowBlueprint'
metadata:
  id: 'personal-brand'
  title: 'Professional positioning and authority'
spec:
  platform: 'linkedin'
  execution: 'design-only'
  inputSchema: 'verified-career-evidence/v1'
  outputSchema: 'brand-positioning/v1'
  trigger: 'operator'
  steps:
    - id: 'select-professional-goal'
      operation: 'select-professional-goal'
      input: 'verified-career-evidence/v1'
      output: 'select-professional-goal/v1'
      gate: 'source-validation'
    - id: 'extract-proof-of-work'
      operation: 'extract-proof-of-work'
      input: 'select-professional-goal/v1'
      output: 'extract-proof-of-work/v1'
      gate: 'source-validation'
    - id: 'define-distinctive-expertise'
      operation: 'define-distinctive-expertise'
      input: 'extract-proof-of-work/v1'
      output: 'define-distinctive-expertise/v1'
      gate: 'source-validation'
    - id: 'write-audience-positioning'
      operation: 'write-audience-positioning'
      input: 'define-distinctive-expertise/v1'
      output: 'write-audience-positioning/v1'
      gate: 'source-validation'
    - id: 'approve-three-to-five-pillars'
      operation: 'approve-three-to-five-pillars'
      input: 'write-audience-positioning/v1'
      output: 'approve-three-to-five-pillars/v1'
      gate: 'human-review'
    - id: 'produce-portfolio-roadmap'
      operation: 'produce-portfolio-roadmap'
      input: 'approve-three-to-five-pillars/v1'
      output: 'brand-positioning/v1'
      gate: 'source-validation'
```

### Job search and application tracking

```yaml
apiVersion: 'utomator.dev/v1'
kind: 'LinkedInWorkflowBlueprint'
metadata:
  id: 'jobs'
  title: 'Job search and application tracking'
spec:
  platform: 'linkedin'
  execution: 'design-only'
  inputSchema: 'job-links-and-resume/v1'
  outputSchema: 'application-pipeline/v1'
  trigger: 'operator'
  steps:
    - id: 'capture-verified-vacancies'
      operation: 'capture-verified-vacancies'
      input: 'job-links-and-resume/v1'
      output: 'capture-verified-vacancies/v1'
      gate: 'source-validation'
    - id: 'match-eligibility'
      operation: 'match-eligibility'
      input: 'capture-verified-vacancies/v1'
      output: 'match-eligibility/v1'
      gate: 'source-validation'
    - id: 'identify-evidence-and-skills-gaps'
      operation: 'identify-evidence-and-skills-gaps'
      input: 'match-eligibility/v1'
      output: 'identify-evidence-and-skills-gaps/v1'
      gate: 'source-validation'
    - id: 'tailor-factual-documents'
      operation: 'tailor-factual-documents'
      input: 'identify-evidence-and-skills-gaps/v1'
      output: 'tailor-factual-documents/v1'
      gate: 'source-validation'
    - id: 'owner-submits-application'
      operation: 'owner-submits-application'
      input: 'tailor-factual-documents/v1'
      output: 'owner-submits-application/v1'
      gate: 'human-review'
    - id: 'record-status-and-followup'
      operation: 'record-status-and-followup'
      input: 'owner-submits-application/v1'
      output: 'application-pipeline/v1'
      gate: 'source-validation'
```

### Professional relationship and DM assistance

```yaml
apiVersion: 'utomator.dev/v1'
kind: 'LinkedInWorkflowBlueprint'
metadata:
  id: 'outreach'
  title: 'Professional relationship and DM assistance'
spec:
  platform: 'linkedin'
  execution: 'design-only'
  inputSchema: 'contact-context-and-consent/v1'
  outputSchema: 'approved-dm-drafts/v1'
  trigger: 'operator'
  steps:
    - id: 'select-purpose-and-recipient'
      operation: 'select-purpose-and-recipient'
      input: 'contact-context-and-consent/v1'
      output: 'select-purpose-and-recipient/v1'
      gate: 'source-validation'
    - id: 'verify-contact-context'
      operation: 'verify-contact-context'
      input: 'select-purpose-and-recipient/v1'
      output: 'verify-contact-context/v1'
      gate: 'source-validation'
    - id: 'draft-one-person-message'
      operation: 'draft-one-person-message'
      input: 'verify-contact-context/v1'
      output: 'draft-one-person-message/v1'
      gate: 'source-validation'
    - id: 'review-consent-and-frequency'
      operation: 'review-consent-and-frequency'
      input: 'draft-one-person-message/v1'
      output: 'review-consent-and-frequency/v1'
      gate: 'human-review'
    - id: 'owner-sends-manually'
      operation: 'owner-sends-manually'
      input: 'review-consent-and-frequency/v1'
      output: 'owner-sends-manually/v1'
      gate: 'human-review'
    - id: 'track-response-with-permission'
      operation: 'track-response-with-permission'
      input: 'owner-sends-manually/v1'
      output: 'approved-dm-drafts/v1'
      gate: 'human-review'
```

### Leads partnerships and CRM

```yaml
apiVersion: 'utomator.dev/v1'
kind: 'LinkedInWorkflowBlueprint'
metadata:
  id: 'leads'
  title: 'Leads partnerships and CRM'
spec:
  platform: 'linkedin'
  execution: 'design-only'
  inputSchema: 'consented-prospect-context/v1'
  outputSchema: 'qualified-opportunity/v1'
  trigger: 'operator'
  steps:
    - id: 'define-ideal-customer'
      operation: 'define-ideal-customer'
      input: 'consented-prospect-context/v1'
      output: 'define-ideal-customer/v1'
      gate: 'source-validation'
    - id: 'review-prospect-facts'
      operation: 'review-prospect-facts'
      input: 'define-ideal-customer/v1'
      output: 'review-prospect-facts/v1'
      gate: 'source-validation'
    - id: 'qualify-business-problem'
      operation: 'qualify-business-problem'
      input: 'review-prospect-facts/v1'
      output: 'qualify-business-problem/v1'
      gate: 'source-validation'
    - id: 'draft-nonspam-proposal'
      operation: 'draft-nonspam-proposal'
      input: 'qualify-business-problem/v1'
      output: 'draft-nonspam-proposal/v1'
      gate: 'source-validation'
    - id: 'manual-approved-contact'
      operation: 'manual-approved-contact'
      input: 'draft-nonspam-proposal/v1'
      output: 'manual-approved-contact/v1'
      gate: 'human-review'
    - id: 'track-commercial-outcome'
      operation: 'track-commercial-outcome'
      input: 'manual-approved-contact/v1'
      output: 'qualified-opportunity/v1'
      gate: 'source-validation'
```

### Newsletter event and community programs

```yaml
apiVersion: 'utomator.dev/v1'
kind: 'LinkedInWorkflowBlueprint'
metadata:
  id: 'newsletter-events'
  title: 'Newsletter event and community programs'
spec:
  platform: 'linkedin'
  execution: 'design-only'
  inputSchema: 'approved-topics-and-events/v1'
  outputSchema: 'editorial-and-event-plan/v1'
  trigger: 'operator'
  steps:
    - id: 'identify-relevant-community-needs'
      operation: 'identify-relevant-community-needs'
      input: 'approved-topics-and-events/v1'
      output: 'identify-relevant-community-needs/v1'
      gate: 'source-validation'
    - id: 'draft-verified-article-or-event'
      operation: 'draft-verified-article-or-event'
      input: 'identify-relevant-community-needs/v1'
      output: 'draft-verified-article-or-event/v1'
      gate: 'source-validation'
    - id: 'review-rights-and-participants'
      operation: 'review-rights-and-participants'
      input: 'draft-verified-article-or-event/v1'
      output: 'review-rights-and-participants/v1'
      gate: 'human-review'
    - id: 'approve-publication'
      operation: 'approve-publication'
      input: 'review-rights-and-participants/v1'
      output: 'approve-publication/v1'
      gate: 'human-review'
    - id: 'publish-through-permitted-channel'
      operation: 'publish-through-permitted-channel'
      input: 'approve-publication/v1'
      output: 'publish-through-permitted-channel/v1'
      gate: 'source-validation'
    - id: 'track-conversations'
      operation: 'track-conversations'
      input: 'publish-through-permitted-channel/v1'
      output: 'editorial-and-event-plan/v1'
      gate: 'source-validation'
```

### Personal and company growth analytics

```yaml
apiVersion: 'utomator.dev/v1'
kind: 'LinkedInWorkflowBlueprint'
metadata:
  id: 'analytics'
  title: 'Personal and company growth analytics'
spec:
  platform: 'linkedin'
  execution: 'design-only'
  inputSchema: 'authorized-metrics-export/v1'
  outputSchema: 'growth-analysis/v1'
  trigger: 'operator'
  steps:
    - id: 'validate-source-and-time-window'
      operation: 'validate-source-and-time-window'
      input: 'authorized-metrics-export/v1'
      output: 'validate-source-and-time-window/v1'
      gate: 'source-validation'
    - id: 'record-baseline'
      operation: 'record-baseline'
      input: 'validate-source-and-time-window/v1'
      output: 'record-baseline/v1'
      gate: 'source-validation'
    - id: 'calculate-transparent-metrics'
      operation: 'calculate-transparent-metrics'
      input: 'record-baseline/v1'
      output: 'calculate-transparent-metrics/v1'
      gate: 'source-validation'
    - id: 'compare-segments-and-periods'
      operation: 'compare-segments-and-periods'
      input: 'calculate-transparent-metrics/v1'
      output: 'compare-segments-and-periods/v1'
      gate: 'source-validation'
    - id: 'identify-bias-and-outliers'
      operation: 'identify-bias-and-outliers'
      input: 'compare-segments-and-periods/v1'
      output: 'identify-bias-and-outliers/v1'
      gate: 'source-validation'
    - id: 'recommend-measurable-experiment'
      operation: 'recommend-measurable-experiment'
      input: 'identify-bias-and-outliers/v1'
      output: 'growth-analysis/v1'
      gate: 'source-validation'
```

### Account credibility and reputation

```yaml
apiVersion: 'utomator.dev/v1'
kind: 'LinkedInWorkflowBlueprint'
metadata:
  id: 'reputation'
  title: 'Account credibility and reputation'
spec:
  platform: 'linkedin'
  execution: 'design-only'
  inputSchema: 'owner-evidence-and-public-mentions/v1'
  outputSchema: 'credibility-review/v1'
  trigger: 'operator'
  steps:
    - id: 'review-privacy-and-identity'
      operation: 'review-privacy-and-identity'
      input: 'owner-evidence-and-public-mentions/v1'
      output: 'review-privacy-and-identity/v1'
      gate: 'source-validation'
    - id: 'flag-unsupported-claims'
      operation: 'flag-unsupported-claims'
      input: 'review-privacy-and-identity/v1'
      output: 'flag-unsupported-claims/v1'
      gate: 'source-validation'
    - id: 'detect-brand-inconsistencies'
      operation: 'detect-brand-inconsistencies'
      input: 'flag-unsupported-claims/v1'
      output: 'detect-brand-inconsistencies/v1'
      gate: 'source-validation'
    - id: 'prioritize-high-risk-items'
      operation: 'prioritize-high-risk-items'
      input: 'detect-brand-inconsistencies/v1'
      output: 'prioritize-high-risk-items/v1'
      gate: 'source-validation'
    - id: 'owner-approves-corrections'
      operation: 'owner-approves-corrections'
      input: 'prioritize-high-risk-items/v1'
      output: 'owner-approves-corrections/v1'
      gate: 'human-review'
    - id: 'archive-updated-evidence'
      operation: 'archive-updated-evidence'
      input: 'owner-approves-corrections/v1'
      output: 'credibility-review/v1'
      gate: 'source-validation'
```

### Iterative LinkedIn growth experiments

```yaml
apiVersion: 'utomator.dev/v1'
kind: 'LinkedInWorkflowBlueprint'
metadata:
  id: 'experimentation'
  title: 'Iterative LinkedIn growth experiments'
spec:
  platform: 'linkedin'
  execution: 'design-only'
  inputSchema: 'baseline-and-hypothesis/v1'
  outputSchema: 'experiment-decision/v1'
  trigger: 'operator'
  steps:
    - id: 'select-single-variable'
      operation: 'select-single-variable'
      input: 'baseline-and-hypothesis/v1'
      output: 'select-single-variable/v1'
      gate: 'source-validation'
    - id: 'define-target-metric'
      operation: 'define-target-metric'
      input: 'select-single-variable/v1'
      output: 'define-target-metric/v1'
      gate: 'source-validation'
    - id: 'record-baseline-and-window'
      operation: 'record-baseline-and-window'
      input: 'define-target-metric/v1'
      output: 'record-baseline-and-window/v1'
      gate: 'source-validation'
    - id: 'run-approved-change'
      operation: 'run-approved-change'
      input: 'record-baseline-and-window/v1'
      output: 'run-approved-change/v1'
      gate: 'human-review'
    - id: 'analyze-observed-delta'
      operation: 'analyze-observed-delta'
      input: 'run-approved-change/v1'
      output: 'analyze-observed-delta/v1'
      gate: 'source-validation'
    - id: 'choose-next-test'
      operation: 'choose-next-test'
      input: 'analyze-observed-delta/v1'
      output: 'experiment-decision/v1'
      gate: 'source-validation'
```

## Implementation graph

P0: preserve existing profile edit behavior; replace generic LinkedIn templates with distinct
validated evidence-bound graphs; expose graph steps in template browser; keep full-profile planner
separately.

P1: ingest owner exports and permitted source material; deliver section-scoring, competitor evidence
comparison, brand positioning, content drafts, editorial calendar, and transparent analytics.

P2: implement provider OAuth scopes and official Posts API; add durable queue, retries, idempotency,
delete confirmation, and publishing receipts. Build Company Page and content management only with
appropriate roles.

P3: implement owner-operated job application tracker, outreach drafts, CRM, events/newsletters and
experiments; permit platform mutations only when a supported integration and explicit human approval
exist.

## Review and regression protections

Preserve existing X workflows, portfolio pages, account ownership validation, authenticated browser
workflow tests, revision snapshots, and manual ProfilePlanner behavior. Do not purge user-created
workflows as a side effect of replacing immutable starter templates. Migration of old locally saved
starter plans must be explicit and reversible.

## External policy sources

- https://www.linkedin.com/help/linkedin/answer/a1340567/automated-activity-on-linkedin
- https://www.linkedin.com/help/linkedin/answer/a1341387/prohibition-of-scraping-software
- https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api

## First integrated vertical slice: creator and niche research

- Route: `/research`, with a dedicated form for niche, objective, own headline, and up to five
  creator profiles with up to five user-supplied LinkedIn post excerpts each.
- Endpoints: `POST /linkedin/research`, `GET /linkedin/research`, `GET /linkedin/research/:id`,
  `GET /linkedin/research/:id/yaml`.
- Executed stages: validate submitted sources → extract observed topics → compare positioning →
  propose measured experiments → produce source-linked report.
- Storage: `linkedin-research` tenant-scoped document namespace in hosted mode and local `.runtime`
  files in standalone mode.
- Constraints: no live LinkedIn fetch, scraping, inferred follower metrics, automatic publishing, or
  automatic outreach. A matching URL format is not proof that the submitted excerpt is authentic;
  users must verify their evidence.
- Tests: pure analysis, invalid inputs, persistence/readback, API, and browser form → API →
  YAML/reload integration.

## Integrated vertical slice: editorial draft lifecycle

This work implements **internal post draft management**, not LinkedIn publishing. Drafts are bound
to a saved LinkedIn account in the tenant's Account Studio, without requiring an active browser
connection.

- Page: \`/editorial\`, with account selection, optional source-linked Creator Research, factual
  post authoring, saved drafts, explicit review and archival.
- Routes: \`GET/POST /linkedin/drafts\`, \`GET/PUT /linkedin/drafts/:id\`, \`POST
  /linkedin/drafts/:id/transition\`, and \`GET /linkedin/drafts/:id/yaml\`.
- States: draft → approved → reopened draft, with archive, restore and confirmed soft-delete.
  Editing approved text invalidates prior approval.
- Inputs: account ID verified against the currently authenticated owner's saved LinkedIn profiles;
  goal, content pillar, original post body, optional source URLs and selected existing research run
  ID.
- Provenance: when a research run is supplied, every associated source URL must appear in that saved
  report. A valid submitted URL alone does **not** certify the underlying claims.
- Persistence: \`linkedin-drafts\` in the tenant-scoped document store, or restrictive local runtime
  files in the standalone workspace. Writes use an expected version to reject stale revisions.
- Receipts: each state transition appends the version, event, timestamp and content SHA-256 digest
  to the draft history, retrievable as a YAML receipt explicitly marked \`externalPublishing:
  "not-performed"\`.
- Safety: no automatic posts, scraping, invitations, connection requests or DMs. Internal approval
  never asserts external LinkedIn publication.
- Verification: pure local lifecycle tests, source and ownership validation, Fastify route
  contracts, Next.js proxy allowlists and browser form → persisted API → YAML → reload checks.

## Integrated vertical slice: explicit OAuth member publishing (provider-backed)

**Scope:** text-only, individually confirmed, API-authorized organic posts by the consented LinkedIn
member. This is not an account-growth bot or a promise of Company Page, DMs, jobs, or unrestricted
member-post retrieval.

- LinkedIn permissions requested during three-legged OAuth: \`openid profile w_member_social\`. The
  application must have corresponding LinkedIn Developer products enabled and an exact registered
  HTTPS callback. The registered callback is \`/api/linkedin/oauth/callback\` behind a secure
  reverse proxy.
- Server-only configuration: \`LINKEDIN_CLIENT_ID\`, \`LINKEDIN_CLIENT_SECRET\`,
  \`LINKEDIN_REDIRECT_URI\`, \`LINKEDIN_TOKEN_ENCRYPTION_KEY\` (32 random bytes, hex), and
  \`LINKEDIN_API_VERSION\` (default October 2026: \`202610\`).
- User flow: choose saved LinkedIn account → initiate OAuth with random single-use state (10-minute
  expiry) → exchange code on the server → resolve consented LinkedIn member via OIDC userinfo →
  encrypt credential at rest under the authenticated tenant's document namespace → review the
  displayed member subject → explicitly confirm publishing an approved, unchanged draft.
- \`POST /linkedin/oauth/start\`, \`GET /linkedin/oauth/status\`, \`GET /linkedin/oauth/callback\`,
  \`POST /linkedin/oauth/disconnect\`, and \`POST /linkedin/drafts/:id/publish\`.
- The publisher sends one HTTPS \`POST /rest/posts\` with the fixed LinkedIn API origin, author from
  the consented subject, original reviewed body, \`lifecycleState=PUBLISHED\`, and required Rest.li
  version headers. A 201 result is considered confirmed only when \`x-restli-id\` contains a
  recognized share/UGC post URN.
- In-flight publication is claimed with a versioned database update _before_ the provider call.
  Duplicate submission, stale approvals, unapproved drafts, and automatic retry are forbidden.
  Rejected attempts are recorded as \`publish-failed\`. Timeouts, missing post ID, unexpected
  responses, or interrupted processes remain \`publication-uncertain\` or \`publishing\` and require
  reconciliation, not blind resubmission.
- Source code never logs or returns OAuth access tokens; tokens are encrypted using AES-256-GCM and
  stored in the tenant-scoped SQL document store. Disconnect removes the stored local grant (it does
  not claim to revoke the grant at LinkedIn).
- UI distinguishes internal drafting/approval, confirmed publication with a provider URN, and
  uncertain states.
- Future separate modules: LinkedIn media uploads; post reads, edits and deletion (may require
  restricted \`r_member_social\` and API-product approval); Company Pages with admin-role
  authorization; jobs; voluntary and compliant outreach; analytics.
- Provider integration tests must exercise OAuth state replay refusal, encrypted credentials, actual
  request schema/headers against a deterministic test transport, explicit confirmation, rejection,
  idempotency, and ambiguous delivery. **Tests against a fixture are not evidence of a live LinkedIn
  production grant or publication.**
- Never request access tokens in chat or add them to repo fixtures, logs or .env.example.

Provider references:

- https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow
- https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2
- https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api
- https://learn.microsoft.com/en-us/linkedin/marketing/versioning
