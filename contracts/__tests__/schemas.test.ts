import { describe, it, expect } from "vitest";
import {
  AgentEnvelope,
  ExtractionResult,
  InvestigationResult,
  ReviewResult,
  Recommendation,
  ApprovalDecision,
  RunSnapshot,
  RunEvent,
  BudgetAccount,
  UsageRecord,
  ReplayRecord,
} from "../src/schemas.js";
import { validate } from "../src/validate.js";

// ── AgentEnvelope ───────────────────────────────────────────────────

describe("AgentEnvelope", () => {
  const valid = {
    schemaVersion: 1,
    claimId: "claim-001",
    runId: "run-001",
    attemptId: "att-001",
    inputVersion: 0,
    callbackToken: "tok_abc123",
  };

  it("accepts valid envelope", () => {
    expect(validate(AgentEnvelope, valid).success).toBe(true);
  });

  it("rejects missing callbackToken", () => {
    const { callbackToken: _, ...rest } = valid;
    expect(validate(AgentEnvelope, rest).success).toBe(false);
  });

  it("rejects negative inputVersion", () => {
    expect(
      validate(AgentEnvelope, { ...valid, inputVersion: -1 }).success
    ).toBe(false);
  });

  it("rejects wrong schemaVersion", () => {
    expect(
      validate(AgentEnvelope, { ...valid, schemaVersion: 2 }).success
    ).toBe(false);
  });
});

// ── ExtractionResult ────────────────────────────────────────────────

describe("ExtractionResult", () => {
  const valid = {
    schemaVersion: 1,
    claimId: "claim-001",
    runId: "run-001",
    attemptId: "att-001",
    inputVersion: 0,
    facts: [
      {
        field: "vehicle_make",
        value: "Toyota",
        confidence: 0.95,
        evidence: [{ documentId: "doc-1", section: "header" }],
      },
    ],
  };

  it("accepts valid extraction", () => {
    expect(validate(ExtractionResult, valid).success).toBe(true);
  });

  it("rejects empty facts array", () => {
    expect(
      validate(ExtractionResult, { ...valid, facts: [] }).success
    ).toBe(false);
  });

  it("rejects fact with empty evidence", () => {
    const badFact = {
      ...valid.facts[0],
      evidence: [],
    };
    expect(
      validate(ExtractionResult, { ...valid, facts: [badFact] }).success
    ).toBe(false);
  });
});

// ── InvestigationResult ─────────────────────────────────────────────

describe("InvestigationResult", () => {
  const valid = {
    schemaVersion: 1,
    claimId: "claim-001",
    runId: "run-001",
    attemptId: "att-001",
    inputVersion: 0,
    verdict: "proceed",
    policyReferences: [],
    priorClaimReferences: [],
  };

  it("accepts valid investigation", () => {
    expect(validate(InvestigationResult, valid).success).toBe(true);
  });

  it("rejects invalid verdict", () => {
    expect(
      validate(InvestigationResult, { ...valid, verdict: "maybe" }).success
    ).toBe(false);
  });
});

// ── ReviewResult ────────────────────────────────────────────────────

describe("ReviewResult", () => {
  const reworkResult = {
    outcome: "rework",
    schemaVersion: 1,
    claimId: "claim-001",
    runId: "run-001",
    attemptId: "att-001",
    inputVersion: 0,
    rework: {
      targetAgent: "extractor",
      reason: "Missing vehicle identification number",
      staleInputVersion: 0,
    },
  };

  const recommendationResult = {
    outcome: "recommendation",
    schemaVersion: 1,
    claimId: "claim-001",
    runId: "run-001",
    attemptId: "att-001",
    inputVersion: 0,
    recommendation: {
      schemaVersion: 1,
      recommendationId: "rec-001",
      claimId: "claim-001",
      runId: "run-001",
      version: 1,
      decision: "approve",
      rationale: "All checks passed",
      confidence: 0.9,
      estimatedPayout: 5000,
      createdAt: new Date().toISOString(),
    },
  };

  it("accepts valid rework", () => {
    expect(validate(ReviewResult, reworkResult).success).toBe(true);
  });

  it("accepts valid recommendation", () => {
    expect(validate(ReviewResult, recommendationResult).success).toBe(true);
  });

  it("rejects rework with invalid target", () => {
    expect(
      validate(ReviewResult, {
        ...reworkResult,
        rework: { ...reworkResult.rework, targetAgent: "reviewer" },
      }).success
    ).toBe(false);
  });
});

// ── ApprovalDecision ────────────────────────────────────────────────

describe("ApprovalDecision", () => {
  const valid = {
    schemaVersion: 1,
    approvalId: "appr-001",
    recommendationId: "rec-001",
    recommendationVersion: 1,
    claimId: "claim-001",
    runId: "run-001",
    decision: "approve",
    actor: "ops-001",
    timestamp: new Date().toISOString(),
  };

  it("accepts valid approval", () => {
    expect(validate(ApprovalDecision, valid).success).toBe(true);
  });

  it("rejects invalid decision value", () => {
    expect(
      validate(ApprovalDecision, { ...valid, decision: "maybe" }).success
    ).toBe(false);
  });
});

// ── RunSnapshot ─────────────────────────────────────────────────────

describe("RunSnapshot", () => {
  const valid = {
    snapshotId: "snap-001",
    claimId: "claim-001",
    runId: "run-001",
    snapshotVersion: 0,
    nodePointer: "investigate",
    attemptCount: 1,
    budgetRemainingUsd: 1.5,
    createdAt: new Date().toISOString(),
  };

  it("accepts valid snapshot", () => {
    expect(validate(RunSnapshot, valid).success).toBe(true);
  });

  it("rejects negative attemptCount", () => {
    expect(
      validate(RunSnapshot, { ...valid, attemptCount: -1 }).success
    ).toBe(false);
  });
});

// ── RunEvent ────────────────────────────────────────────────────────

describe("RunEvent", () => {
  const valid = {
    eventId: "evt-001",
    runId: "run-001",
    claimId: "claim-001",
    stateTransition: "extract_complete",
    toState: "investigate",
    timestamp: new Date().toISOString(),
  };

  it("accepts valid event", () => {
    expect(validate(RunEvent, valid).success).toBe(true);
  });

  it("rejects missing toState", () => {
    const { toState: _, ...rest } = valid;
    expect(validate(RunEvent, rest).success).toBe(false);
  });
});

// ── BudgetAccount ───────────────────────────────────────────────────

describe("BudgetAccount", () => {
  const valid = {
    budgetId: "bud-001",
    runId: "run-001",
    ceilingUsd: 2.0,
    remainingUsd: 1.5,
    spentUsd: 0.5,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  it("accepts valid budget", () => {
    expect(validate(BudgetAccount, valid).success).toBe(true);
  });

  it("rejects negative remaining", () => {
    expect(
      validate(BudgetAccount, { ...valid, remainingUsd: -0.1 }).success
    ).toBe(false);
  });
});

// ── UsageRecord ─────────────────────────────────────────────────────

describe("UsageRecord", () => {
  const valid = {
    attemptId: "att-001",
    runId: "run-001",
    modelId: "anthropic.claude-3-haiku",
    inputTokens: 500,
    outputTokens: 200,
    costUsd: 0.003,
    recordedAt: new Date().toISOString(),
  };

  it("accepts valid usage", () => {
    expect(validate(UsageRecord, valid).success).toBe(true);
  });
});

// ── ReplayRecord ────────────────────────────────────────────────────

describe("ReplayRecord", () => {
  const valid = {
    replayRunId: "run-002",
    sourceRunId: "run-001",
    sourceSnapshotId: "snap-001",
    terminalStateMatch: true,
    createdAt: new Date().toISOString(),
  };

  it("accepts valid replay record", () => {
    expect(validate(ReplayRecord, valid).success).toBe(true);
  });
});

// ── validate() helper ───────────────────────────────────────────────

describe("validate helper", () => {
  it("returns success with data on valid input", () => {
    const result = validate(AgentEnvelope, {
      schemaVersion: 1,
      claimId: "c1",
      runId: "r1",
      attemptId: "a1",
      inputVersion: 0,
      callbackToken: "tok",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.claimId).toBe("c1");
    }
  });

  it("returns errors on invalid input", () => {
    const result = validate(AgentEnvelope, { foo: "bar" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });
});
