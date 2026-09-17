# Decision: Approval gate mechanics

**Status:** Proposed — awaiting user approval
**Type:** Architecture decision
**Scope:** Human authorization before payout recommendation or write-back.

## Question

How does the Supervisor pause for human approval and resume after a decision?

## Requirements

PRD §§3, 7, 8 require human approval before any payout recommendation or claims-system write-back. Every payout recommendation must be blocked from execution until approval is recorded. The approval must bind to a specific recommendation version.

## Recommendation

After the Reviewer produces a Recommendation, the Supervisor transitions to an approval-pending state. Step Functions pauses on a callback task (same `.waitForTaskToken` pattern as agent handoffs). A callback token is stored with the ApprovalRequest in DynamoDB.

A lightweight API Gateway endpoint receives approve/reject decisions:
```
POST /approval
{
  "recommendationId": "rec-abc-123",
  "decision": "approve" | "reject",
  "actor": "human-ops-001",
  "timestamp": "2026-09-17T12:00:00Z"
}
```

The approval Lambda validates the recommendation exists and is in `pending_approval` state. On valid approval: records ApprovalDecision, executes SimulatedAction (no-op write-back), calls `SendTaskSuccess` to resume workflow. On reject: records rejection, calls `SendTaskFailure`.

## Ownership

- Reviewer: produces Recommendation; does not control approval.
- Approval boundary: records decisions, validates state, calls Step Functions APIs.
- Supervisor: pauses at gate, resumes on callback, transitions to terminal state.
- SimulatedAction: executes only after approval; logs what a real write-back would do.

## Alternatives

- Slack/webhook integration adds external dependencies; the PRD says "simple approval UI or Slack/webhook" — API Gateway is the minimal path.
- Step Functions directly invoked approval (no callback) would block the workflow synchronously; not practical for human-in-the-loop.
- Approval without version binding risks approving a stale recommendation; the PRD requires version-specific approval.

## Acceptance criteria for implementation

- Workflow pauses at approval gate (callback task) and does not proceed without external signal.
- Approval binds to exact recommendation version — approving version 1 does not authorize version 2.
- Duplicate approval on same recommendation returns 409 Conflict.
- SimulatedAction logs what a real write-back would do; does not call any external system.
- On approve: workflow completes with `approved` terminal state.
- On reject: workflow terminates with `rejected` terminal state.
- Approval request includes recommendation ID, version, claim ID, and run ID.

## Impact

Blocks F8 (human approval gate). Depends on F6 (reviewer produces recommendations) and F7 (supervisor routes to gate).
