import type {
  AccessGrant,
  AccessRequest,
  AccessScope,
  ActorType,
  Organization,
  OrganizationMembership,
  OrganizationMembershipRole,
  OrganizationMembershipStatus,
} from "@/packages/contracts/src";
import {
  accessGrantSchema,
  accessRequestSchema,
  organizationMembershipSchema,
  organizationSchema,
} from "@/packages/contracts/src";
import {
  type DatabaseQueryable,
  getDatabasePool,
  queryOptional,
  withDatabaseTransaction,
} from "./client";

type OrganizationRow = {
  id: string;
  name: string;
  created_at: Date | string;
  updated_at: Date | string;
};

type OrganizationMembershipRow = {
  id: string;
  organization_id: string;
  user_id: string;
  role: OrganizationMembershipRole;
  status: OrganizationMembershipStatus;
  created_at: Date | string;
  updated_at: Date | string;
};

type AccessRequestRow = {
  id: string;
  organization_id: string;
  requester_user_id: string;
  subject_talent_identity_id: string;
  scope: AccessScope;
  justification: string;
  status: AccessRequest["status"];
  granted_by_actor_type: ActorType | null;
  granted_by_actor_id: string | null;
  rejected_by_actor_type: ActorType | null;
  rejected_by_actor_id: string | null;
  granted_at: Date | string | null;
  rejected_at: Date | string | null;
  metadata_json: Record<string, unknown> | null;
  created_at: Date | string;
  updated_at: Date | string;
};

type AccessGrantRow = {
  id: string;
  access_request_id: string | null;
  organization_id: string;
  subject_talent_identity_id: string;
  scope: AccessScope;
  status: AccessGrant["status"];
  granted_by_actor_type: ActorType;
  granted_by_actor_id: string;
  expires_at: Date | string | null;
  revoked_at: Date | string | null;
  metadata_json: Record<string, unknown> | null;
  created_at: Date | string;
  updated_at: Date | string;
};

type OrganizationMembershipContextRow = {
  membership_created_at: Date | string;
  membership_id: string;
  membership_role: OrganizationMembershipRole;
  membership_status: OrganizationMembershipStatus;
  membership_updated_at: Date | string;
  organization_created_at: Date | string;
  organization_id: string;
  organization_name: string;
  organization_updated_at: Date | string;
  user_id: string;
};

export type OrganizationMembershipContext = {
  membership: OrganizationMembership;
  organization: Organization;
};

function toIsoString(value: Date | string | null) {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapOrganizationRow(row: OrganizationRow): Organization {
  return organizationSchema.parse({
    id: row.id,
    name: row.name,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  });
}

function mapMembershipRow(row: OrganizationMembershipRow): OrganizationMembership {
  return organizationMembershipSchema.parse({
    id: row.id,
    organizationId: row.organization_id,
    userId: row.user_id,
    role: row.role,
    status: row.status,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  });
}

function mapAccessRequestRow(row: AccessRequestRow): AccessRequest {
  return accessRequestSchema.parse({
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
    rejectedByActorType: row.rejected_by_actor_type,
    rejectedByActorId: row.rejected_by_actor_id,
    rejectedAt: toIsoString(row.rejected_at),
    metadataJson: row.metadata_json ?? {},
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  });
}

function mapAccessGrantRow(row: AccessGrantRow): AccessGrant {
  return accessGrantSchema.parse({
    id: row.id,
    accessRequestId: row.access_request_id,
    organizationId: row.organization_id,
    subjectTalentIdentityId: row.subject_talent_identity_id,
    scope: row.scope,
    status: row.status,
    grantedByActorType: row.granted_by_actor_type,
    grantedByActorId: row.granted_by_actor_id,
    expiresAt: toIsoString(row.expires_at),
    revokedAt: toIsoString(row.revoked_at),
    metadataJson: row.metadata_json ?? {},
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  });
}

function mapOrganizationMembershipContextRow(
  row: OrganizationMembershipContextRow,
): OrganizationMembershipContext {
  return {
    membership: mapMembershipRow({
      id: row.membership_id,
      organization_id: row.organization_id,
      user_id: row.user_id,
      role: row.membership_role,
      status: row.membership_status,
      created_at: row.membership_created_at,
      updated_at: row.membership_updated_at,
    }),
    organization: mapOrganizationRow({
      id: row.organization_id,
      name: row.organization_name,
      created_at: row.organization_created_at,
      updated_at: row.organization_updated_at,
    }),
  };
}

async function insertOrganization(
  queryable: DatabaseQueryable,
  args: {
    id?: string;
    name: string;
  },
) {
  const id = args.id ?? `org_${crypto.randomUUID()}`;
  const result = await queryable.query<OrganizationRow>(
    `
      INSERT INTO organizations (
        id,
        name
      )
      VALUES ($1, $2)
      RETURNING
        id,
        name,
        created_at,
        updated_at
    `,
    [id, args.name],
  );

  return mapOrganizationRow(result.rows[0]);
}

async function insertMembership(
  queryable: DatabaseQueryable,
  args: {
    id?: string;
    organizationId: string;
    role: OrganizationMembershipRole;
    status?: OrganizationMembershipStatus;
    userId: string;
  },
) {
  const id = args.id ?? `org_mem_${crypto.randomUUID()}`;
  const result = await queryable.query<OrganizationMembershipRow>(
    `
      INSERT INTO organization_memberships (
        id,
        organization_id,
        user_id,
        role,
        status
      )
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (organization_id, user_id)
      DO UPDATE SET
        role = EXCLUDED.role,
        status = EXCLUDED.status,
        updated_at = NOW()
      RETURNING
        id,
        organization_id,
        user_id,
        role,
        status,
        created_at,
        updated_at
    `,
    [id, args.organizationId, args.userId, args.role, args.status ?? "active"],
  );

  return mapMembershipRow(result.rows[0]);
}

export async function createOrganizationRecord(args: {
  id?: string;
  name: string;
}) {
  return insertOrganization(getDatabasePool(), args);
}

export async function createOrganizationMembershipRecord(args: {
  id?: string;
  organizationId: string;
  role: OrganizationMembershipRole;
  status?: OrganizationMembershipStatus;
  userId: string;
}) {
  return insertMembership(getDatabasePool(), args);
}

export async function findOrganizationMembership(args: {
  organizationId: string;
  userId: string;
  status?: OrganizationMembershipStatus;
}) {
  const row = await queryOptional<OrganizationMembershipRow>(
    getDatabasePool(),
    `
      SELECT
        id,
        organization_id,
        user_id,
        role,
        status,
        created_at,
        updated_at
      FROM organization_memberships
      WHERE organization_id = $1
        AND user_id = $2
        AND status = COALESCE($3, status)
    `,
    [args.organizationId, args.userId, args.status ?? null],
  );

  return row ? mapMembershipRow(row) : null;
}

export async function listOrganizationMembershipsForUser(args: {
  userId: string;
  status?: OrganizationMembershipStatus;
}) {
  const result = await getDatabasePool().query<OrganizationMembershipRow>(
    `
      SELECT
        id,
        organization_id,
        user_id,
        role,
        status,
        created_at,
        updated_at
      FROM organization_memberships
      WHERE user_id = $1
        AND status = COALESCE($2, status)
      ORDER BY created_at ASC, id ASC
    `,
    [args.userId, args.status ?? null],
  );

  return result.rows.map(mapMembershipRow);
}

export async function listOrganizationMembershipContextsForUser(args: {
  userId: string;
  status?: OrganizationMembershipStatus;
}) {
  const result = await getDatabasePool().query<OrganizationMembershipContextRow>(
    `
      SELECT
        om.id AS membership_id,
        om.organization_id,
        om.user_id,
        om.role AS membership_role,
        om.status AS membership_status,
        om.created_at AS membership_created_at,
        om.updated_at AS membership_updated_at,
        o.name AS organization_name,
        o.created_at AS organization_created_at,
        o.updated_at AS organization_updated_at
      FROM organization_memberships om
      INNER JOIN organizations o ON o.id = om.organization_id
      WHERE om.user_id = $1
        AND om.status = COALESCE($2, om.status)
      ORDER BY om.created_at ASC, om.id ASC
    `,
    [args.userId, args.status ?? null],
  );

  return result.rows.map(mapOrganizationMembershipContextRow);
}

export async function ensurePrimaryOrganizationForUser(args: {
  organizationName: string;
  role?: OrganizationMembershipRole;
  userId: string;
}) {
  return withDatabaseTransaction(async (client) => {
    const existingMembership = await queryOptional<OrganizationMembershipRow>(
      client,
      `
        SELECT
          id,
          organization_id,
          user_id,
          role,
          status,
          created_at,
          updated_at
        FROM organization_memberships
        WHERE user_id = $1
          AND status = 'active'
        ORDER BY created_at ASC, id ASC
      `,
      [args.userId],
    );

    if (existingMembership) {
      return mapMembershipRow(existingMembership);
    }

    const organization = await insertOrganization(client, {
      name: args.organizationName,
    });

    return insertMembership(client, {
      organizationId: organization.id,
      role: args.role ?? "owner",
      status: "active",
      userId: args.userId,
    });
  });
}

export async function createAccessRequestRecord(args: {
  id?: string;
  justification: string;
  metadataJson?: Record<string, unknown>;
  organizationId: string;
  requesterUserId: string;
  scope: AccessScope;
  subjectTalentIdentityId: string;
}) {
  const id = args.id ?? `access_req_${crypto.randomUUID()}`;
  const result = await getDatabasePool().query<AccessRequestRow>(
    `
      INSERT INTO access_requests (
        id,
        organization_id,
        requester_user_id,
        subject_talent_identity_id,
        scope,
        justification,
        metadata_json
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
      RETURNING
        id,
        organization_id,
        requester_user_id,
        subject_talent_identity_id,
        scope,
        justification,
        status,
        granted_by_actor_type,
        granted_by_actor_id,
        rejected_by_actor_type,
        rejected_by_actor_id,
        granted_at,
        rejected_at,
        metadata_json,
        created_at,
        updated_at
    `,
    [
      id,
      args.organizationId,
      args.requesterUserId,
      args.subjectTalentIdentityId,
      args.scope,
      args.justification,
      JSON.stringify(args.metadataJson ?? {}),
    ],
  );

  return mapAccessRequestRow(result.rows[0]);
}

export async function findAccessRequestById(args: {
  requestId: string;
}) {
  const row = await queryOptional<AccessRequestRow>(
    getDatabasePool(),
    `
      SELECT
        id,
        organization_id,
        requester_user_id,
        subject_talent_identity_id,
        scope,
        justification,
        status,
        granted_by_actor_type,
        granted_by_actor_id,
        rejected_by_actor_type,
        rejected_by_actor_id,
        granted_at,
        rejected_at,
        metadata_json,
        created_at,
        updated_at
      FROM access_requests
      WHERE id = $1
    `,
    [args.requestId],
  );

  return row ? mapAccessRequestRow(row) : null;
}

export async function markAccessRequestGranted(args: {
  grantedByActorId: string;
  grantedByActorType: ActorType;
  metadataJson?: Record<string, unknown>;
  requestId: string;
}) {
  const result = await getDatabasePool().query<AccessRequestRow>(
    `
      UPDATE access_requests
      SET
        status = 'granted',
        granted_by_actor_type = $2,
        granted_by_actor_id = $3,
        granted_at = NOW(),
        metadata_json = $4::jsonb,
        updated_at = NOW()
      WHERE id = $1
      RETURNING
        id,
        organization_id,
        requester_user_id,
        subject_talent_identity_id,
        scope,
        justification,
        status,
        granted_by_actor_type,
        granted_by_actor_id,
        rejected_by_actor_type,
        rejected_by_actor_id,
        granted_at,
        rejected_at,
        metadata_json,
        created_at,
        updated_at
    `,
    [
      args.requestId,
      args.grantedByActorType,
      args.grantedByActorId,
      JSON.stringify(args.metadataJson ?? {}),
    ],
  );

  return result.rows[0] ? mapAccessRequestRow(result.rows[0]) : null;
}

export async function markAccessRequestRejected(args: {
  metadataJson?: Record<string, unknown>;
  rejectedByActorId: string;
  rejectedByActorType: ActorType;
  requestId: string;
}) {
  const result = await getDatabasePool().query<AccessRequestRow>(
    `
      UPDATE access_requests
      SET
        status = 'rejected',
        rejected_by_actor_type = $2,
        rejected_by_actor_id = $3,
        rejected_at = NOW(),
        metadata_json = $4::jsonb,
        updated_at = NOW()
      WHERE id = $1
      RETURNING
        id,
        organization_id,
        requester_user_id,
        subject_talent_identity_id,
        scope,
        justification,
        status,
        granted_by_actor_type,
        granted_by_actor_id,
        rejected_by_actor_type,
        rejected_by_actor_id,
        granted_at,
        rejected_at,
        metadata_json,
        created_at,
        updated_at
    `,
    [
      args.requestId,
      args.rejectedByActorType,
      args.rejectedByActorId,
      JSON.stringify(args.metadataJson ?? {}),
    ],
  );

  return result.rows[0] ? mapAccessRequestRow(result.rows[0]) : null;
}

export async function createAccessGrantRecord(args: {
  accessRequestId?: string | null;
  expiresAt?: string | null;
  grantedByActorId: string;
  grantedByActorType: ActorType;
  metadataJson?: Record<string, unknown>;
  organizationId: string;
  scope: AccessScope;
  subjectTalentIdentityId: string;
}) {
  const id = `access_grant_${crypto.randomUUID()}`;
  const result = await getDatabasePool().query<AccessGrantRow>(
    `
      INSERT INTO access_grants (
        id,
        access_request_id,
        organization_id,
        subject_talent_identity_id,
        scope,
        status,
        granted_by_actor_type,
        granted_by_actor_id,
        expires_at,
        metadata_json
      )
      VALUES ($1, $2, $3, $4, $5, 'active', $6, $7, $8, $9::jsonb)
      RETURNING
        id,
        access_request_id,
        organization_id,
        subject_talent_identity_id,
        scope,
        status,
        granted_by_actor_type,
        granted_by_actor_id,
        expires_at,
        revoked_at,
        metadata_json,
        created_at,
        updated_at
    `,
    [
      id,
      args.accessRequestId ?? null,
      args.organizationId,
      args.subjectTalentIdentityId,
      args.scope,
      args.grantedByActorType,
      args.grantedByActorId,
      args.expiresAt ?? null,
      JSON.stringify(args.metadataJson ?? {}),
    ],
  );

  return mapAccessGrantRow(result.rows[0]);
}

export async function findActiveAccessGrant(args: {
  organizationId: string;
  scope: AccessScope;
  subjectTalentIdentityId: string;
}) {
  const row = await queryOptional<AccessGrantRow>(
    getDatabasePool(),
    `
      SELECT
        id,
        access_request_id,
        organization_id,
        subject_talent_identity_id,
        scope,
        status,
        granted_by_actor_type,
        granted_by_actor_id,
        expires_at,
        revoked_at,
        metadata_json,
        created_at,
        updated_at
      FROM access_grants
      WHERE organization_id = $1
        AND subject_talent_identity_id = $2
        AND scope = $3
        AND status = 'active'
        AND (expires_at IS NULL OR expires_at >= NOW())
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [args.organizationId, args.subjectTalentIdentityId, args.scope],
  );

  return row ? mapAccessGrantRow(row) : null;
}
