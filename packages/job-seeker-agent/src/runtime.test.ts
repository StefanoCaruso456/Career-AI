import { describe, expect, it, vi } from "vitest";
import type {
  JobPostingDto,
  JobSearchQueryDto,
  JobSeekerProfileContextDto,
} from "@/packages/contracts/src";
import { createJobSeekerAgent } from "./runtime";
import type { JobSeekerAgentModel, JobSeekerToolSet } from "./types";

function createJob(args: {
  companyName: string;
  id: string;
  location: string | null;
  matchSummary?: string;
  relevanceScore?: number;
  title: string;
  workplaceType?: JobPostingDto["workplaceType"];
}): JobPostingDto {
  return {
    applyUrl: `https://jobs.example.com/${args.id}`,
    commitment: "Full Time",
    companyName: args.companyName,
    department: "Engineering",
    descriptionSnippet: `${args.title} at ${args.companyName}`,
    externalId: args.id,
    id: args.id,
    location: args.location,
    matchSignals: args.matchSummary ? [args.matchSummary] : ["title aligned with the request"],
    matchSummary: args.matchSummary ?? "title aligned with the request",
    postedAt: "2026-04-10T00:00:00.000Z",
    relevanceScore: args.relevanceScore ?? 0.88,
    sourceKey: "greenhouse:example",
    sourceLabel: "Example jobs",
    sourceLane: "ats_direct",
    sourceQuality: "high_signal",
    title: args.title,
    updatedAt: "2026-04-10T00:00:00.000Z",
    validationStatus: "active_verified",
    workplaceType: args.workplaceType ?? "remote",
  };
}

function createQuery(prompt: string, overrides?: Partial<JobSearchQueryDto>): JobSearchQueryDto {
  return {
    careerIdSignals: [],
    conversationContext: null,
    effectivePrompt: prompt,
    filters: {
      companies: [],
      employmentType: null,
      exclusions: [],
      industries: [],
      keywords: [],
      location: null,
      locations: [],
      postedWithinDays: null,
      role: null,
      roleFamilies: [],
      rankingBoosts: ["title_alignment", "trusted_source"],
      remotePreference: null,
      seniority: null,
      skills: [],
      targetJobId: null,
      workplaceType: null,
    },
    normalizedPrompt: prompt.toLowerCase(),
    prompt,
    usedCareerIdDefaults: false,
    ...overrides,
  };
}

function createSearchCatalogResult(args: {
  jobs: JobPostingDto[];
  profileContext?: JobSeekerProfileContextDto | null;
  prompt: string;
  query?: Partial<JobSearchQueryDto>;
  totalMatches?: number;
}) {
  const query = createQuery(args.prompt, args.query);

  return {
    diagnostics: {
      duplicateCount: 0,
      filteredOutCount: 0,
      invalidCount: 0,
      searchLatencyMs: 12,
      sourceCount: 1,
      staleCount: 0,
    },
    generatedAt: "2026-04-10T00:00:00.000Z",
    jobs: args.jobs,
    panelCount: args.jobs.length,
    profileContext: args.profileContext ?? null,
    query,
    rail: {
      cards: args.jobs.map((job) => ({
        applyUrl: job.applyUrl,
        company: job.companyName,
        jobId: job.id,
        location: job.location,
        matchReason: job.matchSummary ?? "Grounded match from the live jobs inventory.",
        relevanceScore: job.relevanceScore ?? null,
        salaryText: job.salaryText ?? null,
        summary: job.descriptionSnippet ?? null,
        title: job.title,
        workplaceType: job.workplaceType ?? null,
      })),
      emptyState: args.jobs.length > 0 ? null : "No grounded matches found.",
    },
    totalMatches: args.totalMatches ?? args.jobs.length,
  };
}

function createModel(overrides?: Partial<JobSeekerAgentModel>): JobSeekerAgentModel {
  return {
    classifyIntent: vi.fn(async () => ({
      confidence: 0.95,
      extractedFilters: null,
      intent: "job_search",
    })),
    composeGeneralResponse: vi.fn(async () => "General reply"),
    composeSearchResponse: vi.fn(async () => "Grounded jobs reply"),
    planAction: vi.fn(async () => ({
      clarificationQuestion: null,
      effectivePrompt: "Find remote machine learning jobs",
      filters: {
        companies: [],
        employmentType: null,
        exclusions: [],
        industries: [],
        keywords: ["machine", "learning"],
        location: null,
        locations: [],
        postedWithinDays: null,
        role: "machine learning engineer",
        roleFamilies: ["machine learning engineer"],
        rankingBoosts: ["title_alignment", "trusted_source"],
        remotePreference: "remote_only",
        seniority: null,
        skills: ["python"],
        targetJobId: null,
        workplaceType: "remote",
      },
      selectedTool: "searchJobs",
      shouldUseProfileContext: false,
    })),
    ...overrides,
  };
}

function createTools(overrides?: Partial<JobSeekerToolSet>): JobSeekerToolSet {
  return {
    findSimilarJobs: vi.fn(async () => null),
    getJobById: vi.fn(async () => null),
    getUserCareerProfile: vi.fn(async () => null),
    searchJobs: vi.fn(async () =>
      createSearchCatalogResult({
        jobs: [createJob({ companyName: "OpenAI", id: "job_openai_ml", location: "Remote", title: "Machine Learning Engineer" })],
        prompt: "Find remote machine learning jobs",
      }),
    ),
    ...overrides,
  };
}

describe("createJobSeekerAgent", () => {
  it("uses the search tool for job-search requests and returns a grounded jobs panel", async () => {
    const model = createModel();
    const tools = createTools();
    const agent = createJobSeekerAgent({ model, tools });

    const result = await agent.invoke({
      messages: [{ content: "Find remote machine learning jobs", role: "user" }],
      userQuery: "Find remote machine learning jobs",
    });

    expect(tools.searchJobs).toHaveBeenCalledTimes(1);
    expect(result.jobsPanel?.jobs[0]?.title).toBe("Machine Learning Engineer");
    expect(result.jobsPanel?.agent.selectedTool).toBe("searchJobs");
    expect(result.assistantMessage).toBe("Grounded jobs reply");
  });

  it("loads Career ID context before planning a profile-aligned jobs search", async () => {
    const profileContext: JobSeekerProfileContextDto = {
      available: true,
      careerIdentityId: "talent_123",
      headline: "AI Product Manager",
      location: "Chicago, IL",
      signals: ["AI Product Manager", "Chicago, IL"],
      targetRole: "Product Manager",
    };
    const model = createModel({
      planAction: vi.fn(async () => ({
        clarificationQuestion: null,
        effectivePrompt: "Find jobs aligned with my background",
        filters: {
          companies: [],
          employmentType: null,
          exclusions: [],
          industries: [],
          keywords: [],
          location: null,
          locations: [],
          postedWithinDays: null,
          role: null,
          roleFamilies: [],
          rankingBoosts: ["profile_alignment", "trusted_source"],
          remotePreference: null,
          seniority: null,
          skills: [],
          targetJobId: null,
          workplaceType: null,
        },
        selectedTool: "searchJobs",
        shouldUseProfileContext: true,
      })),
    });
    const tools = createTools({
      getUserCareerProfile: vi.fn(async () => profileContext),
      searchJobs: vi.fn(async (input) =>
        createSearchCatalogResult({
          jobs: [createJob({ companyName: "Anthropic", id: "job_anthropic_pm", location: "Chicago, IL", title: "Product Manager" })],
          profileContext: input.profileContext,
          prompt: input.prompt,
          query: {
            careerIdSignals: profileContext.signals,
            usedCareerIdDefaults: true,
          },
        }),
      ),
    });
    const agent = createJobSeekerAgent({ model, tools });

    const result = await agent.invoke({
      messages: [{ content: "Find jobs aligned with my background", role: "user" }],
      ownerId: "user:talent_123",
      userQuery: "Find jobs aligned with my background",
    });

    expect(tools.getUserCareerProfile).toHaveBeenCalledTimes(1);
    expect(tools.searchJobs).toHaveBeenCalledTimes(1);
    expect(result.jobsPanel?.profileContext?.careerIdentityId).toBe("talent_123");
    expect(result.jobsPanel?.query.usedCareerIdDefaults).toBe(true);
  });

  it("broadens once after an empty search result and stops after the refined retry succeeds", async () => {
    const model = createModel({
      planAction: vi.fn(async () => ({
        clarificationQuestion: null,
        effectivePrompt: "Find remote product manager jobs in Austin",
        filters: {
          companies: [],
          employmentType: null,
          exclusions: [],
          industries: [],
          keywords: ["product", "manager"],
          location: "Austin",
          locations: ["Austin"],
          postedWithinDays: null,
          role: "product manager",
          roleFamilies: ["product manager"],
          rankingBoosts: ["title_alignment", "location_alignment", "trusted_source"],
          remotePreference: "remote_only",
          seniority: null,
          skills: [],
          targetJobId: null,
          workplaceType: "remote",
        },
        selectedTool: "searchJobs",
        shouldUseProfileContext: false,
      })),
    });
    const searchJobs = vi
      .fn<JobSeekerToolSet["searchJobs"]>()
      .mockResolvedValueOnce(
        createSearchCatalogResult({
          jobs: [],
          prompt: "Find remote product manager jobs in Austin",
          query: {
            filters: {
              companies: [],
              employmentType: null,
              exclusions: [],
              industries: [],
              keywords: ["product", "manager"],
              location: "Austin",
              locations: ["Austin"],
              postedWithinDays: null,
              role: "product manager",
              roleFamilies: ["product manager"],
              rankingBoosts: ["title_alignment", "location_alignment", "trusted_source"],
              remotePreference: "remote_only",
              seniority: null,
              skills: [],
              targetJobId: null,
              workplaceType: "remote",
            },
          },
          totalMatches: 0,
        }),
      )
      .mockResolvedValueOnce(
        createSearchCatalogResult({
          jobs: [
            createJob({
              companyName: "OpenAI",
              id: "job_openai_pm",
              location: "Remote",
              title: "Product Manager",
            }),
          ],
          prompt: "Find remote roles for product manager",
        }),
      );
    const tools = createTools({
      searchJobs,
    });
    const agent = createJobSeekerAgent({ model, tools });

    const result = await agent.invoke({
      messages: [{ content: "Find remote product manager jobs in Austin", role: "user" }],
      userQuery: "Find remote product manager jobs in Austin",
    });

    expect(searchJobs).toHaveBeenCalledTimes(2);
    expect(result.jobsPanel?.jobs[0]?.companyName).toBe("OpenAI");
    expect(result.jobsPanel?.agent.loopCount).toBe(1);
  });
});
