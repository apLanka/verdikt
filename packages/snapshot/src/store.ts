import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  GetCommand,
} from "@aws-sdk/lib-dynamodb";
import { v4 as uuid } from "uuid";

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const SNAPSHOTS_TABLE = process.env.SNAPSHOTS_TABLE!;
const TRIAGE_RUNS_TABLE = process.env.TRIAGE_RUNS_TABLE!;

export interface SnapshotData {
  claimId: string;
  runId: string;
  snapshotVersion: number;
  nodePointer: string;
  attemptCount: number;
  budgetRemainingUsd: number;
  extractionResult: unknown | null;
  investigationResult: unknown | null;
  reviewResult: unknown | null;
  recommendation: unknown | null;
  inputVersion: number;
  documents: unknown[];
}

export class SnapshotStore {
  async writeSnapshot(data: SnapshotData): Promise<string> {
    const snapshotId = `snap-${data.runId}-v${data.snapshotVersion}`;

    await dynamo.send(
      new PutCommand({
        TableName: SNAPSHOTS_TABLE,
        Item: {
          snapshotId,
          claimId: data.claimId,
          runId: data.runId,
          snapshotVersion: data.snapshotVersion,
          nodePointer: data.nodePointer,
          attemptCount: data.attemptCount,
          budgetRemainingUsd: data.budgetRemainingUsd,
          extractionResult: data.extractionResult ?? null,
          investigationResult: data.investigationResult ?? null,
          reviewResult: data.reviewResult ?? null,
          recommendation: data.recommendation ?? null,
          inputVersion: data.inputVersion,
          documents: data.documents,
          createdAt: new Date().toISOString(),
        },
      })
    );

    return snapshotId;
  }

  async getLatestSnapshot(
    runId: string
  ): Promise<(SnapshotData & { snapshotId: string; createdAt: string }) | null> {
    const result = await dynamo.send(
      new QueryCommand({
        TableName: SNAPSHOTS_TABLE,
        IndexName: "ByRun",
        KeyConditionExpression: "runId = :runId",
        ExpressionAttributeValues: { ":runId": runId },
        ScanIndexForward: false,
        Limit: 1,
      })
    );

    if (!result.Items || result.Items.length === 0) return null;
    const item = result.Items[0];
    return {
      snapshotId: item.snapshotId,
      claimId: item.claimId,
      runId: item.runId,
      snapshotVersion: item.snapshotVersion,
      nodePointer: item.nodePointer,
      attemptCount: item.attemptCount,
      budgetRemainingUsd: item.budgetRemainingUsd,
      extractionResult: item.extractionResult,
      investigationResult: item.investigationResult,
      reviewResult: item.reviewResult,
      recommendation: item.recommendation,
      inputVersion: item.inputVersion,
      documents: item.documents,
      createdAt: item.createdAt,
    };
  }

  async getSnapshotById(snapshotId: string) {
    const result = await dynamo.send(
      new GetCommand({
        TableName: SNAPSHOTS_TABLE,
        Key: { snapshotId },
      })
    );
    return result.Item ?? null;
  }
}

export interface ReplayRecord {
  replayRunId: string;
  sourceRunId: string;
  sourceSnapshotId: string;
  terminalStateMatch: boolean;
  createdAt: string;
}

export interface ResumeInfo {
  resumeFromNode: string;
  snapshotVersion: number;
  attemptCount: number;
  budgetRemainingUsd: number;
  extractionResult: unknown | null;
  investigationResult: unknown | null;
  documents: unknown[];
  inputVersion: number;
}

export function determineResumePoint(
  snapshot: SnapshotData | null
): ResumeInfo | null {
  if (!snapshot) return null;

  return {
    resumeFromNode: snapshot.nodePointer,
    snapshotVersion: snapshot.snapshotVersion,
    attemptCount: snapshot.attemptCount,
    budgetRemainingUsd: snapshot.budgetRemainingUsd,
    extractionResult: snapshot.extractionResult,
    investigationResult: snapshot.investigationResult,
    documents: snapshot.documents,
    inputVersion: snapshot.inputVersion,
  };
}

export function generateRunId(): string {
  return `run-${uuid()}`;
}
