# 05: Investigator Lambda

**What to build:** Lambda that consumes ExtractionResult, cross-checks against synthetic policy limits and prior claims in DynamoDB, produces InvestigationResult with a verdict (proceed/reject/flag_for_review) and supporting evidence references.

**Blocked by:** D1 (handoff mechanism), F1 (infrastructure), F2 (contracts), F4 (extractor produces ExtractionResult).

**Status:** blocked

## Scope & Boundary

- **Owns:** Policy verification, prior-claim lookup, verdict determination, evidence citation.
- **Delegates:** Document extraction to Extractor (F4). Final recommendation to Reviewer (F6).
- **Does NOT:** Modify reference data. Route to next agent.

## Core Entities / Data Models

- Consumes: `AgentEnvelope` containing `ExtractionResult`
- Produces: `InvestigationResult` (verdict + PolicyReference list + PriorClaimReference list)
- Reads: `SyntheticPolicies`, `SyntheticPriorClaims` tables
- Writes: `AgentAttempt` record in DynamoDB

## Technical Dependencies & Pre-requisites

- D1 approved
- F1 deployed (DynamoDB tables including reference data tables)
- F2 contracts available
- F4 implemented (Extractor produces ExtractionResult)
- Reference data seeded into DynamoDB

## Acceptance Criteria

- [ ] Reads ExtractionResult from envelope
- [ ] Queries policy limits by policy ID (exact key, no scans)
- [ ] Queries prior claims by policy reference (exact key, no scans)
- [ ] Output validates against InvestigationResult schema
- [ ] Verdict is one of: `proceed`, `reject`, `flag_for_review`
- [ ] Evidence references cite specific policy and prior-claim records
- [ ] Same idempotency pattern as Extractor (attempt ID guard)
- [ ] Budget reservation and usage recording integrated
- [ ] X-Ray subsegment covers full handler
- [ ] Structured JSON logs with claimId, runId, attemptId
