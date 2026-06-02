# PRD: NbeamNG Backend Platform (Resliced)

## Problem Statement

Investment analysis is iterative, uncertain, deeply collaborative, and **longitudinal**. A customer provides initial information (CIMs, financials, portfolio details); agents conduct research, valuation, and strategic analysis; reviewers (analysts, VPs, partners) provide corrections, challenge assumptions, and supply new evidence. The system must produce IC-ready PPTX/PDF deliverables.

But investment analysis is not one-shot. A deal team analyzes Company X today, returns in six months for a follow-up diligence, and again in a year for portfolio review. Each re-run builds on the previous. The system must remember what was learned, track how claims changed, and compound expertise over time.

Current approaches fail in two directions:

1. **Rigid predefined workflows** break when real work happens: a customer uploads new portfolio details after seeing the first draft, a partner reframes the investment thesis, a valuation requires one extra datapoint. Workflows encoded as linear pipelines cannot handle iterative, longitudinal analysis.

2. **Uncontrolled agent swarms** let agents call each other directly with no durable system of record. There is no audit trail, no evidence tracing for claims in the final report, no selective regeneration of affected sections, no guaranteed isolation of confidential data, and no compounding expertise across engagements.

NbeamNG must be a **governed dynamic agent workspace**: a durable, auditable, secure harness around a flexible agent runtime. Every material claim in the final report traces to source evidence. Every correction triggers targeted regeneration of affected sections, not a full rerun. Raw files are purged after structured knowledge is extracted — the "juice" is retained, the "body" is disposable. Confidential company-specific data is granularly deletable on client request. Reusable expertise compounds across every engagement, creating a moat against competitors starting from scratch.

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

## Vertical Slices

The platform is built in **ten vertical slices**, each producing an end-to-end, API-testable outcome. Infrastructure (tables, endpoints, storage) emerges from each slice's needs. No horizontal "build all the schema first" phase.

Cross-cutting capabilities — tenant scoping, audit logging, idempotency, policies — begin at their minimum viable level in the first slice that needs them and mature incrementally. See [Cross-cutting Feature Maturity](#cross-cutting-feature-maturity).

| Slice | Outcome | Why it comes here |
|---|---|---|
| **1. Ingest a deal** | Create project, upload CIM, extract text, list artifacts | Establishes the governed workspace |
| **2. Generate an auditable first draft** | Agent claims task, reads extracted content, produces structured summary with source references | First user-visible value and first quality benchmark |
| **3. Track and resolve DataNeeds** | Agent raises missing datapoint, another task or human resolves it, blocked analysis resumes | Proves dynamic orchestration with manageable complexity |
| **4. Govern material claims** | Typed claims, evidence links, support status, reliability metadata | Establishes analytical trust |
| **5. Verify claims and detect contradictions** | Verifier agent, unsupported-claim detection, confidence metadata, conflicting evidence | Validates analytical trust |
| **6. Apply human corrections** | Structured review comments, invalidations, immutable v2, manual section regeneration | Proves iterative collaboration |
| **7. Suggest impact and regenerate** | Direct dependency lookup, suggested affected sections, conservative invalidation, targeted regeneration | Proves efficient revision workflow |
| **8. Finalize and export** | Completion checks, approved content, deterministic PPTX/PDF rendering | Produces an IC-ready deliverable |
| **9. Longitudinal dossiers** | Linked follow-up project, historical-claim comparison, tenant-scoped context reuse | Demonstrates compounding customer value |
| **10. Harden deletion and expertise memory** | Redaction taxonomy, full purge, deletion receipts, approved distillation, playbooks | Adds compliance maturity and the longer-term moat |

---

### Slice 1: Ingest a Deal

**Outcome:** A governed workspace exists. A user can create a project, upload a PDF CIM, and retrieve extracted text with stable identifiers and tenant isolation.

#### User Stories

1. As an Investment Analyst, I want to create a new project for an acquisition target with a confidentiality class, so that I have a governed workspace for the deal.

2. As a Customer, I want to upload a CIM, financial statements, and portfolio overview to a project, so that the system has the initial materials for analysis.

3. As a System Administrator, I want uploaded files stored in project-scoped object storage with encryption at rest, so that no other tenant can access them.

4. As a System Administrator, I want the ingestion pipeline to automatically parse uploaded PDFs, extract text, and create structured artifact records in the database, so that agents can read the content without re-parsing raw files.

5. As an Investment Analyst, I want to view all artifacts in a project's current workspace version, so that I can confirm all documents were ingested and stored correctly.

6. As a Compliance Officer, I want the system to apply a basic confidentiality label (`confidential`, `public`, or `unknown`) at ingestion time, so that downstream workflows know the default disposition.

#### Exit Criterion

Upload one realistic CIM and retrieve a usable structured representation with stable identifiers and tenant isolation. The schema reserves columns for retention policies and classification taxonomy, but this slice does not prove sophisticated document classification, configurable retention logic, automatic closeout purge, OCR optimization across difficult scans, robust table extraction, or image/chart extraction.

**System correctness:** `POST /projects` → `POST /projects/:id/upload` → ingestion pipeline processes file → `GET /projects/:id/artifacts` → assert artifact metadata and extracted text.

**Analytical gate:** The extracted text preserves document structure (page boundaries, paragraph breaks) sufficiently for an agent to locate source passages by rough position.

---

### Slice 2: Generate an Auditable First Draft

**Outcome:** The first analytical value is visible. An agent reads the extracted CIM and produces a structured research summary with section-level source references, agent attribution, and lineage.

#### User Stories

7. As an Investment Analyst, I want to trigger an agent run to analyze uploaded documents, so that I get a draft research summary artifact.

8. As an Intake/Research Agent, I want to read the structured artifact content extracted from the CIM, so that I can produce a structured research summary without re-parsing the raw PDF.

9. As an Investment Analyst, I want the generated research summary to follow a narrow investment-summary schema (company overview, business model, revenue model, key financial figures found in the source, customers and concentration, market and competitors, strengths, risks, unanswered questions, source references by section), so that the output is predictable and machine-readable even when rendered as markdown for human readability.

10. As an Investment Analyst, I want to view the generated research summary artifact with metadata showing which agent created it, when, and from which source artifacts and sections, so that I can assess the initial analysis quality and lineage.

11. As a System Administrator, I want agent runs to be logged with status (pending, claimed, in-progress, completed, failed), runtime, cost, and assigned tenant, so that I can monitor system usage and enforce budgets.

12. As an Agent Runtime, I want to claim a pending task via a polling API scoped to my tenant and project, so that I can participate in the system regardless of my implementation language.

#### Exit Criterion

A reviewer can inspect the generated summary, locate the source passages behind key statements, and determine whether the system is producing a useful first draft. The agent records `sourceArtifactId` and `sourceSectionRef` on each section of the summary, creating a lightweight evidence trail that Slice 4's claim extraction will build on.

**System correctness:** Upload document → `POST /projects/:id/agent-runs` → poll for completion → `GET /artifacts/:id` → assert structured content, agent attribution, and source lineage.

**Analytical gate:** Does the summary recover the expected facts from a test CIM? Use several fictional or sanitized CIMs with expected facts and known omissions. The first evaluation dataset is created in this slice.

#### Avoid in This Slice

Multiple specialized agents, autonomous research, contradiction analysis, sophisticated claim graphs, semantic-memory retrieval, report export.

---

### Slice 3: Track and Resolve DataNeeds

**Outcome:** The system demonstrates dynamic agent collaboration without becoming an uncontrolled swarm. An agent identifies a missing fact, the gap becomes a durable object, a human or another agent resolves it, and blocked work resumes.

#### User Stories

13. As an Intake/Research Agent, I want to create a DataNeed when I discover missing information during draft generation (e.g., "Competitor X FY2024 revenue"), so that the gap is tracked explicitly and doesn't block the rest of the analysis.

14. As an Investment Analyst, I want to view all open DataNeeds in a project with their priority and requestor, so that I know what information is still needed to complete the analysis.

15. As a Research Agent, I want to claim and resolve a DataNeed by searching existing dossier evidence or receiving data from a human, so that the analysis can continue with enriched data.

16. As a Customer, I want to be notified when a DataNeed requires proprietary information that only I can provide, so that I can upload the missing data to the data room.

17. As an Intake/Research Agent, I want analysis to resume automatically after a DataNeed is resolved, so that I don't need to manually restart the draft workflow.

18. As an Investment Analyst, I want to mark a DataNeed as `unavailable` when the data cannot be found, with an explanation of searched sources and suggested proxy methods, so that the team knows it's a diligence gap rather than a system failure.

19. As a DataNeed Registry, I want to track the full lifecycle of a DataNeed (`open → resolving → resolved / estimated / unavailable / needs_human_input`), so that the project state is always accurate.

#### Exit Criterion

The initial analysis identifies a missing competitor revenue figure, creates a DataNeed, receives a resolution or an explicit `unavailable` outcome, and updates the analysis without rerunning unrelated work.

**System correctness:** Trigger analysis → assert DataNeed created → resolve DataNeed → assert analysis artifact updated. Test unavailable resolution path.

**Analytical gate:** Does the agent identify genuinely missing information rather than asking generic questions? A good DataNeed names a specific fact, names the requesting analysis section, and explains why the fact is material.

#### Avoid in This Slice

External web research permissions, dossier search for resolution, proxy estimation methods, competing resolution candidates, confidence thresholds, budget-aware research strategies. These are later enhancements.

---

### Slice 4: Govern Material Claims

**Outcome:** Every material assertion in the analysis is individually traceable. Typed claims link to source evidence with coordinates. Reviewers can inspect the claim graph and see which assertions are supported, unsupported, or drafted.

#### User Stories

20. As a Research/Analysis Agent, I want the system to extract typed material claims from generated artifacts, so that every important assertion is individually traceable and verifiable.

21. As an Investment Analyst, I want to see which evidence items support each claim, with source coordinates (page, paragraph, table cell, or external URL), so that I can trace assertions back to specific passages in the source materials.

22. As an Investment Analyst, I want claims to have a constrained taxonomy (financial fact, operational KPI, market fact, valuation input, management assertion, calculated metric, analyst judgment, risk, hypothesis), so that the claim graph is structured and reviewable.

23. As an Investment Analyst, I want claims to have statuses (`draft`, `supported`, `unsupported`, `needs_review`), so that I know which assertions are verified and which require attention.

24. As an Investment Analyst, I want basic source reliability categories attached to evidence, so that I can distinguish audited filings from management assertions from analyst estimates.

#### Exit Criterion

Reviewers can inspect each material claim, trace it to evidence, and see which assertions are unsupported. The system does not yet automatically detect contradictions or compute confidence scores — that is Slice 5.

**System correctness:** Trigger agent → `GET /claims` → assert extracted claims → `GET /evidence` → assert linked sources.

**Analytical gate:** Are material claims linked to the right source passages? A claim about revenue should point to the financial section of the CIM, not a generic forward-looking statement.

#### Avoid in This Slice

Automated verification, confidence scoring, contradiction detection, unsupported-claim escalation rules, historical dossier queries.

---

### Slice 5: Verify Claims and Detect Contradictions

**Outcome:** The system validates its own analytical trust. A verifier agent checks claims against evidence, flags unsupported assertions, detects conflicts, and surfaces inconsistencies before human review.

#### User Stories

25. As a Verifier Agent, I want to check that every material claim has supporting evidence linked to source documents, so that unsupported claims are flagged before they reach the report.

26. As a Partner, I want claims to have structured confidence metadata (evidence type, source reliability, extraction certainty, calculation status, conflict status, human review status), so that I know which assertions are well-supported vs. speculative or estimated.

27. As a Verifier Agent, I want to flag claims that contradict other claims or existing evidence, so that inconsistencies are surfaced before human review.

28. As an Investment Analyst, I want unsupported claims to be automatically marked with a `needs_review` status and escalated, so that no unverified assertions slip into the final IC memo.

#### Exit Criterion

Reviewers can see which claims are disputed, poorly sourced, or inconsistent. Confidence is structured metadata, not a single vaguely meaningful model-generated number.

**System correctness:** `POST /verify` → assert unsupported claims flagged → assert contradictions detected.

**Analytical gate:** Does the verifier correctly distinguish between a claim supported by audited financials and a claim supported only by a management assertion? Does it catch genuine contradictions (e.g., two revenue figures from different sections) without flagging every minor discrepancy?

---

### Slice 6: Apply Human Corrections

**Outcome:** Human feedback changes the state of the workspace. A reviewer submits a correction, the system invalidates the affected claim, creates an immutable workspace version `v2`, and regenerates selected sections with full lineage.

#### User Stories

29. As a Customer, I want to submit a review comment correcting an analysis error (e.g., "Revenue is $50M, not $30M"), so that the investment summary is accurate.

30. As a Review Ingestion Agent, I want to classify incoming comments as corrections, new evidence, judgment changes, style changes, questions, or approvals, so that the system routes them to the correct downstream handlers.

31. As an Investment Analyst, I want the system to create a new immutable workspace version after applying corrections, so that I can compare the before and after state with full lineage.

32. As a Partner, I want to see the lineage of a regenerated section (which review triggered it, which claims were invalidated, which evidence was added), so that I can audit the revision history.

33. As an Analysis Agent, I want to receive targeted regeneration tasks for manually selected sections, so that I don't waste compute re-generating unchanged analysis.

#### Exit Criterion

Submit a correction, create workspace version `v2`, regenerate a selected section, and show complete lineage from comment to revised artifact. Impact analysis is manual in this slice — the analyst selects affected sections.

**System correctness:** Submit review comment → `GET /tasks` → assert regeneration task created → `GET /workspace-versions` → assert v2 created → `GET /artifacts/:id` → assert corrected content.

**Analytical gate:** Does changing a revenue figure update all sections that the analyst manually selected? Is the lineage complete and auditable?

#### Avoid in This Slice

Automated impact analysis (which sections are affected), conservative invalidation rules, fully automated targeted regeneration. These are Slice 7.

---

### Slice 7: Suggest Impact and Regenerate

**Outcome:** The system understands its own dependencies. Given a correction, it suggests which claims, artifacts, and report sections are affected. After validating suggestion accuracy, the system can automatically regenerate a minimal set of sections.

#### User Stories

34. As an Impact Analyzer, I want to identify which claims and artifacts are directly affected by a correction, so that analysts know which sections to review.

35. As an Investment Analyst, I want the system to suggest affected sections when a claim is invalidated (e.g., changing revenue marks financial summary, margin calculations, valuation inputs, operating-case narrative, executive summary, relevant charts), so that I don't miss downstream consequences.

36. As an Investment Analyst, I want the system to over-invalidate rather than under-invalidate when suggesting affected sections, so that no inconsistent analysis remains in the report.

37. As a Partner, I want to confirm suggested affected sections before regeneration proceeds, so that I retain oversight of the revision scope.

38. As an Analysis Agent, I want to receive fully automated targeted regeneration tasks for only the affected claims and sections, so that the system regenerates the minimal necessary delta after an analyst confirms the impact scope.

#### Exit Criterion

Change a revenue figure, and the system correctly marks all materially affected sections. After measuring suggestion accuracy across real corrections, the system can regenerate automatically with analyst confirmation.

**System correctness:** Submit correction → assert impact suggestions → confirm scope → assert targeted regeneration task created → assert minimal delta in v3.

**Analytical gate:** Does changing a revenue figure update all materially affected sections? Are unmaterial sections left untouched? Is the before/after delta explainable?

---

### Slice 8: Finalize and Export

**Outcome:** The system produces a complete analytical deliverable. Completion checks block finalization of incomplete analyses. Approved content renders deterministically into PPTX and PDF.

#### User Stories

39. As a Partner, I want the completion evaluator to check that all high-priority claims are sourced, all critical DataNeeds are resolved, all review comments are addressed, and the investment thesis is complete before a project can be finalized, so that incomplete analyses don't go to the IC.

40. As an Investment Analyst, I want to export the final IC-ready report as PPTX and PDF from approved, verified artifacts, so that I can present it to the investment committee.

41. As a Report Agent, I want to consume approved claims, verified financial analysis, and checked charts to generate a deterministic slide deck, so that the report never invents analysis that wasn't already verified.

42. As a Partner, I want the exported report to include export lineage (which workspace version, which claims, which artifacts contributed to each slide), so that the deliverable is auditable.

#### Exit Criterion

A project passes completion checks, is marked approved, and renders to an internally consistent, presentation-ready PPTX and PDF. The report contains only verified claims and resolved DataNeeds.

**System correctness:** Set completion criteria → `POST /projects/:id/finalize` → assert report exported → assert export lineage recorded.

**Analytical gate:** Is the resulting deck internally consistent and presentation-ready? Does every slide trace to approved claims? Are there no orphaned references to invalidated claims from earlier versions?

---

### Slice 9: Longitudinal Dossiers

**Outcome:** The system demonstrates compounding value. A new project can be linked to previous analyses of the same target company, inheriting historical claims and enabling longitudinal comparison.

#### User Stories

43. As an Investment Analyst, I want to create a follow-up project linked to a previous analysis of the same company, so that the new project inherits the previous dossier context and I can track how claims evolved over time.

44. As an Investment Analyst, I want to query the Company Dossier for past claims about the same target company from previous projects, so that I can compare current analysis with historical assertions and identify changes.

45. As an Investment Analyst, I want dossier queries to respect tenant boundaries, so that no cross-customer data leakage is possible.

46. As a Research Agent, I want prior-project context to be available when generating a new draft, so that follow-up analyses build on previous findings rather than starting from scratch.

#### Exit Criterion

A linked follow-up project is created, queries the dossier for historical claims, and the new analysis improves because it incorporates prior findings without propagating stale assumptions.

**System correctness:** Create project with `parentProjectId` → assert dossier linked → query historical claims → assert tenant isolation.

**Analytical gate:** Does prior-project context improve the follow-up analysis without propagating stale assumptions? If a claim was invalidated in v2 of the previous project, the dossier should surface the latest status, not the original claim.

---

### Slice 10: Harden Deletion and Expertise Memory

**Outcome:** The system achieves compliance maturity and begins building a long-term moat. Raw files are purged after extraction. Company-specific confidential data is granularly deletable. Reusable expertise is extracted, scrubbed, approved, and retrieved in future projects.

#### User Stories

47. As a Compliance Officer, I want standard closeout to automatically purge all raw files (CIMs, data room uploads, generated PPTX/PDF intermediates) from object storage while retaining the structured claims, evidence, and analysis in the database, so that storage costs are controlled and raw confidential files are destroyed.

48. As a Compliance Officer, I want to trigger confidential redaction on client request, deleting company-specific confidential claims and evidence from the database while retaining public, market, and process knowledge, so that granular removal is possible without destroying the client's accumulated expertise.

49. As a System Administrator, I want to perform a full purge on explicit client request, deleting all data for a project from both the database and object storage, so that complete data removal is possible for extreme compliance cases.

50. As a System Administrator, I want body purging to be asynchronous and retryable with deletion receipts and purge-status tracking (`pending → purged → failed`), so that the operation is reliable and auditable.

51. As a Memory Distillation Agent, I want to extract candidate reusable lessons from a completed project (e.g., "For vertical SaaS deals, request both GRR and NRR"), so that institutional knowledge improves over time.

52. As a Compliance Officer, I want extracted lessons to be scrubbed of confidential details (company names, revenue figures, proprietary identifiers) and approved by a human before entering the expertise store, so that customer data never leaks.

53. As an Investment Analyst, I want to query the Company Expertise Memory for approved checklists, valuation methodologies, and sector playbooks from past deals, so that I can apply proven frameworks to new projects.

54. As a Memory Distillation Agent, I want to identify which claims and evidence from a completed project are retainable (public, market, process) vs. confidential (company-specific), so that the extraction pipeline correctly routes each to the appropriate expertise store or deletion queue.

#### Exit Criterion

A project is closed out: raw files purged, structured data archived, confidential redaction possible, full purge possible, lessons extracted and approved, expertise retrievable. Classification inheritance across raw files, extracted text, tables, claims, evidence snippets, embeddings, generated artifacts, reports, event payloads, logs, and backups is defined and tested.

**System correctness:** Upload file → run ingestion → assert artifact created → trigger body purge → assert file removed from object storage → assert artifact metadata and extracted Juice remain in database. Test three-tier deletion end-to-end.

**Analytical gate:** Do retrieved lessons measurably improve future analyses? Compare draft quality with and without expertise retrieval.

#### Sequencing Note

This slice combines compliance hardening and long-term moat-building because both require the same prerequisite: a mature classification taxonomy that distinguishes retainable from confidential data. Granular redaction (48) and expertise extraction (51-54) are two sides of the same classification problem. However, if the team prefers, standard closeout (47, 50) may be moved earlier (immediately after Slice 8) as a separate milestone, with confidential redaction and expertise memory remaining as the final slice.

---

## Cross-cutting Feature Maturity

These capabilities start at minimum viable complexity in the first slice that needs them and deepen incrementally. They are never "done" in a single slice.

| Capability | Minimum version (starts in) | Later hardening |
|---|---|---|
| Tenant scoping | `customer_id` on every table and query (Slice 1) | Row-level security tests, administrative tooling |
| Audit log | Append-only events for material state changes (Slice 1) | Schema versioning, replay tooling, compliance export |
| Idempotency | Deterministic IDs and safe retries (Slice 1) | More complex recovery tests, distributed-worker hardening |
| Policies | Hardcoded budgets and permissions (Slice 2) | Per-customer configuration |
| Confidentiality | Simple inherited labels (Slice 1) | Derived-data lineage and granular redaction (Slice 10) |
| Evidence | Source references on initial drafts (Slice 2) | Claim-level verification and contradiction analysis (Slice 5) |
| Regeneration | Manual section selection (Slice 6) | Suggested impact analysis (Slice 7), then automation |
| Runtime abstraction | One adapter interface and one working runtime (Slice 2) | Additional adapters after the contract stabilizes |
| Task claiming | Row-level locking with leases and heartbeats (Slice 2) | Lease expiration recovery, concurrent claiming tests |

---

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
- Output: artifact metadata in the database, extracted text/tables in object storage (as structured artifacts), initial claims and evidence (Slice 4+)
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

---

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
- **Slice 2:** Upload document → `POST /projects/:id/agent-runs` → poll for completion → `GET /artifacts/:id` → assert structured content, agent attribution, and source lineage.
- **Slice 3:** Trigger analysis → assert DataNeed created → resolve DataNeed → assert analysis artifact updated. Test unavailable resolution path.
- **Slice 4:** Trigger agent → `GET /claims` → assert extracted claims → `GET /evidence` → assert linked sources.
- **Slice 5:** `POST /verify` → assert unsupported claims flagged → assert contradictions detected.
- **Slice 6:** Submit review comment → `GET /tasks` → assert regeneration task created → `GET /workspace-versions` → assert v2 created → `GET /artifacts/:id` → assert corrected content.
- **Slice 7:** Submit correction → assert impact suggestions → confirm scope → assert targeted regeneration task created → assert minimal delta in v3.
- **Slice 8:** Set completion criteria → `POST /projects/:id/finalize` → assert report exported → assert export lineage recorded.
- **Slice 9:** Create project with `parentProjectId` → assert dossier linked → query historical claims → assert tenant isolation.
- **Slice 10:** Upload file → run ingestion → assert artifact created → trigger body purge → assert file removed from object storage → assert artifact metadata and extracted Juice remain in database. Test three-tier deletion end-to-end.

### Failure Recovery Tests

Explicit tests for the hybrid model's failure handling, introduced as the associated capability appears:

- **Task crash mid-execution (Slice 2+):** An agent claims a task, writes partial state, and crashes. After lease expiration, another agent claims the same task. Assert idempotent writes produce correct final state with no duplicates.
- **Concurrent task claiming (Slice 2+):** Two agents poll simultaneously. Assert only one succeeds (via `FOR UPDATE SKIP LOCKED` or equivalent).
- **Event log ordering (Slice 1+):** A sequence of state changes is recorded. Assert event log is append-only and total-order per project.
- **Body purge after extraction (Slice 10):** Upload file → run ingestion → assert artifact created → trigger body purge → assert file removed from object storage → assert artifact metadata and extracted Juice remain in database.
- **Three-tier deletion (Slice 10):** Create project with confidential and retainable claims → standard closeout → assert body purged, Juice retained → confidential redaction → assert confidential claims deleted, retainable claims present → full purge → assert all data removed.

### Evaluation Gates

Each slice must pass two gates before the next slice begins:

1. **System correctness:** Did the API, database, and worker behavior work as specified?
2. **Analytical usefulness:** Did the output become better for an investment analyst?

| Slice | Analytical Gate |
|---|---|
| 1. Ingest a deal | The extracted text preserves document structure (page boundaries, paragraph breaks) sufficiently for source passage lookup. |
| 2. Auditable first draft | Does the summary recover the expected facts from a test CIM? |
| 3. Track and resolve DataNeeds | Does the agent identify genuinely missing information rather than asking generic questions? |
| 4. Govern material claims | Are material claims linked to the right source passages? |
| 5. Verify claims and detect contradictions | Does the verifier correctly distinguish evidence quality and catch genuine contradictions? |
| 6. Apply human corrections | Does changing a revenue figure update all sections that the analyst selected? Is lineage complete? |
| 7. Suggest impact and regenerate | Does changing a revenue figure update all materially affected sections? Is the delta minimal and explainable? |
| 8. Finalize and export | Is the resulting deck internally consistent and presentation-ready? Are there no orphaned references to invalidated claims? |
| 9. Longitudinal dossiers | Does prior-project context improve the follow-up analysis without propagating stale assumptions? |
| 10. Harden deletion and expertise memory | Do retrieved lessons measurably improve future analyses? |

### Test Infrastructure

- **Integration tests use a real PostgreSQL database** via Docker or a test-container library (e.g., `testcontainers`). No mocking of Prisma or the database layer.
- **Object storage tests use MinIO** in Docker, not mocked S3.
- **Unit tests for pure logic** (PolicyEngine, CompletionEvaluator) use in-memory fixtures.
- **Test fixtures** create realistic domain objects representing a fictional acquisition target (e.g., a vertical SaaS company called "AcmeCorp"). The same fixtures are reused across slice tests to ensure consistency and reduce setup boilerplate. Fixtures include a CIM document, expected research summary claims, expected financial metrics, sample review comments, and expected DataNeeds.
- **No frontend tests** — frontend is out of scope.

---

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
- **Advanced prompt evolution** — while the architecture accommodates evolving prompts and methodologies, automatic prompt optimization or reinforcement learning for prompts is post-MVP. Slice 10 includes manual extraction and approval of expertise lessons; automated prompt improvement is a future enhancement.

---

## Further Notes

- **Prisma schema is not a 1:1 mapping of the requirements' TypeScript interfaces.** The requirements show domain types — what the system means. The Prisma schema shows persistence shapes — how the system stores. These are allowed to differ. For example, a `Claim` in the domain has `sourceArtifactIds: string[]`; in Prisma this might be a join table or a JSONB array depending on query patterns.
- **Agent implementations start simple and grow with slices.** Slice 2's Intake/Research agent reads documents and writes a structured summary with source references. Slice 3's agent raises DataNeeds. Slice 4's agent adds claim extraction. Slice 5's agent adds verification. Slice 6's agents handle review and manual regeneration. Slice 7's agents add impact analysis and automated regeneration. Each slice adds agent capabilities; agents are not fully general from day one.
- **Workspace versions are immutable within a project.** Once created, a workspace version never changes. Corrections create a new version (v1 → v2) with a parent pointer. This enables full lineage, before/after comparison, and rollback within an engagement.
- **The event log is the source of truth for the pub/sub layer.** The `events` table is append-only: `(id, project_id, event_type, payload, occurred_at, tenant_id)`. Consumers read from this table or receive notifications derived from it. Events are not the source of truth for state — the blackboard tables are. The event log enables audit, replay, and debugging.
- **Policy defaults are hardcoded per engagement type** for the MVP. Configurable per-customer policies are a future enhancement. Initial policy defaults enforce: no global memory writes, external search disabled by default, cost budgets per project, runtime limits per agent run.
- **The Pi adapter is implemented as an HTTP client** that polls the backend API. A future enhancement may add SDK embedding (`createAgentSessionRuntime()`) or RPC mode (`pi --mode rpc`) for tighter integration when Pi is the primary runtime.
- **Report generation is deterministic.** The Report Agent never invents analysis. It consumes approved artifacts, verified claims, and checked charts. The narrative planner, slide/message map, chart generator, and template renderer are deterministic stages. If the inputs change, the output changes predictably.
- **Dossier queries span projects but respect tenant boundaries.** A query for "all claims about AcmeCorp" is scoped to `customer_id`. No cross-tenant data leakage is possible by design because `customer_id` is part of every table's primary query key.
- **Body purging is asynchronous and retryable.** The standard closeout workflow marks raw files for deletion and updates artifact metadata. An async worker (or scheduled job) performs the actual object storage deletion. If deletion fails, it retries. The database record tracks purge status (`pending → purged → failed`).
- **Ingestion pipeline versioning:** Document parsers and extractors have version numbers. Re-ingesting a file with a new extractor version creates new artifact records (deterministic IDs based on file hash + project + extractor version). Old artifacts are marked `superseded`.
- **Impact analysis should initially over-invalidate rather than under-invalidate.** A conservative impact analyzer that regenerates too many sections is inefficient but safe. An aggressive analyzer that misses downstream dependencies produces internally inconsistent reports. Slice 7 should prove accuracy of suggestions before automating regeneration.
