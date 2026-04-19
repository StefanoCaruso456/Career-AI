import { employmentVerificationHandler } from "./employment-verification.js";
import { offerLetterHandler } from "./offer-letter.js";
import type { ClaimTypeHandler } from "./types.js";

/**
 * Registry of supported claim types.
 *
 * Each handler implements the ClaimTypeHandler interface. To add a new
 * type (employment-verification, education, transcript, ...):
 *
 *   1. Create src/claim-types/<kind>.ts exporting a handler
 *   2. Add the entry here
 *   3. Register a route in routes/claims.ts
 *
 * That is the full surface area. The generic orchestrator, tampering
 * detector, DB schema, and badge issuance all work untouched.
 */
const handlers: ClaimTypeHandler<unknown>[] = [
  offerLetterHandler as ClaimTypeHandler<unknown>,
  employmentVerificationHandler as ClaimTypeHandler<unknown>,
  // educationHandler,
  // transcriptHandler,
];

const byKind: Record<string, ClaimTypeHandler<unknown>> = Object.fromEntries(
  handlers.map((h) => [h.kind, h]),
);

export function getClaimTypeHandler(kind: string): ClaimTypeHandler<unknown> | undefined {
  return byKind[kind];
}

export function listClaimTypes(): string[] {
  return handlers.map((h) => h.kind);
}
