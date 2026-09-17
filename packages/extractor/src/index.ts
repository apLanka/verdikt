import {
  DynamoDBClient,
} from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  UpdateCommand,
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
  ExtractionResult,
} from "@verdikt/contracts";

export interface ExtractorConfig {
  region: string;
  claimsTable: string;
  attemptsTable: string;
  bedrockModelId: string;
  maxTokens: number;
  temperature: number;
}

function getConfig(): ExtractorConfig {
  return {
    region: process.env.AWS_REGION || "us-east-1",
    claimsTable: process.env.CLAIMS_TABLE || "Claims",
    attemptsTable: process.env.ATTEMPTS_TABLE || "AgentAttempts",
    bedrockModelId:
      process.env.BEDROCK_MODEL_ID || "anthropic.claude-3-haiku-20240307-v1:0",
    maxTokens: parseInt(process.env.MAX_TOKENS || "2048", 10),
    temperature: parseFloat(process.env.TEMPERATURE || "0.1"),
  };
}

const EXTRACTION_PROMPT = `You are an insurance claims extraction system. Extract structured facts from the provided claim documents.

For each fact, provide:
- field: the fact name (e.g., "vehicle_make", "accident_date", "damage_description")
- value: the extracted value (string, number, or boolean)
- confidence: your confidence level (0-1)
- evidence: which document and section supports this fact

Also identify any missing documents that were expected but not provided.

Return valid JSON matching the ExtractionResult schema.`;

export function buildExtractionPrompt(documents: unknown[]): string {
  const docTexts = (documents as Array<{ type: string; content: string }>)
    .map((d, i) => `--- Document ${i + 1} (${d.type}) ---\n${d.content}`)
    .join("\n\n");

  return `${EXTRACTION_PROMPT}\n\nClaim Documents:\n${docTexts}`;
}

export async function callBedrock(
  config: ExtractorConfig,
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

  // Extract JSON from response (may be wrapped in markdown code block)
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = jsonMatch ? jsonMatch[1] : text;

  return JSON.parse(jsonStr);
}

export async function persistResult(
  docClient: DynamoDBDocumentClient,
  config: ExtractorConfig,
  envelope: { attemptId: string; runId: string; claimId: string; inputVersion: number },
  _result: { facts: unknown[] },
  status: "completed" | "failed"
): Promise<{ attemptId: string; status: string }> {
  const now = new Date().toISOString();
  const attempt = {
    attemptId: envelope.attemptId,
    runId: envelope.runId,
    claimId: envelope.claimId,
    agentType: "extractor",
    status,
    inputVersion: envelope.inputVersion,
    outputVersion: status === "completed" ? envelope.inputVersion + 1 : envelope.inputVersion,
    resultReference:
      status === "completed"
        ? `extraction:${envelope.attemptId}`
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

  if (status === "completed") {
    await docClient.send(
      new UpdateCommand({
        TableName: config.claimsTable,
        Key: { claimId: envelope.claimId },
        UpdateExpression: "SET updatedAt = :now",
        ExpressionAttributeValues: { ":now": now },
      })
    );
  }

  return attempt;
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
        error: "ExtractionFailed",
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

    const envelope = validateOrThrow(AgentEnvelope, body, "Extractor envelope") as { attemptId: string; runId: string; claimId: string; inputVersion: number; callbackToken: string };

    const claimId = envelope.claimId;
    const runId = envelope.runId;
    const attemptId = envelope.attemptId;

    console.log(
      JSON.stringify({
        level: "info",
        message: "Processing extraction",
        claimId,
        runId,
        attemptId,
      })
    );

    try {
      const prompt = buildExtractionPrompt(body.documents || []);

  const extractionData = await callBedrock(config, prompt);

  const validatedData = typeof extractionData === "object" && extractionData !== null ? extractionData : {};
  const extractionResult = validateOrThrow(
    ExtractionResult,
    { ...validatedData, claimId, runId, attemptId, inputVersion: envelope.inputVersion, schemaVersion: 1 },
    "Extraction result"
  ) as { facts: unknown[]; [key: string]: unknown };

  const persistedAttempt = await persistResult(docClient, config, envelope, extractionResult, "completed");
  void persistedAttempt; // persisted for audit trail

      await reportCompletion(sfnClient, envelope.callbackToken, extractionResult, true);

      console.log(
        JSON.stringify({
          level: "info",
          message: "Extraction completed",
          claimId,
          runId,
          attemptId,
        })
      );
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);

      console.error(
        JSON.stringify({
          level: "error",
          message: "Extraction failed",
          claimId,
          runId,
          attemptId,
          error: errorMessage,
        })
      );

      try {
        await reportCompletion(
          sfnClient,
          envelope.callbackToken,
          { error: errorMessage },
          false
        );
      } catch (reportErr) {
        console.error(
          JSON.stringify({
            level: "error",
            message: "Failed to report failure to Step Functions",
            claimId,
            runId,
            attemptId,
            error: reportErr instanceof Error ? reportErr.message : String(reportErr),
          })
        );
      }

      batchItemFailures.push({ itemIdentifier: messageId });
    }
  }

  return { batchItemFailures };
};
