import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { guessEmployerDomain } from "../verifier/verifiers/authenticity.js";
import {
  namesMatchLoosely,
  type AuthenticitySignal,
  type ConfidenceTier,
  type ContentMatchSignal,
  type TamperingSignal,
  type Verdict,
} from "../verifier/types.js";
import { buildEmploymentLineageIdentity } from "./employment-identity.js";
import type {
  ClaimAuthenticityInput,
  ClaimBadgePayloadInput,
  ClaimTypeHandler,
  ClaimVerdictInput,
} from "./types.js";

/**
 * Employment-verification claim handler.
 *
 * Covers documents that confirm past or current employment at a named
 * employer: HR employment verification letters, W-2s, HR portal exports
 * (Workday, BambooHR, etc.), and background-check/verification reports
 * (The Work Number, Truework, Certn).
 *
 * Shares `group: "employment"` with offer-letter so an employment
 * verification document for the same (employer, role) lands on the same
 * badge lineage — re-verifying through a different document type bumps
 * the version rather than creating an unrelated badge.
 *
 * Key differences from offer-letter:
 *   - Document-type whitelist is broader (no "is this an offer letter?")
 *   - Role is often present but not required in the doc (W-2s usually
 *     don't name a role); role match is therefore advisory, not a hard
 *     mismatch
 *   - Authenticity signals skew lower than offer-letter (most HR letters
 *     aren't DocuSigned) — verdict ceiling stays at REVIEWED, same as
 *     offer-letter, because sender-identity cryptographic attestation
 *     isn't available for either
 */

export const VERSION = "0.1.0";

interface EmploymentVerificationClaim {
  employer: string;
  role: string;
  startDate?: string;
  endDate?: string;
  userAccountName?: string;
}

const employmentVerificationSchema = z.object({
  employer: z.string().min(1).max(200),
  role: z.string().min(1).max(200),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  userAccountName: z.string().min(1).max(200).optional(),
}) satisfies z.ZodType<EmploymentVerificationClaim>;

const EmployerFindingSchema = z.object({
  foundInDocument: z.boolean(),
  nameInDocument: z.string().nullable(),
  matchesClaim: z.boolean().describe(
    "True if the document's employer is semantically the same as the claimed employer (case-insensitive, suffix-insensitive, subsidiary-aware).",
  ),
});

const RoleFindingSchema = z.object({
  foundInDocument: z.boolean(),
  titleInDocument: z.string().nullable(),
  matchesClaim: z.boolean().describe(
    "True if the document names a role that matches the claim. False ONLY when the document explicitly names a different role than claimed. If the document doesn't mention role at all (common for W-2s), set foundInDocument=false and matchesClaim=true — a missing role is not a contradiction.",
  ),
});

const DateFindingSchema = z.object({
  foundInDocument: z.boolean(),
  dateInDocument: z.string().nullable(),
  matchesClaim: z.boolean().describe(
    "True if a date in the document aligns with the claim. For missing claims or missing dates, set foundInDocument=false and matchesClaim=true.",
  ),
});

const RecipientFindingSchema = z.object({
  nameInDocument: z.string().nullable(),
  matchesUploaderAccount: z.boolean().describe(
    "True if the document is plainly about the uploader (their name appears as the employee/subject). Use alias tolerance (Bill ↔ William). If the document has no named subject (e.g., aggregate pay stub template), set true rather than flagging a false mismatch.",
  ),
});

const ExtractionSchema = z.object({
  documentType: z.enum([
    "employment_verification_letter",
    "w2",
    "pay_stub",
    "hr_portal_export",
    "background_check_report",
    "offer_letter",
    "performance_review",
    "contract_nonemployment",
    "other",
  ]),
  isEmploymentVerification: z.boolean().describe(
    "True when documentType is employment_verification_letter, w2, pay_stub, hr_portal_export, or background_check_report.",
  ),
  employer: EmployerFindingSchema,
  role: RoleFindingSchema,
  startDate: DateFindingSchema,
  endDate: DateFindingSchema,
  recipient: RecipientFindingSchema,
  overallConfidence: z.enum(["high", "medium", "low"]),
  reasoning: z.string(),
});

type ExtractionOutput = z.infer<typeof ExtractionSchema>;

const INSTRUCTIONS = `You are an employment-verification assistant for Career Ledger. You receive a CLAIM (employer, role, optional dates, uploader name) and the TEXT of a document the user says proves their employment at that employer.

Your job:

(a) Classify documentType:
  - employment_verification_letter: an HR-signed letter confirming the employee works / worked at the employer
  - w2: an IRS W-2 wage statement — employer EIN + name present, tax year present
  - pay_stub: a recurring pay stub with employer + employee + earnings
  - hr_portal_export: a screenshot/PDF export from Workday, BambooHR, Rippling, ADP, etc. showing the employee's employment record
  - background_check_report: a report from The Work Number, Truework, Certn, or similar confirming employment
  - offer_letter: (wrong type — offer letters belong to the offer-letter claim type)
  - performance_review: (not valid employment verification on its own)
  - contract_nonemployment: contractor agreement or similar — not W-2 employment
  - other: anything else

Set isEmploymentVerification true ONLY for the first five types.

(b) Employer: does the document identify the claimed employer as the employing entity? Semantic match (Apple Inc. ~ Apple; BloomTech d/b/a Gauntlet AI ~ Gauntlet AI). An incidental mention ("previously at Acme") is NOT a match.

(c) Role: if the document names a role, does it match the claim (semantically, level-aware)? If the document has no role at all (common for W-2s), set foundInDocument=false and matchesClaim=true — a missing role is not a contradiction.

(d) Dates: if dates appear, align with the claim? Allow same-month fuzz. Missing dates → foundInDocument=false + matchesClaim=true.

(e) Recipient: is the document about the uploader? Use common alias tolerance. If no named subject at all (e.g., a generic template), set matchesUploaderAccount=true rather than flagging. If a clearly different name is named as the subject, set false.

(f) One-line reasoning.

Rules:
- If documentType is offer_letter or performance_review or contract_nonemployment or other, mark the content findings accordingly and set isEmploymentVerification=false.
- Be conservative on employer match: false positives (accepting a random doc mentioning the employer) are worse than false negatives.
- Output exactly one structured response.`;

const MAX_TEXT_LENGTH = 40_000;

let clientSingleton: OpenAI | null = null;
function openaiClient(): OpenAI {
  if (clientSingleton) return clientSingleton;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "employment-verification handler requires OPENAI_API_KEY. Set it in the gateway environment before enabling this claim type.",
    );
  }
  clientSingleton = new OpenAI({ apiKey });
  return clientSingleton;
}

function model(): string {
  return process.env.OPENAI_MODEL ?? "gpt-5";
}

async function extractEmploymentVerification(
  text: string,
  claim: EmploymentVerificationClaim,
): Promise<ContentMatchSignal> {
  const trimmed =
    text.length > MAX_TEXT_LENGTH
      ? `${text.slice(0, MAX_TEXT_LENGTH)}\n\n[... document truncated at ${MAX_TEXT_LENGTH} characters ...]`
      : text;

  const prompt = [
    "CLAIM TO VERIFY:",
    `  Employer:       ${claim.employer}`,
    `  Role:           ${claim.role}`,
    claim.startDate ? `  Start date:     ${claim.startDate}` : "  Start date:     (not claimed)",
    claim.endDate ? `  End date:       ${claim.endDate}` : "  End date:       (not claimed)",
    `  Uploader name:  ${claim.userAccountName ?? "(not provided — skip recipient match)"}`,
    "",
    "DOCUMENT TEXT:",
    "```",
    trimmed,
    "```",
  ].join("\n");

  let parsed: ExtractionOutput | null = null;
  try {
    const response = await openaiClient().responses.parse({
      model: model(),
      instructions: INSTRUCTIONS,
      input: prompt,
      store: false,
      text: {
        format: zodTextFormat(ExtractionSchema, "employment_verification_verdict"),
      },
    });
    parsed = response.output_parsed;
  } catch (err) {
    return failureSignal(
      `OpenAI request failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!parsed) {
    return failureSignal(
      "OpenAI returned a response that could not be parsed against the extraction schema.",
    );
  }

  return buildSignalFromParsed(parsed, claim);
}

function failureSignal(_reason: string): ContentMatchSignal {
  return {
    employer: null,
    role: null,
    startDate: null,
    endDate: null,
    recipient: null,
    isOfferLetter: false,
    isExpectedDocumentType: false,
    extractor: "openai-employment-verification",
    matchesClaim: false,
    mismatches: ["documentType", "employer"],
  };
}

function buildSignalFromParsed(
  parsed: ExtractionOutput,
  claim: EmploymentVerificationClaim,
): ContentMatchSignal {
  const mismatches: string[] = [];

  if (!parsed.isEmploymentVerification) mismatches.push("documentType");
  if (!parsed.employer.matchesClaim) mismatches.push("employer");
  // Role match is advisory for employment-verification (W-2s usually have
  // no role). We only flag a role mismatch when the document names a role
  // AND it contradicts the claim.
  if (parsed.role.foundInDocument && !parsed.role.matchesClaim) mismatches.push("role");

  const accountName = claim.userAccountName ?? null;
  if (accountName) {
    const localCheck = namesMatchLoosely(parsed.recipient.nameInDocument, accountName);
    const modelSaysMatch = parsed.recipient.matchesUploaderAccount;
    const matches = localCheck === null ? modelSaysMatch : localCheck && modelSaysMatch;
    if (!matches) mismatches.push("recipient");
  }

  return {
    employer: parsed.employer.foundInDocument
      ? parsed.employer.nameInDocument ?? claim.employer
      : null,
    role: parsed.role.foundInDocument
      ? parsed.role.titleInDocument ?? claim.role
      : null,
    startDate: parsed.startDate.foundInDocument
      ? parsed.startDate.dateInDocument ?? claim.startDate ?? null
      : null,
    endDate: parsed.endDate.foundInDocument
      ? parsed.endDate.dateInDocument ?? claim.endDate ?? null
      : null,
    recipient: parsed.recipient.nameInDocument,
    isOfferLetter: false,
    isExpectedDocumentType: parsed.isEmploymentVerification,
    extractor: "openai-employment-verification",
    matchesClaim: mismatches.length === 0,
    mismatches: mismatches.length > 0 ? mismatches : undefined,
  };
}

function computeEmploymentVerificationVerdict(
  tampering: TamperingSignal,
  authenticity: AuthenticitySignal,
  content: ContentMatchSignal,
): { verdict: Verdict; confidenceTier: ConfidenceTier } {
  if (tampering.detected) {
    return { verdict: "FAILED", confidenceTier: "SELF_REPORTED" };
  }
  if (content.mismatches?.includes("documentType")) {
    return { verdict: "FAILED", confidenceTier: "SELF_REPORTED" };
  }
  if (content.mismatches?.includes("recipient")) {
    return { verdict: "FAILED", confidenceTier: "SELF_REPORTED" };
  }
  if (content.mismatches?.includes("employer")) {
    return { verdict: "FAILED", confidenceTier: "SELF_REPORTED" };
  }

  const signedMatch =
    (authenticity.source === "docusign" || authenticity.source === "pkcs7-embedded") &&
    authenticity.matchesClaim;
  const cryptoVerified =
    tampering.method === "pkcs7-verification" && !tampering.detected;
  const contentOk = content.matchesClaim;

  if (signedMatch && contentOk) {
    return { verdict: "VERIFIED", confidenceTier: "REVIEWED" };
  }
  if (!signedMatch && contentOk) {
    return cryptoVerified
      ? { verdict: "PARTIAL", confidenceTier: "REVIEWED" }
      : { verdict: "PARTIAL", confidenceTier: "EVIDENCE_SUBMITTED" };
  }
  if (signedMatch && !contentOk) {
    return { verdict: "PARTIAL", confidenceTier: "REVIEWED" };
  }
  if (cryptoVerified) {
    return { verdict: "PARTIAL", confidenceTier: "EVIDENCE_SUBMITTED" };
  }
  return { verdict: "FAILED", confidenceTier: "SELF_REPORTED" };
}

export const employmentVerificationHandler: ClaimTypeHandler<EmploymentVerificationClaim> = {
  kind: "employment-verification",
  group: "employment",
  verifierName: `api-gateway:employment-verification@${VERSION}`,
  schema: employmentVerificationSchema,

  buildAuthenticityInput(claim: EmploymentVerificationClaim): ClaimAuthenticityInput {
    return {
      expectedDomain: guessEmployerDomain(claim.employer),
      expectedDomainLabel: `claimed employer "${claim.employer}"`,
    };
  },

  async extractContent(
    text: string,
    claim: EmploymentVerificationClaim,
  ): Promise<ContentMatchSignal> {
    return extractEmploymentVerification(text, claim);
  },

  computeVerdict(input: ClaimVerdictInput): { verdict: Verdict; confidenceTier: ConfidenceTier } {
    return computeEmploymentVerificationVerdict(
      input.tampering,
      input.authenticity,
      input.content,
    );
  },

  buildBadgePayload(input: ClaimBadgePayloadInput<EmploymentVerificationClaim>): unknown {
    const { claim, authenticitySource, confidenceTier, verifiedAt } = input;
    return {
      kind: "bare-employment-verification",
      employer: claim.employer,
      role: claim.role,
      startDate: claim.startDate,
      endDate: claim.endDate,
      authenticitySource,
      confidenceTier,
      verifiedAt,
    };
  },

  buildLineageIdentity(claim: EmploymentVerificationClaim): string {
    // Must match offer-letter so the same (employer, role) lands on the
    // same badge lineage regardless of which doc type was uploaded first.
    return buildEmploymentLineageIdentity({
      employer: claim.employer,
      role: claim.role,
    });
  },
};
