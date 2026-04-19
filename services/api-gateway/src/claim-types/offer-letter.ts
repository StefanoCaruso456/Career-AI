import { z } from "zod";
import type {
  AuthenticitySignal,
  ConfidenceTier,
  ContentMatchSignal,
  EmploymentClaim,
  TamperingSignal,
  Verdict,
} from "../verifier/types.js";
import { buildContentExtractor } from "../verifier/verifiers/content.js";
import { guessEmployerDomain } from "../verifier/verifiers/authenticity.js";
import { computeVerdict as computeOfferLetterVerdict } from "../verifier/verifiers/verdict.js";
import type {
  ClaimAuthenticityInput,
  ClaimBadgePayloadInput,
  ClaimTypeHandler,
  ClaimVerdictInput,
} from "./types.js";

/**
 * Offer-letter claim handler.
 *
 * Encapsulates everything offer-letter-specific:
 *   - Claim schema (employer, role, startDate, ...).
 *   - Authenticity expectation (the signer domain should match the employer).
 *   - Content extraction (LLM / heuristic offer-letter extractor).
 *   - Verdict rules (the nuanced SOURCE_CONFIRMED ceiling reasoning in
 *     offer-letter-verdict.ts).
 *   - Badge payload shape.
 *
 * The generic submit-claim orchestrator dispatches through this handler; no
 * offer-letter-specific code remains outside this module.
 */

export const VERSION = "0.2.0";

const offerLetterSchema = z.object({
  employer: z.string().min(1).max(200),
  role: z.string().min(1).max(200),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  userAccountName: z.string().min(1).max(200).optional(),
}) satisfies z.ZodType<EmploymentClaim>;

const contentExtractor = buildContentExtractor();

export const offerLetterHandler: ClaimTypeHandler<EmploymentClaim> = {
  kind: "offer-letter",
  group: "employment",
  verifierName: `api-gateway:offer-letter@${VERSION}`,
  schema: offerLetterSchema,

  buildAuthenticityInput(claim: EmploymentClaim): ClaimAuthenticityInput {
    return {
      expectedDomain: guessEmployerDomain(claim.employer),
      expectedDomainLabel: `claimed employer "${claim.employer}"`,
    };
  },

  async extractContent(text: string, claim: EmploymentClaim): Promise<ContentMatchSignal> {
    return contentExtractor.extractEmployment(text, claim);
  },

  computeVerdict(input: ClaimVerdictInput): { verdict: Verdict; confidenceTier: ConfidenceTier } {
    return computeOfferLetterVerdict(input.tampering, input.authenticity, input.content);
  },

  buildBadgePayload(input: ClaimBadgePayloadInput<EmploymentClaim>): unknown {
    const { claim, authenticitySource, confidenceTier, verifiedAt } = input;
    return {
      kind: "bare-offer-letter",
      employer: claim.employer,
      role: claim.role,
      startDate: claim.startDate,
      endDate: claim.endDate,
      authenticitySource,
      confidenceTier,
      verifiedAt,
    };
  },
};

export type { AuthenticitySignal, TamperingSignal };
