# NbeamNG Architecture

> **Status:** In Progress — Slices 1–6 implemented and tested. Slices 7–10 pending.  
> **Last updated:** 2026-06-09  
> **Next step:** Slice 7 (Suggest Impact and Regenerate) is **HITL** — requires human design review on dependency graph, invalidation rules, and conservative over-invalidation strategy before implementation begins.

---

## 1. Vision

NbeamNG is a governed dynamic agent workspace for acquisition-target investment analysis. It produces IC-ready PPTX/PDF deliverables. The core idea: separate a durable project harness (lifecycle, permissions, auditability, review gates, memory isolation) from a dynamic agent runtime (flexible reasoning, tool use, collaboration).

Agents do not call each other directly. They observe and mutate a shared, typed **blackboard** (Projects, Workspace Versions, Artifacts, Claims, Evidence, DataNeeds, ReviewComments). This gives the feeling of all-to-all communication while keeping the system inspectable and governable.

---

## 2. Scope

This repo contains the **entire platform backend**:

- Durable project harness (lifecycle orchestration, workspace versioning, claim/evidence graph, artifact store, review management, policy engine, completion evaluator, report exporter, memory closeout)
- Dynamic agent runtime layer (agent registry, task scheduler, event bus, blackboard, output validator)
- Agent implementations (Intake, Research, Analysis, Valuation, Verifier, Report, Review Ingestion, Impact Analyzer, Memory Distillation)
- Storage abstractions and adapters (Postgres metadata, object storage, vector indexes)
- Pi adapter (one of many possible agent runtime integrations)

**Out of scope for this repo:** Frontend (project UI, review interface, artifact viewer, report preview). The backend exposes a REST API that any frontend can consume.

---

## 3. Architecture Principles

| Principle | Rationale |
|---|---|
| **Component swappability** | LLM models, agent implementations, and runtime engines change frequently. The architecture must support swapping any component without rebuilding the harness. |
| **Idempotency over replay** | The blackboard is updated via deterministic, upsert-style operations. Agents must be safe to re-execute. No magic workflow replay. |
| **Polling as universal contract** | All agent runtimes must support API polling for task discovery. SSE/WebSocket is an optional latency optimization for deployed agents. |
| **Vertical slices** | Each MVP is a complete, end-to-end, testable story. No horizontal "infrastructure first" phases. |
| **Juice vs. Body** | Raw files (Body) in object storage are temporary scratch space. Structured extracted knowledge (Juice) in the database is the persistent asset that compounds over time. |
| **Unified database for runtime and expertise** | Runtime operational data (projects, claims, evidence) and accumulated expertise (dossiers, distilled lessons) live in the same PostgreSQL database, tenant-scoped by `customer_id`. Queries naturally span historical and current analyses. |
| **Three-tier deletion** | Standard closeout purges raw files. Confidential redaction deletes company-specific claims on request. Full purge destroys everything. Granular, not monolithic. |
| **Project memory isolation** | Confidential project data is strictly scoped, encrypted at rest, never searchable across projects, never used for model training. Destroyed only on explicit request or full purge, not automatic closeout. |
| **Sanitized expertise extraction** | Only approved, scrubbed lessons from a project may enter global expertise memory. Raw confidential data never leaks. |

---

## 4. Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Language | TypeScript | Requirements already use TS interfaces throughout |
| Runtime | Node.js | Mature ecosystem, easiest debugging |
| Framework | Express | Team already uses Express. Fastify differences (performance, built-in OpenAPI) are real but not massive for this domain. |
| Database | PostgreSQL | Unified database for runtime operational data (projects, claims, evidence, events) AND accumulated expertise (dossiers, distilled lessons). Tenant-scoped by `customer_id`. |
| DB Access | Prisma | Team already uses Prisma. `$queryRaw` will handle the ~10% of queries that need complex graph traversals, recursive CTEs, or `FOR UPDATE SKIP LOCKED`. |
| Object Storage | MinIO (dev) / S3 (prod) | S3-compatible API for raw files (CIMs, data room uploads, PPTX, PDF, extracted tables). Deletable scratch space once Juice is extracted. |
| Event Bus | Postgres `LISTEN/NOTIFY` or lightweight in-process (MVP), Redis/NATS (scale later) | Events are notifications only; agents always read current state from API |
| Vector Search | pgvector (PostgreSQL extension) | Semantic search over claims, evidence, and expertise. Same database, no separate dependency for MVP. |
| Auth | API key + project-scoped tokens | Master key for service-to-service; project tokens restrict agents to one project |

---

## 5. Key Design Decisions

### 5.1 Standalone backend with swappable agent runtimes

The durable project harness is a deployable service. Pi connects via an adapter (HTTP API, or optionally SDK/RPC embedding). The harness must survive any agent runtime crash or swap. This implies the blackboard and event system live in the service, not inside Pi.

### 5.2 Hybrid blackboard over workflow engine

See `docs/adr/0001-hybrid-blackboard-over-workflow-engine.md`.

**Summary:** Postgres-backed blackboard + lightweight events. Polling API for universal task discovery. Idempotency + task claiming for failure recovery. No Temporal/Restate/DBOS/Inngest.

### 5.3 Single-context repo

One `CONTEXT.md` + `docs/adr/` at the repo root. The entire backend is a single bounded context. If the system grows into multiple contexts (e.g., separate billing or customer management), a `CONTEXT-MAP.md` can be introduced later.

### 5.4 REST/JSON API with OpenAPI

Maximum interoperability. Any agent runtime (Pi, Python, custom) can consume the API with standard HTTP. GraphQL and gRPC were considered but rejected for the MVP because they add client complexity without delivering value for this domain's request patterns.

### 5.5 Prisma + Express over Kysely + Fastify

Team already uses Prisma and Express. The differences (raw SQL control, performance, built-in OpenAPI) are real but not massive. `$queryRaw` covers complex queries. `zod` + `swagger-ui-express` covers validation and docs. Migration cost exceeds benefit.

### 5.6 Unified database for runtime and expertise (revised from separate systems)

Initially considered separate PostgreSQL instances for Level 1 (runtime) and Level 2a (expertise). Rejected because:
- Re-runs of the same company analysis (every 6 months) require querying across historical and current data.
- Cross-system joins, synchronization, or API calls between runtime and expertise are unnecessary complexity for natural business queries (e.g., "all analyses of AcmeCorp over 3 years").
- The database IS the company's brain; object storage is temporary scratch space.

The unified database uses `customer_id` as the tenant boundary from Slice 1 onward. Future multi-tenancy (external users via UI) requires no migration.

### 5.7 Juice vs. Body

The **Body** (raw files: CIMs, data room uploads, PPTX, PDF, extracted tables) lives in object storage. It is deletable scratch space. Once claims, evidence, and structured analysis are extracted (the **Juice**), the Body can be purged for cost or compliance.

The **Juice** (structured data: projects, workspace versions, claims, evidence, metrics, review history, events) lives in the unified PostgreSQL database. It is the persistent asset that compounds over time. Analysts query the Juice for re-runs, comparisons, and expertise building.

### 5.8 Project as engagement, Company Dossier as long-lived entity

A **Project** is a single engagement (initial DD, 6-month follow-up, annual review). Re-runs are **new linked projects** (not workspace versions within the same project). Each project links to a **Company Dossier** — the long-lived entity that accumulates all analyses of a target company for a customer.

This gives flexibility (each engagement has its own team, budget, timeline, review cycle) while preserving longitudinal context (the dossier enables cross-project queries: "How have our claims about AcmeCorp changed over 3 years?").

### 5.9 Three-tier deletion model

Client data removal is granular, not monolithic:
1. **Standard closeout** (automatic): Raw files (Body) purged from object storage. Structured data (Juice) retained. Project → `archived`.
2. **Confidential redaction** (on client request): Company-specific confidential claims and evidence deleted from database. Public/market/process data retained. Project → `purged_confidential`.
3. **Full purge** (rare, explicit request): All data for the project deleted from both database and object storage. Destroys historical context. Project → `purged`.

### 5.10 Ingestion Pipeline

Raw files are useless until structured data is extracted. The ingestion pipeline is a first-class process:
- Triggered by file upload to object storage
- Uses document parsing tools (OCR, table extraction, text extraction) and optionally the Intake Agent
- Output: artifact metadata in database, extracted text/tables in object storage, initial claims/evidence in database (Slice 3+)
- For Slice 1: basic upload → storage → metadata creation. Full parsing added in subsequent slices.

---

## 6. Vertical Slices (MVP Sequence)

Each slice is a complete, API-testable end-to-end story. Infrastructure (tables, endpoints, storage) emerges from the slice's needs. No horizontal "build all the schema first" phases.

### Slice 1: Create a deal and upload a CIM
**Test:** `POST /projects` → `POST /projects/:id/upload` → `GET /projects/:id/artifacts`  
**What's built:** Project creation API, file upload to MinIO/S3, artifact metadata retrieval, minimal Prisma schema (`projects`, `workspace_versions`, `artifacts`).  
**Out of scope:** Agents, claims, runtime.

### Slice 2: Agent reads the CIM and writes a draft research summary
**Test:** `POST /projects/:id/agent-runs` (type: intake_research) → agent reads files → `GET /projects/:id/artifacts/:id` returns markdown summary  
**What's built:** Minimal agent runtime API (just enough to trigger one agent), Intake/Research agent, task claiming with `pending`/`claimed`/`completed` status.  
**Out of scope:** Claims, evidence graph, verifier, review.

### Slice 3: Every bold claim traces to evidence
**Test:** Agent produces artifact → system extracts claims → each claim shows supporting evidence → `GET /projects/:id/claims` → `POST /verify` flags unsupported claims  
**What's built:** `claims` and `evidence` tables + APIs, claim extraction from artifacts, evidence linking, Verifier agent.  
**This is the first governed output.** Previous slice was a text generator; this makes it auditable.

### Slice 4: A reviewer corrects me, and the system fixes only what's wrong
**Test:** `POST /projects/:id/reviews` ("Revenue is $50M, not $30M") → affected claims invalidated → targeted regeneration triggered → new workspace version v2 with corrected artifacts  
**What's built:** Review comment ingestion + classification, Impact Analyzer (finds affected claims → artifacts → sections), workspace versioning (v1 → v2 with lineage), task creation for targeted regeneration.  
**Proves "living analysis" rather than one-shot generation.**

### Slice 5: The agent asks for missing data, and I provide it
**Test:** Valuation agent detects missing competitor revenue → creates DataNeed → analyst provides data → DataNeed resolved → valuation artifact updates  
**What's built:** `data_needs` table + lifecycle (`open` → `resolving` → `resolved`), DataNeed creation/resolution APIs, impact propagation from resolved DataNeed to claims/artifacts.  
**Proves pause/resume with human input.**

### Slice 6: We close the deal, export the report, and clean up
**Test:** `POST /projects/:id/closeout` → final PPTX/PDF generated → raw files purged → retainable structured data archived → candidate expertise lessons extracted for approval  
**What's built:** Completion evaluator, Report Exporter (PPTX/PDF from approved artifacts), three-tier deletion workflow (standard closeout = purge body, retain juice), Company Dossier update with new claims/evidence, ExpertiseMemoryCandidate extraction + approval gate.  
**Proves selective retention and longitudinal expertise compounding.**

---

## 7. Domain Glossary

See `CONTEXT.md` for the full domain glossary. Key terms:

- **Project** — An engagement (analysis cycle). Re-runs are new linked projects, not versions within the same project.
- **Company Dossier** — Long-lived entity accumulating all analyses of a target company for a customer. Enables longitudinal queries across linked projects.
- **Workspace Version** — Immutable point-in-time snapshot within a single project.
- **Artifact** — Durable output: research notes, financial analysis, slides, reports.
- **Claim** — Typed, verifiable assertion extracted from evidence.
- **Evidence** — Source-backed extract supporting one or more claims.
- **DataNeed** — Structured request for missing information.
- **ReviewComment** — Structured human feedback classified as new evidence, correction, judgment change, style change, question, or approval.
- **Juice vs. Body** — Body = raw files in object storage (deletable). Juice = structured data in database (retained).
- **Company Expertise Memory** — Two forms: (a) Company Dossier (raw historical claims from all projects), (b) Distilled Expertise (generalized lessons, frameworks, prompts).
- **Global Expertise Memory** — Sanitized, reusable institutional knowledge approved for cross-company use.

---

## 8. Repo Structure (Target)

```
/
├── AGENTS.md                    ← Agent skill configuration
├── CONTEXT.md                   ← Domain glossary
├── ARCHITECTURE.md              ← This file
├── requirements/
│   └── 00001-InitialDescription.md
├── docs/
│   ├── agents/
│   │   ├── issue-tracker.md
│   │   ├── triage-labels.md
│   │   └── domain.md
│   └── adr/
│       └── 0001-hybrid-blackboard-over-workflow-engine.md
├── src/
│   ├── app/                     ← Express routes, middleware, server bootstrap
│   ├── domain/                  ← Domain types (may differ from Prisma schema)
│   ├── harness/                 ← Durable harness services
│   ├── runtime/                 ← Agent runtime services
│   ├── agents/                  ← Agent implementations
│   ├── repositories/            ← Prisma repositories / data access
│   ├── tools/                   ← Agent tools (document parser, web search, etc.)
│   └── workflows/               ← Lifecycle and orchestration workflows
├── prisma/
│   └── schema.prisma
└── ...
```

---

## 9. Open Questions (Not Yet Resolved)

These will be resolved in future grill-with-docs sessions or implementation:

1. **Auth model details** — JWT vs API keys? OAuth for human users? How are project-scoped tokens issued and rotated?
2. **Policy engine** — Hardcoded policies per project type, or configurable per customer/engagement?
3. **Report generation** — PPTX/PDF library choice (PptxGenJS, pdfkit, puppeteer, something else)?
4. **Vector indexes** — pgvector in Postgres, or separate Pinecone/Weaviate/Qdrant? What gets embedded?
5. **Agent runtime interface** — Exact shape of AgentRunRequest/Result API? Synchronous or async execution?
6. **Event schema** — What event types exist? How are they versioned?
7. **Frontend contract** — What API endpoints does the (future) frontend need beyond what agents use?
8. **Deployment target** — Docker, K8s, serverless, VPS?
