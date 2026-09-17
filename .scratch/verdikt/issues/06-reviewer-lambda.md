# 06: Reviewer Lambda

**What to build:** Lambda that consumes both ExtractionResult and InvestigationResult, sanity-checks damage estimate against repair costs, and produces either a ReworkRequest (back to Extractor or Investigator) or a Recommendation.

**Blocked by:** D1 (handoff mechanism), F1 (infrastructure), F2 (contracts), F4 (extractor), F5 (investigator).

**Status:** blocked

## Scope & Boundary

- **Owns:** Estimate validation, repair-cost sanity check, rework routing, recommendation generation.
- **Delegates:** Extraction to F4. Investigation to F5. Authorization to Approval gate (F8).
- **Does NOT:** Execute rework itself. Authorize payout. Modify reference data.

## Core Entities / Data Models

- Consumes: `AgentEnvelope` containing both `ExtractionResult` and `InvestigationResult`
- Produces: Either `ReworkRequest` (target agent + reason + stale input version) or `Recommendation` (rationale + confidence + version)
- Reads: `SyntheticRepairCosts` table for estimate sanity-check
- Writes: `AgentAttempt` record in DynamoDB

## Technical Dependencies & Pre-requisites

- D1 approved
- F1 deployed
- F2 contracts available
- F4 implemented (ExtractionResult available)
- F5 implemented (InvestigationResult available)
- Repair cost reference data seeded

## Acceptance Criteria

- [ ] Reads both ExtractionResult and InvestigationResult from envelope
- [ ] Outputs ReworkRequest when estimate is unreasonable (cites repair-cost evidence)
- [ ] ReworkRequest names a valid target (extractor or investigator) and cites stale input version
- [ ] Outputs Recommendation when estimate is reasonable (cites supporting evidence)
- [ ] Recommendation validates against Recommendation schema
- [ ] Handles both rework and terminal paths without silent failures
- [ ] Budget reservation and usage recording integrated
- [ ] X-Ray subsegment covers full handler
- [ ] Structured JSON logs with claimId, runId, attemptId
