# Decision: Runtime and language

**Status:** Proposed — awaiting user approval
**Type:** Architecture decision
**Scope:** Agent Lambda runtime and shared contracts.

## Question

Which language and runtime do the specialist agents use, and how are typed contracts shared?

## Requirements

PRD §6 requires typed contracts between agents defined via JSON Schema, validated at each SQS handoff. PRD §7 requires isolated agent compute (Lambda or Fargate).

## Recommendation

**TypeScript on Node.js 20** for all Lambda handlers. A shared `contracts` npm package contains Zod schemas for every agent envelope, result, and state snapshot. JSON Schemas are generated from Zod at build time for Step Functions choice-state matching and SQS envelope validation.

Zod is chosen over raw JSON Schema because:
- Co-located type inference and runtime validation in one declaration.
- Step Functions choice states use generated JSON Schema; Lambda handlers use Zod directly.
- One source of truth: change a field in Zod, both types and validation update.

## Ownership

- Contracts package: schema definitions, validation functions, JSON Schema generation.
- Agent Lambdas: import contracts, validate input/output, call Bedrock.
- CDK: imports generated JSON Schema for state machine choice states.

## Alternatives

- Python agents would work but split the language surface; the PRD does not mandate a language, and one language is simpler for a reference architecture.
- Raw JSON Schema without Zod means duplicating validation logic and types.
- TypeScript interfaces without runtime validation violates the "typed contracts validated at each handoff" requirement.

## Acceptance criteria for implementation

- All agent Lambdas run on Node.js 20.
- Contracts package exports Zod schemas for all entity types.
- JSON Schema generated from Zod for Step Functions integration.
- `npm run validate` in contracts package tests all schemas with valid and invalid fixtures.
- Agent Lambdas reject invalid envelopes at the top of their handler (before any Bedrock call).

## Impact

Blocks F2 (contracts) and all agent implementations (F4-F6). Does not block infrastructure (F1) or synthetic data (F3).
