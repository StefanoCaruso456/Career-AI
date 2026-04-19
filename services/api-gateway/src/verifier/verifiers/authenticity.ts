import type { ExtractionResult } from "../clients/pdf-extractor.js";
import type { AuthenticitySignal } from "../types.js";

/**
 * What the caller asserts the signing domain should be. Decoupled from the
 * employment claim shape so education / transcript / employment-verification
 * types can each supply their own expectation (employer, institution, etc.).
 */
export interface AuthenticityExpectation {
  expectedDomain: string | null;
  expectedDomainLabel: string;
}

/**
 * Determines how much the document looks like it came from the claimed
 * employer based on the extraction result.
 *
 * Outcomes:
 *
 * - **docusign + sender domain match** — a Certificate of Completion is
 *   present (variant `with-coc`) AND the sender or signer email domain
 *   matches the claimed employer. Strongest signal this service can make,
 *   though it caps at REVIEWED in verdict.ts because CoC text is not
 *   cryptographically protected.
 *
 * - **docusign envelope-stamp-only** — DocuSign markers present (envelope
 *   ID, AcroForm field, PPKMS filter) but no CoC page, so we have no
 *   sender data at all. We know the document went through DocuSign's
 *   pipeline but we cannot verify who sent it.
 *
 * - **pkcs7-embedded** — a non-DocuSign signature dictionary is present.
 *   Future PKCS#7 verifier will confirm the signer cert identity.
 *
 * - **unsigned** — no signed-PDF structure at all.
 *
 * CoC parsing itself (extracting sender email from "Envelope Originator"
 * section text) is done here rather than in pdf-extractor because it's
 * interpretation, not raw extraction. The extractor reports that a CoC
 * heading exists; we decide what to do with it.
 */
export function checkAuthenticity(
  extraction: ExtractionResult,
  expectation: AuthenticityExpectation,
  cocExtraction?: ExtractionResult,
): AuthenticitySignal {
  const ds = extraction.docusignMarkers;
  const { expectedDomain, expectedDomainLabel } = expectation;

  // Decide where to pull CoC text from, in priority order:
  // 1. A separate CoC PDF uploaded alongside the document (variant C)
  // 2. The document itself, if it contains a CoC heading (variant A)
  // 3. Neither — return envelope-stamp-only or unsigned
  const cocTextSource =
    cocExtraction && cocExtraction.docusignMarkers.hasCocHeading
      ? cocExtraction.text.content
      : ds.variant === "with-coc"
        ? extraction.text.content
        : undefined;

  if (cocTextSource) {
    const coc = parseCertificateOfCompletion(cocTextSource);
    const matchingDomain = expectedDomain
      ? domainMatches(expectedDomain, coc.senderDomain, coc.signerDomains)
      : null;
    const envelopeIdMatches =
      cocExtraction && ds.envelopeId && cocExtraction.docusignMarkers.envelopeId
        ? normalizeEnvelopeId(ds.envelopeId) ===
          normalizeEnvelopeId(cocExtraction.docusignMarkers.envelopeId)
        : undefined;
    const sourceLabel = cocExtraction ? "separate CoC file" : "inline CoC page";

    return {
      source: "docusign",
      envelopeId: ds.envelopeId ?? coc.envelopeId,
      senderEmail: coc.senderEmail,
      senderDomain: coc.senderDomain,
      senderName: coc.senderName,
      signerDomains: coc.signerDomains,
      completedAt: coc.completedAt,
      matchesClaim: Boolean(matchingDomain),
      reason: matchingDomain
        ? `DocuSign CoC "Envelope Originator" domain ${matchingDomain} matches ${expectedDomainLabel} (via ${sourceLabel}${envelopeIdMatches ? ", envelope ID cross-reference verified" : ""}). Note: CoC text is application-level metadata, not cryptographically attested by the PDF signature. Treat as evidence, not proof.`
        : expectedDomain
          ? `No domain in the DocuSign CoC (${[coc.senderDomain, ...(coc.signerDomains ?? [])].filter(Boolean).join(", ") || "none"}) matches ${expectedDomainLabel} (via ${sourceLabel}).`
          : `DocuSign CoC parsed (sender ${coc.senderDomain ?? "unknown"}) but this claim type does not check a specific domain.`,
    };
  }

  if (ds.variant === "envelope-stamp-only") {
    return {
      source: "docusign",
      envelopeId: ds.envelopeId,
      matchesClaim: false,
      reason: `DocuSign envelope markers detected (envelopeId ${ds.envelopeId ?? "unknown"}, source: ${ds.envelopeIdSource}) but no Certificate of Completion page is present, so we cannot verify the sender from this file alone. Upload the Certificate of Completion separately to strengthen the signal.`,
    };
  }

  if (extraction.signatures.length > 0) {
    const sig = extraction.signatures[0];
    return {
      source: "pkcs7-embedded",
      matchesClaim: false,
      reason: `PDF has a ${sig.filter ?? "unknown"} signature dictionary (subfilter ${sig.subFilter ?? "unknown"}). This is a non-DocuSign signed PDF. Sender identity cannot be verified until the pdf-signature-verifier package is built and the signer cert can be cryptographically validated against AATL roots.`,
    };
  }

  return {
    source: "unsigned",
    matchesClaim: false,
    reason: "No DocuSign envelope markers or embedded signature detected. Authenticity unverified.",
  };
}

// ---------------------------------------------------------------------------
// Certificate of Completion parser
//
// Real DocuSign CoCs use "Envelope Originator" as the sender section header,
// not "Sender". Example from the Sunnova Summary.pdf fixture:
//
//   Envelope Originator:
//   Sunnova Customer Service
//   customerservice@sunnova.com
//   20 Greenway Plz Suite 540 Houston, TX 77046
//   IP Address: 20.25.131.193
//
// Signer section uses "Signer Events" as the header. Each signer has their
// name, email, and signing timestamps.
// ---------------------------------------------------------------------------

interface ParsedCoc {
  envelopeId?: string;
  senderName?: string;
  senderEmail?: string;
  senderDomain?: string;
  signerEmails?: string[];
  signerDomains?: string[];
  completedAt?: string;
}

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const ORIGINATOR_START = /envelope\s*originator/i;
const ORIGINATOR_END = /(signer\s*events|in\s*person\s*signer|certified\s*delivery|carbon\s*copy|witness|notary|ip\s*address|holder|record\s*tracking)/i;
const SIGNER_EVENTS = /signer\s*events/i;
const COMPLETED = /completed\s*[:\-]?\s*([^\n]+)/i;

export function parseCertificateOfCompletion(text: string): ParsedCoc {
  const result: ParsedCoc = {};

  const envelopeMatch = text.match(/envelope\s*id\s*[:\-]?\s*([0-9A-Fa-f-]{20,})/i);
  if (envelopeMatch) result.envelopeId = envelopeMatch[1];

  // Envelope Originator section
  const originatorStart = text.search(ORIGINATOR_START);
  if (originatorStart >= 0) {
    const rest = text.slice(originatorStart);
    const endIdx = rest.search(ORIGINATOR_END);
    const section = endIdx > 0 ? rest.slice(0, endIdx + 1) : rest.slice(0, 500);

    const senderEmail = section.match(EMAIL_RE)?.[0];
    if (senderEmail) {
      result.senderEmail = senderEmail;
      result.senderDomain = domainOf(senderEmail);
    }

    // Sender name is the first non-empty line after "Envelope Originator:"
    const nameMatch = section.match(/envelope\s*originator\s*[:\-]?\s*([A-Za-z][A-Za-z .'&,-]{1,120})/i);
    if (nameMatch) result.senderName = nameMatch[1].trim();
  }

  // Signers — walk the Signer Events section for all emails
  const signerEventsStart = text.search(SIGNER_EVENTS);
  if (signerEventsStart >= 0) {
    const section = text.slice(signerEventsStart);
    const signerEmails = Array.from(section.matchAll(EMAIL_RE), (m) => m[0]);
    const uniqueSignerEmails = Array.from(new Set(signerEmails.filter((e) => e !== result.senderEmail)));
    if (uniqueSignerEmails.length > 0) {
      result.signerEmails = uniqueSignerEmails;
      result.signerDomains = Array.from(
        new Set(uniqueSignerEmails.map(domainOf).filter((d): d is string => Boolean(d))),
      );
    }
  }

  const completed = text.match(COMPLETED);
  if (completed) result.completedAt = completed[1].trim();

  return result;
}

function normalizeEnvelopeId(id: string): string {
  return id.toUpperCase().replace(/-/g, "");
}

function domainOf(email: string): string | undefined {
  const at = email.indexOf("@");
  if (at < 0 || at === email.length - 1) return undefined;
  return email.slice(at + 1).toLowerCase();
}

export function guessEmployerDomain(employer: string): string {
  const stripped = employer
    .toLowerCase()
    .replace(/\b(inc\.?|incorporated|llc|l\.l\.c\.|corp\.?|corporation|ltd\.?|limited|gmbh|co\.?|company)\b/gi, "")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
  return `${stripped}.com`;
}

function domainMatches(
  expected: string,
  senderDomain?: string,
  signerDomains?: string[],
): string | null {
  const candidates = [senderDomain, ...(signerDomains ?? [])].filter((d): d is string => Boolean(d));
  for (const d of candidates) {
    if (d === expected || d.endsWith(`.${expected}`) || expected.endsWith(`.${d}`)) {
      return d;
    }
  }
  return null;
}
