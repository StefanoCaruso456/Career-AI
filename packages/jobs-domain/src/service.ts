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
import { createEnrichedJobPosting } from "./metadata";

const DEFAULT_RESPONSE_LIMIT = 18;
const MAX_RESPONSE_LIMIT = 5_000;
const FETCH_TIMEOUT_MS = 4_500;
const JOBS_SNAPSHOT_STALE_MS = 10 * 60 * 1000;
const DEFAULT_WINDOW_DAYS = 7;
const LEVER_PAGE_SIZE = 100;
const MAX_LEVER_PAGE_COUNT = 100;
const WORKDAY_PAGE_SIZE = 20;
const MAX_WORKDAY_PAGE_COUNT = 250;
const RESERVED_PLACEHOLDER_HOST_SUFFIXES = [
  "example.com",
  "example.org",
  "example.net",
  "localhost",
  "test",
  "invalid",
] as const;

const jobsRefreshPromises = new Map<string, Promise<void>>();

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

type WorkableXmlSourceSpec = {
  key: string;
  label: string;
  lane: "aggregator";
  quality: "coverage";
  endpointLabel: string;
  feedUrl: string;
};

type WorkdaySourceSpec = {
  key: string;
  label: string;
  lane: "ats_direct";
  quality: "high_signal";
  endpointLabel: string;
  feedUrl: string;
  jobBoardPath: string;
};

type SourceCollection = {
  jobs: JobPostingDto[];
  persistedJobs: JobPostingDto[];
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

type AshbyJobBoardResponse = {
  jobs?: AshbyJob[];
};

type AshbyJob = {
  applyUrl?: string;
  descriptionHtml?: string;
  descriptionPlain?: string;
  department?: string;
  employmentType?: string;
  id?: string;
  isRemote?: boolean;
  jobUrl?: string;
  location?: string;
  publishedAt?: string;
  team?: string;
  title?: string;
  updatedAt?: string;
  workplaceType?: string;
};

type WorkdayJobsResponse = {
  total?: number;
  jobPostings?: WorkdayJob[];
};

type WorkdayJob = {
  title?: string;
  externalPath?: string;
  locationsText?: string;
  timeType?: string;
  postedOn?: string;
  bulletFields?: string[];
};

const BUILTIN_GREENHOUSE_COMPANY_SPECS = [
  {
    label: "Figma",
    token: "figma",
  },
  {
    label: "Stripe",
    token: "stripe",
  },
] as const;

const BUILTIN_WORKDAY_COMPANY_SPECS = [
  {
    label: "Accenture",
    feedUrl: "https://accenture.wd103.myworkdayjobs.com/wday/cxs/accenture/AccentureCareers/jobs",
  },
  {
    label: "Adobe",
    feedUrl: "https://adobe.wd5.myworkdayjobs.com/wday/cxs/adobe/external_experienced/jobs",
  },
  {
    label: "Autodesk",
    feedUrl: "https://autodesk.wd1.myworkdayjobs.com/wday/cxs/autodesk/Ext/jobs",
  },
  {
    label: "Cisco",
    feedUrl: "https://cisco.wd5.myworkdayjobs.com/wday/cxs/cisco/Cisco_Careers/jobs",
  },
  {
    label: "CrowdStrike",
    feedUrl: "https://crowdstrike.wd5.myworkdayjobs.com/wday/cxs/crowdstrike/crowdstrikecareers/jobs",
  },
  {
    label: "Dell Technologies",
    feedUrl: "https://dell.wd1.myworkdayjobs.com/wday/cxs/dell/External/jobs",
  },
  {
    label: "Hewlett Packard Enterprise (HPE)",
    feedUrl: "https://hpe.wd5.myworkdayjobs.com/wday/cxs/hpe/ACJobSite/jobs",
  },
  {
    label: "NVIDIA",
    feedUrl: "https://nvidia.wd5.myworkdayjobs.com/wday/cxs/nvidia/nvidiaexternalcareersite/jobs",
  },
  {
    label: "Red Hat",
    feedUrl: "https://redhat.wd5.myworkdayjobs.com/wday/cxs/redhat/jobs/jobs",
  },
  {
    label: "Salesforce",
    feedUrl: "https://salesforce.wd12.myworkdayjobs.com/wday/cxs/salesforce/External_Career_Site/jobs",
  },
  {
    label: "Samsung Electronics",
    feedUrl: "https://sec.wd3.myworkdayjobs.com/wday/cxs/sec/Samsung_Careers/jobs",
  },
  {
    label: "Workday",
    feedUrl: "https://workday.wd5.myworkdayjobs.com/wday/cxs/workday/Workday/jobs",
  },
] as const;

const BUILTIN_WORKDAY_COMPANY_FEEDS =
  process.env.NODE_ENV === "test" ? [] : BUILTIN_WORKDAY_COMPANY_SPECS;
const BUILTIN_GREENHOUSE_COMPANY_FEEDS =
  process.env.NODE_ENV === "test" ? [] : BUILTIN_GREENHOUSE_COMPANY_SPECS;

const JOBS_ENVIRONMENT_GUIDE = [
  {
    key: "GREENHOUSE_BOARD",
    example: "Company Name=greenhouse-board-token",
  },
  {
    key: "LEVER_SITE_NAMES",
    example: "Company Name=lever-site-name",
  },
  {
    key: "ASHBY_JOB_BOARDS",
    example: "Company Name=ashby-job-board",
  },
  {
    key: "JOBS_AGGREGATOR_FEEDS",
    example: "Partner Feed=https://<your-feed-host>/jobs",
  },
  {
    key: "JOBS_AGGREGATOR_FEED_URL",
    example: "https://<your-feed-host>/api/v1/open-roles",
  },
  {
    key: "JOBS_AGGREGATOR_API_KEY",
    example: "Optional bearer token for the aggregator feed",
  },
  {
    key: "WORKABLE_XML_FEED_URL",
    example: "https://<your-workable-feed>/workable.xml",
  },
  {
    key: "WORKDAY_JOB_SOURCES",
    example: "Adobe=https://adobe.wd5.myworkdayjobs.com/wday/cxs/adobe/external_experienced/jobs",
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

function isReservedPlaceholderHostname(hostname: string) {
  const normalizedHostname = hostname.trim().toLowerCase();

  return RESERVED_PLACEHOLDER_HOST_SUFFIXES.some((suffix) => {
    return normalizedHostname === suffix || normalizedHostname.endsWith(`.${suffix}`);
  });
}

function sanitizeConfiguredFeedUrl(value: string | undefined | null) {
  const trimmedValue = value?.trim();

  if (!trimmedValue) {
    return null;
  }

  try {
    const parsed = new URL(trimmedValue);

    if (isReservedPlaceholderHostname(parsed.hostname)) {
      return null;
    }

    return parsed.toString();
  } catch {
    return trimmedValue;
  }
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

function getAshbyBoardsRaw() {
  return process.env.ASHBY_JOB_BOARDS?.trim();
}

function parseWorkdayFeedUrl(feedUrl: string) {
  const sanitizedFeedUrl = sanitizeConfiguredFeedUrl(feedUrl);

  if (!sanitizedFeedUrl) {
    return null;
  }

  try {
    const parsed = new URL(sanitizedFeedUrl);
    const match = parsed.pathname.match(/^\/wday\/cxs\/[^/]+\/([^/]+)\/jobs\/?$/i);

    if (!match) {
      return null;
    }

    return {
      feedUrl: parsed.toString(),
      endpointLabel: `${parsed.host}${parsed.pathname.replace(/\/$/, "")}`,
      jobBoardPath: `/en-US/${match[1]}`,
    };
  } catch {
    return null;
  }
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

function normalizeWindowDays(value: number | undefined) {
  if (!Number.isFinite(value)) {
    return null;
  }

  return Math.max(1, Math.min(Math.floor(value as number), 30));
}

function isSnapshotFresh(lastSyncAt: string | null) {
  if (!lastSyncAt) {
    return false;
  }

  const timestamp = Date.parse(lastSyncAt);

  if (Number.isNaN(timestamp)) {
    return false;
  }

  return Date.now() - timestamp <= JOBS_SNAPSHOT_STALE_MS;
}

function formatWindowLabel(windowDays: number | null) {
  if (!windowDays) {
    return "recent jobs";
  }

  return windowDays === 1 ? "the last 24 hours" : `the last ${windowDays} days`;
}

function getJobTimestamp(job: Pick<JobPostingDto, "postedAt" | "updatedAt">) {
  const value = job.postedAt || job.updatedAt;

  if (!value) {
    return null;
  }

  const timestamp = Date.parse(value);

  return Number.isNaN(timestamp) ? null : timestamp;
}

function filterJobsWithinWindow(jobs: JobPostingDto[], windowDays: number | null) {
  if (!windowDays) {
    return jobs;
  }

  const thresholdMs = windowDays * 24 * 60 * 60 * 1000;
  const now = Date.now();

  return jobs.filter((job) => {
    const timestamp = getJobTimestamp(job);

    if (timestamp === null) {
      return false;
    }

    return now - timestamp <= thresholdMs;
  });
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

function stripHtml(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  return decodeHtmlEntities(value)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTextSnippet(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const decoded = decodeHtmlEntities(value);
  const firstParagraph = stripHtml(decoded.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i)?.[1]);

  return firstParagraph || stripHtml(decoded);
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
  const configuredGreenhouseBoards = parseNamedSpecs(getGreenhouseBoardsRaw()).map(
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
  const builtinGreenhouseBoards = BUILTIN_GREENHOUSE_COMPANY_FEEDS.map(
    ({ label, token }) =>
      ({
        key: `greenhouse:${slugify(token)}`,
        label,
        lane: "ats_direct",
        quality: "high_signal",
        endpointLabel: `boards-api.greenhouse.io/${token}`,
        token,
      }) as DirectSourceSpec & { token: string },
  );
  const seenGreenhouseTokens = new Set<string>();
  const greenhouseBoards = [...builtinGreenhouseBoards, ...configuredGreenhouseBoards].filter((spec) => {
    if (seenGreenhouseTokens.has(spec.token)) {
      return false;
    }

    seenGreenhouseTokens.add(spec.token);
    return true;
  });

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

  const ashbyBoards = parseNamedSpecs(getAshbyBoardsRaw()).map(
    ({ label, value }) =>
      ({
        key: `ashby:${slugify(value)}`,
        label,
        lane: "ats_direct",
        quality: "high_signal",
        endpointLabel: `api.ashbyhq.com/posting-api/job-board/${value}`,
        boardName: value,
      }) as DirectSourceSpec & { boardName: string },
  );

  const configuredWorkdayFeeds = parseNamedSpecs(process.env.WORKDAY_JOB_SOURCES).flatMap(
    ({ label, value }) => {
      const parsedFeed = parseWorkdayFeedUrl(value);

      if (!parsedFeed) {
        return [];
      }

      return [
        {
          key: `workday:${slugify(label || parsedFeed.feedUrl)}`,
          label,
          lane: "ats_direct",
          quality: "high_signal",
          endpointLabel: parsedFeed.endpointLabel,
          feedUrl: parsedFeed.feedUrl,
          jobBoardPath: parsedFeed.jobBoardPath,
        } satisfies WorkdaySourceSpec,
      ];
    },
  );
  const builtinWorkdayFeeds = BUILTIN_WORKDAY_COMPANY_FEEDS.flatMap(({ label, feedUrl }) => {
    const parsedFeed = parseWorkdayFeedUrl(feedUrl);

    if (!parsedFeed) {
      return [];
    }

    return [
      {
        key: `workday:${slugify(label)}`,
        label,
        lane: "ats_direct",
        quality: "high_signal",
        endpointLabel: parsedFeed.endpointLabel,
        feedUrl: parsedFeed.feedUrl,
        jobBoardPath: parsedFeed.jobBoardPath,
      } satisfies WorkdaySourceSpec,
    ];
  });
  const seenWorkdayFeedUrls = new Set<string>();
  const workdayBoards = [...builtinWorkdayFeeds, ...configuredWorkdayFeeds].filter((spec) => {
    if (seenWorkdayFeedUrls.has(spec.feedUrl)) {
      return false;
    }

    seenWorkdayFeedUrls.add(spec.feedUrl);
    return true;
  });

  return {
    greenhouseBoards,
    leverSites,
    ashbyBoards,
    workdayBoards,
  };
}

function getAggregatorSpecs() {
  const apiKey = process.env.JOBS_AGGREGATOR_API_KEY?.trim();
  const namedFeeds = parseNamedSpecs(process.env.JOBS_AGGREGATOR_FEEDS).flatMap(
    ({ label, value }) => {
      const feedUrl = sanitizeConfiguredFeedUrl(value);

      if (!feedUrl) {
        return [];
      }

      return [
        {
          key: `aggregator:${slugify(label || feedUrl)}`,
          label,
          lane: "aggregator",
          quality: "coverage",
          endpointLabel: feedUrl,
          apiKey,
          feedUrl,
        } satisfies AggregatorSourceSpec & { feedUrl: string },
      ];
    },
  );
  const legacyFeedUrl = sanitizeConfiguredFeedUrl(process.env.JOBS_AGGREGATOR_FEED_URL);
  const legacyFeeds = legacyFeedUrl
    ? [
        {
          key: "aggregator:primary",
          label: process.env.JOBS_AGGREGATOR_LABEL?.trim() || "Coverage Aggregator",
          lane: "aggregator",
          quality: "coverage",
          endpointLabel: legacyFeedUrl,
          apiKey,
          feedUrl: legacyFeedUrl,
        } satisfies AggregatorSourceSpec & { feedUrl: string },
      ]
    : [];
  const seenFeedUrls = new Set<string>();

  return [...namedFeeds, ...legacyFeeds].filter((spec) => {
    if (seenFeedUrls.has(spec.feedUrl)) {
      return false;
    }

    seenFeedUrls.add(spec.feedUrl);
    return true;
  });
}

function getWorkableXmlFeedSpec() {
  const feedUrl = sanitizeConfiguredFeedUrl(process.env.WORKABLE_XML_FEED_URL);

  if (!feedUrl) {
    return null;
  }

  return {
    key: "workable:network",
    label: "Workable Network",
    lane: "aggregator",
    quality: "coverage",
    endpointLabel: feedUrl,
    feedUrl,
  } satisfies WorkableXmlSourceSpec;
}

function createNotConfiguredSources() {
  const fallbackSources: JobSourceSnapshotDto[] = [];
  const { greenhouseBoards, leverSites, ashbyBoards, workdayBoards } = getDirectSourceSpecs();
  const aggregatorSpecs = getAggregatorSpecs();
  const workableXmlFeedSpec = getWorkableXmlFeedSpec();

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

  if (ashbyBoards.length === 0) {
    fallbackSources.push(
      createSourceSnapshot({
        key: "ashby:unconfigured",
        label: "Ashby job boards",
        lane: "ats_direct",
        quality: "high_signal",
        status: "not_configured",
        jobCount: 0,
        endpointLabel: null,
        lastSyncedAt: null,
        message: "Add ASHBY_JOB_BOARDS to pull direct ATS jobs from Ashby.",
      }),
    );
  }

  if (workdayBoards.length === 0) {
    fallbackSources.push(
      createSourceSnapshot({
        key: "workday:unconfigured",
        label: "Workday job boards",
        lane: "ats_direct",
        quality: "high_signal",
        status: "not_configured",
        jobCount: 0,
        endpointLabel: null,
        lastSyncedAt: null,
        message:
          "Add WORKDAY_JOB_SOURCES to pull direct ATS jobs from Workday-powered company career sites.",
      }),
    );
  }

  if (aggregatorSpecs.length === 0) {
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
        message:
          "Add JOBS_AGGREGATOR_FEEDS or JOBS_AGGREGATOR_FEED_URL to layer in immediate job-volume coverage.",
      }),
    );
  }

  if (!workableXmlFeedSpec) {
    fallbackSources.push(
      createSourceSnapshot({
        key: "workable:unconfigured",
        label: "Workable Network",
        lane: "aggregator",
        quality: "coverage",
        status: "not_configured",
        jobCount: 0,
        endpointLabel: null,
        lastSyncedAt: null,
        message:
          "Add WORKABLE_XML_FEED_URL to ingest public Jobs by Workable postings across many employers.",
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
  return (job.dedupeFingerprint ?? normalizeUrlForDeduping(job.applyUrl)).toLowerCase();
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

async function postJson(url: string, body: unknown, apiKey?: string) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Feed returned ${response.status}`);
  }

  return response.json();
}

async function fetchText(url: string, apiKey?: string) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/xml,text/xml,text/plain,*/*",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    cache: "no-store",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Feed returned ${response.status}`);
  }

  return response.text();
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
      const descriptionSnippet = trimSnippet(extractTextSnippet(job.content));

      return createEnrichedJobPosting({
        applyUrl,
        canonicalJobUrl: applyUrl,
        commitment,
        companyName: source.label,
        department,
        descriptionSnippet,
        externalId,
        id: createJobId(source.key, externalId),
        location,
        postedAt: null,
        rawPayload: job,
        sourceKey: source.key,
        sourceLabel: source.label,
        sourceLane: source.lane,
        sourceQuality: source.quality,
        title,
        updatedAt: toIsoDate(job.updated_at),
      });
    })
    .filter(isPresent) as JobPostingDto[];

  return mappedJobs;
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

      return createEnrichedJobPosting({
        applyUrl,
        canonicalJobUrl:
          (typeof job.hostedUrl === "string" && job.hostedUrl.trim()) ||
          (typeof job.applyUrl === "string" && job.applyUrl.trim()) ||
          null,
        commitment: job.categories?.commitment?.trim() || null,
        companyName: source.label,
        department: job.categories?.team?.trim() || job.categories?.department?.trim() || null,
        descriptionSnippet: trimSnippet(extractTextSnippet(job.descriptionPlain?.trim() || null)),
        externalId,
        id: createJobId(source.key, externalId),
        location: job.categories?.location?.trim() || null,
        postedAt: toIsoDate(job.createdAt),
        rawPayload: job,
        sourceKey: source.key,
        sourceLabel: source.label,
        sourceLane: source.lane,
        sourceQuality: source.quality,
        title,
        updatedAt: toIsoDate(job.updatedAt),
      });
    })
    .filter(isPresent) as JobPostingDto[];

  return mappedJobs;
}

function formatAshbyEmploymentType(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

function mapAshbyJobs(
  source: DirectSourceSpec & { boardName: string },
  payload: unknown,
): JobPostingDto[] {
  const jobs = isRecord(payload) && Array.isArray(payload.jobs) ? payload.jobs : null;

  if (!jobs) {
    throw new Error("Ashby payload did not include a jobs array.");
  }

  const mappedJobs = jobs
    .map((item) => {
      const job = item as AshbyJob;
      const applyUrl =
        (typeof job.applyUrl === "string" && job.applyUrl.trim()) ||
        (typeof job.jobUrl === "string" && job.jobUrl.trim()) ||
        null;
      const title = typeof job.title === "string" ? job.title.trim() : "";

      if (!applyUrl || !title) {
        return null;
      }

      const location =
        typeof job.location === "string" && job.location.trim().length > 0
          ? job.location.trim()
          : job.isRemote || job.workplaceType === "Remote"
            ? "Remote"
            : null;
      const externalId = job.id || applyUrl;

      return createEnrichedJobPosting({
        applyUrl,
        canonicalJobUrl:
          (typeof job.jobUrl === "string" && job.jobUrl.trim()) ||
          (typeof job.applyUrl === "string" && job.applyUrl.trim()) ||
          null,
        commitment: formatAshbyEmploymentType(job.employmentType),
        companyName: source.label,
        department:
          (typeof job.team === "string" && job.team.trim()) ||
          (typeof job.department === "string" && job.department.trim()) ||
          null,
        descriptionSnippet: trimSnippet(
          extractTextSnippet(job.descriptionPlain?.trim() || job.descriptionHtml),
        ),
        externalId,
        id: createJobId(source.key, externalId),
        location,
        postedAt: toIsoDate(job.publishedAt),
        rawPayload: job,
        sourceKey: source.key,
        sourceLabel: source.label,
        sourceLane: source.lane,
        sourceQuality: source.quality,
        title,
        updatedAt: toIsoDate(job.updatedAt),
      });
    })
    .filter(isPresent) as JobPostingDto[];

  return mappedJobs;
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

      return createEnrichedJobPosting({
        applyUrl,
        canonicalJobUrl: getStringField(item, [
          "jobUrl",
          "job_url",
          "url",
          "hostedUrl",
          "hosted_url",
          "absolute_url",
        ]),
        commitment:
          getStringField(item, ["commitment", "employmentType", "employment_type", "type"]) ||
          null,
        companyName,
        department: getStringField(item, ["department", "team", "function"]) || null,
        descriptionSnippet: trimSnippet(
          extractTextSnippet(
            getStringField(item, [
              "descriptionSnippet",
              "description_snippet",
              "summary",
              "descriptionPlain",
              "description_plain",
            ]),
          ),
        ),
        externalId,
        id: createJobId(source.key, externalId),
        location:
          getStringField(item, [
            "location",
            "location_name",
            "formattedLocation",
            "formatted_location",
            "city",
          ]) || null,
        postedAt: toIsoDate(
          item.postedAt ?? item.posted_at ?? item.createdAt ?? item.created_at ?? item.publishedAt,
        ),
        rawPayload: item,
        sourceKey: source.key,
        sourceLabel: source.label,
        sourceLane: source.lane,
        sourceQuality: source.quality,
        title,
        updatedAt: toIsoDate(item.updatedAt ?? item.updated_at ?? item.modifiedAt ?? item.modified_at),
      });
    })
    .filter(isPresent) as JobPostingDto[];

  return mappedJobs;
}

function extractXmlTagValue(fragment: string, tag: string) {
  const match = fragment.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i"));

  if (!match) {
    return null;
  }

  const rawValue = match[1]
    .replace(/^<!\[CDATA\[/i, "")
    .replace(/\]\]>$/i, "")
    .trim();

  return rawValue.length > 0 ? rawValue : null;
}

function formatWorkableLocation(args: {
  city: string | null;
  state: string | null;
  country: string | null;
  remote: string | null;
}) {
  if (args.remote?.toLowerCase() === "true") {
    return "Remote";
  }

  const parts = [args.city, args.state, args.country].filter(
    (value): value is string => Boolean(value && value.trim().length > 0),
  );

  return parts.length > 0 ? parts.join(", ") : null;
}

function mapWorkableXmlJobs(source: WorkableXmlSourceSpec, xml: string): JobPostingDto[] {
  const sections = xml.match(/<job>([\s\S]*?)<\/job>/gi) ?? [];
  const mappedJobs: JobPostingDto[] = [];

  for (const section of sections) {
    const applyUrl = extractXmlTagValue(section, "url");
    const title = extractXmlTagValue(section, "title");

    if (!applyUrl || !title) {
      continue;
    }

    const externalId = extractXmlTagValue(section, "referencenumber") || applyUrl;
    const companyName = extractXmlTagValue(section, "company") || source.label;

    mappedJobs.push(createEnrichedJobPosting({
      applyUrl,
      canonicalJobUrl: applyUrl,
      commitment: extractXmlTagValue(section, "jobtype"),
      companyName,
      department: extractXmlTagValue(section, "category"),
      descriptionSnippet: trimSnippet(extractTextSnippet(extractXmlTagValue(section, "description"))),
      externalId,
      id: createJobId(source.key, externalId),
      location: formatWorkableLocation({
        city: extractXmlTagValue(section, "city"),
        state: extractXmlTagValue(section, "state"),
        country: extractXmlTagValue(section, "country"),
        remote: extractXmlTagValue(section, "remote"),
      }),
      postedAt: toIsoDate(extractXmlTagValue(section, "date")),
      rawPayload: {
        company: companyName,
        section,
        source: source.feedUrl,
      },
      sourceKey: source.key,
      sourceLabel: source.label,
      sourceLane: source.lane,
      sourceQuality: source.quality,
      title,
      updatedAt: null,
    }));

  }

  return mappedJobs;
}

function parseWorkdayPostedOn(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  const now = new Date();

  if (normalized === "posted today") {
    return now.toISOString();
  }

  if (normalized === "posted yesterday") {
    return new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  }

  const dayMatch = normalized.match(/^posted (\d+)\+? day[s]? ago$/i);

  if (dayMatch) {
    const daysAgo = Number.parseInt(dayMatch[1] ?? "0", 10);

    if (Number.isFinite(daysAgo)) {
      return new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
    }
  }

  const weekMatch = normalized.match(/^posted (\d+)\+? week[s]? ago$/i);

  if (weekMatch) {
    const weeksAgo = Number.parseInt(weekMatch[1] ?? "0", 10);

    if (Number.isFinite(weeksAgo)) {
      return new Date(now.getTime() - weeksAgo * 7 * 24 * 60 * 60 * 1000).toISOString();
    }
  }

  return null;
}

function mapWorkdayJobs(source: WorkdaySourceSpec, payload: unknown): JobPostingDto[] {
  const jobs = isRecord(payload) && Array.isArray(payload.jobPostings) ? payload.jobPostings : null;

  if (!jobs) {
    throw new Error("Workday payload did not include a jobPostings array.");
  }

  const sourceOrigin = new URL(source.feedUrl).origin;

  const mappedJobs = jobs
    .map((item) => {
      const job = item as WorkdayJob;
      const title = typeof job.title === "string" ? job.title.trim() : "";
      const externalPath = typeof job.externalPath === "string" ? job.externalPath.trim() : "";

      if (!title || !externalPath) {
        return null;
      }

      const externalId = job.bulletFields?.find(Boolean)?.trim() || externalPath;
      const applyUrl = `${sourceOrigin}${source.jobBoardPath}${externalPath}`;

      return createEnrichedJobPosting({
        applyUrl,
        canonicalJobUrl: applyUrl,
        commitment: typeof job.timeType === "string" ? job.timeType.trim() : null,
        companyName: source.label,
        department: null,
        descriptionSnippet: null,
        externalId,
        id: createJobId(source.key, externalId),
        location: typeof job.locationsText === "string" ? job.locationsText.trim() : null,
        postedAt: parseWorkdayPostedOn(job.postedOn),
        rawPayload: job,
        sourceKey: source.key,
        sourceLabel: source.label,
        sourceLane: source.lane,
        sourceQuality: source.quality,
        title,
        updatedAt: null,
      });
    })
    .filter(isPresent) as JobPostingDto[];

  return mappedJobs;
}

async function collectGreenhouseJobs(
  source: DirectSourceSpec & { token: string },
  windowDays: number | null,
): Promise<SourceCollection> {
  const syncedAt = new Date().toISOString();
  const windowLabel = formatWindowLabel(windowDays);

  try {
    const payload = await fetchJson(
      `https://boards-api.greenhouse.io/v1/boards/${source.token}/jobs?content=true`,
    );
    const persistedJobs = mapGreenhouseJobs(source, payload);
    const jobs = filterJobsWithinWindow(persistedJobs, windowDays);

    return {
      jobs,
      persistedJobs,
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
            ? `Greenhouse public jobs from ${windowLabel} synced and ready to persist.`
            : `Greenhouse is connected but did not return any published jobs from ${windowLabel}.`,
      }),
    };
  } catch (error) {
    return {
      jobs: [],
      persistedJobs: [],
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

async function fetchLeverPostings(site: string) {
  const jobs: LeverJob[] = [];

  for (let pageIndex = 0; pageIndex < MAX_LEVER_PAGE_COUNT; pageIndex += 1) {
    const skip = pageIndex * LEVER_PAGE_SIZE;
    const payload = await fetchJson(
      `https://api.lever.co/v0/postings/${encodeURIComponent(site)}?mode=json&limit=${LEVER_PAGE_SIZE}&skip=${skip}`,
    );

    if (!Array.isArray(payload)) {
      throw new Error("Lever payload was not an array.");
    }

    jobs.push(...(payload as LeverJob[]));

    if (payload.length < LEVER_PAGE_SIZE) {
      break;
    }
  }

  return jobs;
}

async function fetchWorkdayPostings(source: WorkdaySourceSpec) {
  const jobs: WorkdayJob[] = [];

  for (let pageIndex = 0; pageIndex < MAX_WORKDAY_PAGE_COUNT; pageIndex += 1) {
    const offset = pageIndex * WORKDAY_PAGE_SIZE;
    const payload = (await postJson(source.feedUrl, {
      limit: WORKDAY_PAGE_SIZE,
      offset,
      searchText: "",
      appliedFacets: {},
    })) as WorkdayJobsResponse;

    if (!Array.isArray(payload.jobPostings)) {
      throw new Error("Workday payload did not include a jobPostings array.");
    }

    jobs.push(...payload.jobPostings);

    if (
      payload.jobPostings.length < WORKDAY_PAGE_SIZE ||
      (typeof payload.total === "number" && jobs.length >= payload.total)
    ) {
      break;
    }
  }

  return {
    jobPostings: jobs,
  } satisfies WorkdayJobsResponse;
}

async function collectLeverJobs(
  source: DirectSourceSpec & { site: string },
  windowDays: number | null,
): Promise<SourceCollection> {
  const syncedAt = new Date().toISOString();
  const windowLabel = formatWindowLabel(windowDays);

  try {
    const payload = await fetchLeverPostings(source.site);
    const persistedJobs = mapLeverJobs(source, payload);
    const jobs = filterJobsWithinWindow(persistedJobs, windowDays);

    return {
      jobs,
      persistedJobs,
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
            ? `Direct ATS jobs from ${windowLabel} are flowing from Lever.`
            : `Lever is connected but did not return any published jobs from ${windowLabel}.`,
      }),
    };
  } catch (error) {
    return {
      jobs: [],
      persistedJobs: [],
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

async function collectAshbyJobs(
  source: DirectSourceSpec & { boardName: string },
  windowDays: number | null,
): Promise<SourceCollection> {
  const syncedAt = new Date().toISOString();
  const windowLabel = formatWindowLabel(windowDays);

  try {
    const payload = (await fetchJson(
      `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(source.boardName)}`,
    )) as AshbyJobBoardResponse;
    const persistedJobs = mapAshbyJobs(source, payload);
    const jobs = filterJobsWithinWindow(persistedJobs, windowDays);

    return {
      jobs,
      persistedJobs,
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
            ? `Direct ATS jobs from ${windowLabel} are flowing from Ashby.`
            : `Ashby is connected but did not return any published jobs from ${windowLabel}.`,
      }),
    };
  } catch (error) {
    return {
      jobs: [],
      persistedJobs: [],
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
            ? `Ashby feed could not be loaded: ${error.message}`
            : "Ashby feed could not be loaded.",
      }),
    };
  }
}

async function collectWorkdayJobs(
  source: WorkdaySourceSpec,
  windowDays: number | null,
): Promise<SourceCollection> {
  const syncedAt = new Date().toISOString();
  const windowLabel = formatWindowLabel(windowDays);

  try {
    const payload = await fetchWorkdayPostings(source);
    const persistedJobs = mapWorkdayJobs(source, payload);
    const jobs = filterJobsWithinWindow(persistedJobs, windowDays);

    return {
      jobs,
      persistedJobs,
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
            ? `Direct ATS jobs from ${windowLabel} are flowing from Workday.`
            : `Workday is connected but did not return any published jobs from ${windowLabel}.`,
      }),
    };
  } catch (error) {
    return {
      jobs: [],
      persistedJobs: [],
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
            ? `Workday feed could not be loaded: ${error.message}`
            : "Workday feed could not be loaded.",
      }),
    };
  }
}

async function collectAggregatorJobs(
  source: AggregatorSourceSpec & { feedUrl: string },
  windowDays: number | null,
): Promise<SourceCollection> {
  const syncedAt = new Date().toISOString();
  const windowLabel = formatWindowLabel(windowDays);

  try {
    const payload = await fetchJson(source.feedUrl, source.apiKey);
    const persistedJobs = mapAggregatorJobs(source, payload);
    const jobs = filterJobsWithinWindow(persistedJobs, windowDays);

    return {
      jobs,
      persistedJobs,
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
            ? `Aggregator coverage feed is connected and adding jobs from ${windowLabel}.`
            : `Aggregator feed is connected but did not return any jobs from ${windowLabel}.`,
      }),
    };
  } catch (error) {
    return {
      jobs: [],
      persistedJobs: [],
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

async function collectWorkableXmlJobs(
  source: WorkableXmlSourceSpec,
  windowDays: number | null,
): Promise<SourceCollection> {
  const syncedAt = new Date().toISOString();
  const windowLabel = formatWindowLabel(windowDays);

  try {
    const xml = await fetchText(source.feedUrl);
    const persistedJobs = mapWorkableXmlJobs(source, xml);
    const jobs = filterJobsWithinWindow(persistedJobs, windowDays);

    return {
      jobs,
      persistedJobs,
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
            ? `Workable network feed is connected and broadening employer coverage for ${windowLabel}.`
            : `Workable network feed is connected but did not return any published jobs from ${windowLabel}.`,
      }),
    };
  } catch (error) {
    return {
      jobs: [],
      persistedJobs: [],
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
            ? `Workable XML feed could not be loaded: ${error.message}`
            : "Workable XML feed could not be loaded.",
      }),
    };
  }
}

function buildSummary(args: { sources: JobSourceSnapshotDto[] }) {
  const totalJobs = args.sources.reduce((sum, source) => sum + source.jobCount, 0);
  const directAtsJobs = args.sources
    .filter((source) => source.lane === "ats_direct")
    .reduce((sum, source) => sum + source.jobCount, 0);
  const aggregatorJobs = args.sources
    .filter((source) => source.lane === "aggregator")
    .reduce((sum, source) => sum + source.jobCount, 0);

  return {
    totalJobs,
    directAtsJobs,
    aggregatorJobs,
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
      sources: args.sources,
    }),
    storage: args.storage,
  });
}

async function collectLiveSourceCollections(windowDays: number | null) {
  const { greenhouseBoards, leverSites, ashbyBoards, workdayBoards } = getDirectSourceSpecs();
  const aggregatorSpecs = getAggregatorSpecs();
  const workableXmlFeedSpec = getWorkableXmlFeedSpec();

  return Promise.all([
    ...greenhouseBoards.map((source) => collectGreenhouseJobs(source, windowDays)),
    ...leverSites.map((source) => collectLeverJobs(source, windowDays)),
    ...ashbyBoards.map((source) => collectAshbyJobs(source, windowDays)),
    ...workdayBoards.map((source) => collectWorkdayJobs(source, windowDays)),
    ...aggregatorSpecs.map((source) => collectAggregatorJobs(source, windowDays)),
    ...(workableXmlFeedSpec ? [collectWorkableXmlJobs(workableXmlFeedSpec, windowDays)] : []),
  ]);
}

async function getLiveJobsFeedPreview(args: {
  generatedAt: string;
  limit: number;
  windowDays: number | null;
}) {
  const liveCollections = await collectLiveSourceCollections(args.windowDays);

  return {
    collections: liveCollections,
    response: buildJobsFeedResponse({
      generatedAt: args.generatedAt,
      jobs: dedupeJobs(liveCollections.flatMap((collection) => collection.jobs)).slice(0, args.limit),
      sources: [...liveCollections.map((collection) => collection.source), ...createNotConfiguredSources()],
      storage: {
        mode: "ephemeral",
        persistedJobs: 0,
        persistedSources: 0,
        lastSyncAt: null,
      },
    }),
  };
}

async function syncJobsFeedToDatabase(windowDays: number | null, syncedAt: string) {
  const liveCollections = await collectLiveSourceCollections(windowDays);

  await persistSourcedJobs({
    sources: liveCollections.map((collection) => collection.source),
    jobs: liveCollections.flatMap((collection) => collection.persistedJobs),
    syncedAt,
  });
}

function getJobsRefreshKey(windowDays: number | null) {
  return windowDays ? `window:${windowDays}` : "window:all";
}

async function refreshJobsFeed(windowDays: number | null, syncedAt = new Date().toISOString()) {
  const refreshKey = getJobsRefreshKey(windowDays);
  const existingRefresh = jobsRefreshPromises.get(refreshKey);

  if (existingRefresh) {
    return existingRefresh;
  }

  const refreshPromise = syncJobsFeedToDatabase(windowDays, syncedAt).finally(() => {
    jobsRefreshPromises.delete(refreshKey);
  });

  jobsRefreshPromises.set(refreshKey, refreshPromise);

  return refreshPromise;
}

export function getJobsEnvironmentGuide() {
  return JOBS_ENVIRONMENT_GUIDE;
}

export function getSeededJobsCompanyOptions() {
  return [...BUILTIN_GREENHOUSE_COMPANY_SPECS, ...BUILTIN_WORKDAY_COMPANY_SPECS]
    .map(({ label }) => label)
    .sort((left, right) => left.localeCompare(right));
}

export async function getJobsFeedSnapshot(args?: {
  limit?: number;
  windowDays?: number;
  forceRefresh?: boolean;
}): Promise<JobsFeedResponseDto> {
  const limit = Math.max(1, Math.min(args?.limit ?? DEFAULT_RESPONSE_LIMIT, MAX_RESPONSE_LIMIT));
  const windowDays = normalizeWindowDays(args?.windowDays);
  const generatedAt = new Date().toISOString();

  if (!isDatabaseConfigured()) {
    return (await getLiveJobsFeedPreview({ generatedAt, limit, windowDays })).response;
  }

  try {
    const persisted = await getPersistedJobsFeedSnapshot({ limit, windowDays: windowDays ?? undefined });
    const hasPersistedSnapshot =
      persisted.jobs.length > 0 ||
      persisted.sources.length > 0 ||
      persisted.storage.lastSyncAt !== null;

    if (!args?.forceRefresh && hasPersistedSnapshot) {
      if (!isSnapshotFresh(persisted.storage.lastSyncAt)) {
        void refreshJobsFeed(windowDays).catch((error) => {
          console.error("Jobs background refresh failed; serving cached snapshot instead.", error);
        });
      }

      return buildJobsFeedResponse({
        generatedAt,
        jobs: persisted.jobs,
        sources: [...persisted.sources, ...createNotConfiguredSources()],
        storage: persisted.storage,
      });
    }

    await refreshJobsFeed(windowDays, generatedAt);

    const refreshed = await getPersistedJobsFeedSnapshot({
      limit,
      windowDays: windowDays ?? undefined,
    });

    return buildJobsFeedResponse({
      generatedAt,
      jobs: refreshed.jobs,
      sources: [...refreshed.sources, ...createNotConfiguredSources()],
      storage: refreshed.storage,
    });
  } catch (error) {
    console.error("Jobs persistence failed; falling back to live feed preview.", error);

    return (await getLiveJobsFeedPreview({ generatedAt, limit, windowDays })).response;
  }
}
