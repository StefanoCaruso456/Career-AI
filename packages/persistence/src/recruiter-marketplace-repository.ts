import type {
  EmployerPartner,
  EmployerPartnerStatus,
  RecruiterA2AMessageType,
  RecruiterAccessGrant,
  RecruiterAccessGrantStatus,
  RecruiterCareerIdentity,
  RecruiterCareerIdentityStatus,
  RecruiterCareerIdentityVisibility,
  RecruiterConversation,
  RecruiterConversationMessage,
  RecruiterConversationMessageRole,
  RecruiterConversationStatus,
  RecruiterJobCitation,
  RecruiterJobPermissionScope,
  RecruiterOwnedJob,
  RecruiterOwnedJobStatus,
  RecruiterOwnedJobVisibility,
  RecruiterRetrievalMode,
  SyntheticDataSeedRun,
  SyntheticDataSeedRunStatus,
} from "@/packages/contracts/src";
import type { ActorType } from "@/packages/contracts/src";
import {
  getDatabasePool,
  queryOptional,
  queryRequired,
  type DatabaseQueryable,
} from "./client";

type EmployerPartnerRow = {
  id: string;
  slug: string;
  display_name: string;
  legal_name: string | null;
  website_url: string | null;
  logo_url: string | null;
  status: EmployerPartnerStatus;
  created_at: Date | string;
  updated_at: Date | string;
};

type RecruiterCareerIdentityRow = {
  id: string;
  agent_id: string;
  employer_partner_id: string;
  display_name: string;
  recruiter_role_title: string;
  bio: string;
  company_name: string;
  status: RecruiterCareerIdentityStatus;
  visibility: RecruiterCareerIdentityVisibility;
  synthetic: boolean;
  avatar_metadata_json: Record<string, unknown> | null;
  ownership_scope_json: Record<string, unknown> | null;
  created_at: Date | string;
  updated_at: Date | string;
};

type RecruiterOwnedJobRow = {
  id: string;
  recruiter_career_identity_id: string;
  employer_partner_id: string;
  title: string;
  location: string | null;
  department: string | null;
  employment_type: string | null;
  seniority: string | null;
  compensation_min: number | string | null;
  compensation_max: number | string | null;
  compensation_currency: string | null;
  description: string;
  responsibilities_json: unknown;
  qualifications_json: unknown;
  preferred_qualifications_json: unknown;
  status: RecruiterOwnedJobStatus;
  visibility: RecruiterOwnedJobVisibility;
  searchable_text: string;
  retrieval_metadata_json: Record<string, unknown> | null;
  synthetic: boolean;
  created_at: Date | string;
  updated_at: Date | string;
};

type RecruiterAccessGrantRow = {
  id: string;
  recruiter_career_identity_id: string;
  employer_partner_id: string;
  job_seeker_career_identity_id: string;
  requested_at: Date | string;
  approved_at: Date | string | null;
  denied_at: Date | string | null;
  revoked_at: Date | string | null;
  status: RecruiterAccessGrantStatus;
  granted_scopes: string[] | null;
  expires_at: Date | string | null;
  created_by_actor_type: ActorType;
  created_by_actor_id: string;
  approval_source: string;
  metadata_json: Record<string, unknown> | null;
  created_at: Date | string;
  updated_at: Date | string;
};

type RecruiterConversationRow = {
  id: string;
  recruiter_career_identity_id: string;
  job_seeker_career_identity_id: string;
  status: RecruiterConversationStatus;
  last_message_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

type RecruiterConversationMessageRow = {
  id: string;
  conversation_id: string;
  sender_role: RecruiterConversationMessageRole;
  content: string;
  citations_json: unknown;
  retrieval_mode: RecruiterRetrievalMode | null;
  metadata_json: Record<string, unknown> | null;
  created_at: Date | string;
};

type SyntheticDataSeedRunRow = {
  id: string;
  seed_key: string;
  seed_version: string;
  status: SyntheticDataSeedRunStatus;
  created_count: number;
  updated_count: number;
  failed_count: number;
  summary_json: Record<string, unknown> | null;
  started_at: Date | string;
  completed_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

type RecruiterProtocolEventRow = {
  id: string;
  message_type: RecruiterA2AMessageType;
  sender_agent_id: string;
  receiver_agent_id: string;
  recruiter_career_identity_id: string;
  seeker_career_identity_id: string;
  access_grant_id: string | null;
  request_id: string | null;
  run_id: string | null;
  lifecycle_state: string;
  success: boolean;
  failure_reason: string | null;
  metadata_json: Record<string, unknown> | null;
  created_at: Date | string;
};

export type RecruiterProtocolEventRecord = {
  id: string;
  messageType: RecruiterA2AMessageType;
  senderAgentId: string;
  receiverAgentId: string;
  recruiterCareerIdentityId: string;
  seekerCareerIdentityId: string;
  accessGrantId: string | null;
  requestId: string | null;
  runId: string | null;
  lifecycleState: string;
  success: boolean;
  failureReason: string | null;
  metadataJson: Record<string, unknown>;
  createdAt: string;
};

function toIsoString(value: Date | string | null) {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toStringArray(value: unknown) {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string");
  }

  if (typeof value === "string") {
    try {
      return toStringArray(JSON.parse(value));
    } catch {
      return [];
    }
  }

  return [];
}

function toNumber(value: number | string | null) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function mapEmployerPartnerRow(row: EmployerPartnerRow): EmployerPartner {
  return {
    id: row.id,
    slug: row.slug,
    displayName: row.display_name,
    legalNameOptional: row.legal_name,
    websiteUrlOptional: row.website_url,
    logoUrlOptional: row.logo_url,
    status: row.status,
    createdAt: toIsoString(row.created_at)!,
    updatedAt: toIsoString(row.updated_at)!,
  };
}

function mapRecruiterCareerIdentityRow(row: RecruiterCareerIdentityRow): RecruiterCareerIdentity {
  const avatarMetadata = row.avatar_metadata_json ?? {};
  const avatarUrl = typeof avatarMetadata.url === "string" ? avatarMetadata.url : null;

  return {
    id: row.id,
    agentId: row.agent_id,
    employerPartnerId: row.employer_partner_id,
    displayName: row.display_name,
    recruiterRoleTitle: row.recruiter_role_title,
    bio: row.bio,
    companyName: row.company_name,
    status: row.status,
    visibility: row.visibility,
    isSynthetic: row.synthetic,
    avatarUrlOptional: avatarUrl,
    ownershipScopeJson: row.ownership_scope_json ?? {},
    createdAt: toIsoString(row.created_at)!,
    updatedAt: toIsoString(row.updated_at)!,
  };
}

function mapRecruiterOwnedJobRow(row: RecruiterOwnedJobRow): RecruiterOwnedJob {
  return {
    id: row.id,
    recruiterCareerIdentityId: row.recruiter_career_identity_id,
    employerPartnerId: row.employer_partner_id,
    title: row.title,
    location: row.location,
    department: row.department,
    employmentType: row.employment_type,
    seniority: row.seniority,
    compensationMin: toNumber(row.compensation_min),
    compensationMax: toNumber(row.compensation_max),
    compensationCurrency: row.compensation_currency,
    description: row.description,
    responsibilities: toStringArray(row.responsibilities_json),
    qualifications: toStringArray(row.qualifications_json),
    preferredQualifications: toStringArray(row.preferred_qualifications_json),
    status: row.status,
    visibility: row.visibility,
    searchableText: row.searchable_text,
    retrievalMetadataJson: row.retrieval_metadata_json ?? {},
    isSynthetic: row.synthetic,
    createdAt: toIsoString(row.created_at)!,
    updatedAt: toIsoString(row.updated_at)!,
  };
}

function mapRecruiterAccessGrantRow(row: RecruiterAccessGrantRow): RecruiterAccessGrant {
  return {
    id: row.id,
    recruiterCareerIdentityId: row.recruiter_career_identity_id,
    employerPartnerId: row.employer_partner_id,
    jobSeekerCareerIdentityId: row.job_seeker_career_identity_id,
    requestedAt: toIsoString(row.requested_at)!,
    approvedAt: toIsoString(row.approved_at),
    deniedAt: toIsoString(row.denied_at),
    revokedAt: toIsoString(row.revoked_at),
    status: row.status,
    grantedScopes: toStringArray(row.granted_scopes) as RecruiterJobPermissionScope[],
    expiresAt: toIsoString(row.expires_at),
    createdByActorType: row.created_by_actor_type,
    createdByActorId: row.created_by_actor_id,
    approvalSource: row.approval_source,
    metadataJson: row.metadata_json ?? {},
    createdAt: toIsoString(row.created_at)!,
    updatedAt: toIsoString(row.updated_at)!,
  };
}

function mapRecruiterConversationRow(row: RecruiterConversationRow): RecruiterConversation {
  return {
    id: row.id,
    recruiterCareerIdentityId: row.recruiter_career_identity_id,
    jobSeekerCareerIdentityId: row.job_seeker_career_identity_id,
    status: row.status,
    lastMessageAt: toIsoString(row.last_message_at),
    createdAt: toIsoString(row.created_at)!,
    updatedAt: toIsoString(row.updated_at)!,
  };
}

function mapRecruiterConversationMessageRow(
  row: RecruiterConversationMessageRow,
): RecruiterConversationMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.sender_role,
    content: row.content,
    citations: (Array.isArray(row.citations_json)
      ? row.citations_json
      : []) as RecruiterJobCitation[],
    retrievalMode: row.retrieval_mode,
    metadataJson: row.metadata_json ?? {},
    createdAt: toIsoString(row.created_at)!,
  };
}

function mapSyntheticDataSeedRunRow(row: SyntheticDataSeedRunRow): SyntheticDataSeedRun {
  return {
    id: row.id,
    seedKey: row.seed_key,
    seedVersion: row.seed_version,
    status: row.status,
    createdCount: row.created_count,
    updatedCount: row.updated_count,
    failedCount: row.failed_count,
    summaryJson: row.summary_json ?? {},
    startedAt: toIsoString(row.started_at)!,
    completedAt: toIsoString(row.completed_at),
    createdAt: toIsoString(row.created_at)!,
    updatedAt: toIsoString(row.updated_at)!,
  };
}

function mapRecruiterProtocolEventRow(
  row: RecruiterProtocolEventRow,
): RecruiterProtocolEventRecord {
  return {
    id: row.id,
    messageType: row.message_type,
    senderAgentId: row.sender_agent_id,
    receiverAgentId: row.receiver_agent_id,
    recruiterCareerIdentityId: row.recruiter_career_identity_id,
    seekerCareerIdentityId: row.seeker_career_identity_id,
    accessGrantId: row.access_grant_id,
    requestId: row.request_id,
    runId: row.run_id,
    lifecycleState: row.lifecycle_state,
    success: row.success,
    failureReason: row.failure_reason,
    metadataJson: row.metadata_json ?? {},
    createdAt: toIsoString(row.created_at)!,
  };
}

export async function listEmployerPartnerRecords(args?: {
  status?: EmployerPartnerStatus;
}) {
  const result = await getDatabasePool().query<EmployerPartnerRow>(
    `
      SELECT
        id,
        slug,
        display_name,
        legal_name,
        website_url,
        logo_url,
        status,
        created_at,
        updated_at
      FROM employer_partners
      WHERE status = COALESCE($1, status)
      ORDER BY display_name ASC, id ASC
    `,
    [args?.status ?? null],
  );

  return result.rows.map(mapEmployerPartnerRow);
}

export async function findEmployerPartnerRecordById(args: { id: string }) {
  const row = await queryOptional<EmployerPartnerRow>(
    getDatabasePool(),
    `
      SELECT
        id,
        slug,
        display_name,
        legal_name,
        website_url,
        logo_url,
        status,
        created_at,
        updated_at
      FROM employer_partners
      WHERE id = $1
    `,
    [args.id],
  );

  return row ? mapEmployerPartnerRow(row) : null;
}

export async function findEmployerPartnerRecordBySlug(args: { slug: string }) {
  const row = await queryOptional<EmployerPartnerRow>(
    getDatabasePool(),
    `
      SELECT
        id,
        slug,
        display_name,
        legal_name,
        website_url,
        logo_url,
        status,
        created_at,
        updated_at
      FROM employer_partners
      WHERE slug = $1
    `,
    [args.slug],
  );

  return row ? mapEmployerPartnerRow(row) : null;
}

export async function upsertEmployerPartnerRecord(args: {
  id: string;
  slug: string;
  displayName: string;
  legalNameOptional?: string | null;
  websiteUrlOptional?: string | null;
  logoUrlOptional?: string | null;
  status?: EmployerPartnerStatus;
  queryable?: DatabaseQueryable;
}) {
  const queryable = args.queryable ?? getDatabasePool();
  const existing = await queryOptional<{ id: string }>(
    queryable,
    "SELECT id FROM employer_partners WHERE id = $1",
    [args.id],
  );

  const row = await queryRequired<EmployerPartnerRow>(
    queryable,
    `
      INSERT INTO employer_partners (
        id,
        slug,
        display_name,
        legal_name,
        website_url,
        logo_url,
        status,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      ON CONFLICT (id)
      DO UPDATE SET
        slug = EXCLUDED.slug,
        display_name = EXCLUDED.display_name,
        legal_name = EXCLUDED.legal_name,
        website_url = EXCLUDED.website_url,
        logo_url = EXCLUDED.logo_url,
        status = EXCLUDED.status,
        updated_at = NOW()
      RETURNING
        id,
        slug,
        display_name,
        legal_name,
        website_url,
        logo_url,
        status,
        created_at,
        updated_at
    `,
    [
      args.id,
      args.slug,
      args.displayName,
      args.legalNameOptional ?? null,
      args.websiteUrlOptional ?? null,
      args.logoUrlOptional ?? null,
      args.status ?? "active",
    ],
  );

  return {
    created: !existing,
    record: mapEmployerPartnerRow(row),
    updated: Boolean(existing),
  };
}

export async function listRecruiterCareerIdentityRecords(args?: {
  employerPartnerId?: string | null;
  status?: RecruiterCareerIdentityStatus;
  visibility?: RecruiterCareerIdentityVisibility;
}) {
  const result = await getDatabasePool().query<RecruiterCareerIdentityRow>(
    `
      SELECT
        id,
        agent_id,
        employer_partner_id,
        display_name,
        recruiter_role_title,
        bio,
        company_name,
        status,
        visibility,
        synthetic,
        avatar_metadata_json,
        ownership_scope_json,
        created_at,
        updated_at
      FROM recruiter_career_identities
      WHERE employer_partner_id = COALESCE($1, employer_partner_id)
        AND status = COALESCE($2, status)
        AND visibility = COALESCE($3, visibility)
      ORDER BY display_name ASC, id ASC
    `,
    [
      args?.employerPartnerId ?? null,
      args?.status ?? null,
      args?.visibility ?? null,
    ],
  );

  return result.rows.map(mapRecruiterCareerIdentityRow);
}

export async function findRecruiterCareerIdentityRecordById(args: { id: string }) {
  const row = await queryOptional<RecruiterCareerIdentityRow>(
    getDatabasePool(),
    `
      SELECT
        id,
        agent_id,
        employer_partner_id,
        display_name,
        recruiter_role_title,
        bio,
        company_name,
        status,
        visibility,
        synthetic,
        avatar_metadata_json,
        ownership_scope_json,
        created_at,
        updated_at
      FROM recruiter_career_identities
      WHERE id = $1
    `,
    [args.id],
  );

  return row ? mapRecruiterCareerIdentityRow(row) : null;
}

export async function findRecruiterCareerIdentityRecordByAgentId(args: {
  agentId: string;
}) {
  const row = await queryOptional<RecruiterCareerIdentityRow>(
    getDatabasePool(),
    `
      SELECT
        id,
        agent_id,
        employer_partner_id,
        display_name,
        recruiter_role_title,
        bio,
        company_name,
        status,
        visibility,
        synthetic,
        avatar_metadata_json,
        ownership_scope_json,
        created_at,
        updated_at
      FROM recruiter_career_identities
      WHERE agent_id = $1
    `,
    [args.agentId],
  );

  return row ? mapRecruiterCareerIdentityRow(row) : null;
}

export async function upsertRecruiterCareerIdentityRecord(args: {
  id: string;
  agentId: string;
  employerPartnerId: string;
  displayName: string;
  recruiterRoleTitle: string;
  bio: string;
  companyName: string;
  status?: RecruiterCareerIdentityStatus;
  visibility?: RecruiterCareerIdentityVisibility;
  isSynthetic?: boolean;
  avatarUrlOptional?: string | null;
  ownershipScopeJson?: Record<string, unknown>;
  queryable?: DatabaseQueryable;
}) {
  const queryable = args.queryable ?? getDatabasePool();
  const existing = await queryOptional<{ id: string }>(
    queryable,
    "SELECT id FROM recruiter_career_identities WHERE id = $1",
    [args.id],
  );

  const avatarMetadataJson = args.avatarUrlOptional
    ? {
        url: args.avatarUrlOptional,
      }
    : {};

  const row = await queryRequired<RecruiterCareerIdentityRow>(
    queryable,
    `
      INSERT INTO recruiter_career_identities (
        id,
        agent_id,
        employer_partner_id,
        display_name,
        recruiter_role_title,
        bio,
        company_name,
        status,
        visibility,
        synthetic,
        avatar_metadata_json,
        ownership_scope_json,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb, NOW())
      ON CONFLICT (id)
      DO UPDATE SET
        agent_id = EXCLUDED.agent_id,
        employer_partner_id = EXCLUDED.employer_partner_id,
        display_name = EXCLUDED.display_name,
        recruiter_role_title = EXCLUDED.recruiter_role_title,
        bio = EXCLUDED.bio,
        company_name = EXCLUDED.company_name,
        status = EXCLUDED.status,
        visibility = EXCLUDED.visibility,
        synthetic = EXCLUDED.synthetic,
        avatar_metadata_json = EXCLUDED.avatar_metadata_json,
        ownership_scope_json = EXCLUDED.ownership_scope_json,
        updated_at = NOW()
      RETURNING
        id,
        agent_id,
        employer_partner_id,
        display_name,
        recruiter_role_title,
        bio,
        company_name,
        status,
        visibility,
        synthetic,
        avatar_metadata_json,
        ownership_scope_json,
        created_at,
        updated_at
    `,
    [
      args.id,
      args.agentId,
      args.employerPartnerId,
      args.displayName,
      args.recruiterRoleTitle,
      args.bio,
      args.companyName,
      args.status ?? "active",
      args.visibility ?? "public_directory",
      args.isSynthetic ?? true,
      JSON.stringify(avatarMetadataJson),
      JSON.stringify(args.ownershipScopeJson ?? {}),
    ],
  );

  return {
    created: !existing,
    record: mapRecruiterCareerIdentityRow(row),
    updated: Boolean(existing),
  };
}

export async function listRecruiterOwnedJobRecords(args: {
  recruiterCareerIdentityId: string;
  statusesOptional?: RecruiterOwnedJobStatus[];
  visibilityOptional?: RecruiterOwnedJobVisibility;
  limitOptional?: number;
}) {
  const result = await getDatabasePool().query<RecruiterOwnedJobRow>(
    `
      SELECT
        id,
        recruiter_career_identity_id,
        employer_partner_id,
        title,
        location,
        department,
        employment_type,
        seniority,
        compensation_min,
        compensation_max,
        compensation_currency,
        description,
        responsibilities_json,
        qualifications_json,
        preferred_qualifications_json,
        status,
        visibility,
        searchable_text,
        retrieval_metadata_json,
        synthetic,
        created_at,
        updated_at
      FROM recruiter_owned_jobs
      WHERE recruiter_career_identity_id = $1
        AND (
          $2::text[] IS NULL
          OR status = ANY($2::text[])
        )
        AND visibility = COALESCE($3, visibility)
      ORDER BY updated_at DESC, id ASC
      LIMIT COALESCE($4, 500)
    `,
    [
      args.recruiterCareerIdentityId,
      args.statusesOptional && args.statusesOptional.length > 0
        ? args.statusesOptional
        : null,
      args.visibilityOptional ?? null,
      args.limitOptional ?? null,
    ],
  );

  return result.rows.map(mapRecruiterOwnedJobRow);
}

export async function findRecruiterOwnedJobRecordById(args: {
  recruiterCareerIdentityId: string;
  jobId: string;
}) {
  const row = await queryOptional<RecruiterOwnedJobRow>(
    getDatabasePool(),
    `
      SELECT
        id,
        recruiter_career_identity_id,
        employer_partner_id,
        title,
        location,
        department,
        employment_type,
        seniority,
        compensation_min,
        compensation_max,
        compensation_currency,
        description,
        responsibilities_json,
        qualifications_json,
        preferred_qualifications_json,
        status,
        visibility,
        searchable_text,
        retrieval_metadata_json,
        synthetic,
        created_at,
        updated_at
      FROM recruiter_owned_jobs
      WHERE recruiter_career_identity_id = $1
        AND id = $2
    `,
    [args.recruiterCareerIdentityId, args.jobId],
  );

  return row ? mapRecruiterOwnedJobRow(row) : null;
}

export async function upsertRecruiterOwnedJobRecord(args: {
  id: string;
  recruiterCareerIdentityId: string;
  employerPartnerId: string;
  title: string;
  location?: string | null;
  department?: string | null;
  employmentType?: string | null;
  seniority?: string | null;
  compensationMin?: number | null;
  compensationMax?: number | null;
  compensationCurrency?: string | null;
  description: string;
  responsibilities: string[];
  qualifications: string[];
  preferredQualifications: string[];
  status?: RecruiterOwnedJobStatus;
  visibility?: RecruiterOwnedJobVisibility;
  searchableText: string;
  retrievalMetadataJson?: Record<string, unknown>;
  embeddingMetadataJson?: Record<string, unknown>;
  isSynthetic?: boolean;
  queryable?: DatabaseQueryable;
}) {
  const queryable = args.queryable ?? getDatabasePool();
  const existing = await queryOptional<{ id: string }>(
    queryable,
    "SELECT id FROM recruiter_owned_jobs WHERE id = $1",
    [args.id],
  );

  const row = await queryRequired<RecruiterOwnedJobRow>(
    queryable,
    `
      INSERT INTO recruiter_owned_jobs (
        id,
        recruiter_career_identity_id,
        employer_partner_id,
        title,
        location,
        department,
        employment_type,
        seniority,
        compensation_min,
        compensation_max,
        compensation_currency,
        description,
        responsibilities_json,
        qualifications_json,
        preferred_qualifications_json,
        status,
        visibility,
        searchable_text,
        retrieval_metadata_json,
        embedding_metadata_json,
        synthetic,
        updated_at
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
        $12,
        $13::jsonb,
        $14::jsonb,
        $15::jsonb,
        $16,
        $17,
        $18,
        $19::jsonb,
        $20::jsonb,
        $21,
        NOW()
      )
      ON CONFLICT (id)
      DO UPDATE SET
        recruiter_career_identity_id = EXCLUDED.recruiter_career_identity_id,
        employer_partner_id = EXCLUDED.employer_partner_id,
        title = EXCLUDED.title,
        location = EXCLUDED.location,
        department = EXCLUDED.department,
        employment_type = EXCLUDED.employment_type,
        seniority = EXCLUDED.seniority,
        compensation_min = EXCLUDED.compensation_min,
        compensation_max = EXCLUDED.compensation_max,
        compensation_currency = EXCLUDED.compensation_currency,
        description = EXCLUDED.description,
        responsibilities_json = EXCLUDED.responsibilities_json,
        qualifications_json = EXCLUDED.qualifications_json,
        preferred_qualifications_json = EXCLUDED.preferred_qualifications_json,
        status = EXCLUDED.status,
        visibility = EXCLUDED.visibility,
        searchable_text = EXCLUDED.searchable_text,
        retrieval_metadata_json = EXCLUDED.retrieval_metadata_json,
        embedding_metadata_json = EXCLUDED.embedding_metadata_json,
        synthetic = EXCLUDED.synthetic,
        updated_at = NOW()
      RETURNING
        id,
        recruiter_career_identity_id,
        employer_partner_id,
        title,
        location,
        department,
        employment_type,
        seniority,
        compensation_min,
        compensation_max,
        compensation_currency,
        description,
        responsibilities_json,
        qualifications_json,
        preferred_qualifications_json,
        status,
        visibility,
        searchable_text,
        retrieval_metadata_json,
        synthetic,
        created_at,
        updated_at
    `,
    [
      args.id,
      args.recruiterCareerIdentityId,
      args.employerPartnerId,
      args.title,
      args.location ?? null,
      args.department ?? null,
      args.employmentType ?? null,
      args.seniority ?? null,
      args.compensationMin ?? null,
      args.compensationMax ?? null,
      args.compensationCurrency ?? null,
      args.description,
      JSON.stringify(args.responsibilities),
      JSON.stringify(args.qualifications),
      JSON.stringify(args.preferredQualifications),
      args.status ?? "open",
      args.visibility ?? "discoverable",
      args.searchableText,
      JSON.stringify(args.retrievalMetadataJson ?? {}),
      JSON.stringify(args.embeddingMetadataJson ?? {}),
      args.isSynthetic ?? true,
    ],
  );

  return {
    created: !existing,
    record: mapRecruiterOwnedJobRow(row),
    updated: Boolean(existing),
  };
}

export async function createRecruiterAccessGrantRecord(args: {
  id?: string;
  recruiterCareerIdentityId: string;
  employerPartnerId: string;
  jobSeekerCareerIdentityId: string;
  status?: RecruiterAccessGrantStatus;
  grantedScopes?: RecruiterJobPermissionScope[];
  requestedAt?: string;
  approvedAt?: string | null;
  deniedAt?: string | null;
  revokedAt?: string | null;
  expiresAt?: string | null;
  createdByActorType: ActorType;
  createdByActorId: string;
  approvalSource?: string;
  metadataJson?: Record<string, unknown>;
  queryable?: DatabaseQueryable;
}) {
  const queryable = args.queryable ?? getDatabasePool();
  const id = args.id ?? `rgr_${crypto.randomUUID()}`;
  const row = await queryRequired<RecruiterAccessGrantRow>(
    queryable,
    `
      INSERT INTO recruiter_access_grants (
        id,
        recruiter_career_identity_id,
        employer_partner_id,
        job_seeker_career_identity_id,
        requested_at,
        approved_at,
        denied_at,
        revoked_at,
        status,
        granted_scopes,
        expires_at,
        created_by_actor_type,
        created_by_actor_id,
        approval_source,
        metadata_json,
        updated_at
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        COALESCE($5::timestamptz, NOW()),
        $6::timestamptz,
        $7::timestamptz,
        $8::timestamptz,
        $9,
        $10::text[],
        $11::timestamptz,
        $12,
        $13,
        $14,
        $15::jsonb,
        NOW()
      )
      RETURNING
        id,
        recruiter_career_identity_id,
        employer_partner_id,
        job_seeker_career_identity_id,
        requested_at,
        approved_at,
        denied_at,
        revoked_at,
        status,
        granted_scopes,
        expires_at,
        created_by_actor_type,
        created_by_actor_id,
        approval_source,
        metadata_json,
        created_at,
        updated_at
    `,
    [
      id,
      args.recruiterCareerIdentityId,
      args.employerPartnerId,
      args.jobSeekerCareerIdentityId,
      args.requestedAt ?? null,
      args.approvedAt ?? null,
      args.deniedAt ?? null,
      args.revokedAt ?? null,
      args.status ?? "pending",
      args.grantedScopes ?? [],
      args.expiresAt ?? null,
      args.createdByActorType,
      args.createdByActorId,
      args.approvalSource ?? "policy_auto_approve",
      JSON.stringify(args.metadataJson ?? {}),
    ],
  );

  return mapRecruiterAccessGrantRow(row);
}

export async function updateRecruiterAccessGrantRecord(args: {
  id: string;
  status: RecruiterAccessGrantStatus;
  grantedScopes?: RecruiterJobPermissionScope[];
  approvedAt?: string | null;
  deniedAt?: string | null;
  revokedAt?: string | null;
  expiresAt?: string | null;
  approvalSourceOptional?: string | null;
  metadataJsonOptional?: Record<string, unknown>;
  queryable?: DatabaseQueryable;
}) {
  const queryable = args.queryable ?? getDatabasePool();

  const row = await queryRequired<RecruiterAccessGrantRow>(
    queryable,
    `
      UPDATE recruiter_access_grants
      SET
        status = $2,
        granted_scopes = COALESCE($3::text[], granted_scopes),
        approved_at = COALESCE($4::timestamptz, approved_at),
        denied_at = COALESCE($5::timestamptz, denied_at),
        revoked_at = COALESCE($6::timestamptz, revoked_at),
        expires_at = COALESCE($7::timestamptz, expires_at),
        approval_source = COALESCE($8, approval_source),
        metadata_json = COALESCE($9::jsonb, metadata_json),
        updated_at = NOW()
      WHERE id = $1
      RETURNING
        id,
        recruiter_career_identity_id,
        employer_partner_id,
        job_seeker_career_identity_id,
        requested_at,
        approved_at,
        denied_at,
        revoked_at,
        status,
        granted_scopes,
        expires_at,
        created_by_actor_type,
        created_by_actor_id,
        approval_source,
        metadata_json,
        created_at,
        updated_at
    `,
    [
      args.id,
      args.status,
      args.grantedScopes ?? null,
      args.approvedAt ?? null,
      args.deniedAt ?? null,
      args.revokedAt ?? null,
      args.expiresAt ?? null,
      args.approvalSourceOptional ?? null,
      args.metadataJsonOptional
        ? JSON.stringify(args.metadataJsonOptional)
        : null,
    ],
  );

  return mapRecruiterAccessGrantRow(row);
}

export async function findLatestRecruiterAccessGrantRecord(args: {
  recruiterCareerIdentityId: string;
  jobSeekerCareerIdentityId: string;
}) {
  const row = await queryOptional<RecruiterAccessGrantRow>(
    getDatabasePool(),
    `
      SELECT
        id,
        recruiter_career_identity_id,
        employer_partner_id,
        job_seeker_career_identity_id,
        requested_at,
        approved_at,
        denied_at,
        revoked_at,
        status,
        granted_scopes,
        expires_at,
        created_by_actor_type,
        created_by_actor_id,
        approval_source,
        metadata_json,
        created_at,
        updated_at
      FROM recruiter_access_grants
      WHERE recruiter_career_identity_id = $1
        AND job_seeker_career_identity_id = $2
      ORDER BY requested_at DESC, created_at DESC
      LIMIT 1
    `,
    [args.recruiterCareerIdentityId, args.jobSeekerCareerIdentityId],
  );

  return row ? mapRecruiterAccessGrantRow(row) : null;
}

export async function findApprovedRecruiterAccessGrantRecord(args: {
  recruiterCareerIdentityId: string;
  jobSeekerCareerIdentityId: string;
}) {
  const row = await queryOptional<RecruiterAccessGrantRow>(
    getDatabasePool(),
    `
      SELECT
        id,
        recruiter_career_identity_id,
        employer_partner_id,
        job_seeker_career_identity_id,
        requested_at,
        approved_at,
        denied_at,
        revoked_at,
        status,
        granted_scopes,
        expires_at,
        created_by_actor_type,
        created_by_actor_id,
        approval_source,
        metadata_json,
        created_at,
        updated_at
      FROM recruiter_access_grants
      WHERE recruiter_career_identity_id = $1
        AND job_seeker_career_identity_id = $2
        AND status = 'approved'
        AND (expires_at IS NULL OR expires_at > NOW())
      ORDER BY approved_at DESC NULLS LAST, created_at DESC
      LIMIT 1
    `,
    [args.recruiterCareerIdentityId, args.jobSeekerCareerIdentityId],
  );

  return row ? mapRecruiterAccessGrantRow(row) : null;
}

export async function listRecruiterAccessGrantRecords(args?: {
  recruiterCareerIdentityId?: string | null;
  jobSeekerCareerIdentityId?: string | null;
  statusesOptional?: RecruiterAccessGrantStatus[];
  limitOptional?: number;
}) {
  const result = await getDatabasePool().query<RecruiterAccessGrantRow>(
    `
      SELECT
        id,
        recruiter_career_identity_id,
        employer_partner_id,
        job_seeker_career_identity_id,
        requested_at,
        approved_at,
        denied_at,
        revoked_at,
        status,
        granted_scopes,
        expires_at,
        created_by_actor_type,
        created_by_actor_id,
        approval_source,
        metadata_json,
        created_at,
        updated_at
      FROM recruiter_access_grants
      WHERE recruiter_career_identity_id = COALESCE($1, recruiter_career_identity_id)
        AND job_seeker_career_identity_id = COALESCE($2, job_seeker_career_identity_id)
        AND (
          $3::text[] IS NULL
          OR status = ANY($3::text[])
        )
      ORDER BY requested_at DESC, created_at DESC
      LIMIT COALESCE($4, 200)
    `,
    [
      args?.recruiterCareerIdentityId ?? null,
      args?.jobSeekerCareerIdentityId ?? null,
      args?.statusesOptional && args.statusesOptional.length > 0
        ? args.statusesOptional
        : null,
      args?.limitOptional ?? null,
    ],
  );

  return result.rows.map(mapRecruiterAccessGrantRow);
}

export async function upsertRecruiterConversationRecord(args: {
  recruiterCareerIdentityId: string;
  jobSeekerCareerIdentityId: string;
  status?: RecruiterConversationStatus;
  queryable?: DatabaseQueryable;
}) {
  const queryable = args.queryable ?? getDatabasePool();
  const existing = await queryOptional<{ id: string }>(
    queryable,
    `
      SELECT id
      FROM recruiter_conversations
      WHERE recruiter_career_identity_id = $1
        AND job_seeker_career_identity_id = $2
    `,
    [args.recruiterCareerIdentityId, args.jobSeekerCareerIdentityId],
  );

  const row = await queryRequired<RecruiterConversationRow>(
    queryable,
    `
      INSERT INTO recruiter_conversations (
        id,
        recruiter_career_identity_id,
        job_seeker_career_identity_id,
        status,
        updated_at
      )
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (recruiter_career_identity_id, job_seeker_career_identity_id)
      DO UPDATE SET
        status = EXCLUDED.status,
        updated_at = NOW()
      RETURNING
        id,
        recruiter_career_identity_id,
        job_seeker_career_identity_id,
        status,
        last_message_at,
        created_at,
        updated_at
    `,
    [
      existing?.id ?? `rcv_${crypto.randomUUID()}`,
      args.recruiterCareerIdentityId,
      args.jobSeekerCareerIdentityId,
      args.status ?? "active",
    ],
  );

  return mapRecruiterConversationRow(row);
}

export async function findRecruiterConversationRecordById(args: { id: string }) {
  const row = await queryOptional<RecruiterConversationRow>(
    getDatabasePool(),
    `
      SELECT
        id,
        recruiter_career_identity_id,
        job_seeker_career_identity_id,
        status,
        last_message_at,
        created_at,
        updated_at
      FROM recruiter_conversations
      WHERE id = $1
    `,
    [args.id],
  );

  return row ? mapRecruiterConversationRow(row) : null;
}

export async function createRecruiterConversationMessageRecord(args: {
  id?: string;
  conversationId: string;
  recruiterCareerIdentityId: string;
  jobSeekerCareerIdentityId: string;
  role: RecruiterConversationMessageRole;
  content: string;
  citations?: RecruiterJobCitation[];
  retrievalMode?: RecruiterRetrievalMode | null;
  metadataJson?: Record<string, unknown>;
  queryable?: DatabaseQueryable;
}) {
  const queryable = args.queryable ?? getDatabasePool();
  const id = args.id ?? `rcm_${crypto.randomUUID()}`;

  const row = await queryRequired<RecruiterConversationMessageRow>(
    queryable,
    `
      INSERT INTO recruiter_conversation_messages (
        id,
        conversation_id,
        recruiter_career_identity_id,
        job_seeker_career_identity_id,
        sender_role,
        content,
        citations_json,
        retrieval_mode,
        metadata_json,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9::jsonb, NOW())
      RETURNING
        id,
        conversation_id,
        sender_role,
        content,
        citations_json,
        retrieval_mode,
        metadata_json,
        created_at
    `,
    [
      id,
      args.conversationId,
      args.recruiterCareerIdentityId,
      args.jobSeekerCareerIdentityId,
      args.role,
      args.content,
      JSON.stringify(args.citations ?? []),
      args.retrievalMode ?? null,
      JSON.stringify(args.metadataJson ?? {}),
    ],
  );

  await queryable.query(
    `
      UPDATE recruiter_conversations
      SET
        last_message_at = NOW(),
        updated_at = NOW()
      WHERE id = $1
    `,
    [args.conversationId],
  );

  return mapRecruiterConversationMessageRow(row);
}

export async function listRecruiterConversationMessageRecords(args: {
  conversationId: string;
  limitOptional?: number;
}) {
  const result = await getDatabasePool().query<RecruiterConversationMessageRow>(
    `
      SELECT
        id,
        conversation_id,
        sender_role,
        content,
        citations_json,
        retrieval_mode,
        metadata_json,
        created_at
      FROM recruiter_conversation_messages
      WHERE conversation_id = $1
      ORDER BY created_at ASC, id ASC
      LIMIT COALESCE($2, 200)
    `,
    [args.conversationId, args.limitOptional ?? null],
  );

  return result.rows.map(mapRecruiterConversationMessageRow);
}

export async function createSyntheticDataSeedRunRecord(args: {
  id?: string;
  seedKey: string;
  seedVersion: string;
  status?: SyntheticDataSeedRunStatus;
  startedAt?: string;
  summaryJson?: Record<string, unknown>;
}) {
  const row = await queryRequired<SyntheticDataSeedRunRow>(
    getDatabasePool(),
    `
      INSERT INTO synthetic_data_seed_runs (
        id,
        seed_key,
        seed_version,
        status,
        created_count,
        updated_count,
        failed_count,
        summary_json,
        started_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, 0, 0, 0, $5::jsonb, COALESCE($6::timestamptz, NOW()), NOW())
      RETURNING
        id,
        seed_key,
        seed_version,
        status,
        created_count,
        updated_count,
        failed_count,
        summary_json,
        started_at,
        completed_at,
        created_at,
        updated_at
    `,
    [
      args.id ?? `seed_${crypto.randomUUID()}`,
      args.seedKey,
      args.seedVersion,
      args.status ?? "running",
      JSON.stringify(args.summaryJson ?? {}),
      args.startedAt ?? null,
    ],
  );

  return mapSyntheticDataSeedRunRow(row);
}

export async function finalizeSyntheticDataSeedRunRecord(args: {
  id: string;
  status: SyntheticDataSeedRunStatus;
  createdCount: number;
  updatedCount: number;
  failedCount?: number;
  summaryJson?: Record<string, unknown>;
  completedAt?: string;
}) {
  const row = await queryRequired<SyntheticDataSeedRunRow>(
    getDatabasePool(),
    `
      UPDATE synthetic_data_seed_runs
      SET
        status = $2,
        created_count = $3,
        updated_count = $4,
        failed_count = COALESCE($5, failed_count),
        summary_json = COALESCE($6::jsonb, summary_json),
        completed_at = COALESCE($7::timestamptz, NOW()),
        updated_at = NOW()
      WHERE id = $1
      RETURNING
        id,
        seed_key,
        seed_version,
        status,
        created_count,
        updated_count,
        failed_count,
        summary_json,
        started_at,
        completed_at,
        created_at,
        updated_at
    `,
    [
      args.id,
      args.status,
      args.createdCount,
      args.updatedCount,
      args.failedCount ?? null,
      args.summaryJson ? JSON.stringify(args.summaryJson) : null,
      args.completedAt ?? null,
    ],
  );

  return mapSyntheticDataSeedRunRow(row);
}

export async function findLatestSyntheticDataSeedRunRecord(args: {
  seedKey: string;
}) {
  const row = await queryOptional<SyntheticDataSeedRunRow>(
    getDatabasePool(),
    `
      SELECT
        id,
        seed_key,
        seed_version,
        status,
        created_count,
        updated_count,
        failed_count,
        summary_json,
        started_at,
        completed_at,
        created_at,
        updated_at
      FROM synthetic_data_seed_runs
      WHERE seed_key = $1
      ORDER BY started_at DESC, created_at DESC
      LIMIT 1
    `,
    [args.seedKey],
  );

  return row ? mapSyntheticDataSeedRunRow(row) : null;
}

export async function createRecruiterProtocolEventRecord(args: {
  id?: string;
  messageType: RecruiterA2AMessageType;
  senderAgentId: string;
  receiverAgentId: string;
  recruiterCareerIdentityId: string;
  seekerCareerIdentityId: string;
  accessGrantIdOptional?: string | null;
  requestIdOptional?: string | null;
  runIdOptional?: string | null;
  lifecycleState: string;
  success?: boolean;
  failureReasonOptional?: string | null;
  metadataJson?: Record<string, unknown>;
  queryable?: DatabaseQueryable;
}) {
  const queryable = args.queryable ?? getDatabasePool();
  const row = await queryRequired<RecruiterProtocolEventRow>(
    queryable,
    `
      INSERT INTO recruiter_protocol_events (
        id,
        message_type,
        sender_agent_id,
        receiver_agent_id,
        recruiter_career_identity_id,
        seeker_career_identity_id,
        access_grant_id,
        request_id,
        run_id,
        lifecycle_state,
        success,
        failure_reason,
        metadata_json,
        created_at
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
        $12,
        $13::jsonb,
        NOW()
      )
      RETURNING
        id,
        message_type,
        sender_agent_id,
        receiver_agent_id,
        recruiter_career_identity_id,
        seeker_career_identity_id,
        access_grant_id,
        request_id,
        run_id,
        lifecycle_state,
        success,
        failure_reason,
        metadata_json,
        created_at
    `,
    [
      args.id ?? `rpe_${crypto.randomUUID()}`,
      args.messageType,
      args.senderAgentId,
      args.receiverAgentId,
      args.recruiterCareerIdentityId,
      args.seekerCareerIdentityId,
      args.accessGrantIdOptional ?? null,
      args.requestIdOptional ?? null,
      args.runIdOptional ?? null,
      args.lifecycleState,
      args.success ?? true,
      args.failureReasonOptional ?? null,
      JSON.stringify(args.metadataJson ?? {}),
    ],
  );

  return mapRecruiterProtocolEventRow(row);
}

export async function listRecruiterProtocolEventRecords(args: {
  recruiterCareerIdentityId: string;
  seekerCareerIdentityId?: string | null;
  limitOptional?: number;
}) {
  const result = await getDatabasePool().query<RecruiterProtocolEventRow>(
    `
      SELECT
        id,
        message_type,
        sender_agent_id,
        receiver_agent_id,
        recruiter_career_identity_id,
        seeker_career_identity_id,
        access_grant_id,
        request_id,
        run_id,
        lifecycle_state,
        success,
        failure_reason,
        metadata_json,
        created_at
      FROM recruiter_protocol_events
      WHERE recruiter_career_identity_id = $1
        AND seeker_career_identity_id = COALESCE($2, seeker_career_identity_id)
      ORDER BY created_at DESC, id DESC
      LIMIT COALESCE($3, 100)
    `,
    [
      args.recruiterCareerIdentityId,
      args.seekerCareerIdentityId ?? null,
      args.limitOptional ?? null,
    ],
  );

  return result.rows.map(mapRecruiterProtocolEventRow);
}
