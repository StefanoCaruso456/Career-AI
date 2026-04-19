import type {
  CareerIdCheckOutcome,
  CareerIdConfidenceBand,
  CareerIdEvidenceType,
  CareerIdVerificationStatus,
  TrustLayer,
} from "@/packages/contracts/src";
import { getDatabasePool, queryOptional, queryRequired, withDatabaseTransaction } from "./client";

type GovernmentIdChecks = {
  documentAuthenticity: CareerIdCheckOutcome;
  liveness: CareerIdCheckOutcome;
  faceMatch: CareerIdCheckOutcome;
};

type CareerIdVerificationRow = {
  attempt_number: number;
  career_identity_id: string;
  checks_json: GovernmentIdChecks | null;
  completed_at: Date | string | null;
  confidence_band: CareerIdConfidenceBand | null;
  created_at: Date | string;
  id: string;
  latest_event_created_at: Date | string | null;
  latest_event_id: string | null;
  latest_payload_hash: string | null;
  manual_review_required: boolean;
  phase: TrustLayer;
  provider: "persona";
  provider_reference_encrypted: string;
  provider_reference_hash: string;
  source: string;
  status: CareerIdVerificationStatus;
  type: "government_id";
  updated_at: Date | string;
};

type CareerIdEvidenceRow = {
  career_identity_id: string;
  completed_at: Date | string | null;
  confidence_band: CareerIdConfidenceBand | null;
  created_at: Date | string;
  id: string;
  label: string;
  manual_review_required: boolean;
  metadata_json: Record<string, unknown> | null;
  phase: TrustLayer;
  provider: "persona" | "internal" | null;
  provider_reference_encrypted: string | null;
  provider_reference_hash: string | null;
  status: CareerIdVerificationStatus;
  type: CareerIdEvidenceType;
  updated_at: Date | string;
};

type CareerIdAuditEventRow = {
  career_identity_id: string;
  created_at: Date | string;
  event_type: string;
  id: string;
  metadata_json: Record<string, unknown> | null;
  payload_hash: string | null;
  provider: string | null;
  provider_event_id: string | null;
  verification_id: string | null;
};

export type CareerIdVerificationRecord = {
  id: string;
  careerIdentityId: string;
  phase: TrustLayer;
  type: "government_id";
  provider: "persona";
  providerReferenceEncrypted: string;
  providerReferenceHash: string;
  status: CareerIdVerificationStatus;
  confidenceBand: CareerIdConfidenceBand | null;
  checks: GovernmentIdChecks;
  manualReviewRequired: boolean;
  latestEventId: string | null;
  latestEventCreatedAt: string | null;
  latestPayloadHash: string | null;
  attemptNumber: number;
  source: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type CareerIdEvidenceRecord = {
  id: string;
  careerIdentityId: string;
  phase: TrustLayer;
  label: string;
  type: CareerIdEvidenceType;
  provider: "persona" | "internal" | null;
  providerReferenceEncrypted: string | null;
  providerReferenceHash: string | null;
  status: CareerIdVerificationStatus;
  confidenceBand: CareerIdConfidenceBand | null;
  manualReviewRequired: boolean;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type CareerIdAuditEventRecord = {
  id: string;
  careerIdentityId: string;
  verificationId: string | null;
  eventType: string;
  provider: string | null;
  providerEventId: string | null;
  payloadHash: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type CareerIdGovernmentVerificationResetResult = {
  deletedAuditEvents: number;
  deletedEvidence: number;
  deletedVerifications: number;
};

type UpsertCareerIdVerificationArgs = Omit<CareerIdVerificationRecord, "createdAt" | "updatedAt"> & {
  createdAt?: string;
  updatedAt?: string;
};

type UpsertCareerIdEvidenceArgs = Omit<CareerIdEvidenceRecord, "createdAt" | "updatedAt"> & {
  createdAt?: string;
  updatedAt?: string;
};

function toIsoString(value: Date | string | null) {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function defaultChecks(): GovernmentIdChecks {
  return {
    documentAuthenticity: "unknown",
    liveness: "unknown",
    faceMatch: "unknown",
  };
}

function mapCareerIdVerificationRow(row: CareerIdVerificationRow): CareerIdVerificationRecord {
  return {
    id: row.id,
    careerIdentityId: row.career_identity_id,
    phase: row.phase,
    type: row.type,
    provider: row.provider,
    providerReferenceEncrypted: row.provider_reference_encrypted,
    providerReferenceHash: row.provider_reference_hash,
    status: row.status,
    confidenceBand: row.confidence_band,
    checks: row.checks_json ?? defaultChecks(),
    manualReviewRequired: row.manual_review_required,
    latestEventId: row.latest_event_id,
    latestEventCreatedAt: toIsoString(row.latest_event_created_at),
    latestPayloadHash: row.latest_payload_hash,
    attemptNumber: row.attempt_number,
    source: row.source,
    createdAt: toIsoString(row.created_at)!,
    updatedAt: toIsoString(row.updated_at)!,
    completedAt: toIsoString(row.completed_at),
  };
}

function mapCareerIdEvidenceRow(row: CareerIdEvidenceRow): CareerIdEvidenceRecord {
  return {
    id: row.id,
    careerIdentityId: row.career_identity_id,
    phase: row.phase,
    label: row.label,
    type: row.type,
    provider: row.provider,
    providerReferenceEncrypted: row.provider_reference_encrypted,
    providerReferenceHash: row.provider_reference_hash,
    status: row.status,
    confidenceBand: row.confidence_band,
    manualReviewRequired: row.manual_review_required,
    metadata: row.metadata_json ?? {},
    createdAt: toIsoString(row.created_at)!,
    updatedAt: toIsoString(row.updated_at)!,
    completedAt: toIsoString(row.completed_at),
  };
}

function mapCareerIdAuditEventRow(row: CareerIdAuditEventRow): CareerIdAuditEventRecord {
  return {
    id: row.id,
    careerIdentityId: row.career_identity_id,
    verificationId: row.verification_id,
    eventType: row.event_type,
    provider: row.provider,
    providerEventId: row.provider_event_id,
    payloadHash: row.payload_hash,
    metadata: row.metadata_json ?? {},
    createdAt: toIsoString(row.created_at)!,
  };
}

export async function listCareerIdVerifications(args: {
  careerIdentityId: string;
}) {
  const pool = getDatabasePool();
  const result = await pool.query<CareerIdVerificationRow>(
    `
      SELECT
        id,
        career_identity_id,
        phase,
        type,
        provider,
        provider_reference_hash,
        provider_reference_encrypted,
        status,
        confidence_band,
        checks_json,
        manual_review_required,
        latest_event_id,
        latest_event_created_at,
        latest_payload_hash,
        attempt_number,
        source,
        created_at,
        updated_at,
        completed_at
      FROM career_id_verifications
      WHERE career_identity_id = $1
      ORDER BY attempt_number DESC, created_at DESC
    `,
    [args.careerIdentityId],
  );

  return result.rows.map(mapCareerIdVerificationRow);
}

export async function getCareerIdVerificationById(args: {
  verificationId: string;
}) {
  const row = await queryOptional<CareerIdVerificationRow>(
    getDatabasePool(),
    `
      SELECT
        id,
        career_identity_id,
        phase,
        type,
        provider,
        provider_reference_hash,
        provider_reference_encrypted,
        status,
        confidence_band,
        checks_json,
        manual_review_required,
        latest_event_id,
        latest_event_created_at,
        latest_payload_hash,
        attempt_number,
        source,
        created_at,
        updated_at,
        completed_at
      FROM career_id_verifications
      WHERE id = $1
    `,
    [args.verificationId],
  );

  return row ? mapCareerIdVerificationRow(row) : null;
}

export async function findCareerIdVerificationByProviderReferenceHash(args: {
  providerReferenceHash: string;
}) {
  const row = await queryOptional<CareerIdVerificationRow>(
    getDatabasePool(),
    `
      SELECT
        id,
        career_identity_id,
        phase,
        type,
        provider,
        provider_reference_hash,
        provider_reference_encrypted,
        status,
        confidence_band,
        checks_json,
        manual_review_required,
        latest_event_id,
        latest_event_created_at,
        latest_payload_hash,
        attempt_number,
        source,
        created_at,
        updated_at,
        completed_at
      FROM career_id_verifications
      WHERE provider_reference_hash = $1
    `,
    [args.providerReferenceHash],
  );

  return row ? mapCareerIdVerificationRow(row) : null;
}

export async function upsertCareerIdVerification(args: {
  record: UpsertCareerIdVerificationArgs;
}) {
  const row = await queryRequired<CareerIdVerificationRow>(
    getDatabasePool(),
    `
      INSERT INTO career_id_verifications (
        id,
        career_identity_id,
        phase,
        type,
        provider,
        provider_reference_hash,
        provider_reference_encrypted,
        status,
        confidence_band,
        checks_json,
        manual_review_required,
        latest_event_id,
        latest_event_created_at,
        latest_payload_hash,
        attempt_number,
        source,
        created_at,
        updated_at,
        completed_at
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9,
        $10::jsonb,
        $11,
        $12,
        $13,
        $14,
        $15,
        $16,
        COALESCE($17::timestamptz, NOW()),
        COALESCE($18::timestamptz, NOW()),
        $19
      )
      ON CONFLICT (id)
      DO UPDATE SET
        provider_reference_hash = EXCLUDED.provider_reference_hash,
        provider_reference_encrypted = EXCLUDED.provider_reference_encrypted,
        status = EXCLUDED.status,
        confidence_band = EXCLUDED.confidence_band,
        checks_json = EXCLUDED.checks_json,
        manual_review_required = EXCLUDED.manual_review_required,
        latest_event_id = EXCLUDED.latest_event_id,
        latest_event_created_at = EXCLUDED.latest_event_created_at,
        latest_payload_hash = EXCLUDED.latest_payload_hash,
        attempt_number = EXCLUDED.attempt_number,
        source = EXCLUDED.source,
        updated_at = COALESCE(EXCLUDED.updated_at, NOW()),
        completed_at = EXCLUDED.completed_at
      RETURNING
        id,
        career_identity_id,
        phase,
        type,
        provider,
        provider_reference_hash,
        provider_reference_encrypted,
        status,
        confidence_band,
        checks_json,
        manual_review_required,
        latest_event_id,
        latest_event_created_at,
        latest_payload_hash,
        attempt_number,
        source,
        created_at,
        updated_at,
        completed_at
    `,
    [
      args.record.id,
      args.record.careerIdentityId,
      args.record.phase,
      args.record.type,
      args.record.provider,
      args.record.providerReferenceHash,
      args.record.providerReferenceEncrypted,
      args.record.status,
      args.record.confidenceBand,
      JSON.stringify(args.record.checks),
      args.record.manualReviewRequired,
      args.record.latestEventId,
      args.record.latestEventCreatedAt,
      args.record.latestPayloadHash,
      args.record.attemptNumber,
      args.record.source,
      args.record.createdAt ?? null,
      args.record.updatedAt ?? null,
      args.record.completedAt,
    ],
  );

  return mapCareerIdVerificationRow(row);
}

export async function listCareerIdEvidence(args: {
  careerIdentityId: string;
}) {
  const pool = getDatabasePool();
  const result = await pool.query<CareerIdEvidenceRow>(
    `
      SELECT
        id,
        career_identity_id,
        phase,
        label,
        type,
        provider,
        provider_reference_hash,
        provider_reference_encrypted,
        status,
        confidence_band,
        manual_review_required,
        metadata_json,
        created_at,
        updated_at,
        completed_at
      FROM career_id_evidence
      WHERE career_identity_id = $1
      ORDER BY updated_at DESC, created_at DESC
    `,
    [args.careerIdentityId],
  );

  return result.rows.map(mapCareerIdEvidenceRow);
}

export async function getCareerIdEvidenceById(args: {
  evidenceId: string;
}) {
  const row = await queryOptional<CareerIdEvidenceRow>(
    getDatabasePool(),
    `
      SELECT
        id,
        career_identity_id,
        phase,
        label,
        type,
        provider,
        provider_reference_hash,
        provider_reference_encrypted,
        status,
        confidence_band,
        manual_review_required,
        metadata_json,
        created_at,
        updated_at,
        completed_at
      FROM career_id_evidence
      WHERE id = $1
    `,
    [args.evidenceId],
  );

  return row ? mapCareerIdEvidenceRow(row) : null;
}

export async function upsertCareerIdEvidence(args: {
  record: UpsertCareerIdEvidenceArgs;
}) {
  const row = await queryRequired<CareerIdEvidenceRow>(
    getDatabasePool(),
    `
      INSERT INTO career_id_evidence (
        id,
        career_identity_id,
        phase,
        label,
        type,
        provider,
        provider_reference_hash,
        provider_reference_encrypted,
        status,
        confidence_band,
        manual_review_required,
        metadata_json,
        created_at,
        updated_at,
        completed_at
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9,
        $10,
        $11,
        $12::jsonb,
        COALESCE($13::timestamptz, NOW()),
        COALESCE($14::timestamptz, NOW()),
        $15
      )
      ON CONFLICT (career_identity_id, type)
      DO UPDATE SET
        phase = EXCLUDED.phase,
        label = EXCLUDED.label,
        provider = EXCLUDED.provider,
        provider_reference_hash = EXCLUDED.provider_reference_hash,
        provider_reference_encrypted = EXCLUDED.provider_reference_encrypted,
        status = EXCLUDED.status,
        confidence_band = EXCLUDED.confidence_band,
        manual_review_required = EXCLUDED.manual_review_required,
        metadata_json = EXCLUDED.metadata_json,
        updated_at = COALESCE(EXCLUDED.updated_at, NOW()),
        completed_at = EXCLUDED.completed_at
      RETURNING
        id,
        career_identity_id,
        phase,
        label,
        type,
        provider,
        provider_reference_hash,
        provider_reference_encrypted,
        status,
        confidence_band,
        manual_review_required,
        metadata_json,
        created_at,
        updated_at,
        completed_at
    `,
    [
      args.record.id,
      args.record.careerIdentityId,
      args.record.phase,
      args.record.label,
      args.record.type,
      args.record.provider,
      args.record.providerReferenceHash,
      args.record.providerReferenceEncrypted,
      args.record.status,
      args.record.confidenceBand,
      args.record.manualReviewRequired,
      JSON.stringify(args.record.metadata ?? {}),
      args.record.createdAt ?? null,
      args.record.updatedAt ?? null,
      args.record.completedAt,
    ],
  );

  return mapCareerIdEvidenceRow(row);
}

export async function getCareerIdAuditEventByProviderEvent(args: {
  provider: string;
  providerEventId: string;
}) {
  const row = await queryOptional<CareerIdAuditEventRow>(
    getDatabasePool(),
    `
      SELECT
        id,
        career_identity_id,
        verification_id,
        event_type,
        provider,
        provider_event_id,
        payload_hash,
        metadata_json,
        created_at
      FROM career_id_audit_events
      WHERE provider = $1 AND provider_event_id = $2
    `,
    [args.provider, args.providerEventId],
  );

  return row ? mapCareerIdAuditEventRow(row) : null;
}

export async function createCareerIdAuditEvent(args: {
  id: string;
  careerIdentityId: string;
  verificationId?: string | null;
  eventType: string;
  provider?: string | null;
  providerEventId?: string | null;
  payloadHash?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const pool = getDatabasePool();
  const result = await pool.query<CareerIdAuditEventRow>(
    `
      INSERT INTO career_id_audit_events (
        id,
        career_identity_id,
        verification_id,
        event_type,
        provider,
        provider_event_id,
        payload_hash,
        metadata_json
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
      ON CONFLICT (provider, provider_event_id)
      DO NOTHING
      RETURNING
        id,
        career_identity_id,
        verification_id,
        event_type,
        provider,
        provider_event_id,
        payload_hash,
        metadata_json,
        created_at
    `,
    [
      args.id,
      args.careerIdentityId,
      args.verificationId ?? null,
      args.eventType,
      args.provider ?? null,
      args.providerEventId ?? null,
      args.payloadHash ?? null,
      JSON.stringify(args.metadata ?? {}),
    ],
  );

  const row = result.rows[0];
  return row ? mapCareerIdAuditEventRow(row) : null;
}

export async function listCareerIdAuditEvents(args: {
  careerIdentityId: string;
}) {
  const pool = getDatabasePool();
  const result = await pool.query<CareerIdAuditEventRow>(
    `
      SELECT
        id,
        career_identity_id,
        verification_id,
        event_type,
        provider,
        provider_event_id,
        payload_hash,
        metadata_json,
        created_at
      FROM career_id_audit_events
      WHERE career_identity_id = $1
      ORDER BY created_at ASC, id ASC
    `,
    [args.careerIdentityId],
  );

  return result.rows.map(mapCareerIdAuditEventRow);
}

export async function resetCareerIdGovernmentVerificationState(args: {
  careerIdentityId: string;
}): Promise<CareerIdGovernmentVerificationResetResult> {
  return withDatabaseTransaction(async (client) => {
    const verificationIdResult = await client.query<{ id: string }>(
      `
        SELECT id
        FROM career_id_verifications
        WHERE career_identity_id = $1
          AND type = 'government_id'
      `,
      [args.careerIdentityId],
    );
    const verificationIds = verificationIdResult.rows.map((row) => row.id);

    let deletedAuditEvents = 0;

    if (verificationIds.length > 0) {
      const auditCountResult = await client.query<{ total: string }>(
        `
          SELECT COUNT(*)::text AS total
          FROM career_id_audit_events
          WHERE career_identity_id = $1
            AND verification_id = ANY($2::text[])
        `,
        [args.careerIdentityId, verificationIds],
      );
      deletedAuditEvents = Number(auditCountResult.rows[0]?.total ?? "0");
    }

    const evidenceDeleteResult = await client.query(
      `
        DELETE FROM career_id_evidence
        WHERE career_identity_id = $1
          AND type = 'government_id'
      `,
      [args.careerIdentityId],
    );
    const verificationDeleteResult = await client.query(
      `
        DELETE FROM career_id_verifications
        WHERE career_identity_id = $1
          AND type = 'government_id'
      `,
      [args.careerIdentityId],
    );

    return {
      deletedAuditEvents,
      deletedEvidence: evidenceDeleteResult.rowCount ?? 0,
      deletedVerifications: verificationDeleteResult.rowCount ?? 0,
    };
  });
}
