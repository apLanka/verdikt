# Decision: Snapshot and replay mechanics

**Status:** Proposed — awaiting user approval
**Type:** Architecture decision
**Scope:** Durable state checkpointing and replay-from-snapshot.

## Question

How does Verdikt support resuming a failed run and replaying a completed run from a stored checkpoint?

## Requirements

PRD §§3, 8 require every run to be observable (full trace) and replayable (resumable from a stored snapshot). At least one run must be replayed and reach the same terminal state. A failed run must be resumable, not restarted from scratch.

## Recommendation

Snapshot after every **successful** agent attempt. The snapshot contains the full TriageRun state: claim ID, run ID, all versioned agent results to date, the current node pointer, attempt count, budget remaining, and the list of completed attempts.

DynamoDB item per snapshot, keyed by `(claimId, runId, snapshotVersion)`.

**Resume-after-failure:** When an attempt fails (SendTaskFailure or timeout), the Supervisor checks the last successful snapshot. If one exists, the run resumes from that snapshot's node pointer with the failure logged as a RunEvent. If no successful snapshot exists (first attempt failed), the run terminates with `error`.

**Replay:** POST to replay API with `{ claimId, runId }`. Creates a new TriageRun seeded from the latest snapshot. Executes only remaining nodes. Must reach the same terminal state as the original run (ship gate §8). Replay run linked to source via ReplayRecord.

## Ownership

- State boundary: writes snapshots after successful attempts; reads snapshots for resume and replay.
- Supervisor: checks for failed-attempt resume before dispatching; selects next node from snapshot pointer.
- Replay API: creates new run from snapshot, validates terminal state match.
- RunEvent: records every state transition for audit trail.

## Alternatives

- Event-sourcing (rebuild state from event log) is more flexible but adds complexity; the PRD asks for snapshots, not a full event store.
- DynamoDB Streams for snapshot triggers adds latency and a second primitive; explicit writes in the agent completion path are simpler.
- Storing snapshots in S3 adds a second API; DynamoDB is already the state store.

## Acceptance criteria for implementation

- Snapshot written after every successful attempt (not after failures).
- Resume: a run interrupted mid-attempt resumes from the last successful snapshot, not from scratch.
- Resume: if the first attempt fails (no snapshot), the run terminates with `error`.
- Replay: new run executes only remaining nodes (not already-completed agents).
- Replay: terminal state matches original run (verified in automated test).
- Replay run linked to source run via ReplayRecord for audit.
- Snapshot contains all versioned results, node pointer, attempt count, and budget remaining.

## Impact

Blocks F10 (snapshot/replay). Depends on F7 (supervisor) for node pointer logic.
