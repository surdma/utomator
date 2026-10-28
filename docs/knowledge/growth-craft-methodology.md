# From Expert Methods to Verified Growth Outcomes

> **Status:** Product and architecture knowledge, **proposed**, 28 October 2026. This is not a claim that all the described features execute today.
>
> Related: [Unified Growth/Workflow/Graph/Pipeline architecture](../architecture/unified-growth-workflow-engine.md), [diagrams](../architecture/diagrams/README.md), [PR #6 specification](../plans/growth-unification-spec.md).

## Why this product exists

A professional may hear a creator, career coach, expert or social-media specialist explain how they improved a LinkedIn profile, built relationships, won work on Fiverr or Upwork, attracted clients, obtained interviews or developed an audience. Merely copying their advice rarely recreates the same outcome. People have different occupations, starting accounts, audiences, regions, work evidence, provider permissions and time budgets. The expert's outcome is not proof that every step caused that outcome.

**Product objective:** Turn a practitioner's evidence-backed **method**, not their growth claim, into an understandable, reusable, owner-specific **Craft**; translate that Craft into an authorized Workflow/Pipeline; preserve real evidence; and measure the owner's outcomes without inventing causality.

## One system, complementary concepts

| Concept | Question | Ownership |
| --- | --- | --- |
| Growth | Why, for which audience, toward which measurable outcome? | Objective, baseline and feedback |
| Craft / Skill | How does the practitioner solve the problem? | Reusable, versioned method |
| Workflow | What must happen and in what order? | Typed operations, input/output contracts, conditions |
| Graph | How are those dependencies visualized and edited? | View of the same workflow, not its own engine |
| MDX source | How are instructions edited and exported? | Alternate view of the canonical definition |
| Pipeline | Which approved, validated release will run for this account? | Frozen account-bound configuration |
| Execution engine | Who authorizes, dispatches, checkpoints, retries and verifies? | **One shared orchestrator** and registered specialist handlers |
| Outcome | What actually happened? | Receipts, measurements, uncertainty and feedback |

There should not be separate Growth, Craft, Graph and Pipeline engines. The proposed technical change is a **single canonical graph intermediate representation** with visual and MDX authoring adapters, compiler, operation registry, and policy-driven orchestration. Specialized LinkedIn, research, editorial, profile, career and future marketplace modules own domain operations; they do not own disconnected engines.

**Present-day boundary:** Utomator currently has a versioned Craft graph and a separate executable WorkflowPlan. The Runner compiles supported WorkflowPlans, not arbitrary Craft MDX. The PR #6 catalogue merges 15 Growth capabilities with six Craft designs but is not a general engine integration.

## Turning expert advice into a responsible Craft

Capture the original methodology without rewriting it into unsupported promises.

1. **Origin and permission:** original author, title, source URL, date, permitted excerpt or owner-supplied notes, identity of the person asserting the method.
2. **Claim versus observation:** record the result the source claims; independently note which profile details, examples, timestamps or outcomes were actually observed.
3. **Mechanism and procedure:** why the expert believes a step matters; actual sequential tasks; conditions, branches, required effort, review standards and stop rules.
4. **Suitability:** role or niche, intended audience, maturity of account, baseline, resources, limitations and prerequisites; identify cases where the advice is inappropriate.
5. **Inputs:** permitted account evidence, owner achievements, work samples, target role or buyer, voice, location where material, resources and objectives.
6. **Outputs:** a documented assessment, options, owner-approved drafts, real action receipts or explicit manual tasks, plus follow-up measures.
7. **Safety and authority:** account ownership, permissions, platform restrictions, data privacy, review checkpoints and rate/cadence constraints.
8. **Measurement:** dated baseline, observation window, quality of opportunities, missing evidence and competing explanations.

Do not misrepresent expert testimonials as replicated results. Do not scrape private lessons, fabricate achievements, create invented testimonials, or treat engagement as proof of commercial opportunity.

### Evidence states

| State | Truthful interpretation |
| --- | --- |
| Expert-reported success | Sourced assertion, not verified result |
| Observed public example | Evidence of the observable example, not causation |
| Owner adopted recommendation | Approved or documented action |
| Provider confirms operation | Real receipt and fresh account observation |
| Metrics increased | Observed difference from a known baseline |
| Business or career outcome followed | Documented interview, lead, collaboration or sale, with attribution limits |

Never promote a self-reported tip to a guaranteed professional result.

### Proposed lifecycle

~~~mermaid
flowchart LR
    SOURCE["Original expert method<br/>Source and conditions"] --> EVIDENCE["Evidence and claim review"]
    EVIDENCE --> FIT{"Suitable for user<br/>and permitted?"}
    FIT -->|"No"| ADAPT["Reject, adapt or<br/>manual owner task"]
    FIT -->|"Yes"| CRAFT[["Versioned Craft<br/>Procedure and rules"]]
    ADAPT --> CRAFT
    CRAFT --> GRAPH["Canonical workflow graph"]
    GRAPH --> BIND["Bind real account<br/>goals and inputs"]
    BIND --> RELEASE[/"Validated Pipeline release"/]
    RELEASE --> ENGINE["One engine<br/>with approval gates"]
    ENGINE --> RESULT[("Real outputs, evidence<br/>and outcomes")]
    RESULT -.->|"Learn and revise a new version"| CRAFT
~~~

This is a **target design**. Automatic intake of creator videos, arbitrary remote web research and execution across unsupported social platforms are not implemented merely by specifying them.

## From reusable Craft to a particular owner's Pipeline

Contextualization is an explicit, recorded gate rather than substituting names in a template.

- Identify the actual owner and selected connected account. A social handle typed into a form is not proof of ownership.
- Establish target audience, role or service, true achievements, purpose and measurable definition of success.
- Read the supported real state: current profile, content and work evidence. Record absent or unknown information instead of filling it in.
- Map each expert step to the account: applicable, needs revision, blocked, forbidden, missing permission, or explicit human task.
- Construct typed dependencies and output references, including review/approval gates, provider availability checks and verifiable receipts.
- Compile only registered supported operations; validate handler version, schema, scope, account, consent, conditions and data bindings.
- Freeze a Pipeline release. Do not silently edit a released run when the source Craft changes.
- Execute with bounded authority. Preserve the true state of paused, blocked, uncertain, failed, or awaiting-owner runs.
- Compare real post-run observations with the baseline. New evidence prompts a **new version**, not a retroactive change to a past approved run.

### Documentation-only illustrative procedure

~~~yaml
title: Evidence-led professional profile positioning
source: owner-supplied public method with URL and date
useWhen: "Owner wants truthful, audience-specific positioning"
avoidWhen: "Account not verified or source claims not supported"
inputs:
  account: owner-selected account
  objective: qualified professional conversations
  audience: actual target employers or buyers
  evidence: owner-approved work and profile observations
steps:
  - inspect current supported profile
  - record profile baseline and gaps
  - evaluate headline, About, experience, skills and supported sections
  - prepare evidence-grounded copy options
  - request owner approval of the exact proposed changes
  - execute an authorized operation or create an honest manual task
  - verify real provider state; report uncertainty if verification fails
  - compare measured outcomes after a defined observation period
outputs:
  - audit with provenance
  - approved draft
  - actual provider receipt or awaiting-owner status
  - dated outcome observation
~~~

**This is a process example, not executable input accepted by today's WorkflowPlan compiler.**

## Complete example: LinkedIn positioning and opportunity growth

**Goal:** Increase relevant professional visibility and qualified conversations. The success measure must be chosen by the user, such as credible inbound recruiter enquiries, relevant interviews or qualified client conversations, instead of assuming that impressions equal success.

| Phase | Actual evidence or input | Outcome | Control |
| --- | --- | --- | --- |
| Set objective | Owner goal, audience, account | Account-bound plan and baseline | Verify ownership |
| Inspect | Supported current profile fields | Timestamped observations | No guessed profile fields |
| Evaluate | Real headline, About, work, skills, featured examples and supported sections | Gap audit and ranked alternatives | Explain unsupported coverage |
| Research | Supplied creator examples and professional context | Source-linked topics and hypotheses | Do not claim causality |
| Draft | Verified career achievements and audience | Factual wording options | No invented credentials |
| Approve | Exact edits and version | Owner's explicit decision | Rejection prevents mutation |
| Apply | Supported handler and provider permission | Actual receipt | Otherwise manual task, never fabricated success |
| Verify | Fresh account observation | Completed, unchanged or uncertain | No optimistic completion |
| Measure | Dated follow-up and owner-reported opportunity records | Trends and limitations | Distinguish correlation and causation |

### LinkedIn workflow and human decision

~~~mermaid
flowchart TB
    GOAL(["Objective and authorized account"]) --> INSPECT["Read real supported profile evidence"]
    INSPECT --> AUDIT["Evaluate factual gaps and positioning"]
    AUDIT --> DRAFT["Draft proposed changes and alternatives"]
    DRAFT --> APPROVE{"Owner approves exact version?"}
    APPROVE -->|"No"| REVISE["Revise or stop; no mutation"]
    APPROVE -->|"Yes"| AVAILABLE{"Supported authorized<br/>provider handler?"}
    AVAILABLE -->|"Yes"| ACT["Execute bounded provider operation"]
    AVAILABLE -->|"No"| MANUAL["Owner manual task: awaiting action"]
    ACT --> VERIFY["Fresh verification and genuine receipt"]
    VERIFY --> RECORD[("Record observed result")]
    MANUAL --> RECORD
    RECORD --> MEASURE["Measure real opportunity outcomes over time"]
~~~

Research output must be factual and source-linked. Editorial drafts may consume approved research references. A draft is **not** a published post; a proposed profile change is **not** a completed edit; a manual owner task is **not** a verified provider operation. Real execution has to preserve these distinctions.

## One initiative, several Crafts

A Growth initiative may coordinate separate versioned methods for profile intelligence, career research, content planning, editorial drafting, authentic owner-led relationships and opportunity tracking. The methods share account context and typed evidence so information is not repeatedly copied by hand.

For professional services and marketplaces (for example Fiverr or Upwork), only reuse the *conceptual process* until a real authorized integration or human-step workflow has been implemented. Do not advertise unsupported automated platform actions.

## Authoring experience and required boundaries

A user should move through **Growth objective → Craft library → Graph/MDX editor → Pipeline configuration → Run/approvals → History/evidence → Outcome reporting**.

- The shared Craft library keeps shipped default definitions immutable and user clones separately versioned and tenant-scoped.
- Graph layout and node placement must never change action semantics. MDX editing must round-trip to a canonical graph without arbitrary JavaScript execution.
- Pipeline validation must show unresolved requirements and unavailable handlers before an execution button is enabled.
- Approvals must bind to the account, exact version and exact requested mutation.
- Run reports must include genuine evidence, failures, retries, uncertain provider state and manual handoffs; no mocked provider receipts.
- Outcomes record a baseline and timestamps, and avoid claiming that a tactic caused a result without defensible evidence.

## Proposed logical records and implementation order

The architecture names the relationships, not guaranteed tables: a **GrowthGoal / GrowthInitiative**, **CraftVersion** referencing one canonical workflow definition (not a duplicate graph), **PipelineRelease**, **WorkflowRun**, **StepAttempt**, **ApprovalCheckpoint**, **EvidenceArtifact** and **OutcomeRecord**. Build on existing tenant-scoped persisted documents and Runner behavior without replacing working workflows wholesale.

Recommended delivery sequence: canonical typed graph/registry → visual/MDX round-trip → one real profile vertical slice → Research/Editorial adapters → durable run recovery → multi-Craft Growth initiatives → verified outcome tracking → additional supported providers.

### Acceptance for a genuine end-to-end vertical slice

1. Source-provenanced Craft can be authored or cloned without rewriting what the expert actually claimed.
2. Canonical graph, MDX and visual views preserve the exact operation graph and stable version identifiers.
3. Unknown handlers, invalid cycles, missing scopes, unapproved edits and unsafe data bindings fail closed.
4. Account-bound compiled release executes **only** through registered operations and real owner approvals.
5. Each run records actual outputs, uncertain outcomes and explicit manual tasks; no simulated successes.
6. LinkedIn inspect → review → draft → approve → authorized action or manual handoff → fresh verify → recorded outcome works end to end in integration tests.
7. Prior supported Pipeline, Research, Editorial, 15 capability descriptions, 107 proposed action descriptions, six original Craft templates and tenant isolation remain intact.

## Current evidence and open design decisions

Verified repository anchors are documented in the [architecture reference](../architecture/unified-growth-workflow-engine.md#current-repository-source-anchors): Craft MDX/library, WorkflowPlan, compileWorkflow, Runner, creator research and editorial services are distinct today. PR #6 supplies authoring/catalogue improvements, **not a unified runtime**.

Still requiring design and executable proof: exact canonical IR schema, branching and join semantics, stable MDX parser contract, typed data binding, durable resumability and idempotency, handler registration/versioning, cross-provider permissions, measurement collection and the retention policy. These are not resolved merely by diagrams.
