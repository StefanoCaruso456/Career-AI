import type { JobPostingDto } from "@/packages/contracts/src";
import { inferJobWorkplaceType } from "../metadata";
import { normalizeLocationPhrase, parseJobLocation } from "./location-normalizer";
import { extractCanonicalSkills } from "./skill-taxonomy";
import { normalizeTitlePhrase } from "./title-taxonomy";
import type {
  CanonicalJobRecord,
  EmploymentType,
  JobStatus,
  SeniorityLevel,
  WorkplaceType,
} from "./types";
import { chunkText, flattenPayloadStrings, normalizeText, parseSalaryText, uniqueStrings } from "./utils";

const INDUSTRY_KEYWORDS: Array<{ canonical: string; patterns: RegExp[] }> = [
  { canonical: "Artificial Intelligence", patterns: [/\b(ai|artificial intelligence|genai|llm)\b/i] },
  { canonical: "Healthcare", patterns: [/\b(healthcare|health care|clinical|medical|hospital)\b/i] },
  { canonical: "Fintech", patterns: [/\b(fintech|payments|banking|financial)\b/i] },
  { canonical: "SaaS", patterns: [/\b(saas|software as a service|enterprise software)\b/i] },
];

function inferEmploymentType(value: string | null | undefined): EmploymentType {
  const normalized = normalizeText(value);

  if (!normalized) {
    return "unknown";
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

  if (normalized.includes("temp")) {
    return "temporary";
  }

  return "unknown";
}

function inferSeniority(text: string): SeniorityLevel {
  if (/\b(intern|internship)\b/i.test(text)) {
    return "intern";
  }

  if (/\b(entry|junior)\b/i.test(text)) {
    return "entry";
  }

  if (/\bassociate\b/i.test(text)) {
    return "associate";
  }

  if (/\bmid\b/i.test(text)) {
    return "mid";
  }

  if (/\bsenior\b/i.test(text)) {
    return "senior";
  }

  if (/\bstaff\b/i.test(text)) {
    return "staff";
  }

  if (/\bprincipal\b/i.test(text)) {
    return "principal";
  }

  if (/\b(director|head)\b/i.test(text)) {
    return "director";
  }

  if (/\b(vp|vice president)\b/i.test(text)) {
    return "vp";
  }

  if (/\b(executive|chief|cxo)\b/i.test(text)) {
    return "executive";
  }

  return "unknown";
}

function inferStatus(job: JobPostingDto): JobStatus {
  if (["expired", "invalid", "duplicate", "blocked_source"].includes(job.validationStatus ?? "")) {
    return "closed";
  }

  return "active";
}

function collectCompensationText(job: JobPostingDto) {
  const payloadStrings = flattenPayloadStrings(job.rawPayload);
  const compensationStrings = payloadStrings.filter((entry) =>
    /\b(salary|compensation|pay|range|base salary|ote)\b/i.test(entry),
  );

  return uniqueStrings([job.salaryText, ...compensationStrings]).join("\n");
}

function extractSectionSkills(text: string, matcher: RegExp) {
  const matchingLines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && matcher.test(line))
    .join("\n");

  return extractCanonicalSkills(matchingLines);
}

function inferIndustries(text: string) {
  return INDUSTRY_KEYWORDS.filter((entry) => entry.patterns.some((pattern) => pattern.test(text))).map(
    (entry) => entry.canonical,
  );
}

function inferEligibility(text: string) {
  const normalized = normalizeText(text);
  const clearanceMatch = text.match(/\b(secret|top secret|public trust|ts\/sci)\b/i);

  return {
    clearance_required:
      /\b(clearance required|must hold clearance|eligible for clearance|security clearance)\b/i.test(text) ||
      clearanceMatch !== null,
    clearance_type: clearanceMatch?.[1] ?? null,
    sponsorship_available:
      /\b(visa sponsorship available|sponsorship available|supports sponsorship)\b/i.test(text)
        ? true
        : /\b(no sponsorship|without sponsorship|unable to sponsor|cannot sponsor)\b/i.test(text)
          ? false
          : normalized.includes("sponsorship")
            ? false
            : null,
  };
}

function inferYearsExperience(text: string) {
  const matches = Array.from(text.matchAll(/(\d+)\+?\s+years?\s+(?:of\s+)?experience/gi))
    .map((match) => Number.parseInt(match[1] ?? "0", 10))
    .filter(Number.isFinite);

  if (matches.length === 0) {
    return {
      max: null,
      min: null,
    };
  }

  return {
    max: Math.max(...matches),
    min: Math.min(...matches),
  };
}

function inferDegreeRequirements(text: string) {
  return uniqueStrings([
    /\bbachelor'?s\b/i.test(text) ? "Bachelor's" : null,
    /\bmaster'?s\b/i.test(text) ? "Master's" : null,
    /\bphd\b/i.test(text) ? "PhD" : null,
  ]);
}

function buildDescriptionText(job: JobPostingDto) {
  return uniqueStrings([job.descriptionSnippet, ...flattenPayloadStrings(job.rawPayload)]).join("\n");
}

export function mapToCanonicalJobRecord(job: JobPostingDto): CanonicalJobRecord {
  const titleMatch = normalizeTitlePhrase(job.title);
  const descriptionText = buildDescriptionText(job);
  const normalizedDescription = normalizeText(descriptionText);
  const workplaceType = (job.workplaceType ?? inferJobWorkplaceType(job.location)) as WorkplaceType;
  const location = parseJobLocation({
    raw: job.location,
    workplaceType,
  });
  const compensationText = collectCompensationText(job);
  const compensation = parseSalaryText(compensationText);
  const requiredSkills = extractSectionSkills(descriptionText, /\b(required|requirements|must have|must-haves?|experience with)\b/i);
  const preferredSkills = extractSectionSkills(descriptionText, /\b(preferred|nice to have|bonus|plus)\b/i).filter(
    (skill) => !requiredSkills.includes(skill),
  );
  const allSkills = uniqueStrings([
    ...requiredSkills,
    ...preferredSkills,
    ...extractCanonicalSkills(descriptionText),
  ]);
  const yearsExperience = inferYearsExperience(descriptionText);
  const industries = inferIndustries(descriptionText);
  const teamName = job.department?.trim() || null;
  const normalizedTeam = teamName ? normalizeText(teamName) : null;
  const normalizedLocation = normalizeLocationPhrase(job.location);

  return {
    compensation: {
      compensation_tokens: uniqueStrings([
        compensation.rawText,
        compensation.period,
        compensation.currency,
      ]),
      salary_currency: compensation.currency,
      salary_max: compensation.max,
      salary_min: compensation.min,
      salary_period: compensation.period,
    },
    company: {
      aliases: uniqueStrings([job.companyName, job.normalizedCompanyName]),
      name: job.companyName,
      normalized_name: job.normalizedCompanyName ?? normalizeText(job.companyName),
    },
    description: {
      normalized_text: normalizedDescription,
      raw_text: descriptionText,
      searchable_chunks: chunkText(descriptionText, 90),
    },
    eligibility: inferEligibility(descriptionText),
    employment_type: {
      value: inferEmploymentType(job.commitment),
    },
    job_id: job.id,
    keywords: {
      domains: industries,
      industries,
      responsibilities: [],
      tools: allSkills,
    },
    location: {
      city: location.city ?? normalizedLocation?.city ?? null,
      country: location.country,
      country_code: location.country_code,
      hybrid_allowed: location.hybrid_allowed,
      location_tokens: location.location_tokens,
      metro: location.metro,
      onsite_required: location.onsite_required,
      raw: location.raw,
      remote_allowed: location.remote_allowed,
      state: location.state,
      state_code: location.state_code,
      timezone: location.timezone,
    },
    posted_at: job.postedAt,
    requirements: {
      certifications: [],
      degree_requirements: inferDegreeRequirements(descriptionText),
      preferred_skills: preferredSkills,
      required_skills: requiredSkills.length > 0 ? requiredSkills : allSkills,
      years_experience_max: yearsExperience.max,
      years_experience_min: yearsExperience.min,
    },
    seniority: {
      value: inferSeniority(`${job.title}\n${descriptionText}`),
    },
    source: job.sourceKey,
    source_job: job,
    source_job_url: job.canonicalJobUrl ?? job.canonicalApplyUrl ?? job.applyUrl,
    status: inferStatus(job),
    team: {
      department: teamName,
      name: teamName,
      normalized_name: normalizedTeam,
      org: null,
    },
    title: job.title,
    title_cluster: titleMatch?.cluster ?? null,
    title_family: titleMatch?.family ?? null,
    title_normalized: titleMatch?.canonical ?? normalizeText(job.title),
    title_tokens: uniqueStrings([job.title, titleMatch?.canonical, titleMatch?.family]).flatMap((value) =>
      value.split(/\s+/),
    ),
    updated_at: job.updatedAt,
    workplace_type: {
      value: workplaceType,
    },
  };
}

export function mapJobsToCanonicalRecords(jobs: JobPostingDto[]) {
  return jobs.map(mapToCanonicalJobRecord);
}
