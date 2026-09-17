# 09: Budget module

**What to build:** DynamoDB-backed budget tracking. Each agent attempt reserves a token/dollar allowance before Bedrock inference. Usage recorded after inference. Breach triggers run halt. CloudWatch alarms and cost-per-claim dashboard.

**Blocked by:** D3 (cost-ceiling granularity), F1 (infrastructure).

**Status:** blocked

## Scope & Boundary

- **Owns:** Budget reservation logic, usage recording, ceiling enforcement, CloudWatch alarms, cost-per-claim dashboard.
- **Delegates:** Enforcement to supervisor Choice states (F7). Agent Lambdas call reservation API before inference.
- **Does NOT:** Contain agent logic. Route agents. Make business decisions.

## Core Entities / Data Models

- `BudgetAccount` — per-run spending envelope (ceiling, remaining, spent)
- `UsageRecord` — one attempt's actual token/dollar cost
- Reads: `Budgets` table
- Writes: `Budgets` table (reservation and actual usage), CloudWatch metrics

## Technical Dependencies & Pre-requisites

- D3 approved (cost-ceiling granularity)
- F1 deployed (Budgets DynamoDB table, CloudWatch namespace)
- Bedrock model pricing known (for default ceiling calculation)

## Acceptance Criteria

- [ ] BudgetAccount created per TriageRun with configurable ceiling
- [ ] Reservation before Bedrock call; rejected if budget exhausted
- [ ] Reservation failure → agent reports budget-exceeded to Step Functions
- [ ] Actual usage recorded after every Bedrock call (including failures — partial usage)
- [ ] UsageRecord includes: input tokens, output tokens, model ID, cost (USD), timestamp
- [ ] CloudWatch dashboard: cost-per-claim chart, average cost, p95 cost
- [ ] CloudWatch alarm: single run exceeds ceiling → SNS notification
- [ ] CloudWatch alarm: error rate > 5% → SNS notification
- [ ] Budget ceiling is a CDK parameter (configurable at deploy time)
- [ ] Default ceiling: $2.00 per run
