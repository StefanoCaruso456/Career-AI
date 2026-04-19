import { verifyPdfSignatures } from "@career-ledger/pdf-signature-verifier";
import { sha256Prefixed } from "../hash.js";
import type { ExtractionResult, SignatureVerification } from "../types.js";
import { extractPdfText } from "./text.js";
import { extractPdfMetadata } from "./metadata.js";
import { extractDocuSignMarkers } from "./docusign.js";

/**
 * Run every extractor against a PDF and return a combined ExtractionResult.
 *
 * Each extractor is best-effort: if one fails, we record the error and
 * continue. That way a caller gets partial data instead of a 500 when
 * a PDF has, say, a corrupt XMP stream but valid text.
 */
export async function extractPdf(bytes: Uint8Array): Promise<ExtractionResult> {
  const errors: string[] = [];
  const fileHash = sha256Prefixed(bytes);
  const fileSize = bytes.byteLength;

  // unpdf/pdf.js transfers ownership of the underlying ArrayBuffer, which
  // detaches it and breaks any subsequent reader. Give each extractor its
  // own independent copy so they can run in any order.
  const textBytes = new Uint8Array(bytes);
  const metadataBytes = new Uint8Array(bytes);
  const sigBytes = new Uint8Array(bytes);

  let text;
  try {
    text = await extractPdfText(textBytes);
  } catch (err) {
    errors.push(`text: ${err instanceof Error ? err.message : String(err)}`);
    text = { content: "", pageCount: 0, length: 0 };
  }

  const metadata = await extractPdfMetadata(metadataBytes, errors);

  // Cryptographic signature verification runs over the raw PDF bytes.
  // Best-effort: failures here do NOT prevent the other extractions from
  // returning. We only run the verifier if the metadata extractor found
  // at least one signature dictionary — no point running crypto over an
  // unsigned PDF.
  const signatureVerification: SignatureVerification = {
    ran: false,
    allValid: false,
    results: [],
    errors: [],
  };
  if (metadata.signatures.length > 0) {
    try {
      const outcome = await verifyPdfSignatures(sigBytes);
      signatureVerification.ran = true;
      signatureVerification.allValid = outcome.allValid;
      signatureVerification.errors = outcome.errors;
      signatureVerification.results = outcome.signatures.map((s) => ({
        index: s.index,
        digestValid: s.digestValid,
        signatureValid: s.signatureValid,
        cryptographicallyValid: s.cryptographicallyValid,
        digestAlgorithm: s.digestAlgorithm,
        signatureAlgorithm: s.signatureAlgorithm,
        cmsSigningTime: s.cmsSigningTime,
        signerSubjectDN: s.signerSubjectDN,
        signerIssuerDN: s.signerIssuerDN,
        byteRangeCoversWholeFile: s.byteRangeCoversWholeFile,
        errors: s.errors,
      }));
    } catch (err) {
      errors.push(`signature-verify: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const docusignMarkers = extractDocuSignMarkers({
    text,
    acroForm: metadata.acroForm,
    signatures: metadata.signatures,
    xmp: metadata.xmp,
  });

  return {
    fileHash,
    fileSize,
    text,
    info: metadata.info,
    xmp: metadata.xmp,
    acroForm: metadata.acroForm,
    signatures: metadata.signatures,
    signatureVerification,
    docusignMarkers,
    errors,
  };
}
