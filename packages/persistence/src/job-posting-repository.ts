import type {
  JobPostingDto,
  JobSourceSnapshotDto,
  JobsFeedStorageDto,
} from "@/packages/contracts/src";
import {
  type DatabaseQueryable,
  getDatabasePool,
  queryOptional,
  withDatabaseTransaction,
} from "./client";

const MAX_PERSISTED_RESPONSE_LIMIT = 5_000;

type JobSourceRow = {
  source_key: string;
  source_label: string;
  source_lane: JobSourceSnapshotDto["lane"];
  source_quality: JobSourceSnapshotDto["quality"];
  status: JobSourceSnapshotDto["status"];
  endpoint_label: string | null;
  message: string;
  job_count: number;
  last_synced_at: Date | string;
};

type JobPostingRow = {
  id: string;
  external_id: string;
  title: string;
  company_name: string;
  location: string | null;
  department: string | null;
  commitment: string | null;
  source_key: string;
  source_label: string;
  source_lane: JobPostingDto["sourceLane"];
  source_quality: JobPostingDto["sourceQuality"];
  apply_url: string;
  posted_at: Date | string | null;
  updated_at: Date | string | null;
  description_snippet: string | null;
};

export type PersistedJobsFeedSnapshot = {
  jobs: JobPostingDto[];
  sources: JobSourceSnapshotDto[];
  storage: JobsFeedStorageDto;
};

function formatIsoString(value: Date | string | null) {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
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

function dedupeJobs(jobs: JobPostingDto[]) {
  const seenKeys = new Set<string>();
  const deduped: JobPostingDto[] = [];

  for (const job of sortJobs(jobs)) {
    const dedupeKey = normalizeUrlForDeduping(job.applyUrl).toLowerCase();

    if (seenKeys.has(dedupeKey)) {
      continue;
    }

    seenKeys.add(dedupeKey);
    deduped.push(job);
  }

  return deduped;
}

function mapSourceRow(row: JobSourceRow): JobSourceSnapshotDto {
  return {
    key: row.source_key,
    label: row.source_label,
    lane: row.source_lane,
    quality: row.source_quality,
    status: row.status,
    jobCount: row.job_count,
    endpointLabel: row.endpoint_label,
    lastSyncedAt: formatIsoString(row.last_synced_at),
    message: row.message,
  };
}

function mapJobRow(row: JobPostingRow): JobPostingDto {
  return {
    id: row.id,
    externalId: row.external_id,
    title: row.title,
    companyName: row.company_name,
    location: row.location,
    department: row.department,
    commitment: row.commitment,
    sourceKey: row.source_key,
    sourceLabel: row.source_label,
    sourceLane: row.source_lane,
    sourceQuality: row.source_quality,
    applyUrl: row.apply_url,
    postedAt: formatIsoString(row.posted_at),
    updatedAt: formatIsoString(row.updated_at),
    descriptionSnippet: row.description_snippet,
  };
}

async function upsertSource(args: {
  queryable: DatabaseQueryable;
  source: JobSourceSnapshotDto;
  syncedAt: string;
}) {
  await args.queryable.query(
    `
      INSERT INTO job_sources (
        source_key,
        source_label,
        source_lane,
        source_quality,
        status,
        endpoint_label,
        message,
        job_count,
        last_synced_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      ON CONFLICT (source_key) DO UPDATE
      SET
        source_label = EXCLUDED.source_label,
        source_lane = EXCLUDED.source_lane,
        source_quality = EXCLUDED.source_quality,
        status = EXCLUDED.status,
        endpoint_label = EXCLUDED.endpoint_label,
        message = EXCLUDED.message,
        job_count = EXCLUDED.job_count,
        last_synced_at = EXCLUDED.last_synced_at,
        updated_at = NOW()
    `,
    [
      args.source.key,
      args.source.label,
      args.source.lane,
      args.source.quality,
      args.source.status,
      args.source.endpointLabel,
      args.source.message,
      args.source.jobCount,
      args.syncedAt,
    ],
  );
}

async function upsertJob(args: {
  queryable: DatabaseQueryable;
  job: JobPostingDto;
  syncedAt: string;
}) {
  const dedupeKey = normalizeUrlForDeduping(args.job.applyUrl).toLowerCase();

  await args.queryable.query(
    `
      INSERT INTO job_postings (
        id,
        external_id,
        title,
        company_name,
        location,
        department,
        commitment,
        source_key,
        source_label,
        source_lane,
        source_quality,
        apply_url,
        dedupe_key,
        posted_at,
        updated_at,
        description_snippet,
        is_active,
        last_seen_at,
        created_at,
        persisted_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, true, $17, NOW(), $17
      )
      ON CONFLICT (id) DO UPDATE
      SET
        external_id = EXCLUDED.external_id,
        title = EXCLUDED.title,
        company_name = EXCLUDED.company_name,
        location = EXCLUDED.location,
        department = EXCLUDED.department,
        commitment = EXCLUDED.commitment,
        source_key = EXCLUDED.source_key,
        source_label = EXCLUDED.source_label,
        source_lane = EXCLUDED.source_lane,
        source_quality = EXCLUDED.source_quality,
        apply_url = EXCLUDED.apply_url,
        dedupe_key = EXCLUDED.dedupe_key,
        posted_at = EXCLUDED.posted_at,
        updated_at = EXCLUDED.updated_at,
        description_snippet = EXCLUDED.description_snippet,
        is_active = true,
        last_seen_at = EXCLUDED.last_seen_at,
        persisted_at = EXCLUDED.persisted_at
    `,
    [
      args.job.id,
      args.job.externalId,
      args.job.title,
      args.job.companyName,
      args.job.location,
      args.job.department,
      args.job.commitment,
      args.job.sourceKey,
      args.job.sourceLabel,
      args.job.sourceLane,
      args.job.sourceQuality,
      args.job.applyUrl,
      dedupeKey,
      args.job.postedAt,
      args.job.updatedAt,
      args.job.descriptionSnippet,
      args.syncedAt,
    ],
  );
}

async function deactivateMissingJobsForSource(args: {
  queryable: DatabaseQueryable;
  sourceKey: string;
  currentIds: string[];
  syncedAt: string;
}) {
  const existing = await args.queryable.query<{ id: string }>(
    "SELECT id FROM job_postings WHERE source_key = $1 AND is_active = true",
    [args.sourceKey],
  );
  const currentIds = new Set(args.currentIds);

  for (const row of existing.rows) {
    if (currentIds.has(row.id)) {
      continue;
    }

    await args.queryable.query(
      "UPDATE job_postings SET is_active = false, persisted_at = $2 WHERE id = $1",
      [row.id, args.syncedAt],
    );
  }
}

export async function persistSourcedJobs(args: {
  sources: JobSourceSnapshotDto[];
  jobs: JobPostingDto[];
  syncedAt?: string;
}) {
  const syncedAt = args.syncedAt ?? new Date().toISOString();
  const persistedSources = args.sources.filter((source) => source.status !== "not_configured");
  const jobsBySourceKey = new Map<string, JobPostingDto[]>();

  for (const job of args.jobs) {
    const jobs = jobsBySourceKey.get(job.sourceKey) ?? [];
    jobs.push(job);
    jobsBySourceKey.set(job.sourceKey, jobs);
  }

  await withDatabaseTransaction(async (client) => {
    for (const source of persistedSources) {
      await upsertSource({ queryable: client, source, syncedAt });

      const sourceJobs = jobsBySourceKey.get(source.key) ?? [];

      for (const job of sourceJobs) {
        await upsertJob({ queryable: client, job, syncedAt });
      }

      if (source.status === "connected") {
        await deactivateMissingJobsForSource({
          queryable: client,
          sourceKey: source.key,
          currentIds: sourceJobs.map((job) => job.id),
          syncedAt,
        });
      }
    }
  });
}

export async function getPersistedJobsFeedSnapshot(args?: {
  limit?: number;
  windowDays?: number;
}): Promise<PersistedJobsFeedSnapshot> {
  const limit = Math.max(1, Math.min(args?.limit ?? 18, MAX_PERSISTED_RESPONSE_LIMIT));
  const windowDays = Number.isFinite(args?.windowDays)
    ? Math.max(1, Math.min(Math.floor(args?.windowDays ?? 1), 30))
    : null;
  const cutoffIso = windowDays
    ? new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString()
    : null;
  const pool = getDatabasePool();
  const [sourcesResult, jobsResult, lastSyncRow] = await Promise.all([
    pool.query<JobSourceRow>(
      `
        SELECT
          source_key,
          source_label,
          source_lane,
          source_quality,
          status,
          endpoint_label,
          message,
          job_count,
          last_synced_at
        FROM job_sources
        ORDER BY
          CASE source_lane WHEN 'ats_direct' THEN 0 ELSE 1 END,
          CASE source_quality WHEN 'high_signal' THEN 0 ELSE 1 END,
          source_label ASC
      `,
    ),
    pool.query<JobPostingRow>(
      `
        SELECT
          id,
          external_id,
          title,
          company_name,
          location,
          department,
          commitment,
          source_key,
          source_label,
          source_lane,
          source_quality,
          apply_url,
          posted_at,
          updated_at,
          description_snippet
        FROM job_postings
        WHERE is_active = true
          AND ($2::timestamptz IS NULL OR COALESCE(updated_at, posted_at, persisted_at) >= $2)
        ORDER BY
          CASE source_quality WHEN 'high_signal' THEN 0 ELSE 1 END,
          COALESCE(updated_at, posted_at, persisted_at) DESC,
          title ASC
        LIMIT $1
      `,
      [Math.min(Math.max(limit * 6, limit), 30_000), cutoffIso],
    ),
    queryOptional<{ last_synced_at: Date | string }>(
      pool,
      "SELECT MAX(last_synced_at) AS last_synced_at FROM job_sources",
    ),
  ]);

  const sources = sourcesResult.rows.map(mapSourceRow);
  const jobs = dedupeJobs(jobsResult.rows.map(mapJobRow)).slice(0, limit);

  return {
    jobs,
    sources,
    storage: {
      mode: "database",
      persistedJobs: jobs.length,
      persistedSources: sources.length,
      lastSyncAt: formatIsoString(lastSyncRow?.last_synced_at ?? null),
    },
  };
}
