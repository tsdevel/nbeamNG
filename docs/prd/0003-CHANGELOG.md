# Changelog: 0002 → 0003 Resliced PRD

## Slice Mapping

| Old (0002) | New (0003) | What changed |
|---|---|---|
| Slice 1: Create a deal, upload a CIM, and ingest it | **Slice 1: Ingest a deal** | Narrowed. Retention policies, configurable classification, and advanced parsing (OCR, tables, charts) deferred to later slices. Basic label (`confidential`/`public`/`unknown`) only. Added exit criterion and analytical gate. |
| Slice 2: Agent reads the CIM and writes a draft research summary | **Slice 2: Generate an auditable first draft** | Strengthened. Added structured output schema (company overview, business model, revenue model, etc.). Added lightweight source references on every section. Added first evaluation dataset requirement. |
| — | **Slice 3: Track and resolve DataNeeds** | **New slice.** Moved from old Slice 5. Now immediately follows first draft. Proves dynamic agent collaboration early. |
| Slice 3: Every bold claim traces to evidence | **Slice 4: Govern material claims** | Split. Old Slice 3 was 7 stories covering claims, evidence, verification, confidence, contradictions, escalation, and dossier queries. Now contains only typed claims + evidence links + basic reliability. Dossier queries moved to Slice 9. |
| — | **Slice 5: Verify claims and detect contradictions** | **New slice.** Extracted from old Slice 3. Contains verifier agent, unsupported-claim detection, structured confidence metadata, contradiction detection, escalation rules. |
| Slice 4: A reviewer corrects me, and the system fixes only what's wrong | **Slice 6: Apply human corrections** | Split. Now contains only review comments, classification, immutable workspace versions, manual section selection, and regeneration. Impact analysis and automated regeneration moved to Slice 7. Linked follow-up projects moved to Slice 9. |
| — | **Slice 7: Suggest impact and regenerate** | **New slice.** Extracted from old Slice 4. Contains dependency lookup, suggested affected sections, conservative invalidation, analyst confirmation, and automated targeted regeneration. |
| — | **Slice 8: Finalize and export** | **New slice.** Extracted from old Slice 6. Contains completion evaluator, deterministic PPTX/PDF rendering, export lineage. |
| — | **Slice 9: Longitudinal dossiers** | **New slice.** Extracted from old Slice 3 (dossier queries) and old Slice 4 (linked follow-up projects). Dedicated to cross-project claim comparison and context reuse. |
| Slice 5: The agent asks for missing data, and I provide it | **Slice 3: Track and resolve DataNeeds** | **Moved earlier.** Was Slice 5, now Slice 3. Same user stories, same lifecycle. Just resequenced to prove dynamic orchestration before complex claim governance. |
| Slice 6: We close the deal, export the report, and selectively clean up | **Slice 10: Harden deletion and expertise memory** | Split. Now contains only standard closeout, confidential redaction, full purge, body purging, lesson extraction, scrubbing, approval, and expertise retrieval. Export moved to Slice 8. Dossiers moved to Slice 9. |

---

## Key Additions

### 1. Cross-cutting Feature Maturity section
A table showing how capabilities (tenant scoping, audit log, idempotency, policies, confidentiality, evidence, regeneration, runtime adapter) start at minimum viable complexity in early slices and harden incrementally. Prevents "build everything first" anti-pattern.

### 2. Evaluation Gates section
Every slice now has two acceptance test types:
- **System correctness:** API, database, worker behavior
- **Analytical usefulness:** Did the output improve for an investment analyst?

Analytical gates are defined per slice (e.g., "Does the summary recover expected facts from a test CIM?", "Does the verifier correctly distinguish evidence quality?").

### 3. Structured output schema for Slice 2
The draft research summary is no longer open-ended markdown. It must follow a narrow schema: company overview, business model, revenue model, key financial figures, customers/concentration, market/competitors, strengths, risks, unanswered questions, source references by section.

### 4. Source references in Slice 2
The draft agent must record `sourceArtifactId` and `sourceSectionRef` on every section. This creates a foundation for Slice 4 claim extraction instead of retrofitting provenance later.

### 5. "Over-invalidate" principle
Added to Further Notes: Impact analysis should initially over-invalidate rather than under-invalidate. Conservative invalidation is inefficient but safe; aggressive invalidation produces internally inconsistent reports.

### 6. User story count per slice
All slices now have 3–6 user stories. Old Slice 3 had 7, old Slice 4 had 7, old Slice 5 had 7, old Slice 6 had 11. No slice in 0003 exceeds 6 stories.

---

## What Was Preserved (Unchanged)

- Problem Statement
- Solution architecture (Durable Project Harness, Dynamic Agent Runtime, Typed Blackboard, Company Dossiers, Expertise Memory, Ingestion Pipeline, Three-Tier Deletion, Swappable Adapters)
- All Implementation Decisions (Standalone Backend, Unified PostgreSQL, Juice vs. Body, Three-Tier Deletion, Project as Engagement, Ingestion Pipeline, Hybrid Blackboard, Polling API, REST/JSON API, Prisma + Express, Idempotency by Design)
- Deep Modules list (with CompanyDossierManager, WorkspaceVersionManager, ImpactAnalyzer, MemoryDistillation, CompanyExpertiseManager added in 0002)
- Module Test Strategy table
- API Integration Tests (re-mapped to new slices)
- Failure Recovery Tests (re-mapped to new slices)
- Test Infrastructure
- Out of Scope
- Most Further Notes (plus the over-invalidate addition)
