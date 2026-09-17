import { zodToJsonSchema } from "zod-to-json-schema";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  AgentEnvelope,
  ExtractionResult,
  InvestigationResult,
  ReviewResult,
  Recommendation,
  ApprovalDecision,
  RunSnapshot,
  RunEvent,
} from "../src/schemas.js";

const schemas = {
  "agent-envelope": AgentEnvelope,
  "extraction-result": ExtractionResult,
  "investigation-result": InvestigationResult,
  "review-result": ReviewResult,
  recommendation: Recommendation,
  "approval-decision": ApprovalDecision,
  "run-snapshot": RunSnapshot,
  "run-event": RunEvent,
} as const;

const outDir = path.resolve(import.meta.dirname, "../schemas");
fs.mkdirSync(outDir, { recursive: true });

for (const [name, schema] of Object.entries(schemas)) {
  const jsonSchema = zodToJsonSchema(schema, {
    name,
    $refStrategy: "none",
  });
  const outPath = path.join(outDir, `${name}.json`);
  fs.writeFileSync(outPath, JSON.stringify(jsonSchema, null, 2) + "\n");
  console.log(`  wrote ${outPath}`);
}

console.log(`Generated ${Object.keys(schemas).length} JSON schemas.`);
