import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import {
  namesMatchLoosely,
  type AuthenticitySignal,
  type ConfidenceTier,
  type ContentMatchSignal,
  type TamperingSignal,
  type Verdict,
} from "../verifier/types.js";
import type {
  ClaimAuthenticityInput,
  ClaimBadgePayloadInput,
  ClaimTypeHandler,
  ClaimVerdictInput,
} from "./types.js";

/**
 * Education claim handler.
 *
 * Covers diploma / degree certificates confirming graduation from a named
 * institution with a named degree. Transcripts are a separate claim type
 * (different group, different lineage) because a transcript proves
 * coursework/GPA, not graduation.
 *
 * Group: "education". Same (institution, degree) collapses into one
 * lineage — an official diploma and a later digital re-issue land on the
 * same badge with version N+1.
 *
 * Authenticity: education docs are rarely cryptographically signed by an
 * issuer whose domain resolves cleanly, so the handler does NOT require a
 * domain match. expectedDomain is null; verdict relies on content +
 * (optionally) any embedded signature for tamper-evidence.
 */

export const VERSION = "0.1.0";

interface EducationClaim {
  institution: string;
  degree: string;
  graduationDate: string; // YYYY-MM-DD
  userAccountName?: string;
}

const educationSchema = z.object({
  institution: z.string().min(1).max(200),
  degree: z.string().min(1).max(200),
  graduationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  userAccountName: z.string().min(1).max(200).optional(),
}) satisfies z.ZodType<EducationClaim>;

const InstitutionFindingSchema = z.object({
  foundInDocument: z.boolean(),
  nameInDocument: z.string().nullable(),
  matchesClaim: z.boolean().describe(
    "True if the document's issuing institution is semantically the claimed institution. Handles common variants (The Leland Stanford Junior University ~ Stanford University; MIT ~ Massachusetts Institute of Technology).",
  ),
});

const DegreeFindingSchema = z.object({
  foundInDocument: z.boolean(),
  degreeInDocument: z.string().nullable(),
  matchesClaim: z.boolean().describe(
    "True if the document's awarded degree matches the claim (semantic, abbreviation-aware). BS = Bachelor of Science; MSCS ~ Master of Science in Computer Science. If the claim is a major/concentration and the document awards the parent degree with that concentration, that counts as a match.",
  ),
});

const DateFindingSchema = z.object({
  foundInDocument: z.boolean(),
  dateInDocument: z.string().nullable(),
  matchesClaim: z.boolean().describe(
    "True if the graduation / conferral date in the document is within a few months of the claim. If the document shows only the year, same-year is a match.",
  ),
});

const RecipientFindingSchema = z.object({
  nameInDocument: z.string().nullable(),
  matchesUploaderAccount: z.boolean().describe(
    "True if the diploma names the uploader as the conferee. Use common-alias tolerance (Bill ↔ William). If the document has no named conferee, set false.",
  ),
});

const ExtractionSchema = z.object({
  documentType: z.enum([
    "diploma",
    "degree_certificate",
    "letter_of_completion",
    "transcript",
    "enrollment_verification",
    "other",
  ]),
  isEducationCredential: z.boolean().describe(
    "True only when documentType is diploma, degree_certificate, or letter_of_completion. Transcripts and enrollment letters have their own claim types and should not be accepted here.",
  ),
  institution: InstitutionFindingSchema,
  degree: DegreeFindingSchema,
  graduationDate: DateFindingSchema,
  recipient: RecipientFindingSchema,
  overallConfidence: z.enum(["high", "medium", "low"]),
  reasoning: z.string(),
});

type ExtractionOutput = z.infer<typeof ExtractionSchema>;

const INSTRUCTIONS = `You are an education-credential verification assistant for Career Ledger. You receive a CLAIM (institution, degree, graduation date, optional uploader name) and the TEXT of a document the user says proves they earned that degree.

(a) documentType:
  - diploma: a formal diploma conferring a degree (typical graduation diploma).
  - degree_certificate: a signed certificate confirming conferral (similar to diploma, different formatting).
  - letter_of_completion: official letter from the institution confirming program completion in lieu of a formal diploma.
  - transcript: academic transcript — DO NOT accept here. This is the transcript claim type.
  - enrollment_verification: confirms current enrollment, not graduation — not an education credential on its own.
  - other: anything else.

Set isEducationCredential true ONLY for diploma, degree_certificate, or letter_of_completion.

(b) Institution: semantic match against the claim. Include obvious parent/alias variants (Stanford ~ The Leland Stanford Junior University; MIT ~ Massachusetts Institute of Technology; Berkeley ~ University of California, Berkeley).

(c) Degree: degree name + level must match the claim. Handle abbreviations (BS, BSc, BA, MA, MS, MBA, PhD). Concentration/major matching: "Bachelor of Science" + "Computer Science" matches a claim of "Bachelor of Science in Computer Science" when the document lists CS as the major. Avoid matching certificate programs to full degrees.

(d) Graduation date: year match is usually sufficient. Allow a few months either way.

(e) Recipient: named conferee must match the uploader (alias tolerance). If no named conferee, matchesUploaderAccount=false (a diploma always names its recipient).

(f) One-line reasoning.

Rules:
- If documentType is transcript or enrollment_verification, mark isEducationCredential=false. This handler rejects those; suggest the user submit through the right claim type.
- Be conservative. Accepting a random document that mentions "Stanford" is worse than rejecting a legitimate diploma with unusual formatting.
- Output exactly one structured response.`;

const MAX_TEXT_LENGTH = 40_000;

let clientSingleton: OpenAI | null = null;
function openaiClient(): OpenAI {
  if (clientSingleton) return clientSingleton;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "education handler requires OPENAI_API_KEY. Set it in the gateway environment before enabling this claim type.",
    );
  }
  clientSingleton = new OpenAI({ apiKey });
  return clientSingleton;
}

function model(): string {
  return process.env.OPENAI_MODEL ?? "gpt-5";
}

async function extractEducation(
  text: string,
  claim: EducationClaim,
): Promise<ContentMatchSignal> {
  const trimmed =
    text.length > MAX_TEXT_LENGTH
      ? `${text.slice(0, MAX_TEXT_LENGTH)}\n\n[... document truncated at ${MAX_TEXT_LENGTH} characters ...]`
      : text;

  const prompt = [
    "CLAIM TO VERIFY:",
    `  Institution:      ${claim.institution}`,
    `  Degree:           ${claim.degree}`,
    `  Graduation date:  ${claim.graduationDate}`,
    `  Uploader name:    ${claim.userAccountName ?? "(not provided — skip recipient match)"}`,
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
        format: zodTextFormat(ExtractionSchema, "education_credential_verdict"),
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
    extractor: "openai-education",
    matchesClaim: false,
    mismatches: ["documentType", "employer"],
  };
}

function buildSignalFromParsed(
  parsed: ExtractionOutput,
  claim: EducationClaim,
): ContentMatchSignal {
  const mismatches: string[] = [];

  if (!parsed.isEducationCredential) mismatches.push("documentType");
  // The content signal shape (shared with employment types) uses `employer`
  // / `role` / `startDate` as field names. For education we map:
  //   employer   -> institution
  //   role       -> degree
  //   startDate  -> graduationDate
  // This keeps the signal shape stable so the orchestrator and view builder
  // stay agnostic. A future pass can rename the generic fields.
  if (!parsed.institution.matchesClaim) mismatches.push("employer");
  if (!parsed.degree.matchesClaim) mismatches.push("role");
  if (!parsed.graduationDate.matchesClaim) mismatches.push("startDate");

  const accountName = claim.userAccountName ?? null;
  if (accountName) {
    const localCheck = namesMatchLoosely(parsed.recipient.nameInDocument, accountName);
    const modelSaysMatch = parsed.recipient.matchesUploaderAccount;
    const matches = localCheck === null ? modelSaysMatch : localCheck && modelSaysMatch;
    if (!matches) mismatches.push("recipient");
  }

  return {
    employer: parsed.institution.foundInDocument
      ? parsed.institution.nameInDocument ?? claim.institution
      : null,
    role: parsed.degree.foundInDocument
      ? parsed.degree.degreeInDocument ?? claim.degree
      : null,
    startDate: parsed.graduationDate.foundInDocument
      ? parsed.graduationDate.dateInDocument ?? claim.graduationDate
      : null,
    endDate: null,
    recipient: parsed.recipient.nameInDocument,
    isOfferLetter: false,
    isExpectedDocumentType: parsed.isEducationCredential,
    extractor: "openai-education",
    matchesClaim: mismatches.length === 0,
    mismatches: mismatches.length > 0 ? mismatches : undefined,
  };
}

function computeEducationVerdict(
  tampering: TamperingSignal,
  _authenticity: AuthenticitySignal,
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

  const cryptoVerified =
    tampering.method === "pkcs7-verification" && !tampering.detected;
  const contentOk = content.matchesClaim;

  if (contentOk && cryptoVerified) {
    return { verdict: "VERIFIED", confidenceTier: "REVIEWED" };
  }
  if (contentOk) {
    return { verdict: "PARTIAL", confidenceTier: "EVIDENCE_SUBMITTED" };
  }
  // Content has some mismatches but not hard ones — usually a wrong degree
  // level or date. Partial so the UI can surface "we verified institution +
  // recipient, please upload a clearer copy."
  return { verdict: "PARTIAL", confidenceTier: "SELF_REPORTED" };
}

export const educationHandler: ClaimTypeHandler<EducationClaim> = {
  kind: "education",
  group: "education",
  verifierName: `api-gateway:education@${VERSION}`,
  schema: educationSchema,

  buildAuthenticityInput(_claim: EducationClaim): ClaimAuthenticityInput {
    // Education documents are rarely signed by a cleanly-resolvable
    // issuer domain, and mapping "Stanford University" to "stanford.edu"
    // reliably is a rabbit hole. Report the signature (if any) without
    // matching against an expected domain.
    return {
      expectedDomain: null,
      expectedDomainLabel: "claimed institution",
    };
  },

  async extractContent(text: string, claim: EducationClaim): Promise<ContentMatchSignal> {
    return extractEducation(text, claim);
  },

  computeVerdict(input: ClaimVerdictInput): { verdict: Verdict; confidenceTier: ConfidenceTier } {
    return computeEducationVerdict(input.tampering, input.authenticity, input.content);
  },

  buildBadgePayload(input: ClaimBadgePayloadInput<EducationClaim>): unknown {
    const { claim, authenticitySource, confidenceTier, verifiedAt } = input;
    return {
      kind: "bare-education",
      institution: claim.institution,
      degree: claim.degree,
      graduationDate: claim.graduationDate,
      authenticitySource,
      confidenceTier,
      verifiedAt,
    };
  },

  buildLineageIdentity(claim: EducationClaim): string {
    return `${normalizeInstitution(claim.institution)}:${normalizeDegree(claim.degree)}`;
  },
};

function normalizeInstitution(institution: string): string {
  return institution
    .toLowerCase()
    .replace(/\b(university|college|school|institute|academy|the)\b/gi, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeDegree(degree: string): string {
  return degree
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
