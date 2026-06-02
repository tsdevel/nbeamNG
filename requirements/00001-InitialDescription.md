# Investment Analysis Agent Harness: Full System Explanation and Recommended Architecture

## 1. Executive overview

The system should be designed as a **living investment-analysis workspace**, not a fixed linear pipeline.

The core objective is to support long-running investment-analysis projects where:

* a customer or deal team provides initial information;
* agents conduct research, analysis, valuation, verification, and report generation;
* the system produces IC-ready PPTX/PDF outputs;
* reviewers provide corrections, comments, and new information;
* the system selectively updates only the affected parts of the analysis;
* confidential project data remains strictly isolated and is destroyed after the engagement;
* reusable expertise is extracted only after sanitization and approval.

The most important architectural idea is to separate the system into two layers:

```text
1. Durable project harness
   Owns lifecycle, persistence, permissions, auditability, review gates, memory isolation,
   artifact lineage, report export, and cleanup.

2. Dynamic agent runtime
   Owns agent collaboration, targeted research, analysis, critique, revision, and tool use.
```

The durable harness should not encode every possible agent interaction. It should provide the governed environment in which dynamic agents operate.

The recommended model is:

```text
Your platform owns governance.
Pi or another agent runtime owns execution.
The blackboard owns collaboration.
The artifact store owns truth.
Workspace versions own reproducibility.
```

---

## 2. Why a fixed workflow is not enough

A simple predefined workflow might look like this:

```text
Ingest documents → Research → Analysis → Report → Review → Final export
```

That works for a first draft, but it breaks down in real investment work.

In practice, the process is iterative and uncertain:

* the initial information package is incomplete;
* the analysis discovers missing data;
* a reviewer identifies fundamental errors;
* the customer shares new documents after seeing the first draft;
* the valuation requires one extra datapoint;
* the market-size logic needs to be redone;
* a partner asks for a different investment framing;
* a customer clarifies that an apparent competitor is actually a portfolio company or channel partner.

If every possible branch is encoded into a Temporal-style workflow, the system becomes rigid and expensive to change.

Instead, the system should use a static outer lifecycle and a dynamic inner collaboration model.

```text
Static outer lifecycle:
  create project → run agent system → review → revise → export → close out

Dynamic inner system:
  agents create tasks, resolve data needs, update artifacts, challenge claims,
  regenerate sections, and respond to new evidence.
```

---

## 3. Core architectural principle

The system should not be built around “agents calling agents” directly.

Instead, it should be built around **typed project state**.

Agents interact through durable objects:

```text
Tasks
Data needs
Evidence
Claims
Artifacts
Review comments
Workspace versions
Completion criteria
```

This avoids hidden agent-to-agent conversations and gives the platform a reliable audit trail.

The preferred pattern is:

```text
Agent observes project state
Agent claims or creates task
Agent writes artifact, claim, data need, or review response
Verifier checks the output
Completion evaluator decides whether the project goal is satisfied
```

This gives the feeling of all-to-all communication while keeping the system inspectable and governable.

---

## 4. High-level system architecture

```text
Investment Analysis Platform

Frontend
├── Project setup UI
├── Customer upload portal
├── Review/comment UI
├── Artifact viewer
├── Claim/evidence viewer
├── PPTX/PDF preview
└── Admin/compliance dashboard

Backend Project Harness
├── Project Boundary Manager
├── Workspace Version Manager
├── Evidence Store
├── Claim Graph
├── Task/Event Bus
├── DataNeed Registry
├── Artifact Store
├── Policy Engine
├── Completion Evaluator
├── Review Orchestrator
├── Report Exporter
├── Memory Distillation Gate
└── Project Cleanup Service

Agent Runtime Layer
├── Pi adapter or custom agent runtime
├── Agent registry
├── Skill/tool registry
├── Sandbox manager
├── Output validator
└── Artifact writer API

Storage Layer
├── Postgres for metadata, tasks, claims, reviews, artifacts
├── Object storage for documents, PPTX/PDF, extracted files
├── Project-scoped vector indexes for retrieval
├── Optional global expertise vector/index store
└── Audit/event log
```

The durable project harness is the system of record. The agent runtime is replaceable.

---

## 5. The durable project harness

The project harness owns everything that must be reliable, auditable, secure, and reproducible.

Responsibilities:

* create the project boundary;
* enforce project-specific permissions;
* store and version all inputs and outputs;
* maintain a claim/evidence graph;
* manage human review;
* track data needs and targeted research requests;
* decide when the project is complete;
* export PPTX/PDF deliverables;
* extract reusable expertise safely;
* destroy confidential project data after closeout.

The harness should not be a large static agent workflow. It should be closer to a governed runtime environment.

A simple durable lifecycle is enough:

```text
Project created
  ↓
Initial materials ingested
  ↓
Dynamic agent run started
  ↓
Draft artifacts produced
  ↓
Human/customer review
  ↓
New information and comments ingested
  ↓
Targeted revisions run
  ↓
Final report generated
  ↓
Reusable expertise distilled
  ↓
Project-confidential memory destroyed
```

This lifecycle can be implemented with Temporal, Restate, DBOS, Inngest, a custom Postgres-backed engine, or another durable orchestration layer.

The key is not the specific engine. The key is that the outer lifecycle is durable and governed.

---

## 6. The dynamic agent runtime

The agent runtime is where flexible reasoning and collaboration happen.

It should support:

* dynamic task creation;
* agents subscribing to relevant events;
* data-need resolution;
* targeted research;
* critique and verification;
* section-level regeneration;
* review-comment resolution;
* tool usage;
* structured output validation.

The agent runtime should not own the project truth. It should read and write through the project harness APIs.

Recommended pattern:

```text
Project harness sends:
  goal, workspace version, allowed tools, policies, input artifacts, exit criteria

Agent runtime does:
  task solving, tool use, artifact creation, data-need creation, revision

Project harness receives:
  created artifacts, resolved data needs, invalidated claims, completion status
```

---

## 7. Where Pi fits

Pi can be used as the **inner agent harness** or **agent execution workbench**.

Pi is useful because it is a lightweight, customizable agent harness with a small core that can be extended through TypeScript extensions, skills, prompt templates, and packages. Its package ecosystem includes an agent core with tool calling and state management, plus a multi-provider LLM abstraction.

However, Pi should not be treated as the entire investment-analysis platform.

Use Pi for:

```text
Good fit:
├── flexible agent execution
├── specialist skills
├── tool calling
├── rapid iteration on prompts and workflows
├── local or controlled agent sessions
├── dynamic task solving
└── experimentation with agent behavior
```

Do not rely on Pi alone for:

```text
Needs your platform/harness:
├── customer-facing project lifecycle
├── confidential memory isolation
├── artifact lineage
├── claim-level auditability
├── review state
├── durable multi-hour execution
├── permissioning
├── regulatory/compliance logs
├── report versioning
└── guaranteed cleanup/destruction
```

The recommended integration is an adapter:

```text
Project Harness
  ↓ AgentRunRequest
Pi Runtime / Agent Runtime
  ↓ AgentRunResult
Project Harness
```

Example interface:

```ts
type AgentRunRequest = {
  runId: string;
  projectId: string;
  workspaceVersionId: string;
  goal: string;
  allowedTools: string[];
  allowedArtifactTypes: string[];
  inputArtifactIds: string[];
  policies: {
    maxCostUsd: number;
    maxRuntimeMinutes: number;
    canUseExternalSearch: boolean;
    canWriteGlobalMemory: false;
    confidentiality: "project_only";
  };
};

type AgentRunResult = {
  status: "complete" | "blocked" | "failed" | "needs_human_input";
  createdArtifactIds: string[];
  createdDataNeedIds: string[];
  invalidatedClaimIds: string[];
  summary: string;
};
```

Pi should write outputs through controlled APIs, not directly into arbitrary storage.

---

## 8. The project blackboard

The collaboration layer should be based on a project blackboard.

The blackboard is a shared, typed project state that agents can observe and update.

```text
Project Blackboard
├── Goals
├── Tasks
├── Data needs
├── Claims
├── Evidence
├── Artifacts
├── Review comments
├── Blockers
├── Open questions
└── Completion criteria
```

Agents do not need to know about each other directly. They react to the blackboard.

Example:

```text
Valuation Agent creates a DataNeed:
  “Need FY2024 revenue for Competitor X.”

Research Agent observes open DataNeed and resolves it.

Verifier Agent observes new DataAsset and checks source quality.

Valuation Agent observes resolved DataNeed and updates valuation.
```

This achieves dynamic all-to-all behavior without chaotic agent-to-agent messaging.

---

## 9. Core domain objects

### 9.1 Project

```ts
type Project = {
  id: string;
  customerId: string;
  engagementType: "investment_analysis" | "market_study" | "portfolio_review";
  confidentialityClass: "project_only" | "restricted" | "highly_confidential";
  status: "active" | "under_review" | "finalized" | "closed";
  retentionPolicyId: string;
  createdAt: string;
};
```

### 9.2 Workspace version

A workspace version represents the project state at a point in time.

```ts
type WorkspaceVersion = {
  id: string;
  projectId: string;
  parentVersionId?: string;
  addedArtifactIds: string[];
  invalidatedClaimIds: string[];
  reason: string;
  createdAt: string;
};
```

Examples:

```text
Workspace v1: initial customer materials + initial research
Workspace v2: v1 + customer-uploaded portfolio details
Workspace v3: v2 + targeted competitor revenue research
Workspace v4: v3 + partner review corrections
```

### 9.3 Artifact

Artifacts are durable outputs: research notes, financial analysis, market maps, charts, slides, reports, extracted tables, etc.

```ts
type Artifact = {
  id: string;
  projectId: string;
  workspaceVersionId: string;
  type:
    | "source_document"
    | "evidence_extract"
    | "research_summary"
    | "financial_analysis"
    | "valuation_model"
    | "market_analysis"
    | "investment_thesis"
    | "risk_analysis"
    | "slide_deck"
    | "pdf_report";
  createdBy: string;
  sourceArtifactIds: string[];
  confidentiality: "project_only";
  status: "draft" | "verified" | "approved" | "superseded";
  createdAt: string;
};
```

### 9.4 Claim

Claims are central. Every important statement in the report should trace to evidence.

```ts
type Claim = {
  id: string;
  projectId: string;
  workspaceVersionId: string;
  text: string;
  claimType:
    | "company_description"
    | "financial_metric"
    | "market_fact"
    | "competitor_mapping"
    | "investment_thesis"
    | "risk"
    | "valuation_assumption";
  sourceArtifactIds: string[];
  confidence: number;
  status: "active" | "stale" | "contradicted" | "superseded" | "needs_review";
  usedInArtifactIds: string[];
};
```

### 9.5 Evidence

```ts
type Evidence = {
  id: string;
  projectId: string;
  sourceArtifactId: string;
  sourceType:
    | "customer_upload"
    | "customer_comment"
    | "filing"
    | "annual_report"
    | "press_release"
    | "credible_news"
    | "database"
    | "analyst_estimate"
    | "internal_analysis";
  extractedClaim: string;
  citation?: string;
  reliabilityScore: number;
  createdAt: string;
};
```

### 9.6 DataNeed

A DataNeed is a structured request for missing information.

```ts
type DataNeed = {
  id: string;
  projectId: string;
  workspaceVersionId: string;
  requestedByAgent: string;
  requestedByTaskId?: string;
  needType:
    | "competitor_revenue"
    | "market_size"
    | "pricing"
    | "customer_count"
    | "valuation_multiple"
    | "regulatory_detail"
    | "portfolio_detail"
    | "other";
  entity?: string;
  field: string;
  question: string;
  reason: string;
  acceptableSourceTypes: string[];
  confidenceRequired: number;
  status: "open" | "resolving" | "resolved" | "unavailable" | "rejected";
  resultArtifactId?: string;
  createdAt: string;
  resolvedAt?: string;
};
```

### 9.7 ReviewComment

Review comments are not just text. They are inputs to the system.

```ts
type ReviewComment = {
  id: string;
  projectId: string;
  workspaceVersionId: string;
  targetArtifactId: string;
  targetLocation?: string;
  authorRole: "customer" | "analyst" | "vp" | "partner";
  comment: string;
  classification?:
    | "new_evidence"
    | "correction"
    | "judgment_change"
    | "style_change"
    | "question"
    | "approval";
  attachedFileIds?: string[];
  status: "open" | "resolved" | "rejected";
};
```

---

## 10. Handling customer information over time

Customer information should be treated as versioned evidence.

Initial customer upload:

```text
Customer provides CIM, financials, portfolio overview, management notes
  ↓
System ingests documents
  ↓
Creates source artifacts and evidence extracts
  ↓
Creates Workspace v1
```

Review-stage customer upload:

```text
Customer reviews draft v1 and uploads portfolio details
  ↓
ReviewIngestionAgent classifies comments and files
  ↓
System creates EvidenceInjection
  ↓
Workspace v2 is created
  ↓
ImpactAnalyzer identifies affected claims and sections
  ↓
Revision tasks are created
  ↓
Agents regenerate only affected analysis/report artifacts
```

This prevents the system from treating new customer information as loose prompt context.

The right object is:

```ts
type EvidenceInjection = {
  id: string;
  projectId: string;
  source: "customer_upload" | "customer_comment" | "review_call" | "email" | "manual_entry";
  receivedAt: string;
  confidentiality: "project_only";
  artifactsCreated: string[];
  affectedClaims: string[];
  affectedSections: string[];
  requiresReanalysis: boolean;
};
```

---

## 11. Targeted research and missing-data loops

The system should support targeted enrichment without rerunning everything.

Example:

```text
Initial research produces Corpus v1.
Valuation Agent starts analysis.
Valuation Agent lacks Competitor X FY2024 revenue.
It creates a DataNeed.
Research Agent resolves only that DataNeed.
Workspace/Corpus v1.1 is created.
Valuation resumes using the enriched workspace.
```

The flow:

```text
Analysis detects missing data
  ↓
Creates DataNeed
  ↓
TargetedResearch task is created
  ↓
Research Agent searches existing corpus first
  ↓
If not found, searches allowed external/project sources
  ↓
Extracts candidate answers
  ↓
Reconciles conflicting data
  ↓
Stores DataAsset
  ↓
Creates new workspace version
  ↓
Analysis resumes
```

This should not be implemented as one activity calling another activity. It should be implemented through the blackboard/task system or through a child workflow if using Temporal.

---

## 12. DataNeed resolution result

A DataNeed should not force the system to invent an answer.

Possible outcomes:

```ts
type DataNeedResolution =
  | {
      status: "resolved";
      dataAssetId: string;
      confidence: number;
    }
  | {
      status: "estimated";
      dataAssetId: string;
      confidence: number;
      estimationMethod: string;
    }
  | {
      status: "unavailable";
      reason: string;
      searchedSources: string[];
    }
  | {
      status: "needs_human_input";
      reason: string;
      options: string[];
    };
```

For investment analysis, unavailable data is a valid and important result.

Example:

```text
“Competitor X is private and does not disclose revenue. No reliable public estimate was found. Suggested proxy methods: employee count × revenue per employee, customer count × ARPA, or analyst-provided estimate.”
```

The analyst can then decide whether to proceed, estimate, upload a source, or mark it as a diligence gap.

---

## 13. Impact analysis after new information

When new customer information arrives, the system should ask:

```text
What claims does this contradict?
What claims does this support?
What sections use those claims?
What analysis artifacts depend on them?
What slides/reports need regeneration?
What can stay unchanged?
```

This requires dependency tracking:

```text
Evidence → Claim → Analysis Artifact → Report Section → Slide
```

Example:

```text
Customer uploads portfolio-level ARR split.
  ↓
Contradicts claim: “Revenue is primarily from standalone company operations.”
  ↓
Invalidates financial analysis section.
  ↓
Invalidates valuation assumptions.
  ↓
Invalidates slides 5, 8, 12, and 14.
  ↓
Creates revision tasks only for those sections.
```

This is how the system avoids full reruns.

---

## 14. Report generation model

The PPTX/PDF generator should be deterministic.

It should not invent analysis.

It should consume approved or verified artifacts:

```text
Approved claims
Verified financial analysis
Verified valuation outputs
Approved market analysis
Risk analysis
Investment thesis
Charts and tables
```

Report generation should work like this:

```text
Analysis artifacts
  ↓
Narrative planner
  ↓
Slide/message map
  ↓
Chart/table generator
  ↓
Template renderer
  ↓
PPTX/PDF export
  ↓
Final QA
```

The report artifact should record:

* workspace version used;
* source artifact IDs;
* claims used;
* evidence coverage;
* generation timestamp;
* verifier status.

---

## 15. Memory architecture

The memory system should have three separate memory classes.

### 15.1 Project ephemeral memory

This contains confidential project-specific data.

Examples:

* CIMs;
* customer uploads;
* portfolio details;
* private financials;
* management comments;
* review notes;
* draft IC conclusions;
* valuation assumptions;
* deal-specific analysis.

Rules:

```text
Project-scoped only
Encrypted at rest
Never searchable across projects
Never promoted automatically
Never used for model training
Destroyed after retention period
Excluded from global memory
```

### 15.2 Engagement learning candidates

These are potential reusable lessons extracted from the project.

Examples:

```text
“For vertical SaaS deals, request both GRR and NRR because high NRR can mask logo churn.”

“When estimating TAM for healthcare software, triangulate from provider count × ARPA and IT budget share.”
```

These must go through a distillation and approval process.

### 15.3 Global expertise memory

This contains sanitized, reusable institutional knowledge.

Examples:

* investment diligence checklists;
* valuation methodologies;
* sector playbooks;
* IC writing preferences;
* common risk taxonomies;
* approved slide patterns;
* house style.

Global memory should be read by agents but not directly written by them.

---

## 16. Memory distillation workflow

At project close:

```text
Project artifacts
  ↓
Candidate lesson extraction
  ↓
Confidentiality scrubber
  ↓
Generalization agent
  ↓
Human approval
  ↓
Global expertise memory
  ↓
Project ephemeral memory destruction
```

The system should explicitly prevent raw confidential data from entering global memory.

A candidate reusable lesson might look like:

```ts
type ExpertiseMemoryCandidate = {
  id: string;
  domain: "investment_analysis";
  subdomain: string;
  lesson: string;
  containsConfidentialData: boolean;
  sourceProjectId: string;
  approvalStatus: "pending" | "approved" | "rejected";
};
```

Only approved, sanitized lessons become global memory.

---

## 17. Policy engine

The policy engine constrains the dynamic system.

Without policies, dynamic agents can loop, overspend, over-search, or leak data.

Policies should cover:

```text
Tool access
External search permission
Data-source restrictions
Cost budgets
Runtime budgets
Maximum task depth
Maximum number of data needs
Human approval thresholds
Memory write permissions
Confidentiality constraints
Retention and deletion rules
```

Example:

```ts
type AgentRunPolicy = {
  maxWallClockMinutes: number;
  maxTotalTasks: number;
  maxOpenDataNeeds: number;
  maxTaskDepth: number;
  maxCostUsd: number;
  requireHumanApprovalAboveCostUsd: number;
  canUseExternalSearch: boolean;
  canWriteGlobalMemory: false;
};
```

---

## 18. Completion criteria

Dynamic systems need explicit stop conditions.

For an IC-ready report, completion criteria might be:

```text
investment thesis complete
valuation complete
financial analysis complete
all high-priority claims sourced
no critical data needs open
all review comments resolved
final report generated
final QA passed
```

The completion evaluator checks these criteria against project state.

Agents should not decide alone that the project is done.

---

## 19. Human-in-the-loop design

Human review is not just approval. It is part of the evidence and correction loop.

Review types:

```text
Customer review
Analyst review
VP/Principal review
Partner/IC review
Compliance review
```

Review comments should be classified:

```text
New evidence
Correction
Question
Judgment change
Style preference
Approval
```

The system should turn review comments into structured actions:

```text
new evidence → ingest and impact analysis
correction → claim invalidation and revision task
question → data need or analyst response
judgment change → thesis/risk/valuation revision
style preference → report formatting/narrative revision
approval → artifact state update
```

---

## 20. Recommended runtime execution model

A good runtime loop:

```text
1. Load workspace version and project goal.
2. Evaluate open tasks and completion criteria.
3. Select eligible agents based on capabilities.
4. Agents claim tasks or create new tasks/data needs.
5. Agents write structured artifacts and claims.
6. Verifiers check claims, numbers, citations, and consistency.
7. Impact analyzer invalidates stale claims when new evidence appears.
8. Completion evaluator checks whether exit criteria are satisfied.
9. Policy engine enforces budgets and loop limits.
10. If blocked, request human input.
11. If complete, produce report artifacts and move to review/export.
```

---

## 21. Agent roles

Start with fewer agents than you think.

Recommended initial agents:

```text
Intake Agent
├── understands the initial project and customer materials

Research Agent
├── extracts evidence and resolves data needs

Analysis Agent
├── produces market, business, and strategic analysis

Financial/Valuation Agent
├── handles financial metrics, comps, assumptions, valuation outputs

Verifier Agent
├── checks citations, numbers, consistency, and unsupported claims

Report Agent
├── turns approved artifacts into PPTX/PDF sections

Review Ingestion Agent
├── classifies review comments and customer uploads

Impact Analyzer
├── identifies affected claims/artifacts after new evidence

Memory Distillation Agent
├── proposes sanitized reusable lessons after project close
```

Avoid creating too many agents too early. Use typed tasks and artifacts first; split agents when the capabilities become meaningfully different.

---

## 22. Suggested code structure

```text
src/
├── app/
│   ├── api/
│   ├── review-ui/
│   ├── project-ui/
│   └── report-preview/
│
├── domain/
│   ├── Project.ts
│   ├── WorkspaceVersion.ts
│   ├── Artifact.ts
│   ├── Claim.ts
│   ├── Evidence.ts
│   ├── DataNeed.ts
│   ├── ReviewComment.ts
│   └── Policy.ts
│
├── harness/
│   ├── projectBoundaryManager.ts
│   ├── workspaceVersionManager.ts
│   ├── completionEvaluator.ts
│   ├── policyEngine.ts
│   ├── impactAnalyzer.ts
│   ├── reportExporter.ts
│   └── memoryCloseout.ts
│
├── runtime/
│   ├── agentRunAdapter.ts
│   ├── piAdapter.ts
│   ├── taskScheduler.ts
│   ├── eventBus.ts
│   ├── blackboard.ts
│   └── outputValidator.ts
│
├── agents/
│   ├── intake.agent.ts
│   ├── research.agent.ts
│   ├── analysis.agent.ts
│   ├── valuation.agent.ts
│   ├── verifier.agent.ts
│   ├── report.agent.ts
│   ├── reviewIngestion.agent.ts
│   └── memoryDistillation.agent.ts
│
├── repositories/
│   ├── project.repo.ts
│   ├── workspace.repo.ts
│   ├── artifact.repo.ts
│   ├── claim.repo.ts
│   ├── evidence.repo.ts
│   ├── dataNeed.repo.ts
│   └── review.repo.ts
│
├── tools/
│   ├── documentParser.tool.ts
│   ├── webSearch.tool.ts
│   ├── spreadsheet.tool.ts
│   ├── chart.tool.ts
│   ├── pptx.tool.ts
│   └── pdf.tool.ts
│
└── workflows/
    ├── engagementLifecycle.workflow.ts
    ├── reviewRevision.workflow.ts
    └── memoryCloseout.workflow.ts
```

---

## 23. Minimal viable implementation

Do not build the full platform first.

Build the smallest end-to-end substrate that proves the architecture.

### MVP 1: Project workspace and artifacts

Build:

* project creation;
* document upload;
* artifact store;
* evidence extraction;
* workspace version v1.

### MVP 2: First dynamic agent run

Build:

* AgentRun interface;
* one Pi-backed or custom agent runtime;
* basic research/analysis artifact creation;
* simple report draft.

### MVP 3: Claim and evidence graph

Build:

* claim extraction;
* evidence links;
* unsupported-claim detection;
* verifier pass.

### MVP 4: Review with new customer info

Build:

* customer review comments;
* customer upload during review;
* review classification;
* evidence injection;
* workspace v2;
* impact analysis;
* targeted regeneration.

### MVP 5: Targeted data needs

Build:

* DataNeed registry;
* targeted research task;
* resolution outcomes;
* analysis rerun using enriched workspace.

### MVP 6: Memory closeout

Build:

* project data destruction workflow;
* candidate expertise extraction;
* confidentiality scrubber;
* human approval before global memory write.

---

## 24. First demo scenario

A strong demo would be:

```text
1. Customer uploads initial company and portfolio materials.
2. System produces draft investment summary and mini-deck.
3. Customer reviews draft and says:
   “This is wrong — you have not seen the portfolio ARR split.”
4. Customer uploads portfolio ARR file.
5. System ingests the file as project-only evidence.
6. System identifies contradicted claims.
7. System marks affected sections/slides as stale.
8. System regenerates only those sections.
9. System shows before/after differences with evidence lineage.
10. System produces revised PPTX/PDF.
```

This demonstrates the core value:

```text
The system is not a one-shot report generator.
It is a governed, evolving analysis workspace.
```

---

## 25. Recommended final architecture

The recommended architecture is:

```text
Durable Project Harness
├── lifecycle orchestration
├── project boundary and permissions
├── workspace versions
├── claim/evidence graph
├── artifact store
├── review management
├── policy engine
├── completion evaluator
├── report exporter
└── memory closeout

Dynamic Agent Runtime
├── Pi adapter or custom runtime
├── agent registry
├── skill/tool registry
├── blackboard/event loop
├── task marketplace
├── data-need resolver
├── verifier agents
└── output validator

Storage
├── Postgres for structured state
├── object storage for files and reports
├── project-scoped vector indexes
├── global expertise memory store
└── audit log

Frontend
├── project setup
├── upload portal
├── review interface
├── evidence/claim viewer
├── artifact viewer
└── report preview/export
```

The most important design choices are:

```text
1. Keep the outer lifecycle durable and governed.
2. Keep agent collaboration dynamic and event-driven.
3. Use typed artifacts, claims, evidence, and data needs as the system of record.
4. Treat customer review as a source of new evidence, not just feedback.
5. Version the workspace whenever new information changes the analysis.
6. Allow targeted research and targeted regeneration instead of full reruns.
7. Keep project memory strictly isolated and destroy it after closeout.
8. Promote only sanitized, approved learnings to global expertise memory.
9. Use Pi as an inner agent runtime, not as the whole production platform.
10. Enforce budgets, permissions, and completion criteria around all dynamic behavior.
```

---

## 26. Summary

The system should be a **governed dynamic agent workspace for investment analysis**.

It should not be a rigid pipeline, and it should not be an uncontrolled swarm of agents.

The right middle ground is:

```text
A durable shell around a dynamic blackboard-based agent runtime.
```

The durable shell gives you:

* reliability;
* auditability;
* security;
* review workflow;
* memory isolation;
* report export;
* cleanup.

The dynamic runtime gives you:

* flexible agent collaboration;
* targeted research;
* iterative refinement;
* response to new customer information;
* adaptive analysis and revision.

That combination is the architecture most likely to scale from a prototype into a trustworthy investment-analysis product.
