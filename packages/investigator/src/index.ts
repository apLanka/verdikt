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
  InvestigationResult,
} from "@verdikt/contracts";

export interface InvestigatorConfig {
  region: string;
  attemptsTable: string;
  policiesTable: string;
  priorClaimsTable: string;
  bedrockModelId: string;
  maxTokens: number;
  temperature: number;
}

function getConfig(): InvestigatorConfig {
  return {
    region: process.env.AWS_REGION || "us-east-1",
    attemptsTable: process.env.ATTEMPTS_TABLE || "AgentAttempts",
    policiesTable: process.env.POLICIES_TABLE || "SyntheticPolicies",
    priorClaimsTable: process.env.PRIOR_CLAIMS_TABLE || "SyntheticPriorClaims",
    bedrockModelId:
      process.env.BEDROCK_MODEL_ID || "anthropic.claude-3-haiku-20240307-v1:0",
    maxTokens: parseInt(process.env.MAX_TOKENS || "2048", 10),
    temperature: parseFloat(process.env.TEMPERATURE || "0.1"),
  };
}

const INVESTIGATION_PROMPT = `You are an insurance claims investigation system. Cross-check the extracted facts against the provided policy information and prior claims history.

Determine:
1. Whether the claim falls within policy coverage and limits
2. Whether there are prior claims that affect this claim
3. A verdict: "proceed" (claim is valid), "reject" (claim violates policy), or "flag_for_review" (needs human review)

Return valid JSON matching the InvestigationResult schema.`;

export function buildInvestigationPrompt(
  extractionResult: unknown,
  policyData: unknown,
  priorClaims: unknown[]
): string {
  return `${INVESTIGATION_PROMPT}

Extracted Facts:
${JSON.stringify(extractionResult, null, 2)}

Policy Information:
${JSON.stringify(policyData, null, 2)}

Prior Claims History:
${JSON.stringify(priorClaims, null, 2)}`;
}

export async function callBedrock(
  config: InvestigatorConfig,
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

export async function lookupPolicyData(
  docClient: DynamoDBDocumentClient,
  config: InvestigatorConfig,
  policyId: string
): Promise<unknown> {
  const { GetCommand } = await import("@aws-sdk/lib-dynamodb");
  const result = await docClient.send(
    new GetCommand({
      TableName: config.policiesTable,
      Key: { policyId },
    })
  );
  return result.Item ?? null;
}

export async function lookupPriorClaims(
  docClient: DynamoDBDocumentClient,
  config: InvestigatorConfig,
  policyId: string
): Promise<unknown[]> {
  const { QueryCommand } = await import("@aws-sdk/lib-dynamodb");
  const result = await docClient.send(
    new QueryCommand({
      TableName: config.priorClaimsTable,
      IndexName: "ByPolicy",
      KeyConditionExpression: "policyId = :pid",
      ExpressionAttributeValues: { ":pid": policyId },
    })
  );
  return result.Items ?? [];
}

export async function persistResult(
  docClient: DynamoDBDocumentClient,
  config: InvestigatorConfig,
  envelope: { attemptId: string; runId: string; claimId: string; inputVersion: number },
  _result: unknown,
  status: "completed" | "failed"
): Promise<{ attemptId: string; status: string }> {
  const now = new Date().toISOString();
  const attempt = {
    attemptId: envelope.attemptId,
    runId: envelope.runId,
    claimId: envelope.claimId,
    agentType: "investigator",
    status,
    inputVersion: envelope.inputVersion,
    outputVersion: status === "completed" ? envelope.inputVersion + 1 : envelope.inputVersion,
    resultReference:
      status === "completed"
        ? `investigation:${envelope.attemptId}`
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
        error: "InvestigationFailed",
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

    const envelope = validateOrThrow(AgentEnvelope, body, "Investigator envelope") as {
      attemptId: string; runId: string; claimId: string;
      inputVersion: number; callbackToken: string;
    };

    const { claimId, runId, attemptId } = envelope;

    console.log(JSON.stringify({ level: "info", message: "Processing investigation", claimId, runId, attemptId }));

    try {
      const extractionResult = body.extractionResult;
      const policyId = extractionResult?.policyId;

      if (!policyId) {
        throw new Error("No policyId found in extractionResult");
      }

      const [policyData, priorClaims] = await Promise.all([
        lookupPolicyData(docClient, config, policyId),
        lookupPriorClaims(docClient, config, policyId),
      ]);

      const prompt = buildInvestigationPrompt(extractionResult, policyData, priorClaims);
      const investigationData = await callBedrock(config, prompt);

      const validatedData = typeof investigationData === "object" && investigationData !== null ? investigationData : {};
      const investigationResult = validateOrThrow(
        InvestigationResult,
        { ...validatedData, claimId, runId, attemptId, inputVersion: envelope.inputVersion, schemaVersion: 1 },
        "Investigation result"
      ) as { verdict: string; [key: string]: unknown };

      await persistResult(docClient, config, envelope, investigationResult, "completed");
      await reportCompletion(sfnClient, envelope.callbackToken, investigationResult, true);

      console.log(JSON.stringify({ level: "info", message: "Investigation completed", claimId, runId, attemptId, verdict: investigationResult.verdict }));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error(JSON.stringify({ level: "error", message: "Investigation failed", claimId, runId, attemptId, error: errorMessage }));

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
