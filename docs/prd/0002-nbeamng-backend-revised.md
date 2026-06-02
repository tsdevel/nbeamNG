# PRD: NbeamNG Backend Platform (Revised)

## Problem Statement

Investment analysis is iterative, uncertain, deeply collaborative, and **longitudinal**. A customer provides initial information (CIMs, financials, portfolio details); agents conduct research, valuation, and strategic analysis; reviewers (analysts, VPs, partners) provide corrections, challenge assumptions, and supply new evidence. The system must produce IC-ready PPTX/PDF deliverables.

But investment analysis is not one-shot. A deal team analyzes Company X today, returns in six months for a follow-up diligence, and again in a year for portfolio review. Each re-run builds on the previous. The system must remember what was learned, track how claims changed, and compound expertise over time.

Current approaches fail in two directions:

1. **Rigid predefined workflows** break when real work happens: a customer uploads new portfolio details after seeing the first draft, a partner reframes the investment thesis, a valuation requires one extra datapoint. Workflows encoded as linear pipelines cannot handle iterative, longitudinal analysis.

2. **Uncontrolled agent swarms** let agents call each other directly with no durable system of record. There is no audit trail, no evidence tracing for claims in the final report, no selective regeneration of affected sections, no guaranteed isolation of confidential data, and no compounding expertise across engagements.

NbeamNG must be a **governed dynamic agent workspace**: a durable, auditable, secure harness around a flexible agent runtime. Every bold claim in the final report traces to source evidence. Every correction triggers targeted regeneration of affected sections, not a full rerun. Raw files are purged after structured knowledge is extracted — the "juice" is retained, the "body" is disposable. Confidential company-specific data is granularly deletable on client request. Reusable expertise compounds across every engagement, creating a moat against competitors starting from scratch.

## Solution

A standalone backend service providing:

- **Durable Project Harness** — owns project lifecycle (engagements, not one-offs), workspace versioning, claim/evidence graph, artifact lineage, review state, policy enforcement, completion evaluation, report export, and selective memory management.
- **Dynamic Agent Runtime Layer** — agents read project state from the harness, claim tasks, resolve data needs, critique and revise, and write structured outputs back through the harness APIs. Agents never communicate directly with each other.
- **Typed Blackboard** — the shared, durable system of record: Projects, Workspace Versions, Artifacts, Claims, Evidence, DataNeeds, ReviewComments, Tasks, and Events. All agent collaboration happens through this typed state.
- **Company Dossiers** — long-lived profiles accumulating all analyses of a target company for a customer. Re-runs are new linked projects, not versions within one project. The dossier enables longitudinal queries: "How have our claims about AcmeCorp changed over three years?"
- **Company Expertise Memory** — two forms: (a) raw historical claims and evidence from all projects (the dossier), and (b) distilled, generalized lessons (frameworks, prompts, methodologies) extracted by the Memory Distillation Agent.
- **Ingestion Pipeline** — a first-class process transforming raw uploaded files (CIMs, data room documents, paid data) into structured artifacts, extracted text, and initial claims. Raw files are the "body" — deletable once the "juice" (structured knowledge) is extracted.
- **Three-Tier Deletion** — granular, not monolithic: standard closeout purges raw files; confidential redaction deletes company-specific claims on client request; full purge destroys everything for extreme cases.
- **Swappable Agent Runtime Adapters** — Pi is one of many possible agent runtimes. The harness exposes a REST/JSON API. Any runtime (Pi SDK, Python service, custom TypeScript worker) can poll for tasks and submit results.

## User Stories

### Slice 1: Create a deal, upload a CIM, and ingest it

1. As an Investment Analyst, I want to create a new project for an acquisition target with a confidentiality class, retention policy, and customer tenant boundary, so that I have a governed workspace for the deal.

2. As a Customer, I want to upload a CIM, financial statements, and portfolio overview to a project, so that the system has the initial materials for analysis.

3. As a System Administrator, I want uploaded files stored in project-scoped object storage with encryption at rest, so that no other tenant can access them.

4. As a System Administrator, I want the ingestion pipeline to automatically parse uploaded PDFs, extract text and tables, and create structured artifact records in the database, so that agents can read the content without re-parsing raw files.

5. As an Investment Analyst, I want to view all artifacts in a project's current workspace version, so that I can confirm all documents were ingested and structured correctly.

6. As a System Administrator, I want projects to have configurable retention policies with automatic body purging after analysis extraction, so that storage costs are controlled and confidential raw files do not outlive their need.

7. As a Compliance Officer, I want the system to classify uploaded documents at ingestion time (confidential vs. retainable), so that the closeout workflow knows what to destroy and what to keep.

### Slice 2: Agent reads the CIM and writes a draft research summary

8. As an Investment Analyst, I want to trigger an agent run to analyze uploaded documents, so that I get a draft research summary artifact.

9. As an Intake/Research Agent, I want to read the structured artifact content extracted from the CIM, so that I can produce a structured research summary without re-parsing the raw PDF.

10. As an Investment Analyst, I want to view the generated research summary artifact with metadata showing which agent created it, when, and from which source artifacts, so that I can assess the initial analysis quality and lineage.

11. As a System Administrator, I want agent runs to be logged with status (pending, claimed, in-progress, completed, failed), runtime, cost, and assigned tenant, so that I can monitor system usage and enforce budgets.

12. As an Agent Runtime, I want to claim a pending task via a polling API scoped to my tenant and project, so that I can participate in the system regardless of my implementation language.

### Slice 3: Every bold claim traces to evidence

13. As a Research/Analysis Agent, I want the system to extract typed claims from my generated artifacts, so that every important assertion is individually traceable and verifiable.

14. As a Verifier Agent, I want to check that every extracted claim has supporting evidence linked to source documents or external research, so that unsupported claims are flagged before they reach the report.

15. As an Investment Analyst, I want to see which evidence items support each claim, so that I can trace assertions back to specific pages, paragraphs, filings, or web sources.

16. As a Partner, I want claims to have confidence scores and reliability assessments, so that I know which assertions are well-supported vs. speculative or estimated.

17. As a Verifier Agent, I want to flag claims that contradict other claims or existing evidence, so that inconsistencies are surfaced before human review.

18. As an Investment Analyst, I want unsupported claims to be automatically marked with a "needs_review" status and escalated, so that no unverified assertions slip into the final IC memo.

19. As an Investment Analyst, I want to query the Company Dossier for past claims about the same target company from previous projects, so that I can compare current analysis with historical assertions and identify changes.

### Slice 4: A reviewer corrects me, and the system fixes only what's wrong

20. As a Customer, I want to submit a review comment correcting an analysis error (e.g., "Revenue is $50M, not $30M"), so that the investment summary is accurate.

21. As a Review Ingestion Agent, I want to classify incoming comments as corrections, new evidence, judgment changes, style changes, questions, or approvals, so that the system routes them to the correct downstream handlers.

22. As an Impact Analyzer, I want to identify which claims and artifacts are affected by a correction, so that only the relevant analysis sections and slides need regeneration.

23. As an Investment Analyst, I want the system to create a new immutable workspace version after applying corrections, so that I can compare the before and after state with full lineage.

24. As a Partner, I want to see the lineage of a regenerated section (which review triggered it, which claims were invalidated, which evidence was added), so that I can audit the revision history.

25. As an Analysis Agent, I want to receive targeted regeneration tasks for only the affected claims and sections, so that I don't waste compute re-generating unchanged analysis.

26. As an Investment Analyst, I want to create a follow-up project linked to a previous analysis of the same company, so that the new project inherits the previous dossier context and I can track how claims evolved over time.

### Slice 5: The agent asks for missing data, and I provide it

27. As a Valuation Agent, I want to create a DataNeed when I discover missing information (e.g., "Competitor X FY2024 revenue"), so that the gap is tracked explicitly and doesn't block the rest of the analysis.

28. As an Investment Analyst, I want to view all open DataNeeds in a project with their priority and requestor, so that I know what information is still needed to complete the analysis.

29. As a Research Agent, I want to claim and resolve a DataNeed by searching existing dossier evidence or conducting targeted research, so that the analysis can continue with enriched data.

30. As a Customer, I want to be notified when a DataNeed requires proprietary information that only I can provide, so that I can upload the missing data to the data room.

31. As a Valuation Agent, I want analysis to resume automatically after a DataNeed is resolved, so that I don't need to manually restart the valuation workflow.

32. As an Investment Analyst, I want to mark a DataNeed as "unavailable" when the data cannot be found, with an explanation of searched sources and suggested proxy methods, so that the team knows it's a diligence gap rather than a system failure.

33. As a DataNeed Registry, I want to track the full lifecycle of a DataNeed (open → resolving → resolved/estimated/unavailable/needs_human_input), so that the project state is always accurate.

### Slice 6: We close the deal, export the report, and selectively clean up

34. As a Partner, I want the completion evaluator to check that all high-priority claims are sourced, all critical DataNeeds are resolved, all review comments are addressed, and the investment thesis is complete before a project can be finalized, so that incomplete analyses don't go to the IC.

35. As an Investment Analyst, I want to export the final IC-ready report as PPTX and PDF from approved, verified artifacts, so that I can present it to the investment committee.

36. As a Report Agent, I want to consume approved claims, verified financial analysis, and checked charts to generate a deterministic slide deck, so that the report never invents analysis that wasn't already verified.

37. As a Compliance Officer, I want standard closeout to automatically purge all raw files (CIMs, data room uploads, generated PPTX/PDF intermediates) from object storage while retaining the structured claims, evidence, and analysis in the database, so that storage costs are controlled and raw confidential files are destroyed.

38. As a Compliance Officer, I want to trigger confidential redaction on client request, deleting company-specific confidential claims and evidence from the database while retaining public, market, and process knowledge, so that granular removal is possible without destroying the client's accumulated expertise.

39. As a Partner, I want the system to extract candidate reusable lessons from a completed project (e.g., "For vertical SaaS deals, request both GRR and NRR"), so that institutional knowledge improves over time.

40. As a Compliance Officer, I want extracted lessons to be scrubbed of confidential details (company names, revenue figures, proprietary identifiers) and approved by a human before entering the expertise store, so that customer data never leaks.

41. As an Investment Analyst, I want to query the Company Expertise Memory for approved checklists, valuation methodologies, and sector playbooks from past deals, so that I can apply proven frameworks to new projects.

42. As an Investment Analyst, I want to query the Company Dossier for all historical claims about a target company across previous engagements, so that I can compare current findings with past analysis and identify trends.

43. As a System Administrator, I want to perform a full purge on explicit client request, deleting all data for a project from both the database and object storage, so that complete data removal is possible for extreme compliance cases.

44. As a Memory Distillation Agent, I want to identify which claims and evidence from a completed project are retainable (public, market, process) vs. confidential (company-specific), so that the extraction pipeline correctly routes each to the appropriate expertise store or deletion queue.

### Cross-Cutting Governance

45. As a System Administrator, I want to set policy budgets (max cost per agent run, max wall-clock minutes, max open DataNeeds, max task depth) per project, so that agent runs don't spiral out of control.

46. As a Policy Engine, I want to enforce that agents cannot write to global expertise memory, cannot access external search without permission, and cannot exceed cost budgets, so that policies are mechanically guaranteed.

47. As a System Administrator, I want all blackboard state changes recorded in an append-only event log (who changed what, when, and why), so that the system is fully auditable for compliance and debugging.

48. As an Agent Runtime, I want to submit structured results (created artifacts, resolved DataNeeds, invalidated claims) through a typed API, so that the harness can validate and record them durably.

49. As a Pi Runtime, I want to connect to the backend via a standard REST/JSON API with project-scoped tokens, so that I can serve as one of many possible agent implementations without tight coupling.

50. As a System Administrator, I want the database schema to include `customer_id` tenant scoping on all tables from Slice 1, so that future multi-tenancy (external users via UI) requires no migration.

## Implementation Decisions

### Standalone Backend Service

This repo contains the entire platform backend: durable harness, dynamic agent runtime, agent implementations, storage abstractions, and swappable runtime adapters. The frontend is a separate concern that consumes the REST API. The harness must survive any frontend or agent runtime crash or swap.

### Unified PostgreSQL Database for Runtime and Expertise

A single PostgreSQL database holds all structured data: operational runtime data (projects, workspace versions, artifacts metadata, claims, evidence, data needs, review comments, tasks, events) AND accumulated expertise (company dossiers, distilled lessons, market knowledge, company profiles, prompt templates). Tenant-scoped by `customer_id` on every table from Slice 1.

Initially considered separate PostgreSQL instances for runtime and expertise. Rejected because re-runs of the same company analysis (every 6 months, annual reviews) require querying across historical and current data. Cross-system joins, synchronization, or API calls between runtime and expertise are unnecessary complexity for natural longitudinal queries (e.g., "all analyses of AcmeCorp for this client over the past 3 years"). The database IS the company's brain; object storage is temporary scratch space.

Future multi-tenancy (external users via UI) is accommodated without migration because `customer_id` exists from the first table.

### Juice vs. Body

The **Body** (raw files: CIMs, data room uploads, PPTX exports, PDF reports, extracted tables, charts) lives in S3-compatible object storage (MinIO for dev, S3 for prod). It is deletable scratch space. Once claims, evidence, and structured analysis are extracted (the **Juice**), the Body can be purged for cost control or compliance.

The **Juice** (structured data: project metadata, workspace versions, claims, evidence, data needs, review comments, metrics, events) lives in the unified PostgreSQL database. It is the persistent asset that compounds over time. Analysts query the Juice for re-runs, comparisons, and expertise building. The database does not care about file formats — it stores metadata, relationships, and structured content.

### Three-Tier Deletion Model

Client data removal is granular, not monolithic:

1. **Standard closeout** (automatic on project completion): Raw files (Body) are purged from object storage. Structured data (Juice) is retained in the database and linked to the Company Dossier. Project status → `archived`.

2. **Confidential redaction** (on client request): Company-specific confidential claims and evidence are deleted from the database. Public data, market knowledge, process frameworks, and generic expertise are retained. Project status → `purged_confidential`. The client's dossier and accumulated expertise remain intact.

3. **Full purge** (rare, explicit request for extreme compliance): All data for the project is deleted from both the database and object storage. Destroys the project's historical context within the client's tenant. Project status → `purged`.

### Project as Engagement, Company Dossier as Long-Lived Entity

A **Project** is a single engagement (initial due diligence, 6-month follow-up, annual review, portfolio check-in). Each project has its own team, budget, timeline, review cycle, and workspace versions. Re-runs are **new linked projects** (not workspace versions within the same project), connected via a `parentProjectId` or `dossierId` reference.

A **Company Dossier** is the long-lived entity that accumulates all projects analyzing the same target company for the same customer. It enables longitudinal queries: "How have our claims about AcmeCorp's revenue trajectory changed across the initial DD, the 6-month follow-up, and the annual review?"

This model gives flexibility (each engagement is independently managed) while preserving institutional memory (the dossier compounds expertise over time).

### Ingestion Pipeline as First-Class Process

Raw uploaded files are useless until structured data is extracted. The ingestion pipeline is not an afterthought — it is a core subsystem:

- Triggered by file upload to object storage
- Uses document parsing tools: OCR (for scanned PDFs), table extraction (for financial spreadsheets), text extraction (for structured documents), image extraction (for charts and diagrams)
- Output: artifact metadata in the database, extracted text/tables in object storage (as structured artifacts), initial claims and evidence (Slice 3+)
- For Slice 1: basic upload → storage → metadata creation → basic text extraction
- Full parsing (table structure, claim pre-extraction) added in subsequent slices

The pipeline is idempotent: re-running ingestion on the same file with the same extraction version produces the same artifact records (deterministic IDs based on file hash + project + extraction version).

### Hybrid Blackboard Over Workflow Engine

See `docs/adr/0001-hybrid-blackboard-over-workflow-engine.md`.

The durable outer lifecycle is a simple state machine in PostgreSQL (7 states: active → under_review → completed → archived → purged_confidential → purged). The dynamic inner layer is a typed blackboard with an append-only `events` table. Agents discover work by polling the REST API and write idempotent updates back to the blackboard. Task claiming uses row-level locking with leases and heartbeats.

This was chosen over Temporal, Restate, DBOS, and Inngest because the outer lifecycle is too simple for a workflow engine to add value, and the dynamic layer (agents reacting to state, claims being invalidated, workspaces branching) creates impedance mismatch with workflow DSLs.

### Polling API as Universal Task Discovery Contract

All agent runtimes must support polling `GET /tasks?status=pending&capability=...` to discover work. Server-Sent Events (SSE) is an optional latency optimization for deployed agents that can maintain persistent HTTP connections. Pi in SDK/RPC mode can use SSE; Pi in CLI mode or Python scripts use polling.

The event bus carries lightweight notifications only. Agents always read current state from the API.

### REST/JSON API with OpenAPI

Maximum interoperability. Any agent runtime (Pi, Python, custom) can consume the API with standard HTTP. GraphQL and gRPC were considered but rejected for the MVP because they add client complexity without delivering value for this domain's request patterns.

### Prisma + Express

The team already uses Prisma and Express in another project. While Kysely (full SQL control, easier idempotent upserts) and Fastify (performance, built-in OpenAPI) offer real advantages, the differences are not massive for this domain. `$queryRaw` handles the ~10% of queries that need complex graph traversals, recursive CTEs, or `FOR UPDATE SKIP LOCKED`. `zod` + `swagger-ui-express` covers validation and API documentation. Migration cost exceeds benefit.

### Express + Prisma + PostgreSQL + MinIO/S3 + pgvector

- **PostgreSQL**: Unified database for runtime and expertise. Tenant-scoped by `customer_id`.
- **Prisma**: Schema-first ORM with migrations. `$queryRaw` for complex queries.
- **Express**: Familiar framework. `zod` for validation, `swagger-ui-express` for docs.
- **MinIO/S3**: Object storage for raw files (Body). S3-compatible API.
- **pgvector**: PostgreSQL extension for semantic search over claims, evidence, and expertise. Same database, no separate dependency for MVP.

### Idempotency by Design

Every blackboard mutation uses deterministic keys and upsert semantics:
- "Create or update Claim(id='c-456', text='Revenue is $50M', sources=[...])" — idempotent, safe to retry
- "Set DataNeed(id='dn-789') status to 'resolved'" — idempotent
- "Create Artifact(id='a-123') with these exact contents" — idempotent if the ID is deterministic

Agents never "append to a list" or "increment a counter." They "set the list to [A,B,C]" or "set the counter to 5 with source evidence X." This makes task re-claiming after a crash safe without workflow replay magic.

### Deep Modules

The following modules encapsulate significant functionality behind simple, stable interfaces:

- **ProjectBoundaryManager** — create, configure, and close projects. Enforces retention policies, confidentiality classes, and tenant scoping. Orchestrates three-tier deletion.
- **CompanyDossierManager** — create and query long-lived dossiers linking all projects for the same target company. Enables cross-project longitudinal queries and expertise compounding.
- **WorkspaceVersionManager** — create immutable workspace snapshots with parent lineage. Compute deltas between versions. Track which claims and artifacts were added, modified, or invalidated in each version.
- **ArtifactStore** — store artifact metadata in PostgreSQL, files in object storage. Track status (draft → verified → approved → superseded). Manage juice/body separation and body purging.
- **IngestionPipeline** — transform raw uploaded files into structured artifacts. OCR, table extraction, text extraction, image extraction. Triggered by upload events. Idempotent re-processing.
- **ClaimEvidenceGraph** — extract claims from artifacts, link evidence to claims, track confidence and status. Support transitive dependency queries ("which artifacts depend on this claim?"). Enable dossier-level claim comparison across projects.
- **DataNeedRegistry** — structured request lifecycle. Track requestor, need type, acceptable sources, confidence required, and resolution outcome. Support unavailable and estimated resolutions.
- **ReviewIngestion** — classify incoming human feedback. Convert free-text comments into structured actions (new evidence, correction, judgment change, question, approval).
- **ImpactAnalyzer** — given a new evidence injection or correction, identify affected claims, artifacts, and report sections. Create targeted regeneration tasks. Compute minimal delta for workspace versioning.
- **TaskEventSystem** — blackboard event log (append-only), task claiming with leases and heartbeats, polling API, optional SSE event stream. Event schema versioning.
- **AgentRuntimeAdapter** — interface between the harness and external agent runtimes. Accepts AgentRunRequest, dispatches tasks to registered runtimes, collects AgentRunResult. Runtime-agnostic.
- **PolicyEngine** — enforce budgets, permissions, tool access, data-source restrictions, and runtime limits per project. Pure logic module.
- **CompletionEvaluator** — check project state against completion criteria before allowing finalization. Configurable per engagement type.
- **ReportExporter** — deterministic PPTX/PDF generation from approved artifacts and claims. Never invents analysis. Template-based rendering with chart/table generation.
- **MemoryDistillation** — extract expertise from completed projects. Classify retainable vs. confidential. Scrub confidential details. Generalize lessons. Route through human approval gate. Update Company Expertise Memory.
- **CompanyExpertiseManager** — manage the two forms of Company Expertise Memory: raw dossier queries (historical claims across projects) and distilled expertise (generalized frameworks, prompts, methodologies). Serve context to agents in future projects.

Shallow modules (thin wrappers, not tested independently): Express routes, Prisma repositories, middleware, auth handlers.

## Testing Decisions

### What Makes a Good Test

Tests verify **external behavior and contracts**, not implementation details. A good test exercises a module's public interface with realistic inputs and asserts on the outputs and side effects that a caller would observe. Tests do not assert on internal state, database query counts, or private method calls.

### Module Test Strategy

| Module | Test Type | Priority | Rationale |
|---|---|---|---|
| ProjectBoundaryManager | Unit/Integration | High | Core lifecycle logic; tenant scoping and deletion correctness are compliance-critical |
| CompanyDossierManager | Integration | High | Cross-project queries and longitudinal analysis are the product's unique value |
| WorkspaceVersionManager | Unit/Integration | High | Immutable snapshots and lineage are critical for auditability |
| ArtifactStore | Integration | Medium | Must correctly handle metadata + object storage interactions and body purging |
| IngestionPipeline | Integration | **Critical** | Parse accuracy determines downstream analysis quality. OCR, table extraction, and claim pre-extraction must be correct |
| ClaimEvidenceGraph | Integration | **Critical** | Graph traversal and dependency queries are the governance backbone. Incorrect impact analysis leads to wrong regeneration |
| DataNeedRegistry | Unit/Integration | Medium | State machine lifecycle must be correct |
| TaskEventSystem | Integration | **Critical** | Task claiming, lease expiration, and event emission are concurrency-sensitive. Bugs here cause duplicate work or lost tasks |
| AgentRuntimeAdapter | Integration | High | Contract between harness and runtimes must be stable |
| PolicyEngine | Unit | Medium | Budget enforcement and permission checks are pure logic |
| CompletionEvaluator | Unit | Medium | Criteria evaluation is deterministic logic |
| ImpactAnalyzer | Integration | **Critical** | Multi-hop dependency analysis determines what gets regenerated. Incorrect impact analysis wastes compute or misses errors |
| ReportExporter | Integration | Medium | PPTX/PDF output must match expected structure |
| MemoryDistillation | Integration | Medium | Destruction and extraction workflows must be reliable |
| CompanyExpertiseManager | Integration | High | Dossier queries and expertise retrieval must be correct for re-run quality |

### API Integration Tests

Each vertical slice has at least one end-to-end test exercising the full API flow:

- **Slice 1:** `POST /projects` → `POST /projects/:id/upload` → ingestion pipeline processes file → `GET /projects/:id/artifacts` → assert artifact metadata and extracted text.
- **Slice 2:** Upload document → `POST /projects/:id/agent-runs` → poll for completion → `GET /artifacts/:id` → assert markdown content, agent attribution, and source lineage.
- **Slice 3:** Trigger agent → `GET /claims` → assert extracted claims → `GET /evidence` → assert linked sources → `POST /verify` → assert unsupported claims flagged. Query dossier for historical claims.
- **Slice 4:** Submit review comment → `GET /tasks` → assert regeneration task created → `GET /workspace-versions` → assert v2 created → `GET /artifacts/:id` → assert corrected content. Create linked follow-up project.
- **Slice 5:** Trigger valuation → assert DataNeed created → resolve DataNeed → assert analysis artifact updated. Test unavailable resolution path.
- **Slice 6:** Set completion criteria → `POST /projects/:id/closeout` → assert report exported → assert raw files purged → assert structured data archived → assert dossier updated → assert expertise candidate extracted.

### Failure Recovery Tests

Explicit tests for the hybrid model's failure handling:

- **Task crash mid-execution:** An agent claims a task, writes partial state, and crashes. After lease expiration, another agent claims the same task. Assert idempotent writes produce correct final state with no duplicates.
- **Concurrent task claiming:** Two agents poll simultaneously. Assert only one succeeds (via `FOR UPDATE SKIP LOCKED` or equivalent).
- **Event log ordering:** A sequence of state changes is recorded. Assert event log is append-only and total-order per project.
- **Body purge after extraction:** Upload file → run ingestion → assert artifact created → trigger body purge → assert file removed from object storage → assert artifact metadata and extracted Juice remain in database.
- **Three-tier deletion:** Create project with confidential and retainable claims → standard closeout → assert body purged, Juice retained → confidential redaction → assert confidential claims deleted, retainable claims present → full purge → assert all data removed.

### Test Infrastructure

- **Integration tests use a real PostgreSQL database** via Docker or a test-container library (e.g., `testcontainers`). No mocking of Prisma or the database layer.
- **Object storage tests use MinIO** in Docker, not mocked S3.
- **Unit tests for pure logic** (PolicyEngine, CompletionEvaluator) use in-memory fixtures.
- **Test fixtures** create realistic domain objects representing a fictional acquisition target (e.g., a vertical SaaS company called "AcmeCorp"). The same fixtures are reused across slice tests to ensure consistency and reduce setup boilerplate. Fixtures include a CIM document, expected research summary claims, expected financial metrics, and sample review comments.
- **No frontend tests** — frontend is out of scope.

## Out of Scope

- **Frontend UI** — project setup portal, customer upload interface, review/comment UI, artifact viewer, report preview, admin dashboard. The backend exposes a REST API; any frontend can consume it.
- **Specific LLM model integration** — the system abstracts LLM calls behind a provider interface. Specific models (Claude, GPT-4, Gemini) and providers (Anthropic, OpenAI, Azure) are swappable.
- **Production deployment infrastructure** — Kubernetes manifests, Terraform, CI/CD pipelines, monitoring/observability stack. The repo contains the application code; deployment is a separate concern.
- **Billing or multi-tenant SaaS features** — no usage-based billing, no customer subscription management, no tenant provisioning or onboarding UI. The `customer_id` tenant boundary exists in the schema but tenant management is future work.
- **Real-time collaborative editing** — no WebSocket-based co-editing of artifacts or comments. Review comments are submitted as discrete structured inputs.
- **Mobile app or native client** — API-first backend; clients consume REST/JSON.
- **Third-party CRM/ERP integrations** — no Salesforce, HubSpot, or portfolio management system integrations. Data enters via upload or agent research.
- **Automated trading or execution** — this is an analysis and reporting system, not a trading platform.
- **Separate graph database or vector database** — for MVP, graph traversal and semantic search use PostgreSQL with `pgvector`. Migration to Neo4j, Pinecone, Weaviate, or Qdrant is a future enhancement if query patterns or volume demand it.
- **Advanced prompt evolution** — while the architecture accommodates evolving prompts and methodologies, automatic prompt optimization or reinforcement learning for prompts is post-MVP. Slice 6 includes manual extraction and approval of expertise lessons; automated prompt improvement is a future enhancement.

## Further Notes

- **Prisma schema is not a 1:1 mapping of the requirements' TypeScript interfaces.** The requirements show domain types — what the system means. The Prisma schema shows persistence shapes — how the system stores. These are allowed to differ. For example, a `Claim` in the domain has `sourceArtifactIds: string[]`; in Prisma this might be a join table or a JSONB array depending on query patterns.
- **Agent implementations start simple and grow with slices.** Slice 2's Intake/Research agent reads documents and writes markdown. Slice 3's agent adds claim extraction. Slice 4's agents handle review and regeneration. Slice 5's agents manage DataNeeds. Each slice adds agent capabilities; agents are not fully general from day one.
- **Workspace versions are immutable within a project.** Once created, a workspace version never changes. Corrections create a new version (v1 → v2) with a parent pointer. This enables full lineage, before/after comparison, and rollback within an engagement.
- **The event log is the source of truth for the pub/sub layer.** The `events` table is append-only: `(id, project_id, event_type, payload, occurred_at, tenant_id)`. Consumers read from this table or receive notifications derived from it. Events are not the source of truth for state — the blackboard tables are. The event log enables audit, replay, and debugging.
- **Policy defaults are hardcoded per engagement type** for the MVP. Configurable per-customer policies are a future enhancement. Initial policy defaults enforce: no global memory writes, external search disabled by default, cost budgets per project, runtime limits per agent run.
- **The Pi adapter is implemented as an HTTP client** that polls the backend API. A future enhancement may add SDK embedding (`createAgentSessionRuntime()`) or RPC mode (`pi --mode rpc`) for tighter integration when Pi is the primary runtime.
- **Report generation is deterministic.** The Report Agent never invents analysis. It consumes approved artifacts, verified claims, and checked charts. The narrative planner, slide/message map, chart generator, and template renderer are deterministic stages. If the inputs change, the output changes predictably.
- **Dossier queries span projects but respect tenant boundaries.** A query for "all claims about AcmeCorp" is scoped to `customer_id`. No cross-tenant data leakage is possible by design because `customer_id` is part of every table's primary query key.
- **Body purging is asynchronous and retryable.** The standard closeout workflow marks raw files for deletion and updates artifact metadata. An async worker (or scheduled job) performs the actual object storage deletion. If deletion fails, it retries. The database record tracks purge status (pending → purged → failed).
- **Ingestion pipeline versioning:** Document parsers and extractors have version numbers. Re-ingesting a file with a new extractor version creates new artifact records (deterministic IDs based on file hash + project + extractor version). Old artifacts are marked `superseded`.
