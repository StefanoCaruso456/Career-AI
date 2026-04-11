import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEnrichedJobPosting } from "./metadata";

const getJobsFeedSnapshotMock = vi.fn();
const getPersistedJobsFeedSnapshotMock = vi.fn();
const getPersistedJobPostingByIdMock = vi.fn();
const getPersistentCareerBuilderProfileMock = vi.fn();
const findPersistentContextByEmailMock = vi.fn();
const findPersistentContextByTalentIdentityIdMock = vi.fn();
const isDatabaseConfiguredMock = vi.fn();
const recordJobSearchEventMock = vi.fn();
const recordJobValidationEventsMock = vi.fn();

vi.mock("./service", () => ({
  getJobsFeedSnapshot: (...args: unknown[]) => getJobsFeedSnapshotMock(...args),
}));

vi.mock("@/packages/persistence/src", () => ({
  findPersistentContextByEmail: (...args: unknown[]) => findPersistentContextByEmailMock(...args),
  findPersistentContextByTalentIdentityId: (...args: unknown[]) =>
    findPersistentContextByTalentIdentityIdMock(...args),
  getPersistedJobPostingById: (...args: unknown[]) => getPersistedJobPostingByIdMock(...args),
  getPersistedJobsFeedSnapshot: (...args: unknown[]) => getPersistedJobsFeedSnapshotMock(...args),
  getPersistentCareerBuilderProfile: (...args: unknown[]) =>
    getPersistentCareerBuilderProfileMock(...args),
  isDatabaseConfigured: () => isDatabaseConfiguredMock(),
  recordJobSearchEvent: (...args: unknown[]) => recordJobSearchEventMock(...args),
  recordJobValidationEvents: (...args: unknown[]) => recordJobValidationEventsMock(...args),
}));

import { searchJobsCatalog, searchJobsPanel } from "./search";

function createJob(args: {
  companyName: string;
  descriptionSnippet?: string;
  id: string;
  location: string | null;
  salaryText?: string | null;
  sourceLane?: "ats_direct" | "aggregator";
  sourceQuality?: "high_signal" | "coverage";
  title: string;
}) {
  return createEnrichedJobPosting({
    applyUrl: `https://careers.${args.companyName.toLowerCase().replace(/[^a-z0-9]+/g, "")}.com/${args.id}`,
    canonicalJobUrl: `https://careers.${args.companyName.toLowerCase().replace(/[^a-z0-9]+/g, "")}.com/${args.id}`,
    commitment: "Full Time",
    companyName: args.companyName,
    department: "Product",
    descriptionSnippet: args.descriptionSnippet ?? `${args.title} at ${args.companyName}`,
    externalId: args.id,
    id: args.id,
    location: args.location,
    postedAt: "2026-04-10T00:00:00.000Z",
    salaryText: args.salaryText ?? null,
    sourceKey: `${args.sourceLane ?? "ats_direct"}:${args.companyName.toLowerCase()}`,
    sourceLabel: args.companyName,
    sourceLane: args.sourceLane ?? "ats_direct",
    sourceQuality: args.sourceQuality ?? "high_signal",
    title: args.title,
    updatedAt: "2026-04-10T00:00:00.000Z",
  });
}

describe("jobs search service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isDatabaseConfiguredMock.mockReturnValue(false);
    getJobsFeedSnapshotMock.mockResolvedValue({
      generatedAt: "2026-04-10T00:00:00.000Z",
      jobs: [],
      sources: [],
      storage: {
        lastSyncAt: null,
        mode: "ephemeral",
        persistedJobs: 0,
        persistedSources: 0,
      },
      summary: {
        aggregatorJobs: 0,
        connectedSourceCount: 0,
        coverageSourceCount: 0,
        directAtsJobs: 0,
        highSignalSourceCount: 0,
        sourceCount: 0,
        totalJobs: 0,
      },
    });
  });

  it("ranks prompt-aligned direct ATS jobs into the panel response", async () => {
    getJobsFeedSnapshotMock.mockResolvedValue({
      generatedAt: "2026-04-10T00:00:00.000Z",
      jobs: [
        createJob({
          companyName: "OpenAI",
          id: "job_openai_pm",
          location: "Austin, TX",
          title: "Senior Product Manager",
        }),
        createJob({
          companyName: "Cisco",
          id: "job_cisco_sales",
          location: "Remote",
          title: "Account Executive",
        }),
      ],
      sources: [{ key: "greenhouse:openai" }, { key: "workday:cisco" }],
    });

    const result = await searchJobsPanel({
      prompt: "Find senior product manager jobs in Austin",
    });

    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]?.title).toBe("Senior Product Manager");
    expect(result.jobs[0]?.companyName).toBe("OpenAI");
    expect(result.query.filters.location).toBe("Austin");
    expect(result.query.filters.role).toBe("senior product manager");
    expect(result.assistantMessage.toLowerCase()).toContain("senior product manager");
  });

  it("uses Career ID defaults for generic find-jobs prompts when a signed-in profile exists", async () => {
    isDatabaseConfiguredMock.mockReturnValue(true);
    findPersistentContextByTalentIdentityIdMock.mockResolvedValue({
      aggregate: {
        soulRecord: {
          id: "soul_123",
        },
        talentIdentity: {
          id: "talent_123",
        },
      },
      onboarding: {
        profile: {
          headline: "AI Product Manager",
          location: "Chicago, IL",
        },
      },
    });
    getPersistentCareerBuilderProfileMock.mockResolvedValue({
      careerHeadline: "AI Product Manager",
      location: "Chicago, IL",
      targetRole: "Product Manager",
    });
    getPersistedJobsFeedSnapshotMock.mockResolvedValue({
      jobs: [
        createJob({
          companyName: "Anthropic",
          id: "job_anthropic_pm",
          location: "Chicago, IL",
          title: "Product Manager",
        }),
      ],
      sources: [{ key: "greenhouse:anthropic" }],
      storage: {
        lastSyncAt: "2026-04-10T00:00:00.000Z",
        mode: "database",
        persistedJobs: 1,
        persistedSources: 1,
      },
    });

    const result = await searchJobsPanel({
      ownerId: "user:talent_123",
      prompt: "Find new jobs for me",
    });

    expect(result.query.usedCareerIdDefaults).toBe(true);
    expect(result.query.filters.keywords).toEqual([]);
    expect(result.query.filters.location).toBeNull();
    expect(result.query.filters.role).toBeNull();
    expect(result.jobs[0]?.companyName).toBe("Anthropic");
    expect(recordJobSearchEventMock).toHaveBeenCalledTimes(1);
    expect(recordJobValidationEventsMock).toHaveBeenCalledTimes(1);
  });

  it("keeps generic find-jobs prompts broad while ranking by Career ID defaults", async () => {
    isDatabaseConfiguredMock.mockReturnValue(true);
    findPersistentContextByTalentIdentityIdMock.mockResolvedValue({
      aggregate: {
        soulRecord: {
          id: "soul_123",
        },
        talentIdentity: {
          id: "talent_123",
        },
      },
      onboarding: {
        profile: {
          headline: "AI Product Manager",
          location: "Chicago, IL",
        },
      },
    });
    getPersistentCareerBuilderProfileMock.mockResolvedValue({
      careerHeadline: "AI Product Manager",
      location: "Chicago, IL",
      targetRole: "Product Manager",
    });
    getPersistedJobsFeedSnapshotMock.mockResolvedValue({
      jobs: [
        createJob({
          companyName: "Anthropic",
          id: "job_anthropic_pm",
          location: "Chicago, IL",
          title: "Product Manager",
        }),
        createJob({
          companyName: "Salesforce",
          id: "job_salesforce_cs",
          location: "Remote",
          title: "Customer Success Manager",
        }),
      ],
      sources: [{ key: "greenhouse:anthropic" }, { key: "workday:salesforce" }],
      storage: {
        lastSyncAt: "2026-04-10T00:00:00.000Z",
        mode: "database",
        persistedJobs: 2,
        persistedSources: 2,
      },
    });

    const result = await searchJobsPanel({
      ownerId: "user:talent_123",
      prompt: "Find new jobs for me",
    });

    expect(result.totalMatches).toBe(2);
    expect(result.jobs[0]?.companyName).toBe("Anthropic");
    expect(result.jobs[1]?.companyName).toBe("Salesforce");
  });

  it("retrieves semantic role variants and explains why they matched", async () => {
    getJobsFeedSnapshotMock.mockResolvedValue({
      generatedAt: "2026-04-10T00:00:00.000Z",
      jobs: [
        createJob({
          companyName: "OpenAI",
          descriptionSnippet:
            "Lead AI platform roadmap, model launches, and cross-functional product strategy.",
          id: "job_openai_ai_pm",
          location: "Remote",
          title: "Product Manager, AI Platform",
        }),
        createJob({
          companyName: "Anthropic",
          descriptionSnippet:
            "Own product strategy for model experiences, AI tooling, and machine learning launches.",
          id: "job_anthropic_ai_pm",
          location: "Remote",
          title: "AI Product Manager",
        }),
        createJob({
          companyName: "Cisco",
          descriptionSnippet: "Own enterprise account expansion and quota execution.",
          id: "job_cisco_sales",
          location: "Austin, TX",
          title: "Account Executive",
        }),
      ],
      sources: [{ key: "greenhouse:openai" }, { key: "workday:cisco" }],
    });

    const result = await searchJobsCatalog({
      prompt: "Show me AI product jobs",
    });

    expect(
      result.results.slice(0, 2).map((job) => job.title),
    ).toEqual(expect.arrayContaining(["Product Manager, AI Platform", "AI Product Manager"]));
    expect(result.resultQuality).toBe("strong");
    expect(result.queryInterpretation.normalizedRoles).toContain("product manager");
    expect(result.results[0]?.matchReasons?.some((reason) => reason.includes("title aligned"))).toBe(true);
    expect(result.debugMeta.semanticCandidateCount).toBeGreaterThan(0);
  });

  it("broadens a remote-plus-location search once when the initial filter is too strict", async () => {
    getJobsFeedSnapshotMock.mockResolvedValue({
      generatedAt: "2026-04-10T00:00:00.000Z",
      jobs: [
        createJob({
          companyName: "Anthropic",
          descriptionSnippet: "Own remote product work across AI tooling and model launches.",
          id: "job_anthropic_remote_pm",
          location: "Remote",
          title: "Product Manager",
        }),
        createJob({
          companyName: "Cisco",
          descriptionSnippet: "Onsite product role for networking products in Austin.",
          id: "job_cisco_onsite_pm",
          location: "Austin, TX",
          title: "Product Manager",
        }),
      ],
      sources: [{ key: "greenhouse:anthropic" }, { key: "workday:cisco" }],
    });

    const result = await searchJobsCatalog({
      prompt: "Find remote product manager jobs in Austin",
    });

    expect(result.fallbackApplied.applied).toBe(true);
    expect(result.fallbackApplied.reason).toBe("relaxed_location");
    expect(result.results[0]?.companyName).toBe("Anthropic");
    expect(result.results[0]?.workplaceType).toBe("remote");
  });
});
