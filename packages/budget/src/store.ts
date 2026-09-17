import {
  ConditionalCheckFailedException,
} from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";

export interface BudgetConfig {
  /** Maximum USD per run. Default: 2.00 */
  ceilingUsd: number;
  /** Percentage of ceiling reserved per attempt. Default: 0.25 (25%) */
  reservationRatio: number;
}

const DEFAULT_CONFIG: BudgetConfig = {
  ceilingUsd: 2.0,
  reservationRatio: 0.25,
};

export interface BudgetAccount {
  budgetId: string;
  runId: string;
  ceilingUsd: number;
  remainingUsd: number;
  spentUsd: number;
  createdAt: string;
  updatedAt: string;
}

export interface UsageRecord {
  attemptId: string;
  runId: string;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  recordedAt: string;
}

export interface ReservationResult {
  allowed: boolean;
  reservationUsd?: number;
  remainingUsd?: number;
  reason?: string;
}

function isConditionalCheckFailed(err: unknown): boolean {
  return (
    err instanceof Error &&
    err.name === "ConditionalCheckFailedException"
  );
}

export class BudgetStore {
  private readonly docClient: DynamoDBDocumentClient;
  private readonly tableName: string;
  private readonly config: BudgetConfig;

  constructor(
    docClient: DynamoDBDocumentClient,
    tableName: string,
    config: Partial<BudgetConfig> = {}
  ) {
    this.docClient = docClient;
    this.tableName = tableName;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Create a BudgetAccount for a new TriageRun.
   */
  async createBudget(runId: string): Promise<BudgetAccount> {
    const now = new Date().toISOString();
    const account: BudgetAccount = {
      budgetId: `budget-${runId}`,
      runId,
      ceilingUsd: this.config.ceilingUsd,
      remainingUsd: this.config.ceilingUsd,
      spentUsd: 0,
      createdAt: now,
      updatedAt: now,
    };

    await this.docClient.send(
      new PutCommand({
        TableName: this.tableName,
        Item: account,
        ConditionExpression: "attribute_not_exists(budgetId)",
      })
    );

    return account;
  }

  /**
   * Reserve allowance for an agent attempt before Bedrock inference.
   * Returns allowed: false if budget is exhausted.
   */
  async reserve(
    runId: string,
    _attemptId: string
  ): Promise<ReservationResult> {
    const reservationUsd =
      this.config.ceilingUsd * this.config.reservationRatio;

    try {
      const result = await this.docClient.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: { budgetId: `budget-${runId}` },
          UpdateExpression:
            "SET remainingUsd = remainingUsd - :reserve, updatedAt = :now",
          ConditionExpression:
            "remainingUsd >= :reserve AND runId = :runId",
          ExpressionAttributeValues: {
            ":reserve": reservationUsd,
            ":now": new Date().toISOString(),
            ":runId": runId,
          },
          ReturnValues: "ALL_NEW",
        })
      );

      return {
        allowed: true,
        reservationUsd,
        remainingUsd: result.Attributes?.remainingUsd as number,
      };
    } catch (err) {
      if (isConditionalCheckFailed(err)) {
        return {
          allowed: false,
          reservationUsd,
          reason: "Budget exhausted — remaining is less than reservation",
        };
      }
      throw err;
    }
  }

  /**
   * Record actual usage after Bedrock inference.
   * Adjusts remainingUsd by the difference between reserved and actual cost.
   */
  async recordUsage(usage: UsageRecord): Promise<void> {
    const reservationUsd =
      this.config.ceilingUsd * this.config.reservationRatio;
    const adjustment = usage.costUsd - reservationUsd;

    await this.docClient.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: { budgetId: `budget-${usage.runId}` },
        UpdateExpression:
          "SET spentUsd = spentUsd + :cost, remainingUsd = remainingUsd - :adjustment, updatedAt = :now",
        ConditionExpression: "runId = :runId",
        ExpressionAttributeValues: {
          ":cost": usage.costUsd,
          ":adjustment": adjustment,
          ":now": new Date().toISOString(),
          ":runId": usage.runId,
        },
      })
    );
  }

  /**
   * Get current budget state for a run.
   */
  async getBudget(runId: string): Promise<BudgetAccount | null> {
    const result = await this.docClient.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { budgetId: `budget-${runId}` },
      })
    );

    return (result.Item as BudgetAccount) ?? null;
  }
}
