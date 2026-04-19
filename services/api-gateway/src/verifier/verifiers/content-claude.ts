import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { ContentExtractor, ContentMatchSignal, EmploymentClaim } from "../types.js";

/**
 * Claude-powered content extractor.
 *
 * Replaces the heuristic regex/substring matcher with a call to the Anthropic
 * API using structured outputs. Claude receives the document text + the
 * candidate's claim and reports per-field whether the claim is backed by the
 * document, with reasoning. This is dramatically better at:
 *
 *   - Name variants ("Alphabet" vs "Google", "Apple Inc." vs "Apple")
 *   - Role synonyms ("Staff Engineer" vs "L6 Engineer")
 *   - Date ranges expressed loosely ("starting May 2026" vs "2026-05-11")
 *   - Rejecting false positives (company mentioned in a disclaimer, not as the
 *     employer; competing companies listed in a comparison)
 *   - Document type detection (is this even an offer letter?)
 *
 * The extractor is plugged in via the existing ContentExtractor interface, so
 * it slots behind the env var switch without any other changes:
 *
 *     CONTENT_EXTRACTOR=claude
 *     ANTHROPIC_API_KEY=sk-...
 *     ANTHROPIC_MODEL=claude-opus-4-6   # optional, this is the default
 *
 * The system prompt is stable across requests and is marked for ephemeral
 * prompt caching. Whether caching actually kicks in depends on the model's
 * minimum prefix size (Opus 4.6 needs ~4K tokens) — for a short system prompt
 * we pay full price but the code is ready for cache benefit if the prompt
 * grows.
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

const ExtractionSchema = z.object({
  documentType: z.string().describe("The type of document: 'offer_letter', 'contract', 'nda', 'agreement', 'invoice', 'other', etc."),
  isEmploymentDocument: z.boolean().describe("True if this document is plausibly related to an employment relationship. False for NDAs about other matters, service agreements, invoices, etc."),
  employer: EmployerFindingSchema,
  role: RoleFindingSchema,
  startDate: DateFindingSchema,
  endDate: DateFindingSchema,
  overallConfidence: z.enum(["high", "medium", "low"]).describe("Overall confidence that the document backs the claim."),
  reasoning: z.string().describe("One or two sentences explaining the conclusion. Mention any red flags."),
});

const SYSTEM_PROMPT = `You are an employment-claim verification assistant for Career Ledger, a platform that verifies candidate employment history for hiring workflows.

You receive:
  1. A candidate's CLAIM about their employment: employer, role, start date, optional end date.
  2. The TEXT of a supporting document (typically an offer letter or employment contract).

Your job is to compare the claim against the document and report per-field whether the document backs each part of the claim, with reasoning. Output your findings in the structured format specified by the tool schema.

Rules for matching:

- **Employer matching is semantic, not string-literal.** "Apple Inc." and "Apple" match. "Alphabet Inc." and "Google" match when context confirms the subsidiary. "Meta Platforms" and "Facebook" match. If the document mentions the claimed employer only in passing (e.g., "not affiliated with Apple"), that is NOT a match — it must be identified as the employing entity.

- **Role matching is semantic and level-aware.** "Senior Software Engineer" matches "Senior Engineer" if the document's context (engineering role description) supports it. Level equivalents should be reconciled: "Staff Engineer" ~ "L6 Engineer" ~ "Principal Engineer" depending on the company's ladder. Flag major mismatches (Manager vs IC, Engineering vs Sales).

- **Date matching is fuzzy by month.** Offer letter dates often differ from actual start dates by a few weeks. Same-month is a match. Same-quarter for contracts. If the document says "starting Q2 2026" and the claim says 2026-05-11, that's a match. If the claim says 2020 and the document says 2024, that is NOT a match.

- **Document type matters.** If the document is an NDA about a service engagement, or an invoice, or an unrelated contract, set isEmploymentDocument to false and mark fields as not found — even if the employer name appears somewhere in the text. Only offer letters, employment agreements, and similar employment-relationship documents can back an employment claim.

- **Be conservative.** When in doubt, prefer foundInDocument=false and matchesClaim=false. False positives are worse than false negatives — a false positive leads the system to verify a claim that's not actually supported; a false negative just asks the user to provide better evidence.

- **Explain red flags.** If the document mentions the claimed employer in a non-employment context (client list, competitor mention, boilerplate disclaimer, etc.), call that out in reasoning.

Output exactly one structured response via the tool schema. Do not include any text outside the tool call.`;

export class ClaudeContentExtractor implements ContentExtractor {
  readonly name = "claude";

  private client: Anthropic;
  private model: string;

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        "ClaudeContentExtractor requires ANTHROPIC_API_KEY. Set it in your env or switch to CONTENT_EXTRACTOR=heuristic.",
      );
    }
    this.client = new Anthropic({ apiKey });
    this.model = process.env.ANTHROPIC_MODEL ?? "claude-opus-4-6";
  }

  async extractEmployment(text: string, claim: EmploymentClaim): Promise<ContentMatchSignal> {
    // Trim aggressively so we don't burn tokens on long service agreements.
    // Most offer letters are under 10k characters.
    const MAX_TEXT_LENGTH = 40_000;
    const trimmedText =
      text.length > MAX_TEXT_LENGTH
        ? text.slice(0, MAX_TEXT_LENGTH) + "\n\n[... document truncated at 40,000 characters ...]"
        : text;

    const userMessage = [
      "CLAIM TO VERIFY:",
      `  Employer:   ${claim.employer}`,
      `  Role:       ${claim.role}`,
      `  Start date: ${claim.startDate}`,
      claim.endDate ? `  End date:   ${claim.endDate}` : "  End date:   (not claimed)",
      "",
      "DOCUMENT TEXT:",
      "```",
      trimmedText,
      "```",
    ].join("\n");

    try {
      const response = await this.client.messages.parse({
        model: this.model,
        max_tokens: 4096,
        thinking: { type: "adaptive" },
        system: [
          {
            type: "text",
            text: SYSTEM_PROMPT,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [{ role: "user", content: userMessage }],
        output_config: { format: zodOutputFormat(ExtractionSchema) },
      });

      const parsed = response.parsed_output;
      if (!parsed) {
        return this.failureSignal("claude_parse_failed", "Claude returned a response that could not be parsed against the extraction schema.");
      }

      // If Claude decided this isn't an employment document at all, reject
      // all claim matches regardless of whether the employer name appears.
      if (!parsed.isEmploymentDocument) {
        return {
          employer: null,
          role: null,
          startDate: null,
          endDate: null,
          extractor: this.name,
          matchesClaim: false,
          mismatches: ["employer", "role", "startDate", ...(claim.endDate ? ["endDate"] : [])],
        };
      }

      const mismatches: string[] = [];
      if (!parsed.employer.matchesClaim) mismatches.push("employer");
      if (!parsed.role.matchesClaim) mismatches.push("role");
      if (!parsed.startDate.matchesClaim) mismatches.push("startDate");
      if (claim.endDate && !parsed.endDate.matchesClaim) mismatches.push("endDate");

      return {
        employer: parsed.employer.foundInDocument
          ? parsed.employer.nameInDocument ?? claim.employer
          : null,
        role: parsed.role.foundInDocument ? parsed.role.titleInDocument ?? claim.role : null,
        startDate: parsed.startDate.foundInDocument
          ? parsed.startDate.dateInDocument ?? claim.startDate
          : null,
        endDate: parsed.endDate.foundInDocument
          ? parsed.endDate.dateInDocument ?? claim.endDate ?? null
          : null,
        extractor: this.name,
        matchesClaim: mismatches.length === 0,
        mismatches: mismatches.length > 0 ? mismatches : undefined,
      };
    } catch (err) {
      // Use typed SDK exceptions — don't string-match error messages.
      if (err instanceof Anthropic.AuthenticationError) {
        return this.failureSignal("auth_error", "ANTHROPIC_API_KEY invalid or missing permissions.");
      }
      if (err instanceof Anthropic.RateLimitError) {
        return this.failureSignal("rate_limited", "Claude API rate-limited. Retry later or reduce call rate.");
      }
      if (err instanceof Anthropic.APIError) {
        return this.failureSignal(`api_error_${err.status}`, err.message);
      }
      return this.failureSignal(
        "unexpected",
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  private failureSignal(reason: string, detail: string): ContentMatchSignal {
    console.error(`[claude-content-extractor] ${reason}: ${detail}`);
    return {
      employer: null,
      role: null,
      startDate: null,
      endDate: null,
      extractor: `${this.name} (${reason})`,
      matchesClaim: false,
    };
  }
}
