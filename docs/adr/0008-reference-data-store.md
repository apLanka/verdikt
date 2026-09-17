# Decision: Reference data store

**Status:** Proposed — awaiting user approval
**Type:** Architecture decision
**Scope:** Storage for synthetic policy, prior-claim, and repair-cost records.

## Question

Where are synthetic reference data records stored, and how does the Investigator access them?

## Requirements

PRD §§6, 10 require synthetic policy limits, prior claims, and repair cost data. The data must be included in the repo so anyone can run the system end-to-end. Reference data is read-only at runtime.

## Recommendation

**DynamoDB.** Seed synthetic records into DynamoDB tables at deploy time (CDK custom resource or seed script). The Investigator queries by exact key (policy ID, prior-claim ID, vehicle type) — no prefix scans, no complex queries. DynamoDB is already in the architecture for state storage; adding a second access pattern to the same service is simpler than adding S3.

Three tables: `SyntheticPolicies`, `SyntheticPriorClaims`, `SyntheticRepairCosts`. All seeded from JSON fixtures in the repo.

## Ownership

- Seed script: reads JSON fixtures, writes to DynamoDB at deploy time.
- Investigator: queries tables by exact key.
- Fixtures: source of truth in the repo; DynamoDB is a runtime projection.
- No agent or supervisor writes to reference tables.

## Alternatives

- S3 + SelectObjectContent adds a second API and requires parsing; overkill for exact-key lookups.
- In-memory fixtures in the Lambda bundle work for small datasets but violate the "shared state" architecture and make seed data invisible to CDK.
- A shared RDS instance adds cost and a connection pool; DynamoDB is serverless and already present.

## Acceptance criteria for implementation

- Three DynamoDB tables seeded from JSON fixtures at deploy time.
- Investigator queries by exact key; no scans.
- Reference data is read-only at runtime (IAM denies writes from agent Lambdas).
- Fixtures included in repo; README explains how to add or modify synthetic data.
- Seed is idempotent: re-running does not duplicate or corrupt records.

## Impact

Blocks F5 (investigator) and F3 (synthetic data design). Does not block infrastructure skeleton (F1).
