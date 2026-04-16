import { normalizeLocationPhrase } from "./location-normalizer";
import { extractCanonicalSkills } from "./skill-taxonomy";
import { expandTitleTerms } from "./title-taxonomy";
import type {
  EmploymentType,
  JobSearchRequestV2,
  SeniorityLevel,
  WorkplaceType,
} from "./types";
import {
  normalizeText,
  parseSalaryText,
  startOfDayInTimeZone,
  startOfWeekInTimeZone,
  tokenize,
  uniqueStrings,
} from "./utils";

const SEARCH_STOPWORDS = new Set([
  "24",
  "a",
  "an",
  "and",
  "at",
  "find",
  "hours",
  "for",
  "in",
  "jobs",
  "last",
  "me",
  "open",
  "posted",
  "positions",
  "roles",
  "show",
  "the",
]);

function extractCompanies(prompt: string) {
  const match = prompt.match(
    /\b(?:at|from)\s+(.+?)(?=(?:\s+\b(?:in|near|around|with|requiring|on|posted|over|under|above|below|salary|remote|hybrid|onsite|today|last|past|this|new|recent|jobs?|roles?|positions?)\b|$))/i,
  );

  if (!match?.[1]) {
    return [];
  }

  return match[1]
    .replace(/\bor\b/gi, ",")
    .replace(/\band\b/gi, ",")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, 6);
}

function extractLocation(prompt: string) {
  const explicitMatch = prompt.match(
    /\b(?:in|near|around)\s+(.+?)(?=(?:\s+\b(?:at|from|with|requiring|on|posted|over|under|above|below|salary|today|last|past|this|remote|hybrid|onsite|jobs?|roles?|positions?)\b|$))/i,
  );

  if (explicitMatch?.[1]) {
    if (
      /\b(last|past|today|this week|hours?|days?)\b/i.test(explicitMatch[1]) ||
      ["the", "me"].includes(normalizeText(explicitMatch[1]))
    ) {
      return null;
    }

    return normalizeLocationPhrase(explicitMatch[1]);
  }

  if (/\bremote us\b/i.test(prompt)) {
    return normalizeLocationPhrase("remote us");
  }

  return null;
}

function extractWorkplaceType(prompt: string): WorkplaceType | null {
  const normalized = normalizeText(prompt);

  if (/\bremote\b/.test(normalized)) {
    return "remote";
  }

  if (/\bhybrid\b/.test(normalized)) {
    return "hybrid";
  }

  if (/\b(on[- ]site|onsite)\b/.test(normalized)) {
    return "onsite";
  }

  return null;
}

function extractSeniority(prompt: string): SeniorityLevel | null {
  const match = prompt.match(
    /\b(intern|entry|junior|associate|mid|senior|staff|principal|director|head|vp|vice president|executive)\b/i,
  );
  const normalized = normalizeText(match?.[1]);

  if (!normalized) {
    return null;
  }

  if (normalized === "junior" || normalized === "entry") {
    return "entry";
  }

  if (normalized === "head") {
    return "director";
  }

  if (normalized === "vice president") {
    return "vp";
  }

  return normalized as SeniorityLevel;
}

function extractEmploymentType(prompt: string): EmploymentType | null {
  const match = prompt.match(/\b(full[ -]?time|part[ -]?time|contract|contractor|temporary|temp|internship|intern)\b/i);
  const normalized = normalizeText(match?.[1]);

  if (!normalized) {
    return null;
  }

  if (normalized.includes("full")) {
    return "full_time";
  }

  if (normalized.includes("part")) {
    return "part_time";
  }

  if (normalized.includes("contract")) {
    return "contract";
  }

  if (normalized.includes("intern")) {
    return "internship";
  }

  return "temporary";
}

function extractSkills(prompt: string) {
  const explicitSection = prompt.match(/\b(?:with|requiring|need(?:ing)?|using)\s+(.+?)(?=(?:\s+\b(?:on|in|at|from|posted|over|under|today|last|past|this|jobs?|roles?|positions?)\b|$))/i)?.[1] ?? "";

  return uniqueStrings(extractCanonicalSkills(`${prompt}\n${explicitSection}`)).slice(0, 10);
}

function extractTeam(prompt: string) {
  const explicitTeamMatch = prompt.match(/\bon\s+([a-z0-9&/ -]+?)\s+teams?\b/i);
  const fallbackMatch = prompt.match(/\bwith\s+([a-z0-9&/ -]+?)\s+teams?\b/i);
  const match = explicitTeamMatch ?? fallbackMatch;

  return match?.[1]?.trim() ? [match[1].trim()] : [];
}

function extractTitle(prompt: string, companies: string[], locationPhrase: string | null) {
  const stripped = prompt
    .replace(/\b(find|show me|search(?: for)?|surface|browse|pull)\b/gi, " ")
    .replace(/\b(new|latest|recent|recently posted|today|last \d+ hours?|past \d+ days?|this week)\b/gi, " ")
    .replace(/\bposted\b.*$/i, " ")
    .replace(/\b(remote|hybrid|onsite|on-site)\b/gi, " ")
    .replace(/\b(?:at|from)\s+[a-z0-9&.,' -]+/gi, " ")
    .replace(/\b(?:in|near|around)\s+[a-z0-9&.,' -]+/gi, " ")
    .replace(/\b(?:with|requiring|on)\s+[a-z0-9&.,' -]+/gi, " ")
    .replace(/\b(over|under|above|below|at least|salary transparency only|highest paying)\b/gi, " ")
    .replace(/\bjobs?\b|\broles?\b|\bpositions?\b|\bopenings?\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  const cleaned = companies.reduce(
    (result, company) => result.replace(new RegExp(`\\b${company.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi"), " "),
    stripped,
  );
  const withoutLocation = locationPhrase
    ? cleaned.replace(new RegExp(`\\b${locationPhrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi"), " ")
    : cleaned;
  const normalized = withoutLocation.replace(/\s+/g, " ").trim();

  if (!normalized) {
    return {
      clusters: [],
      families: [],
      titles: [],
    };
  }

  return expandTitleTerms([normalized]);
}

function extractRecency(prompt: string, now: Date, timeZone: string) {
  if (/\blast 24 hours?\b/i.test(prompt)) {
    return {
      label: "last_24_hours" as const,
      posted_since: new Date(now.getTime() - 24 * 60 * 60 * 1_000).toISOString(),
      posted_within_hours: 24,
    };
  }

  const dayMatch = prompt.match(/\b(?:past|last)\s+(\d+)\s+days?\b/i);

  if (dayMatch?.[1]) {
    const days = Number.parseInt(dayMatch[1], 10);

    if (days === 3) {
      return {
        label: "last_3_days" as const,
        posted_since: new Date(now.getTime() - 72 * 60 * 60 * 1_000).toISOString(),
        posted_within_hours: 72,
      };
    }

    return {
      label: "custom" as const,
      posted_since: new Date(now.getTime() - days * 24 * 60 * 60 * 1_000).toISOString(),
      posted_within_hours: days * 24,
    };
  }

  if (/\btoday\b/i.test(prompt)) {
    return {
      label: "today" as const,
      posted_since: startOfDayInTimeZone(now, timeZone).toISOString(),
      posted_within_hours: undefined,
    };
  }

  if (/\bthis week\b/i.test(prompt)) {
    return {
      label: "this_week" as const,
      posted_since: startOfWeekInTimeZone(now, timeZone).toISOString(),
      posted_within_hours: undefined,
    };
  }

  if (/\b(new jobs?|recent jobs?|recently posted|latest jobs?)\b/i.test(prompt)) {
    return {
      label: "last_7_days" as const,
      posted_since: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1_000).toISOString(),
      posted_within_hours: 168,
    };
  }

  return undefined;
}

function extractKeywords(prompt: string, knownTerms: string[]) {
  const terms = tokenize(prompt).filter((token) => !SEARCH_STOPWORDS.has(token));
  const filtered = terms.filter((term) => !knownTerms.some((known) => normalizeText(known) === term));

  return uniqueStrings(filtered).slice(0, 12);
}

export function parseJobSearchRequest(
  rawQuery: string,
  options?: {
    now?: Date;
    timeZone?: string;
  },
): JobSearchRequestV2 {
  const now = options?.now ?? new Date();
  const timeZone = options?.timeZone ?? "America/Chicago";
  const prompt = rawQuery.trim();
  const companies = extractCompanies(prompt);
  const location = extractLocation(prompt);
  const workplaceType = extractWorkplaceType(prompt);
  const seniority = extractSeniority(prompt);
  const employmentType = extractEmploymentType(prompt);
  const skills = extractSkills(prompt);
  const team = extractTeam(prompt);
  const title = extractTitle(prompt, companies, location?.original ?? null);
  const compensation = parseSalaryText(
    prompt.replace(/\b(?:last|past)\s+\d+\s+(?:hours?|days?|weeks?)\b/gi, " "),
  );
  const highestPaying = /\b(highest paying|top paying|best paying)\b/i.test(prompt);
  const salaryTransparencyOnly = /\b(salary transparency only|salary listed only)\b/i.test(prompt);
  const strictMinimum = /\b(over|above|at least|minimum|min)\b/i.test(prompt);
  const recency = extractRecency(prompt, now, timeZone);
  const sponsorship = /\bsponsorship\b/i.test(prompt);
  const clearance = /\bclearance\b/i.test(prompt);
  const knownTerms = [
    ...companies,
    location?.original ?? "",
    ...title.titles,
    ...skills,
    ...team,
    seniority ?? "",
    employmentType ?? "",
    workplaceType ?? "",
  ];
  const keywords = extractKeywords(prompt, knownTerms);

  return {
    filters: {
      company: companies.length > 0 ? { include: companies } : undefined,
      compensation:
        compensation.min !== null ||
        compensation.max !== null ||
        highestPaying ||
        salaryTransparencyOnly
          ? {
              currency: compensation.currency ?? "USD",
              highest_paying: highestPaying || undefined,
              max: compensation.max ?? undefined,
              min: compensation.min ?? undefined,
              period: compensation.period === "unknown" ? "yearly" : compensation.period,
              salary_transparency_only: salaryTransparencyOnly || undefined,
              strict_minimum: strictMinimum || undefined,
            }
          : undefined,
      eligibility:
        sponsorship || clearance
          ? {
              clearance_required: clearance || undefined,
              sponsorship_available: sponsorship ? true : undefined,
            }
          : undefined,
      employment_type: employmentType ? { include: [employmentType] } : undefined,
      location: location
        ? {
            allow_remote_fallback: /\bor remote\b/i.test(prompt) || workplaceType === "remote" || undefined,
            city: location.city ? [location.city] : undefined,
            country: location.country ? [location.country] : undefined,
            country_code: location.country_code ? [location.country_code] : undefined,
            metro: location.metro ? [location.metro] : undefined,
            state: location.state ? [location.state] : undefined,
            state_code: location.state_code ? [location.state_code] : undefined,
          }
        : undefined,
      recency,
      seniority: seniority ? { include: [seniority] } : undefined,
      skills:
        skills.length > 0
          ? {
              include: skills,
              required: skills,
            }
          : undefined,
      team: team.length > 0 ? { include: team } : undefined,
      title:
        title.titles.length > 0 || title.families.length > 0 || title.clusters.length > 0
          ? {
              clusters: title.clusters,
              family: title.families,
              include: title.titles,
              seniority: seniority ? [seniority] : undefined,
            }
          : undefined,
      workplace_type: workplaceType ? { include: [workplaceType] } : undefined,
    },
    intent: "find_jobs",
    keywords,
    raw_query: prompt,
    sort: {
      primary: highestPaying ? "compensation" : recency ? "recency" : "relevance",
      secondary: highestPaying ? "relevance" : recency ? "relevance" : "recency",
    },
    widening_policy: {
      enabled: true,
      minimum_exact_matches: 1,
    },
  };
}
