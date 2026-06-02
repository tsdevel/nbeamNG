---
status: open
labels: ready-for-agent
---

# PRD: NbeamNG Backend Platform (Resliced)

See `docs/prd/0003-nbeamng-backend-resliced.md` for the full Product Requirements Document.

This resliced PRD preserves all architecture decisions from `0002-nbeamng-backend-revised.md` and restructures user stories into ten smaller, shippable vertical slices based on external validation feedback.

Key changes from 0002:
- 6 slices → 10 slices
- DataNeeds moved from Slice 5 to Slice 3
- Claims/evidence split into Slice 4 (material claims + evidence) and Slice 5 (verification + contradictions)
- Review/corrections split into Slice 6 (basic corrections + immutable revisions), Slice 7 (impact analysis + targeted regeneration)
- Closeout/export split into Slice 8 (finalize + export), Slice 9 (dossiers), Slice 10 (deletion + expertise memory)
- Slice 1 narrowed: retention policies and advanced parsing deferred
- Slice 2 strengthened: structured output schema and lightweight source references added
- New sections: Cross-cutting Feature Maturity, Evaluation Gates between slices
- Testing section updated: failure recovery tests mapped to slices, analytical gates defined per slice
- New Further Note: impact analysis should over-invalidate rather than under-invalidate
