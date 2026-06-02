# PRD: NbeamNG Backend Platform

## Problem Statement

Investment analysis is iterative, uncertain, and deeply collaborative. A customer provides initial information (CIMs, financials, portfolio details); agents conduct research, valuation, and strategic analysis; reviewers (analysts, VPs, partners) provide corrections, challenge assumptions, and supply new evidence. The system must produce IC-ready PPTX/PDF deliverables.

Current approaches fail in two opposite directions:

1. **Rigid predefined workflows** (e.g., linear pipelines: ingest → research → analysis → report → review → export) break down when real work happens: a customer uploads new portfolio details after seeing the first draft, a partner reframes the investment thesis, a valuation requires one extra datapoint that wasn't in the initial materials.

2. **Uncontrolled agent swarms** let agents call each other directly with no durable system of record. There is no audit trail of who said what, no evidence tracing for claims in the final report, no way to selectively regenerate only the sections affected by a correction, and no guaranteed isolation or destruction of confidential project data.

NbeamNG must be a **governed dynamic agent workspace**: a durable, auditable, secure harness around a flexible agent runtime. Every bold claim in the final report traces to source evidence. Every correction triggers targeted regeneration of affected sections, not a full rerun. Confidential data is strictly project-scoped and destroyed after closeout. Reusable expertise is extracted only after sanitization and approval.

## Solution

A standalone backend service providing:

- **Durable Project Harness** — owns project lifecycle, workspace versioning, artifact lineage, claim/evidence graph, review state, policy enforcement, completion evaluation, report export, and memory closeout.
- **Dynamic Agent Runtime Layer** — agents read project state from the harness, claim tasks, resolve data needs, critique and revise, and write structured outputs back through the harness APIs. Agents never communicate directly with each other.
- **Typed Blackboard** — the shared, durable system of record: Projects, Workspace Versions, Artifacts, Claims, Evidence, DataNeeds, ReviewComments, Tasks, and Events. All agent collaboration happens through this typed state.
- **Swappable Agent Runtime Adapters** — Pi is one of many possible agent runtimes. The harness exposes a REST/JSON API. Any runtime (Pi SDK, Python service, custom TypeScript worker) can poll for tasks and submit results.

The backend is implemented as **six vertical slices**, each a complete, API-testable end-to-end story. Infrastructure (tables, endpoints, storage) emerges from each slice's needs. No horizontal "build all the schema first" phase.

## User Stories

### Slice 1: Create a Deal and Upload a CIM

1. As an Investment Analyst, I want to create a new project for an acquisition target with a confidentiality class and retention policy, so that I have a governed workspace for the deal.

2. As a Customer, I want to upload a CIM, financial statements, and portfolio overview to a project, so that the system has the initial materials for analysis.

3. As an Investment Analyst, I want to view all artifacts in a project's current workspace version, so that I can confirm all documents were ingested and stored correctly.

4. As a System Administrator, I want projects to have configurable retention policies with automatic destruction after the retention period, so that confidential data does not outlive the engagement.

5. As a Compliance Officer, I want all uploaded documents to be stored in project-scoped object storage with encryption at rest, so that no other project can access them.

### Slice 2: Agent Reads the CIM and Writes a Draft Research Summary

6. As an Investment Analyst, I want to trigger an agent run to analyze uploaded documents, so that I get a draft research summary artifact.

7. As an Intake/Research Agent, I want to read the uploaded CIM and extract key business information (market, model, management, moat), so that I can produce a structured research summary.

8. As an Investment Analyst, I want to view the generated research summary artifact with metadata showing which agent created it and when, so that I can assess the initial analysis quality.

9. As a System Administrator, I want agent runs to be logged with status (pending, claimed, in-progress, completed, failed), runtime, and cost, so that I can monitor system usage and enforce budgets.

10. As an Agent Runtime, I want to claim a pending task via a polling API, so that I can participate in the system regardless of my implementation language.

### Slice 3: Every Bold Claim Traces to Evidence

11. As a Research/Analysis Agent, I want the system to extract typed claims from my generated artifacts, so that every important assertion is individually traceable and verifiable.

12. As a Verifier Agent, I want to check that every extracted claim has supporting evidence linked to source documents, so that unsupported claims are flagged before they reach the report.

13. As an Investment Analyst, I want to see which evidence items support each claim, so that I can trace assertions back to specific pages, paragraphs, or filings in the source materials.

14. As a Partner, I want claims to have confidence scores and reliability assessments, so that I know which assertions are well-supported vs. speculative or estimated.

15. As a Verifier Agent, I want to flag claims that contradict other claims or existing evidence, so that inconsistencies are surfaced before human review.

16. As an Investment Analyst, I want unsupported claims to be automatically marked with a "needs_review" status and escalated, so that no unverified assertions slip into the final IC memo.

### Slice 4: A Reviewer Corrects Me, and the System Fixes Only What's Wrong

17. As a Customer, I want to submit a review comment correcting an analysis error (e.g., "Revenue is $50M, not $30M"), so that the investment summary is accurate.

18. As a Review Ingestion Agent, I want to classify incoming comments as corrections, new evidence, judgment changes, style changes, questions, or approvals, so that the system routes them to the correct downstream handlers.

19. As an Impact Analyzer, I want to identify which claims and artifacts are affected by a correction, so that only the relevant analysis sections and slides need regeneration.

20. As an Investment Analyst, I want the system to create a new immutable workspace version after applying corrections, so that I can compare the before and after state with full lineage.

21. As a Partner, I want to see the lineage of a regenerated section (which review triggered it, which claims were invalidated, which evidence was added), so that I can audit the revision history.

22. As an Analysis Agent, I want to receive targeted regeneration tasks for only the affected claims and sections, so that I don't waste compute re-generating unchanged analysis.

### Slice 5: The Agent Asks for Missing Data, and I Provide It

23. As a Valuation Agent, I want to create a DataNeed when I discover missing information (e.g., "Competitor X FY2024 revenue"), so that the gap is tracked explicitly and doesn't block the rest of the analysis.

24. As an Investment Analyst, I want to view all open DataNeeds in a project with their priority and requestor, so that I know what information is still needed to complete the analysis.

25. As a Research Agent, I want to claim and resolve a DataNeed by searching existing evidence or conducting targeted research, so that the analysis can continue with enriched data.

26. As a Customer, I want to be notified when a DataNeed requires proprietary information that only I can provide, so that I can upload the missing data.

27. As a Valuation Agent, I want analysis to resume automatically after a DataNeed is resolved, so that I don't need to manually restart the valuation workflow.

28. As an Investment Analyst, I want to mark a DataNeed as "unavailable" when the data cannot be found, with an explanation of searched sources and suggested proxy methods, so that the team knows it's a diligence gap rather than a system failure.

29. As a DataNeed Registry, I want to track the full lifecycle of a DataNeed (open → resolving → resolved/estimated/unavailable/needs_human_input), so that the project state is always accurate.

### Slice 6: We Close the Deal, Export the Report, and Clean Up

30. As a Partner, I want the completion evaluator to check that all high-priority claims are sourced, all critical DataNeeds are resolved, all review comments are addressed, and the investment thesis is complete before a project can be finalized, so that incomplete analyses don't go to the IC.

31. As an Investment Analyst, I want to export the final IC-ready report as PPTX and PDF from approved, verified artifacts, so that I can present it to the investment committee.

32. As a Report Agent, I want to consume approved claims, verified financial analysis, and checked charts to generate a deterministic slide deck, so that the report never invents analysis that wasn't already verified.

33. As a Compliance Officer, I want all project-confidential data (uploads, artifacts, claims, evidence, review comments, draft conclusions) destroyed after the retention period, so that no deal information leaks to future projects or model training.

34. As a Memory Distillation Agent, I want to extract candidate reusable lessons from a completed project (e.g., "For vertical SaaS deals, request both GRR and NRR"), so that institutional knowledge improves over time.

35. As a Compliance Officer, I want extracted lessons to be scrubbed of confidential details (company names, revenue figures, proprietary data) and approved by a human before entering global expertise memory, so that customer data never leaks.

36. As an Investment Analyst, I want to search global expertise memory for approved checklists, valuation methodologies, and sector playbooks from past deals, so that I can apply proven frameworks to new projects.

### Cross-Cutting Governance

37. As a System Administrator, I want to set policy budgets (max cost per agent run, max wall-clock minutes, max open DataNeeds, max task depth) per project or engagement type, so that agent runs don't spiral out of control.

38. As a Policy Engine, I want to enforce that agents cannot write to global expertise memory, cannot access external search without permission, and cannot exceed cost budgets, so that policies are mechanically guaranteed.

39. As a System Administrator, I want all blackboard state changes recorded in an append-only event log (who changed what, when, and why), so that the system is fully auditable for compliance and debugging.

40. As an Agent Runtime, I want to submit structured results (created artifacts, resolved DataNeeds, invalidated claims) through a typed API, so that the harness can validate and record them durably.

41. As a Pi Runtime, I want to connect to the backend via a standard REST/JSON API with project-scoped tokens, so that I can serve as one of many possible agent implementations without tight coupling.

## Implementation Decisions

### Standalone Backend Service

This repo contains the entire platform backend: durable harness, dynamic agent runtime, agent implementations, storage abstractions, and swappable runtime adapters. The frontend is a separate concern that consumes the REST API. This separation ensures the harness survives any frontend or agent runtime change.

### Express + Prisma + PostgreSQL + MinIO/S3

The team already uses Express and Prisma in another project. While Fastify (better performance, built-in OpenAPI) and Kysely (full SQL control, easier idempotent upserts) were evaluated, the differences are real but not massive for this domain. Express + Prisma is adequate: `$queryRaw` handles the ~10% of queries that need complex graph traversals, recursive CTEs, or `FOR UPDATE SKIP LOCKED`. `zod` provides request validation; `swagger-ui-express` provides API documentation.

### Hybrid Blackboard Over Workflow Engine

See `docs/adr/0001-hybrid-blackboard-over-workflow-engine.md`. The durable outer lifecycle is a simple state machine in Postgres. The dynamic inner layer is a typed blackboard with an append-only `events` table. Agents discover work by polling the REST API and write idempotent updates back to the blackboard. Task claiming uses row-level locking with leases and heartbeats.

This was chosen over Temporal, Restate, DBOS, and Inngest because:
- The outer lifecycle is only seven states — too simple for a workflow engine to add value.
- The dynamic layer (agents reacting to state, claims invalidated, workspaces branching) creates impedance mismatch with workflow DSLs.
- Maximum component swappability: any runtime can participate without understanding the orchestration layer.

The cost is explicit failure-handling design: every mutation must be an upsert with deterministic keys, and agents must tolerate re-execution safely.

### Polling API as Universal Task Discovery Contract

All agent runtimes must support polling `GET /tasks?status=pending&capability=...` to discover work. Server-Sent Events (SSE) is an optional latency optimization for deployed agents that can maintain persistent HTTP connections. Pi in SDK/RPC mode can use SSE; Pi in CLI mode or Python scripts use polling. The event bus carries lightweight notifications only; agents always read current state from the API.

### Project-Scoped API Tokens

Agents receive tokens restricted to a single project. A master API key exists for service-to-service auth. This enforces the confidentiality isolation requirement at the API boundary: a token for Project A cannot read or write Project B's blackboard.

### Prisma Schema Evolves with Vertical Slices

No upfront schema lock-in. Slice 1 needs `projects`, `workspace_versions`, `artifacts`. Slice 2 adds `agent_runs` and a minimal `tasks` table. Slice 3 adds `claims` and `evidence`. Slice 4 adds `review_comments` and task regeneration logic. Slice 5 adds `data_needs`. Slice 6 adds `policies`, `completion_criteria`, and closeout workflows. The schema grows with the slices, not ahead of them.

### Deep Modules

The following modules encapsulate significant functionality behind simple, stable interfaces:

- **ProjectBoundaryManager** — create, configure, and close projects. Enforces retention policies and confidentiality classes.
- **WorkspaceVersionManager** — create immutable workspace snapshots with parent lineage. Compute deltas between versions.
- **ArtifactStore** — store artifact metadata in Postgres, files in object storage. Track status (draft → verified → approved → superseded).
- **ClaimEvidenceGraph** — extract claims from artifacts, link evidence to claims, track confidence and status. Support transitive dependency queries ("which artifacts depend on this claim?").
- **DataNeedRegistry** — structured request lifecycle. Track requestor, need type, acceptable sources, confidence required, and resolution outcome.
- **ReviewIngestion** — classify incoming human feedback. Convert free-text comments into structured actions (new evidence, correction, question, approval).
- **ImpactAnalyzer** — given a new evidence injection or correction, identify affected claims, artifacts, and report sections. Create targeted regeneration tasks.
- **TaskEventSystem** — blackboard event log (append-only), task claiming with leases/heartbeats, polling API, optional SSE event stream.
- **AgentRuntimeAdapter** — interface between the harness and external agent runtimes. Accepts AgentRunRequest, dispatches tasks, collects AgentRunResult.
- **PolicyEngine** — enforce budgets, permissions, tool access, data-source restrictions, and runtime limits per project.
- **CompletionEvaluator** — check project state against completion criteria before allowing finalization.
- **ReportExporter** — deterministic PPTX/PDF generation from approved artifacts and claims. Never invents analysis.
- **MemoryCloseout** — destroy project-confidential data, extract candidate expertise lessons, run confidentiality scrubber, route through human approval gate.

### Idempotency by Design

Every blackboard mutation uses deterministic keys and upsert semantics. Examples:
- "Create or update Claim(id='c-456', text='Revenue is $50M', sources=[...])" — idempotent, safe to retry.
- "Set DataNeed(id='dn-789') status to 'resolved'" — idempotent.
- "Create Artifact(id='a-123') with these exact contents" — idempotent if the ID is deterministic.

Agents never "append to a list" or "increment a counter." They "set the list to [A,B,C]" or "set the counter to 5 with source evidence X." This makes task re-claiming after a crash safe without workflow replay magic.

### Object Storage for Files, Postgres for Metadata

Raw customer uploads (CIMs, financials), generated artifacts (PPTX, PDF, extracted tables), and intermediate files live in S3-compatible object storage with project-scoped prefixes. Postgres stores metadata, relationships, claims, evidence links, and the event log. This separation keeps the database size manageable and leverages object storage's strengths for large, immutable files.

## Testing Decisions

### What Makes a Good Test

Tests verify **external behavior and contracts**, not implementation details. A good test exercises a module's public interface with realistic inputs and asserts on the outputs and side effects that a caller would observe. Tests do not assert on internal state, database query counts, or private method calls.

### Module Test Strategy

| Module | Test Type | Rationale |
|---|---|---|
| ProjectBoundaryManager | Unit/Integration | Core lifecycle logic; must handle retention policies and confidentiality correctly |
| WorkspaceVersionManager | Unit/Integration | Immutable snapshots and lineage are critical for auditability |
| ArtifactStore | Integration | Must correctly handle metadata + object storage interactions |
| ClaimEvidenceGraph | Integration | Graph traversal and dependency queries are complex; `$queryRaw` paths need coverage |
| DataNeedRegistry | Unit/Integration | State machine lifecycle must be correct |
| TaskEventSystem | Integration | Task claiming, lease expiration, and event emission are concurrency-sensitive |
| AgentRuntimeAdapter | Integration | Contract between harness and runtimes must be stable |
| PolicyEngine | Unit | Budget enforcement and permission checks are pure logic |
| CompletionEvaluator | Unit | Criteria evaluation is deterministic logic |
| ImpactAnalyzer | Integration | Multi-hop dependency analysis is complex and correctness-critical |
| ReportExporter | Integration | PPTX/PDF output must match expected structure |
| MemoryCloseout | Integration | Destruction and extraction workflows must be reliable |

### API Integration Tests

Each vertical slice has at least one end-to-end test exercising the full API flow:

- **Slice 1:** `POST /projects` → `POST /projects/:id/upload` → `GET /projects/:id/artifacts` → assert artifact metadata and file retrieval.
- **Slice 2:** Upload document → `POST /projects/:id/agent-runs` → poll for completion → `GET /artifacts/:id` → assert markdown content and agent attribution.
- **Slice 3:** Trigger agent → `GET /claims` → assert extracted claims → `GET /evidence` → assert linked sources → `POST /verify` → assert unsupported claims flagged.
- **Slice 4:** Submit review comment → `GET /tasks` → assert regeneration task created → `GET /workspace-versions` → assert v2 created → `GET /artifacts/:id` → assert corrected content.
- **Slice 5:** Trigger valuation → assert DataNeed created → resolve DataNeed → assert analysis artifact updated.
- **Slice 6:** Set completion criteria → `POST /projects/:id/closeout` → assert report exported → assert project data destroyed → assert expertise candidate extracted.

### Failure Recovery Tests

Explicit tests for the hybrid model's failure handling:

- **Task crash mid-execution:** An agent claims a task, writes partial state, and crashes. After lease expiration, another agent claims the same task. Assert idempotent writes produce correct final state with no duplicates.
- **Concurrent task claiming:** Two agents poll simultaneously. Assert only one succeeds (via `FOR UPDATE SKIP LOCKED` or equivalent).
- **Event log ordering:** A sequence of state changes is recorded. Assert event log is append-only and total-order per project.

### Test Infrastructure

- **Integration tests use a real PostgreSQL database** via Docker or a test-container library. No mocking of Prisma or the database layer.
- **Object storage tests use MinIO** in Docker, not mocked S3.
- **Unit tests for pure logic** (PolicyEngine, CompletionEvaluator) use in-memory fixtures.
- **Test fixtures** create realistic domain objects (projects, artifacts, claims, evidence) that mirror production data shapes.
- **No frontend tests** — frontend is out of scope.

### Test Data Strategy

Use a shared set of realistic test fixtures representing a fictional acquisition target (e.g., a vertical SaaS company called "AcmeCorp"). The same fixtures are reused across slice tests to ensure consistency and reduce setup boilerplate. Fixtures include:
- A CIM document (stored as a test file)
- Expected research summary claims
- Expected financial metrics
- Sample review comments (corrections, new evidence, approvals)
- Expected DataNeeds (missing competitor revenue, market sizing gap)

## Out of Scope

- **Frontend UI** — project setup portal, customer upload interface, review/comment UI, artifact viewer, report preview, admin dashboard. The backend exposes a REST API; any frontend can consume it.
- **Specific LLM model integration** — the system abstracts LLM calls behind a provider interface. Specific models (Claude, GPT-4, Gemini) and providers (Anthropic, OpenAI, Azure) are swappable.
- **Production deployment infrastructure** — Kubernetes manifests, Terraform, CI/CD pipelines, monitoring/observability stack. The repo contains the application code; deployment is a separate concern.
- **Billing or multi-tenant SaaS features** — no usage-based billing, no customer subscription management, no tenant isolation beyond project-level confidentiality.
- **Real-time collaborative editing** — no WebSocket-based co-editing of artifacts or comments. Review comments are submitted as discrete structured inputs.
- **Mobile app or native client** — API-first backend; clients consume REST/JSON.
- **Third-party CRM/ERP integrations** — no Salesforce, HubSpot, or portfolio management system integrations. Data enters via upload or agent research.
- **Automated trading or execution** — this is an analysis and reporting system, not a trading platform.

## Further Notes

- **Prisma schema is not a 1:1 mapping of the requirements' TypeScript interfaces.** The requirements (`requirements/00001-InitialDescription.md`) show domain types — what the system means. The Prisma schema shows persistence shapes — how the system stores. These are allowed to differ. For example, a `Claim` in the domain has `sourceArtifactIds: string[]`; in Prisma this might be a join table or a JSONB array depending on query patterns.
- **Agent implementations start simple and grow with slices.** Slice 2's Intake/Research agent reads documents and writes markdown. Slice 3's agent adds claim extraction. Slice 4's agents handle review and regeneration. Slice 5's agents manage DataNeeds. Each slice adds agent capabilities; agents are not fully general from day one.
- **Workspace versions are immutable.** Once created, a workspace version never changes. Corrections create a new version (v1 → v2) with a parent pointer. This enables full lineage, before/after comparison, and rollback.
- **The event log is the source of truth for the pub/sub layer.** The `events` table is append-only: `(id, project_id, event_type, payload, occurred_at)`. Consumers read from this table or receive notifications derived from it. Events are not the source of truth for state — the blackboard tables are. The event log enables audit, replay, and debugging.
- **Policy defaults are hardcoded per engagement type** for the MVP. Configurable per-customer policies are a future enhancement. Initial policy defaults enforce: no global memory writes, external search disabled by default, cost budgets per project, runtime limits per agent run.
- **The Pi adapter is implemented as an HTTP client** that polls the backend API. A future enhancement may add SDK embedding (`createAgentSessionRuntime()`) or RPC mode (`pi --mode rpc`) for tighter integration when Pi is the primary runtime.
- **Report generation is deterministic.** The Report Agent never invents analysis. It consumes approved artifacts, verified claims, and checked charts. The narrative planner, slide/message map, chart generator, and template renderer are deterministic stages. If the inputs change, the output changes predictably.
