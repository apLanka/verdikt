import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  SFNClient,
  SendTaskSuccessCommand,
  SendTaskFailureCommand,
} from "@aws-sdk/client-sfn";

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const sfn = new SFNClient({});

const RECOMMENDATIONS_TABLE = process.env.RECOMMENDATIONS_TABLE!;
const APPROVALS_TABLE = process.env.APPROVALS_TABLE!;

interface ApprovalRequest {
  recommendationId: string;
  decision: "approve" | "reject";
  actor: string;
  timestamp: string;
}

interface StoredRecommendation {
  recommendationId: string;
  runId: string;
  claimId: string;
  version: number;
  decision: string;
  status: string;
  callbackToken: string;
}

function jsonResp(statusCode: number, body: unknown) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

export const handler = async (event: { body?: string }) => {
  if (!event.body) return jsonResp(400, { error: "Missing request body" });

  let req: ApprovalRequest;
  try {
    req = JSON.parse(event.body);
  } catch {
    return jsonResp(400, { error: "Invalid JSON" });
  }

  if (!req.recommendationId || !req.decision || !req.actor || !req.timestamp) {
    return jsonResp(400, { error: "Missing required fields" });
  }

  if (req.decision !== "approve" && req.decision !== "reject") {
    return jsonResp(400, { error: "Decision must be 'approve' or 'reject'" });
  }

  // Look up the recommendation
  const recResult = await dynamo.send(
    new GetCommand({
      TableName: RECOMMENDATIONS_TABLE,
      Key: { recommendationId: req.recommendationId },
    })
  );

  if (!recResult.Item) {
    return jsonResp(404, { error: "Recommendation not found" });
  }

  const rec = recResult.Item as StoredRecommendation;

  if (rec.status !== "pending_approval") {
    return jsonResp(409, {
      error: `Recommendation is '${rec.status}', not 'pending_approval'`,
    });
  }

  // Check for duplicate approval
  const existingApproval = await dynamo.send(
    new GetCommand({
      TableName: APPROVALS_TABLE,
      Key: { approvalId: req.recommendationId },
    })
  );

  if (existingApproval.Item) {
    return jsonResp(409, { error: "Already approved/rejected" });
  }

  // Record the approval decision
  const approvalRecord = {
    approvalId: req.recommendationId,
    recommendationId: req.recommendationId,
    recommendationVersion: rec.version,
    claimId: rec.claimId,
    runId: rec.runId,
    decision: req.decision,
    actor: req.actor,
    timestamp: req.timestamp,
  };

  await dynamo.send(
    new PutCommand({
      TableName: APPROVALS_TABLE,
      Item: approvalRecord,
    })
  );

  // Update recommendation status
  await dynamo.send(
    new UpdateCommand({
      TableName: RECOMMENDATIONS_TABLE,
      Key: { recommendationId: req.recommendationId },
      UpdateExpression: "SET #st = :status",
      ExpressionAttributeNames: { "#st": "status" },
      ExpressionAttributeValues: {
        ":status": req.decision === "approve" ? "approved" : "rejected",
      },
    })
  );

  if (req.decision === "approve") {
    // SimulatedAction: log what a real write-back would do
    const simulatedAction = {
      actionType: "simulated_payout" as const,
      claimId: rec.claimId,
      runId: rec.runId,
      recommendationId: rec.recommendationId,
      executedAt: new Date().toISOString(),
    };
    console.log("SimulatedAction:", JSON.stringify(simulatedAction));

    // Resume the workflow
    await sfn.send(
      new SendTaskSuccessCommand({
        taskToken: rec.callbackToken,
        output: JSON.stringify({
          decision: "approved",
          approval: approvalRecord,
          simulatedAction,
        }),
      })
    );

    return jsonResp(200, {
      status: "approved",
      approval: approvalRecord,
      simulatedAction,
    });
  } else {
    // Reject — terminate the workflow
    await sfn.send(
      new SendTaskFailureCommand({
        taskToken: rec.callbackToken,
        error: "ApprovalRejected",
        cause: `Rejected by ${req.actor}`,
      })
    );

    return jsonResp(200, {
      status: "rejected",
      approval: approvalRecord,
    });
  }
};
