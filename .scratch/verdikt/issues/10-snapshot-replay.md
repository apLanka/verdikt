# 10: Snapshot + Replay

**What to build:** DynamoDB snapshots after each successful agent attempt. Resume-after-failure from last snapshot. Replay mechanism: create new TriageRun from snapshot, execute remaining nodes, verify same terminal state.

**Blocked by:** D4 (snapshot/replay mechanics), F7 (supervisor state machine).

**Status:** blocked

## Scope & Boundary

- **Owns:** Snapshot persistence, replay API, terminal-state verification, ReplayRecord creation.
- **Delegates:** Node execution to existing agent Lambdas + supervisor (F7). Snapshot writing integrated into supervisor completion path.
- **Does NOT:** Contain agent logic. Route agents beyond replay initiation.

## Core Entities / Data Models

- `RunSnapshot` — full run state checkpoint (claim ID, run ID, version, all results, node pointer, attempt count, budget remaining)
- `ReplayRecord` — links replay run to source snapshot and original run
- `RunEvent` — records resume/replay state transitions
- Reads: `Snapshots` table
- Writes: `Snapshots` table, `TriageRuns` table (new replay run), `ReplayRecord`

## Technical Dependencies & Pre-requisites

- D4 approved (snapshot/replay mechanics)
- F7 deployed (supervisor manages node pointer and attempt state)
- F4–F6 implemented (agents produce versioned results for snapshots)

## Acceptance Criteria

- [ ] Snapshot written after every successful attempt (not after failures)
- [ ] Snapshot contains: all versioned results, node pointer, attempt count, budget remaining, claim ID, run ID
- [ ] Resume: interrupted run resumes from last successful snapshot, not from scratch
- [ ] Resume: if first attempt fails (no snapshot), run terminates with `error`
- [ ] Replay API: POST with `{ claimId, runId }` creates new TriageRun from latest snapshot
- [ ] Replay executes only remaining nodes (not already-completed agents)
- [ ] Replay reaches same terminal state as original run (automated test verifies)
- [ ] Replay run linked to source run via ReplayRecord for audit trail
- [ ] Snapshot key: `(claimId, runId, snapshotVersion)` — supports multiple snapshots per run
- [ ] Resume/replay transitions recorded as RunEvent entries
