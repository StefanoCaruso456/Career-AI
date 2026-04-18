/**
 * ExtractionResult — the structured shape that pdf-extractor returns.
 *
 * This is the contract the service exposes to downstream consumers
 * (document-verifier today, plus future services like contract-verifier,
 * resume-parser, background-check).
 *
 * Design principles:
 * - Extractor is business-logic-free. It reports what it SEES, not what it
 *   MEANS. Interpretation ("this is a DocuSign offer letter from Apple")
 *   lives in the consuming service.
 * - The result shape is stable across documents. Fields are undefined when
 *   absent, never omitted. This lets consumers safely destructure.
 * - No PII is filtered out at this layer — callers are trusted not to
 *   persist raw extraction results. The verify-and-forget rule applies
 *   one layer up, in document-verifier and its DB writes.
 * - Every extractor runs independently. A failure in one (e.g., corrupt
 *   XMP) does not prevent the others from reporting. Non-fatal errors
 *   are collected in `errors`.
 */

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

export interface DocuSignMarkers {
  variant: "with-coc" | "envelope-stamp-only" | "none";
  envelopeId?: string;
  envelopeIdSource?: "acroform" | "text" | "xmp";
  hasCocHeading: boolean;
  hasEnvelopeText: boolean;
  hasXmpDocusignNamespace: boolean;
  hasAdobePPKMSFilter: boolean;
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

export interface ExtractionResult {
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
