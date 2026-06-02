# NbeamNG Kanban Board

Slices from PRD `0003-nbeamng-backend-resliced.md`. Each slice is a vertical, end-to-end deliverable. Status is tracked here until issues are published to GitHub.

---

## 📋 Backlog

| # | Slice | Type | Blocked by | PRD Stories | Status |
|---|---|---|---|---|---|
| 1 | **Ingest a Deal** | AFK | — | US 1–6 | 🔴 Not started |
| 2 | **Generate an Auditable First Draft** | AFK | #1 | US 7–12 | 🔴 Not started |
| 3 | **Track and Resolve DataNeeds** | AFK | #2 | US 13–19 | 🔴 Not started |
| 4 | **Govern Material Claims** | AFK | #2 | US 20–24 | 🔴 Not started |
| 5 | **Verify Claims and Detect Contradictions** | AFK | #4 | US 25–28 | 🔴 Not started |
| 6 | **Apply Human Corrections** | AFK | #4, #5 | US 29–33 | 🔴 Not started |
| 7 | **Suggest Impact and Regenerate** | **HITL** | #4, #5, #6 | US 34–38 | 🔴 Not started |
| 8 | **Finalize and Export** | AFK | #4, #5, #6, #7 | US 39–42 | 🔴 Not started |
| 9 | **Longitudinal Dossiers** | AFK | #1–#8 | US 43–46 | 🔴 Not started |
| 10 | **Harden Deletion and Expertise Memory** | **HITL** | #1–#9 | US 47–54 | 🔴 Not started |

---

## 🟡 Ready

*Nothing ready yet — start with #1.*

---

## 🔵 In Progress

*Nothing in progress yet.*

---

## ✅ Done

*Nothing done yet.*

---

## Dependency Graph

```
#1 Ingest a Deal
  └── #2 Generate First Draft
        ├── #3 DataNeeds
        └── #4 Govern Material Claims
              └── #5 Verify Claims
                    └── #6 Apply Corrections
                          └── #7 Suggest Impact
                                └── #8 Finalize & Export
                                      └── #9 Dossiers
                                            └── #10 Deletion & Expertise
```

Slices 3 and 4 are independent branches from 2.

---

## Notes

- **AFK** = ready for agent implementation without human interaction
- **HITL** = requires human design review or architectural decision before implementation
- All major architecture decisions already made in PRD/ADR
- Slice 7 (Impact Analysis) is the hardest subsystem — it should only proceed after Slice 6 proves manual corrections work
- Evaluation gates (system correctness + analytical usefulness) defined in PRD section "Testing Decisions"
