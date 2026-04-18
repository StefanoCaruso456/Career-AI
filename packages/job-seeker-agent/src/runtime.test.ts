import { describe, expect, it, vi } from "vitest";
import type {
  JobPostingDto,
  JobSearchQueryDto,
  JobSearchRetrievalResultDto,
  JobSeekerProfileContextDto,
} from "@/packages/contracts/src";
import type { SearchWebToolOutput } from "./tool-registry";
import { createJobSeekerAgent } from "./runtime";
import type {
  JobSeekerAgentModel,
  JobSeekerClassifierOutput,
  JobSeekerPlannerOutput,
  JobSeekerToolSet,
} from "./types";

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
      salaryMax: null,
      salaryMin: null,
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
}): JobSearchRetrievalResultDto {
  const query = createQuery(args.prompt, args.query);

  return {
    appliedFilters: {
      ...query.filters,
      limit: args.jobs.length || 8,
      offset: 0,
    },
    debugMeta: {
      candidateCountAfterFiltering: args.totalMatches ?? args.jobs.length,
      candidateCountAfterMerging: args.totalMatches ?? args.jobs.length,
      duplicateCount: 0,
      fallbackApplied: {
        applied: false,
        broadenedFields: [],
        reason: "none" as const,
      },
      filteredOutCount: 0,
      invalidCount: 0,
      lexicalCandidateCount: args.totalMatches ?? args.jobs.length,
      mergedCandidateCount: args.totalMatches ?? args.jobs.length,
      searchLatencyMs: 12,
      semanticCandidateCount: args.totalMatches ?? args.jobs.length,
      sourceCount: 1,
      staleCount: 0,
      structuredCandidateCount: args.totalMatches ?? args.jobs.length,
    },
    diagnostics: {
      duplicateCount: 0,
      filteredOutCount: 0,
      invalidCount: 0,
      searchLatencyMs: 12,
      sourceCount: 1,
      staleCount: 0,
    },
    fallbackApplied: {
      applied: false,
      broadenedFields: [],
      reason: "none" as const,
    },
    generatedAt: "2026-04-10T00:00:00.000Z",
    profileContext: args.profileContext ?? null,
    query,
    queryInterpretation: {
      adjacentRoles: [],
      companyTerms: [],
      employmentType: query.filters.employmentType,
      excludeTerms: [],
      industries: [],
      locations: query.filters.locations,
      normalizedQuery: query.normalizedPrompt,
      normalizedRoles: query.filters.roleFamilies,
      profileSignalsUsed: query.careerIdSignals,
      rankingBoosts: query.filters.rankingBoosts,
      rawQuery: query.prompt,
      remotePreference: query.filters.remotePreference,
      salaryMax: query.filters.salaryMax,
      salaryMin: query.filters.salaryMin,
      semanticThemes: query.filters.keywords,
      seniority: query.filters.seniority,
      skills: query.filters.skills,
      workplaceType: query.filters.workplaceType,
    },
    rankingSummary: {
      scoringVersion: "hybrid_v1",
      topSignals: args.jobs[0]?.matchReasons ?? args.jobs[0]?.matchSignals ?? [],
      weights: {
        employmentType: 0,
        freshness: 0.07,
        industry: 0,
        lexical: 0.18,
        location: 0,
        mismatchPenalty: 0.38,
        profile: 0,
        remotePreference: 0,
        semantic: 0.18,
        seniority: 0,
        skill: 0,
        title: 0.2,
        trust: 0.08,
      },
    },
    resultQuality: args.jobs.length > 0 ? "strong" : "empty",
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
    results: args.jobs,
    returnedCount: args.jobs.length,
    totalCandidateCount: args.totalMatches ?? args.jobs.length,
  };
}

function createModel(overrides?: Partial<JobSeekerAgentModel>): JobSeekerAgentModel {
  const defaultClassification: JobSeekerClassifierOutput = {
    confidence: 0.95,
    extractedFilters: null,
    intent: "job_search",
  };
  const defaultPlan: JobSeekerPlannerOutput = {
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
      salaryMax: null,
      salaryMin: null,
      seniority: null,
      skills: ["python"],
      targetJobId: null,
      workplaceType: "remote",
    },
    selectedTool: "searchJobs",
    shouldUseProfileContext: false,
  };

  return {
    classifyIntent: vi.fn(async () => defaultClassification),
    composeGeneralResponse: vi.fn(async () => "General reply"),
    composeSearchResponse: vi.fn(async () => "Grounded jobs reply"),
    composeWebSearchResponse: vi.fn(async () => "Current market summary"),
    planAction: vi.fn(async () => defaultPlan),
    ...overrides,
  };
}

function createTools(overrides?: Partial<JobSeekerToolSet>): JobSeekerToolSet {
  return {
    browseLatestJobs: vi.fn(async () =>
      createSearchCatalogResult({
        jobs: [
          createJob({
            companyName: "OpenAI",
            id: "job_openai_latest",
            location: "Remote",
            title: "Platform Engineer",
          }),
        ],
        prompt: "latest jobs on our platform",
      }),
    ),
    findSimilarJobs: vi.fn(async () => null),
    getJobById: vi.fn(async () => null),
    getUserCareerProfile: vi.fn(async () => null),
    searchWeb: vi.fn(async (): Promise<SearchWebToolOutput> => ({
      query_used: "hottest jobs in tech | Freshness: month",
      results: [
        {
          snippet: "AI engineers and applied scientists remain in high demand.",
          source: "LinkedIn News",
          title: "AI hiring stays hot",
          url: "https://example.com/linkedin-ai-hiring",
        },
        {
          snippet: "Product, data, and AI roles continue to lead technology hiring.",
          source: "Indeed Hiring Lab",
          title: "Tech job market update",
          url: "https://example.com/indeed-tech-update",
        },
      ],
    })),
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
  it("uses search_web for current external market questions and does not fall back to internal job search", async () => {
    const model = createModel({
      classifyIntent: vi.fn(async () => ({
        confidence: 0.72,
        extractedFilters: null,
        intent: "general_chat" as const,
      })),
    });
    const tools = createTools();
    const agent = createJobSeekerAgent({ model, tools });

    const result = await agent.invoke({
      messages: [{ content: "What are the hottest 10 jobs in tech right now?", role: "user" }],
      userQuery: "What are the hottest 10 jobs in tech right now?",
    });

    expect(tools.searchWeb).toHaveBeenCalledTimes(1);
    expect(tools.searchJobs).not.toHaveBeenCalled();
    expect(result.jobsPanel).toBeNull();
    expect(result.assistantMessage).toContain("Current market summary");
    expect(result.assistantMessage).toContain("Sources:");
  });

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

  it("uses the internal latest-jobs tool for platform-specific freshest inventory questions", async () => {
    const model = createModel({
      classifyIntent: vi.fn(async () => ({
        confidence: 0.76,
        extractedFilters: null,
        intent: "general_chat" as const,
      })),
    });
    const tools = createTools();
    const agent = createJobSeekerAgent({ model, tools });

    const result = await agent.invoke({
      messages: [{ content: "What are the latest jobs on our platform?", role: "user" }],
      userQuery: "What are the latest jobs on our platform?",
    });

    expect(tools.browseLatestJobs).toHaveBeenCalledTimes(1);
    expect(tools.searchWeb).not.toHaveBeenCalled();
    expect(result.jobsPanel?.agent.selectedTool).toBe("browseLatestJobs");
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
      planAction: vi.fn(async (): Promise<JobSeekerPlannerOutput> => ({
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
          salaryMax: null,
          salaryMin: null,
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
      planAction: vi.fn(async (): Promise<JobSeekerPlannerOutput> => ({
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
          salaryMax: null,
          salaryMin: null,
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
              salaryMax: null,
              salaryMin: null,
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

  it("returns weak grounded jobs with a clarification question instead of dropping the jobs panel", async () => {
    const dataEngineerFilters: JobSearchQueryDto["filters"] = {
      companies: [],
      employmentType: null,
      exclusions: [],
      industries: [],
      keywords: ["data", "engineer"],
      location: null,
      locations: [],
      postedWithinDays: null,
      role: "data engineer",
      roleFamilies: ["data engineer"],
      rankingBoosts: ["title_alignment", "trusted_source"],
      remotePreference: null,
      salaryMax: null,
      salaryMin: null,
      seniority: null,
      skills: ["sql"],
      targetJobId: null,
      workplaceType: null,
    };
    const model = createModel({
      planAction: vi.fn(async (): Promise<JobSeekerPlannerOutput> => ({
        clarificationQuestion: null,
        effectivePrompt: "find data engineer roles",
        filters: dataEngineerFilters,
        selectedTool: "searchJobs",
        shouldUseProfileContext: false,
      })),
    });
    const weakResult = createSearchCatalogResult({
      jobs: [
        createJob({
          companyName: "Accenture",
          id: "job_accenture_data_1",
          location: "Hyderabad",
          matchSummary: "partial skill overlap",
          relevanceScore: 0.41,
          title: "Data Platform Engineer",
          workplaceType: "onsite",
        }),
        createJob({
          companyName: "Accenture",
          id: "job_accenture_data_2",
          location: "Bengaluru",
          matchSummary: "adjacent title family",
          relevanceScore: 0.39,
          title: "Data Platform Engineer",
          workplaceType: "onsite",
        }),
      ],
      prompt: "find data engineer roles",
      query: {
        filters: dataEngineerFilters,
      },
    });
    weakResult.resultQuality = "weak";
    const searchJobs = vi.fn<JobSeekerToolSet["searchJobs"]>().mockResolvedValue(weakResult);
    const tools = createTools({ searchJobs });
    const agent = createJobSeekerAgent({ model, tools });

    const result = await agent.invoke({
      messages: [{ content: "find data engineer roles", role: "user" }],
      userQuery: "find data engineer roles",
    });

    expect(searchJobs).toHaveBeenCalledTimes(1);
    expect(result.jobsPanel).not.toBeNull();
    expect(result.jobsPanel?.jobs).toHaveLength(2);
    expect(result.jobsPanel?.agent.terminationReason).toBe("clarification_required");
    expect(result.assistantMessage).toContain(
      "I found a few grounded roles, but the alignment is weaker than I’d like.",
    );
  });

  it("keeps an empty jobs panel with clarification when no grounded matches are found", async () => {
    const dataEngineerFilters: JobSearchQueryDto["filters"] = {
      companies: [],
      employmentType: null,
      exclusions: [],
      industries: [],
      keywords: ["data", "engineer"],
      location: null,
      locations: [],
      postedWithinDays: null,
      role: "data engineer",
      roleFamilies: ["data engineer"],
      rankingBoosts: ["title_alignment", "trusted_source"],
      remotePreference: null,
      salaryMax: null,
      salaryMin: null,
      seniority: null,
      skills: ["sql"],
      targetJobId: null,
      workplaceType: null,
    };
    const model = createModel({
      planAction: vi.fn(async (): Promise<JobSeekerPlannerOutput> => ({
        clarificationQuestion: null,
        effectivePrompt: "find data engineer roles",
        filters: dataEngineerFilters,
        selectedTool: "searchJobs",
        shouldUseProfileContext: false,
      })),
    });
    const emptyResult = createSearchCatalogResult({
      jobs: [],
      prompt: "find data engineer roles",
      query: {
        filters: dataEngineerFilters,
      },
      totalMatches: 0,
    });
    const searchJobs = vi.fn<JobSeekerToolSet["searchJobs"]>().mockResolvedValue(emptyResult);
    const tools = createTools({ searchJobs });
    const agent = createJobSeekerAgent({ model, tools });

    const result = await agent.invoke({
      messages: [{ content: "find data engineer roles", role: "user" }],
      userQuery: "find data engineer roles",
    });

    expect(searchJobs).toHaveBeenCalledTimes(1);
    expect(result.jobsPanel).not.toBeNull();
    expect(result.jobsPanel?.jobs).toHaveLength(0);
    expect(result.jobsPanel?.rail.cards).toHaveLength(0);
    expect(result.jobsPanel?.agent.terminationReason).toBe("clarification_required");
    expect(result.assistantMessage).toContain(
      "I didn’t find grounded job matches for that search in the live inventory yet.",
    );
  });

  it("falls back to a deterministic grounded jobs reply when search-response composition throws", async () => {
    const model = createModel({
      composeSearchResponse: vi.fn(async () => {
        throw new Error("provider timeout");
      }),
    });
    const tools = createTools({
      searchJobs: vi.fn(async () =>
        createSearchCatalogResult({
          jobs: [
            createJob({
              companyName: "OpenAI",
              id: "job_openai_platform",
              location: "Remote",
              matchSummary: "title aligned with the request",
              title: "Software Engineer",
            }),
          ],
          prompt: "find software engineers",
        }),
      ),
    });
    const agent = createJobSeekerAgent({ model, tools });

    const result = await agent.invoke({
      messages: [{ content: "find software engineers", role: "user" }],
      userQuery: "find software engineers",
    });

    expect(result.jobsPanel?.jobs[0]?.title).toBe("Software Engineer");
    expect(result.assistantMessage).toContain("I found grounded matches from the live jobs inventory.");
    expect(result.assistantMessage).toContain("Software Engineer at OpenAI");
  });
});
