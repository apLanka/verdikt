# 11: Observability (X-Ray + CloudWatch)

**What to build:** Full X-Ray traces per claim run. Cost-per-claim dashboard. CloudWatch alarms for budget breach and error rates. Structured JSON logging across all Lambdas.

**Blocked by:** F1 (infrastructure), F7 (supervisor), F9 (budget module).

**Status:** blocked

## Scope & Boundary

- **Owns:** X-Ray trace configuration, CloudWatch dashboard, alarm definitions, log formatting standards.
- **Delegates:** Nothing — decorates existing infrastructure and agents.
- **Does NOT:** Contain agent logic. Modify business rules.

## Core Entities / Data Models

- X-Ray traces: full execution path per TriageRun
- CloudWatch metrics: cost-per-claim, attempt count, rework rate, error rate
- CloudWatch dashboard: cost-per-claim chart, attempt-count histogram, rework-rate gauge
- CloudWatch alarms: budget breach, error rate > 5%
- Structured logs: claimId, runId, attemptId, agentType, duration, tokens, cost

## Technical Dependencies & Pre-requisites

- F1 deployed (all resources have X-Ray tracing enabled)
- F7 deployed (supervisor emits state transition events)
- F9 deployed (budget metrics available)

## Acceptance Criteria

- [ ] X-Ray trace shows every state transition + agent invocation
- [ ] X-Ray service map shows: Step Functions → SQS → Lambda → Bedrock → DynamoDB
- [ ] CloudWatch dashboard: cost-per-claim chart (per run and aggregate)
- [ ] CloudWatch dashboard: attempt-count histogram
- [ ] CloudWatch dashboard: rework-rate gauge (percentage of runs with rework)
- [ ] CloudWatch alarm: budget breach triggers SNS notification
- [ ] CloudWatch alarm: error rate > 5% triggers SNS notification
- [ ] All Lambda logs structured as JSON with: claimId, runId, attemptId, agentType, duration, tokens, cost
- [ ] Logs queryable via CloudWatch Insights (claimId and runId as indexed fields)
- [ ] Dashboard and alarms included in CDK stack (not manual console setup)
