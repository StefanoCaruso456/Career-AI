/**
 * Typed HTTP client for the pdf-extractor service.
 *
 * document-verifier uploads the PDF bytes to pdf-extractor on the hot path
 * of every /v1/verify request. The extractor does the heavy PDF parsing
 * (text, metadata, signature dicts, XMP, AcroForm, DocuSign markers) and
 * returns a structured ExtractionResult that the verifiers interpret.
 *
 * This client is the ONLY place document-verifier imports extraction
 * shapes from the sibling service. If pdf-extractor's response shape
 * changes, update the interfaces here and propagate into verifiers/.
 */

const BASE_URL = process.env.PDF_EXTRACTOR_URL ?? "http://localhost:8788";

export interface TextExtraction {
  content: string;
  pageCount: number;
  length: number;
}

export interface InfoMetadata {
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string;
  creator?: string;
  producer?: string;
  creationDate?: string;
  modDate?: string;
}

export interface XmpMetadata {
  producer?: string;
  hasDocuSignNamespace: boolean;
  rawSnippet?: string;
}

export interface AcroFormField {
  name: string;
  type?: string;
  value?: string;
}

export interface AcroFormExtraction {
  fieldCount: number;
  fields: AcroFormField[];
  envelopeIdFieldName?: string;
}

export interface SignatureDictInfo {
  filter?: string;
  subFilter?: string;
  reason?: string;
  location?: string;
  contactInfo?: string;
  name?: string;
  signingTime?: string;
  byteRangePresent: boolean;
}

export interface SignatureValidation {
  index: number;
  digestValid: boolean;
  signatureValid: boolean;
  cryptographicallyValid: boolean;
  digestAlgorithm?: string;
  signatureAlgorithm?: string;
  cmsSigningTime?: string;
  signerSubjectDN?: string;
  signerIssuerDN?: string;
  byteRangeCoversWholeFile: boolean;
  errors: string[];
}

export interface SignatureVerification {
  ran: boolean;
  allValid: boolean;
  results: SignatureValidation[];
  errors: string[];
}

export interface DocuSignMarkers {
  variant: "with-coc" | "envelope-stamp-only" | "none";
  envelopeId?: string;
  envelopeIdSource?: "acroform" | "text" | "xmp";
  hasCocHeading: boolean;
  hasEnvelopeText: boolean;
  hasXmpDocusignNamespace: boolean;
  hasAdobePPKMSFilter: boolean;
}

export interface ExtractionResult {
  service?: string;
  fileHash: string;
  fileSize: number;
  text: TextExtraction;
  info: InfoMetadata;
  xmp?: XmpMetadata;
  acroForm: AcroFormExtraction;
  signatures: SignatureDictInfo[];
  signatureVerification: SignatureVerification;
  docusignMarkers: DocuSignMarkers;
  errors: string[];
}

export async function extractDocument(
  file: Uint8Array,
  filename: string,
): Promise<ExtractionResult> {
  const form = new FormData();
  form.append("file", new Blob([file], { type: "application/pdf" }), filename);

  const res = await fetch(`${BASE_URL}/v1/extract`, {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`pdf-extractor returned ${res.status}: ${text.slice(0, 500)}`);
  }

  return (await res.json()) as ExtractionResult;
}

export async function checkPdfExtractorHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/v1/health`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}
