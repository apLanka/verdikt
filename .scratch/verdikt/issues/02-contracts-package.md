# 02: Contracts package + JSON Schemas

**What to build:** A shared `contracts` npm package with Zod schemas for all agent envelopes, results, and state snapshots. JSON Schema generation from Zod for Step Functions integration. Validation functions used by every agent at handoff.

**Blocked by:** None (can run in parallel with F1).

**Status:** ready-for-agent

## Scope & Boundary

- **Owns:** Schema definitions, validation logic, JSON Schema generation, type exports.
- **Delegates:** Nothing — pure library code consumed by others.
- **Does NOT:** Contain agent logic, AWS calls, or infrastructure definitions.

## Core Entities / Data Models

- `ClaimInput` — envelope for claim submission
- `AgentEnvelope` — SQS message envelope (schema version, claim ID, run ID, attempt ID, input version, callback token)
- `ExtractionResult` — structured facts with EvidenceReference list
- `InvestigationResult` — verdict (proceed/reject/flag_for_review) with PolicyReference and PriorClaimReference lists
- `ReviewResult` — either ReworkRequest (target agent + reason + stale input version) or Recommendation (rationale + confidence)
- `Recommendation` — versioned written recommendation
- `ApprovalDecision` — human decision (approve/reject, actor, timestamp, recommendation version)
- `RunSnapshot` — full run state checkpoint
- `RunEvent` — state transition audit record

## Technical Dependencies & Pre-requisites

- Node.js 20 + TypeScript
- No other features required

## Acceptance Criteria

- [ ] All schemas above defined in Zod with full type inference
- [ ] `npm run generate:schemas` produces JSON Schema files from Zod definitions
- [ ] `npm run validate` runs validation tests against valid and invalid fixtures
- [ ] Invalid payloads rejected with clear error messages (field name + reason)
- [ ] JSON Schema output compatible with Step Functions choice-state `$` path comparisons
- [ ] Package importable by Lambda handlers via npm workspace or local path
- [ ] All schemas versioned (schemaVersion field in envelopes)
