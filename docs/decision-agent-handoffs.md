# Decision: Agent handoff mechanism

**Status:** Proposed — awaiting user approval
**Type:** Architecture decision
**Scope:** Communication between the Supervisor and specialist agents only.

## Question

How should Step Functions dispatch specialist work through SQS and receive completion without creating a second workflow controller?

## Requirements

PRD sections 6–7 require Step Functions to own routing, isolated specialist compute, and JSON Schema validation at SQS handoffs.

## Recommendation

Use Step Functions Standard workflows with SQS callback tasks (`sqs:sendMessage.waitForTaskToken`). A specialist Lambda consumes the message, validates its envelope, executes the assigned work, persists its result, and reports completion using `SendTaskSuccess` or `SendTaskFailure`.

The Supervisor owns routing. Specialists return typed results; they do not choose and dispatch the next agent.

## Ownership and contracts

- Supervisor: dispatch, next-node selection, task deadlines, and bounded retry policy.
- Specialist: validate the assigned input version and produce its own versioned result.
- State boundary: conditional attempt ownership and durable completion records.
- Envelope: schema version, claim ID, run ID, logical work ID, attempt ID, input version/reference, and callback token.
- Callback tokens are sensitive orchestration credentials: do not expose them in logs or public responses.

## Alternatives

- Direct synchronous Lambda invocation is simpler but removes required SQS handoffs from the critical path.
- Worker-to-worker SQS chaining makes routing ownership ambiguous and duplicates Supervisor responsibilities.

## Acceptance criteria for the eventual implementation

- A synthetic work item travels from Supervisor through SQS to its specialist and resumes the workflow with a validated result.
- Invalid envelopes cannot invoke model inference or advance the workflow as successful work.
- Duplicate delivery of the same attempt cannot concurrently claim execution or apply a second result.
- A persisted result can be used to retry completion reporting without repeating specialist work.
- Expired callbacks and stale results cannot advance a newer attempt.
- Missing completion reaches a configured timeout and bounded failure path rather than waiting indefinitely.
- Ambiguous failures around external model calls are handled explicitly; this design does not promise exactly-once inference.
- A run interrupted mid-attempt resumes from the last successful snapshot, not from scratch. If no successful snapshot exists (first attempt failed), the run terminates with error.

## Unresolved follow-up decisions

Exact timeout values, retry/step accounting, cost reservation rules, and recovery of abandoned attempt ownership require separate decisions. This ticket does not settle them.

## Impact

Blocks implementation of the first end-to-end synthetic triage workflow. Does not block domain glossary or synthetic fixture design.

## Evidence

AWS documents the SQS callback integration and worker completion APIs:
https://docs.aws.amazon.com/step-functions/latest/dg/connect-sqs.html
https://docs.aws.amazon.com/step-functions/latest/dg/connect-to-resource.html

## Approval

Awaiting confirmation: adopt the proposed SQS callback pattern, or revise this decision. No implementation is authorized by this ticket.
