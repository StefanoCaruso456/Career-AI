/**
 * Document verification logic, collapsed from the former document-verifier
 * service into api-gateway as an in-process module.
 *
 * Exports verifyDocument(), which takes a PDF buffer (+ optional certificate
 * buffer) and an employment claim and returns a structured verdict. Still
 * calls pdf-extractor over HTTP — that service stays separate for trust-
 * boundary reasons (it parses untrusted PDF binaries).
 */

import { extractDocument } from "./clients/pdf-extractor.js";
import { detectTampering } from "./verifiers/tampering.js";
import { checkAuthenticity } from "./verifiers/authenticity.js";
import { buildContentExtractor } from "./verifiers/content.js";
import { computeVerdict } from "./verifiers/verdict.js";
import type { EmploymentClaim, VerifyResponse } from "./types.js";

const VERSION = "0.1.0";
const VERIFIER_NAME = `api-gateway-verifier@${VERSION}`;

// Constructed once at module load, reused across requests.
const contentExtractor = buildContentExtractor();

export interface VerifyDocumentInput {
  file: Uint8Array;
  filename: string;
  claim: EmploymentClaim;
  certificateFile?: Uint8Array;
  certificateFilename?: string;
}

export class VerificationError extends Error {
  constructor(
    public code: "EXTRACTION_UNAVAILABLE" | "INVALID_REQUEST",
    message: string,
  ) {
    super(message);
    this.name = "VerificationError";
  }
}

export async function verifyDocument(
  input: VerifyDocumentInput,
): Promise<VerifyResponse> {
  if (input.file.byteLength === 0) {
    throw new VerificationError("INVALID_REQUEST", "Uploaded file is empty.");
  }

  let docExtraction;
  try {
    docExtraction = await extractDocument(input.file, input.filename || "upload.pdf");
  } catch (err) {
    throw new VerificationError(
      "EXTRACTION_UNAVAILABLE",
      `pdf-extractor call failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  let cocExtraction: Awaited<ReturnType<typeof extractDocument>> | undefined;
  if (input.certificateFile && input.certificateFile.byteLength > 0) {
    try {
      cocExtraction = await extractDocument(
        input.certificateFile,
        input.certificateFilename || "certificate.pdf",
      );
    } catch (err) {
      throw new VerificationError(
        "EXTRACTION_UNAVAILABLE",
        `pdf-extractor call failed on certificate: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  const tampering = detectTampering(docExtraction, cocExtraction);
  const authenticity = checkAuthenticity(docExtraction, input.claim, cocExtraction);
  const content = await contentExtractor.extractEmployment(docExtraction.text.content, input.claim);
  const { verdict, confidenceTier } = computeVerdict(tampering, authenticity, content);

  return {
    verdict,
    confidenceTier,
    signals: { tampering, authenticity, content },
    provenance: {
      fileHash: docExtraction.fileHash,
      certificateFileHash: cocExtraction?.fileHash,
      verifiedAt: new Date().toISOString(),
      verifier: VERIFIER_NAME,
    },
  };
}

export function getVerifierInfo(): { name: string; extractor: string } {
  return { name: VERIFIER_NAME, extractor: contentExtractor.name };
}
