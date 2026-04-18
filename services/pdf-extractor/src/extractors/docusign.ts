import type {
  AcroFormExtraction,
  DocuSignMarkers,
  SignatureDictInfo,
  TextExtraction,
  XmpMetadata,
} from "../types.js";

/**
 * Derives DocuSign-specific markers from already-extracted text, metadata,
 * AcroForm fields, signature dictionaries, and XMP.
 *
 * Priority order for envelope ID resolution:
 *   1. AcroForm field named ENVELOPEID_<hex>  (most reliable — structured)
 *   2. Per-page "Docusign Envelope ID: <uuid>" watermark text (regex)
 *   3. XMP <DocuSign:TrackingInformation> envelope ID (when present)
 *
 * This extractor does NOT make trust claims. It reports what markers exist;
 * verdict logic lives in the consuming service (document-verifier).
 */

const CERT_HEADING = /certificate of completion/i;
const ENVELOPE_TEXT = /(?:docu\s*sign\s*)?envelope\s*id/i;
const ENVELOPE_ID_IN_TEXT = /(?:docu\s*sign\s*)?envelope\s*id\s*[:\-]?\s*([0-9A-Fa-f-]{20,})/i;
const XMP_ENVELOPE_ID = /<EnvelopeID>\s*([0-9A-Fa-f-]{20,})\s*<\/EnvelopeID>/i;

export interface DocuSignExtractorInputs {
  text: TextExtraction;
  acroForm: AcroFormExtraction;
  signatures: SignatureDictInfo[];
  xmp?: XmpMetadata;
}

export function extractDocuSignMarkers(inputs: DocuSignExtractorInputs): DocuSignMarkers {
  const hasCocHeading = CERT_HEADING.test(inputs.text.content);
  const hasEnvelopeText = ENVELOPE_TEXT.test(inputs.text.content);
  const hasXmpDocusignNamespace = inputs.xmp?.hasDocuSignNamespace === true;
  const hasAdobePPKMSFilter = inputs.signatures.some((s) => s.filter === "/Adobe.PPKMS");

  let envelopeId: string | undefined;
  let envelopeIdSource: DocuSignMarkers["envelopeIdSource"];

  // 1. AcroForm (most reliable)
  if (inputs.acroForm.envelopeIdFieldName) {
    const match = inputs.acroForm.envelopeIdFieldName.match(/ENVELOPEID_([0-9A-Fa-f]{32,})/i);
    if (match) {
      envelopeId = formatEnvelopeId(match[1]);
      envelopeIdSource = "acroform";
    }
  }

  // 2. Fall back to page text
  if (!envelopeId) {
    const textMatch = inputs.text.content.match(ENVELOPE_ID_IN_TEXT);
    if (textMatch) {
      envelopeId = textMatch[1];
      envelopeIdSource = "text";
    }
  }

  // 3. Fall back to XMP
  if (!envelopeId && inputs.xmp?.rawSnippet) {
    const xmpMatch = inputs.xmp.rawSnippet.match(XMP_ENVELOPE_ID);
    if (xmpMatch) {
      envelopeId = xmpMatch[1];
      envelopeIdSource = "xmp";
    }
  }

  const variant: DocuSignMarkers["variant"] = hasCocHeading
    ? "with-coc"
    : envelopeId || hasEnvelopeText || hasAdobePPKMSFilter
      ? "envelope-stamp-only"
      : "none";

  return {
    variant,
    envelopeId,
    envelopeIdSource,
    hasCocHeading,
    hasEnvelopeText,
    hasXmpDocusignNamespace,
    hasAdobePPKMSFilter,
  };
}

/**
 * AcroForm field names store the envelope ID without dashes
 * (e.g. ENVELOPEID_E87DEEF8C6ED469D80537DCE7788FE5A). Reinsert dashes
 * at the standard 8-4-4-4-12 UUID positions to match the on-page format.
 */
function formatEnvelopeId(raw: string): string {
  const hex = raw.toUpperCase();
  if (hex.length !== 32) return hex;
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
