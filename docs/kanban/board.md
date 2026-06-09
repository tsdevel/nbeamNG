# NbeamNG Kanban Board

Slices from PRD `0003-nbeamng-backend-resliced.md`. Each slice is a vertical, end-to-end deliverable. Status is tracked here until issues are published to GitHub.

---

## 📋 Backlog

| # | Slice | Type | Blocked by | PRD Stories | Status |
|---|---|---|---|---|---|
| 9 | **Longitudinal Dossiers** | AFK | #1–#8 | US 43–46 | 🟡 Ready |
| 10 | **Harden Deletion and Expertise Memory** | **HITL** | #1–#9 | US 47–54 | 🔴 Not started |

---

## 🟡 Ready

| # | Slice | Type | Blocked by | PRD Stories | Status |
|---|---|---|---|---|---|
| 9 | **Longitudinal Dossiers** | AFK | #1–#8 | US 43–46 | 🟡 Ready |

---

## 🔵 In Progress

*Nothing in progress yet.*

---

## ✅ Done

| # | Slice | Type | PRD Stories | Commit |
|---|---|---|---|---|
| 1 | **Ingest a Deal** | AFK | US 1–6 | `eb63929` |
| 2 | **Generate an Auditable First Draft** | AFK | US 7–12 | `6e79ada` |
| 3 | **Track and Resolve DataNeeds** | AFK | US 13–19 | `8af6a7b` |
| 4 | **Govern Material Claims** | AFK | US 20–24 | `28783ba` |
| 5 | **Verify Claims and Detect Contradictions** | AFK | US 25–28 | `ecee8e5` |
| 6 | **Apply Human Corrections** | AFK | US 29–33 | `e0050d9` |
| 7 | **Suggest Impact and Regenerate** | AFK | US 34–38 | `09272b7` |
| 8 | **Finalize and Export** | AFK | US 39–42 | `3525ecb` |

---

## Dependency Graph

```
#1 Ingest a Deal
  └── #2 Generate First Draft
        ├── #3 DataNeeds
        └── #4 Govern Material Claims
              └── #5 Verify Claims
                    └── ✅ #6 Apply Corrections
                          └── ✅ #7 Suggest Impact
                                └── ✅ #8 Finalize & Export
                                      └── #9 Dossiers
                                            └── #10 Deletion & Expertise
```

Slices 3 and 4 are independent branches from 2.

---

## Notes

- **AFK** = ready for agent implementation without human interaction
- **HITL** = requires human design review or architectural decision before implementation
- All major architecture decisions already made in PRD/ADR
- Slice 7 (Impact Analysis) was the hardest subsystem in the MVP — now complete
- Evaluation gates (system correctness + analytical usefulness) defined in PRD section "Testing Decisions"
