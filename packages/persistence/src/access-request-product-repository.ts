import type {
  AccessRequest,
  AccessScope,
  AccessRequestDeliveryChannel,
  CandidateNotificationPreferences,
} from "@/packages/contracts/src";
import {
  accessRequestSchema,
  candidateNotificationPreferencesSchema,
} from "@/packages/contracts/src";
import { getDatabasePool, queryOptional } from "./client";

type AccessRequestProductRow = {
  created_at: Date | string;
  granted_at: Date | string | null;
  granted_by_actor_id: string | null;
  granted_by_actor_type: AccessRequest["grantedByActorType"];
  id: string;
  justification: string;
  metadata_json: Record<string, unknown> | null;
  organization_id: string;
  organization_name: string;
  rejected_at: Date | string | null;
  requester_name: string;
  requester_user_id: string;
  scope: AccessScope;
  status: AccessRequest["status"];
  subject_display_name: string;
  subject_talent_identity_id: string;
  updated_at: Date | string;
};

type AccessRequestReviewTokenRow = {
  access_request_id: string;
  channel: Exclude<AccessRequestDeliveryChannel, "in_app">;
  created_at: Date | string;
  expires_at: Date | string;
  id: string;
  invalidated_at: Date | string | null;
  last_resolved_at: Date | string | null;
  last_viewed_at: Date | string | null;
  metadata_json: Record<string, unknown> | null;
  token_hash: string;
};

type CandidateNotificationPreferencesRow = {
  access_request_email_enabled: boolean;
  access_request_sms_enabled: boolean;
  updated_at: Date | string;
};

function toIsoString(value: Date | string | null) {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export type AccessRequestProductRecord = {
  createdAt: string;
  grantedAt: string | null;
  grantedExpiresAtOptional: string | null;
  id: string;
  justification: string;
  metadataJson: Record<string, unknown>;
  organizationId: string;
  organizationName: string;
  rejectedAt: string | null;
  requesterName: string;
  requesterUserId: string;
  scope: AccessScope;
  status: AccessRequest["status"];
  subjectDisplayName: string;
  subjectTalentIdentityId: string;
  updatedAt: string;
};

export type AccessRequestReviewTokenRecord = {
  accessRequestId: string;
  channel: Exclude<AccessRequestDeliveryChannel, "in_app">;
  createdAt: string;
  expiresAt: string;
  id: string;
  invalidatedAt: string | null;
  lastResolvedAt: string | null;
  lastViewedAt: string | null;
  metadataJson: Record<string, unknown>;
  tokenHash: string;
};

function mapAccessRequestProductRow(row: AccessRequestProductRow): AccessRequestProductRecord {
  accessRequestSchema.parse({
    id: row.id,
    organizationId: row.organization_id,
    requesterUserId: row.requester_user_id,
    subjectTalentIdentityId: row.subject_talent_identity_id,
    scope: row.scope,
    justification: row.justification,
    status: row.status,
    grantedByActorType: row.granted_by_actor_type,
    grantedByActorId: row.granted_by_actor_id,
    grantedAt: toIsoString(row.granted_at),
    rejectedByActorType: null,
    rejectedByActorId: null,
    rejectedAt: toIsoString(row.rejected_at),
    metadataJson: row.metadata_json ?? {},
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  });

  return {
    createdAt: toIsoString(row.created_at) ?? new Date(0).toISOString(),
    grantedAt: toIsoString(row.granted_at),
    grantedExpiresAtOptional: null,
    id: row.id,
    justification: row.justification,
    metadataJson: row.metadata_json ?? {},
    organizationId: row.organization_id,
    organizationName: row.organization_name,
    rejectedAt: toIsoString(row.rejected_at),
    requesterName: row.requester_name,
    requesterUserId: row.requester_user_id,
    scope: row.scope,
    status: row.status,
    subjectDisplayName: row.subject_display_name,
    subjectTalentIdentityId: row.subject_talent_identity_id,
    updatedAt: toIsoString(row.updated_at) ?? new Date(0).toISOString(),
  };
}

async function findGrantedExpiresAtForRequest(accessRequestId: string) {
  const row = await queryOptional<{ expires_at: Date | string | null }>(
    getDatabasePool(),
    `
      SELECT expires_at
      FROM access_grants
      WHERE access_request_id = $1
        AND status = 'active'
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [accessRequestId],
  );

  return toIsoString(row?.expires_at ?? null);
}

async function enrichWithGrantExpiry(record: AccessRequestProductRecord) {
  return {
    ...record,
    grantedExpiresAtOptional: await findGrantedExpiresAtForRequest(record.id),
  };
}

function mapAccessRequestReviewTokenRow(
  row: AccessRequestReviewTokenRow,
): AccessRequestReviewTokenRecord {
  return {
    accessRequestId: row.access_request_id,
    channel: row.channel,
    createdAt: toIsoString(row.created_at) ?? new Date(0).toISOString(),
    expiresAt: toIsoString(row.expires_at) ?? new Date(0).toISOString(),
    id: row.id,
    invalidatedAt: toIsoString(row.invalidated_at),
    lastResolvedAt: toIsoString(row.last_resolved_at),
    lastViewedAt: toIsoString(row.last_viewed_at),
    metadataJson: row.metadata_json ?? {},
    tokenHash: row.token_hash,
  };
}

export async function listAccessRequestProductRecordsForSubject(args: {
  limit?: number;
  subjectTalentIdentityId: string;
}) {
  const result = await getDatabasePool().query<AccessRequestProductRow>(
    `
      SELECT
        ar.id,
        ar.organization_id,
        o.name AS organization_name,
        ar.requester_user_id,
        requester.full_name AS requester_name,
        ar.subject_talent_identity_id,
        subject.display_name AS subject_display_name,
        ar.scope,
        ar.justification,
        ar.status,
        ar.granted_by_actor_type,
        ar.granted_by_actor_id,
        ar.granted_at,
        ar.rejected_at,
        ar.metadata_json,
        ar.created_at,
        ar.updated_at
      FROM access_requests ar
      INNER JOIN organizations o ON o.id = ar.organization_id
      INNER JOIN users requester ON requester.id = ar.requester_user_id
      INNER JOIN career_identities subject ON subject.id = ar.subject_talent_identity_id
      WHERE ar.subject_talent_identity_id = $1
      ORDER BY ar.updated_at DESC, ar.id DESC
      LIMIT $2
    `,
    [args.subjectTalentIdentityId, args.limit ?? 20],
  );

  return Promise.all(result.rows.map((row) => enrichWithGrantExpiry(mapAccessRequestProductRow(row))));
}

export async function listAccessRequestProductRecordsForRequester(args: {
  limit?: number;
  requesterUserId: string;
  subjectTalentIdentityId?: string | null;
}) {
  const result = await getDatabasePool().query<AccessRequestProductRow>(
    `
      SELECT
        ar.id,
        ar.organization_id,
        o.name AS organization_name,
        ar.requester_user_id,
        requester.full_name AS requester_name,
        ar.subject_talent_identity_id,
        subject.display_name AS subject_display_name,
        ar.scope,
        ar.justification,
        ar.status,
        ar.granted_by_actor_type,
        ar.granted_by_actor_id,
        ar.granted_at,
        ar.rejected_at,
        ar.metadata_json,
        ar.created_at,
        ar.updated_at
      FROM access_requests ar
      INNER JOIN organizations o ON o.id = ar.organization_id
      INNER JOIN users requester ON requester.id = ar.requester_user_id
      INNER JOIN career_identities subject ON subject.id = ar.subject_talent_identity_id
      WHERE ar.requester_user_id = $1
        AND ar.subject_talent_identity_id = COALESCE($2, ar.subject_talent_identity_id)
      ORDER BY ar.updated_at DESC, ar.id DESC
      LIMIT $3
    `,
    [args.requesterUserId, args.subjectTalentIdentityId ?? null, args.limit ?? 20],
  );

  return Promise.all(result.rows.map((row) => enrichWithGrantExpiry(mapAccessRequestProductRow(row))));
}

export async function findAccessRequestProductRecordById(args: {
  requestId: string;
}) {
  const row = await queryOptional<AccessRequestProductRow>(
    getDatabasePool(),
    `
      SELECT
        ar.id,
        ar.organization_id,
        o.name AS organization_name,
        ar.requester_user_id,
        requester.full_name AS requester_name,
        ar.subject_talent_identity_id,
        subject.display_name AS subject_display_name,
        ar.scope,
        ar.justification,
        ar.status,
        ar.granted_by_actor_type,
        ar.granted_by_actor_id,
        ar.granted_at,
        ar.rejected_at,
        ar.metadata_json,
        ar.created_at,
        ar.updated_at
      FROM access_requests ar
      INNER JOIN organizations o ON o.id = ar.organization_id
      INNER JOIN users requester ON requester.id = ar.requester_user_id
      INNER JOIN career_identities subject ON subject.id = ar.subject_talent_identity_id
      WHERE ar.id = $1
    `,
    [args.requestId],
  );

  return row ? enrichWithGrantExpiry(mapAccessRequestProductRow(row)) : null;
}

export async function createAccessRequestReviewTokenRecord(args: {
  accessRequestId: string;
  channel: Exclude<AccessRequestDeliveryChannel, "in_app">;
  expiresAt: string;
  metadataJson?: Record<string, unknown>;
  tokenHash: string;
}) {
  const id = `access_review_token_${crypto.randomUUID()}`;
  const result = await getDatabasePool().query<AccessRequestReviewTokenRow>(
    `
      INSERT INTO access_request_review_tokens (
        id,
        access_request_id,
        channel,
        token_hash,
        expires_at,
        metadata_json
      )
      VALUES ($1, $2, $3, $4, $5, $6::jsonb)
      RETURNING
        id,
        access_request_id,
        channel,
        token_hash,
        expires_at,
        last_viewed_at,
        last_resolved_at,
        invalidated_at,
        metadata_json,
        created_at
    `,
    [
      id,
      args.accessRequestId,
      args.channel,
      args.tokenHash,
      args.expiresAt,
      JSON.stringify(args.metadataJson ?? {}),
    ],
  );

  return mapAccessRequestReviewTokenRow(result.rows[0]);
}

export async function findActiveAccessRequestReviewTokenRecord(args: {
  accessRequestId: string;
  tokenHash: string;
}) {
  const row = await queryOptional<AccessRequestReviewTokenRow>(
    getDatabasePool(),
    `
      SELECT
        id,
        access_request_id,
        channel,
        token_hash,
        expires_at,
        last_viewed_at,
        last_resolved_at,
        invalidated_at,
        metadata_json,
        created_at
      FROM access_request_review_tokens
      WHERE access_request_id = $1
        AND token_hash = $2
        AND invalidated_at IS NULL
        AND expires_at >= NOW()
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [args.accessRequestId, args.tokenHash],
  );

  return row ? mapAccessRequestReviewTokenRow(row) : null;
}

export async function findAccessRequestReviewTokenRecordByHash(args: {
  accessRequestId: string;
  tokenHash: string;
}) {
  const row = await queryOptional<AccessRequestReviewTokenRow>(
    getDatabasePool(),
    `
      SELECT
        id,
        access_request_id,
        channel,
        token_hash,
        expires_at,
        last_viewed_at,
        last_resolved_at,
        invalidated_at,
        metadata_json,
        created_at
      FROM access_request_review_tokens
      WHERE access_request_id = $1
        AND token_hash = $2
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [args.accessRequestId, args.tokenHash],
  );

  return row ? mapAccessRequestReviewTokenRow(row) : null;
}

export async function markAccessRequestReviewTokenViewed(args: {
  tokenId: string;
}) {
  await getDatabasePool().query(
    `
      UPDATE access_request_review_tokens
      SET last_viewed_at = NOW()
      WHERE id = $1
    `,
    [args.tokenId],
  );
}

export async function markAccessRequestReviewTokenResolved(args: {
  tokenId: string;
}) {
  await getDatabasePool().query(
    `
      UPDATE access_request_review_tokens
      SET
        last_resolved_at = NOW(),
        invalidated_at = COALESCE(invalidated_at, NOW())
      WHERE id = $1
    `,
    [args.tokenId],
  );
}

export async function invalidateAccessRequestReviewTokens(args: {
  accessRequestId: string;
  excludeTokenId?: string | null;
}) {
  await getDatabasePool().query(
    `
      UPDATE access_request_review_tokens
      SET invalidated_at = COALESCE(invalidated_at, NOW())
      WHERE access_request_id = $1
        AND id <> COALESCE($2, '')
        AND invalidated_at IS NULL
    `,
    [args.accessRequestId, args.excludeTokenId ?? null],
  );
}

export async function getCandidateNotificationPreferencesRecord(args: {
  careerIdentityId: string;
  phoneNumberConfigured: boolean;
}) {
  const row = await queryOptional<CandidateNotificationPreferencesRow>(
    getDatabasePool(),
    `
      SELECT
        access_request_email_enabled,
        access_request_sms_enabled,
        updated_at
      FROM candidate_notification_preferences
      WHERE career_identity_id = $1
    `,
    [args.careerIdentityId],
  );

  return candidateNotificationPreferencesSchema.parse({
    accessRequestEmailEnabled: row?.access_request_email_enabled ?? true,
    accessRequestSmsEnabled: row?.access_request_sms_enabled ?? false,
    phoneNumberConfigured: args.phoneNumberConfigured,
    updatedAt: toIsoString(row?.updated_at ?? null),
  }) as CandidateNotificationPreferences;
}

export async function updateCandidateNotificationPreferencesRecord(args: {
  accessRequestSmsEnabled: boolean;
  careerIdentityId: string;
  phoneNumberConfigured: boolean;
}) {
  const result = await getDatabasePool().query<CandidateNotificationPreferencesRow>(
    `
      INSERT INTO candidate_notification_preferences (
        career_identity_id,
        access_request_sms_enabled
      )
      VALUES ($1, $2)
      ON CONFLICT (career_identity_id)
      DO UPDATE SET
        access_request_sms_enabled = EXCLUDED.access_request_sms_enabled,
        updated_at = NOW()
      RETURNING
        access_request_email_enabled,
        access_request_sms_enabled,
        updated_at
    `,
    [args.careerIdentityId, args.accessRequestSmsEnabled],
  );

  return candidateNotificationPreferencesSchema.parse({
    accessRequestEmailEnabled: result.rows[0]?.access_request_email_enabled ?? true,
    accessRequestSmsEnabled: result.rows[0]?.access_request_sms_enabled ?? false,
    phoneNumberConfigured: args.phoneNumberConfigured,
    updatedAt: toIsoString(result.rows[0]?.updated_at ?? null),
  }) as CandidateNotificationPreferences;
}
