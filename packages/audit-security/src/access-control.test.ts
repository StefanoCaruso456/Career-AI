import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AuthenticatedActor } from "./auth";
import { listAuditEvents, resetAuditStore } from "./audit-store";
import {
  assertAgentToolPermission,
  createScopedAccessRequest,
  grantScopedAccessRequest,
  hasScopedCandidateAccess,
  rejectScopedAccessRequest,
} from "./access-control";
import { ApiError } from "@/packages/contracts/src";
import { provisionGoogleUser } from "@/packages/persistence/src";
import { installTestDatabase, resetTestDatabase } from "@/packages/persistence/src/test-helpers";

describe("access-control service", () => {
  beforeEach(async () => {
    resetAuditStore();
    await resetTestDatabase();
    await installTestDatabase();
  });

  afterEach(async () => {
    await resetTestDatabase();
  });

  async function seedUsers() {
    const recruiter = await provisionGoogleUser({
      correlationId: "corr-recruiter",
      email: "recruiter@example.com",
      emailVerified: true,
      firstName: "Riley",
      fullName: "Riley Recruiter",
      lastName: "Recruiter",
      providerUserId: "provider-recruiter",
    });
    const candidate = await provisionGoogleUser({
      correlationId: "corr-candidate",
      email: "candidate@example.com",
      emailVerified: true,
      firstName: "Casey",
      fullName: "Casey Candidate",
      lastName: "Candidate",
      providerUserId: "provider-candidate",
    });

    const recruiterActor: AuthenticatedActor = {
      actorId: recruiter.context.aggregate.talentIdentity.id,
      actorType: "recruiter_user",
      authMethod: "session",
      identity: {
        appUserId: recruiter.context.user.id,
        authProvider: "google",
        authSource: "nextauth_session",
        email: recruiter.context.user.email,
        id: `user:${recruiter.context.aggregate.talentIdentity.id}`,
        kind: "authenticated_user",
        name: recruiter.context.user.fullName,
        preferredPersona: "employer",
        providerUserId: "provider-recruiter",
        roleType: "recruiter",
        talentIdentityId: recruiter.context.aggregate.talentIdentity.id,
      },
    };
    const candidateActor: AuthenticatedActor = {
      actorId: candidate.context.aggregate.talentIdentity.id,
      actorType: "talent_user",
      authMethod: "session",
      identity: {
        appUserId: candidate.context.user.id,
        authProvider: "google",
        authSource: "nextauth_session",
        email: candidate.context.user.email,
        id: `user:${candidate.context.aggregate.talentIdentity.id}`,
        kind: "authenticated_user",
        name: candidate.context.user.fullName,
        preferredPersona: "job_seeker",
        providerUserId: "provider-candidate",
        roleType: "candidate",
        talentIdentityId: candidate.context.aggregate.talentIdentity.id,
      },
    };

    return {
      candidate,
      candidateActor,
      recruiter,
      recruiterActor,
    };
  }

  it("denies non-recruiter tool access and audits the denial", async () => {
    await expect(
      assertAgentToolPermission({
        agentContext: {
          actor: {
            authSource: "chat_owner_cookie",
            guestSessionId: "guest_123",
            id: "guest:guest_123",
            kind: "guest_user",
            preferredPersona: "job_seeker",
            roleType: null,
          },
          ownerId: "guest:guest_123",
          preferredPersona: "job_seeker",
          roleType: null,
          run: {
            correlationId: "corr-tool-denied",
            runId: "run-tool-denied",
            traceRoot: {
              braintrustRootSpanId: null,
              requestId: null,
              routeName: "http.route.chat.post",
              traceId: null,
            },
          },
        },
        toolName: "search_candidates",
      }),
    ).rejects.toBeInstanceOf(ApiError);

    expect(listAuditEvents()).toContainEqual(
      expect.objectContaining({
        correlation_id: "corr-tool-denied",
        event_type: "security.tool_access.denied",
        target_id: "search_candidates",
      }),
    );
  });

  it("creates and resolves scoped access requests, then grants candidate access", async () => {
    const { candidate, candidateActor, recruiterActor } = await seedUsers();
    const accessRequest = await createScopedAccessRequest({
      actor: recruiterActor,
      correlationId: "corr-access-request",
      justification: "Need private verification details for a final-round interview.",
      scope: "candidate_private_profile",
      subjectTalentIdentityId: candidate.context.aggregate.talentIdentity.id,
    });

    expect(accessRequest.status).toBe("pending");

    const accessGrant = await grantScopedAccessRequest({
      actor: candidateActor,
      correlationId: "corr-access-grant",
      note: "Approved for current loop.",
      requestId: accessRequest.id,
    });

    expect(accessGrant.status).toBe("active");
    await expect(
      hasScopedCandidateAccess({
        actor: recruiterActor,
        correlationId: "corr-access-check",
        scope: "candidate_private_profile",
        subjectTalentIdentityId: candidate.context.aggregate.talentIdentity.id,
      }),
    ).resolves.toBe(true);
  });

  it("rejects access requests when resolved by a non-owner", async () => {
    const { candidate, recruiterActor } = await seedUsers();
    const accessRequest = await createScopedAccessRequest({
      actor: recruiterActor,
      correlationId: "corr-access-request",
      justification: "Need private verification details.",
      scope: "candidate_private_profile",
      subjectTalentIdentityId: candidate.context.aggregate.talentIdentity.id,
    });

    await expect(
      rejectScopedAccessRequest({
        actor: recruiterActor,
        correlationId: "corr-access-reject",
        requestId: accessRequest.id,
      }),
    ).rejects.toBeInstanceOf(ApiError);
  });
});
