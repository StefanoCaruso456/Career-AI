import {
  ApiError,
  createTalentIdentityInputSchema,
  updatePrivacySettingsInputSchema,
  type CreateTalentIdentityInput,
  type PrivacySettings,
  type SoulRecord,
  type TalentIdentity,
  type TalentIdentityAggregate,
  type UpdatePrivacySettingsInput,
} from "@/packages/contracts/src";
import { logAuditEvent } from "@/packages/audit-security/src";
import { getIdentityStore } from "./store";

function createTalentAgentId(sequence: number) {
  return `TAID-${sequence.toString().padStart(6, "0")}`;
}

function createDefaultPrivacySettings(talentIdentityId: string): PrivacySettings {
  const now = new Date().toISOString();

  return {
    id: `privacy_${crypto.randomUUID()}`,
    talent_identity_id: talentIdentityId,
    show_employment_records: false,
    show_education_records: false,
    show_certification_records: false,
    show_endorsements: false,
    show_status_labels: true,
    show_artifact_previews: false,
    allow_public_share_link: false,
    allow_qr_share: false,
    created_at: now,
    updated_at: now,
  };
}

function createSoulRecord(talentIdentityId: string): SoulRecord {
  const now = new Date().toISOString();

  return {
    id: `soul_${crypto.randomUUID()}`,
    talent_identity_id: talentIdentityId,
    trust_summary_id: null,
    default_share_profile_id: null,
    created_at: now,
    updated_at: now,
    version: 1,
  };
}

function requireAggregate(talentIdentityId: string, correlationId: string): TalentIdentityAggregate {
  const store = getIdentityStore();
  const talentIdentity = store.identitiesById.get(talentIdentityId);
  const soulRecord = store.soulRecordsByIdentityId.get(talentIdentityId);
  const privacySettings = store.privacySettingsByIdentityId.get(talentIdentityId);

  if (!talentIdentity || !soulRecord || !privacySettings) {
    throw new ApiError({
      errorCode: "NOT_FOUND",
      status: 404,
      message: "Talent identity was not found.",
      details: { talentIdentityId },
      correlationId,
    });
  }

  return {
    talentIdentity,
    soulRecord,
    privacySettings,
  };
}

export function createTalentIdentity(args: {
  input: CreateTalentIdentityInput;
  actorType: "talent_user" | "system_service";
  actorId: string;
  correlationId: string;
}): TalentIdentityAggregate {
  const input = createTalentIdentityInputSchema.parse(args.input);
  const store = getIdentityStore();
  const normalizedEmail = input.email.toLowerCase();

  if (store.identitiesByEmail.has(normalizedEmail)) {
    throw new ApiError({
      errorCode: "CONFLICT",
      status: 409,
      message: "A talent identity with this email already exists.",
      details: { email: normalizedEmail },
      correlationId: args.correlationId,
    });
  }

  const now = new Date().toISOString();
  const talentIdentityId = `tal_${crypto.randomUUID()}`;
  const privacySettings = createDefaultPrivacySettings(talentIdentityId);
  const soulRecord = createSoulRecord(talentIdentityId);

  const talentIdentity: TalentIdentity = {
    id: talentIdentityId,
    talent_agent_id: createTalentAgentId(store.nextTalentSequence),
    email: normalizedEmail,
    phone_optional: input.phoneOptional ?? null,
    first_name: input.firstName,
    last_name: input.lastName,
    display_name: `${input.firstName} ${input.lastName}`,
    country_code: input.countryCode,
    created_at: now,
    updated_at: now,
    status: "ACTIVE",
    privacy_settings_id: privacySettings.id,
  };

  store.nextTalentSequence += 1;
  store.identitiesById.set(talentIdentity.id, talentIdentity);
  store.identitiesByEmail.set(normalizedEmail, talentIdentity.id);
  store.soulRecordsByIdentityId.set(talentIdentity.id, soulRecord);
  store.privacySettingsByIdentityId.set(talentIdentity.id, privacySettings);

  logAuditEvent({
    eventType: "talent.identity.created",
    actorType: args.actorType,
    actorId: args.actorId,
    targetType: "talent_identity",
    targetId: talentIdentity.id,
    correlationId: args.correlationId,
    metadataJson: {
      talent_agent_id: talentIdentity.talent_agent_id,
      soul_record_id: soulRecord.id,
    },
  });

  logAuditEvent({
    eventType: "soul_record.created",
    actorType: args.actorType,
    actorId: args.actorId,
    targetType: "soul_record",
    targetId: soulRecord.id,
    correlationId: args.correlationId,
    metadataJson: {
      talent_identity_id: talentIdentity.id,
    },
  });

  return {
    talentIdentity,
    soulRecord,
    privacySettings,
  };
}

export function getTalentIdentity(args: {
  talentIdentityId: string;
  correlationId: string;
}): TalentIdentityAggregate {
  return requireAggregate(args.talentIdentityId, args.correlationId);
}

export function updatePrivacySettings(args: {
  talentIdentityId: string;
  input: UpdatePrivacySettingsInput;
  actorType: "talent_user" | "system_service";
  actorId: string;
  correlationId: string;
}): TalentIdentityAggregate {
  const input = updatePrivacySettingsInputSchema.parse(args.input);
  const aggregate = requireAggregate(args.talentIdentityId, args.correlationId);
  const store = getIdentityStore();
  const updatedAt = new Date().toISOString();

  const updatedPrivacySettings: PrivacySettings = {
    ...aggregate.privacySettings,
    show_employment_records:
      input.showEmploymentRecords ?? aggregate.privacySettings.show_employment_records,
    show_education_records:
      input.showEducationRecords ?? aggregate.privacySettings.show_education_records,
    show_certification_records:
      input.showCertificationRecords ?? aggregate.privacySettings.show_certification_records,
    show_endorsements: input.showEndorsements ?? aggregate.privacySettings.show_endorsements,
    show_status_labels: input.showStatusLabels ?? aggregate.privacySettings.show_status_labels,
    show_artifact_previews:
      input.showArtifactPreviews ?? aggregate.privacySettings.show_artifact_previews,
    allow_public_share_link:
      input.allowPublicShareLink ?? aggregate.privacySettings.allow_public_share_link,
    allow_qr_share: input.allowQrShare ?? aggregate.privacySettings.allow_qr_share,
    updated_at: updatedAt,
  };

  const updatedIdentity: TalentIdentity = {
    ...aggregate.talentIdentity,
    updated_at: updatedAt,
  };

  store.privacySettingsByIdentityId.set(args.talentIdentityId, updatedPrivacySettings);
  store.identitiesById.set(args.talentIdentityId, updatedIdentity);

  logAuditEvent({
    eventType: "candidate.privacy_settings.updated",
    actorType: args.actorType,
    actorId: args.actorId,
    targetType: "privacy_settings",
    targetId: updatedPrivacySettings.id,
    correlationId: args.correlationId,
    metadataJson: input,
  });

  return {
    talentIdentity: updatedIdentity,
    soulRecord: aggregate.soulRecord,
    privacySettings: updatedPrivacySettings,
  };
}

export function getIdentityServiceMetrics() {
  const store = getIdentityStore();

  return {
    talentIdentities: store.identitiesById.size,
    soulRecords: store.soulRecordsByIdentityId.size,
    privacySettings: store.privacySettingsByIdentityId.size,
    nextTalentSequence: store.nextTalentSequence,
  };
}
