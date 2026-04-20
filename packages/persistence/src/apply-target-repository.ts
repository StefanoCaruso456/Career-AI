import type { JobApplyTargetDto, JobPostingDto } from "@/packages/contracts/src";
import { resolveJobApplyTarget } from "@/packages/apply-adapters/src/resolver";
import {
  type DatabaseQueryable,
  execute,
  getDatabasePool,
  queryOptional,
} from "./client";

type ApplyTargetRow = {
  job_posting_id: string;
  canonical_apply_url: string;
  ats_family: JobApplyTargetDto["atsFamily"] | null;
  confidence: number | string | null;
  matched_rule: string | null;
  routing_mode: JobApplyTargetDto["routingMode"];
  support_reason: string | null;
  support_status: JobApplyTargetDto["supportStatus"];
};

export type ApplyTargetProjectionRow = {
  apply_target_ats_family: JobApplyTargetDto["atsFamily"] | null;
  apply_target_confidence: number | string | null;
  apply_target_matched_rule: string | null;
  apply_target_routing_mode: JobApplyTargetDto["routingMode"] | null;
  apply_target_support_reason: string | null;
  apply_target_support_status: JobApplyTargetDto["supportStatus"] | null;
};

function parseConfidence(value: number | string | null) {
  if (typeof value === "number") {
    return value;
  }

  if (!value) {
    return null;
  }

  const parsed = Number.parseFloat(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function toStoredApplyTarget(args: {
  job: Pick<JobPostingDto, "applyTarget" | "applyUrl" | "canonicalApplyUrl" | "orchestrationReadiness">;
}) {
  const canonicalApplyUrl = args.job.canonicalApplyUrl ?? args.job.applyUrl;

  return (
    args.job.applyTarget ??
    resolveJobApplyTarget({
      canonicalApplyUrl,
      orchestrationReadiness: args.job.orchestrationReadiness,
    })
  );
}

export function mapApplyTargetRow(row: ApplyTargetRow): JobApplyTargetDto {
  return {
    atsFamily: row.ats_family ?? null,
    confidence: parseConfidence(row.confidence),
    matchedRule: row.matched_rule,
    routingMode: row.routing_mode,
    supportReason: row.support_reason,
    supportStatus: row.support_status,
  };
}

export function mapApplyTargetProjectionRow(
  row: ApplyTargetProjectionRow,
): JobApplyTargetDto | undefined {
  if (!row.apply_target_support_status || !row.apply_target_routing_mode) {
    return undefined;
  }

  return {
    atsFamily: row.apply_target_ats_family ?? null,
    confidence: parseConfidence(row.apply_target_confidence),
    matchedRule: row.apply_target_matched_rule,
    routingMode: row.apply_target_routing_mode,
    supportReason: row.apply_target_support_reason,
    supportStatus: row.apply_target_support_status,
  };
}

export function resolveApplyTargetProjection(args: {
  row: ApplyTargetProjectionRow;
  canonicalApplyUrl: string | null | undefined;
  orchestrationReadiness?: boolean | null;
}): JobApplyTargetDto {
  const hydratedTarget = mapApplyTargetProjectionRow(args.row);

  if (hydratedTarget) {
    return hydratedTarget;
  }

  return resolveJobApplyTarget({
    canonicalApplyUrl: args.canonicalApplyUrl,
    orchestrationReadiness: args.orchestrationReadiness,
  });
}

export async function findApplyTargetByJobId(args: {
  jobId: string;
  queryable?: DatabaseQueryable;
}) {
  const queryable = args.queryable ?? getDatabasePool();
  const row = await queryOptional<ApplyTargetRow>(
    queryable,
    `
      SELECT
        job_posting_id,
        canonical_apply_url,
        ats_family,
        confidence,
        matched_rule,
        routing_mode,
        support_reason,
        support_status
      FROM apply_targets
      WHERE job_posting_id = $1
    `,
    [args.jobId],
  );

  return row ? mapApplyTargetRow(row) : null;
}

export async function upsertApplyTargetForJob(args: {
  job: Pick<
    JobPostingDto,
    "id" | "applyTarget" | "applyUrl" | "canonicalApplyUrl" | "orchestrationReadiness"
  >;
  queryable?: DatabaseQueryable;
}) {
  const queryable = args.queryable ?? getDatabasePool();
  const canonicalApplyUrl = args.job.canonicalApplyUrl ?? args.job.applyUrl;
  const target = toStoredApplyTarget({
    job: args.job,
  });

  await execute(
    queryable,
    `
      INSERT INTO apply_targets (
        job_posting_id,
        canonical_apply_url,
        ats_family,
        confidence,
        matched_rule,
        routing_mode,
        support_reason,
        support_status,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
      ON CONFLICT (job_posting_id) DO UPDATE
      SET
        canonical_apply_url = EXCLUDED.canonical_apply_url,
        ats_family = EXCLUDED.ats_family,
        confidence = EXCLUDED.confidence,
        matched_rule = EXCLUDED.matched_rule,
        routing_mode = EXCLUDED.routing_mode,
        support_reason = EXCLUDED.support_reason,
        support_status = EXCLUDED.support_status,
        updated_at = NOW()
    `,
    [
      args.job.id,
      canonicalApplyUrl,
      target.atsFamily,
      target.confidence,
      target.matchedRule,
      target.routingMode,
      target.supportReason,
      target.supportStatus,
    ],
  );

  return target;
}
