/**
 * Typed client for api-gateway's /v1/claims/employment endpoint.
 *
 * Career-AI calls this on offer-letter upload to get a verification verdict
 * synchronously. api-gateway handles the full chain: pdf-extractor for raw
 * PDF parsing, in-process verifier for tampering/authenticity/content checks.
 *
 * Error handling is best-effort — if api-gateway is unreachable or errors,
 * the caller should treat verification as "unavailable" rather than failing
 * the save. Saving the evidence must never be blocked by verifier outages.
 */

import "server-only";

export type {
  EmploymentClaim,
  Verdict,
  ConfidenceTier,
  ClaimVerificationResult,
  VerificationOutcome,
  OfferLetterVerificationEntry,
} from "./types";
import type {
  EmploymentClaim,
  ClaimVerificationResult,
  VerificationOutcome,
} from "./types";

export interface VerifyEmploymentClaimInput {
  file: Uint8Array;
  filename: string;
  claim: EmploymentClaim;
  actorDid: string;
}

const DEFAULT_TIMEOUT_MS = 45_000;

export async function verifyEmploymentClaim(
  input: VerifyEmploymentClaimInput,
): Promise<VerificationOutcome> {
  const baseUrl = process.env.API_GATEWAY_URL;
  const secret = process.env.GATEWAY_SHARED_SECRET;

  if (!baseUrl || !secret) {
    return {
      ok: false,
      reason: "UNCONFIGURED",
      detail: "API_GATEWAY_URL or GATEWAY_SHARED_SECRET not set; skipping verification.",
    };
  }

  const form = new FormData();
  // Cast Uint8Array to BlobPart — strict TS rejects the bare Uint8Array because
  // its underlying buffer is ArrayBufferLike (could be SharedArrayBuffer), but
  // at runtime this is always a plain ArrayBuffer here.
  form.append(
    "file",
    new Blob([input.file as unknown as BlobPart], { type: "application/pdf" }),
    input.filename || "upload.pdf",
  );
  form.append("claim", JSON.stringify(input.claim));

  const url = `${baseUrl.replace(/\/$/, "")}/v1/claims/employment`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "x-actor-did": input.actorDid,
      },
      body: form,
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return {
        ok: false,
        reason: "GATEWAY_ERROR",
        detail: `api-gateway responded ${res.status}: ${text.slice(0, 500)}`,
      };
    }

    const body = (await res.json()) as ClaimVerificationResult;
    return { ok: true, result: body };
  } catch (err) {
    return {
      ok: false,
      reason: "UNAVAILABLE",
      detail: `api-gateway request failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
