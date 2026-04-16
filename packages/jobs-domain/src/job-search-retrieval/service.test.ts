import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEnrichedJobPosting } from "../metadata";

const getJobsFeedSnapshotMock = vi.fn();
const findPersistentContextByEmailMock = vi.fn();
const findPersistentContextByTalentIdentityIdMock = vi.fn();
const getPersistedJobsFeedSnapshotMock = vi.fn();
const getPersistentCareerBuilderProfileMock = vi.fn();
const isDatabaseConfiguredMock = vi.fn();
const recordJobSearchEventMock = vi.fn();

vi.mock("../service", () => ({
  getJobsFeedSnapshot: (...args: unknown[]) => getJobsFeedSnapshotMock(...args),
}));

vi.mock("@/packages/persistence/src", () => ({
  findPersistentContextByEmail: (...args: unknown[]) => findPersistentContextByEmailMock(...args),
  findPersistentContextByTalentIdentityId: (...args: unknown[]) =>
    findPersistentContextByTalentIdentityIdMock(...args),
  getPersistedJobsFeedSnapshot: (...args: unknown[]) => getPersistedJobsFeedSnapshotMock(...args),
  getPersistentCareerBuilderProfile: (...args: unknown[]) =>
    getPersistentCareerBuilderProfileMock(...args),
  isDatabaseConfigured: () => isDatabaseConfiguredMock(),
  recordJobSearchEvent: (...args: unknown[]) => recordJobSearchEventMock(...args),
}));

import { searchJobsCatalogV2 } from "./service";

function createJob(args: {
  companyName: string;
  department?: string | null;
  description?: string;
  id: string;
  location: string | null;
  postedAt: string;
  salaryText?: string | null;
  title: string;
  workplaceType?: "remote" | "hybrid" | "onsite";
}) {
  const location =
    args.workplaceType === "remote"
      ? `${args.location ?? "United States"} Remote`
      : args.workplaceType === "hybrid"
        ? `${args.location ?? "Austin, TX"} Hybrid`
        : args.location;

  return createEnrichedJobPosting({
    applyUrl: `https://jobs.${args.companyName.toLowerCase()}.com/${args.id}`,
    canonicalJobUrl: `https://jobs.${args.companyName.toLowerCase()}.com/${args.id}`,
    commitment: "Full Time",
    companyName: args.companyName,
    department: args.department ?? "Product",
    descriptionSnippet: args.description ?? `${args.title} role working with Python SQL LLM evaluation and data teams.`,
    externalId: args.id,
    id: args.id,
    location,
    postedAt: args.postedAt,
    rawPayload: {
      description: args.description ?? `${args.title} role working with Python SQL LLM evaluation and data teams.`,
      salary: args.salaryText ?? null,
      sponsorship: args.description?.includes("sponsorship") ? "available" : null,
    },
    salaryText: args.salaryText ?? null,
    sourceKey: `greenhouse:${args.companyName.toLowerCase()}`,
    sourceLabel: args.companyName,
    sourceLane: "ats_direct",
    sourceQuality: "high_signal",
    title: args.title,
    updatedAt: args.postedAt,
  });
}

describe("job search retrieval v2", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-16T18:00:00.000Z"));
    isDatabaseConfiguredMock.mockReturnValue(false);
    getPersistedJobsFeedSnapshotMock.mockResolvedValue({
      jobs: [],
      sources: [],
      storage: {
        lastSyncAt: null,
        mode: "database",
        persistedJobs: 0,
        persistedSources: 0,
      },
    });
    getJobsFeedSnapshotMock.mockResolvedValue({
      generatedAt: "2026-04-16T18:00:00.000Z",
      jobs: [
        createJob({
          companyName: "OpenAI",
          id: "job_austin_pm",
          location: "Austin, TX",
          postedAt: "2026-04-15T12:00:00.000Z",
          salaryText: "$185,000 - $230,000 yearly",
          title: "Senior Product Manager",
        }),
        createJob({
          companyName: "NVIDIA",
          department: "Data",
          description: "Hybrid data team role in Austin using Python and SQL.",
          id: "job_austin_data",
          location: "Austin, TX",
          postedAt: "2026-04-16T13:00:00.000Z",
          salaryText: "$190,000 - $220,000 yearly",
          title: "Product Manager",
          workplaceType: "hybrid",
        }),
        createJob({
          companyName: "Anthropic",
          department: "AI Platform",
          description: "Remote AI engineer role with LLM evaluation and Python.",
          id: "job_remote_ai",
          location: "United States",
          postedAt: "2026-04-16T15:00:00.000Z",
          salaryText: "$210,000 - $260,000 yearly",
          title: "AI Engineer",
          workplaceType: "remote",
        }),
        createJob({
          companyName: "Apple",
          id: "job_apple_product",
          location: "Cupertino, CA",
          postedAt: "2026-04-14T10:00:00.000Z",
          salaryText: "$200,000 - $240,000 yearly",
          title: "Product Manager",
        }),
        createJob({
          companyName: "NVIDIA",
          id: "job_nvidia_unknown_salary",
          location: "Remote US",
          postedAt: "2026-04-14T08:00:00.000Z",
          salaryText: null,
          title: "Product Manager",
          workplaceType: "remote",
        }),
        createJob({
          companyName: "Acme",
          department: "Talent",
          description: "Technical recruiter based in Austin metro for onsite partnership.",
          id: "job_recruiter_state",
          location: "Round Rock, TX",
          postedAt: "2026-04-12T09:00:00.000Z",
          salaryText: "$120,000 - $140,000 yearly",
          title: "Technical Recruiter",
        }),
      ],
      sources: [{ key: "greenhouse:openai" }, { key: "greenhouse:anthropic" }],
      storage: {
        lastSyncAt: null,
        mode: "ephemeral",
        persistedJobs: 0,
        persistedSources: 0,
      },
      summary: {
        aggregatorJobs: 0,
        connectedSourceCount: 2,
        coverageSourceCount: 0,
        directAtsJobs: 6,
        highSignalSourceCount: 2,
        sourceCount: 2,
        totalJobs: 6,
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns Austin jobs for new-jobs searches and keeps new jobs distinct from last 24 hours", async () => {
    const newJobs = await searchJobsCatalogV2({
      prompt: "find me new jobs in austin texas",
    });
    const lastDay = await searchJobsCatalogV2({
      prompt: "show me jobs in austin texas from the last 24 hours",
    });

    expect(newJobs.results.some((job) => job.location?.includes("Austin"))).toBe(true);
    expect(newJobs.query.filters.postedWithinDays).toBe(7);
    expect(lastDay.query.filters.postedWithinDays).toBe(1);
    expect(newJobs.searchOutcome?.exactMatchCount).toBeGreaterThanOrEqual(1);
  });

  it("handles remote recency and AI title matching deterministically", async () => {
    const result = await searchJobsCatalogV2({
      prompt: "show me remote ai engineer roles posted in the last 24 hours",
    });

    expect(result.results).toHaveLength(1);
    expect(result.results[0]?.companyName).toBe("Anthropic");
    expect(result.results[0]?.matchReasons).toEqual(
      expect.arrayContaining(["Matched workplace type: remote", "Matched title: AI Engineer"]),
    );
  });

  it("separates known and unknown compensation when salary filtering is relevant", async () => {
    const result = await searchJobsCatalogV2({
      prompt: "find product roles over 180k at apple or nvidia",
    });

    expect(["Apple", "NVIDIA"]).toContain(result.results[0]?.companyName);
    expect(result.searchOutcome?.knownCompensationCount).toBeGreaterThan(0);
    expect(result.searchOutcome?.unknownCompensationCount).toBeGreaterThan(0);
    expect(result.assistantMessage).toContain("salary not listed");
  });

  it("ranks hybrid Austin data team roles with SQL and Python by metadata first", async () => {
    const result = await searchJobsCatalogV2({
      prompt: "show me hybrid jobs in austin with sql and python on data teams",
    });

    expect(result.results[0]?.id).toBe("job_austin_data");
    expect(result.results[0]?.matchReasons).toEqual(
      expect.arrayContaining([
        "Matched required skills: Python, SQL",
        "Matched team: data",
        "Matched workplace type: hybrid",
      ]),
    );
  });

  it("reports widening steps explicitly when exact city matches are sparse", async () => {
    const result = await searchJobsCatalogV2({
      prompt: "show me onsite recruiter jobs in dallas",
    });

    expect(result.searchOutcome?.wideningApplied).toBe(true);
    expect(result.searchOutcome?.wideningSteps.join(" ")).toContain("location:");
    expect(result.searchOutcome?.fallbackMatchCount).toBeGreaterThanOrEqual(0);
  });

  it("explains zero-result searches instead of dead-ending", async () => {
    const result = await searchJobsCatalogV2({
      prompt: "show me principal roles posted today in miami",
    });

    expect(result.results).toHaveLength(0);
    expect(result.searchOutcome?.zeroResultReasons?.length).toBeGreaterThan(0);
    expect(result.assistantMessage).toContain("No grounded job matches were found yet");
  });
});
