import { randomUUID } from "node:crypto";
import type {
  ApplyArtifactType,
  ApplyFailureCode,
  ApplyAtsFamily,
  ApplyRunArtifactDto,
  ApplyRunDto,
  ApplyRunEventDto,
  ApplyRunStatus,
  ApplyRunTerminalStatus,
  ApplicationProfileSnapshotDto,
} from "@/packages/contracts/src";
import {
  type DatabaseQueryable,
  execute,
  getDatabasePool,
  queryOptional,
  queryRequired,
  withDatabaseTransaction,
} from "./client";

type ProfileSnapshotRow = {
  id: string;
  user_id: string;
  schema_family: ApplicationProfileSnapshotDto["schemaFamily"];
  profile_version: number;
  snapshot_json: ApplicationProfileSnapshotDto;
  created_at: Date | string;
};

type ApplyRunRow = {
  id: string;
  user_id: string;
  job_id: string;
  job_posting_url: string;
  company_name: string;
  job_title: string;
  ats_family: ApplyAtsFamily | null;
  adapter_id: string | null;
  profile_snapshot_id: string;
  status: ApplyRunStatus;
  terminal_state: ApplyRunTerminalStatus | null;
  failure_code: ApplyFailureCode | null;
  failure_message: string | null;
  attempt_count: number;
  trace_id: string | null;
  feature_flag_name: string | null;
  metadata_json: Record<string, unknown> | null;
  created_at: Date | string;
  started_at: Date | string | null;
  completed_at: Date | string | null;
  updated_at: Date | string;
};

type ApplyRunEventRow = {
  id: string;
  run_id: string;
  timestamp: Date | string;
  state: ApplyRunStatus;
  step_name: string | null;
  event_type: string;
  message: string | null;
  metadata_json: Record<string, unknown> | null;
};

type ApplyRunArtifactRow = {
  id: string;
  run_id: string;
  artifact_type: ApplyArtifactType;
  storage_key: string;
  content_type: string;
  metadata_json: Record<string, unknown> | null;
  created_at: Date | string;
};

function toIsoString(value: Date | string | null) {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapProfileSnapshotRow(row: ProfileSnapshotRow): ApplicationProfileSnapshotDto {
  const snapshot = row.snapshot_json;

  return {
    ...snapshot,
    createdAt: toIsoString(row.created_at) ?? snapshot.createdAt,
    id: row.id,
    profileVersion: row.profile_version,
    schemaFamily: row.schema_family,
    userId: row.user_id,
  };
}

function mapApplyRunRow(row: ApplyRunRow): ApplyRunDto {
  return {
    adapterId: row.adapter_id,
    atsFamily: row.ats_family,
    attemptCount: row.attempt_count,
    companyName: row.company_name,
    completedAt: toIsoString(row.completed_at),
    createdAt: toIsoString(row.created_at) ?? new Date().toISOString(),
    failureCode: row.failure_code,
    failureMessage: row.failure_message,
    featureFlagName: row.feature_flag_name,
    id: row.id,
    jobId: row.job_id,
    jobPostingUrl: row.job_posting_url,
    jobTitle: row.job_title,
    metadataJson: row.metadata_json ?? {},
    profileSnapshotId: row.profile_snapshot_id,
    startedAt: toIsoString(row.started_at),
    status: row.status,
    terminalState: row.terminal_state,
    traceId: row.trace_id,
    updatedAt: toIsoString(row.updated_at) ?? new Date().toISOString(),
    userId: row.user_id,
  };
}

function mapApplyRunEventRow(row: ApplyRunEventRow): ApplyRunEventDto {
  return {
    eventType: row.event_type,
    id: row.id,
    message: row.message,
    metadataJson: row.metadata_json ?? {},
    runId: row.run_id,
    state: row.state,
    stepName: row.step_name,
    timestamp: toIsoString(row.timestamp) ?? new Date().toISOString(),
  };
}

function mapApplyRunArtifactRow(row: ApplyRunArtifactRow): ApplyRunArtifactDto {
  return {
    artifactType: row.artifact_type,
    contentType: row.content_type,
    createdAt: toIsoString(row.created_at) ?? new Date().toISOString(),
    id: row.id,
    metadataJson: row.metadata_json ?? {},
    runId: row.run_id,
    storageKey: row.storage_key,
  };
}

export async function createProfileSnapshotRecord(args: {
  queryable?: DatabaseQueryable;
  snapshot: ApplicationProfileSnapshotDto;
}) {
  const queryable = args.queryable ?? getDatabasePool();

  await execute(
    queryable,
    `
      INSERT INTO profile_snapshots (
        id,
        user_id,
        schema_family,
        profile_version,
        snapshot_json,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5::jsonb, $6)
    `,
    [
      args.snapshot.id,
      args.snapshot.userId,
      args.snapshot.schemaFamily,
      args.snapshot.profileVersion,
      JSON.stringify(args.snapshot),
      args.snapshot.createdAt,
    ],
  );

  return args.snapshot;
}

export async function createApplyRunRecord(args: {
  queryable?: DatabaseQueryable;
  run: Omit<ApplyRunDto, "updatedAt">;
}) {
  const queryable = args.queryable ?? getDatabasePool();

  await execute(
    queryable,
    `
      INSERT INTO apply_runs (
        id,
        user_id,
        job_id,
        job_posting_url,
        company_name,
        job_title,
        ats_family,
        adapter_id,
        profile_snapshot_id,
        status,
        terminal_state,
        failure_code,
        failure_message,
        attempt_count,
        trace_id,
        feature_flag_name,
        metadata_json,
        created_at,
        started_at,
        completed_at,
        updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17::jsonb, $18, $19, $20, NOW()
      )
    `,
    [
      args.run.id,
      args.run.userId,
      args.run.jobId,
      args.run.jobPostingUrl,
      args.run.companyName,
      args.run.jobTitle,
      args.run.atsFamily,
      args.run.adapterId,
      args.run.profileSnapshotId,
      args.run.status,
      args.run.terminalState,
      args.run.failureCode,
      args.run.failureMessage,
      args.run.attemptCount,
      args.run.traceId,
      args.run.featureFlagName,
      JSON.stringify(args.run.metadataJson ?? {}),
      args.run.createdAt,
      args.run.startedAt,
      args.run.completedAt,
    ],
  );

  return findApplyRunById({
    queryable,
    runId: args.run.id,
  });
}

export async function createApplyRunEventRecord(args: {
  queryable?: DatabaseQueryable;
  event: Omit<ApplyRunEventDto, "id" | "timestamp"> & {
    id?: string;
    timestamp?: string;
  };
}) {
  const queryable = args.queryable ?? getDatabasePool();
  const id = args.event.id ?? `apply_event_${randomUUID()}`;
  const timestamp = args.event.timestamp ?? new Date().toISOString();

  await execute(
    queryable,
    `
      INSERT INTO apply_run_events (
        id,
        run_id,
        timestamp,
        state,
        step_name,
        event_type,
        message,
        metadata_json
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
    `,
    [
      id,
      args.event.runId,
      timestamp,
      args.event.state,
      args.event.stepName,
      args.event.eventType,
      args.event.message,
      JSON.stringify(args.event.metadataJson ?? {}),
    ],
  );

  return {
    ...args.event,
    id,
    metadataJson: args.event.metadataJson ?? {},
    timestamp,
  } satisfies ApplyRunEventDto;
}

export async function createApplyRunArtifactRecord(args: {
  queryable?: DatabaseQueryable;
  artifact: Omit<ApplyRunArtifactDto, "id" | "createdAt"> & {
    id?: string;
    createdAt?: string;
  };
}) {
  const queryable = args.queryable ?? getDatabasePool();
  const id = args.artifact.id ?? `apply_artifact_${randomUUID()}`;
  const createdAt = args.artifact.createdAt ?? new Date().toISOString();

  await execute(
    queryable,
    `
      INSERT INTO apply_run_artifacts (
        id,
        run_id,
        artifact_type,
        storage_key,
        content_type,
        metadata_json,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
    `,
    [
      id,
      args.artifact.runId,
      args.artifact.artifactType,
      args.artifact.storageKey,
      args.artifact.contentType,
      JSON.stringify(args.artifact.metadataJson ?? {}),
      createdAt,
    ],
  );

  return {
    ...args.artifact,
    createdAt,
    id,
    metadataJson: args.artifact.metadataJson ?? {},
  } satisfies ApplyRunArtifactDto;
}

export async function findApplyRunById(args: {
  queryable?: DatabaseQueryable;
  runId: string;
}) {
  const queryable = args.queryable ?? getDatabasePool();
  const row = await queryRequired<ApplyRunRow>(
    queryable,
    `
      SELECT
        id,
        user_id,
        job_id,
        job_posting_url,
        company_name,
        job_title,
        ats_family,
        adapter_id,
        profile_snapshot_id,
        status,
        terminal_state,
        failure_code,
        failure_message,
        attempt_count,
        trace_id,
        feature_flag_name,
        metadata_json,
        created_at,
        started_at,
        completed_at,
        updated_at
      FROM apply_runs
      WHERE id = $1
    `,
    [args.runId],
  );

  return mapApplyRunRow(row);
}

export async function findProfileSnapshotById(args: {
  queryable?: DatabaseQueryable;
  snapshotId: string;
}) {
  const queryable = args.queryable ?? getDatabasePool();
  const row = await queryRequired<ProfileSnapshotRow>(
    queryable,
    `
      SELECT
        id,
        user_id,
        schema_family,
        profile_version,
        snapshot_json,
        created_at
      FROM profile_snapshots
      WHERE id = $1
    `,
    [args.snapshotId],
  );

  return mapProfileSnapshotRow(row);
}

export async function findExistingActiveApplyRun(args: {
  queryable?: DatabaseQueryable;
  jobId: string;
  jobPostingUrl: string;
  userId: string;
}) {
  const queryable = args.queryable ?? getDatabasePool();
  const row = await queryOptional<ApplyRunRow>(
    queryable,
    `
      SELECT
        id,
        user_id,
        job_id,
        job_posting_url,
        company_name,
        job_title,
        ats_family,
        adapter_id,
        profile_snapshot_id,
        status,
        terminal_state,
        failure_code,
        failure_message,
        attempt_count,
        trace_id,
        feature_flag_name,
        metadata_json,
        created_at,
        started_at,
        completed_at,
        updated_at
      FROM apply_runs
      WHERE user_id = $1
        AND job_id = $2
        AND job_posting_url = $3
        AND status IN (
          'created',
          'queued',
          'preflight_validating',
          'snapshot_created',
          'detecting_target',
          'selecting_adapter',
          'launching_browser',
          'auth_required',
          'filling_form',
          'uploading_documents',
          'navigating_steps',
          'submitting'
        )
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [args.userId, args.jobId, args.jobPostingUrl],
  );

  return row ? mapApplyRunRow(row) : null;
}

export async function updateApplyRunRecord(args: {
  runId: string;
  status?: ApplyRunStatus;
  terminalState?: ApplyRunTerminalStatus | null;
  atsFamily?: ApplyAtsFamily | null;
  adapterId?: string | null;
  failureCode?: ApplyFailureCode | null;
  failureMessage?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  traceId?: string | null;
  metadataPatch?: Record<string, unknown>;
}) {
  const metadataPatch = JSON.stringify(args.metadataPatch ?? {});

  await execute(
    getDatabasePool(),
    `
      UPDATE apply_runs
      SET
        status = COALESCE($2, status),
        terminal_state = COALESCE($3, terminal_state),
        ats_family = COALESCE($4, ats_family),
        adapter_id = COALESCE($5, adapter_id),
        failure_code = COALESCE($6, failure_code),
        failure_message = COALESCE($7, failure_message),
        started_at = COALESCE($8, started_at),
        completed_at = COALESCE($9, completed_at),
        trace_id = COALESCE($10, trace_id),
        metadata_json = metadata_json || $11::jsonb,
        updated_at = NOW()
      WHERE id = $1
    `,
    [
      args.runId,
      args.status ?? null,
      args.terminalState ?? null,
      args.atsFamily ?? null,
      args.adapterId ?? null,
      args.failureCode ?? null,
      args.failureMessage ?? null,
      args.startedAt ?? null,
      args.completedAt ?? null,
      args.traceId ?? null,
      metadataPatch,
    ],
  );

  return findApplyRunById({
    runId: args.runId,
  });
}

export async function claimNextQueuedApplyRun() {
  const pool = getDatabasePool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    let nextRun: { id: string } | null = null;

    try {
      nextRun = await queryOptional<{ id: string }>(
        client,
        `
          SELECT id
          FROM apply_runs
          WHERE status = 'queued'
          ORDER BY created_at ASC
          LIMIT 1
          FOR UPDATE SKIP LOCKED
        `,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "";

      if (!message.toLowerCase().includes("skip locked")) {
        throw error;
      }

      nextRun = await queryOptional<{ id: string }>(
        client,
        `
          SELECT id
          FROM apply_runs
          WHERE status = 'queued'
          ORDER BY created_at ASC
          LIMIT 1
          FOR UPDATE
        `,
      );
    }

    if (!nextRun) {
      await client.query("COMMIT");
      return null;
    }

    const row = await queryRequired<ApplyRunRow>(
      client,
      `
        UPDATE apply_runs
        SET
          status = 'preflight_validating',
          started_at = COALESCE(started_at, NOW()),
          updated_at = NOW()
        WHERE id = $1
        RETURNING
          id,
          user_id,
          job_id,
          job_posting_url,
          company_name,
          job_title,
          ats_family,
          adapter_id,
          profile_snapshot_id,
          status,
          terminal_state,
          failure_code,
          failure_message,
          attempt_count,
          trace_id,
          feature_flag_name,
          metadata_json,
          created_at,
          started_at,
          completed_at,
          updated_at
      `,
      [nextRun.id],
    );

    await client.query("COMMIT");
    return mapApplyRunRow(row);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function listApplyRunArtifacts(args: {
  runId: string;
}) {
  const result = await execute<ApplyRunArtifactRow>(
    getDatabasePool(),
    `
      SELECT
        id,
        run_id,
        artifact_type,
        storage_key,
        content_type,
        metadata_json,
        created_at
      FROM apply_run_artifacts
      WHERE run_id = $1
      ORDER BY created_at ASC
    `,
    [args.runId],
  );

  return result.rows.map(mapApplyRunArtifactRow);
}

export async function listApplyRunEvents(args: {
  runId: string;
}) {
  const result = await execute<ApplyRunEventRow>(
    getDatabasePool(),
    `
      SELECT
        id,
        run_id,
        timestamp,
        state,
        step_name,
        event_type,
        message,
        metadata_json
      FROM apply_run_events
      WHERE run_id = $1
      ORDER BY timestamp ASC
    `,
    [args.runId],
  );

  return result.rows.map(mapApplyRunEventRow);
}

export async function createQueuedApplyRun(args: {
  run: Omit<ApplyRunDto, "updatedAt">;
  snapshot: ApplicationProfileSnapshotDto;
}) {
  return withDatabaseTransaction(async (client) => {
    await createProfileSnapshotRecord({
      queryable: client,
      snapshot: args.snapshot,
    });
    const run = await createApplyRunRecord({
      queryable: client,
      run: args.run,
    });

    await createApplyRunEventRecord({
      queryable: client,
      event: {
        eventType: "apply_run.created",
        message: "Apply run created and queued.",
        metadataJson: {
          feature_flag_name: args.run.featureFlagName,
        },
        runId: run.id,
        state: run.status,
        stepName: "start_apply_run",
      },
    });

    return run;
  });
}
