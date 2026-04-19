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
  ClaimVerificationEntry,
  OfferLetterVerificationEntry,
} from "./types";
import type {
  EmploymentClaim,
  ClaimVerificationResult,
  VerificationOutcome,
} from "./types";

export type ClaimKind =
  | "offer-letter"
  | "employment-verification"
  | "education"
  | "transcript";

export interface VerifyClaimInput {
  /**
   * Which gateway claim-type handler to target. Each kind maps to its own
   * /v1/claims/<kind> route. The shape of `claim` depends on `kind`.
   */
  kind: ClaimKind;
  file: Uint8Array;
  filename: string;
  /**
   * Claim payload. Shape is decided by the chosen `kind` — see the
   * corresponding handler module in services/api-gateway/src/claim-types/
   * for the schema the gateway will zod-validate against.
   */
  claim: unknown;
  actorDid: string;
}

export interface VerifyEmploymentClaimInput {
  file: Uint8Array;
  filename: string;
  claim: EmploymentClaim;
  actorDid: string;
}

/**
 * Build the actor DID the gateway expects for an authenticated Career-AI
 * user. Emails can contain `@`, `.`, and `+`, which are not in the
 * DID-core `idchar` set, so we percent-encode into a single method-specific
 * segment. Anonymous sessions get a stable sentinel DID so the gateway's
 * header validation still passes (the row just won't resolve to a real
 * user). When identity-service lands this helper goes away — the server
 * derives the DID from a signed session token instead.
 */
export function buildActorDid(email: string | null | undefined): string {
  const subject = email && email.length > 0 ? encodeURIComponent(email) : "anonymous";
  return `did:web:career-ai:users:${subject}`;
}

const DEFAULT_TIMEOUT_MS = 45_000;

export async function verifyClaim(input: VerifyClaimInput): Promise<VerificationOutcome> {
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

  const url = `${baseUrl.replace(/\/$/, "")}/v1/claims/${input.kind}`;

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

/**
 * Offer-letter-specific convenience wrapper. Preserves the pre-registry
 * signature so existing call sites don't need to change at once.
 */
export async function verifyEmploymentClaim(
  input: VerifyEmploymentClaimInput,
): Promise<VerificationOutcome> {
  return verifyClaim({
    kind: "offer-letter",
    file: input.file,
    filename: input.filename,
    claim: input.claim,
    actorDid: input.actorDid,
  });
}
