import {
  jobsFeedResponseSchema,
  type JobPostingDto,
  type JobSourceLane,
  type JobSourceQuality,
  type JobSourceSnapshotDto,
  type JobsFeedResponseDto,
  type JobsFeedStorageDto,
} from "@/packages/contracts/src";
import {
  getPersistedJobsFeedSnapshot,
  isDatabaseConfigured,
  persistSourcedJobs,
} from "@/packages/persistence/src";

const JOBS_PER_SOURCE = 12;
const DEFAULT_RESPONSE_LIMIT = 18;
const FETCH_TIMEOUT_MS = 4_500;

type NamedSpec = {
  label: string;
  value: string;
};

type DirectSourceSpec = {
  key: string;
  label: string;
  lane: "ats_direct";
  quality: "high_signal";
  endpointLabel: string;
};

type AggregatorSourceSpec = {
  key: string;
  label: string;
  lane: "aggregator";
  quality: "coverage";
  endpointLabel: string;
  apiKey?: string;
};

type SourceCollection = {
  jobs: JobPostingDto[];
  source: JobSourceSnapshotDto;
};

type GreenhouseJob = {
  absolute_url?: string;
  content?: string;
  id?: number | string;
  internal_job_id?: number | string;
  location?: {
    name?: string;
  };
  metadata?: Array<{
    name?: string;
    value?: string | null;
    value_type?: string;
  }>;
  offices?: Array<{
    name?: string;
  }>;
  departments?: Array<{
    name?: string;
  }>;
  title?: string;
  updated_at?: string;
};

type LeverJob = {
  id?: string;
  text?: string;
  categories?: {
    location?: string;
    commitment?: string;
    team?: string;
    department?: string;
  };
  descriptionPlain?: string;
  applyUrl?: string;
  hostedUrl?: string;
  createdAt?: number;
  updatedAt?: number;
};

const JOBS_ENVIRONMENT_GUIDE = [
  {
    key: "GREENHOUSE_BOARD",
    example: "Acme=acme,Globex=globex",
  },
  {
    key: "LEVER_SITE_NAMES",
    example: "Acme=acme,Globex=globex",
  },
  {
    key: "JOBS_AGGREGATOR_FEED_URL",
    example: "https://jobs.example.com/api/v1/open-roles",
  },
  {
    key: "JOBS_AGGREGATOR_API_KEY",
    example: "Optional bearer token for the aggregator feed",
  },
] as const;

function humanizeToken(value: string) {
  return value
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function parseNamedSpecs(raw: string | undefined): NamedSpec[] {
  if (!raw) {
    return [];
  }

  return raw
    .split(",")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => {
      const [labelPart, ...valueParts] = segment.split("=");

      if (valueParts.length === 0) {
        return {
          label: humanizeToken(labelPart),
          value: labelPart.trim(),
        };
      }

      const label = labelPart.trim();
      const value = valueParts.join("=").trim();

      return {
        label: label || humanizeToken(value),
        value,
      };
    })
    .filter((spec) => spec.value.length > 0);
}

function getGreenhouseBoardsRaw() {
  return process.env.GREENHOUSE_BOARD?.trim() || process.env.GREENHOUSE_BOARD_TOKENS?.trim();
}

function toIsoDate(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }

  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  const candidate = new Date(value);

  if (Number.isNaN(candidate.getTime())) {
    return null;
  }

  return candidate.toISOString();
}

function stripHtml(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPresent<T>(value: T | null): value is T {
  return value !== null;
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

function createSourceSnapshot(args: {
  key: string;
  label: string;
  lane: JobSourceLane;
  quality: JobSourceQuality;
  status: JobSourceSnapshotDto["status"];
  jobCount: number;
  endpointLabel: string | null;
  lastSyncedAt: string | null;
  message: string;
}): JobSourceSnapshotDto {
  return {
    key: args.key,
    label: args.label,
    lane: args.lane,
    quality: args.quality,
    status: args.status,
    jobCount: args.jobCount,
    endpointLabel: args.endpointLabel,
    lastSyncedAt: args.lastSyncedAt,
    message: args.message,
  };
}

function getDirectSourceSpecs() {
  const greenhouseBoards = parseNamedSpecs(getGreenhouseBoardsRaw()).map(
    ({ label, value }) =>
      ({
        key: `greenhouse:${slugify(value)}`,
        label,
        lane: "ats_direct",
        quality: "high_signal",
        endpointLabel: `boards-api.greenhouse.io/${value}`,
        token: value,
      }) as DirectSourceSpec & { token: string },
  );

  const leverSites = parseNamedSpecs(process.env.LEVER_SITE_NAMES).map(
    ({ label, value }) =>
      ({
        key: `lever:${slugify(value)}`,
        label,
        lane: "ats_direct",
        quality: "high_signal",
        endpointLabel: `api.lever.co/${value}`,
        site: value,
      }) as DirectSourceSpec & { site: string },
  );

  return {
    greenhouseBoards,
    leverSites,
  };
}

function getAggregatorSpec() {
  const feedUrl = process.env.JOBS_AGGREGATOR_FEED_URL?.trim();

  if (!feedUrl) {
    return null;
  }

  return {
    key: "aggregator:primary",
    label: process.env.JOBS_AGGREGATOR_LABEL?.trim() || "Coverage Aggregator",
    lane: "aggregator",
    quality: "coverage",
    endpointLabel: feedUrl,
    apiKey: process.env.JOBS_AGGREGATOR_API_KEY?.trim(),
    feedUrl,
  } satisfies AggregatorSourceSpec & { feedUrl: string };
}

function createNotConfiguredSources() {
  const fallbackSources: JobSourceSnapshotDto[] = [];
  const { greenhouseBoards, leverSites } = getDirectSourceSpecs();
  const aggregatorSpec = getAggregatorSpec();

  if (greenhouseBoards.length === 0) {
    fallbackSources.push(
      createSourceSnapshot({
        key: "greenhouse:unconfigured",
        label: "Greenhouse boards",
        lane: "ats_direct",
        quality: "high_signal",
        status: "not_configured",
        jobCount: 0,
        endpointLabel: null,
        lastSyncedAt: null,
        message:
          "Add GREENHOUSE_BOARD to pull direct ATS jobs from Greenhouse. GREENHOUSE_BOARD_TOKENS still works as a legacy alias.",
      }),
    );
  }

  if (leverSites.length === 0) {
    fallbackSources.push(
      createSourceSnapshot({
        key: "lever:unconfigured",
        label: "Lever postings",
        lane: "ats_direct",
        quality: "high_signal",
        status: "not_configured",
        jobCount: 0,
        endpointLabel: null,
        lastSyncedAt: null,
        message: "Add LEVER_SITE_NAMES to pull direct ATS jobs from Lever.",
      }),
    );
  }

  if (!aggregatorSpec) {
    fallbackSources.push(
      createSourceSnapshot({
        key: "aggregator:unconfigured",
        label: "Coverage aggregator",
        lane: "aggregator",
        quality: "coverage",
        status: "not_configured",
        jobCount: 0,
        endpointLabel: null,
        lastSyncedAt: null,
        message: "Add JOBS_AGGREGATOR_FEED_URL to layer in immediate job-volume coverage.",
      }),
    );
  }

  return fallbackSources;
}

function trimSnippet(value: string | null, maxLength = 200) {
  if (!value) {
    return null;
  }

  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1).trimEnd()}…`;
}

function createJobId(sourceKey: string, externalId: string) {
  return `${sourceKey}:${externalId}`;
}

function sortJobs(jobs: JobPostingDto[]) {
  return [...jobs].sort((left, right) => {
    if (left.sourceQuality !== right.sourceQuality) {
      return left.sourceQuality === "high_signal" ? -1 : 1;
    }

    const leftTime = Date.parse(left.updatedAt || left.postedAt || "");
    const rightTime = Date.parse(right.updatedAt || right.postedAt || "");

    if (!Number.isNaN(leftTime) && !Number.isNaN(rightTime) && leftTime !== rightTime) {
      return rightTime - leftTime;
    }

    return left.title.localeCompare(right.title);
  });
}

function normalizeUrlForDeduping(value: string) {
  try {
    const url = new URL(value);
    url.hash = "";
    url.search = "";
    return url.toString();
  } catch {
    return value;
  }
}

function createDedupeKey(job: JobPostingDto) {
  return normalizeUrlForDeduping(job.applyUrl).toLowerCase();
}

function dedupeJobs(jobs: JobPostingDto[]) {
  const seenKeys = new Set<string>();
  const deduped: JobPostingDto[] = [];

  for (const job of sortJobs(jobs)) {
    const dedupeKey = createDedupeKey(job);

    if (seenKeys.has(dedupeKey)) {
      continue;
    }

    seenKeys.add(dedupeKey);
    deduped.push(job);
  }

  return deduped;
}

async function fetchJson(url: string, apiKey?: string) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    cache: "no-store",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Feed returned ${response.status}`);
  }

  return response.json();
}

function mapGreenhouseJobs(source: DirectSourceSpec, payload: unknown): JobPostingDto[] {
  const jobs = isRecord(payload) && Array.isArray(payload.jobs) ? payload.jobs : null;

  if (!jobs) {
    throw new Error("Greenhouse payload did not include a jobs array.");
  }

  const mappedJobs = jobs
    .map((item) => {
      const job = item as GreenhouseJob;
      const applyUrl = typeof job.absolute_url === "string" ? job.absolute_url : null;
      const title = typeof job.title === "string" ? job.title.trim() : "";

      if (!applyUrl || !title) {
        return null;
      }

      const location =
        job.location?.name?.trim() ||
        job.offices?.map((office) => office.name?.trim()).find(Boolean) ||
        null;
      const department = job.departments?.map((entry) => entry.name?.trim()).find(Boolean) || null;
      const commitment =
        job.metadata
          ?.find((entry) => entry.name?.toLowerCase() === "commitment")
          ?.value?.trim() || null;
      const externalId = String(job.id ?? job.internal_job_id ?? applyUrl);
      const descriptionSnippet = trimSnippet(stripHtml(job.content));

      return {
        id: createJobId(source.key, externalId),
        externalId,
        title,
        companyName: source.label,
        location,
        department,
        commitment,
        sourceKey: source.key,
        sourceLabel: source.label,
        sourceLane: source.lane,
        sourceQuality: source.quality,
        applyUrl,
        postedAt: null,
        updatedAt: toIsoDate(job.updated_at),
        descriptionSnippet,
      } satisfies JobPostingDto;
    })
    .filter(isPresent) as JobPostingDto[];

  return mappedJobs.slice(0, JOBS_PER_SOURCE);
}

function mapLeverJobs(source: DirectSourceSpec, payload: unknown): JobPostingDto[] {
  if (!Array.isArray(payload)) {
    throw new Error("Lever payload was not an array.");
  }

  const mappedJobs = payload
    .map((item) => {
      const job = item as LeverJob;
      const applyUrl =
        (typeof job.applyUrl === "string" && job.applyUrl) ||
        (typeof job.hostedUrl === "string" && job.hostedUrl) ||
        null;
      const title = typeof job.text === "string" ? job.text.trim() : "";

      if (!applyUrl || !title) {
        return null;
      }

      const externalId = job.id || applyUrl;

      return {
        id: createJobId(source.key, externalId),
        externalId,
        title,
        companyName: source.label,
        location: job.categories?.location?.trim() || null,
        department: job.categories?.team?.trim() || job.categories?.department?.trim() || null,
        commitment: job.categories?.commitment?.trim() || null,
        sourceKey: source.key,
        sourceLabel: source.label,
        sourceLane: source.lane,
        sourceQuality: source.quality,
        applyUrl,
        postedAt: toIsoDate(job.createdAt),
        updatedAt: toIsoDate(job.updatedAt),
        descriptionSnippet: trimSnippet(job.descriptionPlain?.trim() || null),
      } satisfies JobPostingDto;
    })
    .filter(isPresent) as JobPostingDto[];

  return mappedJobs.slice(0, JOBS_PER_SOURCE);
}

function extractAggregatorJobs(payload: unknown) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (!isRecord(payload)) {
    return [];
  }

  const topLevelCandidates = [payload.jobs, payload.results, payload.items, payload.data];

  for (const candidate of topLevelCandidates) {
    if (Array.isArray(candidate)) {
      return candidate;
    }

    if (isRecord(candidate) && Array.isArray(candidate.jobs)) {
      return candidate.jobs;
    }
  }

  return [];
}

function mapAggregatorJobs(source: AggregatorSourceSpec, payload: unknown): JobPostingDto[] {
  const jobs = extractAggregatorJobs(payload);

  if (jobs.length === 0 && !Array.isArray(payload) && !isRecord(payload)) {
    throw new Error("Aggregator payload did not include a jobs array.");
  }

  const mappedJobs = jobs
    .map((item, index) => {
      if (!isRecord(item)) {
        return null;
      }

      const title = getStringField(item, ["title", "jobTitle", "job_title", "text", "name"]);
      const applyUrl = getStringField(item, [
        "applyUrl",
        "apply_url",
        "url",
        "jobUrl",
        "job_url",
        "hostedUrl",
        "hosted_url",
        "absolute_url",
      ]);

      if (!title || !applyUrl) {
        return null;
      }

      const externalId =
        getStringField(item, ["id", "jobId", "job_id", "externalId", "external_id"]) ||
        `${index + 1}`;
      const companyName =
        getStringField(item, [
          "companyName",
          "company_name",
          "company",
          "employer",
          "employerName",
          "employer_name",
        ]) || source.label;

      return {
        id: createJobId(source.key, externalId),
        externalId,
        title,
        companyName,
        location:
          getStringField(item, [
            "location",
            "location_name",
            "formattedLocation",
            "formatted_location",
            "city",
          ]) || null,
        department: getStringField(item, ["department", "team", "function"]) || null,
        commitment:
          getStringField(item, ["commitment", "employmentType", "employment_type", "type"]) ||
          null,
        sourceKey: source.key,
        sourceLabel: source.label,
        sourceLane: source.lane,
        sourceQuality: source.quality,
        applyUrl,
        postedAt: toIsoDate(
          item.postedAt ?? item.posted_at ?? item.createdAt ?? item.created_at ?? item.publishedAt,
        ),
        updatedAt: toIsoDate(item.updatedAt ?? item.updated_at ?? item.modifiedAt ?? item.modified_at),
        descriptionSnippet: trimSnippet(
          getStringField(item, [
            "descriptionSnippet",
            "description_snippet",
            "summary",
            "descriptionPlain",
            "description_plain",
          ]),
        ),
      } satisfies JobPostingDto;
    })
    .filter(isPresent) as JobPostingDto[];

  return mappedJobs.slice(0, JOBS_PER_SOURCE);
}

async function collectGreenhouseJobs(
  source: DirectSourceSpec & { token: string },
): Promise<SourceCollection> {
  const syncedAt = new Date().toISOString();

  try {
    const payload = await fetchJson(
      `https://boards-api.greenhouse.io/v1/boards/${source.token}/jobs?content=true`,
    );
    const jobs = mapGreenhouseJobs(source, payload);

    return {
      jobs,
      source: createSourceSnapshot({
        key: source.key,
        label: source.label,
        lane: source.lane,
        quality: source.quality,
        status: "connected",
        jobCount: jobs.length,
        endpointLabel: source.endpointLabel,
        lastSyncedAt: syncedAt,
        message:
          jobs.length > 0
            ? "Greenhouse public jobs synced and ready to persist."
            : "Greenhouse is connected but did not return any published jobs.",
      }),
    };
  } catch (error) {
    return {
      jobs: [],
      source: createSourceSnapshot({
        key: source.key,
        label: source.label,
        lane: source.lane,
        quality: source.quality,
        status: "degraded",
        jobCount: 0,
        endpointLabel: source.endpointLabel,
        lastSyncedAt: syncedAt,
        message:
          error instanceof Error
            ? `Greenhouse feed could not be loaded: ${error.message}`
            : "Greenhouse feed could not be loaded.",
      }),
    };
  }
}

async function collectLeverJobs(
  source: DirectSourceSpec & { site: string },
): Promise<SourceCollection> {
  const syncedAt = new Date().toISOString();

  try {
    const payload = await fetchJson(
      `https://api.lever.co/v0/postings/${source.site}?mode=json&limit=${JOBS_PER_SOURCE}`,
    );
    const jobs = mapLeverJobs(source, payload);

    return {
      jobs,
      source: createSourceSnapshot({
        key: source.key,
        label: source.label,
        lane: source.lane,
        quality: source.quality,
        status: "connected",
        jobCount: jobs.length,
        endpointLabel: source.endpointLabel,
        lastSyncedAt: syncedAt,
        message:
          jobs.length > 0
            ? "Direct ATS jobs are flowing from Lever."
            : "Lever is connected but did not return any published jobs.",
      }),
    };
  } catch (error) {
    return {
      jobs: [],
      source: createSourceSnapshot({
        key: source.key,
        label: source.label,
        lane: source.lane,
        quality: source.quality,
        status: "degraded",
        jobCount: 0,
        endpointLabel: source.endpointLabel,
        lastSyncedAt: syncedAt,
        message:
          error instanceof Error
            ? `Lever feed could not be loaded: ${error.message}`
            : "Lever feed could not be loaded.",
      }),
    };
  }
}

async function collectAggregatorJobs(
  source: AggregatorSourceSpec & { feedUrl: string },
): Promise<SourceCollection> {
  const syncedAt = new Date().toISOString();

  try {
    const payload = await fetchJson(source.feedUrl, source.apiKey);
    const jobs = mapAggregatorJobs(source, payload);

    return {
      jobs,
      source: createSourceSnapshot({
        key: source.key,
        label: source.label,
        lane: source.lane,
        quality: source.quality,
        status: "connected",
        jobCount: jobs.length,
        endpointLabel: source.endpointLabel,
        lastSyncedAt: syncedAt,
        message:
          jobs.length > 0
            ? "Aggregator coverage feed is connected and adding volume."
            : "Aggregator feed is connected but did not return any jobs.",
      }),
    };
  } catch (error) {
    return {
      jobs: [],
      source: createSourceSnapshot({
        key: source.key,
        label: source.label,
        lane: source.lane,
        quality: source.quality,
        status: "degraded",
        jobCount: 0,
        endpointLabel: source.endpointLabel,
        lastSyncedAt: syncedAt,
        message:
          error instanceof Error
            ? `Aggregator feed could not be loaded: ${error.message}`
            : "Aggregator feed could not be loaded.",
      }),
    };
  }
}

function buildSummary(args: {
  jobs: JobPostingDto[];
  sources: JobSourceSnapshotDto[];
}) {
  return {
    totalJobs: args.jobs.length,
    directAtsJobs: args.jobs.filter((job) => job.sourceLane === "ats_direct").length,
    aggregatorJobs: args.jobs.filter((job) => job.sourceLane === "aggregator").length,
    sourceCount: args.sources.length,
    connectedSourceCount: args.sources.filter((source) => source.status === "connected").length,
    highSignalSourceCount: args.sources.filter((source) => source.quality === "high_signal").length,
    coverageSourceCount: args.sources.filter((source) => source.quality === "coverage").length,
  };
}

function buildJobsFeedResponse(args: {
  generatedAt: string;
  jobs: JobPostingDto[];
  sources: JobSourceSnapshotDto[];
  storage: JobsFeedStorageDto;
}): JobsFeedResponseDto {
  return jobsFeedResponseSchema.parse({
    generatedAt: args.generatedAt,
    jobs: args.jobs,
    sources: args.sources,
    summary: buildSummary({
      jobs: args.jobs,
      sources: args.sources,
    }),
    storage: args.storage,
  });
}

async function collectLiveSourceCollections() {
  const { greenhouseBoards, leverSites } = getDirectSourceSpecs();
  const aggregatorSpec = getAggregatorSpec();

  return Promise.all([
    ...greenhouseBoards.map((source) => collectGreenhouseJobs(source)),
    ...leverSites.map((source) => collectLeverJobs(source)),
    ...(aggregatorSpec ? [collectAggregatorJobs(aggregatorSpec)] : []),
  ]);
}

export function getJobsEnvironmentGuide() {
  return JOBS_ENVIRONMENT_GUIDE;
}

export async function getJobsFeedSnapshot(args?: {
  limit?: number;
}): Promise<JobsFeedResponseDto> {
  const limit = Math.max(1, Math.min(args?.limit ?? DEFAULT_RESPONSE_LIMIT, 30));
  const generatedAt = new Date().toISOString();
  const liveCollections = await collectLiveSourceCollections();
  const liveJobs = dedupeJobs(liveCollections.flatMap((collection) => collection.jobs)).slice(0, limit);
  const liveSources = liveCollections.map((collection) => collection.source);
  const staticSources = createNotConfiguredSources();

  if (!isDatabaseConfigured()) {
    return buildJobsFeedResponse({
      generatedAt,
      jobs: liveJobs,
      sources: [...liveSources, ...staticSources],
      storage: {
        mode: "ephemeral",
        persistedJobs: 0,
        persistedSources: 0,
        lastSyncAt: null,
      },
    });
  }

  try {
    await persistSourcedJobs({
      sources: liveSources,
      jobs: liveCollections.flatMap((collection) => collection.jobs),
      syncedAt: generatedAt,
    });

    const persisted = await getPersistedJobsFeedSnapshot({ limit });

    return buildJobsFeedResponse({
      generatedAt,
      jobs: persisted.jobs,
      sources: [...persisted.sources, ...staticSources],
      storage: persisted.storage,
    });
  } catch (error) {
    console.error("Jobs persistence failed; falling back to live feed preview.", error);

    return buildJobsFeedResponse({
      generatedAt,
      jobs: liveJobs,
      sources: [...liveSources, ...staticSources],
      storage: {
        mode: "ephemeral",
        persistedJobs: 0,
        persistedSources: 0,
        lastSyncAt: null,
      },
    });
  }
}
