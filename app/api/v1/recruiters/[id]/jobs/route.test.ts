import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  createPersistentTalentIdentity,
  upsertPersistentCareerBuilderProfile,
} from "@/packages/persistence/src";
import { installTestDatabase, resetTestDatabase } from "@/packages/persistence/src/test-helpers";
import {
  listEmployerPartnersForDiscovery,
  listRecruitersForEmployerPartner,
  resetRecruiterMarketplaceSeedStateForTests,
  seedSyntheticRecruiterMarketplace,
} from "@/packages/recruiter-marketplace-domain/src";

const mocks = vi.hoisted(() => ({
  actor: null as unknown,
}));

vi.mock("@/packages/audit-security/src", async () => {
  const actual = await vi.importActual<typeof import("@/packages/audit-security/src")>(
    "@/packages/audit-security/src",
  );

  return {
    ...actual,
    resolveVerifiedActor: vi.fn(async () => mocks.actor),
  };
});

import { POST as postAccessRequestRoute } from "../access-requests/route";
import { GET as getJobsRoute } from "./route";

describe("GET /api/v1/recruiters/:id/jobs", () => {
  beforeEach(async () => {
    resetRecruiterMarketplaceSeedStateForTests();
    await resetTestDatabase();
    await installTestDatabase();
    await seedSyntheticRecruiterMarketplace({
      force: true,
    });
  });

  afterEach(async () => {
    await resetTestDatabase();
  });

  async function createSeekerActor() {
    const context = await createPersistentTalentIdentity({
      actorType: "system_service",
      correlationId: "corr-route-seeker",
      countryCode: "US",
      email: `route-seeker-${crypto.randomUUID()}@example.com`,
      firstName: "Jordan",
      lastName: "Seeker",
    });
    const talentIdentityId = context.aggregate.talentIdentity.id;

    await upsertPersistentCareerBuilderProfile({
      careerIdentityId: talentIdentityId,
      input: {
        careerHeadline: "Platform engineer",
        coreNarrative: "Built access-controlled APIs and retrieval systems.",
        legalName: "Jordan Seeker",
        location: "Austin, TX",
        targetRole: "Senior backend engineer",
      },
      soulRecordId: context.aggregate.soulRecord.id,
    });

    return {
      actorId: talentIdentityId,
      actorType: "talent_user" as const,
      authMethod: "session" as const,
      identity: null,
    };
  }

  it("denies recruiter jobs before access grant and allows after approved request", async () => {
    const actor = await createSeekerActor();
    mocks.actor = actor;

    const partners = await listEmployerPartnersForDiscovery();
    const recruiters = await listRecruitersForEmployerPartner({
      employerPartnerId: partners[0]!.id,
    });
    const recruiterCareerIdentityId = recruiters[0]!.id;

    const before = await getJobsRoute(
      new NextRequest(`http://localhost/api/v1/recruiters/${recruiterCareerIdentityId}/jobs`),
      {
        params: Promise.resolve({
          id: recruiterCareerIdentityId,
        }),
      },
    );

    expect(before.status).toBe(403);

    const request = await postAccessRequestRoute(
      new NextRequest(`http://localhost/api/v1/recruiters/${recruiterCareerIdentityId}/access-requests`, {
        body: JSON.stringify({
          requestedScopes: ["view_jobs", "chat_about_jobs", "match_against_my_career_id"],
        }),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      }),
      {
        params: Promise.resolve({
          id: recruiterCareerIdentityId,
        }),
      },
    );

    expect(request.status).toBe(201);

    const after = await getJobsRoute(
      new NextRequest(`http://localhost/api/v1/recruiters/${recruiterCareerIdentityId}/jobs`),
      {
        params: Promise.resolve({
          id: recruiterCareerIdentityId,
        }),
      },
    );

    expect(after.status).toBe(200);
    const payload = (await after.json()) as {
      jobs: Array<{ recruiterCareerIdentityId: string }>;
      recruiterCareerIdentityId: string;
    };
    expect(payload.jobs).toHaveLength(10);
    expect(new Set(payload.jobs.map((job) => job.recruiterCareerIdentityId))).toEqual(
      new Set([payload.recruiterCareerIdentityId]),
    );
  });
});
