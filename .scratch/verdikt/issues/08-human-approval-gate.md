# 08: Human approval gate

**What to build:** API Gateway endpoint + Lambda that receives approve/reject decisions, validates actor and recommendation version, records ApprovalDecision, executes SimulatedAction, and calls SendTaskSuccess/Failure to resume the Step Functions workflow.

**Blocked by:** D5 (approval gate mechanics), F7 (supervisor routes to gate).

**Status:** blocked

## Scope & Boundary

- **Owns:** Approval recording, recommendation version validation, simulated write-back, Step Functions callback completion.
- **Delegates:** Recommendation generation to Reviewer (F6). Workflow routing to Supervisor (F7).
- **Does NOT:** Generate recommendations. Route agents. Modify claim state beyond approval recording.

## Core Entities / Data Models

- Consumes: POST request `{ recommendationId, decision, actor, timestamp }`
- Produces: `ApprovalDecision` record in DynamoDB
- Executes: `SimulatedAction` (no-op write-back log) on approval
- Interacts: `SendTaskSuccess` (approve) or `SendTaskFailure` (reject) to Step Functions

## Technical Dependencies & Pre-requisites

- D5 approved (approval gate mechanics)
- F7 deployed (supervisor pauses at approval gate)
- F6 implemented (reviewer produces recommendations)
- API Gateway endpoint configured in F1

## Acceptance Criteria

- [ ] POST endpoint accepts `{ recommendationId, decision: "approve"|"reject", actor, timestamp }`
- [ ] Validates recommendation exists and is in `pending_approval` state
- [ ] Approval binds to exact recommendation version (approving v1 does not authorize v2)
- [ ] On approve: SimulatedAction logged, workflow completes with `approved` terminal state
- [ ] On reject: workflow terminates with `rejected` terminal state
- [ ] Duplicate approval on same recommendation → 409 Conflict
- [ ] Invalid/missing actor → 400 Bad Request
- [ ] Invalid recommendation ID → 404 Not Found
- [ ] ApprovalDecision record includes recommendation ID, version, claim ID, run ID, actor, timestamp
- [ ] SimulatedAction logs what a real write-back would do (does not call external systems)
