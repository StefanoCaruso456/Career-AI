export interface EmploymentClaim {
  employer: string;
  role: string;
  startDate: string;
  endDate?: string;
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
  extractor: string;
  matchesClaim: boolean;
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
