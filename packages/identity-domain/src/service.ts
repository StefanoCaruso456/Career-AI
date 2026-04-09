import {
  createTalentIdentityInputSchema,
  updatePrivacySettingsInputSchema,
  type ActorType,
  type CreateTalentIdentityInput,
  type TalentIdentityAggregate,
  type UpdatePrivacySettingsInput,
} from "@/packages/contracts/src";
import { logAuditEvent } from "@/packages/audit-security/src";
import {
  createPersistentTalentIdentity,
  findPersistentContextByEmail,
  findPersistentContextBySoulRecordId,
  findPersistentContextByTalentIdentityId,
  getPersistentIdentityServiceMetrics,
  updatePersistentPrivacySettings,
  updatePersistentSoulRecordReferences,
} from "@/packages/persistence/src";

export async function createTalentIdentity(args: {
  input: CreateTalentIdentityInput;
  actorType: "talent_user" | "system_service";
  actorId: string;
  correlationId: string;
}): Promise<TalentIdentityAggregate> {
  const input = createTalentIdentityInputSchema.parse(args.input);
  const context = await createPersistentTalentIdentity({
    email: input.email,
    firstName: input.firstName,
    lastName: input.lastName,
    countryCode: input.countryCode,
    phoneOptional: input.phoneOptional,
    actorType: args.actorType,
    correlationId: args.correlationId,
  });

  logAuditEvent({
    eventType: "talent.identity.created",
    actorType: args.actorType,
    actorId: args.actorId,
    targetType: "talent_identity",
    targetId: context.aggregate.talentIdentity.id,
    correlationId: args.correlationId,
    metadataJson: {
      talent_agent_id: context.aggregate.talentIdentity.talent_agent_id,
      soul_record_id: context.aggregate.soulRecord.id,
    },
  });

  logAuditEvent({
    eventType: "soul_record.created",
    actorType: args.actorType,
    actorId: args.actorId,
    targetType: "soul_record",
    targetId: context.aggregate.soulRecord.id,
    correlationId: args.correlationId,
    metadataJson: {
      talent_identity_id: context.aggregate.talentIdentity.id,
    },
  });

  return context.aggregate;
}

export async function getTalentIdentity(args: {
  talentIdentityId: string;
  correlationId: string;
}) {
  const context = await findPersistentContextByTalentIdentityId(args);

  return context.aggregate;
}

export async function getTalentIdentityByEmail(args: {
  email: string;
  correlationId: string;
}) {
  const context = await findPersistentContextByEmail(args);

  return context.aggregate;
}

export async function getTalentIdentityBySoulRecordId(args: {
  soulRecordId: string;
  correlationId: string;
}) {
  const context = await findPersistentContextBySoulRecordId(args);

  return context.aggregate;
}

export async function updatePrivacySettings(args: {
  talentIdentityId: string;
  input: UpdatePrivacySettingsInput;
  actorType: "talent_user" | "system_service";
  actorId: string;
  correlationId: string;
}) {
  const input = updatePrivacySettingsInputSchema.parse(args.input);
  const context = await updatePersistentPrivacySettings({
    talentIdentityId: args.talentIdentityId,
    input,
    correlationId: args.correlationId,
  });

  logAuditEvent({
    eventType: "candidate.privacy_settings.updated",
    actorType: args.actorType,
    actorId: args.actorId,
    targetType: "privacy_settings",
    targetId: context.aggregate.privacySettings.id,
    correlationId: args.correlationId,
    metadataJson: input,
  });

  return context.aggregate;
}

export async function updateSoulRecordReferences(args: {
  talentIdentityId: string;
  trustSummaryIdOptional?: string | null;
  defaultShareProfileIdOptional?: string | null;
  actorType: ActorType;
  actorId: string;
  correlationId: string;
}) {
  const context = await updatePersistentSoulRecordReferences({
    talentIdentityId: args.talentIdentityId,
    trustSummaryIdOptional: args.trustSummaryIdOptional,
    defaultShareProfileIdOptional: args.defaultShareProfileIdOptional,
    correlationId: args.correlationId,
  });

  logAuditEvent({
    eventType: "soul_record.updated",
    actorType: args.actorType,
    actorId: args.actorId,
    targetType: "soul_record",
    targetId: context.aggregate.soulRecord.id,
    correlationId: args.correlationId,
    metadataJson: {
      trust_summary_id: context.aggregate.soulRecord.trust_summary_id,
      default_share_profile_id: context.aggregate.soulRecord.default_share_profile_id,
      version: context.aggregate.soulRecord.version,
    },
  });

  return context.aggregate;
}

export async function getIdentityServiceMetrics() {
  return getPersistentIdentityServiceMetrics();
}
