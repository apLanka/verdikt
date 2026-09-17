# Verdikt — Product Requirements Document

**Multi-agent claims triage system, built AWS-native, open sourced for the AWS Builder Program.**

---

## 1. Summary

Verdikt is an open-source, multi-agent orchestration system that triages insurance claims end-to-end: document extraction, prior-claim/policy verification, damage-estimate sanity checks, and a written recommendation — with a hard human approval gate before any payout or system write-back.

It exists to prove one thing: a task too complex for a single prompt can be decomposed into bounded, observable, replayable agents — using AWS-native primitives instead of a hand-rolled state machine.

---

## 2. Problem Statement

A regional insurer processes ~900 claims/day. Each claim needs:
- Documents extracted (accident reports, repair estimates, photos)
- Prior claims and policy limits checked
- Damage estimates sanity-checked against repair costs
- A written recommendation

A single LLM prompt can't hold all of this reliably — and even if it could, there's no way to audit *why* it reached a conclusion, resume a failed run, or stop it from taking an irreversible action on its own.

---

## 3. Goals

- Decompose claims triage into a supervisor + specialist agent graph (extractor, investigator, reviewer)
- Make every run **observable** (full trace, node-by-node) and **replayable** (resumable from a stored snapshot)
- Enforce hard **cost and step ceilings** in code, not in prompt instructions
- Require **human approval** before any payout recommendation or claims-system write-back
- Ship as a clean, documented open-source reference architecture on AWS

## 4. Non-Goals

- Not a production insurance product — no real claims data, no real payouts
- Not a general-purpose agent framework (that's a separate, existing project of mine)
- Not optimizing for lowest possible latency — optimizing for correctness, auditability, and cost control

---

## 5. Users

| User | Need |
|---|---|
| AWS Builder Program reviewers | A legible, well-architected open-source project demonstrating real AWS service usage beyond a toy demo |
| Engineers evaluating agent orchestration patterns | A reference implementation of bounded multi-agent systems with guardrails |
| Me | A portfolio project that proves multi-agent orchestration + AWS architecture skill for AI engineering roles |

---

## 6. Architecture (AWS-native)

| Layer | Service | Role |
|---|---|---|
| Orchestration | **AWS Step Functions** | Supervisor graph — routes claim through extractor → investigator → reviewer, enforces max step count |
| Agent compute | **AWS Lambda** (or Fargate for longer-running steps) | Each specialist agent runs as an isolated function/task |
| Async handoff | **Amazon SQS** | Typed message handoffs between agents — no free-text passing |
| Shared state | **Amazon DynamoDB** | Claim state store; any run resumable from a snapshot |
| Model inference | **Amazon Bedrock** | LLM calls for extraction, investigation, and recommendation generation |
| Human approval | **API Gateway + Lambda** (simple approval UI or Slack/webhook integration) | Gate in front of any payout recommendation or write-back |
| Observability | **AWS X-Ray + CloudWatch** | Full trace per claim run, cost-per-claim dashboard |
| Cost/budget enforcement | **Lambda-level guards + CloudWatch alarms** | Token/dollar ceiling per claim enforced in code, not prompt instruction |

Typed contracts between agents defined via JSON Schema, validated at each SQS handoff.

---

## 7. Agents

1. **Extractor** — pulls structured data from claim documents (accident report, repair estimate, photos) into a validated schema
2. **Investigator** — cross-checks extracted data against prior claims and policy limits
3. **Reviewer** — sanity-checks damage estimate against repair costs, can send work back to Extractor/Investigator at least once, then writes the final recommendation
4. **Supervisor** (Step Functions state machine, not an LLM) — routes between the three, enforces step count and budget ceiling, halts at the human approval gate

---

## 8. Ship Gate / Success Metrics

Carried over from the original spec, unchanged because they're the right bar:

- 30 recorded claim runs, each with a full trace showing the exact node path taken
- At least one run replayed from a stored DynamoDB snapshot, reaching the same terminal state
- The Reviewer sends work back at least once, and the graph still terminates correctly
- Cost per claim charted, with the ceiling enforced by code (Lambda-level check), not by prompt instruction alone
- Every payout recommendation blocked from execution until human approval is recorded

---

## 9. Milestones

| Phase | Deliverable |
|---|---|
| Weekend 1 | Step Functions state machine + DynamoDB state store + typed SQS handoffs between three agent Lambdas, running end-to-end on synthetic claims |
| Weekend 1 (stretch) | Human approval gate wired via API Gateway |
| Weekend 2 | X-Ray tracing, cost-ceiling enforcement, snapshot/replay working, 30 recorded runs, README + architecture diagram |
| Post-build | Open-source repo published, submitted to AWS Builder Program |

---

## 10. Open Source Plan

- MIT license
- README with architecture diagram, setup instructions (Terraform or AWS CDK for infra-as-code), and the 30-run trace results
- Synthetic claim dataset included (no real insurer data) so anyone can run it end-to-end
- Written tradeoff section: why Step Functions over LangGraph, why DynamoDB over Postgres, cost-per-claim numbers

---

## 11. Risks

| Risk | Mitigation |
|---|---|
| Step Functions adds latency vs. a lighter framework | Acceptable tradeoff — auditability and AWS-native fit matter more than raw speed here |
| Bedrock model costs during development | Use smaller Bedrock models for iteration, only run full eval set on final config |
| Scope creep into a general agent framework | Keep non-goals explicit; this is a reference architecture, not a product |

---

## 12. What It Signals

Termination conditions, loop guards, and cost ceilings enforced in code — discussed and demonstrated before agent "personas." That's the gap between an engineer and a prompt hobbyist, and it's the whole point of the project.