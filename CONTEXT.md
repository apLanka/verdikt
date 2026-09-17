# Verdikt — Claims Triage Domain Glossary

An open-source, multi-agent claims triage reference architecture on AWS. Decomposes insurance-claim processing into bounded, observable, replayable agents with hard cost ceilings and human approval gates.

## Core Entities

**Claim**:
A synthetic insurance claim submitted for triage. Identified by a claim ID. One claim may have many TriageRuns.
_Avoid_: case, file, ticket

**ClaimDocument**:
An immutable input document attached to a Claim: accident report, repair estimate, or photo description. Never modified by agents.
_Avoid_: attachment, artifact

**TriageRun**:
One execution of the supervisor graph for a Claim. Has its own execution status (pending, running, completed, rejected, budget_exceeded, error) that is distinct from the Claim's disposition.
_Avoid_: execution, workflow, run instance

**AgentAttempt**:
One invocation of one specialist agent (extractor, investigator, or reviewer) within a TriageRun. Retries and rework create additional attempts. The step ceiling counts attempts, not logical steps.
_Avoid_: call, invocation, task

**ReworkRequest**:
A typed request from the Reviewer to re-run either the Extractor or the Investigator. The Supervisor routes it; the specialist does not choose.
_Avoid_: retry, reprocess, loop-back

## Specialist Results

**ExtractionResult**:
Schema-validated structured output from the Extractor: facts extracted from claim documents with provenance (EvidenceReference). The only thing downstream agents consume.
_Avoid_: extraction output, parsed data

**EvidenceReference**:
A provenance link within an ExtractionResult citing which document and section a fact came from.
_Avoid_: source, citation, reference

**InvestigationResult**:
Cross-check of an ExtractionResult against synthetic policy limits and prior claims. Contains a verdict (proceed, reject, flag_for_review) and supporting evidence.
_Avoid_: investigation output, check result

**PolicyReference**:
A reference to a synthetic policy record used in an InvestigationResult.
_Avoid_: policy, coverage

**PriorClaimReference**:
A reference to a synthetic prior-claim record used in an InvestigationResult.
_Avoid_: history, previous claim

**ReviewResult**:
The Reviewer's sanity-check output. Either a ReworkRequest (routing back to Extractor or Investigator) or a Recommendation.
_Avoid_: review output, assessment

**Recommendation**:
A versioned written recommendation produced by the Reviewer. Approval binds to one specific version. Agents recommend; humans authorize.
_Avoid_: decision, verdict, payout

## Human Authorization

**ApprovalRequest**:
A record that a Recommendation is pending human decision. Pauses the Step Functions workflow on a callback task.
_Avoid_: gate, pause

**ApprovalDecision**:
A human decision (approve or reject) on a specific Recommendation version. Includes actor, timestamp, and the recommendation version it binds to.
_Aavoid_: authorization, approval

**SimulatedAction**:
A no-op write-back executed only after human approval. Simulates what a real claims-system integration would do.
_Avoid_: payout, write-back, side-effect

## Budget and Observability

**BudgetAccount**:
Per-TriageRun spending envelope. Enforces token and dollar ceilings in code (Lambda guards + Step Functions Choice states), not by prompt instruction.
_Aavoid_: budget, allowance, quota

**UsageRecord**:
One agent attempt's actual token and dollar cost, recorded after Bedrock inference. Aggregated by CloudWatch for cost-per-claim dashboards.
_Avoid_: cost record, usage entry

**RunSnapshot**:
A durable checkpoint of a TriageRun's full state after each successful attempt. Enables resume-after-failure and replay-from-snapshot.
_Aavoid_: checkpoint, save state

**RunEvent**:
An immutable audit record of one state transition within a TriageRun. X-Ray traces reference these.
_Aavoid_: log entry, trace event

**ReplayRecord**:
Links a replay TriageRun to its source snapshot and original run. Used to verify that replay reaches the same terminal state.
_Aavoid_: re-execution record

## Reference Data (read-only)

**SyntheticPolicyRecord**:
A in-repo JSON fixture representing a policy with limits, coverage type, and status. Read by the Investigator; never written at runtime.
_Aavoid_: policy data

**SyntheticPriorClaimRecord**:
A in-repo JSON fixture representing a historical claim. Read by the Investigator.
_Aavoid_: claim history

**RepairCostRecord**:
A in-repo JSON fixture representing estimated repair costs for sanity-checking the Reviewer's damage assessment.
_Aavoid_: cost estimate, repair data

## Key Distinctions

- **Claim ≠ TriageRun**: A claim can have many runs. A failed run does not mean a denied claim.
- **Recommendation ≠ ApprovalDecision**: Agents recommend. Humans authorize. Approval binds to one recommendation version.
- **Snapshot ≠ Trace**: A snapshot resumes work. A trace explains what happened.
- **AgentAttempt ≠ logical step**: Retries and rework create additional attempts. The step ceiling counts attempts.
- **Reference data is read-only**: Synthetic policy, history, and repair-cost records are consumed but never modified at runtime.
