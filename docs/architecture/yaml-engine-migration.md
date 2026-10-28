# YAML Growth Engine Migration: Profile-First

> Status: first migration slice in draft PR #7, not a completed unified execution engine.

## Decision and existing boundary

YAML is the proposed canonical editable source for versioned Growth workflow definitions. The typed, validated graph is the engine input. YAML text itself must never execute as code, and the visual editor must never maintain different execution semantics.

The existing system has separate Craft/MDX and WorkflowPlan contracts. The nine actions and twenty coverage requirements in the Growth profile capability do not imply twenty implemented, individually evidenced provider operations. Research and Editorial remain working specialized modules until replacement paths preserve approvals, evidence, tenants and data.

## Working first slice

- One owner-controlled restricted-YAML LinkedIn profile definition records all nine proposed Growth actions and all twenty evidence targets.
- The backend validates the source and resolves nine allowlisted existing LinkedIn WorkflowPlans. Unrecognized actions and duplicated coverage fail closed.
- Read-only program and source endpoints present genuine supported operations without starting runs.
- The Pipeline dashboard shows the program, requirements and independent evidence targets. Selecting a subpipeline loads the actual existing WorkflowPlan; execution remains guarded by existing Runner authentication and owner approval.
- The Growth profile detail links to the Pipeline screen.

**Not implemented in this slice:** cross-pipeline scheduling, all twenty field-level collectors, durable program-run state, parallel graph joins, automatic evidence verification for every section, native YAML editor, retirement/migration of MDX, or removal of Creator Research/Editorial.

## Required full-engine graph

~~~mermaid
flowchart TB
    GOAL(["Growth goal and verified account"]) --> BASE["Record permitted real baseline"]
    BASE --> FAN{"Fan out: independent evidence for 20 sections"}
    FAN --> VISUAL["Photo / Banner / Identity"]
    FAN --> TEXT["Headline / About / Experience"]
    FAN --> WORK["Skills / Projects / Services"]
    FAN --> OTHER["Other sections or explicit owner tasks"]
    VISUAL --> MERGE["Merge typed evidence"]
    TEXT --> MERGE
    WORK --> MERGE
    OTHER --> MERGE
    MERGE --> RUBRIC["Section-specific rubrics and missing evidence"]
    RUBRIC --> DRAFT["Factual recommendations"]
    DRAFT --> APPROVE{"Owner approves exact version?"}
    APPROVE -->|"No"| STOP(["No external change"])
    APPROVE -->|"Yes"| CAP{"Real authorized handler?"}
    CAP -->|"Yes"| RUN["Execute guarded operation and read back"]
    CAP -->|"No"| MANUAL["Await owner action"]
    RUN --> OUT[("Evidence, run history and outcomes")]
    MANUAL --> OUT
~~~

## Acceptance gates before removing old modules

1. One immutable, versioned YAML graph with typed inputs, outputs, dependencies, branches, stable IDs and compile-time handler/permission checks.
2. True multi-pipeline orchestration with fan-out, joins, durable recovery, idempotency and genuine human tasks.
3. Twenty independent evidence states with actual collectors or explicit manual/unavailable reasons and audit provenance.
4. Real account-bound approval and verification for every mutation; no simulated provider success or invented claims.
5. Lossless migration of personal MDX Crafts with round-trip visual/YAML editing, history and export compatibility.
6. Research and Editorial behavior can be exercised through the unified engine before retiring their UI, data or routes.
7. Backend, frontend, integration and security checks pass, and a real profile audit-to-approval-to-result workflow is independently demonstrated.

The current implementation is useful as a compatibility bridge and acceptance baseline, not as proof that the full engine is already built.
