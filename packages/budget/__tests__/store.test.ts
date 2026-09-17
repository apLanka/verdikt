import { describe, it, expect, vi, beforeEach } from "vitest";
import { BudgetStore } from "../src/store.js";

function createMockDocClient() {
  const send = vi.fn();
  return {
    docClient: { send } as any,
    send,
  };
}

describe("BudgetStore", () => {
  let store: BudgetStore;
  let mockSend: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    const m = createMockDocClient();
    mockSend = m.send;
    store = new BudgetStore(m.docClient, "BudgetsTable", {
      ceilingUsd: 2.0,
      reservationRatio: 0.25,
    });
  });

  describe("createBudget", () => {
    it("creates a budget account with correct defaults", async () => {
      mockSend.mockReturnValueOnce(Promise.resolve({}));

      const budget = await store.createBudget("run-001");

      expect(budget.budgetId).toBe("budget-run-001");
      expect(budget.runId).toBe("run-001");
      expect(budget.ceilingUsd).toBe(2.0);
      expect(budget.remainingUsd).toBe(2.0);
      expect(budget.spentUsd).toBe(0);
      expect(mockSend).toHaveBeenCalledTimes(1);
    });
  });

  describe("reserve", () => {
    it("allows reservation when budget is sufficient", async () => {
      mockSend.mockReturnValueOnce(
        Promise.resolve({ Attributes: { remainingUsd: 1.5 } })
      );

      const result = await store.reserve("run-001", "att-001");

      expect(result.allowed).toBe(true);
      expect(result.reservationUsd).toBe(0.5);
      expect(result.remainingUsd).toBe(1.5);
    });

    it("rejects reservation when budget is exhausted", async () => {
      const err = Object.assign(new Error("The conditional request failed"), {
        name: "ConditionalCheckFailedException",
        $metadata: {},
      });
      mockSend.mockReturnValueOnce(Promise.reject(err));

      const result = await store.reserve("run-001", "att-001");

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Budget exhausted");
    });
  });

  describe("recordUsage", () => {
    it("records usage and updates the budget", async () => {
      mockSend.mockReturnValueOnce(Promise.resolve({}));

      await store.recordUsage({
        attemptId: "att-001",
        runId: "run-001",
        modelId: "anthropic.claude-3-haiku",
        inputTokens: 500,
        outputTokens: 200,
        costUsd: 0.003,
        recordedAt: new Date().toISOString(),
      });

      expect(mockSend).toHaveBeenCalledTimes(1);
      const cmd = mockSend.mock.calls[0][0];
      expect(cmd.input?.Key?.budgetId).toBe("budget-run-001");
    });
  });

  describe("getBudget", () => {
    it("returns budget when it exists", async () => {
      mockSend.mockReturnValueOnce(
        Promise.resolve({
          Item: {
            budgetId: "budget-run-001",
            runId: "run-001",
            ceilingUsd: 2.0,
            remainingUsd: 1.5,
            spentUsd: 0.5,
            createdAt: "2026-01-01T00:00:00Z",
            updatedAt: "2026-01-01T00:00:00Z",
          },
        })
      );

      const budget = await store.getBudget("run-001");
      expect(budget).not.toBeNull();
      expect(budget!.remainingUsd).toBe(1.5);
    });

    it("returns null when budget does not exist", async () => {
      mockSend.mockReturnValueOnce(Promise.resolve({ Item: undefined }));

      const budget = await store.getBudget("run-999");
      expect(budget).toBeNull();
    });
  });
});
