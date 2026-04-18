import type { ContentExtractor, ContentMatchSignal, EmploymentClaim } from "../types.js";
import { ClaudeContentExtractor } from "./content-claude.js";

/**
 * Heuristic content extractor.
 *
 * Uses regex and substring matching to find the claimed employer, role, and
 * dates in the PDF text. Not LLM-powered — suitable for structured, typical
 * offer letters.
 *
 * Future: ClaudeContentExtractor that hits the Anthropic API. Same interface,
 * drop-in replacement.
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

    return {
      employer: foundEmployer,
      role: foundRole,
      startDate: foundStart,
      endDate: foundEnd,
      extractor: this.name,
      matchesClaim: mismatches.length === 0,
      mismatches: mismatches.length > 0 ? mismatches : undefined,
    };
  }
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
    case "claude":
      return new ClaudeContentExtractor();
    default:
      throw new Error(`Unknown CONTENT_EXTRACTOR: ${kind}`);
  }
}
