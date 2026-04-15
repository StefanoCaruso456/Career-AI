import { load } from "cheerio";
import sanitizeHtml from "sanitize-html";
import {
  jobDetailsSchema,
  type JobDetailsDto,
  type JobDetailsSource,
  type JobPostingDto,
} from "@/packages/contracts/src";
import {
  getPersistedJobPostingById,
  isDatabaseConfigured,
} from "@/packages/persistence/src";
import { getLiveJobPostingById } from "./service";

type SectionKey =
  | "summary"
  | "responsibilities"
  | "qualifications"
  | "preferredQualifications"
  | "salary";

type SectionExtraction = {
  preferredQualifications: string[];
  qualifications: string[];
  responsibilities: string[];
  salaryText: string | null;
  summary: string | null;
};

type JobPostingJsonLd = {
  applicantLocationRequirements?: {
    name?: string;
  };
  datePosted?: string;
  description?: string;
  employmentType?: string;
  hiringOrganization?: {
    name?: string;
  };
  identifier?: {
    value?: string;
  };
  jobLocation?: {
    address?: {
      addressCountry?: string;
      addressLocality?: string;
    };
  };
  jobLocationType?: string;
  title?: string;
};

const ALLOWED_DESCRIPTION_TAGS = [
  "a",
  "blockquote",
  "br",
  "em",
  "h2",
  "h3",
  "h4",
  "li",
  "ol",
  "p",
  "strong",
  "ul",
] as const;

const SECTION_LABEL_PATTERNS: Array<{
  key: SectionKey;
  patterns: RegExp[];
}> = [
  {
    key: "summary",
    patterns: [
      /\bsummary\b/i,
      /\boverview\b/i,
      /\babout the role\b/i,
      /\babout this role\b/i,
      /\babout the opportunity\b/i,
    ],
  },
  {
    key: "responsibilities",
    patterns: [
      /\bresponsibilit(?:y|ies)\b/i,
      /\bwhat you'll do\b/i,
      /\bwhat you will do\b/i,
      /\bwhat you’ll do\b/i,
      /\byour impact\b/i,
      /\bkey duties\b/i,
      /\bprimary duties\b/i,
      /\bvos principales missions?\b/i,
      /\bmissions principales\b/i,
    ],
  },
  {
    key: "qualifications",
    patterns: [
      /\bqualifications?\b/i,
      /\brequirements?\b/i,
      /\bwhat we're looking for\b/i,
      /\bwhat we’re looking for\b/i,
      /\bwho you are\b/i,
      /\byou should have\b/i,
      /\bskills and experience\b/i,
      /\best fait pour vous si vous avez\b/i,
    ],
  },
  {
    key: "preferredQualifications",
    patterns: [
      /\bpreferred qualifications?\b/i,
      /\bnice to have\b/i,
      /\bbonus points\b/i,
      /\bpreferred\b/i,
      /\byou'll thrive if you have\b/i,
      /\byou’ll thrive if you have\b/i,
      /\bvous tirez votre épingle du jeu si vous avez\b/i,
      /\bun plus si\b/i,
    ],
  },
  {
    key: "salary",
    patterns: [
      /\bcompensation\b/i,
      /\bsalary\b/i,
      /\bpay range\b/i,
      /\brémunération\b/i,
      /\bpackage\b/i,
    ],
  },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeWhitespace(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const normalized = value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();

  return normalized.length > 0 ? normalized : null;
}

function formatDisplayText(value: string | null | undefined) {
  const normalized = normalizeWhitespace(value);

  if (!normalized) {
    return null;
  }

  return normalized
    .replace(/[_-]+/g, " ")
    .split(" ")
    .map((segment) =>
      segment.length > 0
        ? `${segment.charAt(0).toUpperCase()}${segment.slice(1).toLowerCase()}`
        : segment,
    )
    .join(" ");
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;|&#x27;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sanitizeJobDescriptionHtml(value: string | null | undefined) {
  const normalized = normalizeWhitespace(value);

  if (!normalized) {
    return null;
  }

  const sanitized = sanitizeHtml(decodeHtmlEntities(normalized), {
    allowedAttributes: {
      a: ["href"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowedTags: [...ALLOWED_DESCRIPTION_TAGS],
    nonTextTags: ["script", "style", "textarea", "noscript"],
    transformTags: {
      a: (_tagName, attribs) => {
        const href = attribs.href?.trim();

        if (!href || /^javascript:/i.test(href)) {
          return {
            attribs: {},
            tagName: "span",
          };
        }

        return {
          attribs: {
            href,
            rel: "noreferrer noopener",
            target: "_blank",
          },
          tagName: "a",
        };
      },
    },
  }).trim();

  if (!sanitized) {
    return null;
  }

  const $ = load(`<div>${sanitized}</div>`);

  $("*")
    .toArray()
    .forEach((element) => {
      const tagName = element.tagName?.toLowerCase();

      if (!tagName || tagName === "br") {
        return;
      }

      const text = normalizeWhitespace($(element).text());

      if (!text && $(element).children().length === 0) {
        $(element).remove();
      }
    });

  const cleaned = $("div").html()?.trim() ?? "";

  return cleaned.length > 0 ? cleaned : null;
}

function htmlToText(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const text = normalizeWhitespace(load(`<div>${value}</div>`)("div").text());

  return text;
}

function pushUnique(target: string[], value: string | null) {
  if (!value || target.includes(value)) {
    return;
  }

  target.push(value);
}

function splitListItems(value: string) {
  return value
    .split(/\n{2,}|\s*•\s*|\s*[\u2022\u25CF]\s*|;\s+/)
    .map((item) => normalizeWhitespace(item))
    .filter((item): item is string => Boolean(item));
}

function resolveSectionKey(label: string) {
  return (
    SECTION_LABEL_PATTERNS.find(({ patterns }) => patterns.some((pattern) => pattern.test(label)))?.key ??
    null
  );
}

function extractSectionsFromHtml(value: string | null) {
  const emptySections: SectionExtraction = {
    preferredQualifications: [],
    qualifications: [],
    responsibilities: [],
    salaryText: null,
    summary: null,
  };

  if (!value) {
    return emptySections;
  }

  const $ = load(`<section>${value}</section>`);
  const section = $("section").first();
  let activeSection: SectionKey | null = null;

  section.children().each((_, node) => {
    if (node.type !== "tag") {
      const text = normalizeWhitespace($(node).text());

      if (!activeSection && text && !emptySections.summary) {
        emptySections.summary = text;
      }

      return;
    }

    const tagName = node.tagName.toLowerCase();
    const text = normalizeWhitespace($(node).text());

    if (!text) {
      return;
    }

    if (/^h[1-6]$/.test(tagName)) {
      activeSection = resolveSectionKey(text);
      return;
    }

    if (!activeSection && !emptySections.summary) {
      emptySections.summary = text;
    }

    if (activeSection === "salary") {
      emptySections.salaryText = emptySections.salaryText ?? text;
      return;
    }

    if (
      activeSection === "responsibilities" ||
      activeSection === "qualifications" ||
      activeSection === "preferredQualifications"
    ) {
      const items =
        tagName === "ul" || tagName === "ol"
          ? $(node)
              .find("li")
              .toArray()
              .map((item) => normalizeWhitespace($(item).text()))
              .filter((item): item is string => Boolean(item))
          : splitListItems(text);

      items.forEach((item) => {
        pushUnique(emptySections[activeSection], item);
      });
    }
  });

  return emptySections;
}

function extractSectionsFromText(value: string | null) {
  const emptySections: SectionExtraction = {
    preferredQualifications: [],
    qualifications: [],
    responsibilities: [],
    salaryText: null,
    summary: null,
  };

  if (!value) {
    return emptySections;
  }

  const normalized = value.replace(/\r\n/g, "\n");
  const markers = SECTION_LABEL_PATTERNS.flatMap(({ key, patterns }) =>
    patterns
      .map((pattern) => {
        const match = normalized.match(pattern);

        if (!match || typeof match.index !== "number") {
          return null;
        }

        return {
          index: match.index,
          key,
          label: match[0],
        };
      })
      .filter((entry): entry is { index: number; key: SectionKey; label: string } => Boolean(entry)),
  )
    .sort((left, right) => left.index - right.index)
    .filter(
      (entry, index, array) =>
        array.findIndex((candidate) => candidate.key === entry.key) === index,
    );

  if (markers.length === 0) {
    emptySections.summary = normalizeWhitespace(normalized);
    return emptySections;
  }

  emptySections.summary = normalizeWhitespace(normalized.slice(0, markers[0].index));

  markers.forEach((marker, index) => {
    const nextIndex = markers[index + 1]?.index ?? normalized.length;
    const sectionBody = normalizeWhitespace(
      normalized
        .slice(marker.index + marker.label.length, nextIndex)
        .replace(/^[:\-\s]+/, ""),
    );

    if (!sectionBody) {
      return;
    }

    if (marker.key === "salary") {
      emptySections.salaryText = sectionBody;
      return;
    }

    if (marker.key === "summary") {
      emptySections.summary = emptySections.summary ?? sectionBody;
      return;
    }

    splitListItems(sectionBody).forEach((item) => {
      pushUnique(emptySections[marker.key], item);
    });
  });

  return emptySections;
}

function inferJobDetailsSource(job: Pick<JobPostingDto, "applyUrl" | "canonicalJobUrl" | "sourceKey">) {
  const value = `${job.sourceKey} ${job.canonicalJobUrl ?? job.applyUrl}`.toLowerCase();

  if (value.includes("workday")) {
    return "workday" satisfies JobDetailsSource;
  }

  if (value.includes("greenhouse")) {
    return "greenhouse" satisfies JobDetailsSource;
  }

  if (value.includes("lever")) {
    return "lever" satisfies JobDetailsSource;
  }

  if (value.includes("ashby")) {
    return "ashby" satisfies JobDetailsSource;
  }

  if (value.includes("workable")) {
    return "workable" satisfies JobDetailsSource;
  }

  if (value.includes("linkedin")) {
    return "linkedin" satisfies JobDetailsSource;
  }

  return "other" satisfies JobDetailsSource;
}

function createMetadata(job: JobPostingDto) {
  const metadataEntries = Object.entries({
    "Application path": formatDisplayText(job.applicationPathType),
    Department: job.department,
    "Workplace type": formatDisplayText(job.workplaceType),
  }).filter(([, value]) => value !== null);

  return metadataEntries.length > 0
    ? Object.fromEntries(metadataEntries)
    : null;
}

function createBaseDetails(job: JobPostingDto, source: JobDetailsSource): JobDetailsDto {
  return jobDetailsSchema.parse({
    company: job.companyName,
    contentStatus: job.descriptionSnippet ? "partial" : "unavailable",
    descriptionHtml: null,
    descriptionText: job.descriptionSnippet,
    employmentType: job.commitment,
    externalJobId: job.externalSourceJobId ?? job.externalId,
    fallbackMessage: job.descriptionSnippet
      ? "Career AI is still normalizing the full job description for in-app reading."
      : "Full job details are unavailable right now. You can still open the original post or apply directly.",
    id: job.id,
    location: job.location,
    metadata: createMetadata(job),
    postedAt: job.updatedAt ?? job.postedAt,
    preferredQualifications: [],
    qualifications: [],
    responsibilities: [],
    salaryText: job.salaryText ?? null,
    source,
    sourceLabel: job.sourceLabel,
    sourceUrl: job.canonicalJobUrl ?? job.canonicalApplyUrl ?? job.applyUrl,
    summary: job.descriptionSnippet,
    title: job.title,
  });
}

function getStringField(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
}

function normalizeDetailsFromDescription(args: {
  base: JobDetailsDto;
  descriptionHtml?: string | null;
  descriptionText?: string | null;
  employmentType?: string | null;
  externalJobId?: string | null;
  location?: string | null;
  postedAt?: string | null;
  salaryText?: string | null;
  sourceUrl?: string | null;
  title?: string | null;
}) {
  const sanitizedDescriptionHtml = sanitizeJobDescriptionHtml(args.descriptionHtml);
  const normalizedDescriptionText =
    normalizeWhitespace(args.descriptionText) ?? htmlToText(sanitizedDescriptionHtml);
  const htmlSections = extractSectionsFromHtml(sanitizedDescriptionHtml);
  const textSections = extractSectionsFromText(normalizedDescriptionText);
  const summary = htmlSections.summary ?? textSections.summary ?? args.base.summary;
  const responsibilities =
    htmlSections.responsibilities.length > 0
      ? htmlSections.responsibilities
      : textSections.responsibilities;
  const qualifications =
    htmlSections.qualifications.length > 0 ? htmlSections.qualifications : textSections.qualifications;
  const preferredQualifications =
    htmlSections.preferredQualifications.length > 0
      ? htmlSections.preferredQualifications
      : textSections.preferredQualifications;
  const salaryText = args.salaryText ?? htmlSections.salaryText ?? textSections.salaryText ?? null;
  const hasExpandedDescription =
    Boolean(sanitizedDescriptionHtml) ||
    Boolean(
      normalizedDescriptionText &&
        normalizeWhitespace(normalizedDescriptionText) !== normalizeWhitespace(args.base.summary),
    );
  const hasExpandedSummary =
    Boolean(summary) && normalizeWhitespace(summary) !== normalizeWhitespace(args.base.summary);
  const hasRichContent = Boolean(
    hasExpandedDescription ||
      hasExpandedSummary ||
      responsibilities.length > 0 ||
      qualifications.length > 0 ||
      preferredQualifications.length > 0,
  );

  return jobDetailsSchema.parse({
    ...args.base,
    contentStatus: hasRichContent ? "full" : args.base.contentStatus,
    descriptionHtml: sanitizedDescriptionHtml,
    descriptionText: normalizedDescriptionText,
    employmentType: args.employmentType ?? args.base.employmentType,
    externalJobId: args.externalJobId ?? args.base.externalJobId,
    fallbackMessage: hasRichContent ? null : args.base.fallbackMessage,
    location: args.location ?? args.base.location,
    postedAt: args.postedAt ?? args.base.postedAt,
    preferredQualifications,
    qualifications,
    responsibilities,
    salaryText: salaryText ?? args.base.salaryText,
    sourceUrl: args.sourceUrl ?? args.base.sourceUrl,
    summary,
    title: args.title ?? args.base.title,
  });
}

function normalizePayloadDetails(job: JobPostingDto, source: JobDetailsSource) {
  const base = createBaseDetails(job, source);

  if (!isRecord(job.rawPayload)) {
    return base;
  }

  const payload = job.rawPayload;

  if (source === "greenhouse") {
    return normalizeDetailsFromDescription({
      base,
      descriptionHtml: getStringField(payload, ["content"]),
      externalJobId:
        getStringField(payload, ["internal_job_id", "id"]) ?? base.externalJobId,
      location:
        getStringField(payload, ["location"]) ??
        (isRecord(payload.location) ? getStringField(payload.location, ["name"]) : null) ??
        base.location,
    });
  }

  if (source === "lever") {
    return normalizeDetailsFromDescription({
      base,
      descriptionHtml: getStringField(payload, ["description", "descriptionHtml"]),
      descriptionText: getStringField(payload, ["descriptionPlain", "description_text"]),
      employmentType:
        getStringField(payload, ["commitment"]) ??
        (isRecord(payload.categories) ? getStringField(payload.categories, ["commitment"]) : null) ??
        base.employmentType,
      externalJobId: getStringField(payload, ["id"]) ?? base.externalJobId,
      location:
        (isRecord(payload.categories) ? getStringField(payload.categories, ["location"]) : null) ??
        base.location,
      sourceUrl: getStringField(payload, ["hostedUrl", "applyUrl"]) ?? base.sourceUrl,
    });
  }

  if (source === "ashby") {
    return normalizeDetailsFromDescription({
      base,
      descriptionHtml: getStringField(payload, ["descriptionHtml"]),
      descriptionText: getStringField(payload, ["descriptionPlain"]),
      employmentType: getStringField(payload, ["employmentType"]) ?? base.employmentType,
      externalJobId: getStringField(payload, ["id"]) ?? base.externalJobId,
      location: getStringField(payload, ["location"]) ?? base.location,
      postedAt: getStringField(payload, ["updatedAt", "publishedAt"]) ?? base.postedAt,
      sourceUrl: getStringField(payload, ["jobUrl", "applyUrl"]) ?? base.sourceUrl,
    });
  }

  if (source === "workable" && typeof payload.section === "string") {
    const descriptionMatch = payload.section.match(/<description>([\s\S]*?)<\/description>/i);

    return normalizeDetailsFromDescription({
      base,
      descriptionHtml: descriptionMatch?.[1] ?? null,
    });
  }

  return normalizeDetailsFromDescription({
    base,
    descriptionHtml: getStringField(payload, ["descriptionHtml", "description", "content"]),
    descriptionText: getStringField(payload, [
      "descriptionPlain",
      "descriptionText",
      "description_text",
      "summary",
    ]),
    employmentType:
      getStringField(payload, ["employmentType", "type", "timeType"]) ?? base.employmentType,
    externalJobId:
      getStringField(payload, ["externalId", "external_id", "jobId", "job_id", "id"]) ??
      base.externalJobId,
    location:
      getStringField(payload, [
        "location",
        "formattedLocation",
        "formatted_location",
        "location_name",
      ]) ?? base.location,
    postedAt:
      getStringField(payload, ["updatedAt", "updated_at", "postedAt", "posted_at", "publishedAt"]) ??
      base.postedAt,
    sourceUrl:
      getStringField(payload, ["jobUrl", "job_url", "url", "hostedUrl", "hosted_url"]) ??
      base.sourceUrl,
  });
}

async function fetchWorkdayJsonLd(job: JobPostingDto) {
  const response = await fetch(job.canonicalJobUrl ?? job.canonicalApplyUrl ?? job.applyUrl, {
    cache: "no-store",
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent": "Mozilla/5.0 (compatible; CareerAI/1.0)",
    },
  });

  if (!response.ok) {
    throw new Error(`Source returned ${response.status}`);
  }

  const html = await response.text();
  const $ = load(html);
  let posting: JobPostingJsonLd | null = null;

  $('script[type="application/ld+json"]').each((_, element) => {
    if (posting) {
      return;
    }

    const content = $(element).html();

    if (!content) {
      return;
    }

    try {
      const parsed = JSON.parse(content);
      const candidates = Array.isArray(parsed) ? parsed : [parsed];

      for (const candidate of candidates) {
        if (!isRecord(candidate)) {
          continue;
        }

        if (candidate["@type"] === "JobPosting") {
          posting = candidate as JobPostingJsonLd;
          break;
        }
      }
    } catch {
      // Ignore malformed scripts and keep looking for the JobPosting payload.
    }
  });

  return posting;
}

function formatWorkdayLocation(posting: JobPostingJsonLd) {
  if (posting.jobLocationType === "TELECOMMUTE") {
    return "Remote";
  }

  const locality = normalizeWhitespace(posting.jobLocation?.address?.addressLocality);
  const country = normalizeWhitespace(posting.jobLocation?.address?.addressCountry);

  if (locality && country) {
    return `${locality}, ${country}`;
  }

  return locality ?? country ?? normalizeWhitespace(posting.applicantLocationRequirements?.name);
}

async function hydrateMissingDetails(job: JobPostingDto, current: JobDetailsDto, source: JobDetailsSource) {
  if (source !== "workday") {
    return current;
  }

  try {
    const posting = await fetchWorkdayJsonLd(job);

    if (!posting) {
      return current;
    }

    return normalizeDetailsFromDescription({
      base: current,
      descriptionText: posting.description,
      employmentType: formatDisplayText(posting.employmentType) ?? current.employmentType,
      externalJobId: normalizeWhitespace(posting.identifier?.value) ?? current.externalJobId,
      location: formatWorkdayLocation(posting) ?? current.location,
      postedAt: posting.datePosted ? new Date(posting.datePosted).toISOString() : current.postedAt,
      sourceUrl: job.canonicalJobUrl ?? job.canonicalApplyUrl ?? job.applyUrl,
      title: normalizeWhitespace(posting.title) ?? current.title,
    });
  } catch (error) {
    console.error("Job details hydration failed.", {
      error,
      jobId: job.id,
      source,
      sourceKey: job.sourceKey,
    });

    return jobDetailsSchema.parse({
      ...current,
      fallbackMessage:
        "Career AI could not retrieve the full source description right now. You can still open the original post or apply directly.",
    });
  }
}

async function loadJobPosting(jobId: string) {
  if (isDatabaseConfigured()) {
    const persisted = await getPersistedJobPostingById({ jobId });

    if (persisted) {
      return persisted;
    }
  }

  return getLiveJobPostingById({ jobId });
}

export async function getJobDetails(args: { jobId: string }) {
  const job = await loadJobPosting(args.jobId);

  if (!job) {
    throw new Error(`Job ${args.jobId} could not be found.`);
  }

  const source = inferJobDetailsSource(job);
  const initialDetails = normalizePayloadDetails(job, source);

  if (initialDetails.contentStatus === "full" || source !== "workday") {
    return initialDetails;
  }

  return hydrateMissingDetails(job, initialDetails, source);
}
