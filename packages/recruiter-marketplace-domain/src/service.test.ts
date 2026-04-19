import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listAuditEvents, resetAuditStore } from "@/packages/audit-security/src";
import {
  createPersistentTalentIdentity,
  listRecruiterProtocolEventRecords,
  upsertPersistentCareerBuilderProfile,
} from "@/packages/persistence/src";
import { installTestDatabase, resetTestDatabase } from "@/packages/persistence/src/test-helpers";
import {
  getRecruiterAccessStatus,
  listAuthorizedRecruiterJobs,
  listEmployerPartnersForDiscovery,
  listRecruitersForEmployerPartner,
  matchRecruiterJobsAgainstSeekerCareerId,
  resetRecruiterMarketplaceSeedStateForTests,
  requestRecruiterAccess,
  seedSyntheticRecruiterMarketplace,
  sendRecruiterScopedChatMessage,
} from "./service";

describe("recruiter marketplace domain service", () => {
  beforeEach(async () => {
    resetRecruiterMarketplaceSeedStateForTests();
    await resetTestDatabase();
    await installTestDatabase();
    resetAuditStore();
  });

  afterEach(async () => {
    await resetTestDatabase();
    resetAuditStore();
  });

  async function createSeeker() {
    const context = await createPersistentTalentIdentity({
      actorType: "system_service",
      correlationId: "corr-seeker",
      countryCode: "US",
      email: `seeker-${crypto.randomUUID()}@example.com`,
      firstName: "Taylor",
      lastName: "Seeker",
    });
    const talentIdentityId = context.aggregate.talentIdentity.id;

    await upsertPersistentCareerBuilderProfile({
      careerIdentityId: talentIdentityId,
      input: {
        careerHeadline: "Senior platform engineer for AI systems",
        coreNarrative:
          "Built retrieval APIs, identity-aware access controls, and recommendation products.",
        legalName: "Taylor Seeker",
        location: "Chicago, IL",
        targetRole: "Staff backend engineer",
      },
      soulRecordId: context.aggregate.soulRecord.id,
    });

    return {
      actor: {
        actorId: talentIdentityId,
        actorType: "talent_user" as const,
        authMethod: "session" as const,
        identity: null,
      },
      talentIdentityId,
    };
  }

  it("seeds employer partners, recruiters, and recruiter-owned jobs idempotently", async () => {
    const firstRun = await seedSyntheticRecruiterMarketplace({
      force: true,
    });

    expect(firstRun.employerPartners).toBe(14);
    expect(firstRun.recruiterCareerIdentities).toBe(14);
    expect(firstRun.recruiterOwnedJobs).toBe(140);
    expect(firstRun.seedRun.status).toBe("completed");

    const secondRun = await seedSyntheticRecruiterMarketplace();

    expect(secondRun.employerPartners).toBe(14);
    expect(secondRun.recruiterCareerIdentities).toBe(14);
    expect(secondRun.recruiterOwnedJobs).toBe(140);
    expect(secondRun.seedRun.status).toBe("completed");
  });

  it("enforces recruiter access grants before job listing and approves synthetic recruiter requests", async () => {
    const { actor, talentIdentityId } = await createSeeker();
    const partners = await listEmployerPartnersForDiscovery();
    const recruiters = await listRecruitersForEmployerPartner({
      employerPartnerId: partners[0]!.id,
    });
    const recruiterCareerIdentityId = recruiters[0]!.id;

    await expect(
      listAuthorizedRecruiterJobs({
        actor,
        correlationId: "corr-jobs-denied",
        recruiterCareerIdentityId,
      }),
    ).rejects.toMatchObject({
      status: 403,
    });

    const deniedAudit = listAuditEvents().find(
      (event) => event.event_type === "recruiter.permission.denied",
    );

    expect(deniedAudit?.metadata_json).toMatchObject({
      reason: "missing_approved_grant",
    });

    const grant = await requestRecruiterAccess({
      actor,
      correlationId: "corr-access-request",
      recruiterCareerIdentityId,
      requestedScopes: ["view_jobs", "chat_about_jobs", "match_against_my_career_id", "request_review"],
    });

    expect(grant.status).toBe("approved");
    expect(grant.jobSeekerCareerIdentityId).toBe(talentIdentityId);

    const status = await getRecruiterAccessStatus({
      actor,
      correlationId: "corr-access-status",
      recruiterCareerIdentityId,
    });

    expect(status.hasAccess).toBe(true);
    expect(status.grant?.status).toBe("approved");

    const protocolEvents = await listRecruiterProtocolEventRecords({
      recruiterCareerIdentityId,
      seekerCareerIdentityId: talentIdentityId,
    });

    expect(protocolEvents.map((event) => event.messageType)).toEqual(
      expect.arrayContaining(["recruiter_access_request", "recruiter_access_approved"]),
    );
    expect(protocolEvents[0]).toMatchObject({
      receiverAgentId: expect.stringContaining(`careerai.agent.recruiter.${recruiterCareerIdentityId}`),
      senderAgentId: expect.stringContaining(`careerai.agent.candidate.${talentIdentityId}`),
    });

    const jobs = await listAuthorizedRecruiterJobs({
      actor,
      correlationId: "corr-jobs-approved",
      recruiterCareerIdentityId,
    });

    expect(jobs.jobs).toHaveLength(10);
    expect(new Set(jobs.jobs.map((job) => job.recruiterCareerIdentityId))).toEqual(
      new Set([recruiterCareerIdentityId]),
    );
  });

  it("produces deterministic recruiter-job matching output for the same seeker", async () => {
    const { actor } = await createSeeker();
    const partners = await listEmployerPartnersForDiscovery();
    const recruiters = await listRecruitersForEmployerPartner({
      employerPartnerId: partners[1]!.id,
    });
    const recruiterCareerIdentityId = recruiters[0]!.id;

    await requestRecruiterAccess({
      actor,
      correlationId: "corr-match-request",
      recruiterCareerIdentityId,
      requestedScopes: ["view_jobs", "chat_about_jobs", "match_against_my_career_id"],
    });

    const first = await matchRecruiterJobsAgainstSeekerCareerId({
      actor,
      correlationId: "corr-match-first",
      limit: 5,
      recruiterCareerIdentityId,
    });
    const second = await matchRecruiterJobsAgainstSeekerCareerId({
      actor,
      correlationId: "corr-match-second",
      limit: 5,
      recruiterCareerIdentityId,
    });

    expect(first.results).toHaveLength(5);
    expect(first.results.map((result) => result.jobId)).toEqual(
      second.results.map((result) => result.jobId),
    );
    expect(first.results.every((result) => result.recruiterCareerIdentityId === recruiterCareerIdentityId)).toBe(
      true,
    );
    expect(first.results[0]!.score).toBeGreaterThanOrEqual(first.results[4]!.score);
  });

  it("keeps recruiter-scoped chat retrieval inside approved recruiter ownership", async () => {
    const { actor } = await createSeeker();
    const partners = await listEmployerPartnersForDiscovery();
    const recruitersA = await listRecruitersForEmployerPartner({
      employerPartnerId: partners[2]!.id,
    });
    const recruitersB = await listRecruitersForEmployerPartner({
      employerPartnerId: partners[3]!.id,
    });
    const recruiterA = recruitersA[0]!;
    const recruiterB = recruitersB[0]!;

    await requestRecruiterAccess({
      actor,
      correlationId: "corr-chat-request-a",
      recruiterCareerIdentityId: recruiterA.id,
      requestedScopes: ["view_jobs", "chat_about_jobs"],
    });

    const chat = await sendRecruiterScopedChatMessage({
      actor,
      correlationId: "corr-chat",
      message: "Which machine learning platform roles are strongest for me?",
      mode: "recruiter_jobs",
      recruiterCareerIdentityId: recruiterA.id,
    });

    expect(chat.retrievedJobIds.length).toBeGreaterThan(0);
    expect(
      chat.assistantMessage.citations.every(
        (citation) => citation.recruiterCareerIdentityId === recruiterA.id,
      ),
    ).toBe(true);

    await expect(
      sendRecruiterScopedChatMessage({
        actor,
        correlationId: "corr-chat-denied",
        message: "Show me your jobs.",
        mode: "recruiter_jobs",
        recruiterCareerIdentityId: recruiterB.id,
      }),
    ).rejects.toMatchObject({
      status: 403,
    });

    const deniedEvents = await listRecruiterProtocolEventRecords({
      recruiterCareerIdentityId: recruiterB.id,
      seekerCareerIdentityId: actor.actorId,
    });

    expect(deniedEvents.map((event) => event.messageType)).toContain("recruiter_access_denied");
  });
});
