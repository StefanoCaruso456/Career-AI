export interface EmploymentClaim {
  employer: string;
  role: string;
  startDate: string;
  endDate?: string;
  /**
   * The uploading user's account display name (from their Career-AI session).
   * Used by the content extractor to confirm the document's recipient matches
   * the uploader — i.e., that this is actually THEIR offer letter and not
   * someone else's. When absent, the recipient check is skipped (treated as
   * unknown, not a mismatch).
   */
  userAccountName?: string;
}

export interface VerifyRequest {
  file: Uint8Array;
  claim: EmploymentClaim;
}

export type Verdict = "VERIFIED" | "PARTIAL" | "FAILED";

export type ConfidenceTier =
  | "SELF_REPORTED"
  | "EVIDENCE_SUBMITTED"
  | "REVIEWED"
  | "SOURCE_CONFIRMED"
  | "MULTI_SOURCE_CONFIRMED";

export interface TamperingSignal {
  detected: boolean;
  method:
    | "pkcs7-verification"
    | "docusign-cert-parse"
    | "pdf-signature-dict-present"
    | "structural-anomaly"
    | "none";
  details?: Record<string, unknown>;
}

export interface AuthenticitySignal {
  source: "docusign" | "pkcs7-embedded" | "unsigned";
  envelopeId?: string;
  senderEmail?: string;
  senderDomain?: string;
  senderName?: string;
  signerDomains?: string[];
  completedAt?: string;
  matchesClaim: boolean;
  reason?: string;
}

export interface ContentMatchSignal {
  employer: string | null;
  role: string | null;
  startDate: string | null;
  endDate: string | null;
  /**
   * The name of the offer's recipient as it appears in the document
   * (e.g., "Dear Jordan Smith,"). null when no recipient could be extracted.
   */
  recipient: string | null;
  /**
   * True only when we confidently identified the document as an offer letter
   * specifically — not a W-2, pay stub, performance review, employment
   * verification letter, or other employment-adjacent doc. Offer-letter-only
   * signal; other claim types always set this to false.
   */
  isOfferLetter: boolean;
  /**
   * True when the document matches the expected type for whatever claim
   * handler ran this extraction. Offer-letter handler: true iff it's an
   * offer letter. Employment-verification handler: true iff it's an HR
   * letter / W-2 / HR portal export / pay stub. Education handler: true
   * iff it's a diploma. Generic flag the UI can use without knowing which
   * handler produced the signal.
   */
  isExpectedDocumentType: boolean;
  extractor: string;
  matchesClaim: boolean;
  /**
   * Which claim fields the document failed to back. Possible values:
   * "employer" | "role" | "startDate" | "endDate" | "recipient" | "documentType".
   * Absent when matchesClaim is true.
   */
  mismatches?: string[];
}

export interface Provenance {
  fileHash: string;
  certificateFileHash?: string;
  verifiedAt: string;
  verifier: string;
}

export interface VerifyResponse {
  verdict: Verdict;
  confidenceTier: ConfidenceTier;
  signals: {
    tampering: TamperingSignal;
    authenticity: AuthenticitySignal;
    content: ContentMatchSignal;
  };
  provenance: Provenance;
}

export interface ContentExtractor {
  readonly name: string;
  extractEmployment(text: string, claim: EmploymentClaim): Promise<ContentMatchSignal>;
}

/**
 * Normalizes a name string for loose comparison: lowercase, collapse
 * whitespace, strip punctuation, drop common honorifics. Returns null for
 * empty input. Used by both extractors for the recipient-match check so the
 * match rules are consistent.
 */
export function normalizeName(name: string | null | undefined): string | null {
  if (!name) return null;
  const cleaned = name
    .toLowerCase()
    .replace(/\b(mr|mrs|ms|mx|dr|prof|sir|madam)\.?\s+/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length === 0 ? null : cleaned;
}

/**
 * Returns true when two names look like the same person under loose matching:
 * normalized full-string match, OR one is a token-subset of the other (handles
 * "Faheem Syed" vs "Faheem H Syed", "Jordan Smith" vs "Jordan"). Returns
 * null when either side is unknown — not a mismatch.
 */
export function namesMatchLoosely(
  docName: string | null | undefined,
  accountName: string | null | undefined,
): boolean | null {
  const doc = normalizeName(docName);
  const account = normalizeName(accountName);
  if (!doc || !account) return null;
  if (doc === account) return true;
  const docTokens = new Set(doc.split(" "));
  const accountTokens = new Set(account.split(" "));
  const overlap = [...docTokens].filter((t) => accountTokens.has(t));
  // Require at least 2 shared tokens (typically first + last) to count as a
  // match. A single shared first name is too weak. If either side has only
  // one token, allow a single-token match (e.g., the document just says "Dear
  // Jordan,").
  const minTokens = Math.min(docTokens.size, accountTokens.size);
  return overlap.length >= Math.min(2, minTokens);
}
