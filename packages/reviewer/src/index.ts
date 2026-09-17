import {
  DynamoDBClient,
} from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  SFNClient,
  SendTaskSuccessCommand,
  SendTaskFailureCommand,
} from "@aws-sdk/client-sfn";
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import type { SQSEvent, SQSHandler, SQSBatchResponse } from "aws-lambda";
import { validateOrThrow } from "@verdikt/contracts";
import {
  AgentEnvelope,
  ReviewResult,
} from "@verdikt/contracts";

export interface ReviewerConfig {
  region: string;
  attemptsTable: string;
  repairCostsTable: string;
  bedrockModelId: string;
  maxTokens: number;
  temperature: number;
}

function getConfig(): ReviewerConfig {
  return {
    region: process.env.AWS_REGION || "us-east-1",
    attemptsTable: process.env.ATTEMPTS_TABLE || "AgentAttempts",
    repairCostsTable: process.env.REPAIR_COSTS_TABLE || "SyntheticRepairCosts",
    bedrockModelId:
      process.env.BEDROCK_MODEL_ID || "anthropic.claude-3-haiku-20240307-v1:0",
    maxTokens: parseInt(process.env.MAX_TOKENS || "2048", 10),
    temperature: parseFloat(process.env.TEMPERATURE || "0.1"),
  };
}

const REVIEW_PROMPT = `You are an insurance claims review system. You have access to both the extraction results and investigation results.

Your job is to:
1. Sanity-check the damage estimate against known repair costs
2. Either produce a Recommendation (approve/reject/escalate) or a ReworkRequest (send back to extractor or investigator)

If the estimate seems unreasonable given the repair cost data, issue a ReworkRequest.
If everything checks out, produce a Recommendation.

Return valid JSON matching the ReviewResult schema.`;

export function buildReviewPrompt(
  extractionResult: unknown,
  investigationResult: unknown,
  repairCosts: unknown[]
): string {
  return `${REVIEW_PROMPT}

Extraction Results:
${JSON.stringify(extractionResult, null, 2)}

Investigation Results:
${JSON.stringify(investigationResult, null, 2)}

Known Repair Costs (reference data):
${JSON.stringify(repairCosts, null, 2)}`;
}

export async function callBedrock(
  config: ReviewerConfig,
  prompt: string
): Promise<unknown> {
  const client = new BedrockRuntimeClient({ region: config.region });

  const body = JSON.stringify({
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: config.maxTokens,
    temperature: config.temperature,
    messages: [{ role: "user", content: prompt }],
  });

  const command = new InvokeModelCommand({
    modelId: config.bedrockModelId,
    contentType: "application/json",
    accept: "application/json",
    body,
  });

  const response = await client.send(command);
  const responseBody = JSON.parse(new TextDecoder().decode(response.body));

  const text = responseBody.content?.[0]?.text;
  if (!text) {
    throw new Error("No text content in Bedrock response");
  }

  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = jsonMatch ? jsonMatch[1] : text;

  return JSON.parse(jsonStr);
}

export async function lookupRepairCosts(
  docClient: DynamoDBDocumentClient,
  config: ReviewerConfig,
  vehicleType: string
): Promise<unknown[]> {
  const { QueryCommand } = await import("@aws-sdk/lib-dynamodb");
  const result = await docClient.send(
    new QueryCommand({
      TableName: config.repairCostsTable,
      KeyConditionExpression: "vehicleType = :vt",
      ExpressionAttributeValues: { ":vt": vehicleType },
    })
  );
  return result.Items ?? [];
}

export async function persistResult(
  docClient: DynamoDBDocumentClient,
  config: ReviewerConfig,
  envelope: { attemptId: string; runId: string; claimId: string; inputVersion: number },
  _result: unknown,
  status: "completed" | "failed"
): Promise<{ attemptId: string; status: string }> {
  const now = new Date().toISOString();
  const attempt = {
    attemptId: envelope.attemptId,
    runId: envelope.runId,
    claimId: envelope.claimId,
    agentType: "reviewer",
    status,
    inputVersion: envelope.inputVersion,
    outputVersion: status === "completed" ? envelope.inputVersion + 1 : envelope.inputVersion,
    resultReference:
      status === "completed"
        ? `review:${envelope.attemptId}`
        : undefined,
    createdAt: now,
    updatedAt: now,
  };

  await docClient.send(
    new PutCommand({
      TableName: config.attemptsTable,
      Item: attempt,
      ConditionExpression: "attribute_not_exists(attemptId)",
    })
  );

  return { attemptId: envelope.attemptId, status };
}

export async function reportCompletion(
  sfnClient: SFNClient,
  taskToken: string,
  result: unknown,
  success: boolean
): Promise<void> {
  if (success) {
    await sfnClient.send(
      new SendTaskSuccessCommand({
        taskToken,
        output: JSON.stringify(result),
      })
    );
  } else {
    await sfnClient.send(
      new SendTaskFailureCommand({
        taskToken,
        error: "ReviewFailed",
        cause: JSON.stringify(result),
      })
    );
  }
}

export const handler: SQSHandler = async (
  event: SQSEvent
): Promise<SQSBatchResponse> => {
  const config = getConfig();
  const docClient = DynamoDBDocumentClient.from(
    new DynamoDBClient({ region: config.region })
  );
  const sfnClient = new SFNClient({ region: config.region });

  const batchItemFailures: { itemIdentifier: string }[] = [];

  for (const record of event.Records) {
    const messageId = record.messageId;
    const body = JSON.parse(record.body);

    const envelope = validateOrThrow(AgentEnvelope, body, "Reviewer envelope") as {
      attemptId: string; runId: string; claimId: string;
      inputVersion: number; callbackToken: string;
    };

    const { claimId, runId, attemptId } = envelope;

    console.log(JSON.stringify({ level: "info", message: "Processing review", claimId, runId, attemptId }));

    try {
      const extractionResult = body.extractionResult;
      const investigationResult = body.investigationResult;
      const vehicleType = extractionResult?.vehicleType || "sedan";

      const repairCosts = await lookupRepairCosts(docClient, config, vehicleType);

      const prompt = buildReviewPrompt(extractionResult, investigationResult, repairCosts);
      const reviewData = await callBedrock(config, prompt);

      const validatedData = typeof reviewData === "object" && reviewData !== null ? reviewData : {};
      const reviewResult = validateOrThrow(
        ReviewResult,
        { ...validatedData, claimId, runId, attemptId, inputVersion: envelope.inputVersion, schemaVersion: 1 },
        "Review result"
      ) as { outcome: string; [key: string]: unknown };

      await persistResult(docClient, config, envelope, reviewResult, "completed");
      await reportCompletion(sfnClient, envelope.callbackToken, reviewResult, true);

      console.log(JSON.stringify({ level: "info", message: "Review completed", claimId, runId, attemptId, outcome: reviewResult.outcome }));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error(JSON.stringify({ level: "error", message: "Review failed", claimId, runId, attemptId, error: errorMessage }));

      try {
        await reportCompletion(sfnClient, envelope.callbackToken, { error: errorMessage }, false);
      } catch (reportErr) {
        console.error(JSON.stringify({ level: "error", message: "Failed to report to Step Functions", error: reportErr instanceof Error ? reportErr.message : String(reportErr) }));
      }

      batchItemFailures.push({ itemIdentifier: messageId });
    }
  }

  return { batchItemFailures };
};
