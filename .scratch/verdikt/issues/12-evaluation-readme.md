# 12: 30-run evaluation + README

**What to build:** Run 30 synthetic claims end-to-end, capture traces, verify all ship gates, write README with architecture diagram, setup instructions, tradeoff section, and cost-per-claim numbers.

**Blocked by:** F1–F11 (all features complete).

**Status:** blocked

## Scope & Boundary

- **Owns:** Test execution, result capture, documentation, architecture diagram, README.
- **Delegates:** Nothing — final verification pass.
- **Does NOT:** Modify agent logic or infrastructure. Add new features.

## Core Entities / Data Models

- 30 TriageRun records with full traces
- 1 ReplayRecord (at least one run replayed from snapshot)
- 1+ ReworkRequest paths (reviewer sends work back at least once)
- Cost-per-claim data (30 UsageRecord sets)
- README, architecture diagram, TRADEOFFS.md

## Technical Dependencies & Pre-requisites

- F1–F11 all complete
- All synthetic claims seeded and validated
- CDK stack deployed with all resources

## Acceptance Criteria

- [ ] 30 runs recorded, each with full X-Ray trace showing exact node path
- [ ] ≥1 run replayed from DynamoDB snapshot, reaches same terminal state as original
- [ ] ≥1 Reviewer rework path exercised, graph terminates correctly
- [ ] Cost per claim charted with ceiling enforced by code (Lambda-level check)
- [ ] Every payout recommendation blocked until human approval recorded
- [ ] README includes: architecture diagram (Step Functions → SQS → Lambda → Bedrock → DynamoDB)
- [ ] README includes: CDK setup instructions (clone, install, deploy, run)
- [ ] README includes: synthetic data description and how to add claims
- [ ] TRADEOFFS.md: Step Functions vs LangGraph, DynamoDB vs Postgres, cost-per-claim numbers
- [ ] MIT license file present
- [ ] All 30 run results captured and summarized in README
