# Utomator: Unified Growth, Workflow, Graph and Pipeline Architecture

> **Status:** Proposed architecture — not implemented.  
> **Repository:** `surdma/utomator`. **PR:** [#6 — Unified LinkedIn Growth Workspace](https://github.com/surdma/utomator/pull/6).  
> **Date:** 28 October 2026. **Scope:** Growth, Craft, canonical graphs, pipeline releases, execution, persistence and migration.

This proposal documents the separation currently present in Utomator and a migration toward **one logical, modular execution engine**. PR #6 consolidates the Growth catalogue and MDX visual authoring; it does **not** implement the engine design below.


<p align="center">
  <strong>UTOMATOR · UNIFIED WORKFLOW ARCHITECTURE</strong><br>
  <sub>One canonical graph · One execution engine · Specialized capability modules</sub>
</p>

<table>
<tr><td align="center"><strong>GROWTH</strong><br><sub>Goals and outcomes</sub></td><td align="center"><strong>CRAFT</strong><br><sub>Reusable procedures</sub></td><td align="center"><strong>GRAPH</strong><br><sub>Typed dependencies</sub></td></tr>
<tr><td align="center"><strong>PIPELINE</strong><br><sub>Validated release</sub></td><td align="center"><strong>ENGINE</strong><br><sub>Authorized execution</sub></td><td align="center"><strong>RESULTS</strong><br><sub>Evidence and feedback</sub></td></tr>
</table>

> [!IMPORTANT]
> **Target design, not implemented functionality.** The visual diagrams illustrate the recommended future architecture. Today, Craft and WorkflowPlan are separate, and PR #6 does not introduce a unified engine.

This is one GitHub-renderable Markdown file. The visual diagrams use GitHub's native Mermaid rendering, and the introductory cards use supported inline HTML. There is no separate HTML page, external script or duplicated document.

## 1. The central architectural problem

Utomator has an execution engine, but Growth, Craft and Pipeline **do not yet share an executable workflow definition**.

| Area | Current responsibility | Engine connection |
| --- | --- | --- |
| Growth | 15 LinkedIn capabilities, goals, 107 proposed actions and availability | Mostly descriptive product definitions |
| Craft / Growth MDX | Reusable instructions and visual graphs | Cannot directly compile into the Runner |
| Pipeline | Action-specific, validated WorkflowPlans | Connected to the Runner |
| Workflow Runner | Supported browser operations, approval gates, events and output | Operational, bounded by registered actions |
| Research and Editorial | Specialized research, drafts, approval and publishing services | Separate lifecycles, not generally graph-orchestrated |

### Present-day separation


```mermaid
flowchart LR
    subgraph DESIGN["GROWTH / CRAFT · authoring"]
        direction TB
        CAT["Growth catalogue<br/>15 capabilities and Craft designs"]
        MDX["CraftProject<br/>brief • research • draft • review"]
        CAT --> MDX
    end
    subgraph EXEC["PIPELINE · execution"]
        direction TB
        PLAN["WorkflowPlan<br/>start • inspect • action • verify"]
        COMP["compileWorkflow()"]
        RUN["Runner<br/>registered operations"]
        PLAN --> COMP --> RUN
    end
    MDX -.->|"Missing compiler bridge"| COMP
    classDef gray fill:#f1f5f9,color:#0f172a,stroke:#94a3b8
    classDef blue fill:#dbeafe,color:#1e40af,stroke:#2563eb
    class CAT,MDX gray
    class PLAN,COMP,RUN blue
```

The dashed link is an **unimplemented connection**, not a functioning integration.

There are **two graph contracts**:

- **Craft:** `CraftProject`, `CraftStep`, `CraftLink`, with node kinds `brief`, `research`, `draft`, `review`, `publish`, `measure`. See `apps/backend/src/crafts/library.ts`.
- **Execution:** `WorkflowPlan`, `WorkflowStep`, `WorkflowLink`, with kinds `start`, `session`, `inspect`, `action`, `verify`, `note`, `delay`, `assess`, `evidence`, `approve`, `pause`, `stop`, `finish`. See `apps/backend/src/core/workflow-plan.ts`.

The present `compileWorkflow()` accepts a `WorkflowPlan`, **not Craft MDX**. It validates action-specific linear plans (4–24 steps); the `Runner` executes compiled registered operations. A Growth visual workflow therefore cannot simply be run as a pipeline.

**Gap:** Unified presentation is not unified authoring, compilation, orchestration or outcome tracking.

## 2. The architecture Utomator should have

Create **one modular workflow platform**, with different product domains using shared contracts.

- **Growth** determines *why*: goal, audience, strategy, baseline, KPIs and target outcome.
- **Craft** defines *how*: reusable expert process instructions and evidence requirements.
- **Graph** describes *what*: typed nodes, connections, data dependencies, decisions and conditions.
- **Pipeline** is the validated, immutable version of that graph, bound to inputs, account, policy and handler versions.
- **Engine** determines *whether and how*: validates authority, schedules, dispatches, checkpoints and records evidence.
- **Run and Outcome** capture *what happened* and *what can be verified*.

### The six complementary concepts


```mermaid
flowchart LR
    G(["GROWTH<br/>Why: measurable objective"]) --> C[["CRAFT<br/>How: reusable process"]]
    C --> W{{"CANONICAL GRAPH<br/>What: typed operations"}}
    W --> P[/"PIPELINE RELEASE<br/>Validate: frozen version"/]
    P --> E(["ONE ENGINE<br/>Execute with permission"])
    E --> O[("RESULTS<br/>Measure real outcomes")]
    O -.->|"Feedback"| G
    classDef dark fill:#0f172a,color:#ffffff,stroke:#0f172a,stroke-width:2px
    classDef blue fill:#dbeafe,color:#1e40af,stroke:#2563eb,stroke-width:2px
    classDef green fill:#d1fae5,color:#065f46,stroke:#10b981
    class G,E dark
    class C,W,P blue
    class O green
```


**Invariant:** One authoritative workflow execution definition. Visual, MDX and pipeline views cannot maintain competing business-logic copies.

## 3. Proposed system architecture

**TARGET ARCHITECTURE — NOT YET IMPLEMENTED**

<p align="center"><strong>Target architecture · Shared authoring, centralized orchestration, specialized adapters</strong></p>


```mermaid
flowchart TB
    G(["GROWTH INITIATIVE<br/>Objective · Audience · Baseline · KPIs"])
    C[["CRAFT TEMPLATES<br/>Versioned reusable procedures"]]
    subgraph CANON["ONE AUTHORITATIVE WORKFLOW GRAPH"]
        direction LR
        VIS["Visual editor"] <-->|"same structure"| IR{{"CANONICAL GRAPH<br/>Typed nodes · Edges · Data contracts"}}
        MDX["MDX source"] <-->|"same structure"| IR
    end
    VALIDATE["COMPILER<br/>Schema · Dependencies · Capabilities · Policy"]
    DECIDE{"Executable<br/>and authorized?"}
    MANUAL["BLOCKED / MANUAL HANDOFF<br/>Missing handler or permissions"]
    RELEASE[/"IMMUTABLE PIPELINE RELEASE<br/>Account · Inputs · Handler versions"/]
    subgraph ENGINE["SINGLE UTOMATOR EXECUTION ENGINE"]
        direction LR
        REG["Operation registry"] --> ORCH["Orchestrator"]
        ORCH --> DISPATCH["Dispatcher"]
        DISPATCH --> STATE[("Durable run state")]
        POLICY["Permissions"] -.-> DISPATCH
        HUMAN["Human approvals"] -.-> ORCH
    end
    subgraph DOMAIN["SPECIALIZED CAPABILITIES"]
        direction LR
        PROFILE["Profile"]
        RESEARCH["Research"]
        EDITORIAL["Editorial"]
        ANALYTICS["Analytics"]
    end
    PROVIDERS["LinkedIn API · Verified browser · Other providers"]
    OUT[("VERIFIED RESULTS<br/>Receipts · Artifacts · Measurements")]
    G --> C
    G --> IR
    C --> IR
    IR --> VALIDATE --> DECIDE
    DECIDE -->|"No"| MANUAL
    DECIDE -->|"Yes"| RELEASE --> REG
    DISPATCH --> PROFILE
    DISPATCH --> RESEARCH
    DISPATCH --> EDITORIAL
    DISPATCH --> ANALYTICS
    PROFILE --> PROVIDERS
    EDITORIAL --> PROVIDERS
    RESEARCH --> OUT
    ANALYTICS --> OUT
    PROVIDERS --> OUT
    OUT --> STATE
    OUT -.->|"Measured feedback"| G
    classDef dark fill:#0f172a,color:#fff,stroke:#0f172a,stroke-width:2px
    classDef blue fill:#dbeafe,color:#1e40af,stroke:#2563eb,stroke-width:1.5px
    classDef green fill:#d1fae5,color:#065f46,stroke:#10b981
    classDef red fill:#ffe4e6,color:#9f1239,stroke:#fb7185
    class G dark
    class C,IR,VIS,MDX,VALIDATE,RELEASE,REG,ORCH,DISPATCH,STATE,POLICY,HUMAN blue
    class OUT green
    class MANUAL red
```

**Solid lines** show proposed execution and data dependencies. **Dotted lines** show supporting rules or feedback. This is a **target-state diagram**, not proof that these routes exist.

The graph describes the operation and its dependencies; the engine enforces permission, execution method and truthful results.

Changing a node's visual position must never alter business logic. An MDX instruction must never grant permission to run arbitrary JavaScript, invoke unregistered operations or bypass social-provider safeguards.

## 4. How Growth, Craft, Graph and Pipeline relate

| Concept | Purpose | Example |
| --- | --- | --- |
| Growth initiative | Long-term objective with KPIs and milestones | Improve visibility to generate relevant interviews |
| Craft definition | Reusable specialized process | Evidence-backed headline optimization |
| Workflow graph | Typed nodes and dependencies | Inspect → evaluate → propose → approve → verify |
| Pipeline | Executable version bound to account and authorized inputs | Profile optimization release v2 |
| Run | One execution attempt | Profile audit on 28 October 2026 |
| Outcome | Evidenced result with attribution limits | Approved changes; documented recruiter enquiry |

One Growth initiative can coordinate many workflows, and one workflow can reuse several Craft definitions. A job-seeking initiative might link career research, profile audit, tailored applications, content and opportunity measurement without rebuilding each feature's data.

### One Growth initiative, several reusable workflows


```mermaid
flowchart TB
    G(["GROWTH INITIATIVE<br/>Job-seeking objective"])
    P["Profile intelligence"]
    R["Career research"]
    C["Content development"]
    O[("Opportunity measurement")]
    T[["Shared versioned Craft templates"]]
    G --> P
    G --> R
    G --> O
    P -->|"Approved evidence"| C
    R -->|"Permitted niche findings"| C
    C -->|"Real publication or owner handoff"| O
    T -.-> P
    T -.-> R
    T -.-> C
    classDef goal fill:#0f172a,color:#fff,stroke:#0f172a
    classDef work fill:#dbeafe,color:#1e40af,stroke:#2563eb
    classDef outcome fill:#d1fae5,color:#065f46,stroke:#10b981
    class G goal
    class P,R,C,T work
    class O outcome
```


**A graph is not a pipeline merely because it is rendered.** Only validated graphs with real registered handlers and satisfied permissions are executable.

## 5. One canonical workflow definition

Replace competing authoring models incrementally with a canonical typed **intermediate representation (IR)**. The following TypeScript is **proposed, not currently implemented**.

~~~typescript
interface WorkflowDefinition {
  id: string;
  version: number;
  identity: {
    name: string;
    description: string;
    growthCapabilityId?: string;
    platform: "linkedin" | "x";
  };
  objective: {
    goal: string;
    audience: string;
    successMetrics: string[];
  };
  graph: {
    nodes: WorkflowNode[];
    edges: WorkflowEdge[];
  };
  lifecycle: "draft" | "ready" | "archived";
}

interface WorkflowNode {
  id: string;
  operation: string;
  operationVersion: number;
  inputs: Record<string, unknown>;
  outputSchema: string;
  executionMode: "internal" | "official-api" | "browser" | "human";
  instructions?: string;
  position?: { x: number; y: number };
}

interface WorkflowEdge {
  source: string;
  target: string;
  condition?: string;
}
~~~

The **visual editor** edits canonical nodes, edges and layout. The **MDX editor** expresses permitted metadata and readable instructions. The **compiler** resolves typed dependencies, validates cycles/conditions and checks the registry. The **engine** accepts only a compiled, authorized pipeline release.

### A real executable graph needs typed decisions and handoffs


```mermaid
flowchart LR
    START(["Start"]) --> INSPECT["Inspect actual evidence"]
    INSPECT --> ASSESS["Evaluate verified facts"]
    ASSESS --> DRAFT["Prepare proposed changes"]
    DRAFT --> APPROVE{"Owner approved?"}
    APPROVE -->|"No"| STOP(["Stop without mutation"])
    APPROVE -->|"Yes"| AVAILABLE{"Provider action<br/>available?"}
    AVAILABLE -->|"Yes"| ACT["Authorized operation"]
    AVAILABLE -->|"No"| MANUAL["Manual owner task"]
    ACT --> VERIFY["Verify provider state"]
    VERIFY --> EVIDENCE[("Record genuine evidence")]
    MANUAL --> EVIDENCE
    classDef step fill:#dbeafe,color:#1e40af,stroke:#2563eb
    classDef gate fill:#fef3c7,color:#92400e,stroke:#f59e0b
    classDef outcome fill:#d1fae5,color:#065f46,stroke:#10b981
    classDef stop fill:#ffe4e6,color:#9f1239,stroke:#fb7185
    class INSPECT,ASSESS,DRAFT,ACT,VERIFY,MANUAL step
    class APPROVE,AVAILABLE gate
    class EVIDENCE outcome
    class STOP stop
```

These nodes and handlers are **proposed**. A visual stage named `publish` is not an authorization to publish.

The existing `compileWorkflow()` is a useful starting point but its linear, action-specific limitations must evolve with compatibility tests. Before implementing the IR, specify schema identifiers, stable serialization, branching, handler versions, account scopes and typed output references. `position` is presentation-only.

## 6. One operation registry, many specialized capabilities

The engine owns orchestration; modules own domain logic. All capabilities implement a shared registered handler contract.

| Proposed operation | Owner | Expected behavior |
| --- | --- | --- |
| `linkedin.profile.inspect` | Profile adapter | Read permitted account evidence |
| `linkedin.profile.evaluate` | Profile intelligence | Analyze supported profile sections |
| `research.creator.compare` | Research | Compare supplied, permitted evidence |
| `editorial.post.draft` | Editorial | Persist a structured draft |
| `editorial.post.publish` | Publishing | Publish with actual OAuth rights and approved content |
| `approval.request` | Core engine | Create a durable human approval checkpoint |
| `opportunity.record` | Opportunities | Record a documented outcome |
| `analytics.baseline.compare` | Analytics | Compare real measurements |

**All identifiers in this table are illustrative.** Do not advertise them as runnable until their schemas, handlers, authorization policies, failure behavior and tests exist.

~~~typescript
interface OperationHandler<Input, Output> {
  operation: string;
  version: number;
  validate(input: unknown): Input;
  checkAvailability(
    context: ExecutionContext
  ): Promise<CapabilityAvailability>;
  execute(
    input: Input,
    context: ExecutionContext
  ): Promise<Output>;
}
~~~

### Shared dispatcher and independently owned handlers


```mermaid
flowchart TB
    PLAN[/"Compiled pipeline release"/] --> ORCH["One orchestrator"]
    ORCH --> AUTH{"Owner, account and<br/>provider scope valid?"}
    AUTH -->|"No"| BLOCK(["Blocked"])
    AUTH -->|"Yes"| REG{{"Operation registry<br/>name and handler version"}}
    subgraph ADAPTERS["REGISTERED DOMAIN OPERATIONS"]
        direction LR
        PROFILE["Profile"]
        RESEARCH["Research"]
        EDITORIAL["Editorial"]
        HUMAN["Human task"]
        METRIC["Analytics"]
    end
    REG --> PROFILE
    REG --> RESEARCH
    REG --> EDITORIAL
    REG --> HUMAN
    REG --> METRIC
    PROFILE --> RESULT[("Typed output and evidence")]
    RESEARCH --> RESULT
    EDITORIAL --> RESULT
    HUMAN --> RESULT
    METRIC --> RESULT
    RESULT --> ORCH
    classDef core fill:#dbeafe,color:#1e40af,stroke:#2563eb
    classDef gate fill:#fef3c7,color:#92400e,stroke:#d97706
    classDef green fill:#d1fae5,color:#065f46,stroke:#10b981
    class PLAN,ORCH,REG,PROFILE,RESEARCH,EDITORIAL,HUMAN,METRIC core
    class AUTH gate
    class RESULT green
```


For every handler, register input/output schemas, external mutation status, owner/tenant/account authorization, required provider permissions, evidence, audit requirements, idempotency and retry policy. Browser handlers must verify the connected owner session; research must preserve provenance; publishing must retain OAuth and provider checks. A human task waits for an actual human decision.

## 7. Complete lifecycle of a Growth workflow

1. **Define initiative.** Select account, professional goal, audience, baseline, milestones and metrics.
2. **Compose workflow.** Connect relevant versioned Craft procedures with typed dependencies.
3. **Validate and compile.** Check schema, graph, operations, account scope, credentials, authorization and evidence requirements. Unsupported steps remain non-executable.
4. **Release pipeline.** Snapshot the compiled definition, referenced versions and approved configuration.
5. **Execute.** Orchestrate eligible nodes, dispatch operations, persist outputs, wait for approvals and retry only when safe.
6. **Verify.** Record real provider receipts, observations, human decisions, artifacts, errors and limitations.
7. **Measure and iterate.** Compare with Growth baseline, then propose a new version without silently altering approved runs.

### Seven-stage end-to-end flow


```mermaid
flowchart LR
    GOAL(["1 · Define goal"]) --> DESIGN["2 · Compose graph"]
    DESIGN --> CHECK{"3 · Validate"}
    CHECK -->|"Valid"| RELEASE[/"4 · Release pipeline"/]
    CHECK -->|"Unavailable"| MANUAL["Design / manual task"]
    RELEASE --> EXEC["5 · Execute with policy"]
    EXEC --> EVIDENCE[("6 · Verify evidence")]
    EVIDENCE --> GROWTH(["7 · Measure and iterate"])
    GROWTH -.->|"New approved version"| DESIGN
    classDef blue fill:#dbeafe,color:#1e40af,stroke:#2563eb
    classDef amber fill:#fef3c7,color:#92400e,stroke:#d97706
    classDef green fill:#d1fae5,color:#065f46,stroke:#10b981
    class GOAL,DESIGN,RELEASE,EXEC blue
    class CHECK amber
    class EVIDENCE,GROWTH green
```


The result is a feedback loop with auditable outcomes, not disconnected task cards.

## 8. Example: LinkedIn professional presence growth

**Objective:** Increase evidence-based professional visibility and qualified opportunities.

<p align="center"><strong>Professional visibility · An orchestrated Growth program</strong></p>


```mermaid
flowchart TB
    GOAL(["GROWTH OBJECTIVE<br/>Professional visibility and qualified opportunities"])
    subgraph RESEARCH["INTELLIGENCE WORKSTREAMS"]
        direction LR
        P["Profile audit<br/>Sections and evidence"]
        N["Niche intelligence<br/>Career positioning"]
        R["Relationships<br/>Authentic owner-led engagement"]
    end
    CONTENT["CONTENT DEVELOPMENT<br/>Research → Draft → Review"]
    APPROVAL{"Human approval?"}
    AVAIL{"Provider action<br/>available and authorized?"}
    EXEC["Permitted operation"]
    HANDOFF["Owner handoff"]
    EVD[("Verified receipts<br/>or honest handoff status")]
    OUT[("OPPORTUNITY MEASUREMENT<br/>Conversations · Interviews · Leads")]
    NEXT(["NEXT GROWTH ITERATION"])
    GOAL --> P
    GOAL --> N
    GOAL --> R
    P -->|"Evidence"| CONTENT
    N -->|"Findings"| CONTENT
    R --> OUT
    CONTENT --> APPROVAL
    APPROVAL -->|"Revise"| CONTENT
    APPROVAL -->|"Approved"| AVAIL
    AVAIL -->|"Yes"| EXEC --> EVD
    AVAIL -->|"No"| HANDOFF --> EVD
    EVD --> OUT --> NEXT
    NEXT -.-> GOAL
    classDef dark fill:#0f172a,color:#fff,stroke:#0f172a
    classDef blue fill:#dbeafe,color:#1e40af,stroke:#2563eb
    classDef amber fill:#fef3c7,color:#92400e,stroke:#d97706
    classDef green fill:#d1fae5,color:#065f46,stroke:#10b981
    class GOAL,NEXT dark
    class P,N,R,CONTENT,EXEC,HANDOFF blue
    class APPROVAL,AVAIL amber
    class EVD,OUT green
```


All workflows share a Growth initiative ID, authorized account context and typed evidence references. Content can consume approved findings from Profile Intelligence, avoiding duplicated inputs and manual copying.

A successful research step is not proof of publication. If a provider operation is unavailable, the run must become **blocked** or **awaiting owner action** rather than invent a receipt.

## 9. What the execution engine must own

| Component | Responsibility |
| --- | --- |
| Definition Registry | Workflow versions and reusable operation references |
| Graph Compiler | Type checks, graph validation and dependency ordering |
| Orchestrator | Determines eligible nodes and graph progression |
| Dispatcher | Calls registered handlers |
| Execution State | Durable runs, attempts, status and checkpoints |
| Human Task Manager | Approvals, inputs and manual-action confirmations |
| Scheduler | Delayed, recurring and resumable executions |
| Policy Engine | Owner, tenant, account, credentials and provider rules |
| Evidence Store | Sources, drafts, receipts and artifacts with provenance |
| Outcome Tracker | Baseline, measurements and attribution limits |

The present `Runner` already supports browser-centric compilation, outputs, human approval, pause/resume, journals and archived summaries. It permits **one active browser workflow** and is not yet a shared orchestrator for Research, Editorial and Growth. Preserve working behavior and introduce adapters rather than replacing it wholesale.

### Durability, retries and uncertainty


```mermaid
stateDiagram-v2
    [*] --> Draft
    Draft --> Validated: schema and graph valid
    Validated --> Ready: compile and bind release
    Ready --> Running: authorized start
    Running --> AwaitingApproval: owner approval needed
    AwaitingApproval --> Running: approved
    AwaitingApproval --> Cancelled: rejected
    Running --> AwaitingInput: manual input needed
    AwaitingInput --> Running: verified input
    Running --> Blocked: provider unavailable
    Blocked --> Running: revalidate and resume
    Running --> Completed: real outputs verified
    Running --> PartiallyCompleted: explicit partial outcome
    Running --> Failed: nonrecoverable error
    Running --> Cancelled: owner cancellation
    Completed --> [*]
    PartiallyCompleted --> [*]
    Failed --> [*]
    Cancelled --> [*]
```


A long-running Growth program must survive restarts and delayed approval. Persist transitions, node attempts and output references. External mutations require idempotency when possible, reconciliation of uncertain provider outcomes and genuine evidence before marking a node completed. Avoid replaying a published post or profile edit simply because a client timed out.

## 10. Persistence and source-of-truth architecture

Utomator already has a tenant-scoped `DocumentStore` supporting local SQLite and configured PostgreSQL. It can support versioned definitions initially. Concurrent, durable orchestration requires further transactional and recovery design.

| Proposed entity | Associations |
| --- | --- |
| `growth_initiative` | Owner, account, strategy, KPI and baseline |
| `workflow_definition` | Canonical graph and version |
| `workflow_template` | Craft/capability instructions and version |
| `initiative_workflow` | Dependencies between an initiative's workflows |
| `pipeline_release` | Immutable compiled configuration |
| `workflow_run` | Actor, account, state and lifecycle |
| `step_attempt` | Versioned handler, inputs, outputs, errors and times |
| `approval_checkpoint` | Real owner decision, evidence and timestamp |
| `artifact` | Generated output and provenance |
| `opportunity` | Verified outcome and defensible attribution |

### Proposed entity relationships


```mermaid
erDiagram
    GROWTH_INITIATIVE ||--o{ INITIATIVE_WORKFLOW : coordinates
    WORKFLOW_DEFINITION ||--o{ INITIATIVE_WORKFLOW : links
    WORKFLOW_DEFINITION ||--o{ PIPELINE_RELEASE : compiles
    WORKFLOW_TEMPLATE }o--o{ WORKFLOW_DEFINITION : reused_in
    PIPELINE_RELEASE ||--o{ WORKFLOW_RUN : executes
    WORKFLOW_RUN ||--o{ STEP_ATTEMPT : records
    WORKFLOW_RUN ||--o{ APPROVAL_CHECKPOINT : awaits
    WORKFLOW_RUN ||--o{ ARTIFACT : produces
    GROWTH_INITIATIVE ||--o{ OPPORTUNITY : measures
```

This entity diagram is a **proposed logical schema**; it does not assert that these database tables already exist.

These are **proposed logical entities**, not a claim that all tables exist. PostgreSQL is a reasonable hosted transactional source of truth. Add Redis only after a real queue, cache or coordination need is established; it must not become a competing state authority.

## 11. Proposed code ownership

This is a responsibility map, **not** a request to create empty folders.

~~~text
apps/backend/src/
├── engine/
│   ├── contracts/
│   ├── registry/
│   ├── compiler/
│   ├── orchestrator/
│   ├── dispatcher/
│   ├── lifecycle/
│   ├── scheduler/
│   ├── policy/
│   ├── evidence/
│   └── persistence/
├── modules/
│   ├── growth/
│   ├── profile/
│   ├── research/
│   ├── editorial/
│   ├── relationships/
│   ├── opportunities/
│   └── analytics/
├── integrations/
│   ├── linkedin/
│   ├── browser/
│   └── social/
└── api/
    ├── growth/
    ├── workflows/
    ├── runs/
    └── accounts/
~~~

The frontend should offer one coherent Growth experience: catalogue, objectives, graph design, MDX source, pipeline configuration, history and outcomes. Research and Editorial may retain focused screens while using shared execution contracts.

**Consolidate contracts and orchestration, not all business logic into one enormous service.**

## 12. Incremental migration plan

| Phase | Change | Completion criterion |
| --- | --- | --- |
| 1. Canonical contracts | Typed IR, versioning and operation registry | Growth and Pipeline can represent one workflow definition |
| 2. Unified authoring | Visual/MDX/workflow editor adapters | One version round-trips across all representations |
| 3. Execution adapters | Wrap Runner, Research and Editorial | Supported operations use one dispatcher, safeguards retained |
| 4. Durable lifecycle | Runs, checkpoints, attempts, approvals and recovery | Genuine records, restart/resume and safe retry behavior |
| 5. Growth initiatives | Shared objective, account and workflow dependencies | One initiative coordinates multiple pipelines |
| 6. Feedback loop | Baselines, tracked outcomes and evaluation | Verified progress is visible, not just action counts |

### Migration roadmap


```mermaid
flowchart LR
    A["1 · Canonical contracts"] --> B["2 · Unified editors"]
    B --> C["3 · Execution adapters"]
    C --> D["4 · Durable lifecycle"]
    D --> E["5 · Growth initiatives"]
    E --> F["6 · Outcome feedback"]
    classDef step fill:#dbeafe,color:#1e40af,stroke:#2563eb
    classDef done fill:#d1fae5,color:#065f46,stroke:#10b981
    class A,B,C,D,E step
    class F done
```

Phases are **proposed work**, not current completion claims.

**Preservation rule:** Never remove a working specialized service before its behavior is reproduced and tested behind the engine. Retain Research evidence handling, Editorial approvals, publishing authorization, browser ownership checks, tenant isolation and revision semantics.

**Acceptance/validation for a future implementation:**

- Graph cycles, unknown handlers, typed bindings, conditional branches and schema versions are validated.
- Visual ↔ MDX ↔ canonical IR round-trips without untrusted source executing code.
- Tenant, account, credentials and approval checks happen before mutations.
- Delayed approval, restart/recovery, failure, cancellation, idempotency and uncertain outcomes work.
- End-to-end profile research → draft → approval → permitted action/human handoff → genuine artifact → measured result is demonstrated.
- Existing Pipeline workflows, personal Craft clones, 15 capabilities, six original templates, Research and Editorial behavior remain intact.

## 13. What this means for PR #6

PR #6 brings the **15 Growth capabilities and six original Craft designs** into one catalogue/authoring experience, making 21 reusable MDX/visual templates available. The designs are useful source material for canonical workflows; their instructions and proposed actions are **not executable integrations**.

Engine integration should be a **separate implementation change** focused on the actual compiler, operation registry, Runner, Craft persistence contracts, Research and Editorial adapters. It needs its own specification, migration plan, contract tests, review and end-to-end validation.

For this PR, keep the boundary explicit: **catalogue, authoring and architecture documentation; not a production engine rewrite.**

## Final architectural decision


```mermaid
flowchart TB
    G(["GROWTH<br/>Why · Goals and KPIs"])
    C[["CRAFT<br/>How · Specialized reusable procedures"]]
    W{{"CANONICAL GRAPH<br/>What · Typed tasks and dependencies"}}
    P[/"PIPELINE<br/>Validated immutable release"/]
    E(["ONE EXECUTION ENGINE<br/>Policy · Dispatch · Approval"])
    R[("VERIFIED RESULTS<br/>Measured outcomes and next iteration")]
    G --> C --> W --> P --> E --> R
    R -.->|"Evidence-backed feedback"| G
    classDef dark fill:#0f172a,color:#fff,stroke:#0f172a,stroke-width:2px
    classDef blue fill:#dbeafe,color:#1e40af,stroke:#2563eb,stroke-width:1.7px
    classDef green fill:#d1fae5,color:#065f46,stroke:#10b981
    class G,E dark
    class C,W,P blue
    class R green
```


Make the unified workflow engine Utomator's core product architecture and Growth its first major application domain. LinkedIn is a capability provider, **not the engine**. That creates room for further social accounts, research, career workflows and opportunities without disconnected execution systems.

---

### Current-repository source anchors

- `apps/backend/src/crafts/library.ts` — Craft graphs, MDX source and library.
- `apps/backend/src/core/workflow-plan.ts` — existing executable WorkflowPlan contract.
- `apps/backend/src/core/workflow-yaml.ts` — `compileWorkflow()` and compiled step documents.
- `apps/backend/src/core/runner.ts` — execution, browser controls, approvals and archives.
- `apps/backend/src/main.ts` — service registrations and API surfaces.
- `apps/frontend/components/automate/pipeline.tsx` — Pipeline authoring and run submission.
- `docs/plans/growth-unification-spec.md` and `docs/plans/growth-unification-implementation-plan.md` — existing PR #6 scope and release criteria.

**Current status: INVESTIGATED / ARCHITECTURE PROPOSED.** This document makes no claim that the canonical IR, central dispatcher, shared run lifecycle, scheduling, or outcome tracking are implemented.

## Documentation and reusable diagram assets

- [Expert-methodology knowledge reference](../knowledge/growth-craft-methodology.md) explains sourcing, context-fit, account-specific inputs, honest approvals, evidence and outcome measurement.
- [Mermaid and SVG diagram library](./diagrams/README.md) preserves all twelve diagrams above as standalone editable Mermaid files alongside two new method/journey diagrams and five portable SVG companions.
- [Documentation index](../README.md) links the product decisions, implementation plans, knowledge and vector assets.

Mermaid fences in this document are GitHub-rendered vector visuals. Separate SVGs are simplified portable illustrations; consult the Mermaid source for complete graph semantics.
