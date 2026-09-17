import {
  CloudWatchClient,
  PutMetricDataCommand,
  StandardUnit,
} from "@aws-sdk/client-cloudwatch";

const cw = new CloudWatchClient({});
const METRIC_NAMESPACE = "Verdikt";

export interface LogContext {
  claimId: string;
  runId: string;
  attemptId?: string;
  agentType?: "extractor" | "investigator" | "reviewer" | "supervisor" | "approval";
}

export interface MetricData {
  costUsd?: number;
  attemptCount?: number;
  inputTokens?: number;
  outputTokens?: number;
  durationMs?: number;
}

function log(level: string, ctx: LogContext, message: string, extra?: Record<string, unknown>) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    claimId: ctx.claimId,
    runId: ctx.runId,
    attemptId: ctx.attemptId,
    agentType: ctx.agentType,
    ...extra,
  };
  console.log(JSON.stringify(entry));
}

export function createLogger(context: LogContext) {
  return {
    info: (message: string, extra?: Record<string, unknown>) =>
      log("INFO", context, message, extra),

    warn: (message: string, extra?: Record<string, unknown>) =>
      log("WARN", context, message, extra),

    error: (message: string, extra?: Record<string, unknown>) =>
      log("ERROR", context, message, extra),

    metric: async (data: MetricData) => {
      const metrics: { MetricName: string; Value: number; Unit: StandardUnit }[] = [];

      if (data.costUsd !== undefined) {
        metrics.push({ MetricName: "CostPerClaim", Value: data.costUsd, Unit: StandardUnit.Count });
      }
      if (data.attemptCount !== undefined) {
        metrics.push({ MetricName: "AttemptCount", Value: data.attemptCount, Unit: StandardUnit.Count });
      }
      if (data.inputTokens !== undefined) {
        metrics.push({ MetricName: "InputTokens", Value: data.inputTokens, Unit: StandardUnit.Count });
      }
      if (data.outputTokens !== undefined) {
        metrics.push({ MetricName: "OutputTokens", Value: data.outputTokens, Unit: StandardUnit.Count });
      }
      if (data.durationMs !== undefined) {
        metrics.push({ MetricName: "Duration", Value: data.durationMs, Unit: StandardUnit.Milliseconds });
      }

      if (metrics.length > 0) {
        try {
          await cw.send(
            new PutMetricDataCommand({
              Namespace: METRIC_NAMESPACE,
              MetricData: metrics.map((m) => ({
                ...m,
                Dimensions: [
                  { Name: "ClaimId", Value: context.claimId },
                  { Name: "RunId", Value: context.runId },
                  ...(context.agentType ? [{ Name: "AgentType", Value: context.agentType }] : []),
                ],
              })),
            })
          );
        } catch (err) {
          log("ERROR", context, "Failed to emit CloudWatch metrics", {
            error: String(err),
          });
        }
      }
    },
  };
}

export type Logger = ReturnType<typeof createLogger>;
