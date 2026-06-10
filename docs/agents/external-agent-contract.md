# External Agent Contract (Path 2)

This document describes the **Polling API** contract that external agent runtimes use to discover work, claim tasks, and write results back to the NbeamNG blackboard.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        NbeamNG Backend Harness                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌──────────┐  │
│  │  Projects   │  │  Artifacts  │  │   Claims    │  │  Events  │  │
│  │  (blackboard)│  │  (blackboard)│  │  (blackboard)│  │  (log)   │  │
│  └─────────────┘  └─────────────┘  └─────────────┘  └──────────┘  │
│         ▲                                                          │
│         │  REST API                                                │
│         │  (polling + write)                                       │
└─────────┼──────────────────────────────────────────────────────────┘
          │
          │  ┌─────────────────────────────────────────────────────┐
          │  │              External Agent Runtime                  │
          │  │  (Python, LangChain, CrewAI, Pi SDK, custom TS)      │
          │  │                                                      │
          │  │  1. Poll → GET /tasks?capability=research            │
          │  │  2. Claim → POST /tasks/:id/claim                   │
          │  │  3. Read → GET /artifacts/:id                        │
          │  │  4. Work → Call LLM (Claude, GPT-4, Fireworks)       │
          │  │  5. Write → POST /artifacts (NEEDS TO BE ADDED)      │
          │  │  6. Complete → POST /tasks/:id/complete             │
          │  └─────────────────────────────────────────────────────┘
          │
          │  ┌─────────────────────────────────────────────────────┐
          └──▶│              Another Agent Runtime                  │
             │  (Different capability, different model)             │
             └─────────────────────────────────────────────────────┘
```

## The Contract

### 1. Discovery — Poll for Pending Tasks

```http
GET /tasks?capability=research&status=pending
x-api-key: dev-api-key
x-customer-id: customer-1
```

**Response:**
```json
{
  "tasks": [
    {
      "id": "task-abc123",
      "project_id": "proj-xyz789",
      "type": "research",
      "capability": "research",
      "status": "pending",
      "payload": {
        "artifact_id": "art-cim-001"
      },
      "created_at": "2024-06-01T12:00:00Z"
    }
  ]
}
```

**Capabilities:**
| Capability | Description | Slice |
|---|---|---|
| `research` | Analyze CIM → produce research summary | Slice 2 |
| `claim_extraction` | Extract claims from research summary | Slice 4 |
| `verification` | Verify claims against evidence | Slice 5 |
| `regeneration` | Regenerate corrected summary | Slice 6 |
| `impact_analysis` | Analyze impact of corrections | Slice 7 |
| `report_generation` | Generate final PPTX/PDF report | Slice 8 |
| `distillation` | Extract expertise from completed project | Slice 10 |

### 2. Claim — Row-Level Locking

```http
POST /tasks/task-abc123/claim
x-api-key: dev-api-key
x-customer-id: customer-1

{
  "claimed_by": "python-agent-001"
}
```

**Response (success):**
```json
{
  "task": { ...task with status: "claimed" ... },
  "agent_run": { "id": "run-001", "status": "claimed" }
}
```

**Response (already claimed):** `409 Conflict`
```json
{
  "error": {
    "code": "ALREADY_CLAIMED",
    "message": "Task was claimed by another agent"
  }
}
```

The harness uses atomic `UPDATE ... WHERE status = 'pending'` to prevent double-claiming. Agents that lose the race should poll again for the next task.

### 3. Heartbeat — Extend Lease

```http
POST /tasks/task-abc123/heartbeat
x-api-key: dev-api-key
x-customer-id: customer-1

{
  "lease_duration_ms": 300000  // 5 minutes
}
```

The default lease is 5 minutes. If the agent dies without completing, the task's `lease_expires_at` passes and another agent can claim it.

### 4. Read — Access the Blackboard

```http
GET /artifacts/art-cim-001
x-api-key: dev-api-key
x-customer-id: customer-1
```

**Response:**
```json
{
  "id": "art-cim-001",
  "type": "extracted_text",
  "extracted_text": "...document text...",
  "metadata": { "page_count": 42 }
}
```

Agents read the current project state (artifacts, claims, evidence, data needs) from the harness before making LLM calls. They **never** communicate directly with other agents.

### 5. Write — The Missing Piece

**⚠️ This is the gap between Path 1 and Path 2.**

The current harness does **not** expose a general `POST /artifacts` endpoint for external agents to create artifacts. The convenience endpoints (`execute-research`, `execute-regeneration`) are the only way to create artifacts programmatically — and they bake the agent logic into the backend.

To enable true external agents, add these endpoints to the backend:

#### `POST /artifacts` — Create Artifact

```http
POST /artifacts
x-api-key: dev-api-key
x-customer-id: customer-1

{
  "project_id": "proj-xyz789",
  "workspace_version_id": "ver-001",
  "type": "research_summary",
  "name": "Research Summary — AcmeCorp",
  "mime_type": "application/json",
  "extracted_text": "{\"company_overview\": \"...\", ...}",
  "source_artifact_ids": ["art-cim-001"],
  "metadata": { "llm_model": "llama-3.1-70b", "tokens_used": 15420 }
}
```

**Response:**
```json
{
  "id": "art-summary-001",
  "project_id": "proj-xyz789",
  "type": "research_summary",
  ...
}
```

#### `POST /projects/:id/claims` — Create Claims Directly

```http
POST /projects/proj-xyz789/claims
x-api-key: dev-api-key
x-customer-id: customer-1

{
  "claims": [
    {
      "type": "financial_fact",
      "text": "Revenue was $50M in FY2024",
      "reliability": "audited_filing",
      "evidence_excerpt": "Revenue for FY2024 was $50M...",
      "section": "key_financial_figures"
    }
  ]
}
```

This would create both the `Claim` and `Evidence` records in a single transaction.

### 6. Complete — Mark Task Done

```http
POST /tasks/task-abc123/complete
x-api-key: dev-api-key
x-customer-id: customer-1

{
  "output": {
    "artifact_id": "art-summary-001"
  }
}
```

The task status changes to `completed` and an event is logged.

## Example: Python External Agent

```python
import requests
import json
import time

API_URL = "http://localhost:3000"
HEADERS = {
    "x-api-key": "dev-api-key",
    "x-customer-id": "customer-1",
}

class ResearchAgent:
    def __init__(self, llm_client):
        self.llm = llm_client
        self.capability = "research"

    def poll(self):
        resp = requests.get(
            f"{API_URL}/tasks?capability={self.capability}&status=pending",
            headers=HEADERS
        )
        resp.raise_for_status()
        return resp.json().get("tasks", [])

    def claim(self, task_id):
        resp = requests.post(
            f"{API_URL}/tasks/{task_id}/claim",
            headers=HEADERS,
            json={"claimed_by": "python-research-agent"}
        )
        return resp.status_code == 200

    def heartbeat(self, task_id):
        requests.post(
            f"{API_URL}/tasks/{task_id}/heartbeat",
            headers=HEADERS,
            json={"lease_duration_ms": 300000}
        )

    def read_artifact(self, artifact_id):
        resp = requests.get(
            f"{API_URL}/artifacts/{artifact_id}",
            headers=HEADERS
        )
        resp.raise_for_status()
        return resp.json()

    def create_artifact(self, project_id, version_id, summary):
        # ⚠️ This endpoint does NOT exist yet — add it to the backend
        resp = requests.post(
            f"{API_URL}/artifacts",
            headers=HEADERS,
            json={
                "project_id": project_id,
                "workspace_version_id": version_id,
                "type": "research_summary",
                "name": f"Research Summary — {project_id}",
                "mime_type": "application/json",
                "extracted_text": json.dumps(summary),
                "source_artifact_ids": [],
                "metadata": {}
            }
        )
        resp.raise_for_status()
        return resp.json()["id"]

    def complete(self, task_id, artifact_id):
        requests.post(
            f"{API_URL}/tasks/{task_id}/complete",
            headers=HEADERS,
            json={"output": {"artifact_id": artifact_id}}
        )

    def run(self):
        while True:
            tasks = self.poll()
            for task in tasks:
                if self.claim(task["id"]):
                    self.heartbeat(task["id"])

                    # Read source artifact
                    artifact_id = task["payload"]["artifact_id"]
                    artifact = self.read_artifact(artifact_id)

                    # Do real work (call LLM)
                    summary = self.llm.analyze(artifact["extracted_text"])

                    # Write result back
                    new_artifact_id = self.create_artifact(
                        task["project_id"],
                        artifact["workspace_version_id"],
                        summary
                    )

                    # Complete task
                    self.complete(task["id"], new_artifact_id)

            time.sleep(5)  # Poll every 5 seconds


if __name__ == "__main__":
    agent = ResearchAgent(llm_client=OpenAI())
    agent.run()
```

## Recommended Implementation Order

To go from Path 1 to Path 2:

1. **Add `POST /artifacts`** — general artifact creation endpoint
2. **Add `POST /projects/:id/claims`** — bulk claim + evidence creation
3. **Extract agent logic from convenience endpoints** — move LLM calls out of `AgentService.ts` into standalone agent services
4. **Build agent runtime containers** — one container per capability (research, verification, regeneration)
5. **Add SSE (Server-Sent Events)** — optional latency optimization for agents that can maintain persistent connections
6. **Add task priority and budget tracking** — ensure expensive agents (verification, report generation) respect per-project budgets

## Why This Design

- **Agents never communicate directly** — all coordination happens through the durable blackboard (database + API)
- **Polling is universal** — works behind firewalls, works for CLI tools, works for serverless functions
- **Row-level locking prevents races** — no workflow engine needed for task claiming
- **Lease + heartbeat handles crashes** — if an agent dies, its task becomes reclaimable
- **The backend survives any agent crash** — the harness owns all state, agents are ephemeral
