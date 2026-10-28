# YAML-first social-presence workflow architecture

## P3: first full-profile planning workflow

The LinkedIn **Full profile optimization** template now has a separate, read-only
six-stage planning path. It uses the existing portfolio owner evidence; it does
not scrape LinkedIn, run an LLM, or execute provider mutations.

1. `context` loads current portfolio and résumé declarations through
   `loadOwnerContext()`, without evaluating arbitrary source code.
2. `assessment` records available evidence and checks whether a previous
   LinkedIn audit supplied an observed headline for this exact account.
   Missing live observations remain explicitly unverified.
3. `proposals` prepares deterministic source-linked drafts for available
   headline, About, experience and Featured fields. It never invents metrics,
   employers or employment dates.
4. `approval` requires a separate explicit operator decision.
5. `selection` accepts only unique IDs of proposed changes after approval.
6. `report` records precisely what the operator selected, with
   `planningOnly=true`, `websiteActionsExecuted=false` and
   `modelConnected=false`.

Each run is stored as a local private JSON record under
`.runtime/profile-plans`, with a trusted YAML workflow manifest and six
stage YAML definitions. Saved record transitions survive a server restart.
The current version is a manual evidence-to-report planning pipeline, not
the general multi-action browser runner. The YAML documents describe
allowlisted planning steps; they do not authorize arbitrary commands or social
site mutations.

API endpoints (local only, routed by the existing same-origin proxy):

- `POST /profile-plans`: start evidence assessment and request approval;
- `GET /profile-plans/:id`: inspect the persisted plan and stage outputs;
- `POST /profile-plans/:id/decision`: `{ "approved": true|false }`;
- `POST /profile-plans/:id/select`: `{ "selectedIds": ["headline", ...] }` to
  finalize a selected, approved report.

**Important limitations:** LinkedIn services and other fields without
reliable portfolio evidence are not fabricated. The provider's current profile
must be independently inspected before any future mutation. These
reports are not proof of live profile optimization or an AI-generated
recommendation.


Status: **incremental implementation**. Version-pinned authored YAML step
definitions, an allowlisted compiler, typed local-step handoffs, immutable
per-run YAML and output snapshots, and restricted loopback endpoints exist.
The accepted YAML is intentionally a *restricted, schema-validated mapping
dialect*, not a general YAML processor or arbitrary script runner.
General-purpose expressions, branching, multi-action orchestration, durable
scheduling, Instagram integration, and AI control remain **unimplemented**.

## Repository findings (2026-10-26)

- The root files `about-form.yaml`, `edit-intro.yaml`, `profile-full.yaml`, `experience-entries.yaml`, and related files are recorded browser accessibility trees. They describe observed UI state and can be used for evidence, test fixtures, and locator candidates. They are **not** existing runnable YAML programs.
- `src/core/workflow-plan.ts` currently validates one platform, one action, a linear step list and connections.
- `src/core/runner.ts` executes predefined, audited Playwright action handlers in `src/workflows/execute.ts`. It can pause at safe step boundaries and records JSONL run events.
- `src/core/workflow-store.ts` retains the legacy platform/action API. `src/core/workflow-registry.ts` stores independent workflow IDs, one immutable snapshot per revision, optimistic revision checks, and idempotent import of the legacy files. It is local single-owner file persistence, not cloud multi-tenant authentication.
- There is no durable due-time queue, worker election, retry ledger, external publisher adapter, or persisted cross-platform execution graph.
- `src/core/workflow-yaml.ts` compiles each validated node into a trusted typed YAML document with a known operation, input/output contract, and policy. The runner dispatches the compiled operation and writes immutable per-run YAML artifacts; it does not yet parse arbitrary authored YAML.
- A **bounded first typed handoff** is supported: a read-only `inspect` or `verify` step produces `page-observation/v1` (`url`, `excerpt`), and a later `note` step may bind its message to either field. The compiler rejects missing, future, or incompatible references. Each completed step writes an immutable `<stepId>.output.json` snapshot. Read one through the loopback-only `GET /runs/:id/steps/:stepId/output` endpoint while the run remains indexed. This is **not** general-purpose YAML interpretation, autonomous planning, multi-action orchestration, or persisted post-restart run-history querying.
- **Durable local run discovery**: the runner writes a private `summary.json` for each run and rebuilds a bounded run-history index after a server restart. Immutable run YAML, completed step-output files, run journals and previously authorized screenshots remain readable. Interrupted runs are presented as failed, never resumed. The HTTP event stream and live-only assessment are not reconstructed from archived journals; clients must use `/runs/:id/logs` for historical events. Runs created before this change may lack a persisted summary and remain unavailable after restart. This remains single-owner local persistence, not a production job queue or scheduler.
- The current browser actor supports **LinkedIn and X only**. Instagram and scheduled/batch actions must remain visually marked *planned* until matching provider contracts are implemented and tested.

## Platform capability matrix

Capabilities are a *product inventory*, not a promise that a given account, permission tier, or connector can execute them.

| Group | LinkedIn | X | Instagram | Current Utomator reality |
| --- | --- | --- | --- | --- |
| Profile health / optimization | Headline, About, experience, skills, services, projects, Featured | Bio, links, banner | Bio/links, professional profile | Selected single-step LinkedIn/X handlers only |
| Single post | Text, images, video, documents with relevant permissions | Text, replies, media, threads through eligible API access | Photos, video, Reels, carousel, eligible Stories | **X text post only** via current browser handler |
| Existing post | Edit/delete when permitted for the post and author | Pin/delete owned post; editing depends on account/provider capabilities | Read media, manage comments where permitted | **X pin or single delete only** |
| Multi-post / bulk operations | Separate confirmed API requests or UI actions | Separate confirmed operations; no universal bulk mutation | Separate content containers/publications | Not implemented |
| Scheduled / recurring | App-managed due-time execution | App-managed due-time execution | App-managed due-time execution | Not implemented |
| Analytics and engagement | Page/community insights where authorized | Posts/account insights and replies subject to access | Professional-account insights/comments where permitted | No integrated workflow analytics |
| Cross-platform campaigns | Different asset / copy / permissions per provider | Different text/media requirements | Different media processing and eligibility | Not implemented |

Relevant provider documentation and permissions (verify current details when implementing connectors):
- LinkedIn Posts API: https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api
- LinkedIn Community Management access: https://learn.microsoft.com/en-us/linkedin/marketing/community-management/community-management-overview
- Instagram API (Meta's maintained Postman collection): https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api
- Instagram professional-account requirements: https://www.postman.com/meta/instagram/folder/9cgqucg/instagram-api-with-facebook-login
- X Manage Posts: https://github.com/xdevplatform/docs/blob/main/x-api/posts/manage-tweets/introduction.mdx

An API's existence does not imply an installed application has the necessary user permissions, elevated scopes, or a supported account. Provider terms and API rules apply to automation; do not attempt to circumvent login challenges or authorization.

## Four separate layers

1. **Observed UI evidence** (immutable): browser accessibility YAML, screenshot, URL, locale, timestamp, observed DOM/label candidates. Never feed this directly to an executor as commands.
2. **Step definition** (author-authored YAML, schema-validated): operation identifier, typed inputs/outputs, adapter, allowed actions, safety gates, verification plan, idempotency key, bounded retry.
3. **Workflow definition** (YAML): steps referencing versioned step types, explicit input/output bindings and edge conditions, owner and platform scope, approval policy, error paths.
4. **Run snapshot** (immutable compiled AST/JSON): validated workflow and step versions; resolved non-secret input bindings, decisions, event sequence, evidence pointers, and receipts. Running jobs must not be mutated in-place by a UI edit or LLM suggestion.

YAML is a **declarative interface** for the automation graph. It does not remove the need for browser/API adapters, selectors, selectors' versioning, schema validation, credential management, or verification code. A changing LinkedIn UI can invalidate a YAML locator just as easily as a TypeScript locator. Prefer accessible roles/labels and live page re-observation, with guarded fallbacks rather than fixed CSS paths.

## Proposed step document (not yet runnable)

```yaml
apiVersion: utomator.dev/v1alpha1
kind: SocialStep
metadata:
  id: linkedin-about-review
  version: 1
spec:
  provider: linkedin
  operation: profile.inspect
  executionAdapter: browser
  inputs:
    account: "${workflow.account}"
    section: about
  policy:
    ownership: required
    allowMutation: false
    requireHumanApproval: false
  browser:
    target: official-account-profile
    observation: accessible-role-and-label
    evidence: [dom, screenshot]
  output:
    schemaRef: profile-section-observation/v1
    bindings:
      observedAbout: "${result.profile.about}"
  retry:
    attempts: 2
    mode: read-only
  onError: stop
```

The DSL should **not** allow arbitrary JavaScript strings, shell commands, untrusted external URLs, Python snippets, or code evaluation in an operator-provided YAML file. Supported operations must resolve through a reviewed allowlisted registry. An LLM may propose a versioned step change, but that proposal must be compiled, policy-checked, previewed, and explicitly approved before becoming executable.

## Proposed workflow document (not yet runnable)

```yaml
apiVersion: utomator.dev/v1alpha1
kind: SocialWorkflow
metadata:
  id: profile-optimization
  version: 1
spec:
  account: "${connectedAccounts.linkedinOwner}"
  trigger:
    type: manual
    timeZone: Africa/Lagos
  steps:
    - id: inspect
      uses: linkedin-about-review@1
    - id: propose
      uses: content.propose-edit@1
      with:
        evidence: "${steps.inspect.outputs.observedAbout}"
    - id: approve
      uses: policy.require-human-approval@1
      with:
        proposal: "${steps.propose.outputs.proposal}"
    - id: apply
      uses: linkedin.profile.apply-approved-edit@1
      with:
        proposal: "${steps.approve.outputs.approvedProposal}"
    - id: verify
      uses: linkedin.profile.verify-change@1
      with:
        expectation: "${steps.approve.outputs.approvedProposal}"
```

Only `linkedin-about-review` maps conceptually to today's inspection functionality. The other illustrative `uses` entries above are **not registered handlers**. They must not be exposed as runnable until all downstream contracts exist.

## Scheduler contract (future)

- Supported trigger types: manual, once-at (ISO time + IANA zone), cron / recurring cadence, external webhook/event.
- Persist the schedule, next due instant, timezone, last dispatch, lease owner, attempt number, workflow version and idempotency key.
- Durable due-time worker with atomic claim/lease; process restarts must not drop queued tasks. Exactly-once social publishing cannot be assumed: use provider receipts and reconciliation to prevent duplicates.
- Concurrency per provider account, quotas, rate limits, backoff, quiet hours, user pause/cancel, retry-after handling.
- Destructive post deletion: **finite list of exact owned post IDs**, per-target confirmation, irreversible-action review, and durable audit record. Never accept search-based wildcard deletions.
- Scheduled tasks must preserve consent scope; unattended mutation should require an explicit up-front policy granting narrowly scoped, reviewable actions. Any authentication challenge interrupts safely.
- If a provider rejects account scope, publishing eligibility, media format or plan tier, fail with a visible blocked state. Never invent completed posts.

## Intended template library hierarchy

**Account & Profile**: health check, headline/About, experience, services, contact/website, skills, banner, full profile review.

**Portfolio & Showcase**: Projects, Featured, portfolio audit, highlight maintenance.

**Publishing**: single post, multi-post queue, post revision where supported, pin, reviewed deletion list, reels, Stories, carousel, cross-post adaptation.

**Engagement**: comment review, replies, moderation, mentions, insights and account health.

**Planning**: editorial calendar, recurring topics, campaign orchestration, scheduling, campaign reports.

Every template must declare: platform(s), provider capability, permission prerequisites, input fields, linked step definitions, output preview, schedule support, optional approval gates, and status (**executable** versus **planned**). The catalogue must be loaded independently of saved user plans and remain useful offline.

## Current independently authored YAML boundary (P2)

Step definitions are independently authored, immutable, and reusable by ID and
version. They only select operations from the reviewed, finite operation registry
in `src/core/step-definitions.ts`. No YAML step can execute arbitrary shell,
JavaScript, Python, HTTP calls, or unrestricted Playwright automation.

A valid authored *note* step, supplied as the `yaml` field to
`POST /step-definitions`, looks like this:

```yaml
apiVersion: "utomator.dev/v1"
kind: "StepDefinition"
metadata:
  id: "report-note"
  version: 1
  title: "Record report summary"
spec:
  stepKind: "note"
  operation: "record-event"
  outputs: "status/v1"
  config:
    message: "Report ready for review"
```

YAML parser limits: 8 KiB, two-space nested mappings, JSON-quoted string
scalars or unsigned integer scalars, unique keys, no aliases, merge keys, tags,
sequences or arbitrary objects. Incorrect operation/kind/output combinations,
unknown keys, unsafe IDs, path traversal, and excessive delays are rejected.
A new version must follow the preceding version and may not overwrite it.

Add a reference to an existing workflow plan's note step:

```json
{"id":"report","kind":"note","title":"Report","definition":{"id":"report-note","version":1}}
```

The existing visual studio and legacy workflows continue to work without these
references. Version-pinned YAML defaults are resolved and validated before
saving the revised workflow or executing it. Each run snapshots the resolved
step instructions and their content hashes. Step-level `message` and
`delayMs` overrides are still validated against the existing plan limits;
a definition cannot weaken the runner's authentication, approval or verification
policies.

Loopback endpoints: `GET /step-definitions`,
`GET /step-definitions/:id/versions/:version`, and
`POST /step-definitions` (`{ "yaml": "..." }`).
The Next.js local proxy explicitly allowlists these endpoints.

Typed bindings remain deliberately bounded to authorized local operations:
- `note.inputBindings.message`: may read string fields such as
  `inspect.url`, `inspect.excerpt`, `note.message`, or `status` from
  an earlier compatible step.
- `delay.inputBindings.delayMs`: may read `durationMs` from an earlier
  `delay` step; resolved values must still be integers between 0 and 30000.
- `action` inputs cannot be supplied through bindings. In particular, social
  publishing parameters cannot be changed by YAML output substitution.

These fields are checked against producer kind and chronology at compilation,
and against actual output schemas and runtime types before use. The existing
`status/v1` output remains compatible: notes additionally contain `message`
and delays additionally contain `durationMs`.

## Typed read-only assessment boundary (incremental P2)

An authored `assess` definition can now run the reviewed local
`assess-observation` operation, returning `assessment/v1`
(`matched: boolean`, `summary: string`). This never executes external
provider actions and does not infer biographical facts or create AI text.

```yaml
apiVersion: "utomator.dev/v1"
kind: "StepDefinition"
metadata:
  id: "public-profile-check"
  version: 1
  title: "Check observed public-profile evidence"
spec:
  stepKind: "assess"
  operation: "assess-observation"
  outputs: "assessment/v1"
  config:
    expectedText: "public"
```

A workflow `assess` step must bind its `text` input to an earlier
string output, such as `inspect.excerpt`, `note.message`, or
`assess.summary`. An optional `expectedMatch` input binds an earlier
`assess.matched` boolean and fails closed if the new assessment contradicts
it. A later `note.message` may consume `assess.summary`.

The compiler verifies topology, producer output schema, field type and
allowlisted operation. The runner checks actual runtime values and writes an
immutable `assessment/v1` JSON result. Comparisons are deterministic,
case-insensitive substring tests; they are *not* semantic analysis, real
provider verification, an autonomous optimizer, or a substitute for approval.

## P3 readiness gate

**Ready for the manual, planning-only P3 vertical slice; not ready for
autonomous optimization or provider execution.** The separate
`ProfilePlanner` already supplies a persisted six-stage
context → assessment → proposals → approval → selection → report workflow,
with deterministic evidence-backed proposals and explicit review.
It is not yet composed from the general social runner's independently
authored steps, and no AI recommendation provider, multi-action executor
or production LinkedIn mutation adapter is integrated. Read-only local
assessments in the general runner now provide a typed contract for future
composition, not an implicit claim of end-to-end autonomy. Real account
observations, authorized provider APIs, integration dogfood and release gates
remain necessary before offering executable profile changes.

## Migration and acceptance sequence

1. Fix template-library responsiveness and saving independently of the Config dialog; differentiate planned versus executable templates, with integration tests.
2. Implement versioned YAML step documents and an allowlisted compiler (**basic compilation done**). Next: a hardened authored-YAML parser, schema roundtrips, input/output binding and type-checking, parser resource limits and permission gates.
3. Migrate existing linear JSON workflows to equivalent YAML manifests without changing their effective execution; dual-read migration with rollback and snapshot checks.
4. Add per-step event trace, input/output binding, approvals, actual graph-branch semantics, and deterministic replay of the immutable execution snapshot.
5. Add account consent management and official provider adapters where possible, then a durable scheduler/worker with idempotency, receipts, bounded retries, and independent dogfood tests.
6. Only then expose multi-action optimizers, multiple post scheduling, post-list deletion, and Instagram publishing as executable templates.

Neither the existing JSON workflow engine nor the current root accessibility YAML files already implement steps 2–6.

## Evidence and approval bridge (P3 → general runner)

The reviewed profile-planning path and the general YAML runner now share a
bounded `evidence/v1` provenance reference and `approval/v1` decision
contract. Both contracts are **review gates**, not provider authorization.

- `evidence` is an allowlisted `capture-evidence` stage. It must bind its
  `observation` input to an earlier `inspect` or `verify` step's
  `excerpt` field. Its immutable output names the observation source step,
  `page-observation/v1` schema, observed HTTPS URL and SHA-256 evidence
  digest. The full observed excerpt remains in the earlier observation output.
- `approve` is an allowlisted `require-evidence-approval` stage. It must
  bind its `evidence` input to a prior `evidence` stage's digest and waits
  on the existing real operator approval checkpoint. A granted approval writes
  an immutable `approval/v1` output tied to that evidence digest; a denial
  blocks execution rather than manufacturing an approved result.
- The existing P3 profile planner now records the same provenance reference
  for its trusted portfolio-source facts, and its approval decision includes
  the corresponding source digest. Final selection verifies that the persisted
  decision matches the unchanged source evidence. Older already-approved P3
  plans retain their historical selection path without silently granting new
  permissions.
- A provider `action` node **cannot** accept bound action inputs or consume
  this approval as permission to modify an account. Its original provider
  handler still applies its own ownership, account authentication, per-action
  consent and verification requirements. No scheduler, social API adapter,
  multi-provider action sequence, or autonomous model is added here.

A minimal read-only YAML-plan sequence is
`start → session → inspect → evidence → approve → stop → action → finish`.
The `stop` stage intentionally terminates before the provider action; it is
useful for testing the entire evidence-and-review boundary without posting or
editing external content.
