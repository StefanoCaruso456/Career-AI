import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import {
  namesMatchLoosely,
  type ContentExtractor,
  type ContentMatchSignal,
  type EmploymentClaim,
} from "../types.js";

/**
 * OpenAI-powered content extractor for offer-letter verification.
 *
 * Replaces the heuristic regex matcher with a structured-output call to
 * OpenAI. The model receives the document text + the candidate's claim +
 * the uploading user's account name, and answers four independent
 * questions:
 *
 *   1. Is this specifically an offer letter? (not a W-2, pay stub,
 *      employment verification letter, performance review, or any other
 *      employment-adjacent doc)
 *   2. Who is the recipient of this offer — and does their name match the
 *      uploader's account name? ("is this your letter?")
 *   3. Does the employer/role/dates content match the claim?
 *   4. One-line reasoning so the verdict's failure reason can surface
 *      specifically what broke.
 *
 * Plugged in via the existing ContentExtractor interface:
 *
 *     CONTENT_EXTRACTOR=openai
 *     OPENAI_API_KEY=sk-...
 *     OPENAI_MODEL=gpt-5        # optional, this is the default
 *
 * Uses openai.responses.parse() + zodTextFormat to match Career-AI's
 * existing pattern (see packages/job-seeker-agent/src/tools.ts).
 */

const EmployerFindingSchema = z.object({
  foundInDocument: z.boolean().describe("True if the document clearly names the claimed employer as the candidate's employer."),
  nameInDocument: z.string().nullable().describe("The exact employer name string as it appears in the document, or null if not found."),
  matchesClaim: z.boolean().describe("True if the document's employer is semantically equivalent to the claimed employer (case-insensitive, suffix-insensitive, brand alias-aware)."),
});

const RoleFindingSchema = z.object({
  foundInDocument: z.boolean(),
  titleInDocument: z.string().nullable(),
  matchesClaim: z.boolean().describe("True if the document's role is semantically equivalent to the claim (e.g., 'Senior Engineer' matches 'Senior Software Engineer' if context confirms). Role synonyms and seniority levels should be reconciled."),
});

const DateFindingSchema = z.object({
  foundInDocument: z.boolean(),
  dateInDocument: z.string().nullable().describe("The date as it appears in the document, ideally normalized to YYYY-MM-DD."),
  matchesClaim: z.boolean().describe("True if the document's date is within a reasonable window of the claimed date (same month is typically a match; offer letter dates often differ from actual start dates by weeks)."),
});

const RecipientFindingSchema = z.object({
  nameInDocument: z
    .string()
    .nullable()
    .describe(
      "Full recipient name exactly as it appears in the letter — usually in the salutation ('Dear Jordan Smith,') or the 'To:' block. null if no recipient is addressed.",
    ),
  /**
   * Whether the document is addressed to the uploader. The server-side
   * caller will cross-check this with its own name-matcher too; we ask
   * the model for its view because it can resolve "Bill" vs "William"
   * and similar aliases the regex matcher can't.
   */
  matchesUploaderAccount: z
    .boolean()
    .describe(
      "True if the recipient named in the document plausibly IS the uploading user (name match, common-alias match, or middle-name variants). False if a different person is clearly addressed. Remember: this is 'is this your letter?' — if the doc is addressed to someone else, set false even if the employer matches.",
    ),
});

const ExtractionSchema = z.object({
  documentType: z
    .enum([
      "offer_letter",
      "employment_verification",
      "pay_stub",
      "w2",
      "performance_review",
      "contract_nonemployment",
      "other",
    ])
    .describe(
      "Classify the document. 'offer_letter' = a letter extending a job offer to a named individual. 'employment_verification' = a letter confirming current/past employment (different doc). 'other' = anything that doesn't fit.",
    ),
  isOfferLetter: z
    .boolean()
    .describe(
      "Convenience flag equal to (documentType === 'offer_letter'). Set true ONLY when the document is clearly extending a job offer — not when it merely references employment.",
    ),
  employer: EmployerFindingSchema,
  role: RoleFindingSchema,
  startDate: DateFindingSchema,
  endDate: DateFindingSchema,
  recipient: RecipientFindingSchema,
  overallConfidence: z.enum(["high", "medium", "low"]).describe("Overall confidence that the document backs the claim and the recipient is the uploader."),
  reasoning: z
    .string()
    .describe(
      "One or two sentences explaining the conclusion. Mention any red flags (employer mentioned only in passing, document is a W-2 not an offer letter, recipient name differs from uploader, etc.).",
    ),
});

type ExtractionOutput = z.infer<typeof ExtractionSchema>;

const INSTRUCTIONS = `You are an offer-letter verification assistant for Career Ledger, a platform that verifies candidate employment history for hiring workflows.

You receive:
  1. A candidate's CLAIM: employer, role, start date, optional end date.
  2. The uploading user's ACCOUNT NAME (so you can confirm the offer letter is addressed to THEM).
  3. The TEXT of a document they uploaded (supposed to be their offer letter).

Your job is to answer four independent questions in the structured output:

(a) Is this document specifically an OFFER LETTER? Offer letters extend a job offer to a named individual. They typically state: "we are pleased to offer you the position of X", include compensation details, a start date, contingencies, at-will language, and a signature block for acceptance. An "employment verification letter" (confirming someone already works there) or a W-2 / pay stub / performance review is NOT an offer letter, even though they're employment-related. Set isOfferLetter true ONLY when it's clearly an offer extension.

(b) Who is the RECIPIENT and do they match the uploader? Look in the salutation ("Dear Jordan Smith,") or the "To:" header. Extract the full name as written. Then judge whether that recipient plausibly IS the uploader's account name you were given. Use common-alias tolerance (Bill ↔ William, Liz ↔ Elizabeth, middle-name variants). If a different person is clearly addressed, set matchesUploaderAccount = false even if the employer and role match — this is "is this letter yours?" and a "No" here means the upload is either mistaken or someone else's.

(c) Does the EMPLOYER/ROLE/DATES content back the claim? Apply the semantic matching rules below.

(d) Output one-line REASONING that mentions the strongest signal and any red flags.

Rules:

- **Employer matching is semantic, not string-literal.** "Apple Inc." and "Apple" match. "Alphabet Inc." and "Google" match when context confirms the subsidiary. "BloomTech Inc. d/b/a Gauntlet AI" and "Gauntlet AI" match (DBA is an explicit brand alias). If the claimed employer appears only in passing ("not affiliated with Apple", "formerly at Google"), that is NOT a match — it must be identified as THE employing entity for THIS offer.

- **Role matching is semantic and level-aware.** "Senior Software Engineer" matches "Senior Engineer" when context is engineering. "Staff Engineer" ~ "L6" ~ "Principal" depending on ladder. Flag major mismatches (Manager vs IC, Engineering vs Sales).

- **Date matching is fuzzy.** Same-month is a match. Offer letter "issue date" often differs from "start date" by weeks; either matching is acceptable. If the claim is 2020 and the document is 2024, that's a hard mismatch.

- **Document type trumps everything.** If documentType is not 'offer_letter', mark fields as foundInDocument=false and matchesClaim=false, even if the employer name appears — this document can't back an employment claim on its own.

- **Recipient mismatch is a hard-no.** If the letter is clearly addressed to someone other than the uploader, set matchesUploaderAccount=false. Don't soft-pedal it in reasoning — call it out directly.

- **Be conservative.** When in doubt, prefer false + low confidence. False positives (verifying someone else's letter, or a W-2 mistaken for an offer) are much worse than false negatives.

Output exactly one structured response. No text outside the structured output.`;

export class OpenAIContentExtractor implements ContentExtractor {
  readonly name = "openai";

  private client: OpenAI;
  private model: string;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "OpenAIContentExtractor requires OPENAI_API_KEY. Set it in your env or switch to CONTENT_EXTRACTOR=heuristic.",
      );
    }
    this.client = new OpenAI({ apiKey });
    this.model = process.env.OPENAI_MODEL ?? "gpt-5";
  }

  async extractEmployment(text: string, claim: EmploymentClaim): Promise<ContentMatchSignal> {
    // Trim aggressively so we don't burn tokens on long agreements.
    // Most offer letters fit comfortably under 40k characters.
    const MAX_TEXT_LENGTH = 40_000;
    const trimmedText =
      text.length > MAX_TEXT_LENGTH
        ? text.slice(0, MAX_TEXT_LENGTH) + "\n\n[... document truncated at 40,000 characters ...]"
        : text;

    const prompt = [
      "CLAIM TO VERIFY:",
      `  Employer:       ${claim.employer}`,
      `  Role:           ${claim.role}`,
      `  Start date:     ${claim.startDate}`,
      claim.endDate ? `  End date:       ${claim.endDate}` : "  End date:       (not claimed)",
      `  Uploader name:  ${claim.userAccountName ?? "(not provided — skip recipient match)"}`,
      "",
      "DOCUMENT TEXT:",
      "```",
      trimmedText,
      "```",
    ].join("\n");

    let parsed: ExtractionOutput | null = null;
    try {
      const response = await this.client.responses.parse({
        model: this.model,
        instructions: INSTRUCTIONS,
        input: prompt,
        store: false,
        text: {
          format: zodTextFormat(ExtractionSchema, "offer_letter_verdict"),
        },
      });
      parsed = response.output_parsed;
    } catch (err) {
      return this.failureSignal("openai_call_failed", `OpenAI request failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    if (!parsed) {
      return this.failureSignal(
        "openai_parse_failed",
        "OpenAI returned a response that could not be parsed against the extraction schema.",
      );
    }

    return buildSignalFromParsed(parsed, claim, this.name);
  }

  private failureSignal(_kind: string, _reason: string): ContentMatchSignal {
    return {
      employer: null,
      role: null,
      startDate: null,
      endDate: null,
      recipient: null,
      isOfferLetter: false,
      extractor: this.name,
      matchesClaim: false,
      mismatches: ["documentType", "employer", "role", "startDate", "recipient"],
    };
  }
}

function buildSignalFromParsed(
  parsed: ExtractionOutput,
  claim: EmploymentClaim,
  extractorName: string,
): ContentMatchSignal {
  const mismatches: string[] = [];

  // Document-type check first — if it's not an offer letter, nothing else
  // matters. We still surface the recipient/employer findings so the caller
  // can render a useful failure reason.
  if (!parsed.isOfferLetter) {
    mismatches.push("documentType");
  }

  // Employer / role / dates — trust the LLM's matchesClaim flags.
  if (!parsed.employer.matchesClaim) mismatches.push("employer");
  if (!parsed.role.matchesClaim) mismatches.push("role");
  if (!parsed.startDate.matchesClaim) mismatches.push("startDate");
  if (claim.endDate && !parsed.endDate.matchesClaim) mismatches.push("endDate");

  // Recipient check. Layered: we take the LLM's view, then cross-check with
  // our own name matcher. If either flags a mismatch, we record it. Skipped
  // when the uploader name wasn't supplied.
  const docRecipient = parsed.recipient.nameInDocument;
  const accountName = claim.userAccountName ?? null;
  if (accountName) {
    const localCheck = namesMatchLoosely(docRecipient, accountName);
    const modelSaysMatch = parsed.recipient.matchesUploaderAccount;
    const matches =
      localCheck === null
        ? modelSaysMatch
        : localCheck && modelSaysMatch;
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
      ? parsed.startDate.dateInDocument ?? claim.startDate
      : null,
    endDate: parsed.endDate.foundInDocument
      ? parsed.endDate.dateInDocument ?? claim.endDate ?? null
      : null,
    recipient: docRecipient,
    isOfferLetter: parsed.isOfferLetter,
    extractor: extractorName,
    matchesClaim: mismatches.length === 0,
    mismatches: mismatches.length > 0 ? mismatches : undefined,
  };
}
