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

type ListSectionKey = keyof Pick<
  SectionExtraction,
  "preferredQualifications" | "qualifications" | "responsibilities"
>;

type JobPostingJsonLd = {
  applicantLocationRequirements?: {
    name?: string;
  };
  baseSalary?:
    | {
        currency?: string;
        unitText?: string;
        value?:
          | {
              maxValue?: number | string;
              minValue?: number | string;
              unitText?: string;
              value?: number | string;
            }
          | number
          | string;
      }
    | Array<{
        currency?: string;
        unitText?: string;
        value?:
          | {
              maxValue?: number | string;
              minValue?: number | string;
              unitText?: string;
              value?: number | string;
            }
          | number
          | string;
      }>;
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
      /\bminimum qualifications?\b/i,
      /\bminimum requirements?\b/i,
      /\bbasic qualifications?\b/i,
      /\bwhat we're looking for\b/i,
      /\bwhat we’re looking for\b/i,
      /\bwho you are\b/i,
      /\byou should have\b/i,
      /\bskills and experience\b/i,
      /\ble métier est fait pour vous si vous avez\b/i,
      /\ble metier est fait pour vous si vous avez\b/i,
      /\best fait pour vous si vous avez\b/i,
    ],
  },
  {
    key: "preferredQualifications",
    patterns: [
      /\bpreferred qualifications?\b/i,
      /\bpreferred experience\b/i,
      /\bpreferred skills?\b/i,
      /\bnice to have\b/i,
      /\bbonus points\b/i,
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

function normalizeStructuredText(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const normalized = decodeHtmlEntities(value)
    .replace(/\u00a0/g, " ")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return normalized.length > 0 ? normalized : null;
}

function normalizeHtmlInput(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const normalized = value.replace(/\u00a0/g, " ").replace(/\r\n?/g, "\n").trim();

  return normalized.length > 0 ? normalized : null;
}

function isListSectionKey(value: SectionKey | null): value is ListSectionKey {
  return (
    value === "responsibilities" ||
    value === "qualifications" ||
    value === "preferredQualifications"
  );
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
  const normalized = normalizeHtmlInput(value);

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
      a: (_tagName, attribs): sanitizeHtml.Tag => {
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
      if (!("tagName" in element) || typeof element.tagName !== "string") {
        return;
      }

      const tagName = element.tagName.toLowerCase();

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

  const $ = load(`<section>${value}</section>`);

  $("br").replaceWith("\n");
  $("li").each((_, element) => {
    const text = normalizeWhitespace($(element).text());

    if (text) {
      $(element).text(`• ${text}`);
    }
  });
  $("h1, h2, h3, h4, h5, h6, p, li, blockquote").append("\n\n");

  const text = normalizeStructuredText($("section").text());

  return text;
}

function pushUnique(target: string[], value: string | null) {
  if (!value || target.includes(value)) {
    return;
  }

  target.push(value);
}

function splitListItems(value: string) {
  const normalized = normalizeStructuredText(value);

  if (!normalized) {
    return [];
  }

  const segmented = normalized
    .split(/\n{2,}|(?:^|\n)\s*[•\u2022\u25CF]\s*|;\s+(?=[A-Z0-9(])/)
    .map((item) => normalizeStructuredText(item))
    .filter((item): item is string => Boolean(item));

  if (segmented.length > 1) {
    return segmented;
  }

  const lines = normalized
    .split("\n")
    .map((line) => normalizeWhitespace(line.replace(/^[•\u2022\u25CF]\s*/, "")))
    .filter((line): line is string => Boolean(line));

  if (lines.length > 1) {
    return lines;
  }

  if (!normalized.includes("\n") && normalized.length > 220) {
    const sentences = normalized
      .split(/(?<=[.!?])\s+(?=[A-Z0-9(])/)
      .map((item) => normalizeWhitespace(item))
      .filter((item): item is string => Boolean(item));

    if (sentences.length > 1) {
      return sentences;
    }
  }

  return segmented;
}

function resolveSectionKey(label: string) {
  return (
    SECTION_LABEL_PATTERNS.find(({ patterns }) => patterns.some((pattern) => pattern.test(label)))?.key ??
    null
  );
}

function ensureGlobalFlag(flags: string) {
  return flags.includes("g") ? flags : `${flags}g`;
}

function insertInlineSectionBreaks(value: string) {
  const initialNormalized = normalizeStructuredText(value);

  if (!initialNormalized) {
    return null;
  }

  let normalized: string = initialNormalized;

  SECTION_LABEL_PATTERNS.filter(({ key }) => key !== "summary").forEach(({ patterns }) => {
    patterns.forEach((pattern) => {
      const inlineHeadingPattern = new RegExp(
        `([.!?])\\s+(${pattern.source}(?:\\s*[:\\-–—]))`,
        ensureGlobalFlag(pattern.flags),
      );

      normalized = normalized.replace(inlineHeadingPattern, "$1\n\n$2");
    });
  });

  return normalized;
}

function splitIntoBlocks(value: string) {
  const normalized = insertInlineSectionBreaks(value);

  if (!normalized) {
    return [];
  }

  const blocks: string[] = [];
  let currentLines: string[] = [];

  function flushCurrentLines() {
    const block = normalizeStructuredText(currentLines.join("\n"));

    if (block) {
      blocks.push(block);
    }

    currentLines = [];
  }

  normalized.split("\n").forEach((line) => {
    const trimmedLine = line.trim();

    if (!trimmedLine) {
      flushCurrentLines();
      return;
    }

    const matchedLead = matchSectionLead(trimmedLine);

    if (matchedLead && matchedLead.body === null) {
      flushCurrentLines();
      blocks.push(trimmedLine);
      return;
    }

    currentLines.push(trimmedLine);
  });

  flushCurrentLines();

  return blocks;
}

function matchSectionLead(value: string) {
  const normalized = normalizeStructuredText(value);

  if (!normalized) {
    return null;
  }

  for (const { key, patterns } of SECTION_LABEL_PATTERNS) {
    for (const pattern of patterns) {
      const headingOnlyPattern = new RegExp(`^(?:${pattern.source})$`, pattern.flags);
      const separatedBodyPattern = new RegExp(
        `^(?:${pattern.source})(?:\\s*[:\\-–—]\\s*|\\s*\\n+\\s*)([\\s\\S]+)$`,
        pattern.flags,
      );
      const inlineBodyPattern =
        key === "summary"
          ? null
          : new RegExp(`^(?:${pattern.source})\\s+([\\s\\S]+)$`, pattern.flags);

      if (headingOnlyPattern.test(normalized)) {
        return { body: null, key } as const;
      }

      const separatedBodyMatch = normalized.match(separatedBodyPattern);

      if (separatedBodyMatch) {
        return {
          body: normalizeStructuredText(separatedBodyMatch[1]),
          key,
        } as const;
      }

      const inlineBodyMatch = inlineBodyPattern?.exec(normalized);

      if (inlineBodyMatch) {
        return {
          body: normalizeStructuredText(inlineBodyMatch[1]),
          key,
        } as const;
      }
    }
  }

  return null;
}

function parseJsonLdNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.replace(/,/g, "").trim();

  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : null;
}

function formatSalaryAmount(amount: number, currencyCode: string | null) {
  const hasFractionalComponent = !Number.isInteger(amount);
  const normalizedCurrencyCode = normalizeWhitespace(currencyCode)?.toUpperCase() ?? null;

  if (normalizedCurrencyCode) {
    try {
      return new Intl.NumberFormat("en-US", {
        currency: normalizedCurrencyCode,
        maximumFractionDigits: hasFractionalComponent ? 2 : 0,
        minimumFractionDigits: hasFractionalComponent ? 2 : 0,
        style: "currency",
      }).format(amount);
    } catch {
      // Fall back to a plain numeric value when the currency code is unsupported.
    }
  }

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: hasFractionalComponent ? 2 : 0,
    minimumFractionDigits: hasFractionalComponent ? 2 : 0,
  }).format(amount);
}

function normalizeSalaryUnitLabel(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase().replace(/[^a-z]/g, "");

  switch (normalized) {
    case "hour":
    case "hourly":
      return "an hour";
    case "day":
    case "daily":
      return "a day";
    case "week":
    case "weekly":
      return "a week";
    case "month":
    case "monthly":
      return "a month";
    case "year":
    case "yearly":
    case "annual":
    case "annually":
      return "a year";
    default:
      return null;
  }
}

function formatWorkdaySalaryText(posting: JobPostingJsonLd) {
  const salaryCandidates = Array.isArray(posting.baseSalary)
    ? posting.baseSalary
    : posting.baseSalary
      ? [posting.baseSalary]
      : [];

  for (const candidate of salaryCandidates) {
    if (!isRecord(candidate)) {
      continue;
    }

    const value = isRecord(candidate.value) ? candidate.value : null;
    const directValue = parseJsonLdNumber(candidate.value);
    let minimumValue = parseJsonLdNumber(value?.minValue);
    let maximumValue = parseJsonLdNumber(value?.maxValue);
    const exactValue = parseJsonLdNumber(value?.value) ?? directValue;

    if (minimumValue === null && maximumValue === null && exactValue !== null) {
      minimumValue = exactValue;
      maximumValue = exactValue;
    }

    if (minimumValue === null && maximumValue !== null) {
      minimumValue = maximumValue;
    }

    if (maximumValue === null && minimumValue !== null) {
      maximumValue = minimumValue;
    }

    if (minimumValue === null || maximumValue === null) {
      continue;
    }

    if (maximumValue < minimumValue) {
      [minimumValue, maximumValue] = [maximumValue, minimumValue];
    }

    const currencyCode = typeof candidate.currency === "string" ? candidate.currency : null;
    const amountLabel =
      minimumValue === maximumValue
        ? formatSalaryAmount(minimumValue, currencyCode)
        : `${formatSalaryAmount(minimumValue, currencyCode)} - ${formatSalaryAmount(maximumValue, currencyCode)}`;
    const unitLabel = normalizeSalaryUnitLabel(
      typeof value?.unitText === "string"
        ? value.unitText
        : typeof candidate.unitText === "string"
          ? candidate.unitText
          : null,
    );

    return unitLabel ? `${amountLabel} ${unitLabel}` : amountLabel;
  }

  return null;
}

function pushSectionContent(
  target: SectionExtraction,
  key: SectionKey,
  value: string | null,
) {
  if (!value) {
    return;
  }

  if (key === "summary") {
    target.summary =
      target.summary === null
        ? normalizeWhitespace(value)
        : normalizeWhitespace(`${target.summary} ${value}`);
    return;
  }

  if (key === "salary") {
    target.salaryText =
      target.salaryText === null
        ? value
        : normalizeStructuredText(`${target.salaryText}\n${value}`);
    return;
  }

  if (!isListSectionKey(key)) {
    return;
  }

  splitListItems(value).forEach((item) => {
    pushUnique(target[key], item);
  });
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

    if (isListSectionKey(activeSection)) {
      const listSection = activeSection;
      const items =
        tagName === "ul" || tagName === "ol"
          ? $(node)
              .find("li")
              .toArray()
              .map((item) => normalizeWhitespace($(item).text()))
              .filter((item): item is string => Boolean(item))
          : splitListItems(text);

      items.forEach((item) => {
        pushUnique(emptySections[listSection], item);
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

  const blocks = splitIntoBlocks(value);

  if (blocks.length === 0) {
    return emptySections;
  }

  let activeSection: SectionKey | null = null;

  blocks.forEach((block) => {
    const matchedLead = matchSectionLead(block);

    if (matchedLead) {
      activeSection = matchedLead.key;
      pushSectionContent(emptySections, matchedLead.key, matchedLead.body);
      return;
    }

    if (!activeSection) {
      pushSectionContent(emptySections, "summary", block);
      return;
    }

    pushSectionContent(emptySections, activeSection, block);
  });

  if (!emptySections.summary) {
    emptySections.summary = normalizeWhitespace(
      blocks.find((block) => resolveSectionKey(block) === null) ?? null,
    );
  }

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
    workplaceType: job.workplaceType ?? null,
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
  const htmlDescriptionText = htmlToText(sanitizedDescriptionHtml);
  const normalizedDescriptionText =
    normalizeStructuredText(args.descriptionText) ?? htmlDescriptionText;
  const htmlSections = extractSectionsFromHtml(sanitizedDescriptionHtml);
  const textSections = extractSectionsFromText(htmlDescriptionText ?? normalizedDescriptionText);
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
    workplaceType: args.base.workplaceType,
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

async function fetchWorkdayJsonLd(job: JobPostingDto): Promise<JobPostingJsonLd | null> {
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
      salaryText: formatWorkdaySalaryText(posting) ?? current.salaryText,
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
