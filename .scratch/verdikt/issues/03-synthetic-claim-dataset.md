# 03: Synthetic claim dataset

**What to build:** 30+ synthetic claims with varied scenarios, each with 2-3 documents (accident reports, repair estimates, photo descriptions) as JSON fixtures. Designed to exercise every terminal state and the rework path.

**Blocked by:** F2 (schemas define the shapes fixtures must match).

**Status:** blocked

## Scope & Boundary

- **Owns:** Test data design, fixture generation, scenario coverage.
- **Delegates:** Nothing — pure data.
- **Does NOT:** Contain agent logic or AWS calls.

## Core Entities / Data Models

- Synthetic claim fixtures matching `ClaimInput` schema
- Document fixtures matching document shapes in `ExtractionResult`
- Policy/prior-claim/repair-cost fixtures matching reference data tables

## Technical Dependencies & Pre-requisites

- F2 (contracts) — fixtures must validate against schemas
- Reference data tables defined in F1 (for seeding)

## Acceptance Criteria

- [ ] At least 30 synthetic claims, each with 2-3 documents
- [ ] All fixtures validate against F2 schemas
- [ ] Scenario coverage:
  - ≥5 straightforward approval (extract → investigate → review → approve)
  - ≥5 rework-then-approve (reviewer sends back, agent corrects, approve)
  - ≥5 rework-then-reject (reviewer sends back, issues persist, reject)
  - ≥3 budget-exceeded (high-complexity claims that exhaust the ceiling)
  - ≥3 policy-violation (extracted facts conflict with policy limits)
  - ≥4 edge cases (incomplete documents, conflicting repair estimates, missing photos)
- [ ] Each claim fixture includes: claim ID, document list, expected path (for automated verification)
- [ ] Fixtures are plain JSON, human-readable, in a `fixtures/` directory
