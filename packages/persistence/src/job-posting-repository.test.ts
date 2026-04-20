import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getPersistedJobPostingById,
  getPersistedJobsFeedSnapshot,
  persistSourcedJobs,
} from "./job-posting-repository";
import { getDatabasePool } from "./client";
import { installTestDatabase, resetTestDatabase } from "@/packages/persistence/src/test-helpers";

describe("job posting repository", () => {
  beforeEach(async () => {
    await resetTestDatabase();
    await installTestDatabase();
  });

  afterEach(async () => {
    await resetTestDatabase();
  });

  it("persists jobs and dedupes the read model in favor of ATS-direct sources", async () => {
    const syncedAt = "2026-04-09T21:00:00.000Z";

    await persistSourcedJobs({
      syncedAt,
      sources: [
        {
          key: "greenhouse:acme",
          label: "Acme",
          lane: "ats_direct",
          quality: "high_signal",
          status: "connected",
          jobCount: 1,
          endpointLabel: "boards-api.greenhouse.io/acme",
          lastSyncedAt: syncedAt,
          message: "Direct ATS jobs are flowing from Greenhouse.",
        },
        {
          key: "aggregator:primary",
          label: "Coverage API",
          lane: "aggregator",
          quality: "coverage",
          status: "connected",
          jobCount: 1,
          endpointLabel: "https://coverage.example.com/jobs",
          lastSyncedAt: syncedAt,
          message: "Aggregator coverage feed is connected and adding volume.",
        },
      ],
      jobs: [
        {
          id: "greenhouse:acme:101",
          externalId: "101",
          title: "Senior Product Designer",
          companyName: "Acme",
          location: "San Francisco, CA",
          department: "Design",
          commitment: null,
          sourceKey: "greenhouse:acme",
          sourceLabel: "Acme",
          sourceLane: "ats_direct",
          sourceQuality: "high_signal",
          applyUrl: "https://jobs.acme.com/designer",
          postedAt: null,
          updatedAt: "2026-04-09T20:59:00.000Z",
          descriptionSnippet: "Lead visual design across the candidate experience.",
        },
        {
          id: "aggregator:primary:agg-1",
          externalId: "agg-1",
          title: "Senior Product Designer",
          companyName: "Acme",
          location: "San Francisco, CA",
          department: "Design",
          commitment: null,
          sourceKey: "aggregator:primary",
          sourceLabel: "Coverage API",
          sourceLane: "aggregator",
          sourceQuality: "coverage",
          applyUrl: "https://jobs.acme.com/designer",
          postedAt: "2026-04-08T12:00:00.000Z",
          updatedAt: null,
          descriptionSnippet: null,
        },
      ],
    });

    const pool = getDatabasePool();
    const counts = await pool.query<{ job_count: string; source_count: string }>(`
      SELECT
        (SELECT COUNT(*)::text FROM job_postings) AS job_count,
        (SELECT COUNT(*)::text FROM job_sources) AS source_count
    `);
    const snapshot = await getPersistedJobsFeedSnapshot({ limit: 10 });

    expect(Number(counts.rows[0]?.job_count ?? 0)).toBe(2);
    expect(Number(counts.rows[0]?.source_count ?? 0)).toBe(2);
    expect(snapshot.jobs).toHaveLength(1);
    expect(snapshot.jobs[0]?.sourceLane).toBe("ats_direct");
    expect(snapshot.storage.mode).toBe("database");
    expect(snapshot.storage.persistedJobs).toBe(1);
    expect(snapshot.storage.lastSyncAt).toBe(syncedAt);
  });

  it("hydrates applyTarget from the persisted apply_targets row instead of recomputing it from orchestration readiness", async () => {
    const syncedAt = "2026-04-10T21:00:00.000Z";

    await persistSourcedJobs({
      syncedAt,
      sources: [
        {
          key: "greenhouse:acme",
          label: "Acme",
          lane: "ats_direct",
          quality: "high_signal",
          status: "connected",
          jobCount: 1,
          endpointLabel: "boards-api.greenhouse.io/acme",
          lastSyncedAt: syncedAt,
          message: "Direct ATS jobs are flowing from Greenhouse.",
        },
      ],
      jobs: [
        {
          id: "greenhouse:acme:manual-allow",
          externalId: "manual-allow",
          title: "Senior Product Designer",
          companyName: "Acme",
          location: "Remote",
          department: "Design",
          commitment: null,
          sourceKey: "greenhouse:acme",
          sourceLabel: "Acme",
          sourceLane: "ats_direct",
          sourceQuality: "high_signal",
          applyUrl: "https://boards.greenhouse.io/acme/jobs/123",
          canonicalApplyUrl: "https://boards.greenhouse.io/acme/jobs/123",
          orchestrationReadiness: false,
          applyTarget: {
            atsFamily: "greenhouse",
            confidence: 0.95,
            matchedRule: "manual_validation_allowlist",
            routingMode: "queue_autonomous_apply",
            supportReason: "validated_greenhouse_target",
            supportStatus: "supported",
          },
          postedAt: null,
          updatedAt: syncedAt,
          descriptionSnippet: "Lead visual design across the candidate experience.",
        },
      ],
    });

    const snapshot = await getPersistedJobsFeedSnapshot({ limit: 10 });

    expect(snapshot.jobs).toHaveLength(1);
    expect(snapshot.jobs[0]?.orchestrationReadiness).toBe(false);
    expect(snapshot.jobs[0]?.applyTarget).toMatchObject({
      atsFamily: "greenhouse",
      matchedRule: "manual_validation_allowlist",
      routingMode: "queue_autonomous_apply",
      supportReason: "validated_greenhouse_target",
      supportStatus: "supported",
    });
  });

  it("recomputes applyTarget when the persisted apply_targets row is missing at read time", async () => {
    const syncedAt = "2026-04-10T22:00:00.000Z";

    await persistSourcedJobs({
      syncedAt,
      sources: [
        {
          key: "workday:accenture",
          label: "Accenture",
          lane: "ats_direct",
          quality: "high_signal",
          status: "connected",
          jobCount: 1,
          endpointLabel: "accenture.wd103.myworkdayjobs.com/wday/cxs/accenture/AccentureCareers/jobs",
          lastSyncedAt: syncedAt,
          message: "Direct ATS jobs are flowing from Workday.",
        },
      ],
      jobs: [
        {
          id: "workday:accenture:R00289837",
          externalId: "R00289837",
          title: "Fraud Investigations Sr. Analyst",
          companyName: "Accenture",
          location: "Buenos Aires",
          department: null,
          commitment: null,
          sourceKey: "workday:accenture",
          sourceLabel: "Accenture",
          sourceLane: "ats_direct",
          sourceQuality: "high_signal",
          applyUrl:
            "https://accenture.wd103.myworkdayjobs.com/en-US/AccentureCareers/job/Buenos-Aires/Fraud-Process-Automation-Sr-Analyst_R00289837",
          canonicalApplyUrl:
            "https://accenture.wd103.myworkdayjobs.com/en-US/AccentureCareers/job/Buenos-Aires/Fraud-Process-Automation-Sr-Analyst_R00289837",
          orchestrationReadiness: true,
          postedAt: syncedAt,
          updatedAt: syncedAt,
          descriptionSnippet: "Investigate and automate fraud operations workflows.",
        },
      ],
    });

    await getDatabasePool().query("DELETE FROM apply_targets WHERE job_posting_id = $1", [
      "workday:accenture:R00289837",
    ]);

    await expect(
      getPersistedJobPostingById({
        jobId: "workday:accenture:R00289837",
      }),
    ).resolves.toMatchObject({
      applyTarget: {
        atsFamily: "workday",
        routingMode: "queue_autonomous_apply",
        supportStatus: "supported",
      },
      orchestrationReadiness: true,
    });
  });

  it("keeps previously persisted jobs available when a later source sync degrades", async () => {
    const firstSyncAt = "2026-04-09T21:00:00.000Z";
    const secondSyncAt = "2026-04-09T22:00:00.000Z";

    await persistSourcedJobs({
      syncedAt: firstSyncAt,
      sources: [
        {
          key: "greenhouse:acme",
          label: "Acme",
          lane: "ats_direct",
          quality: "high_signal",
          status: "connected",
          jobCount: 1,
          endpointLabel: "boards-api.greenhouse.io/acme",
          lastSyncedAt: firstSyncAt,
          message: "Direct ATS jobs are flowing from Greenhouse.",
        },
      ],
      jobs: [
        {
          id: "greenhouse:acme:101",
          externalId: "101",
          title: "Senior Product Designer",
          companyName: "Acme",
          location: "San Francisco, CA",
          department: "Design",
          commitment: null,
          sourceKey: "greenhouse:acme",
          sourceLabel: "Acme",
          sourceLane: "ats_direct",
          sourceQuality: "high_signal",
          applyUrl: "https://jobs.acme.com/designer",
          postedAt: null,
          updatedAt: "2026-04-09T20:59:00.000Z",
          descriptionSnippet: "Lead visual design across the candidate experience.",
        },
      ],
    });

    await persistSourcedJobs({
      syncedAt: secondSyncAt,
      sources: [
        {
          key: "greenhouse:acme",
          label: "Acme",
          lane: "ats_direct",
          quality: "high_signal",
          status: "degraded",
          jobCount: 0,
          endpointLabel: "boards-api.greenhouse.io/acme",
          lastSyncedAt: secondSyncAt,
          message: "Greenhouse feed could not be loaded: Feed returned 503",
        },
      ],
      jobs: [],
    });

    const snapshot = await getPersistedJobsFeedSnapshot({ limit: 10 });

    expect(snapshot.jobs).toHaveLength(1);
    expect(snapshot.sources[0]?.status).toBe("degraded");
    expect(snapshot.storage.lastSyncAt).toBe(secondSyncAt);
  });

  it("keeps distinct Greenhouse jobs when dedupe fingerprints differ by gh_jid", async () => {
    const syncedAt = "2026-04-11T21:00:00.000Z";

    await persistSourcedJobs({
      syncedAt,
      sources: [
        {
          key: "greenhouse:stripe",
          label: "Stripe",
          lane: "ats_direct",
          quality: "high_signal",
          status: "connected",
          jobCount: 2,
          endpointLabel: "boards-api.greenhouse.io/stripe",
          lastSyncedAt: syncedAt,
          message: "Direct ATS jobs are flowing from Greenhouse.",
        },
      ],
      jobs: [
        {
          id: "greenhouse:stripe:7532733",
          externalId: "7532733",
          title: "Account Executive, AI Sales",
          companyName: "Stripe",
          location: "San Francisco, CA",
          department: "Sales",
          commitment: null,
          sourceKey: "greenhouse:stripe",
          sourceLabel: "Stripe",
          sourceLane: "ats_direct",
          sourceQuality: "high_signal",
          applyUrl: "https://stripe.com/jobs/search?gh_jid=7532733",
          dedupeFingerprint: "https://stripe.com/jobs/search?gh_jid=7532733",
          postedAt: null,
          updatedAt: "2026-04-11T20:59:00.000Z",
          descriptionSnippet: "Grow Stripe's AI revenue.",
        },
        {
          id: "greenhouse:stripe:7746909",
          externalId: "7746909",
          title: "Account Executive, AI Startups - Existing Business",
          companyName: "Stripe",
          location: "New York, NY",
          department: "Sales",
          commitment: null,
          sourceKey: "greenhouse:stripe",
          sourceLabel: "Stripe",
          sourceLane: "ats_direct",
          sourceQuality: "high_signal",
          applyUrl: "https://stripe.com/jobs/search?gh_jid=7746909",
          dedupeFingerprint: "https://stripe.com/jobs/search?gh_jid=7746909",
          postedAt: null,
          updatedAt: "2026-04-11T20:58:00.000Z",
          descriptionSnippet: "Support AI startup customers.",
        },
      ],
    });

    const snapshot = await getPersistedJobsFeedSnapshot({ limit: 10 });

    expect(snapshot.jobs).toHaveLength(2);
    expect(snapshot.jobs.map((job) => job.externalId)).toEqual(["7532733", "7746909"]);
    expect(snapshot.sources[0]?.jobCount).toBe(2);
  });

  it("filters persisted jobs by company name before applying the response limit", async () => {
    const syncedAt = "2026-04-11T22:00:00.000Z";

    await persistSourcedJobs({
      syncedAt,
      sources: [
        {
          key: "greenhouse:cisco",
          label: "Cisco",
          lane: "ats_direct",
          quality: "high_signal",
          status: "connected",
          jobCount: 2,
          endpointLabel: "boards-api.greenhouse.io/cisco",
          lastSyncedAt: syncedAt,
          message: "Cisco public jobs synced and ready to persist.",
        },
        {
          key: "workday:red-hat",
          label: "Red Hat",
          lane: "ats_direct",
          quality: "high_signal",
          status: "connected",
          jobCount: 2,
          endpointLabel: "redhat.wd1.myworkdayjobs.com/en-US/jobs",
          lastSyncedAt: syncedAt,
          message: "Red Hat public jobs synced and ready to persist.",
        },
      ],
      jobs: [
        {
          id: "greenhouse:cisco:1",
          externalId: "1",
          title: "Cisco Role 1",
          companyName: "Cisco",
          location: "Remote",
          department: "Engineering",
          commitment: null,
          sourceKey: "greenhouse:cisco",
          sourceLabel: "Cisco",
          sourceLane: "ats_direct",
          sourceQuality: "high_signal",
          applyUrl: "https://cisco.example/jobs/1",
          postedAt: null,
          updatedAt: "2026-04-11T21:59:00.000Z",
          descriptionSnippet: null,
        },
        {
          id: "greenhouse:cisco:2",
          externalId: "2",
          title: "Cisco Role 2",
          companyName: "Cisco",
          location: "Remote",
          department: "Engineering",
          commitment: null,
          sourceKey: "greenhouse:cisco",
          sourceLabel: "Cisco",
          sourceLane: "ats_direct",
          sourceQuality: "high_signal",
          applyUrl: "https://cisco.example/jobs/2",
          postedAt: null,
          updatedAt: "2026-04-11T21:58:00.000Z",
          descriptionSnippet: null,
        },
        {
          id: "workday:red-hat:1",
          externalId: "redhat-1",
          title: "Red Hat Role 1",
          companyName: "Red Hat",
          location: "Remote",
          department: "Engineering",
          commitment: null,
          sourceKey: "workday:red-hat",
          sourceLabel: "Red Hat",
          sourceLane: "ats_direct",
          sourceQuality: "high_signal",
          applyUrl: "https://redhat.example/jobs/1",
          postedAt: null,
          updatedAt: "2026-04-11T21:57:00.000Z",
          descriptionSnippet: null,
        },
        {
          id: "workday:red-hat:2",
          externalId: "redhat-2",
          title: "Red Hat Role 2",
          companyName: "Red Hat",
          location: "Remote",
          department: "Engineering",
          commitment: null,
          sourceKey: "workday:red-hat",
          sourceLabel: "Red Hat",
          sourceLane: "ats_direct",
          sourceQuality: "high_signal",
          applyUrl: "https://redhat.example/jobs/2",
          postedAt: null,
          updatedAt: "2026-04-11T21:56:00.000Z",
          descriptionSnippet: null,
        },
      ],
    });

    const snapshot = await getPersistedJobsFeedSnapshot({
      companies: ["Red Hat"],
      limit: 1,
    });

    expect(snapshot.jobs).toHaveLength(1);
    expect(snapshot.jobs[0]?.companyName).toBe("Red Hat");
  });
});
