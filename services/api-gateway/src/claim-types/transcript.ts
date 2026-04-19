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
 * Transcript claim handler (shallow).
 *
 * Covers academic transcripts — a rolling record of coursework and grades
 * at a named institution. Deliberately shallow for the demo: the LLM
 * confirms "this is a transcript at the claimed institution about the
 * uploader," and we do NOT attempt structured GPA / course-list
 * extraction or registrar-identity verification. Verdict ceiling for
 * transcripts tops out at PARTIAL/REVIEWED without out-of-band
 * registrar confirmation.
 *
 * Group: "transcript". Lineage identity is the institution alone — a
 * transcript is a rolling record, so a new transcript from the same
 * school re-verifies and bumps version on the same lineage. Transcripts
 * from two different schools produce distinct lineages.
 */

export const VERSION = "0.1.0";

interface TranscriptClaim {
  institution: string;
  program?: string; // e.g., "Computer Science Major"
  academicPeriod?: string; // free text: "Fall 2022", "2020-2024", etc.
  userAccountName?: string;
}

const transcriptSchema = z.object({
  institution: z.string().min(1).max(200),
  program: z.string().min(1).max(200).optional(),
  academicPeriod: z.string().min(1).max(100).optional(),
  userAccountName: z.string().min(1).max(200).optional(),
}) satisfies z.ZodType<TranscriptClaim>;

const InstitutionFindingSchema = z.object({
  foundInDocument: z.boolean(),
  nameInDocument: z.string().nullable(),
  matchesClaim: z.boolean(),
});

const RecipientFindingSchema = z.object({
  nameInDocument: z.string().nullable(),
  matchesUploaderAccount: z.boolean(),
});

const ExtractionSchema = z.object({
  documentType: z.enum([
    "transcript",
    "unofficial_transcript",
    "grade_report",
    "diploma",
    "enrollment_verification",
    "other",
  ]),
  isTranscript: z.boolean().describe(
    "True when documentType is transcript, unofficial_transcript, or grade_report. Diplomas and enrollment letters should not be accepted here.",
  ),
  institution: InstitutionFindingSchema,
  recipient: RecipientFindingSchema,
  overallConfidence: z.enum(["high", "medium", "low"]),
  reasoning: z.string(),
});

type ExtractionOutput = z.infer<typeof ExtractionSchema>;

const INSTRUCTIONS = `You are a transcript-verification assistant for Career Ledger. You receive a CLAIM (institution, optional program, optional academic period, optional uploader name) and the TEXT of a document the user says is their academic transcript.

This handler is deliberately shallow. You are NOT expected to extract individual courses or GPAs. Your job is to confirm three things:

(a) documentType:
  - transcript: an official academic transcript (registrar-issued).
  - unofficial_transcript: a student-issued or self-service transcript export.
  - grade_report: a term grade report with multiple courses listed.
  - diploma / enrollment_verification / other: NOT a transcript. Reject.

Set isTranscript true ONLY for transcript, unofficial_transcript, or grade_report.

(b) Institution: does the document identify the claimed institution as the issuing school? Semantic match (Stanford ~ The Leland Stanford Junior University).

(c) Recipient: is the document about the uploader? Use alias tolerance. If the transcript has no named student, matchesUploaderAccount=false.

Output exactly one structured response. Short reasoning.`;

const MAX_TEXT_LENGTH = 40_000;

let clientSingleton: OpenAI | null = null;
function openaiClient(): OpenAI {
  if (clientSingleton) return clientSingleton;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "transcript handler requires OPENAI_API_KEY. Set it in the gateway environment before enabling this claim type.",
    );
  }
  clientSingleton = new OpenAI({ apiKey });
  return clientSingleton;
}

function model(): string {
  return process.env.OPENAI_MODEL ?? "gpt-5";
}

async function extractTranscript(
  text: string,
  claim: TranscriptClaim,
): Promise<ContentMatchSignal> {
  const trimmed =
    text.length > MAX_TEXT_LENGTH
      ? `${text.slice(0, MAX_TEXT_LENGTH)}\n\n[... document truncated at ${MAX_TEXT_LENGTH} characters ...]`
      : text;

  const prompt = [
    "CLAIM TO VERIFY:",
    `  Institution:      ${claim.institution}`,
    `  Program:          ${claim.program ?? "(not claimed)"}`,
    `  Academic period:  ${claim.academicPeriod ?? "(not claimed)"}`,
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
        format: zodTextFormat(ExtractionSchema, "transcript_verdict"),
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
    extractor: "openai-transcript",
    matchesClaim: false,
    mismatches: ["documentType", "employer"],
  };
}

function buildSignalFromParsed(
  parsed: ExtractionOutput,
  claim: TranscriptClaim,
): ContentMatchSignal {
  const mismatches: string[] = [];

  if (!parsed.isTranscript) mismatches.push("documentType");
  // Signal shape uses `employer` as the generic "primary entity" field.
  // For transcripts the primary entity is the institution.
  if (!parsed.institution.matchesClaim) mismatches.push("employer");

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
    role: claim.program ?? null,
    startDate: null,
    endDate: null,
    recipient: parsed.recipient.nameInDocument,
    isOfferLetter: false,
    isExpectedDocumentType: parsed.isTranscript,
    extractor: "openai-transcript",
    matchesClaim: mismatches.length === 0,
    mismatches: mismatches.length > 0 ? mismatches : undefined,
  };
}

function computeTranscriptVerdict(
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

  // Transcripts top out at PARTIAL without registrar-side verification.
  // Crypto-signed by someone pushes to REVIEWED, otherwise
  // EVIDENCE_SUBMITTED.
  return cryptoVerified
    ? { verdict: "PARTIAL", confidenceTier: "REVIEWED" }
    : { verdict: "PARTIAL", confidenceTier: "EVIDENCE_SUBMITTED" };
}

export const transcriptHandler: ClaimTypeHandler<TranscriptClaim> = {
  kind: "transcript",
  group: "transcript",
  verifierName: `api-gateway:transcript@${VERSION}`,
  schema: transcriptSchema,

  buildAuthenticityInput(_claim: TranscriptClaim): ClaimAuthenticityInput {
    return {
      expectedDomain: null,
      expectedDomainLabel: "claimed institution",
    };
  },

  async extractContent(text: string, claim: TranscriptClaim): Promise<ContentMatchSignal> {
    return extractTranscript(text, claim);
  },

  computeVerdict(input: ClaimVerdictInput): { verdict: Verdict; confidenceTier: ConfidenceTier } {
    return computeTranscriptVerdict(input.tampering, input.authenticity, input.content);
  },

  buildBadgePayload(input: ClaimBadgePayloadInput<TranscriptClaim>): unknown {
    const { claim, authenticitySource, confidenceTier, verifiedAt } = input;
    return {
      kind: "bare-transcript",
      institution: claim.institution,
      program: claim.program,
      academicPeriod: claim.academicPeriod,
      authenticitySource,
      confidenceTier,
      verifiedAt,
    };
  },

  buildLineageIdentity(claim: TranscriptClaim): string {
    // Transcripts are rolling records; one lineage per institution.
    return normalizeInstitution(claim.institution);
  },
};

function normalizeInstitution(institution: string): string {
  return institution
    .toLowerCase()
    .replace(/\b(university|college|school|institute|academy|the)\b/gi, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
