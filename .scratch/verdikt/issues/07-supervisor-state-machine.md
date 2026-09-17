# 07: Supervisor state machine (full graph)

**What to build:** Complete Step Functions Standard workflow that routes claims through Extractor → Investigator → Reviewer, handles reviewer rework loops, enforces step ceiling, cost ceiling, halts at approval gate, and manages resume-after-failure from snapshots.

**Blocked by:** D1–D8 (all decisions), F1 (infrastructure), F2 (contracts), F4 (extractor), F5 (investigator), F6 (reviewer).

**Status:** blocked

## Scope & Boundary

- **Owns:** Routing logic, termination conditions, loop guards, step ceiling enforcement, cost ceiling check, approval gate pause, resume-after-failure detection.
- **Delegates:** All specialist work to F4/F5/F6. Approval decisions to F8. Budget tracking to F9. Snapshots to F10.
- **Does NOT:** Contain agent logic. Call Bedrock. Make business decisions.

## Core Entities / Data Models

- State machine definition: `extract → investigate → review → [rework | approval_pending | completed | rejected | budget_exceeded | error]`
- Reads: `TriageRun` state (attempt count, budget remaining, node pointer)
- Writes: `TriageRun` status transitions, `RunEvent` records
- Interacts: SQS dispatches to agent Lambdas, callback tasks for approval

## Technical Dependencies & Pre-requisites

- D1–D8 all approved
- F1 deployed (state machine shell exists)
- F2 contracts (schemas for choice-state matching)
- F4, F5, F6 implemented (agents exist to dispatch to)
- F9 available (budget checks before dispatch)
- F10 available (snapshot writes after success, resume reads)

## Acceptance Criteria

- [ ] Standard workflow routes through all three agents in correct order
- [ ] Reviewer rework loops back to correct agent (extractor or investigator)
- [ ] Step ceiling enforced: Choice state checks attempt count before each dispatch
- [ ] Cost ceiling enforced: Choice state checks budget remaining before each dispatch
- [ ] Approval gate pauses workflow on callback task (does not proceed without external signal)
- [ ] Terminal states: `completed`, `rejected`, `budget_exceeded`, `error`
- [ ] Resume-after-failure: interrupted run resumes from last successful snapshot, not from scratch
- [ ] Resume-after-failure: if first attempt fails (no snapshot), run terminates with `error`
- [ ] X-Ray trace covers full execution path (every state transition visible)
- [ ] RunEvent written for every state transition (audit trail)
- [ ] Snapshot written after every successful attempt
- [ ] State machine definition is in TypeScript (CDK), not raw JSON
