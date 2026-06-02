# Hybrid Blackboard Over Workflow Engine

For the durable project harness, we rejected Temporal, Restate, DBOS, Inngest, and other workflow engines in favor of a custom hybrid model: a Postgres-backed blackboard as the system of record, with a lightweight pub/sub event layer for agent coordination. Agents discover work by polling a REST API and write idempotent updates back to the blackboard. Task claiming uses row-level locking with leases and heartbeats.

We chose this because the outer lifecycle (create → ingest → run → review → revise → export → closeout) is only seven states — too simple for a workflow engine to add value. The real complexity is in the dynamic inner layer (agents reacting to typed state, claims being invalidated, workspace versions branching), which creates impedance mismatch with workflow DSLs. The hybrid model maximizes component swappability: any agent runtime (Pi SDK, Python script, deployed service) can participate without understanding the orchestration layer.

The cost is explicit failure-handling design. Every blackboard mutation must be an upsert with deterministic keys. Agents must tolerate re-execution safely. We accept this burden because investment-analysis agents operate on discrete entities (Claims, Artifacts, DataNeeds) that are naturally idempotent.
