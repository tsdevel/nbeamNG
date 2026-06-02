---
status: open
labels: ready-for-agent
---

# PRD: NbeamNG Backend Platform

See `docs/prd/0001-nbeamng-backend.md` for the full Product Requirements Document.

This PRD covers all six vertical slices of the NbeamNG backend platform: project creation, agent draft generation, claim/evidence governance, review and targeted regeneration, DataNeed lifecycle, and memory closeout.

Key decisions captured:
- Standalone backend service (not Pi extension)
- Express + Prisma + PostgreSQL + MinIO/S3
- Hybrid blackboard over workflow engine (see docs/adr/0001-hybrid-blackboard-over-workflow-engine.md)
- Polling API as universal task discovery; SSE optional
- Vertical slices, not horizontal infrastructure phases
- Idempotency + task claiming for failure recovery
