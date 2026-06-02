# Slice Issues Draft

Ready to publish to GitHub once approved. Each issue follows the template from `to-issues` skill.

---

## Issue 1: Slice 1 — Ingest a Deal

### What to build

Establish the governed workspace. A user creates a project with a confidentiality class and `customer_id` tenant boundary. They upload a PDF CIM to project-scoped object storage with encryption at rest. The ingestion pipeline extracts text and creates structured artifact records with stable, hash-based deterministic IDs. The user lists ingested artifacts to confirm successful ingestion. Tenant isolation is enforced from day one.

This slice proves: project creation, upload, basic text extraction, artifact metadata, idempotency, and tenant scoping. It does NOT prove: sophisticated document classification, configurable retention logic, automatic closeout purge, OCR optimization, robust table extraction, image/chart extraction.

### Acceptance criteria

- [ ] `POST /projects` creates a project with `confidentiality_class` and `customer_id`
- [ ] `POST /projects/:id/upload` stores file in project-scoped object storage with encryption at rest
- [ ] Ingestion pipeline extracts text from PDF and creates artifact metadata in PostgreSQL
- [ ] `GET /projects/:id/artifacts` lists ingested artifacts with stable, deterministic IDs
- [ ] Uploading the same file twice (same hash) is idempotent — no duplicate artifacts
- [ ] Tenant isolation verified: customer A cannot access customer B's projects or artifacts
- [ ] System correctness: full API flow exercised end-to-end
- [ ] Analytical gate: extracted text preserves page boundaries and paragraph breaks sufficiently for source passage lookup

### Blocked by

None — can start immediately.

---

## Issue 2: Slice 2 — Generate an Auditable First Draft

### What to build

The first analytical value. An agent runtime polls the task API, claims a research task with a lease, reads the extracted artifact content from Slice 1, and produces a structured investment summary following a narrow schema. The summary is machine-readable JSON under the hood, rendered as markdown for human readability. Every section records `sourceArtifactId` and `sourceSectionRef`, creating a lightweight provenance trail that future slices build on. Agent runs are logged with status, runtime, cost, and tenant.

This slice proves: task claiming, agent-runtime contract, structured agent output, source-level provenance on drafts, and the first evaluation dataset.

### Acceptance criteria

- [ ] `GET /tasks?status=pending&capability=research` returns tasks for agent polling
- [ ] Agent claims a task with row-level lease and heartbeat mechanism
- [ ] Agent reads structured artifact text and produces summary with schema: company overview, business model, revenue model, key financial figures, customers/concentration, market/competitors, strengths, risks, unanswered questions, source references by section
- [ ] Each summary section records `sourceArtifactId` and `sourceSectionRef`
- [ ] Agent run logged with status (pending → claimed → in-progress → completed/failed), runtime, cost, `customer_id`
- [ ] Generated artifact viewable via `GET /artifacts/:id` with lineage metadata (agent, source artifacts, timestamps)
- [ ] System correctness: full API flow exercised end-to-end with polling, claiming, execution, and retrieval
- [ ] Analytical gate: test CIMs with expected facts yield correct facts in summary; known omissions are noted as unanswered questions

### Blocked by

- Issue 1 (Ingest a Deal)

---

## Issue 3: Slice 3 — Track and Resolve DataNeeds

### What to build

Dynamic agent collaboration without chaos. When the Slice 2 draft agent discovers missing information (e.g., "Competitor X FY2024 revenue"), it creates a DataNeed — a durable, trackable gap. DataNeeds have a lifecycle (`open → resolving → resolved / estimated / unavailable / needs_human_input`). A human or another agent resolves the gap, and the blocked analysis resumes automatically. Unavailable datapoints are explicitly marked with explanations and proxy suggestions, never hallucinated.

This slice proves: agents can raise structured gaps, the blackboard coordinates async resolution, blocked work resumes, and the system handles missing data gracefully.

### Acceptance criteria

- [ ] Agent can create a DataNeed with `type`, `priority`, `requestor_task_id`, and `description` during draft generation
- [ ] `GET /projects/:id/dataneeds` lists open DataNeeds with filtering by status and priority
- [ ] Human or agent can resolve a DataNeed with attached evidence
- [ ] Analysis resumes automatically after DataNeed resolution (task re-triggered or agent notified)
- [ ] DataNeed can be marked `unavailable` with explanation of searched sources and suggested proxy method
- [ ] Full lifecycle tracked: `open → resolving → resolved / estimated / unavailable / needs_human_input`
- [ ] System correctness: full lifecycle exercised end-to-end via API
- [ ] Analytical gate: DataNeed identifies genuinely missing information (specific fact, specific section, material reason) rather than asking generic questions

### Blocked by

- Issue 2 (Generate an Auditable First Draft)

---

## Issue 4: Slice 4 — Govern Material Claims

### What to build

Every material assertion in the analysis becomes individually traceable. The system extracts typed material claims from artifacts, links each claim to evidence with source coordinates (page, paragraph, table cell, URL), and tracks support status. Claims follow a constrained taxonomy (financial fact, operational KPI, market fact, valuation input, management assertion, calculated metric, analyst judgment, risk, hypothesis). Evidence carries basic reliability categories.

This slice proves: the claim/evidence graph exists, is navigable, and reviewers can inspect which assertions are supported vs. unsupported.

### Acceptance criteria

- [ ] Triggering claim extraction produces typed claims from artifacts via `POST /projects/:id/extract-claims`
- [ ] Each claim links to one or more evidence items with source coordinates
- [ ] Claim taxonomy enforced: `financial_fact`, `operational_kpi`, `market_fact`, `valuation_input`, `management_assertion`, `calculated_metric`, `analyst_judgment`, `risk`, `hypothesis`
- [ ] Claims have status: `draft`, `supported`, `unsupported`, `needs_review`
- [ ] Evidence has basic reliability category (e.g., audited_filing, management_assertion, analyst_estimate)
- [ ] `GET /projects/:id/claims` and `GET /claims/:id/evidence` enable claim inspection
- [ ] System correctness: full extraction and linking flow exercised end-to-end
- [ ] Analytical gate: material claims link to the correct source passages (e.g., revenue claim points to financial section, not forward-looking narrative)

### Blocked by

- Issue 2 (Generate an Auditable First Draft)

---

## Issue 5: Slice 5 — Verify Claims and Detect Contradictions

### What to build

The system validates its own analytical trust. A verifier agent checks that material claims have supporting evidence, flags unsupported claims with `needs_review` status, and detects contradictions between claims or between claims and evidence. Confidence is structured metadata (evidence type, source reliability, extraction certainty, calculation status, conflict status, human review status) — not a single model-generated float.

This slice proves: the system can catch its own errors before human review.

### Acceptance criteria

- [ ] Verifier agent checks claims against evidence and flags claims lacking support
- [ ] Unsupported claims automatically marked `needs_review` and escalated
- [ ] Contradicting claims detected and flagged (e.g., two revenue figures from different source sections)
- [ ] Confidence metadata structured across multiple dimensions, not a single score
- [ ] `GET /projects/:id/claims?status=needs_review` returns flagged claims
- [ ] System correctness: verification and contradiction detection exercised end-to-end
- [ ] Analytical gate: verifier correctly distinguishes claims supported by audited filings from those supported only by management assertions; catches genuine contradictions without flagging every minor discrepancy

### Blocked by

- Issue 4 (Govern Material Claims)

---

## Issue 6: Slice 6 — Apply Human Corrections

### What to build

Human feedback changes workspace state. A reviewer submits a structured correction (e.g., "Revenue is $50M, not $30M"). A Review Ingestion Agent classifies the comment type (correction, new evidence, judgment change, style change, question, approval). The targeted claim is invalidated. A new immutable workspace version `v2` is created with `parent_version_id` pointing to `v1`. The analyst manually selects affected sections for targeted regeneration. Full lineage is preserved from comment → invalidated claim → revised artifact.

This slice proves: iterative collaboration, immutable versioning, and auditable revision history. It does NOT prove automated impact analysis (Slice 7) or linked follow-up projects (Slice 9).

### Acceptance criteria

- [ ] Reviewer submits structured correction comment via API
- [ ] Review Ingestion Agent classifies comment into `correction`, `new_evidence`, `judgment_change`, `style_change`, `question`, or `approval`
- [ ] Targeted claim explicitly invalidated with `invalidated_by_comment_id`
- [ ] New immutable workspace version `v2` created with `parent_version_id` = `v1`
- [ ] Before/after comparison available between versions
- [ ] Analyst manually selects sections to regenerate via API
- [ ] Regenerated sections show complete lineage: which review comment triggered it, which claims were invalidated, which evidence was added
- [ ] System correctness: full review → invalidate → version → regenerate flow exercised end-to-end
- [ ] Analytical gate: changing a revenue figure updates all selected sections; lineage is complete and auditable

### Blocked by

- Issue 4 (Govern Material Claims)
- Issue 5 (Verify Claims and Detect Contradictions)

---

## Issue 7: Slice 7 — Suggest Impact and Regenerate

**Type: HITL** — Requires human design review before implementation. This is the hardest subsystem in the MVP. The dependency graph, invalidation rules, and conservative over-invalidation strategy should be reviewed and approved before coding begins.

### What to build

The system understands its own dependencies. Given a correction, the Impact Analyzer suggests which claims, artifacts, and report sections are affected using direct dependency lookups. The suggestion conservatively over-invalidates rather than under-invalidates (e.g., changing revenue marks financial summary, margin calculations, valuation inputs, operating-case narrative, executive summary, relevant charts). The analyst confirms the scope before automated targeted regeneration produces a minimal-delta workspace version.

This slice proves: efficient revision workflow. It is the hardest subsystem in the MVP and should only proceed after measuring manual correction accuracy in Slice 6.

### Acceptance criteria

- [ ] Impact Analyzer suggests affected claims, artifacts, and sections given a correction
- [ ] Suggestion uses direct dependency lookup from claim graph
- [ ] Conservative over-invalidation: all potentially affected sections suggested; none missed
- [ ] Analyst can confirm or adjust suggested scope before regeneration proceeds
- [ ] Automated targeted regeneration creates minimal-delta workspace version (v3 from v2)
- [ ] Unmaterial sections remain untouched in the new version
- [ ] System correctness: full impact suggestion → confirmation → automated regeneration flow exercised end-to-end
- [ ] Analytical gate: changing a revenue figure correctly marks all materially affected sections; delta is minimal and explainable

### Blocked by

- Issue 4 (Govern Material Claims)
- Issue 5 (Verify Claims and Detect Contradictions)
- Issue 6 (Apply Human Corrections)

---

## Issue 8: Slice 8 — Finalize and Export

### What to build

A complete analytical deliverable. The Completion Evaluator checks that all high-priority claims are sourced, all critical DataNeeds are resolved, all review comments are addressed, and the investment thesis is complete before finalization is allowed. Approved content renders deterministically to PPTX and PDF. The Report Agent never invents analysis — it consumes only approved claims, verified financial analysis, and checked charts. Export lineage records which workspace version, claims, and artifacts contributed to each slide.

This slice proves: the system produces an IC-ready deliverable.

### Acceptance criteria

- [ ] Completion evaluator blocks finalization if critical gaps exist (unsupported high-priority claims, unresolved critical DataNeeds, unaddressed review comments, incomplete thesis)
- [ ] Project can be finalized only after passing completion checks
- [ ] Deterministic PPTX generation from approved artifacts and claims via template
- [ ] Deterministic PDF generation from approved content
- [ ] Export lineage records workspace version, claims, and artifacts per slide/page
- [ ] System correctness: full finalize → export flow exercised end-to-end
- [ ] Analytical gate: resulting deck is internally consistent, presentation-ready, and contains no orphaned references to invalidated claims from earlier versions

### Blocked by

- Issue 4 (Govern Material Claims)
- Issue 5 (Verify Claims and Detect Contradictions)
- Issue 6 (Apply Human Corrections)
- Issue 7 (Suggest Impact and Regenerate)

---

## Issue 9: Slice 9 — Longitudinal Dossiers

### What to build

Institutional memory compounds. A new project for the same target company can be created as a follow-up engagement linked to previous projects via `parentProjectId`. The Company Dossier accumulates all historical claims, evidence, and review history for the same target + customer. Dossier queries respect tenant boundaries (`customer_id`). Prior-project context is available when generating new drafts, improving follow-up analysis without propagating stale or invalidated claims.

This slice proves: the system demonstrates compounding customer value across engagements.

### Acceptance criteria

- [ ] New project created with `parentProjectId` linking to previous project
- [ ] Company Dossier accumulates all projects analyzing same target for same customer
- [ ] `GET /dossiers/:companyId/claims` returns historical claims with project context
- [ ] Tenant isolation enforced: dossier queries scoped to `customer_id`
- [ ] Prior-project context available to draft agent in new follow-up project
- [ ] Invalidated claims from previous versions are not propagated to new analysis
- [ ] System correctness: full dossier creation → query → context injection flow exercised end-to-end
- [ ] Analytical gate: prior-project context measurably improves follow-up analysis without propagating stale assumptions

### Blocked by

- Issues 1–8 (requires working project lifecycle, claims, verification, corrections, and export)

---

## Issue 10: Slice 10 — Harden Deletion and Expertise Memory

**Type: HITL** — Requires human design review before implementation. The classification taxonomy that distinguishes retainable from confidential data across all data types (raw files, text, tables, claims, evidence, embeddings, artifacts, reports, events, logs, backups) is compliance-critical and must be reviewed before implementation.

### What to build

Compliance maturity and long-term moat. Three-tier deletion: standard closeout purges raw files (Body) from object storage while retaining structured data (Juice); confidential redaction deletes company-specific claims on client request; full purge destroys everything for extreme cases. Purge is asynchronous, retryable, with status tracking and deletion receipts. The Memory Distillation Agent extracts reusable lessons from completed projects, scrubs confidential details, routes through human approval, and stores in Company Expertise Memory. A classification taxonomy is defined across all data types (raw files, text, tables, claims, evidence, embeddings, artifacts, reports, events, logs, backups).

This slice proves: the system is compliant, data-removable, and getting smarter over time.

### Acceptance criteria

- [ ] Standard closeout marks raw files for deletion, async worker purges from object storage, structured data retained in database
- [ ] Confidential redaction deletes company-specific confidential claims/evidence on client request; public/market/process data retained
- [ ] Full purge deletes all project data from database and object storage on explicit request
- [ ] Purge operations are async, retryable, with status tracking (`pending → purged → failed`) and deletion receipts
- [ ] Memory Distillation Agent extracts candidate lessons from completed projects
- [ ] Extracted lessons scrubbed of confidential details (company names, revenue figures, proprietary identifiers)
- [ ] Human approval gate before lessons enter Company Expertise Memory
- [ ] Expertise retrievable in future projects via API
- [ ] Classification taxonomy defined and tested across all data types
- [ ] System correctness: three-tier deletion and expertise extraction exercised end-to-end
- [ ] Analytical gate: retrieved lessons measurably improve future analyses in controlled test

### Blocked by

- Issues 1–9 (requires working project lifecycle, claims, drafts, dossiers)
