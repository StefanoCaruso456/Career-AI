import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  findApplyTargetByJobId,
  upsertApplyTargetForJob,
} from "./apply-target-repository";
import { persistSourcedJobs } from "./job-posting-repository";
import { installTestDatabase, resetTestDatabase } from "./test-helpers";

async function seedJobPosting() {
  await persistSourcedJobs({
    syncedAt: "2026-04-20T03:00:00.000Z",
    sources: [
      {
        endpointLabel: "boards.greenhouse.io/example",
        jobCount: 1,
        key: "greenhouse:example",
        label: "Example",
        lane: "ats_direct",
        lastSyncedAt: "2026-04-20T03:00:00.000Z",
        message: "Direct ATS jobs are flowing from Greenhouse.",
        quality: "high_signal",
        status: "connected",
      },
    ],
    jobs: [
      {
        applyUrl: "https://boards.greenhouse.io/example/jobs/123",
        canonicalApplyUrl: "https://boards.greenhouse.io/example/jobs/123",
        companyName: "Example",
        commitment: null,
        department: "Design",
        descriptionSnippet: "Lead the product design system.",
        externalId: "123",
        id: "job_123",
        location: "Remote",
        orchestrationReadiness: false,
        postedAt: "2026-04-20T02:59:00.000Z",
        sourceKey: "greenhouse:example",
        sourceLabel: "Example",
        sourceLane: "ats_direct",
        sourceQuality: "high_signal",
        title: "Product Designer",
        updatedAt: "2026-04-20T02:59:00.000Z",
      },
    ],
  });
}

describe("apply target repository", () => {
  beforeEach(async () => {
    await resetTestDatabase();
    await installTestDatabase();
    await seedJobPosting();
  });

  afterEach(async () => {
    await resetTestDatabase();
  });

  it("upserts a durable apply target from the current job readiness state", async () => {
    await upsertApplyTargetForJob({
      job: {
        applyUrl: "https://boards.greenhouse.io/example/jobs/123",
        canonicalApplyUrl: "https://boards.greenhouse.io/example/jobs/123",
        id: "job_123",
        orchestrationReadiness: true,
      },
    });

    await expect(
      findApplyTargetByJobId({
        jobId: "job_123",
      }),
    ).resolves.toMatchObject({
      atsFamily: "greenhouse",
      routingMode: "queue_autonomous_apply",
      supportStatus: "supported",
    });
  });

  it("persists an explicit apply target override instead of recomputing it from readiness", async () => {
    await upsertApplyTargetForJob({
      job: {
        applyTarget: {
          atsFamily: "greenhouse",
          confidence: 0.95,
          matchedRule: "manual_validation_allowlist",
          routingMode: "queue_autonomous_apply",
          supportReason: "validated_greenhouse_target",
          supportStatus: "supported",
        },
        applyUrl: "https://boards.greenhouse.io/example/jobs/123",
        canonicalApplyUrl: "https://boards.greenhouse.io/example/jobs/123",
        id: "job_123",
        orchestrationReadiness: false,
      },
    });

    await expect(
      findApplyTargetByJobId({
        jobId: "job_123",
      }),
    ).resolves.toMatchObject({
      matchedRule: "manual_validation_allowlist",
      routingMode: "queue_autonomous_apply",
      supportReason: "validated_greenhouse_target",
      supportStatus: "supported",
    });
  });
});
