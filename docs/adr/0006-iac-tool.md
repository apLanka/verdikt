# Decision: IaC tool

**Status:** Proposed — awaiting user approval
**Type:** Architecture decision
**Scope:** Infrastructure-as-code tooling for all AWS resources.

## Question

Which IaC tool provisions and manages the Verdikt AWS infrastructure?

## Requirements

PRD §10 requires setup instructions using an IaC tool. The tool must support Step Functions state machines, DynamoDB tables, SQS queues, Lambda functions, API Gateway, IAM roles, and CloudWatch alarms.

## Recommendation

**AWS CDK (TypeScript).** The entire agent graph, contracts, and state machine definitions live in one language. CDK generates CloudFormation under the hood, so the deployment artifact is a standard CloudFormation stack. Step Functions state machines are defined as code (not JSON blobs), which means Choice states, variable references, and error handling are type-checked at synth time.

## Ownership

- CDK project: single source of truth for all infrastructure.
- Contracts package: shared types consumed by both CDK (state machine definitions) and Lambda handlers (runtime validation).
- No manual console changes; everything is in the stack.

## Alternatives

- Terraform is excellent but adds a second language (HCL) alongside the TypeScript agents and contracts. For a reference architecture meant to teach, one language is clearer.
- SAM is simpler but lacks first-class Step Functions support; state machines would still need raw CloudFormation.
- Pulumi supports TypeScript but adds a non-AWS dependency; CDK is native.

## Acceptance criteria for implementation

- `cdk deploy` produces all infrastructure from a single command.
- State machine definition is in TypeScript, not JSON.
- All resources (DynamoDB, SQS, Lambda, API Gateway, IAM, CloudWatch) are in the CDK stack.
- `cdk diff` shows exactly what changes between deployments.
- README includes setup instructions: clone, install, `cdk deploy`, done.

## Impact

Blocks all infrastructure work (F1). Does not block domain modeling or contracts.
