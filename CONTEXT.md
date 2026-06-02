# NbeamNG Domain Glossary

## Product

**NbeamNG** — A governed dynamic agent workspace for acquisition-target investment analysis. Produces IC-ready PPTX/PDF deliverables.

## Core Concepts

- **Project** — An engagement (analysis cycle) with a customer. Has a lifecycle: active → under_review → completed → archived. Each project analyzes a target company. Re-runs (6-month follow-ups, annual reviews) are **new linked projects**, not new workspace versions within the same project. Previous projects for the same company are linked via a **Company Dossier**.
- **Customer** — The party commissioning and paying for the analysis. Can be an investor, PE firm, corporate development team, or a company analyzing itself for strategic planning. Owns the Company Expertise Memory.
- **Target / Deal** — The company or asset being analyzed. Sometimes the target is the same entity as the customer (strategic planning); sometimes it is a different company (investment analysis). All projects analyzing the same target for the same customer are linked through a **Company Dossier**.
- **CIM** — Confidential Information Memorandum. A common source document uploaded by the customer.
- **Workspace Version** — A point-in-time snapshot of all project state (artifacts, claims, evidence). Immutable. New versions are created when new information arrives.
- **Artifact** — A durable output: research notes, financial analysis, market maps, charts, slides, reports, extracted tables.
- **Claim** — A typed, verifiable assertion extracted from evidence. Every important statement in a report traces to a claim.
- **Evidence** — A source-backed extract supporting one or more claims. Sources include customer uploads, filings, news, analyst estimates.
- **DataNeed** — A structured request for missing information. Created by agents when analysis requires data not yet available.
- **ReviewComment** — Structured feedback from a human reviewer. Classified as new evidence, correction, judgment change, style change, question, or approval.

## Architecture Layers

- **Durable Project Harness** — The governed outer lifecycle. Owns projects, workspace versions, artifacts, claims, evidence, review state, and completion criteria. Replaces neither the agent runtime nor the frontend.
- **Dynamic Agent Runtime** — The flexible inner layer where agents create tasks, resolve data needs, critique, revise, and use tools. Reads and writes through the harness APIs.
- **Blackboard** — The shared, typed project state that all agents observe and update. The system of record for collaboration.
- **Juice vs. Body** — The **Body** is raw files (CIMs, data room uploads, PPTX, PDF) stored in object storage. The **Juice** is structured, extracted knowledge (claims, evidence, analysis, metrics) stored in the database. The Body is deletable once the Juice is extracted. The Juice is retained for re-analysis and expertise compounding.

- **Ingestion Pipeline** — The process that transforms raw uploaded files (Body) into structured artifacts, extracted text, and initial claims/evidence (Juice). Triggered by file upload. Uses document parsing tools and optionally the Intake Agent. The output is stored in the database and object storage.

- **Project Confidential Memory** — Data that identifies or reveals confidential operational or financial details about a specific company (customer or target). CIMs, financials, management notes, internal accounts, product sales, strategic plans, deal terms, IC conclusions, and company-specific paid data. Strictly isolated per project. Classification rule: if it names or reveals proprietary details of a specific company, it is confidential. Subject to **three-tier deletion** on client request.
- **Company Expertise Memory** — Has two forms:
  1. **Company Dossier** — Raw historical claims, evidence, metrics, and review history from all past projects analyzing a target company. Queryable as-is for re-analysis context.
  2. **Distilled Expertise** — Explicitly extracted, generalized lessons (methodologies, frameworks, improved prompts, sector playbooks) from historical projects. Lives in separate tables, refined by the Memory Distillation Agent.
  
  Both are retainable knowledge accumulated across all projects for a single **customer**. Searchable by agents working on any of the customer's projects.

- **Three-Tier Deletion** — The deletion model for client data removal requests:
  1. **Standard Closeout** (automatic): Raw files (Body) purged from object storage. Structured data (Juice) retained in database. Project → `archived`.
  2. **Confidential Redaction** (on client request): Company-specific confidential claims and evidence deleted from database. Public/market/process data retained. Project → `purged_confidential`.
  3. **Full Purge** (rare, explicit request): All data for the project deleted from both database and object storage. Project → `purged`. Destroys client's accumulated historical context.
- **Global Expertise Memory** — Fully sanitized, generalizable knowledge approved for cross-company use. Extracted from Company Expertise after scrubbing company names, revenue figures, and proprietary identifiers.
- **Runtime Blackboard** — The per-project operational system of record. Database-first (PostgreSQL). Tracks projects, workspace versions, artifacts, claims, evidence, tasks, data needs, review comments, and events. Governed, auditable, concurrent. Confidential data destroyed at closeout.
- **Expertise Graph** — The cross-project compounding knowledge system. Markdown-first long-form knowledge (market reports, company profiles, frameworks, prompt templates) with a queryable graph/semantic search layer. Continuously accumulates retainable knowledge from project closeouts. Improves agent performance over time. Creates competitive moat.

## Key Distinctions

- **Customer upload vs. Agent artifact** — Customer uploads are evidence sources. Agent artifacts are analysis outputs. Both are versioned.
- **Claim vs. Evidence** — A claim is an assertion. Evidence is the source material that supports it. A claim can be supported by multiple evidence items; evidence can support multiple claims.
- **Project Confidential vs. Company Expertise** — Confidential memory is destroyed at closeout. Retainable data (market, process, public, external, paid-market) is extracted to Company Expertise.
- **Company vs. Global Expertise** — Company Expertise is scoped to one client/investor and searchable across their projects. Global Expertise is sanitized and cross-company.
- **Correction vs. New evidence** — A correction invalidates an existing claim. New evidence creates or supports a claim without invalidation.
