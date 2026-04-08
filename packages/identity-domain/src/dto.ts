import type {
  PrivacySettingsDto,
  TalentIdentityAggregate,
  TalentIdentityDetailsDto,
  TalentIdentitySummaryDto,
} from "@/packages/contracts/src";

export function toPrivacySettingsDto(
  aggregate: TalentIdentityAggregate,
): PrivacySettingsDto {
  return {
    id: aggregate.privacySettings.id,
    showEmploymentRecords: aggregate.privacySettings.show_employment_records,
    showEducationRecords: aggregate.privacySettings.show_education_records,
    showCertificationRecords: aggregate.privacySettings.show_certification_records,
    showEndorsements: aggregate.privacySettings.show_endorsements,
    showStatusLabels: aggregate.privacySettings.show_status_labels,
    showArtifactPreviews: aggregate.privacySettings.show_artifact_previews,
    allowPublicShareLink: aggregate.privacySettings.allow_public_share_link,
    allowQrShare: aggregate.privacySettings.allow_qr_share,
    updatedAt: aggregate.privacySettings.updated_at,
  };
}

export function toTalentIdentitySummaryDto(
  aggregate: TalentIdentityAggregate,
): TalentIdentitySummaryDto {
  return {
    id: aggregate.talentIdentity.id,
    talentAgentId: aggregate.talentIdentity.talent_agent_id,
    soulRecordId: aggregate.soulRecord.id,
    createdAt: aggregate.talentIdentity.created_at,
  };
}

export function toTalentIdentityDetailsDto(
  aggregate: TalentIdentityAggregate,
): TalentIdentityDetailsDto {
  return {
    id: aggregate.talentIdentity.id,
    talentAgentId: aggregate.talentIdentity.talent_agent_id,
    email: aggregate.talentIdentity.email,
    phoneOptional: aggregate.talentIdentity.phone_optional,
    firstName: aggregate.talentIdentity.first_name,
    lastName: aggregate.talentIdentity.last_name,
    displayName: aggregate.talentIdentity.display_name,
    countryCode: aggregate.talentIdentity.country_code,
    status: aggregate.talentIdentity.status,
    createdAt: aggregate.talentIdentity.created_at,
    updatedAt: aggregate.talentIdentity.updated_at,
    soulRecord: {
      id: aggregate.soulRecord.id,
      trustSummaryId: aggregate.soulRecord.trust_summary_id,
      defaultShareProfileId: aggregate.soulRecord.default_share_profile_id,
      createdAt: aggregate.soulRecord.created_at,
      updatedAt: aggregate.soulRecord.updated_at,
      version: aggregate.soulRecord.version,
    },
    privacySettings: toPrivacySettingsDto(aggregate),
  };
}
