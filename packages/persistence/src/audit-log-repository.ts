import type { AuditEvent } from "@/packages/contracts/src";
import { getDatabasePool } from "./client";

type AuditEventRow = {
  actor_id: string;
  actor_type: AuditEvent["actor_type"];
  correlation_id: string;
  event_id: string;
  event_type: string;
  metadata_json: Record<string, unknown> | null;
  occurred_at: Date | string;
  run_id: string | null;
  target_id: string;
  target_type: string;
};

function toIsoString(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapAuditEventRow(row: AuditEventRow): AuditEvent {
  return {
    actor_id: row.actor_id,
    actor_type: row.actor_type,
    correlation_id: row.correlation_id,
    event_id: row.event_id,
    event_type: row.event_type,
    metadata_json: row.metadata_json ?? {},
    occurred_at: toIsoString(row.occurred_at),
    run_id: row.run_id,
    target_id: row.target_id,
    target_type: row.target_type,
  };
}

export async function createAuditEventRecord(args: {
  event: AuditEvent;
}) {
  const pool = getDatabasePool();

  await pool.query(
    `
      INSERT INTO audit_events (
        event_id,
        event_type,
        actor_type,
        actor_id,
        target_type,
        target_id,
        correlation_id,
        run_id,
        occurred_at,
        metadata_json
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
    `,
    [
      args.event.event_id,
      args.event.event_type,
      args.event.actor_type,
      args.event.actor_id,
      args.event.target_type,
      args.event.target_id,
      args.event.correlation_id,
      args.event.run_id ?? null,
      args.event.occurred_at,
      JSON.stringify(args.event.metadata_json ?? {}),
    ],
  );

  return args.event;
}

export async function countPersistedAuditEvents() {
  const pool = getDatabasePool();
  const result = await pool.query<{ total: string }>(
    "SELECT COUNT(*)::text AS total FROM audit_events",
  );

  return Number(result.rows[0]?.total ?? 0);
}

export async function listPersistedAuditEvents() {
  const pool = getDatabasePool();
  const result = await pool.query<AuditEventRow>(`
    SELECT
      event_id,
      event_type,
      actor_type,
      actor_id,
      target_type,
      target_id,
      correlation_id,
      run_id,
      occurred_at,
      metadata_json
    FROM audit_events
    ORDER BY occurred_at ASC, event_id ASC
  `);

  return result.rows.map(mapAuditEventRow);
}
