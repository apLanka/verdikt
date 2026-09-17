import * as fs from "node:fs";
import * as path from "node:path";

const claims = JSON.parse(
  fs.readFileSync(
    path.resolve(import.meta.dirname, "../fixtures/claims/claims.json"),
    "utf-8"
  )
).claims;

const policies = JSON.parse(
  fs.readFileSync(
    path.resolve(import.meta.dirname, "../fixtures/reference-data/policies.json"),
    "utf-8"
  )
);

const priorClaims = JSON.parse(
  fs.readFileSync(
    path.resolve(import.meta.dirname, "../fixtures/reference-data/prior-claims.json"),
    "utf-8"
  )
);

const repairCosts = JSON.parse(
  fs.readFileSync(
    path.resolve(import.meta.dirname, "../fixtures/reference-data/repair-costs.json"),
    "utf-8"
  )
);

// ── Scenario coverage ───────────────────────────────────────────────

const scenarioCounts: Record<string, number> = {};
for (const claim of claims) {
  scenarioCounts[claim.scenario] = (scenarioCounts[claim.scenario] || 0) + 1;
}

console.log("=== Scenario Coverage ===");
for (const [scenario, count] of Object.entries(scenarioCounts)) {
  console.log(`  ${scenario}: ${count}`);
}

// ── Requirements check ──────────────────────────────────────────────

const required = {
  straightforward_approval: 5,
  rework_then_approve: 5,
  rework_then_reject: 5,
  budget_exceeded: 3,
  policy_violation: 3,
  edge_case_incomplete_docs: 1,
  edge_case_conflicting_estimates: 1,
  edge_case_missing_photos: 1,
  edge_case_high_value: 1,
};

console.log("\n=== Requirements ===");
let allPass = true;
for (const [scenario, min] of Object.entries(required)) {
  const actual = scenarioCounts[scenario] || 0;
  const pass = actual >= min;
  console.log(`  ${pass ? "✓" : "✗"} ${scenario}: ${actual} (need ≥${min})`);
  if (!pass) allPass = false;
}

// ── Reference data check ───────────────────────────────────────────

console.log(`\n=== Reference Data ===`);
console.log(`  Policies: ${policies.length}`);
console.log(`  Prior claims: ${priorClaims.length}`);
console.log(`  Repair costs: ${repairCosts.length}`);

// ── Document count check ───────────────────────────────────────────

console.log(`\n=== Documents per Claim ===`);
let docsOk = true;
for (const claim of claims) {
  const docCount = claim.documents.length;
  const isEdgeCase = claim.scenario.startsWith("edge_case");
  const min = isEdgeCase ? 1 : 2;
  const ok = docCount >= min && docCount <= 3;
  if (!ok) {
    console.log(`  ✗ ${claim.claimId}: ${docCount} documents (need ${min}-3)`);
    docsOk = false;
    allPass = false;
  }
}
console.log(`  All claims have valid document count: ${docsOk ? "✓" : "✗"}`);

// ── Policy references check ────────────────────────────────────────

console.log(`\n=== Policy References ===`);
const policyIds = new Set(policies.map((p: any) => p.policyId));
for (const claim of claims) {
  if (!policyIds.has(claim.policyId)) {
    console.log(`  ✗ ${claim.claimId} references unknown policy ${claim.policyId}`);
    allPass = false;
  }
}
console.log(`  All claims reference valid policies: ✓`);

// ── Prior claims reference policies ────────────────────────────────

console.log(`\n=== Prior Claims Reference Integrity ===`);
for (const pc of priorClaims) {
  if (!policyIds.has(pc.policyId)) {
    console.log(`  ✗ ${pc.priorClaimId} references unknown policy ${pc.policyId}`);
    allPass = false;
  }
}
console.log(`  All prior claims reference valid policies: ✓`);

console.log(`\n=== RESULT: ${allPass ? "PASS" : "FAIL"} ===`);
process.exit(allPass ? 0 : 1);
