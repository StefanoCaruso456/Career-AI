import {
  namesMatchLoosely,
  type ContentExtractor,
  type ContentMatchSignal,
  type EmploymentClaim,
} from "../types.js";
import { OpenAIContentExtractor } from "./content-openai.js";

/**
 * Heuristic content extractor.
 *
 * Uses regex and substring matching to find the claimed employer, role,
 * dates, and recipient in the PDF text. Not LLM-powered — suitable as a
 * fallback when CONTENT_EXTRACTOR is not set to "openai", or when the
 * OpenAI extractor fails to call. Best effort on recipient extraction and
 * offer-letter type detection — the LLM extractor is significantly more
 * accurate on both.
 */
export class HeuristicContentExtractor implements ContentExtractor {
  readonly name = "heuristic";

  async extractEmployment(text: string, claim: EmploymentClaim): Promise<ContentMatchSignal> {
    const normalized = text.replace(/\s+/g, " ").trim();
    const lower = normalized.toLowerCase();
    const mismatches: string[] = [];

    // Employer — case-insensitive substring match against claim.
    // Also strip common suffixes (Inc, LLC, Corp) for loose matching.
    const claimedEmployer = claim.employer.trim();
    const employerCore = stripCompanySuffix(claimedEmployer).toLowerCase();
    const employerFound = lower.includes(claimedEmployer.toLowerCase()) || lower.includes(employerCore);
    const foundEmployer = employerFound ? claimedEmployer : null;
    if (!employerFound) mismatches.push("employer");

    // Role — substring match. Allow partial matches ("Software Engineer" inside "Senior Software Engineer").
    const claimedRole = claim.role.trim();
    const roleCore = claimedRole.toLowerCase();
    const roleFound = lower.includes(roleCore) || fuzzyRoleMatch(lower, roleCore);
    const foundRole = roleFound ? claimedRole : null;
    if (!roleFound) mismatches.push("role");

    // Dates — look for ISO dates or common formats anywhere in the text.
    const dates = extractDates(normalized);
    const startFound = dates.some((d) => datesAlign(d, claim.startDate));
    const endFound = claim.endDate ? dates.some((d) => datesAlign(d, claim.endDate!)) : true;
    if (!startFound) mismatches.push("startDate");
    if (claim.endDate && !endFound) mismatches.push("endDate");

    const foundStart = startFound ? claim.startDate : null;
    const foundEnd = claim.endDate && endFound ? claim.endDate : null;

    // Offer-letter type detection — heuristic. Look for phrases that are
    // strong indicators of a job offer extension. Weak signal compared to
    // the LLM extractor, but better than no check at all.
    const isOfferLetter = OFFER_LETTER_MARKERS.some((marker) => lower.includes(marker));
    if (!isOfferLetter) mismatches.push("documentType");

    // Recipient extraction — "Dear <name>," salutation or a "To: <name>"
    // header. Best-effort: if neither pattern matches, skip the check.
    const recipient = extractRecipientName(normalized);
    if (claim.userAccountName) {
      const recipientMatches = namesMatchLoosely(recipient, claim.userAccountName);
      // null → unknown → no mismatch recorded (don't penalize when we
      // couldn't extract a recipient from the document text).
      if (recipientMatches === false) mismatches.push("recipient");
    }

    return {
      employer: foundEmployer,
      role: foundRole,
      startDate: foundStart,
      endDate: foundEnd,
      recipient,
      isOfferLetter,
      extractor: this.name,
      matchesClaim: mismatches.length === 0,
      mismatches: mismatches.length > 0 ? mismatches : undefined,
    };
  }
}

/**
 * Phrases commonly found in offer letters but not in other employment docs.
 * All lowercase for substring matching against the normalized text.
 */
const OFFER_LETTER_MARKERS = [
  "offer of employment",
  "offer you the position",
  "pleased to offer",
  "thrilled to offer",
  "excited to offer",
  "this offer letter",
  "please sign and return",
];

/**
 * Extracts the offer recipient's name from common salutation patterns.
 * Returns null when neither pattern matches. Intentionally conservative —
 * a false-negative here just skips the recipient check rather than
 * triggering a wrong verdict.
 */
function extractRecipientName(text: string): string | null {
  // "Dear Jordan Smith," / "Dear Jordan," — anchor on the comma/colon.
  const dearMatch = text.match(/\bDear\s+([A-Z][\w'-]+(?:\s+[A-Z][\w'-]+){0,3})\s*[,:]/);
  if (dearMatch) return dearMatch[1].trim();

  // "To: Jordan Smith" — block-style address header.
  const toMatch = text.match(/\bTo:\s+([A-Z][\w'-]+(?:\s+[A-Z][\w'-]+){0,3})\b/);
  if (toMatch) return toMatch[1].trim();

  return null;
}

function stripCompanySuffix(name: string): string {
  return name.replace(/\b(inc\.?|incorporated|llc|l\.l\.c\.|corp\.?|corporation|ltd\.?|limited|gmbh|co\.?|company)\b/gi, "").replace(/\s+/g, " ").trim();
}

function fuzzyRoleMatch(text: string, role: string): boolean {
  // Split the claimed role into tokens and require all non-trivial tokens to appear
  // somewhere in the text. Catches "Senior Software Engineer" when text says
  // "appointed as a Software Engineer (Senior level)".
  const tokens = role.split(/\s+/).filter((t) => t.length >= 3);
  if (tokens.length === 0) return false;
  return tokens.every((t) => text.includes(t));
}

function extractDates(text: string): string[] {
  // ISO dates, US m/d/yyyy, long form "January 15, 2020"
  const iso = text.match(/\b\d{4}-\d{2}-\d{2}\b/g) ?? [];
  const us = text.match(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g) ?? [];
  const long = text.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2},?\s+\d{4}\b/gi) ?? [];
  return [...iso, ...us, ...long].map((d) => normalizeDate(d));
}

function normalizeDate(d: string): string {
  // Try to coerce to YYYY-MM-DD for comparison. Best effort.
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(d)) {
    const [m, day, y] = d.split("/");
    const year = y.length === 2 ? `20${y}` : y;
    return `${year}-${m.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  const parsed = new Date(d);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return d;
}

function datesAlign(found: string, claimed: string): boolean {
  // Exact match is the happy path.
  if (found === claimed) return true;
  // Allow "same month" match — offer letter might say start of Jan but claim says Jan 15.
  if (found.slice(0, 7) === claimed.slice(0, 7)) return true;
  return false;
}

export function buildContentExtractor(): ContentExtractor {
  const kind = process.env.CONTENT_EXTRACTOR ?? "heuristic";
  switch (kind) {
    case "heuristic":
      return new HeuristicContentExtractor();
    case "openai":
      return new OpenAIContentExtractor();
    default:
      throw new Error(`Unknown CONTENT_EXTRACTOR: ${kind}. Supported: heuristic, openai.`);
  }
}
