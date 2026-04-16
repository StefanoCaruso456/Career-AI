import { randomUUID } from "node:crypto";
import type {
  JobPostingDto,
  JobSearchOrigin,
  JobSearchQueryDto,
  JobSourceSnapshotDto,
  JobSourceTrustTier,
  JobValidationStatus,
  JobsFeedStorageDto,
} from "@/packages/contracts/src";
import {
  type DatabaseQueryable,
  getDatabasePool,
  queryOptional,
  withDatabaseTransaction,
} from "./client";

const MAX_PERSISTED_RESPONSE_LIMIT = 30_000;

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
  external_source_job_id: string | null;
  title: string;
  normalized_title: string | null;
  company_name: string;
  normalized_company_name: string | null;
  location: string | null;
  workplace_type: JobPostingDto["workplaceType"] | null;
  department: string | null;
  commitment: string | null;
  salary_text: string | null;
  source_key: string;
  source_label: string;
  source_lane: JobPostingDto["sourceLane"];
  source_quality: JobPostingDto["sourceQuality"];
  source_trust_tier: JobSourceTrustTier | null;
  apply_url: string;
  canonical_apply_url: string | null;
  canonical_job_url: string | null;
  posted_at: Date | string | null;
  updated_at: Date | string | null;
  description_snippet: string | null;
  raw_payload_json: unknown;
  ingested_at: Date | string | null;
  last_validated_at: Date | string | null;
  validation_status: JobValidationStatus | null;
  trust_score: number | string | null;
  dedupe_fingerprint: string | null;
  orchestration_readiness: boolean | null;
  application_path_type: JobPostingDto["applicationPathType"] | null;
  redirect_required: boolean | null;
  orchestration_metadata_json: Record<string, unknown> | null;
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

function normalizeCompanyFilters(values: string[] | undefined) {
  return Array.from(
    new Set(
      (values ?? [])
        .map((value) => value.trim().toLowerCase())
        .filter((value) => value.length > 0),
    ),
  );
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
    const leftTrust = left.trustScore ?? 0;
    const rightTrust = right.trustScore ?? 0;

    if (leftTrust !== rightTrust) {
      return rightTrust - leftTrust;
    }

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
    const dedupeKey = (
      job.dedupeFingerprint ?? normalizeUrlForDeduping(job.canonicalApplyUrl ?? job.applyUrl)
    ).toLowerCase();

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
    applyUrl: row.apply_url,
    applicationPathType: row.application_path_type ?? "unknown",
    canonicalApplyUrl: row.canonical_apply_url ?? row.apply_url,
    canonicalJobUrl: row.canonical_job_url,
    commitment: row.commitment,
    companyName: row.company_name,
    dedupeFingerprint: row.dedupe_fingerprint ?? normalizeUrlForDeduping(row.apply_url).toLowerCase(),
    department: row.department,
    descriptionSnippet: row.description_snippet,
    externalId: row.external_id,
    externalSourceJobId: row.external_source_job_id ?? row.external_id,
    id: row.id,
    ingestedAt: formatIsoString(row.ingested_at) ?? formatIsoString(row.updated_at) ?? new Date().toISOString(),
    lastValidatedAt: formatIsoString(row.last_validated_at),
    location: row.location,
    normalizedCompanyName: row.normalized_company_name ?? row.company_name.trim().toLowerCase(),
    normalizedTitle: row.normalized_title ?? row.title.trim().toLowerCase(),
    orchestrationMetadata: row.orchestration_metadata_json ?? null,
    orchestrationReadiness: Boolean(row.orchestration_readiness),
    postedAt: formatIsoString(row.posted_at),
    rawPayload: row.raw_payload_json ?? null,
    redirectRequired: Boolean(row.redirect_required),
    salaryText: row.salary_text,
    searchReasons: [],
    sourceKey: row.source_key,
    sourceLabel: row.source_label,
    sourceLane: row.source_lane,
    sourceQuality: row.source_quality,
    sourceTrustTier: row.source_trust_tier ?? "unknown",
    title: row.title,
    trustScore:
      typeof row.trust_score === "number"
        ? row.trust_score
        : row.trust_score
          ? Number.parseFloat(row.trust_score)
          : 0,
    updatedAt: formatIsoString(row.updated_at),
    validationStatus: row.validation_status ?? "active_unverified",
    workplaceType: row.workplace_type ?? "unknown",
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
  const dedupeKey = normalizeUrlForDeduping(args.job.canonicalApplyUrl ?? args.job.applyUrl).toLowerCase();

  await args.queryable.query(
    `
      INSERT INTO job_postings (
        id,
        external_id,
        external_source_job_id,
        title,
        normalized_title,
        company_name,
        normalized_company_name,
        location,
        workplace_type,
        department,
        commitment,
        salary_text,
        source_key,
        source_label,
        source_lane,
        source_quality,
        source_trust_tier,
        apply_url,
        canonical_apply_url,
        canonical_job_url,
        dedupe_key,
        posted_at,
        updated_at,
        description_snippet,
        raw_payload_json,
        ingested_at,
        last_validated_at,
        validation_status,
        trust_score,
        dedupe_fingerprint,
        orchestration_readiness,
        application_path_type,
        redirect_required,
        orchestration_metadata_json,
        is_active,
        last_seen_at,
        created_at,
        persisted_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19,
        $20, $21, $22, $23, $24, $25::jsonb, $26, $27, $28, $29, $30, $31, $32, $33, $34::jsonb,
        true, $35, NOW(), $35
      )
      ON CONFLICT (id) DO UPDATE
      SET
        external_id = EXCLUDED.external_id,
        external_source_job_id = EXCLUDED.external_source_job_id,
        title = EXCLUDED.title,
        normalized_title = EXCLUDED.normalized_title,
        company_name = EXCLUDED.company_name,
        normalized_company_name = EXCLUDED.normalized_company_name,
        location = EXCLUDED.location,
        workplace_type = EXCLUDED.workplace_type,
        department = EXCLUDED.department,
        commitment = EXCLUDED.commitment,
        salary_text = EXCLUDED.salary_text,
        source_key = EXCLUDED.source_key,
        source_label = EXCLUDED.source_label,
        source_lane = EXCLUDED.source_lane,
        source_quality = EXCLUDED.source_quality,
        source_trust_tier = EXCLUDED.source_trust_tier,
        apply_url = EXCLUDED.apply_url,
        canonical_apply_url = EXCLUDED.canonical_apply_url,
        canonical_job_url = EXCLUDED.canonical_job_url,
        dedupe_key = EXCLUDED.dedupe_key,
        posted_at = EXCLUDED.posted_at,
        updated_at = EXCLUDED.updated_at,
        description_snippet = EXCLUDED.description_snippet,
        raw_payload_json = EXCLUDED.raw_payload_json,
        ingested_at = EXCLUDED.ingested_at,
        last_validated_at = EXCLUDED.last_validated_at,
        validation_status = EXCLUDED.validation_status,
        trust_score = EXCLUDED.trust_score,
        dedupe_fingerprint = EXCLUDED.dedupe_fingerprint,
        orchestration_readiness = EXCLUDED.orchestration_readiness,
        application_path_type = EXCLUDED.application_path_type,
        redirect_required = EXCLUDED.redirect_required,
        orchestration_metadata_json = EXCLUDED.orchestration_metadata_json,
        is_active = true,
        last_seen_at = EXCLUDED.last_seen_at,
        persisted_at = EXCLUDED.persisted_at
    `,
    [
      args.job.id,
      args.job.externalId,
      args.job.externalSourceJobId ?? args.job.externalId,
      args.job.title,
      args.job.normalizedTitle ?? null,
      args.job.companyName,
      args.job.normalizedCompanyName ?? null,
      args.job.location,
      args.job.workplaceType ?? "unknown",
      args.job.department,
      args.job.commitment,
      args.job.salaryText ?? null,
      args.job.sourceKey,
      args.job.sourceLabel,
      args.job.sourceLane,
      args.job.sourceQuality,
      args.job.sourceTrustTier ?? "unknown",
      args.job.applyUrl,
      args.job.canonicalApplyUrl ?? args.job.applyUrl,
      args.job.canonicalJobUrl ?? null,
      dedupeKey,
      args.job.postedAt,
      args.job.updatedAt,
      args.job.descriptionSnippet,
      JSON.stringify(args.job.rawPayload ?? null),
      args.job.ingestedAt ?? args.syncedAt,
      args.job.lastValidatedAt ?? args.syncedAt,
      args.job.validationStatus ?? "active_unverified",
      args.job.trustScore ?? 0,
      args.job.dedupeFingerprint ?? dedupeKey,
      args.job.orchestrationReadiness ?? false,
      args.job.applicationPathType ?? "unknown",
      args.job.redirectRequired ?? false,
      JSON.stringify(args.job.orchestrationMetadata ?? null),
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
  companies?: string[];
  limit?: number;
  windowDays?: number;
}): Promise<PersistedJobsFeedSnapshot> {
  const limit = Math.max(1, Math.min(args?.limit ?? 18, MAX_PERSISTED_RESPONSE_LIMIT));
  const companies = normalizeCompanyFilters(args?.companies);
  const shouldFilterByCompanies = companies.length > 0;
  const windowDays = Number.isFinite(args?.windowDays)
    ? Math.max(1, Math.min(Math.floor(args?.windowDays ?? 1), 90))
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
          external_source_job_id,
          title,
          normalized_title,
          company_name,
          normalized_company_name,
          location,
          workplace_type,
          department,
          commitment,
          salary_text,
          source_key,
          source_label,
          source_lane,
          source_quality,
          source_trust_tier,
          apply_url,
          canonical_apply_url,
          canonical_job_url,
          posted_at,
          updated_at,
          description_snippet,
          raw_payload_json,
          ingested_at,
          last_validated_at,
          validation_status,
          trust_score,
          dedupe_fingerprint,
          orchestration_readiness,
          application_path_type,
          redirect_required,
          orchestration_metadata_json
        FROM job_postings
        WHERE is_active = true
          AND ($2::timestamptz IS NULL OR COALESCE(updated_at, posted_at, persisted_at) >= $2)
          AND (
            $3::boolean = false
            OR COALESCE(normalized_company_name, LOWER(company_name)) = ANY($4::text[])
          )
        ORDER BY
          COALESCE(trust_score, 0) DESC,
          CASE source_quality WHEN 'high_signal' THEN 0 ELSE 1 END,
          COALESCE(updated_at, posted_at, persisted_at) DESC,
          title ASC
        LIMIT $1
      `,
      [Math.min(Math.max(limit * 6, limit), 30_000), cutoffIso, shouldFilterByCompanies, companies],
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

export async function getPersistedJobPostingById(args: {
  jobId: string;
}) {
  const row = await queryOptional<JobPostingRow>(
    getDatabasePool(),
    `
      SELECT
        id,
        external_id,
        external_source_job_id,
        title,
        normalized_title,
        company_name,
        normalized_company_name,
        location,
        workplace_type,
        department,
        commitment,
        salary_text,
        source_key,
        source_label,
        source_lane,
        source_quality,
        source_trust_tier,
        apply_url,
        canonical_apply_url,
        canonical_job_url,
        posted_at,
        updated_at,
        description_snippet,
        raw_payload_json,
        ingested_at,
        last_validated_at,
        validation_status,
        trust_score,
        dedupe_fingerprint,
        orchestration_readiness,
        application_path_type,
        redirect_required,
        orchestration_metadata_json
      FROM job_postings
      WHERE id = $1
    `,
    [args.jobId],
  );

  return row ? mapJobRow(row) : null;
}

export async function recordJobValidationEvents(args: {
  events: Array<{
    jobId: string;
    reasonCodes: string[];
    sourceTrustTier: JobSourceTrustTier;
    trustScore: number;
    validationStatus: JobValidationStatus;
  }>;
  observedAt?: string;
}) {
  if (args.events.length === 0) {
    return;
  }

  const observedAt = args.observedAt ?? new Date().toISOString();

  await withDatabaseTransaction(async (client) => {
    for (const event of args.events) {
      await client.query(
        `
          INSERT INTO job_validation_events (
            id,
            job_id,
            validation_status,
            source_trust_tier,
            trust_score,
            reason_codes_json,
            observed_at
          )
          VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
        `,
        [
          `job_validation_${randomUUID()}`,
          event.jobId,
          event.validationStatus,
          event.sourceTrustTier,
          event.trustScore,
          JSON.stringify(event.reasonCodes),
          observedAt,
        ],
      );
    }
  });
}

export async function recordJobSearchEvent(args: {
  candidateCounts?: Record<string, number>;
  conversationId?: string | null;
  engineVersion?: string;
  latencyBreakdownMs?: Record<string, number>;
  latencyMs: number;
  origin: JobSearchOrigin;
  ownerId: string;
  prompt: string;
  query: JobSearchQueryDto;
  querySummary?: Record<string, unknown>;
  resultCount: number;
  resultJobIds: string[];
  wideningSteps?: string[];
  zeroResultReasons?: string[];
}) {
  const eventId = `job_search_${randomUUID()}`;

  await getDatabasePool().query(
    `
      INSERT INTO job_search_events (
        id,
        owner_id,
        conversation_id,
        origin,
        prompt,
        normalized_prompt,
        filters_json,
        used_career_id_defaults,
        career_id_signals_json,
        result_count,
        result_job_ids_json,
        engine_version,
        query_summary_json,
        candidate_counts_json,
        widening_steps_json,
        zero_result_reasons_json,
        latency_breakdown_ms_json,
        latency_ms,
        created_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9::jsonb, $10, $11::jsonb, $12, $13::jsonb, $14::jsonb, $15::jsonb, $16::jsonb, $17::jsonb, $18, NOW()
      )
    `,
    [
      eventId,
      args.ownerId,
      args.conversationId ?? null,
      args.origin,
      args.prompt,
      args.query.normalizedPrompt,
      JSON.stringify(args.query.filters),
      args.query.usedCareerIdDefaults,
      JSON.stringify(args.query.careerIdSignals),
      args.resultCount,
      JSON.stringify(args.resultJobIds),
      args.engineVersion ?? "legacy",
      JSON.stringify(args.querySummary ?? {}),
      JSON.stringify(args.candidateCounts ?? {}),
      JSON.stringify(args.wideningSteps ?? []),
      JSON.stringify(args.zeroResultReasons ?? []),
      JSON.stringify(args.latencyBreakdownMs ?? {}),
      args.latencyMs,
    ],
  );

  return eventId;
}

export async function recordJobApplyClickEvent(args: {
  canonicalApplyUrl: string;
  conversationId?: string | null;
  jobId: string;
  metadata?: Record<string, unknown>;
  ownerId: string;
}) {
  const eventId = `job_apply_${randomUUID()}`;

  await getDatabasePool().query(
    `
      INSERT INTO job_apply_click_events (
        id,
        job_id,
        owner_id,
        conversation_id,
        canonical_apply_url,
        metadata_json,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, NOW())
    `,
    [
      eventId,
      args.jobId,
      args.ownerId,
      args.conversationId ?? null,
      args.canonicalApplyUrl,
      JSON.stringify(args.metadata ?? {}),
    ],
  );

  return eventId;
}
