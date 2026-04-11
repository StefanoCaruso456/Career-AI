import { ApiError, type TalentIdentityAggregate } from "@/packages/contracts/src";
import {
  type DatabaseQueryable,
  getDatabasePool,
  queryOptional,
  queryRequired,
  withDatabaseTransaction,
} from "./client";
import { refreshPersistentRecruiterCandidateProjection } from "./recruiter-candidate-projection-repository";

export type OnboardingStatus = "not_started" | "in_progress" | "completed";

type ContextRow = {
  user_id: string;
  user_email: string;
  user_full_name: string;
  user_first_name: string;
  user_last_name: string;
  user_image_url: string | null;
  user_auth_provider: string;
  user_provider_user_id: string;
  user_email_verified: boolean;
  user_created_at: Date | string;
  user_updated_at: Date | string;
  user_last_login_at: Date | string;
  career_identity_id: string;
  talent_agent_id: string;
  onboarding_status: OnboardingStatus;
  profile_completion_percent: number;
  current_step: number;
  role_type: string | null;
  display_name: string;
  country_code: string;
  phone_optional: string | null;
  career_identity_status: "ACTIVE" | "SUSPENDED";
  career_identity_profile_json: Record<string, unknown> | null;
  career_identity_created_at: Date | string;
  career_identity_updated_at: Date | string;
  privacy_settings_id: string;
  show_employment_records: boolean;
  show_education_records: boolean;
  show_certification_records: boolean;
  show_endorsements: boolean;
  show_status_labels: boolean;
  show_artifact_previews: boolean;
  allow_public_share_link: boolean;
  allow_qr_share: boolean;
  privacy_settings_created_at: Date | string;
  privacy_settings_updated_at: Date | string;
  soul_record_id: string;
  trust_summary_id: string | null;
  default_share_profile_id: string | null;
  soul_record_created_at: Date | string;
  soul_record_updated_at: Date | string;
  soul_record_version: number;
};

export type PersistentUserRecord = {
  id: string;
  email: string;
  fullName: string;
  firstName: string;
  lastName: string;
  imageUrl: string | null;
  authProvider: string;
  providerUserId: string;
  emailVerified: boolean;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string;
};

export type PersistentTalentIdentityContext = {
  user: PersistentUserRecord;
  onboarding: {
    status: OnboardingStatus;
    profileCompletionPercent: number;
    currentStep: number;
    roleType: string | null;
    profile: Record<string, unknown>;
  };
  aggregate: TalentIdentityAggregate;
};

type ProvisionGoogleUserArgs = {
  email: string;
  fullName: string;
  firstName: string;
  lastName: string;
  imageUrl?: string | null;
  providerUserId: string;
  emailVerified: boolean;
  correlationId: string;
};

type CreatePersistentIdentityArgs = {
  email: string;
  firstName: string;
  lastName: string;
  countryCode: string;
  phoneOptional?: string;
  actorType: "talent_user" | "system_service";
  correlationId: string;
};

type IdentityCreationState = {
  careerIdentityId: string;
  createdIdentity: boolean;
};

const selectContextBaseQuery = `
  SELECT
    u.id AS user_id,
    u.email AS user_email,
    u.full_name AS user_full_name,
    u.first_name AS user_first_name,
    u.last_name AS user_last_name,
    u.image_url AS user_image_url,
    u.auth_provider AS user_auth_provider,
    u.provider_user_id AS user_provider_user_id,
    u.email_verified AS user_email_verified,
    u.created_at AS user_created_at,
    u.updated_at AS user_updated_at,
    u.last_login_at AS user_last_login_at,
    ci.id AS career_identity_id,
    ci.talent_agent_id,
    ci.onboarding_status,
    ci.profile_completion_percent,
    ci.current_step,
    ci.role_type,
    ci.display_name,
    ci.country_code,
    ci.phone_optional,
    ci.status AS career_identity_status,
    ci.profile_json AS career_identity_profile_json,
    ci.created_at AS career_identity_created_at,
    ci.updated_at AS career_identity_updated_at,
    ps.id AS privacy_settings_id,
    ps.show_employment_records,
    ps.show_education_records,
    ps.show_certification_records,
    ps.show_endorsements,
    ps.show_status_labels,
    ps.show_artifact_previews,
    ps.allow_public_share_link,
    ps.allow_qr_share,
    ps.created_at AS privacy_settings_created_at,
    ps.updated_at AS privacy_settings_updated_at,
    sr.id AS soul_record_id,
    sr.trust_summary_id,
    sr.default_share_profile_id,
    sr.created_at AS soul_record_created_at,
    sr.updated_at AS soul_record_updated_at,
    sr.version AS soul_record_version
  FROM users u
  INNER JOIN career_identities ci ON ci.user_id = u.id
  INNER JOIN privacy_settings ps ON ps.career_identity_id = ci.id
  INNER JOIN soul_records sr ON sr.career_identity_id = ci.id
`;

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function formatIsoString(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function formatDisplayName(firstName: string, lastName: string, fullName: string) {
  const normalizedFullName = fullName.replace(/\s+/g, " ").trim();

  if (normalizedFullName) {
    return normalizedFullName;
  }

  return `${firstName} ${lastName}`.replace(/\s+/g, " ").trim();
}

function buildNotFoundError(correlationId: string, details: Record<string, unknown>) {
  return new ApiError({
    errorCode: "NOT_FOUND",
    status: 404,
    message: "Talent identity was not found.",
    details,
    correlationId,
  });
}

function mapContextRow(row: ContextRow): PersistentTalentIdentityContext {
  return {
    user: {
      id: row.user_id,
      email: row.user_email,
      fullName: row.user_full_name,
      firstName: row.user_first_name,
      lastName: row.user_last_name,
      imageUrl: row.user_image_url,
      authProvider: row.user_auth_provider,
      providerUserId: row.user_provider_user_id,
      emailVerified: row.user_email_verified,
      createdAt: formatIsoString(row.user_created_at),
      updatedAt: formatIsoString(row.user_updated_at),
      lastLoginAt: formatIsoString(row.user_last_login_at),
    },
    onboarding: {
      status: row.onboarding_status,
      profileCompletionPercent: row.profile_completion_percent,
      currentStep: row.current_step,
      roleType: row.role_type,
      profile: row.career_identity_profile_json ?? {},
    },
    aggregate: {
      talentIdentity: {
        id: row.career_identity_id,
        talent_agent_id: row.talent_agent_id,
        email: row.user_email,
        phone_optional: row.phone_optional,
        first_name: row.user_first_name,
        last_name: row.user_last_name,
        display_name: row.display_name,
        country_code: row.country_code,
        created_at: formatIsoString(row.career_identity_created_at),
        updated_at: formatIsoString(row.career_identity_updated_at),
        status: row.career_identity_status,
        privacy_settings_id: row.privacy_settings_id,
      },
      privacySettings: {
        id: row.privacy_settings_id,
        talent_identity_id: row.career_identity_id,
        show_employment_records: row.show_employment_records,
        show_education_records: row.show_education_records,
        show_certification_records: row.show_certification_records,
        show_endorsements: row.show_endorsements,
        show_status_labels: row.show_status_labels,
        show_artifact_previews: row.show_artifact_previews,
        allow_public_share_link: row.allow_public_share_link,
        allow_qr_share: row.allow_qr_share,
        created_at: formatIsoString(row.privacy_settings_created_at),
        updated_at: formatIsoString(row.privacy_settings_updated_at),
      },
      soulRecord: {
        id: row.soul_record_id,
        talent_identity_id: row.career_identity_id,
        trust_summary_id: row.trust_summary_id,
        default_share_profile_id: row.default_share_profile_id,
        created_at: formatIsoString(row.soul_record_created_at),
        updated_at: formatIsoString(row.soul_record_updated_at),
        version: row.soul_record_version,
      },
    },
  };
}

async function findContextByWhere(
  queryable: DatabaseQueryable,
  clause: string,
  values: unknown[],
) {
  const row = await queryOptional<ContextRow>(
    queryable,
    `${selectContextBaseQuery} WHERE ${clause}`,
    values,
  );

  return row ? mapContextRow(row) : null;
}

async function requireContextByWhere(
  queryable: DatabaseQueryable,
  clause: string,
  values: unknown[],
  correlationId: string,
  details: Record<string, unknown>,
) {
  const context = await findContextByWhere(queryable, clause, values);

  if (!context) {
    throw buildNotFoundError(correlationId, details);
  }

  return context;
}

async function ensureIdentitySupportRecords(
  queryable: DatabaseQueryable,
  careerIdentityId: string,
) {
  const existingPrivacySettings = await queryOptional<{ id: string }>(
    queryable,
    "SELECT id FROM privacy_settings WHERE career_identity_id = $1",
    [careerIdentityId],
  );

  if (!existingPrivacySettings) {
    await queryable.query(
      `
        INSERT INTO privacy_settings (
          id,
          career_identity_id
        )
        VALUES ($1, $2)
      `,
      [`privacy_${crypto.randomUUID()}`, careerIdentityId],
    );
  }

  const existingSoulRecord = await queryOptional<{ id: string }>(
    queryable,
    "SELECT id FROM soul_records WHERE career_identity_id = $1",
    [careerIdentityId],
  );

  if (!existingSoulRecord) {
    await queryable.query(
      `
        INSERT INTO soul_records (
          id,
          career_identity_id
        )
        VALUES ($1, $2)
      `,
      [`soul_${crypto.randomUUID()}`, careerIdentityId],
    );
  }
}

async function ensureCareerIdentity(
  queryable: DatabaseQueryable,
  args: {
    userId: string;
    displayName: string;
    countryCode: string;
    phoneOptional?: string | null;
  },
): Promise<IdentityCreationState> {
  const existingIdentity = await queryOptional<{ id: string }>(
    queryable,
    "SELECT id FROM career_identities WHERE user_id = $1",
    [args.userId],
  );

  if (existingIdentity) {
    await ensureIdentitySupportRecords(queryable, existingIdentity.id);

    return {
      careerIdentityId: existingIdentity.id,
      createdIdentity: false,
    };
  }

  const careerIdentityId = `tal_${crypto.randomUUID()}`;
  const sequenceRow = await queryRequired<{ next_value: number | string }>(
    queryable,
    "SELECT nextval('career_identity_talent_agent_seq') AS next_value",
  );
  const talentAgentId = `TAID-${String(sequenceRow.next_value).padStart(6, "0")}`;

  await queryable.query(
    `
      INSERT INTO career_identities (
        id,
        user_id,
        talent_agent_id,
        display_name,
        country_code,
        phone_optional
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6
      )
    `,
    [
      careerIdentityId,
      args.userId,
      talentAgentId,
      args.displayName,
      args.countryCode.toUpperCase(),
      args.phoneOptional ?? null,
    ],
  );

  await ensureIdentitySupportRecords(queryable, careerIdentityId);

  return {
    careerIdentityId,
    createdIdentity: true,
  };
}

export async function findPersistentContextByUserId(args: {
  userId: string;
  correlationId: string;
}) {
  return requireContextByWhere(
    getDatabasePool(),
    "u.id = $1",
    [args.userId],
    args.correlationId,
    { userId: args.userId },
  );
}

export async function findPersistentContextByEmail(args: {
  email: string;
  correlationId: string;
}) {
  const normalizedEmail = normalizeEmail(args.email);

  return requireContextByWhere(
    getDatabasePool(),
    "u.email = $1",
    [normalizedEmail],
    args.correlationId,
    { email: normalizedEmail },
  );
}

export async function findPersistentContextByTalentIdentityId(args: {
  talentIdentityId: string;
  correlationId: string;
}) {
  return requireContextByWhere(
    getDatabasePool(),
    "ci.id = $1",
    [args.talentIdentityId],
    args.correlationId,
    { talentIdentityId: args.talentIdentityId },
  );
}

export async function findPersistentContextBySoulRecordId(args: {
  soulRecordId: string;
  correlationId: string;
}) {
  return requireContextByWhere(
    getDatabasePool(),
    "sr.id = $1",
    [args.soulRecordId],
    args.correlationId,
    { soulRecordId: args.soulRecordId },
  );
}

export async function listPersistentCandidateContexts(args?: {
  limit?: number;
}) {
  const limit = args?.limit ?? 250;
  const result = await getDatabasePool().query<ContextRow>(
    `
      ${selectContextBaseQuery}
      WHERE ci.status = 'ACTIVE'
        AND (ci.role_type = 'candidate' OR ci.role_type IS NULL)
      ORDER BY ci.updated_at DESC
      LIMIT $1
    `,
    [limit],
  );

  return result.rows.map((row) => mapContextRow(row));
}

export async function provisionGoogleUser(args: ProvisionGoogleUserArgs) {
  const normalizedEmail = normalizeEmail(args.email);

  return withDatabaseTransaction(async (client) => {
    const byProvider = await queryOptional<{ id: string }>(
      client,
      "SELECT id FROM users WHERE auth_provider = 'google' AND provider_user_id = $1 FOR UPDATE",
      [args.providerUserId],
    );
    const byEmail = byProvider
      ? null
      : await queryOptional<{ id: string }>(
          client,
          "SELECT id FROM users WHERE email = $1 FOR UPDATE",
          [normalizedEmail],
        );
    const userId = byProvider?.id ?? byEmail?.id ?? `user_${crypto.randomUUID()}`;
    const createdUser = !byProvider && !byEmail;

    await client.query(
      `
        INSERT INTO users (
          id,
          email,
          full_name,
          first_name,
          last_name,
          image_url,
          auth_provider,
          provider_user_id,
          email_verified,
          created_at,
          updated_at,
          last_login_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, 'google', $7, $8, NOW(), NOW(), NOW())
        ON CONFLICT (id) DO UPDATE
        SET
          email = EXCLUDED.email,
          full_name = CASE
            WHEN users.full_name = '' THEN EXCLUDED.full_name
            ELSE users.full_name
          END,
          first_name = CASE
            WHEN users.first_name = '' THEN EXCLUDED.first_name
            ELSE users.first_name
          END,
          last_name = CASE
            WHEN users.last_name = '' THEN EXCLUDED.last_name
            ELSE users.last_name
          END,
          image_url = EXCLUDED.image_url,
          auth_provider = EXCLUDED.auth_provider,
          provider_user_id = EXCLUDED.provider_user_id,
          email_verified = EXCLUDED.email_verified,
          updated_at = NOW(),
          last_login_at = NOW()
      `,
      [
        userId,
        normalizedEmail,
        args.fullName,
        args.firstName,
        args.lastName,
        args.imageUrl ?? null,
        args.providerUserId,
        args.emailVerified,
      ],
    );

    const identityState = await ensureCareerIdentity(client, {
      userId,
      displayName: formatDisplayName(args.firstName, args.lastName, args.fullName),
      countryCode: "ZZ",
    });

    const context = await requireContextByWhere(
      client,
      "u.id = $1",
      [userId],
      args.correlationId,
      { userId },
    );

    return {
      context,
      createdUser,
      createdIdentity: identityState.createdIdentity,
    };
  });
}

export async function updatePersistentTalentIdentityProfile(args: {
  talentIdentityId: string;
  input: {
    firstName?: string;
    lastName?: string;
    countryCode?: string;
    phoneOptional?: string | null;
  };
  correlationId: string;
}) {
  return withDatabaseTransaction(async (client) => {
    const context = await findContextByWhere(client, "ci.id = $1", [args.talentIdentityId]);

    if (!context) {
      throw buildNotFoundError(args.correlationId, {
        talentIdentityId: args.talentIdentityId,
      });
    }

    const nextFirstName = args.input.firstName ?? context.user.firstName;
    const nextLastName = args.input.lastName ?? context.user.lastName;
    const nextFullName = formatDisplayName(nextFirstName, nextLastName, "");
    const nextCountryCode = args.input.countryCode?.toUpperCase();
    const hasPhoneOptional = Object.prototype.hasOwnProperty.call(args.input, "phoneOptional");

    await client.query(
      `
        UPDATE users
        SET
          full_name = $2,
          first_name = $3,
          last_name = $4,
          updated_at = NOW()
        WHERE id = $1
      `,
      [context.user.id, nextFullName, nextFirstName, nextLastName],
    );

    await client.query(
      `
        UPDATE career_identities
        SET
          display_name = $2,
          country_code = COALESCE($3, country_code),
          phone_optional = CASE
            WHEN $4 THEN $5
            ELSE phone_optional
          END,
          updated_at = NOW()
        WHERE id = $1
      `,
      [
        args.talentIdentityId,
        nextFullName,
        nextCountryCode,
        hasPhoneOptional,
        args.input.phoneOptional ?? null,
      ],
    );

    const nextContext = await requireContextByWhere(
      client,
      "ci.id = $1",
      [args.talentIdentityId],
      args.correlationId,
      { talentIdentityId: args.talentIdentityId },
    );

    await refreshPersistentRecruiterCandidateProjection({
      careerIdentityId: nextContext.aggregate.talentIdentity.id,
      queryable: client,
    });

    return nextContext;
  });
}

export async function createPersistentTalentIdentity(args: CreatePersistentIdentityArgs) {
  const normalizedEmail = normalizeEmail(args.email);

  return withDatabaseTransaction(async (client) => {
    const existing = await queryOptional<{ id: string }>(
      client,
      "SELECT id FROM users WHERE email = $1 FOR UPDATE",
      [normalizedEmail],
    );

    if (existing) {
      throw new ApiError({
        errorCode: "CONFLICT",
        status: 409,
        message: "A talent identity with this email already exists.",
        details: { email: normalizedEmail },
        correlationId: args.correlationId,
      });
    }

    const userId = `user_${crypto.randomUUID()}`;
    const fullName = formatDisplayName(args.firstName, args.lastName, "");
    const provider = args.actorType === "system_service" ? "system_service" : "manual";

    await client.query(
      `
        INSERT INTO users (
          id,
          email,
          full_name,
          first_name,
          last_name,
          image_url,
          auth_provider,
          provider_user_id,
          email_verified,
          created_at,
          updated_at,
          last_login_at
        )
        VALUES ($1, $2, $3, $4, $5, NULL, $6, $7, false, NOW(), NOW(), NOW())
      `,
      [
        userId,
        normalizedEmail,
        fullName,
        args.firstName,
        args.lastName,
        provider,
        `${provider}:${normalizedEmail}`,
      ],
    );

    await ensureCareerIdentity(client, {
      userId,
      displayName: fullName,
      countryCode: args.countryCode,
      phoneOptional: args.phoneOptional ?? null,
    });

    return requireContextByWhere(
      client,
      "u.id = $1",
      [userId],
      args.correlationId,
      { userId },
    );
  });
}

export async function updatePersistentPrivacySettings(args: {
  talentIdentityId: string;
  input: {
    showEmploymentRecords?: boolean;
    showEducationRecords?: boolean;
    showCertificationRecords?: boolean;
    showEndorsements?: boolean;
    showStatusLabels?: boolean;
    showArtifactPreviews?: boolean;
    allowPublicShareLink?: boolean;
    allowQrShare?: boolean;
  };
  correlationId: string;
}) {
  return withDatabaseTransaction(async (client) => {
    const context = await findContextByWhere(client, "ci.id = $1", [args.talentIdentityId]);

    if (!context) {
      throw buildNotFoundError(args.correlationId, {
        talentIdentityId: args.talentIdentityId,
      });
    }

    await client.query(
      `
        UPDATE privacy_settings
        SET
          show_employment_records = COALESCE($2, show_employment_records),
          show_education_records = COALESCE($3, show_education_records),
          show_certification_records = COALESCE($4, show_certification_records),
          show_endorsements = COALESCE($5, show_endorsements),
          show_status_labels = COALESCE($6, show_status_labels),
          show_artifact_previews = COALESCE($7, show_artifact_previews),
          allow_public_share_link = COALESCE($8, allow_public_share_link),
          allow_qr_share = COALESCE($9, allow_qr_share),
          updated_at = NOW()
        WHERE career_identity_id = $1
      `,
      [
        args.talentIdentityId,
        args.input.showEmploymentRecords,
        args.input.showEducationRecords,
        args.input.showCertificationRecords,
        args.input.showEndorsements,
        args.input.showStatusLabels,
        args.input.showArtifactPreviews,
        args.input.allowPublicShareLink,
        args.input.allowQrShare,
      ],
    );

    const nextContext = await requireContextByWhere(
      client,
      "ci.id = $1",
      [args.talentIdentityId],
      args.correlationId,
      { talentIdentityId: args.talentIdentityId },
    );

    await refreshPersistentRecruiterCandidateProjection({
      careerIdentityId: nextContext.aggregate.talentIdentity.id,
      queryable: client,
    });

    return nextContext;
  });
}

export async function updatePersistentSoulRecordReferences(args: {
  talentIdentityId: string;
  trustSummaryIdOptional?: string | null;
  defaultShareProfileIdOptional?: string | null;
  correlationId: string;
}) {
  return withDatabaseTransaction(async (client) => {
    const context = await findContextByWhere(client, "ci.id = $1", [args.talentIdentityId]);

    if (!context) {
      throw buildNotFoundError(args.correlationId, {
        talentIdentityId: args.talentIdentityId,
      });
    }

    await client.query(
      `
        UPDATE soul_records
        SET
          trust_summary_id = COALESCE($2, trust_summary_id),
          default_share_profile_id = COALESCE($3, default_share_profile_id),
          version = version + 1,
          updated_at = NOW()
        WHERE career_identity_id = $1
      `,
      [
        args.talentIdentityId,
        args.trustSummaryIdOptional,
        args.defaultShareProfileIdOptional,
      ],
    );

    const nextContext = await requireContextByWhere(
      client,
      "ci.id = $1",
      [args.talentIdentityId],
      args.correlationId,
      { talentIdentityId: args.talentIdentityId },
    );

    await refreshPersistentRecruiterCandidateProjection({
      careerIdentityId: nextContext.aggregate.talentIdentity.id,
      queryable: client,
    });

    return nextContext;
  });
}

export async function updateBasicProfileAndOnboarding(args: {
  userId: string;
  firstName: string;
  lastName: string;
  imageUrl?: string | null;
  correlationId: string;
}) {
  return withDatabaseTransaction(async (client) => {
    const fullName = formatDisplayName(args.firstName, args.lastName, "");

    await client.query(
      `
        UPDATE users
        SET
          full_name = $2,
          first_name = $3,
          last_name = $4,
          image_url = COALESCE($5, image_url),
          updated_at = NOW()
        WHERE id = $1
      `,
      [
        args.userId,
        fullName,
        args.firstName,
        args.lastName,
        args.imageUrl ?? null,
      ],
    );

    await client.query(
      `
        UPDATE career_identities
        SET
          display_name = $2,
          onboarding_status = CASE
            WHEN onboarding_status = 'completed' THEN onboarding_status
            ELSE 'in_progress'
          END,
          profile_completion_percent = GREATEST(profile_completion_percent, 25),
          current_step = CASE
            WHEN onboarding_status = 'completed' THEN current_step
            ELSE 2
          END,
          updated_at = NOW()
        WHERE user_id = $1
      `,
      [args.userId, fullName],
    );

    const nextContext = await requireContextByWhere(
      client,
      "u.id = $1",
      [args.userId],
      args.correlationId,
      { userId: args.userId },
    );

    await refreshPersistentRecruiterCandidateProjection({
      careerIdentityId: nextContext.aggregate.talentIdentity.id,
      queryable: client,
    });

    return nextContext;
  });
}

export async function updateRoleSelection(args: {
  userId: string;
  roleType: string;
  correlationId: string;
}) {
  return withDatabaseTransaction(async (client) => {
    await client.query(
      `
        UPDATE career_identities
        SET
          role_type = $2,
          onboarding_status = CASE
            WHEN onboarding_status = 'completed' THEN onboarding_status
            ELSE 'in_progress'
          END,
          profile_completion_percent = GREATEST(profile_completion_percent, 50),
          current_step = CASE
            WHEN onboarding_status = 'completed' THEN current_step
            ELSE 3
          END,
          updated_at = NOW()
        WHERE user_id = $1
      `,
      [args.userId, args.roleType],
    );

    const nextContext = await requireContextByWhere(
      client,
      "u.id = $1",
      [args.userId],
      args.correlationId,
      { userId: args.userId },
    );

    await refreshPersistentRecruiterCandidateProjection({
      careerIdentityId: nextContext.aggregate.talentIdentity.id,
      queryable: client,
    });

    return nextContext;
  });
}

export async function updateCareerProfileBasics(args: {
  userId: string;
  profilePatch: Record<string, unknown>;
  correlationId: string;
}) {
  return withDatabaseTransaction(async (client) => {
    const existing = await requireContextByWhere(
      client,
      "u.id = $1",
      [args.userId],
      args.correlationId,
      { userId: args.userId },
    );
    const nextProfile = {
      ...existing.onboarding.profile,
      ...args.profilePatch,
    };

    await client.query(
      `
        UPDATE career_identities
        SET
          profile_json = $2::jsonb,
          onboarding_status = CASE
            WHEN onboarding_status = 'completed' THEN onboarding_status
            ELSE 'in_progress'
          END,
          profile_completion_percent = GREATEST(profile_completion_percent, 75),
          current_step = CASE
            WHEN onboarding_status = 'completed' THEN current_step
            ELSE 4
          END,
          updated_at = NOW()
        WHERE user_id = $1
      `,
      [args.userId, JSON.stringify(nextProfile)],
    );

    const nextContext = await requireContextByWhere(
      client,
      "u.id = $1",
      [args.userId],
      args.correlationId,
      { userId: args.userId },
    );

    await refreshPersistentRecruiterCandidateProjection({
      careerIdentityId: nextContext.aggregate.talentIdentity.id,
      queryable: client,
    });

    return nextContext;
  });
}

export async function completePersistentOnboarding(args: {
  userId: string;
  correlationId: string;
}) {
  return withDatabaseTransaction(async (client) => {
    await client.query(
      `
        UPDATE career_identities
        SET
          onboarding_status = 'completed',
          profile_completion_percent = 100,
          current_step = 4,
          updated_at = NOW()
        WHERE user_id = $1
      `,
      [args.userId],
    );

    const nextContext = await requireContextByWhere(
      client,
      "u.id = $1",
      [args.userId],
      args.correlationId,
      { userId: args.userId },
    );

    await refreshPersistentRecruiterCandidateProjection({
      careerIdentityId: nextContext.aggregate.talentIdentity.id,
      queryable: client,
    });

    return nextContext;
  });
}

export async function getPersistentIdentityServiceMetrics() {
  const pool = getDatabasePool();
  const result = await pool.query<{
    talent_identities: string;
    soul_records: string;
    privacy_settings: string;
    next_talent_sequence: string;
  }>(`
    SELECT
      (SELECT COUNT(*)::text FROM career_identities) AS talent_identities,
      (SELECT COUNT(*)::text FROM soul_records) AS soul_records,
      (SELECT COUNT(*)::text FROM privacy_settings) AS privacy_settings,
      (SELECT last_value::text FROM career_identity_talent_agent_seq) AS next_talent_sequence
  `);
  const row = result.rows[0];

  return {
    talentIdentities: Number(row?.talent_identities ?? 0),
    soulRecords: Number(row?.soul_records ?? 0),
    privacySettings: Number(row?.privacy_settings ?? 0),
    nextTalentSequence: Number(row?.next_talent_sequence ?? 0),
  };
}
