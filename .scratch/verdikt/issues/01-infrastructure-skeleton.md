# 01: Infrastructure skeleton + CDK project setup

**What to build:** The CDK project and all base AWS resources: DynamoDB tables, SQS queues, Step Functions state machine shell, IAM roles, API Gateway, X-Ray tracing. No agent logic — just the skeleton that agents plug into.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

## Scope & Boundary

- **Owns:** All infrastructure provisioning. CDK stack definition, DynamoDB table schemas, SQS queue configuration, Step Functions state machine shell, IAM roles and policies, X-Ray tracing enablement, API Gateway stub.
- **Delegates:** Nothing — this is the foundation.
- **Does NOT:** Contain agent logic, Bedrock calls, or business rules.

## Core Entities / Data Models

- `Claims` table (claim ID, status, created/updated timestamps)
- `TriageRuns` table (run ID, claim ID, status, attempt count, budget remaining, created/updated)
- `AgentAttempts` table (attempt ID, run ID, agent type, status, result reference, timestamps)
- `Recommendations` table (recommendation ID, run ID, version, status, content)
- `Approvals` table (approval ID, recommendation ID, decision, actor, timestamp)
- `Snapshots` table (snapshot ID, run ID, version, state data)
- `Events` table (event ID, run ID, state transition, timestamp, metadata)
- `Budgets` table (budget ID, run ID, ceiling, remaining, spent)
- `SyntheticPolicies` table (policy ID, limits, coverage type, status)
- `SyntheticPriorClaims` table (claim ID, policy reference, settlement, date)
- `SyntheticRepairCosts` table (vehicle type, repair category, cost range)
- `AgentHandoffQueue` SQS queue (typed agent envelopes)
- `ApprovalCallbackQueue` SQS queue (approval request/resolution)
- Step Functions state machine shell with placeholder states

## Technical Dependencies & Pre-requisites

- AWS account with CDK bootstrapped
- Node.js 20 + TypeScript
- No other features required

## Acceptance Criteria

- [ ] `cdk deploy` succeeds and creates all listed resources
- [ ] Step Functions state machine shell transitions: `extract → investigate → review → approval_pending → completed`
- [ ] All DynamoDB tables have PAY_PER_REQUEST billing
- [ ] All resources have X-Ray tracing enabled
- [ ] SQS queues have dead-letter queues configured
- [ ] IAM roles follow least-privilege (agents can only write to their own tables and read from shared state)
- [ ] `cdk diff` shows zero changes on second run (idempotent)
