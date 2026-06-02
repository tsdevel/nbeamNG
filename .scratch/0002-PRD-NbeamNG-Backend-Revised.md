---
status: open
labels: ready-for-agent
---

# PRD: NbeamNG Backend Platform (Revised)

See `docs/prd/0002-nbeamng-backend-revised.md` for the full Product Requirements Document.

This revised PRD incorporates all architecture decisions from the design session:
- Unified PostgreSQL database for runtime + expertise (not separate systems)
- Juice vs. Body separation (structured data retained, raw files purged)
- Three-tier deletion model (standard closeout, confidential redaction, full purge)
- Project as engagement, Company Dossier as long-lived entity
- Ingestion Pipeline as first-class process
- Company Expertise Memory = dossier (raw historical claims) + distilled (generalized lessons)
- Tenant scoping by customer_id from Slice 1
- Cross-project longitudinal queries for re-runs and follow-ups

Key decisions captured:
- Standalone backend service (not Pi extension)
- Express + Prisma + PostgreSQL + MinIO/S3 + pgvector
- Hybrid blackboard over workflow engine
- Polling API as universal task discovery; SSE optional
- Vertical slices, not horizontal infrastructure phases
- Idempotency + task claiming for failure recovery
