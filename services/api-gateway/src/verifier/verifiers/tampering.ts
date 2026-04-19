import type { ExtractionResult } from "../clients/pdf-extractor.js";
import type { TamperingSignal } from "../types.js";

/**
 * Detects tampering signals in a PDF.
 *
 * Current implementation runs two structural checks:
 *
 * 1. **Signature presence** — report whether the PDF carries a PKCS#7 signature
 *    dictionary at all. Doesn't verify it cryptographically (that's the job of
 *    the future pdf-signature-verifier), but at least surfaces "this document
 *    has a signature" as a signal.
 *
 * 2. **Structural anomaly** — flag documents that claim DocuSign provenance
 *    via page text but lack the supporting structural evidence (signature dict,
 *    XMP DocuSign namespace, AcroForm ENVELOPEID_ field, or /Adobe.PPKMS
 *    filter). Real DocuSign output always has at least one of these; a PDF
 *    that has the envelope text but none of them was almost certainly
 *    recreated from extracted pages and its signature stripped. This catches
 *    common re-save attacks without cryptographic verification.
 *
 * Future: wire in the pdf-signature-verifier package to perform full PKCS#7 /
 * CAdES validation (ByteRange hash, CMS signature check, chain building,
 * revocation lookup). At that point `detected` will become a real answer,
 * not just a structural hint.
 */
export function detectTampering(
  extraction: ExtractionResult,
  coc?: ExtractionResult,
): TamperingSignal {
  const ds = extraction.docusignMarkers;
  const hasAnyStructure =
    extraction.signatures.length > 0 ||
    ds.hasXmpDocusignNamespace ||
    ds.hasAdobePPKMSFilter ||
    ds.envelopeIdSource === "acroform";

  // STRONGEST SIGNAL: cryptographic signature verification. If the extractor
  // successfully ran PKCS#7 / PAdES validation and ANY signature failed the
  // digest or signature check, the PDF has been modified since signing.
  // This is real crypto — not a heuristic.
  const verification = extraction.signatureVerification;
  if (verification.ran && verification.results.length > 0 && !verification.allValid) {
    const bad = verification.results.find((r) => !r.cryptographicallyValid);
    return {
      detected: true,
      method: "pkcs7-verification",
      details: {
        reason: "Cryptographic PKCS#7 verification failed. At least one signature's digest or signature-value check did not pass — the PDF bytes have been modified since signing.",
        failedSignatureIndex: bad?.index,
        digestValid: bad?.digestValid,
        signatureValid: bad?.signatureValid,
        signerSubjectDN: bad?.signerSubjectDN,
        signatureErrors: bad?.errors,
      },
    };
  }

  // Cross-reference check: if a separate CoC was uploaded alongside the
  // document, its envelope ID MUST match the document's. If they don't,
  // someone is pairing a real CoC with a different document — a strong
  // tampering / fraud signal.
  if (coc) {
    const docId = ds.envelopeId?.toUpperCase().replace(/-/g, "");
    const cocId = coc.docusignMarkers.envelopeId?.toUpperCase().replace(/-/g, "");
    if (docId && cocId && docId !== cocId) {
      return {
        detected: true,
        method: "structural-anomaly",
        details: {
          reason:
            "Document envelope ID does not match the Certificate of Completion envelope ID. The CoC belongs to a different envelope than the document it was uploaded with.",
          documentEnvelopeId: ds.envelopeId,
          certificateEnvelopeId: coc.docusignMarkers.envelopeId,
        },
      };
    }
  }

  // Structural anomaly: page text claims DocuSign but the structure is missing.
  if (ds.hasEnvelopeText && !hasAnyStructure) {
    return {
      detected: true,
      method: "structural-anomaly",
      details: {
        reason:
          "Document contains DocuSign envelope text on the page but has no signature dictionary, no AcroForm ENVELOPEID_ field, no /Adobe.PPKMS filter, and no DocuSign namespace in XMP. Consistent with page extraction + re-save, which strips the cryptographic envelope structure.",
        signatureDictCount: 0,
      },
    };
  }

  // Crypto verification ran and all signatures validated → document is
  // byte-untampered. We report this as the strongest positive signal.
  if (verification.ran && verification.allValid && verification.results.length > 0) {
    const first = verification.results[0];
    return {
      detected: false,
      method: "pkcs7-verification",
      details: {
        reason: "Cryptographic PKCS#7 verification passed. Document bytes are unchanged since signing.",
        signatureCount: verification.results.length,
        digestAlgorithm: first.digestAlgorithm,
        signerSubjectDN: first.signerSubjectDN,
        byteRangeCoversWholeFile: first.byteRangeCoversWholeFile,
        note: first.byteRangeCoversWholeFile
          ? undefined
          : "Signature ByteRange does not cover the entire file — bytes outside the signed range may have been added via incremental update.",
      },
    };
  }

  if (ds.variant === "with-coc") {
    return {
      detected: false,
      method: "docusign-cert-parse",
      details: {
        envelopeIdPresent: Boolean(ds.envelopeId),
        signatureDictCount: extraction.signatures.length,
        hasAdobePPKMSFilter: ds.hasAdobePPKMSFilter,
        note: "CoC parsing only — cryptographic verification did not run (no signatures) or was not conclusive.",
      },
    };
  }

  if (ds.variant === "envelope-stamp-only") {
    return {
      detected: false,
      method: "docusign-cert-parse",
      details: {
        envelopeIdPresent: Boolean(ds.envelopeId),
        envelopeIdSource: ds.envelopeIdSource,
        signatureDictCount: extraction.signatures.length,
        hasAdobePPKMSFilter: ds.hasAdobePPKMSFilter,
        note: "DocuSign envelope detected via page text or AcroForm. Cryptographic verification did not run (no signatures).",
      },
    };
  }

  if (extraction.signatures.length > 0) {
    const sig = extraction.signatures[0];
    return {
      detected: false,
      method: "pdf-signature-dict-present",
      details: {
        signatureDictCount: extraction.signatures.length,
        filter: sig.filter,
        subFilter: sig.subFilter,
        note: "PDF has a signature dictionary but cryptographic verification was inconclusive (e.g. PAdES LTA, encapsulated content, or missing signed attributes). See verification errors.",
      },
    };
  }

  return {
    detected: false,
    method: "none",
    details: { note: "No DocuSign markers or embedded signature detected." },
  };
}
