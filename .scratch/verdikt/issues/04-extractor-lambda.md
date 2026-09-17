# 04: Extractor Lambda

**What to build:** Lambda that consumes an AgentEnvelope from SQS, calls Bedrock to extract structured facts from claim documents, validates output against ExtractionResult schema, persists result to DynamoDB, and reports completion via SendTaskSuccess.

**Blocked by:** D1 (handoff mechanism), F1 (infrastructure), F2 (contracts).

**Status:** blocked

## Scope & Boundary

- **Owns:** Document parsing, structured extraction, provenance tracking (EvidenceReference), budget reservation before inference, usage recording after.
- **Delegates:** Policy checks to Investigator. Cost judgment to Reviewer.
- **Does NOT:** Route to next agent (Supervisor does). Call approval APIs.

## Core Entities / Data Models

- Consumes: `AgentEnvelope` (from SQS)
- Produces: `ExtractionResult` (facts + EvidenceReference list)
- Writes: `AgentAttempt` record in DynamoDB
- Reads: `ClaimDocument` data from envelope

## Technical Dependencies & Pre-requisites

- D1 approved (SQS callback pattern)
- F1 deployed (DynamoDB tables, SQS queues, Step Functions)
- F2 contracts available (ExtractionResult schema, AgentEnvelope schema)
- Bedrock model access configured

## Acceptance Criteria

- [ ] Consumes typed AgentEnvelope from SQS
- [ ] Calls Bedrock with extraction prompt + claim documents
- [ ] Output validates against ExtractionResult schema (Zod at runtime)
- [ ] Persists AgentAttempt record with attempt ID, status, result reference
- [ ] Reports completion to Step Functions via SendTaskSuccess with task token
- [ ] Invalid Bedrock output → SendTaskFailure (not silent failure)
- [ ] Idempotent: same attempt ID → same result, no duplicate DB writes
- [ ] Budget reservation made before Bedrock call; usage recorded after
- [ ] X-Ray subsegment covers the full handler execution
- [ ] Structured JSON logs with claimId, runId, attemptId
