# Decision: Step-count semantics

**Status:** Proposed — awaiting user approval
**Type:** Architecture decision
**Scope:** Triage run termination and attempt budgeting.

## Question

How does the Supervisor enforce a hard ceiling on work per claim run?

## Requirements

PRD §§3, 7 require the Supervisor (not the agents) to enforce a max step count in code. The ceiling must be visible in the Step Functions definition and auditable in the run's event history.

## Recommendation

Count **agent attempts** — one per SQS dispatch/resolution cycle — not internal Lambda invocations, states, or logical steps. The Supervisor holds a `attemptCount` field in the TriageRun state. Every time a specialist completes or fails, `attemptCount` increments. A Step Functions Choice state checks `attemptCount < MAX_ATTEMPTS` before every dispatch.

Default ceiling: **6 attempts per run.** This allows the reviewer rework path (at least once, per the PRD) plus one retry per agent without waste.

The ceiling is a CDK parameter, not hardcoded, so reviewers can see the configurability.

## Ownership

- Supervisor: increments, checks, and enforces the ceiling.
- Specialists: unaware of the ceiling; they receive work, execute, and report.
- Budget module (F9): reports usage; the ceiling check is separate from cost enforcement.

## Alternatives

- Counting logical steps (extract/investigate/review as 3 steps regardless of rework) hides retry behavior from the audit trail.
- No ceiling wastes budget on pathological loops; a single LLM hallucination could retry forever.
- Making the ceiling per-agent (e.g., 2 per agent) adds complexity; the PRD says "max step count" for the run, not per agent.

## Acceptance criteria for implementation

- Each agent dispatch increments the attempt counter.
- The supervisor halts the run and transitions to `error` when the ceiling is reached mid-run.
- The ceiling value is configurable at deploy time.
- The attempt count is recorded in every RunEvent and visible in X-Ray traces.

## Impact

Blocks F7 (supervisor state machine). Does not block agent implementation or contracts.
