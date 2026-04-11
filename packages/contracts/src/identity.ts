import { z } from "zod";

export const talentIdentityStatusSchema = z.enum(["ACTIVE", "SUSPENDED"]);

export const privacySettingsSchema = z.object({
  id: z.string(),
  talent_identity_id: z.string(),
  show_employment_records: z.boolean(),
  show_education_records: z.boolean(),
  show_certification_records: z.boolean(),
  show_endorsements: z.boolean(),
  show_status_labels: z.boolean(),
  show_artifact_previews: z.boolean(),
  allow_public_share_link: z.boolean(),
  allow_qr_share: z.boolean(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export const soulRecordSchema = z.object({
  id: z.string(),
  talent_identity_id: z.string(),
  trust_summary_id: z.string().nullable(),
  default_share_profile_id: z.string().nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  version: z.number().int().positive(),
});

export const talentIdentitySchema = z.object({
  id: z.string(),
  talent_agent_id: z.string(),
  email: z.string().email(),
  phone_optional: z.string().nullable(),
  first_name: z.string(),
  last_name: z.string(),
  display_name: z.string(),
  country_code: z.string().length(2),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  status: talentIdentityStatusSchema,
  privacy_settings_id: z.string(),
});

export const createTalentIdentityInputSchema = z.object({
  email: z.string().trim().email(),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  countryCode: z.string().trim().length(2).transform((value) => value.toUpperCase()),
  phoneOptional: z.string().trim().min(3).max(30).optional(),
});

export const updateTalentIdentityProfileInputSchema = z
  .object({
    firstName: z.string().trim().min(1).max(100).optional(),
    lastName: z.string().trim().min(1).max(100).optional(),
    countryCode: z
      .string()
      .trim()
      .length(2)
      .transform((value) => value.toUpperCase())
      .optional(),
    phoneOptional: z
      .union([z.string().trim().min(3).max(30), z.literal(""), z.null()])
      .transform((value) => (value === "" ? null : value))
      .optional(),
  })
  .refine(
    (value) =>
      value.firstName !== undefined ||
      value.lastName !== undefined ||
      value.countryCode !== undefined ||
      value.phoneOptional !== undefined,
    {
      message: "At least one profile field must be provided.",
    },
  );

export const updatePrivacySettingsInputSchema = z
  .object({
    showEmploymentRecords: z.boolean().optional(),
    showEducationRecords: z.boolean().optional(),
    showCertificationRecords: z.boolean().optional(),
    showEndorsements: z.boolean().optional(),
    showStatusLabels: z.boolean().optional(),
    showArtifactPreviews: z.boolean().optional(),
    allowPublicShareLink: z.boolean().optional(),
    allowQrShare: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one privacy setting must be provided.",
  });

export type TalentIdentityStatus = z.infer<typeof talentIdentityStatusSchema>;
export type PrivacySettings = z.infer<typeof privacySettingsSchema>;
export type SoulRecord = z.infer<typeof soulRecordSchema>;
export type TalentIdentity = z.infer<typeof talentIdentitySchema>;
export type CreateTalentIdentityInput = z.infer<typeof createTalentIdentityInputSchema>;
export type UpdateTalentIdentityProfileInput = z.infer<
  typeof updateTalentIdentityProfileInputSchema
>;
export type UpdatePrivacySettingsInput = z.infer<typeof updatePrivacySettingsInputSchema>;

export type TalentIdentityAggregate = {
  talentIdentity: TalentIdentity;
  soulRecord: SoulRecord;
  privacySettings: PrivacySettings;
};

export type TalentIdentitySummaryDto = {
  id: string;
  talentAgentId: string;
  soulRecordId: string;
  createdAt: string;
};

export type PrivacySettingsDto = {
  id: string;
  showEmploymentRecords: boolean;
  showEducationRecords: boolean;
  showCertificationRecords: boolean;
  showEndorsements: boolean;
  showStatusLabels: boolean;
  showArtifactPreviews: boolean;
  allowPublicShareLink: boolean;
  allowQrShare: boolean;
  updatedAt: string;
};

export type TalentIdentityDetailsDto = {
  id: string;
  talentAgentId: string;
  email: string;
  phoneOptional: string | null;
  firstName: string;
  lastName: string;
  displayName: string;
  countryCode: string;
  status: TalentIdentityStatus;
  createdAt: string;
  updatedAt: string;
  soulRecord: {
    id: string;
    trustSummaryId: string | null;
    defaultShareProfileId: string | null;
    createdAt: string;
    updatedAt: string;
    version: number;
  };
  privacySettings: PrivacySettingsDto;
};
