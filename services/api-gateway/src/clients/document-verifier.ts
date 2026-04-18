/**
 * Typed client for the document-verifier service.
 *
 * The gateway is the ONLY thing that talks to document-verifier. Career-AI
 * never gets this URL. That's the whole point of the gateway pattern:
 * internal service topology stays hidden.
 */

import type { EmploymentClaim } from "../types.js";

const BASE_URL = process.env.DOCUMENT_VERIFIER_URL ?? "http://localhost:8787";

export interface DocumentVerifierResponse {
  verdict: "VERIFIED" | "PARTIAL" | "FAILED";
  confidenceTier:
    | "SELF_REPORTED"
    | "EVIDENCE_SUBMITTED"
    | "REVIEWED"
    | "SOURCE_CONFIRMED"
    | "MULTI_SOURCE_CONFIRMED";
  signals: {
    tampering: {
      detected: boolean;
      method: string;
      details?: Record<string, unknown>;
    };
    authenticity: {
      source: "docusign" | "pkcs7-embedded" | "unsigned";
      envelopeId?: string;
      senderEmail?: string;
      senderDomain?: string;
      senderName?: string;
      signerDomains?: string[];
      completedAt?: string;
      matchesClaim: boolean;
      reason?: string;
    };
    content: {
      employer: string | null;
      role: string | null;
      startDate: string | null;
      endDate: string | null;
      extractor: string;
      matchesClaim: boolean;
      mismatches?: string[];
    };
  };
  provenance: {
    fileHash: string;
    verifiedAt: string;
    verifier: string;
  };
}

export interface VerifyDocumentInput {
  file: Uint8Array;
  filename: string;
  claim: EmploymentClaim;
  certificateFile?: Uint8Array;
  certificateFilename?: string;
}

export async function verifyDocument(
  input: VerifyDocumentInput,
): Promise<DocumentVerifierResponse> {
  const form = new FormData();
  form.append("file", new Blob([input.file], { type: "application/pdf" }), input.filename);
  form.append("claim", JSON.stringify(input.claim));
  if (input.certificateFile) {
    form.append(
      "certificate",
      new Blob([input.certificateFile], { type: "application/pdf" }),
      input.certificateFilename ?? "certificate.pdf",
    );
  }

  const res = await fetch(`${BASE_URL}/v1/verify`, {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `document-verifier returned ${res.status}: ${text.slice(0, 500)}`,
    );
  }

  return (await res.json()) as DocumentVerifierResponse;
}

export async function checkDocumentVerifierHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/v1/health`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}
