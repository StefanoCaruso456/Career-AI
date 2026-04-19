import {
  ApiError,
  recruiterAccessGrantSchema,
  recruiterAccessStatusResponseSchema,
  recruiterCareerMatchResponseSchema,
  recruiterCareerMatchResultSchema,
  recruiterChatResponseSchema,
  recruiterConversationMessageSchema,
  recruiterConversationSchema,
  recruiterJobsListResponseSchema,
  type RecruiterA2AMessageType,
  type RecruiterAdminSeedSummary,
  type RecruiterAccessGrant,
  type RecruiterCareerIdentity,
  type RecruiterCareerMatchResult,
  type RecruiterJobPermissionScope,
  type RecruiterOwnedJob,
  type RecruiterRetrievalMode,
} from "@/packages/contracts/src";
import type { AuthenticatedActor } from "@/packages/audit-security/src";
import { logAuditEvent } from "@/packages/audit-security/src";
import {
  createRecruiterAccessGrantRecord,
  createRecruiterConversationMessageRecord,
  createRecruiterProtocolEventRecord,
  createSyntheticDataSeedRunRecord,
  finalizeSyntheticDataSeedRunRecord,
  findApprovedRecruiterAccessGrantRecord,
  findLatestRecruiterAccessGrantRecord,
  findLatestSyntheticDataSeedRunRecord,
  findPersistentContextByTalentIdentityId,
  findRecruiterCareerIdentityRecordById,
  findRecruiterConversationRecordById,
  findRecruiterOwnedJobRecordById,
  getDatabasePool,
  getPersistentCareerBuilderProfile,
  listEmployerPartnerRecords,
  listPersistentCareerBuilderEvidence,
  listRecruiterCareerIdentityRecords,
  listRecruiterOwnedJobRecords,
  updateRecruiterAccessGrantRecord,
  upsertEmployerPartnerRecord,
  upsertRecruiterCareerIdentityRecord,
  upsertRecruiterConversationRecord,
  upsertRecruiterOwnedJobRecord,
} from "@/packages/persistence/src";
import { traceSpan } from "@/lib/tracing";
import { emitA2AProtocolEvent } from "@/lib/a2a/protocol-runtime";
import {
  buildRecruiterOwnedJobsSeed,
  buildRecruiterSeedForEmployerPartner,
  DEFAULT_RECRUITER_PERMISSION_SCOPES,
  employerPartnerSeedConfig,
  getRecruiterMarketplaceCompanyNames,
  RECRUITER_MARKETPLACE_SEED_KEY,
  RECRUITER_MARKETPLACE_SEED_VERSION,
} from "./seed-config";

let seedPromise: Promise<RecruiterAdminSeedSummary> | null = null;

export function resetRecruiterMarketplaceSeedStateForTests() {
  seedPromise = null;
}

function normalizeText(value: string | null | undefined) {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function tokenize(value: string | null | undefined) {
  return normalizeText(value)
    .toLowerCase()
    .split(/[^a-z0-9+#./-]+/g)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function uniq(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function overlapScore(queryTerms: string[], candidateTerms: string[]) {
  if (queryTerms.length === 0 || candidateTerms.length === 0) {
    return 0;
  }

  const candidateSet = new Set(candidateTerms);
  const matches = queryTerms.filter((term) => candidateSet.has(term));

  return matches.length / queryTerms.length;
}

function buildRecruiterAgentId(recruiterCareerIdentityId: string) {
  return `careerai.agent.recruiter.${recruiterCareerIdentityId}`;
}

function buildSeekerAgentId(seekerCareerIdentityId: string) {
  return `careerai.agent.candidate.${seekerCareerIdentityId}`;
}

function mapModeToScope(mode: RecruiterRetrievalMode): RecruiterJobPermissionScope {
  if (mode === "recruiter_match") {
    return "match_against_my_career_id";
  }

  if (mode === "recruiter_review") {
    return "request_review";
  }

  return "chat_about_jobs";
}

function resolveSeekerCareerIdentityId(args: {
  actor: AuthenticatedActor;
  correlationId: string;
  explicitOptional?: string | null;
}) {
  const explicit = args.explicitOptional?.trim();

  if (explicit) {
    if (args.actor.actorType === "system_service") {
      return explicit;
    }

    if (args.actor.actorType === "talent_user" && args.actor.actorId === explicit) {
      return explicit;
    }
  }

  if (args.actor.actorType === "talent_user") {
    return args.actor.actorId;
  }

  throw new ApiError({
    correlationId: args.correlationId,
    details: {
      actorId: args.actor.actorId,
      actorType: args.actor.actorType,
    },
    errorCode: "FORBIDDEN",
    message: "Job seeker Career ID scope is required for recruiter marketplace flows.",
    status: 403,
  });
}

async function requireRecruiter(args: {
  correlationId: string;
  recruiterCareerIdentityId: string;
}) {
  const recruiter = await findRecruiterCareerIdentityRecordById({
    id: args.recruiterCareerIdentityId,
  });

  if (!recruiter || recruiter.status !== "active") {
    throw new ApiError({
      correlationId: args.correlationId,
      details: {
        recruiterCareerIdentityId: args.recruiterCareerIdentityId,
      },
      errorCode: "NOT_FOUND",
      message: "Recruiter Career Identity was not found.",
      status: 404,
    });
  }

  return recruiter;
}

function isGrantExpired(grant: RecruiterAccessGrant) {
  if (!grant.expiresAt) {
    return false;
  }

  return new Date(grant.expiresAt).getTime() <= Date.now();
}

async function normalizeGrantLifecycle(grant: RecruiterAccessGrant) {
  if (grant.status !== "approved" || !isGrantExpired(grant)) {
    return grant;
  }

  return updateRecruiterAccessGrantRecord({
    id: grant.id,
    metadataJsonOptional: {
      expired_detected_at: new Date().toISOString(),
    },
    status: "expired",
  });
}

async function emitRecruiterProtocolEvent(args: {
  accessGrantIdOptional?: string | null;
  correlationId: string;
  lifecycleState: string;
  messageType: RecruiterA2AMessageType;
  metadataJson?: Record<string, unknown>;
  recruiterCareerIdentityId: string;
  seekerCareerIdentityId: string;
  success?: boolean;
}) {
  const senderAgentId = buildSeekerAgentId(args.seekerCareerIdentityId);
  const receiverAgentId = buildRecruiterAgentId(args.recruiterCareerIdentityId);
  const requestId = `req_${crypto.randomUUID()}`;
  const runId = `run_${crypto.randomUUID()}`;
  const messageId = `msg_${crypto.randomUUID()}`;
  const now = new Date().toISOString();

  await createRecruiterProtocolEventRecord({
    accessGrantIdOptional: args.accessGrantIdOptional ?? null,
    lifecycleState: args.lifecycleState,
    messageType: args.messageType,
    metadataJson: args.metadataJson,
    receiverAgentId,
    recruiterCareerIdentityId: args.recruiterCareerIdentityId,
    requestIdOptional: requestId,
    runIdOptional: runId,
    seekerCareerIdentityId: args.seekerCareerIdentityId,
    senderAgentId,
    success: args.success ?? true,
  });

  await emitA2AProtocolEvent({
    eventName: `recruiter.protocol.${args.messageType}`,
    output: {
      access_grant_id: args.accessGrantIdOptional ?? null,
      lifecycle_state: args.lifecycleState,
      recruiter_career_identity_id: args.recruiterCareerIdentityId,
      seeker_career_identity_id: args.seekerCareerIdentityId,
      ...(args.metadataJson ?? {}),
    },
    protocolContext: {
      completedAt: now,
      messageId,
      operation: args.messageType,
      payloadJson: {
        ...(args.metadataJson ?? {}),
        recruiter_career_identity_id: args.recruiterCareerIdentityId,
        seeker_career_identity_id: args.seekerCareerIdentityId,
      },
      protocolVersion: "a2a.v1",
      receiverAgentId: receiverAgentId as never,
      requestId,
      runId,
      senderAgentId: senderAgentId as never,
      sentAt: now,
      status: args.success === false ? "failed" : "completed",
      taskType: "respond",
      traceId: requestId,
    },
    spanName: `recruiter.protocol.${args.messageType}`,
    tags: ["recruiter_marketplace", `message:${args.messageType}`],
  });
}

async function readMarketplaceCounts() {
  const result = await getDatabasePool().query<{
    employer_count: string;
    job_count: string;
    recruiter_count: string;
  }>(`
      SELECT
        (SELECT COUNT(*)::text FROM employer_partners) AS employer_count,
        (SELECT COUNT(*)::text FROM recruiter_career_identities) AS recruiter_count,
        (SELECT COUNT(*)::text FROM recruiter_owned_jobs) AS job_count
    `);

  return {
    employerPartners: Number(result.rows[0]?.employer_count ?? 0),
    recruiterCareerIdentities: Number(result.rows[0]?.recruiter_count ?? 0),
    recruiterOwnedJobs: Number(result.rows[0]?.job_count ?? 0),
  };
}

export function listSeededRecruiterMarketplaceCompanyNames() {
  return getRecruiterMarketplaceCompanyNames();
}

export async function seedSyntheticRecruiterMarketplace(args?: {
  force?: boolean;
}): Promise<RecruiterAdminSeedSummary> {
  const latest = await findLatestSyntheticDataSeedRunRecord({
    seedKey: RECRUITER_MARKETPLACE_SEED_KEY,
  });

  if (!args?.force && latest?.status === "completed" && latest.seedVersion === RECRUITER_MARKETPLACE_SEED_VERSION) {
    const counts = await readMarketplaceCounts();

    if (counts.employerPartners > 0 && counts.recruiterCareerIdentities > 0 && counts.recruiterOwnedJobs > 0) {
      return {
        employerPartners: counts.employerPartners,
        recruiterCareerIdentities: counts.recruiterCareerIdentities,
        recruiterOwnedJobs: counts.recruiterOwnedJobs,
        seedRun: latest,
      };
    }
  }

  const run = await createSyntheticDataSeedRunRecord({
    seedKey: RECRUITER_MARKETPLACE_SEED_KEY,
    seedVersion: RECRUITER_MARKETPLACE_SEED_VERSION,
    status: "running",
    summaryJson: {
      partner_count: employerPartnerSeedConfig.length,
    },
  });

  let createdCount = 0;
  let updatedCount = 0;

  try {
    for (const [index, partner] of employerPartnerSeedConfig.entries()) {
      const partnerResult = await upsertEmployerPartnerRecord({
        displayName: partner.displayName,
        id: partner.id,
        logoUrlOptional: null,
        slug: partner.slug,
        status: "active",
        websiteUrlOptional: partner.websiteUrl,
      });
      createdCount += partnerResult.created ? 1 : 0;
      updatedCount += partnerResult.updated ? 1 : 0;

      const recruiterSeed = buildRecruiterSeedForEmployerPartner(partner, index);
      const recruiterResult = await upsertRecruiterCareerIdentityRecord({
        agentId: recruiterSeed.agentId,
        bio: recruiterSeed.bio,
        companyName: recruiterSeed.companyName,
        displayName: recruiterSeed.displayName,
        employerPartnerId: recruiterSeed.employerPartnerId,
        id: recruiterSeed.id,
        isSynthetic: true,
        ownershipScopeJson: {
          recruiter_owned_jobs_only: true,
          seed_version: RECRUITER_MARKETPLACE_SEED_VERSION,
        },
        recruiterRoleTitle: recruiterSeed.recruiterRoleTitle,
        status: "active",
        visibility: "public_directory",
      });
      createdCount += recruiterResult.created ? 1 : 0;
      updatedCount += recruiterResult.updated ? 1 : 0;

      const jobSeeds = buildRecruiterOwnedJobsSeed({
        employerPartner: partner,
        partnerIndex: index,
        recruiter: recruiterSeed,
      });

      for (const jobSeed of jobSeeds) {
        const jobResult = await upsertRecruiterOwnedJobRecord({
          compensationCurrency: jobSeed.compensationCurrency,
          compensationMax: jobSeed.compensationMax,
          compensationMin: jobSeed.compensationMin,
          department: jobSeed.department,
          description: jobSeed.description,
          embeddingMetadataJson: {
            embedding_model: null,
            embedding_status: "not_indexed",
          },
          employerPartnerId: jobSeed.employerPartnerId,
          employmentType: jobSeed.employmentType,
          id: jobSeed.id,
          isSynthetic: true,
          location: jobSeed.location,
          preferredQualifications: jobSeed.preferredQualifications,
          qualifications: jobSeed.qualifications,
          recruiterCareerIdentityId: jobSeed.recruiterCareerIdentityId,
          responsibilities: jobSeed.responsibilities,
          retrievalMetadataJson: {
            employer_partner_id: jobSeed.employerPartnerId,
            recruiter_career_identity_id: jobSeed.recruiterCareerIdentityId,
            seed_version: RECRUITER_MARKETPLACE_SEED_VERSION,
            synthetic: true,
          },
          searchableText: jobSeed.searchableText,
          seniority: jobSeed.seniority,
          status: "open",
          title: jobSeed.title,
          visibility: "discoverable",
        });
        createdCount += jobResult.created ? 1 : 0;
        updatedCount += jobResult.updated ? 1 : 0;
      }
    }

    const completedRun = await finalizeSyntheticDataSeedRunRecord({
      createdCount,
      id: run.id,
      status: "completed",
      summaryJson: {
        created_count: createdCount,
        partner_count: employerPartnerSeedConfig.length,
        seed_version: RECRUITER_MARKETPLACE_SEED_VERSION,
        updated_count: updatedCount,
      },
      updatedCount,
    });
    const counts = await readMarketplaceCounts();

    return {
      employerPartners: counts.employerPartners,
      recruiterCareerIdentities: counts.recruiterCareerIdentities,
      recruiterOwnedJobs: counts.recruiterOwnedJobs,
      seedRun: completedRun,
    };
  } catch (error) {
    await finalizeSyntheticDataSeedRunRecord({
      createdCount,
      failedCount: 1,
      id: run.id,
      status: "failed",
      summaryJson: {
        error_message: error instanceof Error ? error.message : String(error),
      },
      updatedCount,
    });
    throw error;
  }
}

export async function ensureSyntheticRecruiterMarketplaceSeeded(args?: {
  force?: boolean;
}) {
  if (!seedPromise || args?.force) {
    seedPromise = seedSyntheticRecruiterMarketplace({
      force: args?.force,
    });
  }

  return seedPromise;
}

export async function listEmployerPartnersForDiscovery() {
  await ensureSyntheticRecruiterMarketplaceSeeded();
  return listEmployerPartnerRecords({ status: "active" });
}

export async function listRecruitersForEmployerPartner(args: {
  employerPartnerId: string;
}) {
  await ensureSyntheticRecruiterMarketplaceSeeded();
  return listRecruiterCareerIdentityRecords({
    employerPartnerId: args.employerPartnerId,
    status: "active",
    visibility: "public_directory",
  });
}

export async function getRecruiterProfileForDiscovery(args: {
  correlationId: string;
  recruiterCareerIdentityId: string;
}) {
  await ensureSyntheticRecruiterMarketplaceSeeded();
  return requireRecruiter({
    correlationId: args.correlationId,
    recruiterCareerIdentityId: args.recruiterCareerIdentityId,
  });
}

async function requireGrantScope(args: {
  correlationId: string;
  recruiter: RecruiterCareerIdentity;
  requiredScope: RecruiterJobPermissionScope;
  seekerCareerIdentityId: string;
}) {
  const grant = await findApprovedRecruiterAccessGrantRecord({
    jobSeekerCareerIdentityId: args.seekerCareerIdentityId,
    recruiterCareerIdentityId: args.recruiter.id,
  });

  if (!grant) {
    await emitRecruiterProtocolEvent({
      correlationId: args.correlationId,
      lifecycleState: "denied",
      messageType: "recruiter_access_denied",
      metadataJson: {
        reason: "missing_approved_grant",
        required_scope: args.requiredScope,
      },
      recruiterCareerIdentityId: args.recruiter.id,
      seekerCareerIdentityId: args.seekerCareerIdentityId,
      success: false,
    });
    logAuditEvent({
      actorId: args.seekerCareerIdentityId,
      actorType: "talent_user",
      correlationId: args.correlationId,
      eventType: "recruiter.permission.denied",
      metadataJson: {
        reason: "missing_approved_grant",
        required_scope: args.requiredScope,
      },
      targetId: args.recruiter.id,
      targetType: "recruiter_career_identity",
    });
    throw new ApiError({
      correlationId: args.correlationId,
      details: {
        recruiterCareerIdentityId: args.recruiter.id,
        requiredScope: args.requiredScope,
      },
      errorCode: "FORBIDDEN",
      message: "Recruiter access is not approved for this seeker.",
      status: 403,
    });
  }

  const normalized = await normalizeGrantLifecycle(grant);

  if (normalized.status !== "approved") {
    await emitRecruiterProtocolEvent({
      accessGrantIdOptional: normalized.id,
      correlationId: args.correlationId,
      lifecycleState: "denied",
      messageType: "recruiter_access_denied",
      metadataJson: {
        grant_status: normalized.status,
        reason: "grant_not_active",
        required_scope: args.requiredScope,
      },
      recruiterCareerIdentityId: args.recruiter.id,
      seekerCareerIdentityId: args.seekerCareerIdentityId,
      success: false,
    });
    throw new ApiError({
      correlationId: args.correlationId,
      details: {
        grantId: normalized.id,
        status: normalized.status,
      },
      errorCode: "FORBIDDEN",
      message: "Recruiter access grant is no longer active.",
      status: 403,
    });
  }

  if (!normalized.grantedScopes.includes(args.requiredScope)) {
    await emitRecruiterProtocolEvent({
      accessGrantIdOptional: normalized.id,
      correlationId: args.correlationId,
      lifecycleState: "denied",
      messageType: "recruiter_access_denied",
      metadataJson: {
        granted_scopes: normalized.grantedScopes,
        reason: "scope_not_granted",
        required_scope: args.requiredScope,
      },
      recruiterCareerIdentityId: args.recruiter.id,
      seekerCareerIdentityId: args.seekerCareerIdentityId,
      success: false,
    });
    logAuditEvent({
      actorId: args.seekerCareerIdentityId,
      actorType: "talent_user",
      correlationId: args.correlationId,
      eventType: "recruiter.permission.denied",
      metadataJson: {
        granted_scopes: normalized.grantedScopes,
        reason: "scope_not_granted",
        required_scope: args.requiredScope,
      },
      targetId: normalized.id,
      targetType: "recruiter_access_grant",
    });
    throw new ApiError({
      correlationId: args.correlationId,
      details: {
        grantedScopes: normalized.grantedScopes,
        requiredScope: args.requiredScope,
      },
      errorCode: "FORBIDDEN",
      message: "Recruiter grant does not include the required scope.",
      status: 403,
    });
  }

  return recruiterAccessGrantSchema.parse(normalized);
}

function shouldAutoApprove(recruiter: RecruiterCareerIdentity) {
  const configured = process.env.CAREER_AI_RECRUITER_AUTO_APPROVE?.trim().toLowerCase();

  if (configured === "false" || configured === "0") {
    return false;
  }

  return recruiter.isSynthetic;
}

export async function requestRecruiterAccess(args: {
  actor: AuthenticatedActor;
  correlationId: string;
  recruiterCareerIdentityId: string;
  requestedScopes: RecruiterJobPermissionScope[];
  requestMessageOptional?: string | null;
}) {
  await ensureSyntheticRecruiterMarketplaceSeeded();
  const recruiter = await requireRecruiter({
    correlationId: args.correlationId,
    recruiterCareerIdentityId: args.recruiterCareerIdentityId,
  });
  const seekerCareerIdentityId = resolveSeekerCareerIdentityId({
    actor: args.actor,
    correlationId: args.correlationId,
  });

  const requestedScopes = uniq(
    (args.requestedScopes.length > 0 ? args.requestedScopes : DEFAULT_RECRUITER_PERMISSION_SCOPES).map(
      (scope) => scope,
    ),
  ) as RecruiterJobPermissionScope[];
  const latest = await findLatestRecruiterAccessGrantRecord({
    jobSeekerCareerIdentityId: seekerCareerIdentityId,
    recruiterCareerIdentityId: recruiter.id,
  });

  if (latest && (latest.status === "pending" || latest.status === "approved")) {
    const normalized = await normalizeGrantLifecycle(latest);
    if (normalized.status === "pending" || normalized.status === "approved") {
      return recruiterAccessGrantSchema.parse(normalized);
    }
  }

  const requestStartedAt = Date.now();
  const pendingGrant = await traceSpan(
    {
      metadata: {
        employer_partner_id: recruiter.employerPartnerId,
        recruiter_career_identity_id: recruiter.id,
        seeker_career_identity_id: seekerCareerIdentityId,
      },
      metrics: () => ({
        latency_ms: Date.now() - requestStartedAt,
      }),
      name: "recruiter.access.requested",
      tags: ["recruiter_marketplace"],
      type: "task",
    },
    () =>
      createRecruiterAccessGrantRecord({
        approvalSource: "seeker_request",
        createdByActorId: args.actor.actorId,
        createdByActorType: args.actor.actorType,
        employerPartnerId: recruiter.employerPartnerId,
        grantedScopes: requestedScopes,
        jobSeekerCareerIdentityId: seekerCareerIdentityId,
        metadataJson: {
          request_message: args.requestMessageOptional ?? null,
        },
        recruiterCareerIdentityId: recruiter.id,
        status: "pending",
      }),
  );

  await emitRecruiterProtocolEvent({
    accessGrantIdOptional: pendingGrant.id,
    correlationId: args.correlationId,
    lifecycleState: "pending",
    messageType: "recruiter_access_request",
    metadataJson: {
      requested_scopes: requestedScopes,
    },
    recruiterCareerIdentityId: recruiter.id,
    seekerCareerIdentityId,
    success: true,
  });

  if (!shouldAutoApprove(recruiter)) {
    return recruiterAccessGrantSchema.parse(pendingGrant);
  }

  const approvedGrant = await traceSpan(
    {
      metadata: {
        access_grant_id: pendingGrant.id,
        recruiter_career_identity_id: recruiter.id,
        seeker_career_identity_id: seekerCareerIdentityId,
      },
      name: "recruiter.access.approved",
      tags: ["recruiter_marketplace"],
      type: "task",
    },
    () =>
      updateRecruiterAccessGrantRecord({
        approvedAt: new Date().toISOString(),
        approvalSourceOptional: "synthetic_policy_auto_approve",
        grantedScopes: requestedScopes,
        id: pendingGrant.id,
        metadataJsonOptional: {
          approval_policy: "synthetic_auto_approve",
        },
        status: "approved",
      }),
  );

  await emitRecruiterProtocolEvent({
    accessGrantIdOptional: approvedGrant.id,
    correlationId: args.correlationId,
    lifecycleState: "approved",
    messageType: "recruiter_access_approved",
    metadataJson: {
      granted_scopes: approvedGrant.grantedScopes,
    },
    recruiterCareerIdentityId: recruiter.id,
    seekerCareerIdentityId,
    success: true,
  });

  return recruiterAccessGrantSchema.parse(approvedGrant);
}

export async function getRecruiterAccessStatus(args: {
  actor: AuthenticatedActor;
  correlationId: string;
  recruiterCareerIdentityId: string;
}) {
  await ensureSyntheticRecruiterMarketplaceSeeded();
  const recruiter = await requireRecruiter({
    correlationId: args.correlationId,
    recruiterCareerIdentityId: args.recruiterCareerIdentityId,
  });
  const seekerCareerIdentityId = resolveSeekerCareerIdentityId({
    actor: args.actor,
    correlationId: args.correlationId,
  });
  const latest = await findLatestRecruiterAccessGrantRecord({
    jobSeekerCareerIdentityId: seekerCareerIdentityId,
    recruiterCareerIdentityId: recruiter.id,
  });
  const normalized = latest ? await normalizeGrantLifecycle(latest) : null;

  return recruiterAccessStatusResponseSchema.parse({
    employerPartnerId: recruiter.employerPartnerId,
    grant: normalized,
    hasAccess: normalized?.status === "approved",
    jobSeekerCareerIdentityId: seekerCareerIdentityId,
    recruiterCareerIdentityId: recruiter.id,
  });
}

export async function listAuthorizedRecruiterJobs(args: {
  actor: AuthenticatedActor;
  correlationId: string;
  recruiterCareerIdentityId: string;
}) {
  await ensureSyntheticRecruiterMarketplaceSeeded();
  const recruiter = await requireRecruiter({
    correlationId: args.correlationId,
    recruiterCareerIdentityId: args.recruiterCareerIdentityId,
  });
  const seekerCareerIdentityId = resolveSeekerCareerIdentityId({
    actor: args.actor,
    correlationId: args.correlationId,
  });
  const grant = await requireGrantScope({
    correlationId: args.correlationId,
    recruiter,
    requiredScope: "view_jobs",
    seekerCareerIdentityId,
  });

  const jobs = await traceSpan(
    {
      metadata: {
        access_grant_id: grant.id,
        employer_partner_id: recruiter.employerPartnerId,
        recruiter_career_identity_id: recruiter.id,
        seeker_career_identity_id: seekerCareerIdentityId,
      },
      name: "recruiter.jobs.listed",
      tags: ["recruiter_marketplace"],
      type: "task",
    },
    () =>
      listRecruiterOwnedJobRecords({
        recruiterCareerIdentityId: recruiter.id,
        statusesOptional: ["open", "on_hold"],
        visibilityOptional: "discoverable",
      }),
  );

  return recruiterJobsListResponseSchema.parse({
    employerPartnerId: recruiter.employerPartnerId,
    jobs,
    recruiterCareerIdentityId: recruiter.id,
  });
}

export async function getAuthorizedRecruiterJob(args: {
  actor: AuthenticatedActor;
  correlationId: string;
  jobId: string;
  recruiterCareerIdentityId: string;
}) {
  await ensureSyntheticRecruiterMarketplaceSeeded();
  const recruiter = await requireRecruiter({
    correlationId: args.correlationId,
    recruiterCareerIdentityId: args.recruiterCareerIdentityId,
  });
  const seekerCareerIdentityId = resolveSeekerCareerIdentityId({
    actor: args.actor,
    correlationId: args.correlationId,
  });

  await requireGrantScope({
    correlationId: args.correlationId,
    recruiter,
    requiredScope: "view_jobs",
    seekerCareerIdentityId,
  });

  const job = await findRecruiterOwnedJobRecordById({
    jobId: args.jobId,
    recruiterCareerIdentityId: recruiter.id,
  });

  if (!job || job.status === "closed" || job.visibility !== "discoverable") {
    throw new ApiError({
      correlationId: args.correlationId,
      details: {
        jobId: args.jobId,
        recruiterCareerIdentityId: recruiter.id,
      },
      errorCode: "NOT_FOUND",
      message: "Recruiter-owned job was not found.",
      status: 404,
    });
  }

  return job;
}

async function loadSeekerSignals(args: {
  correlationId: string;
  seekerCareerIdentityId: string;
}) {
  const context = await findPersistentContextByTalentIdentityId({
    correlationId: args.correlationId,
    talentIdentityId: args.seekerCareerIdentityId,
  });
  const profile = await getPersistentCareerBuilderProfile({
    careerIdentityId: args.seekerCareerIdentityId,
    soulRecordId: context.aggregate.soulRecord.id,
  });
  const evidence = await listPersistentCareerBuilderEvidence({
    careerIdentityId: args.seekerCareerIdentityId,
    soulRecordId: context.aggregate.soulRecord.id,
  });

  const evidenceText = evidence.flatMap((record) => [
    record.sourceOrIssuer,
    record.validationContext,
    record.whyItMatters,
  ]);
  const headline = normalizeText(profile?.careerHeadline ?? "");
  const targetRole = normalizeText(profile?.targetRole ?? "");
  const narrative = normalizeText(profile?.coreNarrative ?? "");
  const skillTerms = uniq(
    [
      ...tokenize(headline),
      ...tokenize(targetRole),
      ...tokenize(narrative),
      ...evidenceText.flatMap((value) => tokenize(value)),
    ].slice(0, 96),
  );

  return {
    headline,
    narrative,
    skillTerms,
    targetRole,
  };
}

function inferSeniorityRank(value: string) {
  const normalized = value.toLowerCase();

  if (/(intern|entry|junior|associate)/.test(normalized)) {
    return 1;
  }
  if (/(mid|ii|intermediate)/.test(normalized)) {
    return 2;
  }
  if (/(senior|sr)/.test(normalized)) {
    return 3;
  }
  if (/(staff|lead)/.test(normalized)) {
    return 4;
  }
  if (/(principal|director|head|vp|chief)/.test(normalized)) {
    return 5;
  }

  return 3;
}

function computeMatch(args: {
  job: RecruiterOwnedJob;
  recruiterCareerIdentityId: string;
  seekerSignals: Awaited<ReturnType<typeof loadSeekerSignals>>;
}): RecruiterCareerMatchResult {
  const jobTitleTokens = tokenize(args.job.title);
  const jobSkillTokens = uniq(
    [
      ...tokenize(args.job.description),
      ...args.job.qualifications.flatMap((value) => tokenize(value)),
      ...args.job.preferredQualifications.flatMap((value) => tokenize(value)),
    ].slice(0, 128),
  );
  const jobSearchTokens = tokenize(args.job.searchableText);
  const seekerTitleTokens = tokenize(`${args.seekerSignals.headline} ${args.seekerSignals.targetRole}`);
  const seekerContextTokens = tokenize(
    `${args.seekerSignals.headline} ${args.seekerSignals.targetRole} ${args.seekerSignals.narrative}`,
  );

  const titleScore = overlapScore(seekerTitleTokens, jobTitleTokens);
  const skillScore = overlapScore(args.seekerSignals.skillTerms, jobSkillTokens);
  const semanticScore = overlapScore(seekerContextTokens, jobSearchTokens);
  const seniorityScore =
    1 -
    Math.min(
      4,
      Math.abs(
        inferSeniorityRank(`${args.seekerSignals.headline} ${args.seekerSignals.targetRole}`) -
          inferSeniorityRank(args.job.seniority ?? ""),
      ),
    ) /
      4;
  const matchedSkills = args.seekerSignals.skillTerms
    .filter((term) => jobSkillTokens.includes(term))
    .slice(0, 8);
  const missingSkills = jobSkillTokens
    .filter((term) => !args.seekerSignals.skillTerms.includes(term))
    .slice(0, 8);
  const score = Math.max(
    0,
    Math.min(1, titleScore * 0.25 + skillScore * 0.4 + semanticScore * 0.2 + seniorityScore * 0.15),
  );

  return recruiterCareerMatchResultSchema.parse({
    fitSummary:
      matchedSkills.length > 0
        ? `Best-fit strengths: ${matchedSkills.slice(0, 4).join(", ")}.`
        : "Potential fit exists, but skill alignment needs improvement.",
    jobId: args.job.id,
    matchedSkills,
    missingSkills,
    rationale: `${args.job.title}: title and skill alignment evaluated against your Career ID context.`,
    recruiterCareerIdentityId: args.recruiterCareerIdentityId,
    score,
  });
}

export async function matchRecruiterJobsAgainstSeekerCareerId(args: {
  actor: AuthenticatedActor;
  correlationId: string;
  limit: number;
  recruiterCareerIdentityId: string;
}) {
  await ensureSyntheticRecruiterMarketplaceSeeded();
  const recruiter = await requireRecruiter({
    correlationId: args.correlationId,
    recruiterCareerIdentityId: args.recruiterCareerIdentityId,
  });
  const seekerCareerIdentityId = resolveSeekerCareerIdentityId({
    actor: args.actor,
    correlationId: args.correlationId,
  });
  const grant = await requireGrantScope({
    correlationId: args.correlationId,
    recruiter,
    requiredScope: "match_against_my_career_id",
    seekerCareerIdentityId,
  });

  await emitRecruiterProtocolEvent({
    accessGrantIdOptional: grant.id,
    correlationId: args.correlationId,
    lifecycleState: "approved",
    messageType: "seeker_authorized_career_id_share",
    metadataJson: {
      shared_context: ["career_profile", "career_evidence"],
    },
    recruiterCareerIdentityId: recruiter.id,
    seekerCareerIdentityId,
    success: true,
  });

  await emitRecruiterProtocolEvent({
    accessGrantIdOptional: grant.id,
    correlationId: args.correlationId,
    lifecycleState: "requested",
    messageType: "recruiter_fit_evaluation_request",
    metadataJson: {
      limit: args.limit,
    },
    recruiterCareerIdentityId: recruiter.id,
    seekerCareerIdentityId,
    success: true,
  });

  const response = await traceSpan(
    {
      metadata: {
        access_grant_id: grant.id,
        employer_partner_id: recruiter.employerPartnerId,
        recruiter_career_identity_id: recruiter.id,
        seeker_career_identity_id: seekerCareerIdentityId,
      },
      name: "recruiter.match.executed",
      tags: ["recruiter_marketplace"],
      type: "task",
    },
    async () => {
      const seekerSignals = await loadSeekerSignals({
        correlationId: args.correlationId,
        seekerCareerIdentityId,
      });
      const jobs = await listRecruiterOwnedJobRecords({
        recruiterCareerIdentityId: recruiter.id,
        statusesOptional: ["open", "on_hold"],
        visibilityOptional: "discoverable",
      });

      const ranked = jobs
        .map((job) =>
          computeMatch({
            job,
            recruiterCareerIdentityId: recruiter.id,
            seekerSignals,
          }),
        )
        .sort((left, right) => right.score - left.score)
        .slice(0, Math.max(1, Math.min(args.limit, 20)));

      return recruiterCareerMatchResponseSchema.parse({
        generatedAt: new Date().toISOString(),
        results: ranked,
        retrievalMode: "recruiter_match",
        recruiterCareerIdentityId: recruiter.id,
      });
    },
  );

  await emitRecruiterProtocolEvent({
    accessGrantIdOptional: grant.id,
    correlationId: args.correlationId,
    lifecycleState: "completed",
    messageType: "recruiter_recommendation_response",
    metadataJson: {
      job_ids: response.results.map((entry) => entry.jobId),
      result_count: response.results.length,
    },
    recruiterCareerIdentityId: recruiter.id,
    seekerCareerIdentityId,
    success: true,
  });

  return response;
}

async function retrieveScopedJobs(args: {
  correlationId: string;
  message: string;
  mode: RecruiterRetrievalMode;
  recruiter: RecruiterCareerIdentity;
  seekerCareerIdentityId: string;
}) {
  const requiredScope = mapModeToScope(args.mode);
  const grant = await requireGrantScope({
    correlationId: args.correlationId,
    recruiter: args.recruiter,
    requiredScope,
    seekerCareerIdentityId: args.seekerCareerIdentityId,
  });

  const jobs = await traceSpan(
    {
      metadata: {
        access_grant_id: grant.id,
        chat_mode: args.mode,
        employer_partner_id: args.recruiter.employerPartnerId,
        recruiter_career_identity_id: args.recruiter.id,
        seeker_career_identity_id: args.seekerCareerIdentityId,
      },
      name: "recruiter.chat.retrieval",
      tags: ["recruiter_marketplace", `mode:${args.mode}`],
      type: "task",
    },
    async () => {
      const candidateJobs = await listRecruiterOwnedJobRecords({
        recruiterCareerIdentityId: args.recruiter.id,
        statusesOptional: ["open", "on_hold"],
        visibilityOptional: "discoverable",
      });
      const queryTokens = tokenize(args.message);

      return candidateJobs
        .map((job) => ({
          job,
          score: overlapScore(queryTokens, tokenize(job.searchableText)),
        }))
        .sort((left, right) => {
          if (right.score === left.score) {
            return right.job.updatedAt.localeCompare(left.job.updatedAt);
          }

          return right.score - left.score;
        })
        .slice(0, 6)
        .map((entry) => entry.job);
    },
  );

  return {
    grant,
    jobs,
  };
}

function buildScopedReply(args: {
  jobs: RecruiterOwnedJob[];
  mode: RecruiterRetrievalMode;
}) {
  if (args.jobs.length === 0) {
    return "I could not find recruiter-owned jobs in your approved scope for that request. Try broadening role, location, or skills.";
  }

  const summary = args.jobs
    .slice(0, 3)
    .map((job) => `${job.title} (${job.location ?? "Location flexible"})`)
    .join("; ");

  if (args.mode === "recruiter_match") {
    return `Within your approved recruiter-match scope, strongest roles are: ${summary}.`;
  }

  if (args.mode === "recruiter_review") {
    return `Within your approved recruiter-review scope, these roles are most relevant: ${summary}.`;
  }

  return `Within your approved recruiter-jobs scope, relevant openings are: ${summary}. This response is grounded only in this recruiter's authorized job inventory.`;
}

export async function sendRecruiterScopedChatMessage(args: {
  actor: AuthenticatedActor;
  conversationIdOptional?: string | null;
  correlationId: string;
  message: string;
  mode: RecruiterRetrievalMode;
  recruiterCareerIdentityId: string;
}) {
  await ensureSyntheticRecruiterMarketplaceSeeded();
  const recruiter = await requireRecruiter({
    correlationId: args.correlationId,
    recruiterCareerIdentityId: args.recruiterCareerIdentityId,
  });
  const seekerCareerIdentityId = resolveSeekerCareerIdentityId({
    actor: args.actor,
    correlationId: args.correlationId,
  });
  const conversationId = args.conversationIdOptional?.trim() ?? null;
  const conversation = conversationId
    ? await findRecruiterConversationRecordById({ id: conversationId })
    : await upsertRecruiterConversationRecord({
        jobSeekerCareerIdentityId: seekerCareerIdentityId,
        recruiterCareerIdentityId: recruiter.id,
        status: "active",
      });

  if (!conversation) {
    throw new ApiError({
      correlationId: args.correlationId,
      details: {
        conversationId,
      },
      errorCode: "NOT_FOUND",
      message: "Recruiter conversation was not found.",
      status: 404,
    });
  }

  if (
    conversation.jobSeekerCareerIdentityId !== seekerCareerIdentityId ||
    conversation.recruiterCareerIdentityId !== recruiter.id
  ) {
    throw new ApiError({
      correlationId: args.correlationId,
      details: {
        conversationId: conversation.id,
      },
      errorCode: "FORBIDDEN",
      message: "Conversation does not belong to this recruiter/seeker pair.",
      status: 403,
    });
  }

  const { grant, jobs } = await retrieveScopedJobs({
    correlationId: args.correlationId,
    message: args.message,
    mode: args.mode,
    recruiter,
    seekerCareerIdentityId,
  });

  if (args.mode === "recruiter_review") {
    await emitRecruiterProtocolEvent({
      accessGrantIdOptional: grant.id,
      correlationId: args.correlationId,
      lifecycleState: "requested",
      messageType: "recruiter_review_request",
      metadataJson: {
        conversation_id: conversation.id,
      },
      recruiterCareerIdentityId: recruiter.id,
      seekerCareerIdentityId,
      success: true,
    });
  }

  const userMessage = await createRecruiterConversationMessageRecord({
    content: args.message,
    conversationId: conversation.id,
    jobSeekerCareerIdentityId: seekerCareerIdentityId,
    metadataJson: {
      mode: args.mode,
    },
    recruiterCareerIdentityId: recruiter.id,
    role: "job_seeker",
  });
  const citations = jobs.slice(0, 4).map((job) => ({
    employerPartnerId: job.employerPartnerId,
    jobId: job.id,
    recruiterCareerIdentityId: job.recruiterCareerIdentityId,
    title: job.title,
  }));

  const assistantMessage = await traceSpan(
    {
      metadata: {
        access_grant_id: grant.id,
        chat_mode: args.mode,
        employer_partner_id: recruiter.employerPartnerId,
        job_ids: citations.map((citation) => citation.jobId),
        recruiter_career_identity_id: recruiter.id,
        seeker_career_identity_id: seekerCareerIdentityId,
      },
      name: "recruiter.chat.response_generated",
      tags: ["recruiter_marketplace", `mode:${args.mode}`],
      type: "task",
    },
    () =>
      createRecruiterConversationMessageRecord({
        citations,
        content: buildScopedReply({
          jobs,
          mode: args.mode,
        }),
        conversationId: conversation.id,
        jobSeekerCareerIdentityId: seekerCareerIdentityId,
        metadataJson: {
          retrieval_boundary: "recruiter_owned_jobs_only",
          retrieved_job_ids: citations.map((citation) => citation.jobId),
        },
        recruiterCareerIdentityId: recruiter.id,
        retrievalMode: args.mode,
        role: "recruiter_agent",
      }),
  );

  await emitRecruiterProtocolEvent({
    accessGrantIdOptional: grant.id,
    correlationId: args.correlationId,
    lifecycleState: "completed",
    messageType: "recruiter_conversation_follow_up",
    metadataJson: {
      conversation_id: conversation.id,
      mode: args.mode,
      retrieved_job_ids: citations.map((citation) => citation.jobId),
    },
    recruiterCareerIdentityId: recruiter.id,
    seekerCareerIdentityId,
    success: true,
  });

  return recruiterChatResponseSchema.parse({
    assistantMessage: recruiterConversationMessageSchema.parse(assistantMessage),
    conversation: recruiterConversationSchema.parse(conversation),
    retrievedJobIds: citations.map((citation) => citation.jobId),
    retrievalMode: args.mode,
    userMessage: recruiterConversationMessageSchema.parse(userMessage),
  });
}

export async function getRecruiterMarketplaceSeedSummary() {
  const latest = await findLatestSyntheticDataSeedRunRecord({
    seedKey: RECRUITER_MARKETPLACE_SEED_KEY,
  });

  if (!latest) {
    return ensureSyntheticRecruiterMarketplaceSeeded();
  }

  const counts = await readMarketplaceCounts();

  return {
    employerPartners: counts.employerPartners,
    recruiterCareerIdentities: counts.recruiterCareerIdentities,
    recruiterOwnedJobs: counts.recruiterOwnedJobs,
    seedRun: latest,
  };
}
