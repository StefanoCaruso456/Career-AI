import type {
  JobApplicationPathType,
  JobPostingDto,
  JobSourceLane,
  JobSourceQuality,
  JobSourceTrustTier,
  JobValidationStatus,
  JobWorkplaceType,
} from "@/packages/contracts/src";

const STALE_JOB_THRESHOLD_DAYS = 45;
const EXPIRED_JOB_THRESHOLD_DAYS = 90;
const RESERVED_PLACEHOLDER_HOST_SUFFIXES = [
  "example.com",
  "example.org",
  "example.net",
  "localhost",
  "test",
  "invalid",
];

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function isReservedPlaceholderHostname(hostname: string) {
  const normalizedHostname = hostname.trim().toLowerCase();

  return RESERVED_PLACEHOLDER_HOST_SUFFIXES.some((suffix) => {
    return normalizedHostname === suffix || normalizedHostname.endsWith(`.${suffix}`);
  });
}

export function normalizeHumanLabel(value: string) {
  return normalizeWhitespace(value).toLowerCase();
}

export function inferJobWorkplaceType(location: string | null | undefined): JobWorkplaceType {
  if (!location) {
    return "unknown";
  }

  const normalized = normalizeHumanLabel(location);

  if (normalized.includes("remote")) {
    return "remote";
  }

  if (normalized.includes("hybrid")) {
    return "hybrid";
  }

  return "onsite";
}

export function inferSourceTrustTier(
  sourceLane: JobSourceLane,
  sourceQuality: JobSourceQuality,
): JobSourceTrustTier {
  if (sourceLane === "ats_direct") {
    return "trusted_direct";
  }

  if (sourceQuality === "high_signal") {
    return "trusted_aggregator";
  }

  return "coverage";
}

export function normalizeHttpUrl(value: string | null | undefined) {
  const trimmedValue = value?.trim();

  if (!trimmedValue) {
    return null;
  }

  try {
    const parsed = new URL(trimmedValue);

    if (!["http:", "https:"].includes(parsed.protocol) || isReservedPlaceholderHostname(parsed.hostname)) {
      return null;
    }

    parsed.hash = "";

    return parsed.toString();
  } catch {
    return null;
  }
}

export function inferApplicationPathType(args: {
  canonicalApplyUrl: string | null;
  canonicalJobUrl: string | null;
  sourceLane: JobSourceLane;
}): JobApplicationPathType {
  const normalizedApplyUrl = args.canonicalApplyUrl ? normalizeHttpUrl(args.canonicalApplyUrl) : null;

  if (!normalizedApplyUrl) {
    return "unknown";
  }

  const applyHostname = new URL(normalizedApplyUrl).hostname.toLowerCase();

  if (
    applyHostname.includes("greenhouse") ||
    applyHostname.includes("lever.co") ||
    applyHostname.includes("ashbyhq") ||
    applyHostname.includes("workdayjobs") ||
    applyHostname.includes("workable")
  ) {
    return "ats_hosted";
  }

  if (args.sourceLane === "aggregator") {
    return "aggregator_redirect";
  }

  const normalizedJobUrl = args.canonicalJobUrl ? normalizeHttpUrl(args.canonicalJobUrl) : null;

  if (normalizedJobUrl && new URL(normalizedJobUrl).hostname.toLowerCase() === applyHostname) {
    return "company_careers";
  }

  return "external_redirect";
}

export function createJobDedupeFingerprint(args: {
  applyUrl: string | null;
  companyName: string;
  externalSourceJobId: string | null;
  location: string | null;
  title: string;
}) {
  const normalizedApplyUrl = args.applyUrl ? normalizeHttpUrl(args.applyUrl) : null;

  if (normalizedApplyUrl) {
    return normalizedApplyUrl.toLowerCase();
  }

  return [
    normalizeHumanLabel(args.companyName),
    normalizeHumanLabel(args.title),
    normalizeHumanLabel(args.location ?? "unknown"),
    normalizeHumanLabel(args.externalSourceJobId ?? "unknown"),
  ].join("::");
}

function getJobFreshnessTimestamp(job: Pick<JobPostingDto, "postedAt" | "updatedAt">) {
  const timestamp = Date.parse(job.updatedAt || job.postedAt || "");

  return Number.isNaN(timestamp) ? null : timestamp;
}

function getJobAgeDays(job: Pick<JobPostingDto, "postedAt" | "updatedAt">) {
  const timestamp = getJobFreshnessTimestamp(job);

  if (timestamp === null) {
    return null;
  }

  return Math.floor((Date.now() - timestamp) / (24 * 60 * 60 * 1000));
}

export function evaluateJobValidation(job: Pick<
  JobPostingDto,
  | "canonicalApplyUrl"
  | "canonicalJobUrl"
  | "companyName"
  | "descriptionSnippet"
  | "externalId"
  | "location"
  | "postedAt"
  | "sourceLane"
  | "sourceQuality"
  | "title"
  | "updatedAt"
  | "workplaceType"
>) {
  const reasons: string[] = [];
  const canonicalApplyUrl = normalizeHttpUrl(job.canonicalApplyUrl ?? null);
  const canonicalJobUrl = normalizeHttpUrl(job.canonicalJobUrl ?? null);

  if (!job.title.trim()) {
    reasons.push("missing_title");
  }

  if (!job.companyName.trim()) {
    reasons.push("missing_company");
  }

  if (!job.externalId.trim()) {
    reasons.push("missing_external_id");
  }

  if (!canonicalApplyUrl) {
    reasons.push("invalid_apply_url");
  }

  const ageDays = getJobAgeDays(job);
  const sourceTrustTier = inferSourceTrustTier(job.sourceLane, job.sourceQuality);
  let validationStatus: JobValidationStatus;

  if (reasons.length > 0) {
    validationStatus = "invalid";
  } else if (ageDays !== null && ageDays > EXPIRED_JOB_THRESHOLD_DAYS) {
    validationStatus = "expired";
    reasons.push("expired_posting");
  } else if (ageDays !== null && ageDays > STALE_JOB_THRESHOLD_DAYS) {
    validationStatus = "stale";
    reasons.push("stale_posting");
  } else {
    validationStatus = job.sourceLane === "ats_direct" ? "active_verified" : "active_unverified";
    reasons.push(job.sourceLane === "ats_direct" ? "trusted_direct_source" : "coverage_source");
  }

  const applicationPathType = inferApplicationPathType({
    canonicalApplyUrl,
    canonicalJobUrl,
    sourceLane: job.sourceLane,
  });
  const redirectRequired =
    job.sourceLane === "aggregator" ||
    (canonicalApplyUrl !== null && canonicalJobUrl !== null && canonicalApplyUrl !== canonicalJobUrl);
  const freshnessScore =
    ageDays === null
      ? 0
      : clamp((STALE_JOB_THRESHOLD_DAYS - Math.min(ageDays, STALE_JOB_THRESHOLD_DAYS)) / STALE_JOB_THRESHOLD_DAYS, 0, 1);
  const baseTrustScore =
    sourceTrustTier === "trusted_direct"
      ? 0.9
      : sourceTrustTier === "trusted_aggregator"
        ? 0.76
        : sourceTrustTier === "coverage"
          ? 0.62
          : 0.45;
  const trustScore = clamp(
    baseTrustScore +
      freshnessScore * 0.08 +
      (job.descriptionSnippet ? 0.02 : 0) +
      (canonicalJobUrl ? 0.01 : 0) +
      (job.workplaceType && job.workplaceType !== "unknown" ? 0.01 : 0),
    0,
    0.99,
  );
  const orchestrationReadiness =
    Boolean(canonicalApplyUrl) &&
    validationStatus === "active_verified" &&
    (applicationPathType === "ats_hosted" || applicationPathType === "company_careers");

  return {
    applicationPathType,
    canonicalApplyUrl,
    canonicalJobUrl,
    orchestrationReadiness,
    reasons,
    redirectRequired,
    sourceTrustTier,
    trustScore,
    validationStatus,
  };
}

export function createEnrichedJobPosting(args: {
  applyUrl: string;
  canonicalJobUrl?: string | null;
  commitment: string | null;
  companyName: string;
  department: string | null;
  descriptionSnippet: string | null;
  externalId: string;
  id: string;
  ingestedAt?: string;
  location: string | null;
  postedAt: string | null;
  rawPayload?: unknown;
  salaryText?: string | null;
  sourceKey: string;
  sourceLabel: string;
  sourceLane: JobSourceLane;
  sourceQuality: JobSourceQuality;
  title: string;
  updatedAt: string | null;
}) {
  const ingestedAt = args.ingestedAt ?? new Date().toISOString();
  const canonicalApplyUrl = normalizeHttpUrl(args.applyUrl) ?? args.applyUrl;
  const canonicalJobUrl = normalizeHttpUrl(args.canonicalJobUrl ?? null);
  const workplaceType = inferJobWorkplaceType(args.location);
  const validation = evaluateJobValidation({
    canonicalApplyUrl,
    canonicalJobUrl,
    companyName: args.companyName,
    descriptionSnippet: args.descriptionSnippet,
    externalId: args.externalId,
    location: args.location,
    postedAt: args.postedAt,
    sourceLane: args.sourceLane,
    sourceQuality: args.sourceQuality,
    title: args.title,
    updatedAt: args.updatedAt,
    workplaceType,
  });

  return {
    applyUrl: canonicalApplyUrl,
    applicationPathType: validation.applicationPathType,
    canonicalApplyUrl,
    canonicalJobUrl: validation.canonicalJobUrl,
    commitment: args.commitment,
    companyName: normalizeWhitespace(args.companyName),
    dedupeFingerprint: createJobDedupeFingerprint({
      applyUrl: canonicalApplyUrl,
      companyName: args.companyName,
      externalSourceJobId: args.externalId,
      location: args.location,
      title: args.title,
    }),
    department: args.department,
    descriptionSnippet: args.descriptionSnippet,
    externalId: args.externalId,
    externalSourceJobId: args.externalId,
    id: args.id,
    ingestedAt,
    lastValidatedAt: ingestedAt,
    location: args.location,
    normalizedCompanyName: normalizeHumanLabel(args.companyName),
    normalizedTitle: normalizeHumanLabel(args.title),
    orchestrationMetadata: {
      sourceKey: args.sourceKey,
      sourceLabel: args.sourceLabel,
    },
    orchestrationReadiness: validation.orchestrationReadiness,
    postedAt: args.postedAt,
    rawPayload: args.rawPayload ?? null,
    redirectRequired: validation.redirectRequired,
    salaryText: args.salaryText ?? null,
    searchReasons: [],
    sourceKey: args.sourceKey,
    sourceLabel: args.sourceLabel,
    sourceLane: args.sourceLane,
    sourceQuality: args.sourceQuality,
    sourceTrustTier: validation.sourceTrustTier,
    title: normalizeWhitespace(args.title),
    trustScore: validation.trustScore,
    updatedAt: args.updatedAt,
    validationStatus: validation.validationStatus,
    workplaceType,
  } satisfies JobPostingDto;
}
