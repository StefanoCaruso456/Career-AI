/**
 * Types surfaced by the PDF signature verifier.
 *
 * This library's job is to answer the question "has the bytes of this
 * signed PDF been modified since the signature was computed?" It returns
 * a structured result per signature so a caller can decide policy.
 *
 * Trust decisions (is this cert trusted? is it revoked? is it a known
 * employer's cert?) are NOT made here. Those require an out-of-band
 * trust store and belong in a higher layer.
 */

export interface ExtractedSignature {
  /** Zero-based index of this signature within the PDF. */
  index: number;

  /** ByteRange array from the signature dictionary: [start1, length1, start2, length2]. */
  byteRange: number[];

  /** /Filter value from the signature dict (e.g. "/Adobe.PPKMS", "/Adobe.PPKLite"). */
  filter?: string;

  /** /SubFilter value (e.g. "/adbe.pkcs7.detached", "/ETSI.CAdES.detached"). */
  subFilter?: string;

  /** /Reason, /Location, /ContactInfo, /Name as readable strings if present. */
  reason?: string;
  location?: string;
  contactInfo?: string;
  signerName?: string;

  /** /M signing-time string (PDF date format). */
  signingTime?: string;

  /** Raw hex-decoded PKCS#7/CMS bytes from the signature /Contents entry. */
  cmsBytes: Uint8Array;
}

export interface SignatureValidationResult {
  /** Position of this signature within the PDF's signature list. */
  index: number;

  /** True iff the digest embedded in the CMS SignedData matches the hash
   *  we computed over the ByteRange of the on-disk PDF bytes. This is
   *  the tamper check: any byte change inside the covered range breaks it. */
  digestValid: boolean;

  /** True iff the CMS signerInfo cryptographic signature verifies against
   *  the public key embedded in the signer certificate. Proves the signer
   *  held the private key matching the cert at signing time. */
  signatureValid: boolean;

  /** True iff `digestValid && signatureValid && errors.length === 0`.
   *  Does NOT imply the signer is trusted — it only means the signature
   *  is cryptographically self-consistent and the document wasn't edited. */
  cryptographicallyValid: boolean;

  /** Digest algorithm used (e.g. "SHA-256"). */
  digestAlgorithm?: string;

  /** Signature algorithm used by the signer (e.g. "RSASSA-PKCS1-v1_5"). */
  signatureAlgorithm?: string;

  /** Signing time asserted in the CMS signed attributes, if present. */
  cmsSigningTime?: string;

  /** Informational: Subject distinguished name of the signer certificate.
   *  In standard DocuSign platform signing this will be "DocuSign Inc.",
   *  NOT the sender company. Do not use as a trust signal. */
  signerSubjectDN?: string;

  /** Informational: Issuer distinguished name of the signer certificate. */
  signerIssuerDN?: string;

  /** The filter / subfilter from the signature dictionary. */
  filter?: string;
  subFilter?: string;

  /** ByteRange this signature covers. */
  byteRange: number[];

  /** True if ByteRange appears to cover the whole file except the signature
   *  placeholder. Incremental updates leave bytes outside the range; those
   *  bytes are unprotected. */
  byteRangeCoversWholeFile: boolean;

  /** Non-fatal diagnostic messages. Callers can display these. */
  errors: string[];
}

export interface VerificationOutcome {
  /** True if every signature in the PDF passed cryptographic validation. */
  allValid: boolean;

  /** Number of signatures found in the PDF. */
  signatureCount: number;

  /** Per-signature validation results in document order. */
  signatures: SignatureValidationResult[];

  /** Global errors that prevented verification from running (e.g. "PDF has
   *  no signature dictionary" or "ByteRange malformed"). */
  errors: string[];
}
