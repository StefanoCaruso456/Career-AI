/**
 * Typed verification-error surface used by the orchestrator and route
 * handlers. The full per-type verification flow lives in
 * orchestrators/submit-claim.ts, dispatched through claim-types/registry.ts.
 */

import { buildContentExtractor } from "./verifiers/content.js";
import { listClaimTypes } from "../claim-types/registry.js";

export class VerificationError extends Error {
  constructor(
    public code: "EXTRACTION_UNAVAILABLE" | "INVALID_REQUEST",
    message: string,
  ) {
    super(message);
    this.name = "VerificationError";
  }
}

const contentExtractor = buildContentExtractor();

export function getVerifierInfo(): {
  name: string;
  extractor: string;
  types: string[];
} {
  return {
    name: "api-gateway-verifier",
    extractor: contentExtractor.name,
    types: listClaimTypes(),
  };
}
