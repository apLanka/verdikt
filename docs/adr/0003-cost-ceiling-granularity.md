# Decision: Cost-ceiling granularity

**Status:** Proposed — awaiting user approval
**Type:** Architecture decision
**Scope:** Per-run token and dollar budget enforcement.

## Question

How does the Supervisor enforce a hard cost ceiling per claim run, and when is usage recorded?

## Requirements

PRD §§3, 8 require cost and step ceilings enforced in code (Lambda-level checks), not by prompt instruction alone. Cost per claim must be chartable. Every payout recommendation must be blocked until approval is recorded.

## Recommendation

Reservation-based. Before each agent calls Bedrock, it requests a token/dollar allowance from the budget module. The module checks remaining budget for the run. If the reservation exceeds the remaining allowance, the module rejects the call and the agent reports a budget-exceeded failure to Step Functions. The run halts.

After Bedrock returns, the agent records actual usage (input tokens, output tokens, cost) in a UsageRecord attached to the TriageRun. CloudWatch aggregates cost-per-claim.

Ceiling value: configurable per-deploy (default: $2.00 per run).

## Ownership

- Budget module (DynamoDB): maintains remaining budget per run, validates reservations, records actual usage.
- Agent Lambdas: request reservation before inference, report actual usage after inference.
- Supervisor (Choice state): checks budget remaining before dispatch; transitions to `budget_exceeded` terminal state if exhausted.
- CloudWatch: aggregates cost-per-claim dashboards and alarms.

## Alternatives

- Post-hoc billing (check after inference) allows one over-budget call; acceptable for a reference architecture but violates the "enforced in code" requirement.
- Per-agent sub-budgets add complexity without proportional benefit; the PRD ceiling is per claim.
- Prompt-only budgeting is explicitly rejected by the PRD.

## Acceptance criteria for implementation

- Agent cannot call Bedrock without a valid reservation.
- Reservation fails cleanly if budget is exhausted — no partial state, no silent failure.
- Actual usage is recorded after every Bedrock call, including failures (partial usage).
- CloudWatch dashboard shows cost-per-claim, average cost, and p95 cost.
- Alarm fires when any single run exceeds the ceiling.
- Budget ceiling is a CDK parameter.

## Impact

Blocks F9 (budget module). Agent implementations (F4-F6) must integrate with the reservation API.
