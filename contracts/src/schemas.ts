import { z } from "zod";

// ── Common Primitives ───────────────────────────────────────────────

export const ClaimId = z.string().min(1).brand<"ClaimId">();
export type ClaimId = z.infer<typeof ClaimId>;

export const RunId = z.string().min(1).brand<"RunId">();
export type RunId = z.infer<typeof RunId>;

export const AttemptId = z.string().min(1).brand<"AttemptId">();
export type AttemptId = z.infer<typeof AttemptId>;

export const RecommendationId = z.string().min(1).brand<"RecommendationId">();
export type RecommendationId = z.infer<typeof RecommendationId>;

export const SchemaVersion = z.literal(1);
export type SchemaVersion = z.infer<typeof SchemaVersion>;

// ── Agent Envelope (SQS message) ───────────────────────────────────

export const AgentEnvelope = z.object({
  schemaVersion: SchemaVersion,
  claimId: ClaimId,
  runId: RunId,
  attemptId: AttemptId,
  inputVersion: z.number().int().min(0),
  callbackToken: z.string().min(1),
});
export type AgentEnvelope = z.infer<typeof AgentEnvelope>;

// ── Evidence Reference ──────────────────────────────────────────────

export const EvidenceReference = z.object({
  documentId: z.string().min(1),
  section: z.string().min(1),
  excerpt: z.string().optional(),
});
export type EvidenceReference = z.infer<typeof EvidenceReference>;

// ── Extraction Result ───────────────────────────────────────────────

export const ExtractedFact = z.object({
  field: z.string().min(1),
  value: z.union([z.string(), z.number(), z.boolean()]),
  confidence: z.number().min(0).max(1),
  evidence: z.array(EvidenceReference).min(1),
});

export const ExtractionResult = z.object({
  schemaVersion: SchemaVersion,
  claimId: ClaimId,
  runId: RunId,
  attemptId: AttemptId,
  inputVersion: z.number().int().min(0),
  facts: z.array(ExtractedFact).min(1),
  missingDocuments: z.array(z.string()).optional(),
});
export type ExtractionResult = z.infer<typeof ExtractionResult>;

// ── Policy / Prior Claim References ─────────────────────────────────

export const PolicyReference = z.object({
  policyId: z.string().min(1),
  coverageType: z.string().min(1),
  limitAmount: z.number().min(0),
  status: z.enum(["active", "lapsed", "cancelled"]),
  matchedFacts: z.array(z.string()).min(1),
});
export type PolicyReference = z.infer<typeof PolicyReference>;

export const PriorClaimReference = z.object({
  priorClaimId: z.string().min(1),
  date: z.string().min(1),
  settlementAmount: z.number().min(0),
  status: z.enum(["settled", "denied", "pending"]),
  relatedFact: z.string().min(1),
});
export type PriorClaimReference = z.infer<typeof PriorClaimReference>;

// ── Investigation Result ────────────────────────────────────────────

export const InvestigationResult = z.object({
  schemaVersion: SchemaVersion,
  claimId: ClaimId,
  runId: RunId,
  attemptId: AttemptId,
  inputVersion: z.number().int().min(0),
  verdict: z.enum(["proceed", "reject", "flag_for_review"]),
  policyReferences: z.array(PolicyReference),
  priorClaimReferences: z.array(PriorClaimReference),
  notes: z.string().optional(),
});
export type InvestigationResult = z.infer<typeof InvestigationResult>;

// ── Repair Cost Reference ───────────────────────────────────────────

export const RepairCostReference = z.object({
  vehicleType: z.string().min(1),
  repairCategory: z.string().min(1),
  estimatedMinCost: z.number().min(0),
  estimatedMaxCost: z.number().min(0),
  source: z.string().min(1),
});
export type RepairCostReference = z.infer<typeof RepairCostReference>;

// ── Rework Request ──────────────────────────────────────────────────

export const ReworkRequest = z.object({
  targetAgent: z.enum(["extractor", "investigator"]),
  reason: z.string().min(1),
  staleInputVersion: z.number().int().min(0),
});
export type ReworkRequest = z.infer<typeof ReworkRequest>;

// ── Recommendation ──────────────────────────────────────────────────

export const Recommendation = z.object({
  schemaVersion: SchemaVersion,
  recommendationId: RecommendationId,
  claimId: ClaimId,
  runId: RunId,
  version: z.number().int().positive(),
  decision: z.enum(["approve", "reject", "escalate"]),
  rationale: z.string().min(1),
  confidence: z.number().min(0).max(1),
  estimatedPayout: z.number().min(0).optional(),
  createdAt: z.string().datetime(),
});
export type Recommendation = z.infer<typeof Recommendation>;

// ── Review Result (union: rework or recommendation) ─────────────────

export const ReviewResult = z.discriminatedUnion("outcome", [
  z.object({
    outcome: z.literal("rework"),
    schemaVersion: SchemaVersion,
    claimId: ClaimId,
    runId: RunId,
    attemptId: AttemptId,
    inputVersion: z.number().int().min(0),
    rework: ReworkRequest,
  }),
  z.object({
    outcome: z.literal("recommendation"),
    schemaVersion: SchemaVersion,
    claimId: ClaimId,
    runId: RunId,
    attemptId: AttemptId,
    inputVersion: z.number().int().min(0),
    recommendation: Recommendation,
  }),
]);
export type ReviewResult = z.infer<typeof ReviewResult>;

// ── Approval Decision ───────────────────────────────────────────────

export const ApprovalDecision = z.object({
  schemaVersion: SchemaVersion,
  approvalId: z.string().min(1),
  recommendationId: RecommendationId,
  recommendationVersion: z.number().int().positive(),
  claimId: ClaimId,
  runId: RunId,
  decision: z.enum(["approve", "reject"]),
  actor: z.string().min(1),
  timestamp: z.string().datetime(),
});
export type ApprovalDecision = z.infer<typeof ApprovalDecision>;

// ── Simulated Action ────────────────────────────────────────────────

export const SimulatedAction = z.object({
  actionType: z.literal("simulated_payout"),
  claimId: ClaimId,
  runId: RunId,
  recommendationId: RecommendationId,
  amount: z.number().min(0),
  executedAt: z.string().datetime(),
});
export type SimulatedAction = z.infer<typeof SimulatedAction>;

// ── Budget ──────────────────────────────────────────────────────────

export const BudgetAccount = z.object({
  budgetId: z.string().min(1),
  runId: RunId,
  ceilingUsd: z.number().positive(),
  remainingUsd: z.number().min(0),
  spentUsd: z.number().min(0),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type BudgetAccount = z.infer<typeof BudgetAccount>;

export const UsageRecord = z.object({
  attemptId: AttemptId,
  runId: RunId,
  modelId: z.string().min(1),
  inputTokens: z.number().int().min(0),
  outputTokens: z.number().int().min(0),
  costUsd: z.number().min(0),
  recordedAt: z.string().datetime(),
});
export type UsageRecord = z.infer<typeof UsageRecord>;

// ── Run Snapshot ────────────────────────────────────────────────────

export const RunSnapshot = z.object({
  snapshotId: z.string().min(1),
  claimId: ClaimId,
  runId: RunId,
  snapshotVersion: z.number().int().min(0),
  nodePointer: z.string().min(1),
  attemptCount: z.number().int().min(0),
  budgetRemainingUsd: z.number().min(0),
  extractionResult: ExtractionResult.optional(),
  investigationResult: InvestigationResult.optional(),
  reviewResult: ReviewResult.optional(),
  recommendation: Recommendation.optional(),
  createdAt: z.string().datetime(),
});
export type RunSnapshot = z.infer<typeof RunSnapshot>;

// ── Run Event ───────────────────────────────────────────────────────

export const RunEvent = z.object({
  eventId: z.string().min(1),
  runId: RunId,
  claimId: ClaimId,
  stateTransition: z.string().min(1),
  fromState: z.string().optional(),
  toState: z.string().min(1),
  metadata: z.record(z.unknown()).optional(),
  timestamp: z.string().datetime(),
});
export type RunEvent = z.infer<typeof RunEvent>;

// ── Replay Record ───────────────────────────────────────────────────

export const ReplayRecord = z.object({
  replayRunId: RunId,
  sourceRunId: RunId,
  sourceSnapshotId: z.string().min(1),
  terminalStateMatch: z.boolean(),
  createdAt: z.string().datetime(),
});
export type ReplayRecord = z.infer<typeof ReplayRecord>;
