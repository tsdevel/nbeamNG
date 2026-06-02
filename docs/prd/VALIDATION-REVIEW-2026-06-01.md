# PRD Validation Review

Date: 2026-06-01  
Subject: External validator critique of `docs/prd/0002-nbeamng-backend-revised.md`  
Verdict: **Targeted revision, not rewrite.** The revised PRD is structurally sound. The validator identified real problems of slice granularity and sequencing. Four of the six slices are overloaded. The fixes are additive — split large slices, reorder DataNeeds, add evaluation gates — not architectural.

---

## Executive Summary

The external validator is directionally correct on every major point. The revised PRD (0002) is a significant improvement over the original (0001), but it inherited the original's slice sizing. **Three slices are too large to ship as single units of work**, and **one feature (DataNeeds) is sequenced too late** given its pedagogical value and relative implementation simplicity.

The validator's proposed 9-slice sequence is a better engineering roadmap than the current 6-slice sequence. However, a full rewrite of the PRD is unnecessary. The architecture, vocabulary, and core decisions in 0002 are correct. The change is: **re-slice the user stories, add acceptance criteria, and reorder.**

The single most important change: **DataNeeds should move from Slice 5 to Slice 3.** It is the cleanest proof that the blackboard enables dynamic agent collaboration without becoming an uncontrolled swarm.

---

## Assessment by Slice

### Slice 1: Create a deal, upload a CIM, and ingest it

**Validator verdict:** Slightly overloaded. Defer retention logic, classification sophistication, and advanced parsing.

**My assessment: AGREED.**

The revised PRD stories 6 and 7 push configurable retention policies and automatic document classification into Slice 1. These are cross-cutting concerns that mature over time. The schema should reserve columns (`retention_policy`, `confidentiality_class`), but Slice 1 only needs to prove:

- Project creation with `customer_id` scoping
- File upload to project-scoped object storage
- Basic text extraction and artifact metadata
- Listing ingested artifacts
- Basic label: `confidential`, `public`, or `unknown`

**Defer from Slice 1:** Configurable retention logic, automatic closeout purge, OCR quality optimization, robust table extraction, image/chart extraction, sophisticated classification.

These are **not** removed from the PRD — they are reassigned to later slices where they have a concrete reason to exist.

---

### Slice 2: Agent reads the CIM and writes a draft research summary

**Validator verdict:** Strong first milestone. Make it the first genuine product checkpoint. Add a narrow structured-output schema and lightweight source references.

**My assessment: AGREED, with one caveat.**

The revised PRD already includes task claiming, agent-run status, lineage, cost recording, and polling API in this slice. These are correct.

The validator wants a **structured investment-summary schema** instead of open-ended markdown. This is a significant improvement. The output should be structured under the hood (JSON with schema validation) even if the agent renders markdown for human readability.

The validator also wants **lightweight evidence model** introduced here — section-level source references or claim candidates. This is smart. Retrofitting provenance into a system that started with unprovenanced text is painful. If Slice 2's draft agent records `sourceArtifactIds` and `sourceSectionRefs` on every paragraph, Slice 3's claim extraction has a foundation to build on.

**Add to Slice 2:**
- Structured output schema: company overview, business model, revenue model, key financial figures, customers/concentration, market/competitors, strengths, risks, unanswered questions, source references by section.
- Lightweight source tracking on the draft artifact.
- **First evaluation dataset**: Use several fictional/sanitized CIMs with expected facts and known omissions.

**Avoid in Slice 2:** Multiple specialized agents, autonomous research, contradiction analysis, claim graphs, semantic memory retrieval, report export.

---

### Slice 3: Every bold claim traces to evidence

**Validator verdict:** Too broad. Split into 3A (material claims + evidence) and 3B (verification + contradictions). Move dossier queries elsewhere.

**My assessment: AGREED.**

The revised PRD has 7 user stories (13-19) in this slice covering:
- Typed claim extraction
- Evidence linking
- Verification
- Confidence scoring
- Contradiction detection
- Unsupported-claim escalation
- Historical dossier queries

This is at least two slices of work. The dossier query (story 19) is particularly out of place — it requires cross-project data and longitudinal analysis infrastructure that doesn't need to exist to prove basic claim governance.

**Proposed split:**

**Slice 3A — Material Claims and Evidence:**
- Typed material claims with constrained taxonomy (financial fact, operational KPI, market fact, valuation input, management assertion, calculated metric, analyst judgment, risk, hypothesis)
- Evidence references with source coordinates (page, paragraph, table cell, external URL)
- Claim statuses: `draft`, `supported`, `unsupported`, `needs_review`
- Basic source reliability categories
- Analyst inspection endpoints

**Slice 3B — Verification and Contradictions:**
- Verifier agent
- Unsupported-claim detection
- Confidence assessment as structured metadata (not a single model-generated float)
- Conflicting evidence detection
- Duplicate/inconsistent claims
- Escalation rules

**Move story 19 (dossier queries) to a later longitudinal-analysis slice.**

Also: change vocabulary from "every bold claim" to "material assertions." Otherwise the graph becomes noisy and expensive to review.

---

### Slice 4: A reviewer corrects me, and the system fixes only what's wrong

**Validator verdict:** Strategically important, substantially too ambitious. Split into 4A (corrections + immutable versions), 4B (suggested impact analysis), 4C (automated targeted regeneration). Move linked follow-up projects elsewhere.

**My assessment: STRONGLY AGREED.**

This slice is the most likely to cause schedule slips. The revised PRD has 7 stories (20-26) combining:
- Free-text review classification
- Automated impact analysis
- Immutable workspace versions
- Lineage tracking
- Targeted regeneration
- Linked follow-up projects

Automated impact analysis is the hardest subsystem in the entire MVP. It requires a working dependency graph of claims → artifacts → sections → reports. Getting this wrong means the system regenerates too little (leaving inconsistencies) or too much (wasting compute).

**Proposed split:**

**Slice 4A — Corrections and Immutable Revisions:**
- Review comment submission (structured correction object)
- Evidence attachment
- Explicit claim invalidation
- Immutable workspace version creation (v1 → v2)
- Before-and-after comparison
- Manual selection of affected sections
- Regeneration of selected sections
- Revision lineage

This alone creates substantial value. It proves iterative investment work is supported.

**Slice 4B — Suggested Impact Analysis:**
- Direct dependency lookup
- Suggested affected sections
- Analyst confirmation before regeneration
- Conservative invalidation rules (over-invalidate rather than under-invalidate)

Example: changing revenue marks financial summary, margin calculations, valuation inputs, operating-case narrative, executive summary, relevant charts.

**Slice 4C — Automated Targeted Regeneration:**
- Only after measuring accuracy of 4B's suggestions
- Automatically regenerate minimal set of sections
- Requires confidence in the impact graph

**Move story 26 (linked follow-up projects) to a longitudinal-analysis slice.** Creating a new follow-up engagement is a separate use case, not part of the review loop.

---

### Slice 5: The agent asks for missing data, and I provide it

**Validator verdict:** Excellent feature, sequenced too late. Should precede sophisticated regeneration.

**My assessment: AGREED. This is the single most important sequencing change.**

DataNeeds are the simplest and most valuable proof of dynamic agent behavior. The lifecycle (`open → resolving → resolved / estimated / unavailable / needs_human_input`) is already well-designed in the revised PRD. The problem is purely sequencing.

**Proposed: Move DataNeeds to Slice 3.**

This gives the sequence:
1. Ingest
2. Draft summary (with source refs)
3. **DataNeeds** — agent raises missing datapoint, human resolves, blocked analysis resumes
4. Material claims + evidence
5. Verification + contradictions
6. Human corrections + immutable versions
7. Suggested impact analysis
8. Automated regeneration
9. Export + closeout

Wait — that pushes the slice count even higher. The validator's 9-slice structure handles this cleanly:

| New Slice | Contents |
|---|---|
| 0. Foundation rails | Schema, tenant scoping, task leases, idempotency, event log, basic policies |
| 1. Ingest a deal | Upload, extract text, list artifacts |
| 2. Auditable first draft | Agent reads CIM, produces structured summary with source refs |
| 3. Track and resolve DataNeeds | Agent raises gap, human resolves, blocked work resumes |
| 4. Govern material claims | Typed claims, evidence links, support status |
| 5. Apply human corrections | Structured review, invalidations, immutable v2, manual regeneration |
| 6. Finalize and export | Completion checks, deterministic PPTX/PDF |
| 7. Longitudinal dossiers | Linked projects, historical claim comparison |
| 8. Harden deletion + expertise | Redaction taxonomy, full purge, approved distillation, playbooks |

**Verification and contradictions** (the validator's Slice 3B) fits between 4 and 5, or could be folded into 4 if we accept that basic verification is part of claim governance. Alternatively, keep it as a distinct slice between 4 and 5.

Actually, re-reading the validator's table, they folded verification into "Govern material claims" (Slice 4 in their numbering). I think splitting it is safer. Let me propose a 10-slice structure that keeps the validator's logic but makes each slice truly shippable:

| Slice | Contents | Exit Criterion |
|---|---|---|
| 0. Foundation rails | PostgreSQL schema, `customer_id` on every table, task lease/heartbeat model, event log append-only table, idempotency primitives, basic hardcoded policies | Can create project, upload file, artifact metadata persists, tenant isolation proven |
| 1. Ingest a deal | File upload, basic PDF text extraction, artifact metadata, hash-based idempotency, basic confidentiality label | Upload realistic CIM, retrieve structured representation with stable IDs |
| 2. Auditable first draft | Agent claims task, reads extracted content, produces structured summary with section-level source references | Reviewer can inspect draft, locate source passages behind key statements |
| 3. Track and resolve DataNeeds | Agent identifies missing datapoint, creates DataNeed, human resolves or marks unavailable, blocked analysis resumes | Missing competitor revenue identified, resolved or marked unavailable, analysis updated |
| 4. Govern material claims | Typed claims, evidence links, source coordinates, support status, basic reliability metadata | Each material claim traceable to evidence, unsupported claims flagged |
| 5. Verify and contradict | Verifier agent, confidence structured metadata, conflict detection, escalation rules | Reviewer can see which claims are disputed, poorly sourced, or inconsistent |
| 6. Apply human corrections | Structured review comments, claim invalidation, immutable workspace v2, manual section regeneration | Submit correction, create v2, regenerate selected section, show lineage |
| 7. Suggested impact analysis | Direct dependency lookup, suggested affected sections, analyst confirmation, conservative invalidation | Change revenue figure, system correctly marks all materially affected sections |
| 8. Finalize and export | Completion criteria, unresolved checks, deterministic PPTX/PDF rendering | Produces IC-ready deliverable from approved content |
| 9. Longitudinal dossiers | Linked follow-up projects, historical claim comparison, tenant-scoped context reuse | Prior-project context improves follow-up analysis |
| 10. Harden deletion + expertise | Redaction taxonomy, full purge, deletion receipts, approved lesson distillation, playbooks | Compliance maturity + long-term moat |

This is more slices, but each is a genuine milestone. Slices 0-8 get you to a working analyst product. Slices 9-10 are the compounding value.

**Alternative:** Combine 7 and 6B if impact analysis proves straightforward. Or fold 5 into 4 if basic verification is trivial once claims exist. The exact count matters less than the principle: **no slice should contain multiple months of uncertainty under one heading.**

---

### Slice 6: Close the deal, export the report, and selectively clean up

**Validator verdict:** Far too broad. Combines product delivery, compliance hardening, and long-term moat-building.

**My assessment: STRONGLY AGREED.**

The revised PRD has 11 user stories (34-44) in this slice. It is unquestionably overloaded. The validator's 4-way split is correct:

**6A — Finalization and Basic Export:**
- Completion criteria checks
- Approved artifact status
- Unresolved critical DataNeed checks
- Unresolved review comment checks
- Deterministic report rendering
- One PPTX template
- PDF generation
- Export lineage

This is a **product milestone.** It proves the system produces a complete analytical deliverable.

**6B — Standard Closeout and Full Purge:**
- Mark files for deletion
- Asynchronous purge worker
- Retryable purge status
- Deletion receipts
- Full project purge
- Basic audit trail

**6C — Granular Confidential Redaction:**
This is **not** a small extension of body purging. It requires classification inheritance across raw files, extracted text, tables, claims, evidence snippets, embeddings, generated artifacts, reports, event payloads, logs, and backups. Implement only after the classification taxonomy is battle-tested.

**6D — Memory Distillation and Reusable Expertise:**
- Candidate lesson extraction
- Scrubbed generalization
- Human approval gate
- Expertise retrieval
- Sector playbooks
- Evaluation of whether retrieved lessons improve future analyses

This is the **long-term moat**, not the initial closeout requirement.

---

## What the Validator Got Wrong (or Overcorrected)

### 1. Foundation Rails as Slice 0

The validator proposes a dedicated "Foundation Rails" slice before any product work. This risks the "build all infrastructure first" anti-pattern that the PRD explicitly rejects.

**Counter-argument:** Tenant scoping, event logs, and idempotency should emerge from Slice 1, not be built in isolation. You don't know the right schema shape until you have real ingestion flows.

**Compromise:** Don't make it a separate slice. Instead, add a **"Cross-cutting infrastructure maturity"** section to the PRD that specifies: these capabilities start in Slice 1 at minimum viable level and deepen with each subsequent slice. The revised PRD's "Cross-Cutting Governance" user stories (45-50) already capture this. The validator's table of "Cross-cutting features should be incremental, not postponed" is excellent and should be added explicitly.

### 2. DataNeeds Before Claims

The validator moves DataNeeds to Slice 3 (after draft, before full claim governance). This is mostly correct, but there's a subtle dependency: DataNeeds are often discovered **during** claim extraction and verification. If Slice 2's draft agent is allowed to raise DataNeeds (e.g., "I need competitor revenue to complete the market section"), then Slice 3 DataNeeds works. If only the claim-extraction agent can raise DataNeeds, then you need at least rudimentary claim extraction first.

**Resolution:** Allow the Slice 2 draft agent to create DataNeeds. The intake agent already does analysis; if it hits a missing datapoint, it should record a DataNeed rather than hallucinate. This makes DataNeeds a natural part of the draft-generation flow.

### 3. The Exact Slice Count

The validator proposes 9 slices; my analysis suggests 10-11. The exact number is less important than the principle that **each slice ships a visible, testable improvement.** Whether it's 9, 10, or 11 depends on how quickly the team can iterate. The PRD should present the split logic and let implementation cadence determine grouping.

---

## Recommended Changes to the PRD

### 1. Reorder and Reslice User Stories

Restructure the user stories section into the new slice sequence. Each slice should have 3-5 user stories maximum. Any slice with more than 5 stories is a red flag.

### 2. Add Evaluation Gates Between Slices

Each slice should have two acceptance test types:
1. **System correctness:** API, database, worker behavior.
2. **Analytical usefulness:** Did the output become better for an investment analyst?

The validator's table of analytical gates should be added as a new section:

| Slice | Analytical Gate |
|---|---|
| Auditable first draft | Does the summary recover expected facts from a test CIM? |
| DataNeeds | Does the agent identify genuinely missing information rather than asking generic questions? |
| Claims and evidence | Are material claims linked to the right source passages? |
| Corrections | Does changing a revenue figure update all materially affected sections? |
| Export | Is the resulting deck internally consistent and presentation-ready? |
| Dossiers | Does prior-project context improve follow-up analysis without propagating stale assumptions? |
| Expertise memory | Do retrieved lessons measurably improve future analyses? |

### 3. Narrow Slice 1 Acceptance Criteria

Remove retention policy configuration and automatic purge from Slice 1 exit criteria. Add them to later slices where they have concrete test cases.

### 4. Add Structured Output Schema to Slice 2

Define the investment-summary schema explicitly in the PRD. This is a contract that frontend and agent implementations depend on.

### 5. Add Lightweight Source References to Slice 2

Require the draft agent to record `sourceArtifactId` and `sourceSectionRef` on each section of the summary. This makes Slice 3's claim extraction additive rather than retrofitted.

### 6. Split Claim/Evidence into Two Slices

Create distinct slices for (a) material claims + evidence linking and (b) verification + contradiction detection. The second requires the first to be stable.

### 7. Split Review/Corrections into Three Slices

Basic corrections → suggested impact → automated regeneration. Each is a separate milestone.

### 8. Move DataNeeds Earlier

DataNeeds should be Slice 3 (or equivalent), immediately after the first draft. Allow the draft agent to create DataNeeds.

### 9. Split Closeout into Four Phases

Export → standard purge → redaction → expertise memory. Each is months of work.

### 10. Add Cross-cutting Maturity Table

Add the validator's table showing how capabilities start simple and harden over time:

| Capability | Minimum version | Later hardening |
|---|---|---|
| Tenant scoping | `customer_id` on every table | RLS tests, admin tooling |
| Audit log | Append-only events for material changes | Schema versioning, replay, compliance export |
| Idempotency | Deterministic IDs and safe retries | Recovery tests, distributed-worker hardening |
| Policies | Hardcoded budgets and permissions | Per-customer configuration |
| Confidentiality | Simple inherited labels | Derived-data lineage, granular redaction |
| Evidence | Source references on drafts | Claim-level verification, contradiction analysis |
| Regeneration | Manual section selection | Suggested impact, then automation |
| Runtime adapter | One adapter, one working runtime | Additional adapters after contract stabilizes |

### 11. Keep Architecture Decisions Intact

The following decisions in 0002 are correct and should not change:
- Unified PostgreSQL for runtime + expertise
- Juice vs. Body
- Three-tier deletion
- Project as engagement, Company Dossier as long-lived entity
- Hybrid blackboard over workflow engine
- Polling API as universal contract
- Idempotency by design
- Express + Prisma + PostgreSQL + MinIO/S3 + pgvector

---

## Verdict: Revise, Don't Rewrite

The revised PRD (0002) has the right architecture, vocabulary, and ambition. The validator found real problems in slice granularity and sequencing. These are **editorial** problems, not **design** problems.

**The fix:** Create `docs/prd/0003-nbeamng-backend-resliced.md` that preserves all architecture decisions from 0002, resequences the user stories into smaller slices, adds the evaluation gates, and narrows early-slice acceptance criteria. Do not rewrite the Problem Statement, Solution, or Implementation Decisions sections. Focus changes on:
- User Stories (resequence and reslice)
- Testing Decisions (add analytical gates, add failure-recovery test timing)
- A new "Cross-cutting Feature Maturity" section

Estimated effort to revise: ~2 hours of editing. Estimated value: Prevents 3-6 months of schedule risk from overloaded slices and premature complexity.
