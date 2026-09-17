# Verdikt — Multi-Agent Claims Triage on AWS

An open-source, multi-agent insurance claims triage system. Decomposes claims processing into bounded, observable, replayable agents with hard cost ceilings and human approval gates.

## About the Project

Verdikt is an open-source, multi-agent insurance claims triage system built entirely on AWS. It demonstrates how a complex business process — one that cannot be reliably handled by a single LLM prompt — can be decomposed into bounded, observable, and replayable agents with hard cost ceilings and human approval gates.

The system processes synthetic insurance claims through a pipeline of specialized AI agents, each responsible for one aspect of the triage process. A deterministic supervisor (AWS Step Functions) orchestrates the flow, enforces budget constraints, and ensures no action is taken without human authorization.

### The Problem It Solves

A regional insurer processes approximately 900 claims per day. Each claim requires:

1. **Document extraction** — pulling structured data from accident reports, repair estimates, and photos
2. **Policy verification** — cross-checking against policy limits and prior claims history
3. **Damage assessment** — sanity-checking repair estimates against known cost data
4. **Recommendation** — producing a written recommendation with supporting evidence

A single LLM prompt cannot reliably handle all of this. Even if it could, there is no way to audit why a conclusion was reached, resume a failed run, prevent autonomous actions, or enforce hard cost limits on AI inference.

### Why It Exists

Verdikt exists to prove one thing: **a task too complex for a single prompt can be decomposed into bounded, observable, replayable agents — using AWS-native primitives instead of a hand-rolled state machine.**

### What It Demonstrates

- **Termination conditions** — every run reaches a defined terminal state
- **Loop guards** — rework is bounded (max 6 attempts)
- **Cost ceilings** — enforced in code, not by prompt instruction
- **Human-in-the-loop** — no autonomous actions without approval
- **Full auditability** — every state transition is recorded and traceable

### Key Concepts

- **Claim vs. TriageRun** — A claim is the input. A triage run is one execution of the supervisor graph. A claim can have many runs. A failed run does not mean a denied claim.
- **Agents vs. Supervisor** — The agents (Extractor, Investigator, Reviewer) use Bedrock to reason. The supervisor (Step Functions) routes work and enforces constraints but never makes decisions.
- **Recommendation vs. Approval** — Agents recommend. Humans authorize. No money moves without an `ApprovalDecision`.
- **Schema-first contracts** — All data flowing between agents is validated against Zod schemas at runtime.
- **Budget enforcement** — Every TriageRun gets a $2.00 spending envelope and a 6-attempt ceiling, enforced in code.

---

## Architecture

![Verdikt Architecture](docs/verdikt%20arhitecture%20diagram.png)

### AWS Services Used

| Layer | Service | Role |
|---|---|---|
| Orchestration | **AWS Step Functions** | Supervisor graph — routes claim through agents, enforces step/budget limits |
| Agent Compute | **AWS Lambda** | Each specialist agent runs as an isolated function |
| Async Handoff | **Amazon SQS** | Typed message handoffs between agents |
| Shared State | **Amazon DynamoDB** | Claim state store; any run resumable from a snapshot |
| Model Inference | **Amazon Bedrock** | LLM calls for extraction, investigation, and recommendation |
| Human Approval | **API Gateway + Lambda** | Gate before any payout recommendation or write-back |
| Observability | **AWS X-Ray + CloudWatch** | Full trace per claim run, cost-per-claim dashboard |
| Cost Enforcement | **Lambda guards + CloudWatch** | Token/dollar ceiling per claim enforced in code |

---

## How a Claim Flows Through the System

### Phase 1: Extract

The Extractor receives raw claim documents (accident report, repair estimate, photo description) and extracts structured facts using Bedrock. Each fact is linked to its source document via an `EvidenceReference`. The result is validated against a Zod schema before being stored in DynamoDB.

### Phase 2: Investigate

The Investigator cross-checks the ExtractionResult against synthetic policy limits and prior claims. It reads reference data from DynamoDB (exact key lookups, no scans), then uses Bedrock to produce a verdict: proceed, reject, or flag for review.

### Phase 3: Review

The Reviewer performs a sanity check. It reads both the ExtractionResult and InvestigationResult, then produces either:

- **ReworkRequest** → routes back to Extractor or Investigator
- **Recommendation** → versioned written recommendation (approve, reject, or escalate)

### Phase 4: Approval Gate

When the Reviewer issues a Recommendation, Step Functions **pauses** using `WAIT_FOR_TASK_TOKEN`. The workflow is suspended until a human approves or rejects via the API. This ensures no money moves without human authorization.

---

## State Machine

```
InitializeRun → Extract → Investigate → Review → ApprovalGate → Completed
                              ↑              ↓
                              └── Rework ────┘
```

Every dispatch checks the step ceiling (max 6 attempts) and budget ($2.00) before proceeding. If either is exceeded, the run terminates with `budget_exceeded`.

---

## Budget Enforcement

Every TriageRun starts with a **$2.00 budget** and a **6-attempt ceiling**.

- **Per-Agent (Lambda code)**: Each agent reserves 25% of remaining budget before calling Bedrock, preventing one expensive agent from starving others.
- **Per-Run (Step Functions)**: The state machine checks step count and budget before every dispatch. If exceeded, the run terminates immediately.

---

## DynamoDB Schema

### Core Tables

| Table | PK | SK | Purpose |
|---|---|---|---|
| `Claims` | `claimId` | `claimId` | Claim metadata |
| `TriageRuns` | `claimId` | `runId` | Run status, budget, attempt count |
| `AgentAttempts` | `runId` | `attemptId` | Per-agent invocation record |
| `ExtractionResults` | `runId` | `attemptId` | Extractor output |
| `InvestigationResults` | `runId` | `attemptId` | Investigator output |
| `ReviewResults` | `runId` | `attemptId` | Reviewer output |
| `Recommendations` | `runId` | `version` | Versioned recommendations |
| `Approvals` | `recommendationId` | `recommendationId` | Human decisions |
| `Snapshots` | `runId` | `version` | Run state checkpoints |
| `RunEvents` | `runId` | `timestamp` | Immutable audit trail |
| `Budgets` | `runId` | `runId` | Spending envelope |

### Reference Data (read-only)

| Table | PK | Source |
|---|---|---|
| `SyntheticPolicies` | `policyId` | `fixtures/reference/policies.json` |
| `SyntheticPriorClaims` | `priorClaimId` | `fixtures/reference/prior-claims.json` |
| `SyntheticRepairCosts` | `vehicleType` | `fixtures/reference/repair-costs.json` |

---

## Package Structure

```
verdikt/
├── infra/                          # CDK infrastructure
│   └── lib/verdikt-stack.ts        # All 15 tables, SQS, Step Functions, API GW, CloudWatch
├── contracts/                      # Shared data models
│   └── src/schemas.ts              # 15 Zod schemas (Claim, TriageRun, AgentAttempt, etc.)
├── fixtures/                       # Synthetic test data
│   ├── claims/                     # 30 claims with expected outcomes
│   └── reference/                  # Policies, prior claims, repair costs
├── packages/
│   ├── extractor/                  # Extractor Lambda
│   ├── investigator/               # Investigator Lambda
│   ├── reviewer/                   # Reviewer Lambda
│   ├── approval/                   # Approval handler Lambda
│   ├── budget/                     # BudgetStore (reservation-based tracking)
│   ├── snapshot/                   # SnapshotStore + replay handler
│   └── logger/                     # Structured JSON logger + CloudWatch metrics
├── docs/
│   ├── adr/                        # 8 architecture decision records
│   └── Verdikt — Product Requirements Document.md
└── README.md
```

---

## CloudWatch Observability

### Dashboard

| Widget | Metric | Purpose |
|---|---|---|
| Cost per Claim | `CostPerClaim` (Sum, 5min) | Track spending per run |
| Average Attempt Count | `AttemptCount` (Average, 5min) | Monitor agent efficiency |
| Rework Rate | `ReworkCount / TotalRuns` | Measure extraction/investigation quality |
| Error Rate | `ErrorCount / TotalRuns` | Detect agent failures |

### Alarms

| Alarm | Condition | Action |
|---|---|---|
| Budget Breach | `CostPerClaim > $2.00` | SNS notification |
| Error Rate | `Error / Total > 5%` for 3 periods | SNS notification |

### Structured Logging

All Lambdas emit JSON logs with `claimId`, `runId`, `attemptId`, `agentType`, `costUsd`, token counts, and duration. Logs are queryable via CloudWatch Insights.

---

## Synthetic Dataset

30 claims covering all expected system behaviors:

| Scenario | Count | Expected Outcome |
|---|---|---|
| Straightforward claims | 8 | Approve on first pass |
| Rework then approve | 6 | Reviewer requests rework, then recommends approval |
| Rework then reject | 5 | Reviewer requests rework, then recommends rejection |
| Budget exceeded | 3 | Attempt ceiling or cost ceiling hit |
| Policy violation | 3 | Investigator flags coverage gap |
| Edge cases | 4 | Zero amount, missing docs, duplicates, invalid input |

Reference data: 8 policies, 7 prior claims, 15 repair cost records.

---

## Setup

### Prerequisites

- Node.js ≥ 20
- AWS CLI configured (`aws configure`)
- AWS CDK v2 (`npm install -g aws-cdk`)
- First deploy: `cd infra && npx cdk bootstrap`

### Install & Build

```bash
npm install
cd infra && npm install
cd .. && npm run build
```

### Deploy

```bash
cd infra && npx cdk deploy
```

### Submit a Claim

```bash
aws stepfunctions start-execution \
  --state-machine-arn <StateMachineArn> \
  --input '{"claimId":"CLM-001"}'
```

### Approve a Recommendation

```bash
curl -X POST <ApprovalApiUrl>/approval \
  -H 'Content-Type: application/json' \
  -d '{
    "recommendationId": "<id>",
    "decision": "approve",
    "actor": "human@example.com"
  }'
```

### Run Evaluation

```bash
node scripts/eval.mjs
```

---

## API Endpoints

### POST /approval

Submit an approval decision for a recommendation.

**Request:**
```json
{
  "recommendationId": "rec-abc123",
  "decision": "approve",
  "actor": "human@example.com"
}
```

**Response:**
```json
{
  "approvalId": "approval-xyz789",
  "recommendationId": "rec-abc123",
  "decision": "approve",
  "timestamp": "2025-01-15T10:30:00.000Z"
}
```

**Error Codes:** `400` (invalid body), `404` (not found), `409` (already decided), `500` (server error)

---

## Bedrock Model Configuration

- **Model**: Anthropic Claude 3 Sonnet (or equivalent)
- **Temperature**: 0.0 (deterministic)
- **Max Tokens**: 4096

Each agent has a system prompt template with role definition, input/output schemas, business rules, and examples. Templates are stored in each agent's `prompts/` directory.

---

## Design Tradeoffs

| Decision | Alternative | Why This Choice |
|---|---|---|
| Step Functions | LangGraph, Temporal | AWS-native, no additional infrastructure, built-in observability |
| DynamoDB | PostgreSQL, RDS | Serverless, no connection pools, scales automatically |
| Lambda | ECS Fargate | Lower cost for short-lived tasks, auto-scaling |
| Bedrock | OpenAI, Anthropic | AWS-native, no data leaving AWS, integrated billing |
| SQS | Direct Lambda invoke | Async decoupling, dead-letter queues, retry handling |
| Zod schemas | JSON Schema only | Runtime validation + TypeScript types + documentation |

---

## Domain Glossary

| Term | Definition |
|---|---|
| **Claim** | A synthetic insurance claim submitted for triage |
| **TriageRun** | One execution of the supervisor graph for a Claim |
| **AgentAttempt** | One invocation of one specialist agent within a TriageRun |
| **ReworkRequest** | A request from the Reviewer to re-run Extractor or Investigator |
| **ExtractionResult** | Schema-validated structured output from the Extractor |
| **InvestigationResult** | Cross-check of an ExtractionResult against policy limits |
| **ReviewResult** | Either a ReworkRequest or a Recommendation |
| **Recommendation** | A versioned written recommendation produced by the Reviewer |
| **ApprovalDecision** | A human decision (approve or reject) on a Recommendation |
| **BudgetAccount** | Per-TriageRun spending envelope enforced in code |

---

## Evaluation

```bash
node scripts/eval.mjs
```

Results written to `eval-results.json`. Each claim's expected outcome is in `fixtures/claims/<claimId>.json` under `expectedOutcome`.

---

## Troubleshooting

| Issue | Solution |
|---|---|
| `BudgetExceeded` error | Check Bedrock model costs; review agent prompts for efficiency |
| `UnexpectedReviewOutcome` error | Verify Reviewer Lambda schema validation |
| Lambda timeout | Check Bedrock model response times; increase timeout if needed |
| API Gateway 5xx | Check Lambda logs in CloudWatch |

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Make changes and add tests
4. Run tests (`npm test`)
5. Submit a pull request

---

## License

MIT
