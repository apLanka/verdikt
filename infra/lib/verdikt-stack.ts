import * as cdk from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as sfn from "aws-cdk-lib/aws-stepfunctions";
import * as tasks from "aws-cdk-lib/aws-stepfunctions-tasks";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigw from "aws-cdk-lib/aws-apigateway";
import * as iam from "aws-cdk-lib/aws-iam";
import * as logs from "aws-cdk-lib/aws-logs";
import * as path from "node:path";
import { Construct } from "constructs";

const MAX_ATTEMPTS = 6;
const BUDGET_CEILING_USD = 2.0;

export class VerdiktStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ── DynamoDB Tables ──────────────────────────────────────────────

    const claimsTable = new dynamodb.Table(this, "ClaimsTable", {
      partitionKey: { name: "claimId", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const triageRunsTable = new dynamodb.Table(this, "TriageRunsTable", {
      partitionKey: { name: "runId", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    triageRunsTable.addGlobalSecondaryIndex({
      indexName: "ByClaim",
      partitionKey: { name: "claimId", type: dynamodb.AttributeType.STRING },
    });

    const agentAttemptsTable = new dynamodb.Table(this, "AgentAttemptsTable", {
      partitionKey: { name: "attemptId", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    agentAttemptsTable.addGlobalSecondaryIndex({
      indexName: "ByRun",
      partitionKey: { name: "runId", type: dynamodb.AttributeType.STRING },
    });

    const recommendationsTable = new dynamodb.Table(
      this,
      "RecommendationsTable",
      {
        partitionKey: {
          name: "recommendationId",
          type: dynamodb.AttributeType.STRING,
        },
        billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
        pointInTimeRecovery: true,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }
    );
    recommendationsTable.addGlobalSecondaryIndex({
      indexName: "ByRun",
      partitionKey: { name: "runId", type: dynamodb.AttributeType.STRING },
    });

    const approvalsTable = new dynamodb.Table(this, "ApprovalsTable", {
      partitionKey: { name: "approvalId", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    approvalsTable.addGlobalSecondaryIndex({
      indexName: "ByRecommendation",
      partitionKey: {
        name: "recommendationId",
        type: dynamodb.AttributeType.STRING,
      },
    });

    const snapshotsTable = new dynamodb.Table(this, "SnapshotsTable", {
      partitionKey: { name: "snapshotId", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    snapshotsTable.addGlobalSecondaryIndex({
      indexName: "ByRun",
      partitionKey: { name: "runId", type: dynamodb.AttributeType.STRING },
    });

    const eventsTable = new dynamodb.Table(this, "EventsTable", {
      partitionKey: { name: "eventId", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    eventsTable.addGlobalSecondaryIndex({
      indexName: "ByRun",
      partitionKey: { name: "runId", type: dynamodb.AttributeType.STRING },
    });

    const budgetsTable = new dynamodb.Table(this, "BudgetsTable", {
      partitionKey: { name: "budgetId", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    budgetsTable.addGlobalSecondaryIndex({
      indexName: "ByRun",
      partitionKey: { name: "runId", type: dynamodb.AttributeType.STRING },
    });

    // ── Synthetic Reference Data Tables (read-only) ──────────────────

    const syntheticPoliciesTable = new dynamodb.Table(
      this,
      "SyntheticPoliciesTable",
      {
        partitionKey: { name: "policyId", type: dynamodb.AttributeType.STRING },
        billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }
    );

    const syntheticPriorClaimsTable = new dynamodb.Table(
      this,
      "SyntheticPriorClaimsTable",
      {
        partitionKey: {
          name: "priorClaimId",
          type: dynamodb.AttributeType.STRING,
        },
        billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }
    );
    syntheticPriorClaimsTable.addGlobalSecondaryIndex({
      indexName: "ByPolicy",
      partitionKey: { name: "policyId", type: dynamodb.AttributeType.STRING },
    });

    const syntheticRepairCostsTable = new dynamodb.Table(
      this,
      "SyntheticRepairCostsTable",
      {
        partitionKey: {
          name: "vehicleType",
          type: dynamodb.AttributeType.STRING,
        },
        sortKey: {
          name: "repairCategory",
          type: dynamodb.AttributeType.STRING,
        },
        billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }
    );

    // ── SQS Queues ──────────────────────────────────────────────────

    const agentDeadLetterQueue = new sqs.Queue(this, "AgentDLQ", {
      retentionPeriod: cdk.Duration.days(14),
    });

    const agentHandoffQueue = new sqs.Queue(this, "AgentHandoffQueue", {
      visibilityTimeout: cdk.Duration.seconds(300),
      deadLetterQueue: {
        queue: agentDeadLetterQueue,
        maxReceiveCount: 3,
      },
    });

    const approvalDeadLetterQueue = new sqs.Queue(this, "ApprovalDLQ", {
      retentionPeriod: cdk.Duration.days(14),
    });

    const approvalCallbackQueue = new sqs.Queue(this, "ApprovalCallbackQueue", {
      visibilityTimeout: cdk.Duration.seconds(60),
      deadLetterQueue: {
        queue: approvalDeadLetterQueue,
        maxReceiveCount: 3,
      },
    });

    // ── Agent Lambdas ────────────────────────────────────────────────

    const agentEnv = {
      CLAIMS_TABLE: claimsTable.tableName,
      TRIAGE_RUNS_TABLE: triageRunsTable.tableName,
      ATTEMPTS_TABLE: agentAttemptsTable.tableName,
      RECOMMENDATIONS_TABLE: recommendationsTable.tableName,
      APPROVALS_TABLE: approvalsTable.tableName,
      SNAPSHOTS_TABLE: snapshotsTable.tableName,
      EVENTS_TABLE: eventsTable.tableName,
      BUDGETS_TABLE: budgetsTable.tableName,
      POLICIES_TABLE: syntheticPoliciesTable.tableName,
      PRIOR_CLAIMS_TABLE: syntheticPriorClaimsTable.tableName,
      REPAIR_COSTS_TABLE: syntheticRepairCostsTable.tableName,
      AGENT_QUEUE_URL: agentHandoffQueue.queueUrl,
    };

    const extractorFn = new lambda.Function(this, "ExtractorFn", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "index.handler",
      code: lambda.Code.fromAsset(
        path.join(__dirname, "../../packages/extractor/dist")
      ),
      timeout: cdk.Duration.seconds(120),
      memorySize: 512,
      tracing: lambda.Tracing.ACTIVE,
      environment: agentEnv,
    });

    const investigatorFn = new lambda.Function(this, "InvestigatorFn", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "index.handler",
      code: lambda.Code.fromAsset(
        path.join(__dirname, "../../packages/investigator/dist")
      ),
      timeout: cdk.Duration.seconds(120),
      memorySize: 512,
      tracing: lambda.Tracing.ACTIVE,
      environment: agentEnv,
    });

    const reviewerFn = new lambda.Function(this, "ReviewerFn", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "index.handler",
      code: lambda.Code.fromAsset(
        path.join(__dirname, "../../packages/reviewer/dist")
      ),
      timeout: cdk.Duration.seconds(120),
      memorySize: 512,
      tracing: lambda.Tracing.ACTIVE,
      environment: agentEnv,
    });

    // ── Step Functions: Terminal states ──────────────────────────────

    const budgetExceededFail = new sfn.Fail(this, "BudgetExceededFail", {
      error: "BudgetExceeded",
      cause: "Step ceiling or dollar ceiling exceeded",
    });

    const unexpectedFail = new sfn.Fail(this, "UnexpectedFail", {
      error: "UnexpectedReviewOutcome",
      cause: "Reviewer returned an unexpected outcome",
    });

    const completed = new sfn.Succeed(this, "Completed", {
      comment: "Run completed successfully",
    });

    // ── Initialize run state ─────────────────────────────────────────

    const initializeRun = new sfn.Pass(this, "InitializeRun", {
      comment: "Initialize triage run state",
      parameters: {
        schemaVersion: 1,
        "claimId.$": "$.claimId",
        "runId.$": "$.runId",
        "documents.$": "$.documents",
        attemptCount: 0,
        inputVersion: 0,
        budgetRemaining: BUDGET_CEILING_USD,
        extractionResult: null,
        investigationResult: null,
      },
    });

    // ── Extract phase ────────────────────────────────────────────────

    const extractIncrement = new sfn.Pass(this, "ExtractIncrement", {
      comment: "Increment attempt counter for extract",
      parameters: {
        "attemptCount.$": "States.MathAdd($.attemptCount, 1)",
      },
      resultPath: "$.attemptCount",
    });

    const extractGenId = new sfn.Pass(this, "ExtractGenId", {
      comment: "Generate attempt ID for extract",
      parameters: {
        "nextAttemptId.$":
          "States.Format('att-{}-{}', $.runId, $.attemptCount)",
      },
      resultPath: "$.nextAttemptId",
    });

    const extractCheckStep = new sfn.Choice(this, "ExtractCheckStep", {
      comment: "Check step ceiling before extract",
    })
      .when(
        sfn.Condition.numberGreaterThanEquals(
          "$.attemptCount",
          MAX_ATTEMPTS
        ),
        budgetExceededFail
      )
      .otherwise(extractGenId);

    // ── Investigate phase ────────────────────────────────────────────

    const investigateIncrement = new sfn.Pass(
      this,
      "InvestigateIncrement",
      {
        comment: "Increment attempt counter for investigate",
        parameters: {
          "attemptCount.$": "States.MathAdd($.attemptCount, 1)",
        },
        resultPath: "$.attemptCount",
      }
    );

    const investigateGenId = new sfn.Pass(this, "InvestigateGenId", {
      comment: "Generate attempt ID for investigate",
      parameters: {
        "nextAttemptId.$":
          "States.Format('att-{}-{}', $.runId, $.attemptCount)",
      },
      resultPath: "$.nextAttemptId",
    });

    const investigateCheckStep = new sfn.Choice(
      this,
      "InvestigateCheckStep",
      {
        comment: "Check step ceiling before investigate",
      }
    )
      .when(
        sfn.Condition.numberGreaterThanEquals(
          "$.attemptCount",
          MAX_ATTEMPTS
        ),
        budgetExceededFail
      )
      .otherwise(investigateGenId);

    // ── Review phase ─────────────────────────────────────────────────

    const reviewIncrement = new sfn.Pass(this, "ReviewIncrement", {
      comment: "Increment attempt counter for review",
      parameters: {
        "attemptCount.$": "States.MathAdd($.attemptCount, 1)",
      },
      resultPath: "$.attemptCount",
    });

    const reviewGenId = new sfn.Pass(this, "ReviewGenId", {
      comment: "Generate attempt ID for review",
      parameters: {
        "nextAttemptId.$":
          "States.Format('att-{}-{}', $.runId, $.attemptCount)",
      },
      resultPath: "$.nextAttemptId",
    });

    const reviewCheckStep = new sfn.Choice(this, "ReviewCheckStep", {
      comment: "Check step ceiling before review",
    })
      .when(
        sfn.Condition.numberGreaterThanEquals(
          "$.attemptCount",
          MAX_ATTEMPTS
        ),
        budgetExceededFail
      )
      .otherwise(reviewGenId);

    // ── Review router ────────────────────────────────────────────────

    const reworkToExtractor = new sfn.Pass(this, "ReworkToExtractor", {
      comment: "Rework back to extractor — increment inputVersion",
      parameters: {
        "inputVersion.$": "States.MathAdd($.inputVersion, 1)",
      },
      resultPath: "$.inputVersion",
    });

    const reworkToInvestigator = new sfn.Pass(
      this,
      "ReworkToInvestigator",
      {
        comment: "Rework back to investigator — increment inputVersion",
        parameters: {
          "inputVersion.$": "States.MathAdd($.inputVersion, 1)",
        },
        resultPath: "$.inputVersion",
      }
    );

    const storeRecommendation = new sfn.Pass(
      this,
      "StoreRecommendation",
      {
        comment: "Extract recommendation for approval gate",
        parameters: {
          "recommendation.$": "$.reviewerResult.recommendation",
        },
        resultPath: "$.recommendation",
      }
    );

    const approvalGate = new tasks.LambdaInvoke(this, "ApprovalGate", {
      lambdaFunction: new lambda.Function(this, "ApprovalDispatcherFn", {
        runtime: lambda.Runtime.NODEJS_20_X,
        handler: "index.handler",
        code: lambda.Code.fromInline(
          `exports.handler = async (event) => {
            return { stored: true, recommendationId: event.recommendationId };
          };`
        ),
        tracing: lambda.Tracing.ACTIVE,
        environment: {
          APPROVALS_TABLE: approvalsTable.tableName,
          RECOMMENDATIONS_TABLE: recommendationsTable.tableName,
        },
      }),
      integrationPattern: sfn.IntegrationPattern.WAIT_FOR_TASK_TOKEN,
      payload: sfn.TaskInput.fromObject({
        token: sfn.JsonPath.taskToken,
        "recommendationId.$": "$.recommendation.recommendationId",
        "claimId.$": "$.claimId",
        "runId.$": "$.runId",
      }),
      resultPath: "$.approvalResult",
      timeout: cdk.Duration.hours(24),
    });

    const reviewRouter = new sfn.Choice(this, "ReviewRouter", {
      comment: "Route based on reviewer outcome",
    })
      .when(
        sfn.Condition.and(
          sfn.Condition.stringEquals(
            "$.reviewerResult.outcome",
            "rework"
          ),
          sfn.Condition.stringEquals(
            "$.reviewerResult.rework.targetAgent",
            "extractor"
          )
        ),
        reworkToExtractor
      )
      .when(
        sfn.Condition.and(
          sfn.Condition.stringEquals(
            "$.reviewerResult.outcome",
            "rework"
          ),
          sfn.Condition.stringEquals(
            "$.reviewerResult.rework.targetAgent",
            "investigator"
          )
        ),
        reworkToInvestigator
      )
      .when(
        sfn.Condition.stringEquals(
          "$.reviewerResult.outcome",
          "recommendation"
        ),
        storeRecommendation
      )
      .otherwise(unexpectedFail);

    // ── Dispatch tasks (created after targets are defined) ────────────

    const extractDispatch = new tasks.LambdaInvoke(
      this,
      "ExtractDispatch",
      {
        lambdaFunction: extractorFn,
        integrationPattern: sfn.IntegrationPattern.WAIT_FOR_TASK_TOKEN,
        payload: sfn.TaskInput.fromObject({
          token: sfn.JsonPath.taskToken,
          "claimId.$": "$.claimId",
          "runId.$": "$.runId",
          "attemptId.$": "$.nextAttemptId",
          "inputVersion.$": "$.inputVersion",
          "documents.$": "$.documents",
          extractionResult: null,
          investigationResult: null,
        }),
        resultPath: "$.extractorResult",
        timeout: cdk.Duration.minutes(5),
      }
    );

    const investigateDispatch = new tasks.LambdaInvoke(
      this,
      "InvestigateDispatch",
      {
        lambdaFunction: investigatorFn,
        integrationPattern: sfn.IntegrationPattern.WAIT_FOR_TASK_TOKEN,
        payload: sfn.TaskInput.fromObject({
          token: sfn.JsonPath.taskToken,
          "claimId.$": "$.claimId",
          "runId.$": "$.runId",
          "attemptId.$": "$.nextAttemptId",
          "inputVersion.$": "$.inputVersion",
          "documents.$": "$.documents",
          "extractionResult.$": "$.extractorResult",
          investigationResult: null,
        }),
        resultPath: "$.investigatorResult",
        timeout: cdk.Duration.minutes(5),
      }
    );

    const reviewDispatch = new tasks.LambdaInvoke(
      this,
      "ReviewDispatch",
      {
        lambdaFunction: reviewerFn,
        integrationPattern: sfn.IntegrationPattern.WAIT_FOR_TASK_TOKEN,
        payload: sfn.TaskInput.fromObject({
          token: sfn.JsonPath.taskToken,
          "claimId.$": "$.claimId",
          "runId.$": "$.runId",
          "attemptId.$": "$.nextAttemptId",
          "inputVersion.$": "$.inputVersion",
          "documents.$": "$.documents",
          "extractionResult.$": "$.extractorResult",
          "investigationResult.$": "$.investigatorResult",
        }),
        resultPath: "$.reviewerResult",
        timeout: cdk.Duration.minutes(5),
      }
    );

    // ── Budget checks (reference dispatch tasks above) ───────────────

    const extractCheckBudget = new sfn.Choice(
      this,
      "ExtractCheckBudget",
      { comment: "Check budget before extract" }
    )
      .when(
        sfn.Condition.numberGreaterThan("$.budgetRemaining", 0),
        extractDispatch
      )
      .otherwise(budgetExceededFail);

    const investigateCheckBudget = new sfn.Choice(
      this,
      "InvestigateCheckBudget",
      { comment: "Check budget before investigate" }
    )
      .when(
        sfn.Condition.numberGreaterThan("$.budgetRemaining", 0),
        investigateDispatch
      )
      .otherwise(budgetExceededFail);

    const reviewCheckBudget = new sfn.Choice(
      this,
      "ReviewCheckBudget",
      { comment: "Check budget before review" }
    )
      .when(
        sfn.Condition.numberGreaterThan("$.budgetRemaining", 0),
        reviewDispatch
      )
      .otherwise(budgetExceededFail);

    // ── Wire the full graph ──────────────────────────────────────────

    // Phase chains: increment → checkStep → genId → checkBudget → dispatch
    extractIncrement.next(extractCheckStep);
    extractGenId.next(extractCheckBudget);

    investigateIncrement.next(investigateCheckStep);
    investigateGenId.next(investigateCheckBudget);

    reviewIncrement.next(reviewCheckStep);
    reviewGenId.next(reviewCheckBudget);

    // After each dispatch, proceed to next phase
    extractDispatch.next(investigateIncrement);
    investigateDispatch.next(reviewIncrement);
    reviewDispatch.next(reviewRouter);

    // Rework loops
    reworkToExtractor.next(extractIncrement);
    reworkToInvestigator.next(investigateIncrement);

    // Recommendation flow
    storeRecommendation.next(approvalGate);
    approvalGate.next(completed);

    // Start: Initialize → Extract
    const fullGraph = initializeRun.next(extractIncrement);

    // ── State Machine ────────────────────────────────────────────────

    const stateMachine = new sfn.StateMachine(
      this,
      "VerdiktSupervisor",
      {
        stateMachineName: "verdikt-supervisor",
        definitionBody: sfn.DefinitionBody.fromChainable(fullGraph),
        tracingEnabled: true,
        logs: {
          destination: new logs.LogGroup(this, "SupervisorLogs", {
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            retention: logs.RetentionDays.ONE_WEEK,
          }),
          level: sfn.LogLevel.ALL,
        },
      }
    );

    // ── API Gateway (approval endpoint stub) ─────────────────────────

    const approvalLambda = new lambda.Function(this, "ApprovalHandler", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "index.handler",
      code: lambda.Code.fromInline(
        `exports.handler = async (event) => ({ statusCode: 200, body: JSON.stringify({ message: "stub" }) });`
      ),
      tracing: lambda.Tracing.ACTIVE,
      environment: {
        APPROVALS_TABLE: approvalsTable.tableName,
        RECOMMENDATIONS_TABLE: recommendationsTable.tableName,
        STATE_MACHINE_ARN: stateMachine.stateMachineArn,
        APPROVAL_QUEUE_URL: approvalCallbackQueue.queueUrl,
      },
    });

    const api = new apigw.RestApi(this, "VerdiktApi", {
      restApiName: "Verdikt Approval API",
      deployOptions: { tracingEnabled: true },
    });

    const approvalResource = api.root.addResource("approval");
    approvalResource.addMethod(
      "POST",
      new apigw.LambdaIntegration(approvalLambda)
    );

    // Approval handler needs SendTaskSuccess to resume the workflow
    stateMachine.grantTaskResponse(approvalLambda);

    // ── IAM: Least-privilege for agents ──────────────────────────────

    const agentRole = new iam.Role(this, "AgentRole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
    });

    claimsTable.grantReadWriteData(agentRole);
    triageRunsTable.grantReadWriteData(agentRole);
    agentAttemptsTable.grantReadWriteData(agentRole);
    recommendationsTable.grantReadWriteData(agentRole);
    approvalsTable.grantReadWriteData(agentRole);
    snapshotsTable.grantReadWriteData(agentRole);
    eventsTable.grantReadWriteData(agentRole);
    budgetsTable.grantReadWriteData(agentRole);
    agentHandoffQueue.grantSendMessages(agentRole);
    agentHandoffQueue.grantConsumeMessages(agentRole);
    stateMachine.grantStartExecution(agentRole);
    stateMachine.grantTaskResponse(agentRole);

    syntheticPoliciesTable.grantReadData(agentRole);
    syntheticPriorClaimsTable.grantReadData(agentRole);
    syntheticRepairCostsTable.grantReadData(agentRole);

    agentRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["bedrock:InvokeModel"],
        resources: ["*"],
      })
    );

    // ── Outputs ──────────────────────────────────────────────────────

    new cdk.CfnOutput(this, "ClaimsTableName", {
      value: claimsTable.tableName,
    });
    new cdk.CfnOutput(this, "TriageRunsTableName", {
      value: triageRunsTable.tableName,
    });
    new cdk.CfnOutput(this, "AgentHandoffQueueUrl", {
      value: agentHandoffQueue.queueUrl,
    });
    new cdk.CfnOutput(this, "StateMachineArn", {
      value: stateMachine.stateMachineArn,
    });
    new cdk.CfnOutput(this, "ApprovalApiUrl", {
      value: api.url,
    });
  }
}
