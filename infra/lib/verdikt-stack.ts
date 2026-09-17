import * as cdk from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as sfn from "aws-cdk-lib/aws-stepfunctions";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigw from "aws-cdk-lib/aws-apigateway";
import * as iam from "aws-cdk-lib/aws-iam";
import * as logs from "aws-cdk-lib/aws-logs";
import { Construct } from "constructs";

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

    // ── Synthetic Reference Data Tables (read-only at runtime) ───────

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

    new sqs.Queue(
      this,
      "ApprovalCallbackQueue",
      {
        visibilityTimeout: cdk.Duration.seconds(60),
        deadLetterQueue: {
          queue: approvalDeadLetterQueue,
          maxReceiveCount: 3,
        },
      }
    );

    // ── Step Functions State Machine Shell ───────────────────────────

    const placeholderTask = new sfn.Pass(this, "Placeholder", {
      comment: "Placeholder — agents will be wired in F4–F7",
    });

    const stateMachine = new sfn.StateMachine(this, "VerdiktSupervisor", {
      stateMachineName: "verdikt-supervisor",
      definitionBody: sfn.DefinitionBody.fromChainable(
        sfn.Chain.start(placeholderTask)
      ),
      tracingEnabled: true,
      logs: {
        destination: new logs.LogGroup(this, "SupervisorLogs", {
          removalPolicy: cdk.RemovalPolicy.DESTROY,
          retention: logs.RetentionDays.ONE_WEEK,
        }),
        level: sfn.LogLevel.ALL,
      },
    });

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
      },
    });

    const api = new apigw.RestApi(this, "VerdiktApi", {
      restApiName: "Verdikt Approval API",
      deployOptions: { tracingEnabled: true },
    });

    const approvalResource = api.root.addResource("approval");
    approvalResource.addMethod("POST", new apigw.LambdaIntegration(approvalLambda));

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

    // Reference data: read-only for agents
    syntheticPoliciesTable.grantReadData(agentRole);
    syntheticPriorClaimsTable.grantReadData(agentRole);
    syntheticRepairCostsTable.grantReadData(agentRole);

    // Bedrock access
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
