import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
} from "@aws-sdk/lib-dynamodb";
import { SFNClient, StartExecutionCommand } from "@aws-sdk/client-sfn";
import { SnapshotStore, generateRunId } from "./store.js";

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const sfn = new SFNClient({});
const snapshotStore = new SnapshotStore();

const TRIAGE_RUNS_TABLE = process.env.TRIAGE_RUNS_TABLE!;
const STATE_MACHINE_ARN = process.env.STATE_MACHINE_ARN!;

function jsonResp(statusCode: number, body: unknown) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

export const handler = async (event: { body?: string }) => {
  if (!event.body) return jsonResp(400, { error: "Missing request body" });

  let req: { claimId?: string; runId?: string };
  try {
    req = JSON.parse(event.body);
  } catch {
    return jsonResp(400, { error: "Invalid JSON" });
  }

  if (!req.claimId || !req.runId) {
    return jsonResp(400, { error: "Missing claimId or runId" });
  }

  // Verify the original run exists
  const originalRun = await dynamo.send(
    new GetCommand({
      TableName: TRIAGE_RUNS_TABLE,
      Key: { runId: req.runId },
    })
  );

  if (!originalRun.Item) {
    return jsonResp(404, { error: "Original run not found" });
  }

  // Get the latest snapshot
  const snapshot = await snapshotStore.getLatestSnapshot(req.runId);

  if (!snapshot) {
    return jsonResp(404, {
      error: "No snapshots found for this run",
    });
  }

  // Create a new TriageRun from the snapshot
  const replayRunId = generateRunId();

  await dynamo.send(
    new PutCommand({
      TableName: TRIAGE_RUNS_TABLE,
      Item: {
        runId: replayRunId,
        claimId: req.claimId,
        status: "pending",
        replaySource: {
          sourceRunId: req.runId,
          sourceSnapshotId: snapshot.snapshotId,
        },
        snapshotVersion: snapshot.snapshotVersion,
        attemptCount: snapshot.attemptCount,
        budgetRemainingUsd: snapshot.budgetRemainingUsd,
        createdAt: new Date().toISOString(),
      },
    })
  );

  // Start the supervisor with the snapshot's state
  const input = {
    claimId: req.claimId,
    runId: replayRunId,
    documents: snapshot.documents,
    replay: {
      resumeFromNode: snapshot.nodePointer,
      extractionResult: snapshot.extractionResult,
      investigationResult: snapshot.investigationResult,
    },
  };

  const execution = await sfn.send(
    new StartExecutionCommand({
      stateMachineArn: STATE_MACHINE_ARN,
      name: replayRunId,
      input: JSON.stringify(input),
    })
  );

  return jsonResp(201, {
    replayRunId,
    sourceRunId: req.runId,
    sourceSnapshotId: snapshot.snapshotId,
    executionArn: execution.executionArn,
  });
};
