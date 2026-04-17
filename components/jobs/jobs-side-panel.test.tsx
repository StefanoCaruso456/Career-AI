import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JobPostingDto, JobsPanelResponseDto } from "@/packages/contracts/src";
import { JobsSidePanel } from "./jobs-side-panel";

const mockUseApplicationProfiles = vi.fn();
const mockGetMissingRequiredFieldKeys = vi.fn();

vi.mock("@/components/easy-apply-profile/use-application-profiles", () => ({
  useApplicationProfiles: () => mockUseApplicationProfiles(),
}));

vi.mock("@/lib/application-profiles/validation", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/application-profiles/validation")>();

  return {
    ...actual,
    getMissingRequiredFieldKeys: (...args: unknown[]) => mockGetMissingRequiredFieldKeys(...args),
  };
});

function createJob(
  id: string,
  overrides?: Partial<{
    applyUrl: string;
    canonicalApplyUrl: string;
    company: string;
    employmentType: string | null;
    externalJobId: string | null;
    isOrchestrationReady: boolean;
    location: string | null;
    matchReason: string;
    postedAt: string | null;
    railKey: string;
    relevanceScore: number | null;
    salaryText: string | null;
    sourceKey: string;
    sourceLabel: string;
    sourceType: "ashby" | "greenhouse" | "lever" | "linkedin" | "other" | "workable" | "workday";
    sourceUrl: string;
    summary: string | null;
    title: string;
    validationStatus: "active_verified" | undefined;
    workplaceType: "hybrid" | "onsite" | "remote" | null;
  }>,
) {
  return {
    applyUrl: `https://jobs.example.com/${id}`,
    canonicalApplyUrl: `https://jobs.example.com/${id}`,
    company: "Example",
    employmentType: "Full-time",
    externalJobId: `${id}-req`,
    id,
    isOrchestrationReady: true,
    location: "New York, NY",
    matchReason: "Strong alignment with product design experience.",
    postedAt: "2026-04-12T12:00:00.000Z",
    railKey: `greenhouse:example:${id}`,
    relevanceScore: 0.92,
    salaryText: "$180k - $220k",
    sourceKey: "greenhouse:example",
    sourceLabel: "Example",
    sourceType: "greenhouse" as const,
    sourceUrl: `https://boards.greenhouse.io/example/jobs/${id}`,
    summary: "Lead end-to-end product design for the hiring experience.",
    title: "Product Designer",
    validationStatus: "active_verified" as const,
    workplaceType: "remote" as const,
    ...overrides,
  };
}

function createJobPosting(
  id: string,
  overrides?: Partial<JobPostingDto>,
): JobPostingDto {
  return {
    applyUrl: `https://jobs.example.com/${id}`,
    canonicalApplyUrl: `https://jobs.example.com/${id}`,
    canonicalJobUrl: `https://jobs.example.com/${id}`,
    commitment: "Full-time",
    companyName: "Example",
    department: null,
    descriptionSnippet: "Lead product strategy for the hiring experience.",
    externalId: id,
    externalSourceJobId: `${id}-req`,
    id,
    location: "Remote - United States",
    orchestrationReadiness: true,
    postedAt: "2026-04-12T12:00:00.000Z",
    relevanceScore: 0.91,
    salaryText: "$180k - $220k",
    sourceKey: "greenhouse:example",
    sourceLabel: "Example",
    sourceLane: "ats_direct",
    sourceQuality: "high_signal",
    title: "Growth PM",
    updatedAt: "2026-04-12T12:00:00.000Z",
    validationStatus: "active_verified",
    workplaceType: "remote",
    ...overrides,
  };
}

function createJobsPanelResponse(
  prompt: string,
  jobs: JobPostingDto[],
): JobsPanelResponseDto {
  return {
    assistantMessage: "Here are the strongest live role matches.",
    agent: {
      clarificationQuestion: null,
      intent: "job_search",
      intentConfidence: 1,
      loopCount: 0,
      maxLoops: 0,
      resultQuality: jobs.length > 0 ? "acceptable" : "empty",
      selectedTool: "searchJobs",
      terminationReason: jobs.length > 0 ? "jobs_search_completed" : "jobs_search_completed_empty",
    },
    debugTrace: [],
    diagnostics: {
      duplicateCount: 0,
      filteredOutCount: 0,
      invalidCount: 0,
      searchLatencyMs: 42,
      sourceCount: 1,
      staleCount: 0,
    },
    generatedAt: "2026-04-16T12:00:00.000Z",
    jobs,
    panelCount: jobs.length,
    profileContext: null,
    query: {
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
        rankingBoosts: [],
        remotePreference: null,
        role: "product manager",
        roleFamilies: ["product manager"],
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
    },
    rail: {
      cards: jobs.map((job) => ({
        applyUrl: job.canonicalApplyUrl ?? job.applyUrl,
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
      emptyState: jobs.length === 0 ? "No grounded role matches were found." : null,
      filterOptions: {
        companies: Array.from(new Set(jobs.map((job) => job.companyName))),
        locations: Array.from(
          new Set(jobs.map((job) => job.location).filter((value): value is string => Boolean(value))),
        ),
      },
    },
    searchOutcome: {
      exactMatchCount: jobs.length,
      fallbackMatchCount: 0,
      knownCompensationCount: jobs.filter((job) => Boolean(job.salaryText)).length,
      totalCandidatesBeforeRerank: jobs.length,
      totalResultsReturned: jobs.length,
      unknownCompensationCount: jobs.filter((job) => !job.salaryText).length,
      wideningApplied: false,
      wideningSteps: [],
      zeroResultReasons: [],
    },
    totalMatches: jobs.length,
  };
}

describe("JobsSidePanel", () => {
  beforeEach(() => {
    mockUseApplicationProfiles.mockReturnValue({
      error: null,
      isAuthenticated: true,
      isLoading: false,
      isSaving: false,
      persisted: true,
      profiles: {
        greenhouse_profile: {},
        stripe_profile: {},
        workday_profile: {},
      },
      saveProfile: vi.fn(),
      uploadResume: vi.fn(),
      userKey: "user-1",
    });
    mockGetMissingRequiredFieldKeys.mockReturnValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    mockGetMissingRequiredFieldKeys.mockReset();
    mockUseApplicationProfiles.mockReset();
  });

  it("filters the rail locally and can reset back to the full result set", () => {
    render(
      <JobsSidePanel
        jobs={[
          createJob("job_1"),
          createJob("job_2", {
            company: "Cisco",
            employmentType: "Contract",
            location: "Austin, TX",
            railKey: "workday:cisco:job_2",
            sourceKey: "workday:cisco",
            sourceLabel: "Cisco",
            sourceType: "workday",
            sourceUrl: "https://workday.example.com/cisco/job_2",
            summary: "Build resilient backend systems for recruiting workflows.",
            title: "Backend Engineer",
            workplaceType: "hybrid",
          }),
          createJob("job_3", {
            company: "LinkedIn",
            railKey: "linkedin:linkedin:job_3",
            sourceKey: "linkedin:linkedin",
            sourceLabel: "LinkedIn",
            sourceType: "linkedin",
            sourceUrl: "https://linkedin.com/jobs/view/job_3",
            summary: "Build ML ranking systems for job relevance.",
            title: "ML Engineer",
            workplaceType: "onsite",
          }),
        ]}
      />,
    );

    expect(screen.queryByText("Review roles without leaving Career AI.")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Filter jobs by keyword")).not.toBeInTheDocument();
    expect(screen.queryByText(/jobs browser/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Find NEW Jobs" })).not.toBeInTheDocument();
    expect(screen.queryByText("of 3 roles")).not.toBeInTheDocument();
    expect(screen.getByText("Product Designer")).toBeInTheDocument();
    expect(screen.getByText("Backend Engineer")).toBeInTheDocument();
    expect(screen.getByText("ML Engineer")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /filters/i }));

    expect(screen.getByLabelText("Filter jobs by keyword")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Filter jobs by keyword"), {
      target: { value: "ml" },
    });

    expect(screen.queryByText("Product Designer")).not.toBeInTheDocument();
    expect(screen.queryByText("Backend Engineer")).not.toBeInTheDocument();
    expect(screen.getByText("ML Engineer")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Reset filters" }));

    expect(screen.getByText("Product Designer")).toBeInTheDocument();
    expect(screen.getByText("Backend Engineer")).toBeInTheDocument();
    expect(screen.getByText("ML Engineer")).toBeInTheDocument();
  });

  it("opens job details in-app from the rail and closes without leaving Career AI", async () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

        expect(url).toBe("/api/v1/jobs/job_1/details");

        return new Response(
          JSON.stringify({
            success: true,
            data: {
              id: "job_1",
              title: "Product Designer",
              company: "Example",
              location: "New York, NY",
              employmentType: "Full-time",
              workplaceType: "remote",
              postedAt: "2026-04-12T12:00:00.000Z",
              externalJobId: "req-1",
              source: "greenhouse",
              sourceLabel: "Example",
              sourceUrl: "https://boards.greenhouse.io/example/jobs/123",
              descriptionHtml: "<p>Lead end-to-end product design for the hiring experience.</p>",
              descriptionText: "Lead end-to-end product design for the hiring experience.",
              summary: "Lead end-to-end product design for the hiring experience.",
              responsibilities: ["Own the design system roadmap"],
              qualifications: ["8+ years of product design experience"],
              preferredQualifications: ["Marketplace experience"],
              salaryText: "$180k - $220k",
              metadata: {
                Department: "Design",
              },
              contentStatus: "full",
              fallbackMessage: null,
            },
          }),
          {
            headers: { "content-type": "application/json" },
            status: 200,
          },
        );
      }),
    );

    const { container } = render(
      <JobsSidePanel jobs={[createJob("job_1"), createJob("job_2", { title: "Backend Engineer" })]} />,
    );

    fireEvent.click(screen.getAllByRole("button", { name: "View details" })[0]!);

    const dialog = await screen.findByRole("dialog", { name: "Product Designer" });

    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText("Marketplace experience")).toBeInTheDocument();
    expect(openSpy).not.toHaveBeenCalled();
    expect(container.querySelector('[data-selected="true"]')).not.toBeNull();

    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Product Designer" })).not.toBeInTheDocument();
    });
    expect(container.querySelector('[data-selected="true"]')).toBeNull();
  });

  it("lets the filter dropdown open and close without affecting the underlying list", () => {
    render(<JobsSidePanel jobs={[createJob("job_1"), createJob("job_2", { title: "Backend Engineer" })]} />);

    const trigger = screen.getByRole("button", { name: /filters/i });

    fireEvent.click(trigger);
    expect(screen.getByRole("dialog", { name: "Jobs rail filters" })).toBeInTheDocument();
    expect(screen.queryByText("Source")).not.toBeInTheDocument();
    expect(screen.queryByText("Sort")).not.toBeInTheDocument();

    fireEvent.click(trigger);
    expect(screen.queryByRole("dialog", { name: "Jobs rail filters" })).not.toBeInTheDocument();
    expect(screen.getByText("Product Designer")).toBeInTheDocument();
    expect(screen.getByText("Backend Engineer")).toBeInTheDocument();
  });

  it("scrolls the filter popover into view when the rail is already scrolled", () => {
    render(
      <JobsSidePanel
        jobs={[
          createJob("job_1"),
          createJob("job_2", { title: "Backend Engineer" }),
          createJob("job_3", { title: "ML Engineer" }),
        ]}
      />,
    );

    const railBody = screen.getByTestId("jobs-rail-body") as HTMLDivElement & {
      scrollTo?: (options: { top: number }) => void;
    };
    const scrollTo = vi.fn(({ top }: { top: number }) => {
      railBody.scrollTop = top;
    });

    railBody.scrollTop = 240;
    railBody.scrollTo = scrollTo;

    fireEvent.click(screen.getByRole("button", { name: /filters/i }));

    expect(scrollTo).toHaveBeenCalledWith({ top: 0 });
    expect(screen.getByRole("dialog", { name: "Jobs rail filters" })).toBeInTheDocument();
    expect(railBody.scrollTop).toBe(0);
  });

  it("keeps the filter popover open while interacting with quick filters and dropdowns", () => {
    render(
      <JobsSidePanel
        jobs={[
          createJob("job_1"),
          createJob("job_2", {
            company: "Cisco",
            employmentType: "Contract",
            location: "Austin, TX",
            railKey: "workday:cisco:job_2",
            sourceKey: "workday:cisco",
            sourceLabel: "Cisco",
            sourceType: "workday",
            sourceUrl: "https://workday.example.com/cisco/job_2",
            summary: "Build resilient backend systems for recruiting workflows.",
            title: "Backend Engineer",
            workplaceType: "hybrid",
          }),
        ]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /filters/i }));

    expect(screen.getByRole("dialog", { name: "Jobs rail filters" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Hybrid" }));

    expect(screen.getByRole("dialog", { name: "Jobs rail filters" })).toBeInTheDocument();
    expect(screen.getByText("Backend Engineer")).toBeInTheDocument();
    expect(screen.queryByText("Product Designer")).not.toBeInTheDocument();

    const companySelect = screen.getByLabelText("Company");

    fireEvent.mouseDown(companySelect);
    expect(screen.getByRole("dialog", { name: "Jobs rail filters" })).toBeInTheDocument();

    fireEvent.change(companySelect, {
      target: { value: "Cisco" },
    });

    expect(screen.getByRole("dialog", { name: "Jobs rail filters" })).toBeInTheDocument();
    expect(screen.getByText("Backend Engineer")).toBeInTheDocument();
  });

  it("shows company and location options from the broader filter metadata, not only the rendered cards", () => {
    render(
      <JobsSidePanel
        filterOptions={{
          companies: ["Accenture", "Cisco", "LinkedIn"],
          locations: ["Buenos Aires, Argentina", "London, United Kingdom", "Austin, TX"],
        }}
        jobs={[createJob("job_1", { company: "Accenture", location: "Buenos Aires" })]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /filters/i }));

    const companySelect = screen.getByLabelText("Company");
    const locationSelect = screen.getByLabelText("Location");

    expect(companySelect).toHaveTextContent("Accenture");
    expect(companySelect).toHaveTextContent("Cisco");
    expect(companySelect).toHaveTextContent("LinkedIn");
    expect(locationSelect).toHaveTextContent("Argentina");
    expect(locationSelect).toHaveTextContent("United Kingdom");
    expect(locationSelect).toHaveTextContent("United States");
  });

  it("hydrates a missing salary pill from the job details endpoint for visible roles", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

      expect(url).toBe("/api/v1/jobs/job_1/details");

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            id: "job_1",
            title: "Product Designer",
            company: "Example",
            location: "New York, NY",
            employmentType: "Full-time",
            workplaceType: "remote",
            postedAt: "2026-04-12T12:00:00.000Z",
            externalJobId: "job_1-req",
            source: "workday",
            sourceLabel: "Example",
            sourceUrl: "https://workday.example.com/example/job_1",
            descriptionHtml: "<p>Lead end-to-end product design for the hiring experience.</p>",
            descriptionText: "Lead end-to-end product design for the hiring experience.",
            summary: "Lead end-to-end product design for the hiring experience.",
            responsibilities: [],
            qualifications: [],
            preferredQualifications: [],
            salaryText: "$180,000 - $220,000 a year",
            metadata: null,
            contentStatus: "full",
            fallbackMessage: null,
          },
        }),
        {
          headers: { "content-type": "application/json" },
          status: 200,
        },
      );
    });

    vi.stubGlobal("fetch", fetchMock);

    render(
      <JobsSidePanel
        jobs={[
          createJob("job_1", {
            salaryText: null,
            sourceKey: "workday:example",
            sourceLabel: "Example",
            sourceType: "workday",
            sourceUrl: "https://workday.example.com/example/job_1",
          }),
        ]}
      />,
    );

    expect(await screen.findByText("$180,000 - $220,000 a year")).toBeInTheDocument();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  it("loads company-scoped jobs when the selected company is not already in the rendered rail", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

        expect(url).toBe("/api/v1/jobs?limit=24&company=Cisco");

        return new Response(
          JSON.stringify({
            generatedAt: "2026-04-16T05:00:00.000Z",
            jobs: [
              {
                applyUrl: "https://workday.example.com/cisco/job_2",
                canonicalApplyUrl: "https://workday.example.com/cisco/job_2",
                canonicalJobUrl: "https://workday.example.com/cisco/job_2",
                commitment: "Contract",
                companyName: "Cisco",
                department: null,
                descriptionSnippet: "Build resilient backend systems for recruiting workflows.",
                externalId: "job_2",
                externalSourceJobId: "job_2-req",
                id: "job_2",
                location: "Austin, TX",
                matchReasons: [],
                matchSummary: "Build resilient backend systems for recruiting workflows.",
                orchestrationReadiness: true,
                postedAt: "2026-04-12T12:00:00.000Z",
                relevanceScore: 0.87,
                salaryText: "$120,000 - $140,000 a year",
                sourceLane: "ats_direct",
                sourceKey: "workday:cisco",
                sourceLabel: "Cisco",
                sourceQuality: "high_signal",
                title: "Backend Engineer",
                updatedAt: "2026-04-12T12:00:00.000Z",
                validationStatus: "active_verified",
                workplaceType: "hybrid",
              },
            ],
            sources: [],
            storage: {
              lastSyncAt: "2026-04-16T05:00:00.000Z",
              mode: "database",
              persistedJobs: 1,
              persistedSources: 1,
            },
            summary: {
              aggregatorJobs: 0,
              connectedSourceCount: 1,
              coverageSourceCount: 1,
              directAtsJobs: 1,
              highSignalSourceCount: 1,
              sourceCount: 1,
              totalJobs: 1,
            },
          }),
          {
            headers: { "content-type": "application/json" },
            status: 200,
          },
        );
      }),
    );

    render(
      <JobsSidePanel
        filterOptions={{
          companies: ["Accenture", "Cisco"],
          locations: ["Austin, TX", "Buenos Aires, Argentina"],
        }}
        jobs={[createJob("job_1", { company: "Accenture", location: "Buenos Aires" })]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /filters/i }));

    fireEvent.change(screen.getByLabelText("Company"), {
      target: { value: "Cisco" },
    });

    expect(screen.getByText("Loading Cisco roles from your jobs feed.")).toBeInTheDocument();

    expect(await screen.findByText("Backend Engineer")).toBeInTheDocument();
    expect(screen.queryByText("Product Designer")).not.toBeInTheDocument();
  });

  it("runs a live role search from the keyword filter when the role is not in the local cards", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

      expect(url).toBe("/api/v1/jobs/search");
      expect(init?.method).toBe("POST");

      const body = JSON.parse(String(init?.body)) as { prompt: string };

      expect(body.prompt).toContain("product manager");

      return new Response(
        JSON.stringify(
          createJobsPanelResponse(body.prompt, [
            createJobPosting("job_pm_1", {
              companyName: "Notion",
              descriptionSnippet: "Own growth experiments and product strategy.",
              sourceKey: "greenhouse:notion",
              sourceLabel: "Notion",
              title: "Growth PM",
            }),
          ]),
        ),
        {
          headers: { "content-type": "application/json" },
          status: 200,
        },
      );
    });

    vi.stubGlobal("fetch", fetchMock);

    render(
      <JobsSidePanel
        jobs={[
          createJob("job_1", { title: "Backend Engineer" }),
          createJob("job_2", { title: "ML Engineer" }),
        ]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /filters/i }));
    fireEvent.change(screen.getByLabelText("Filter jobs by keyword"), {
      target: { value: "product manager" },
    });

    expect(screen.getByText('Searching live roles for "product manager".')).toBeInTheDocument();
    expect(await screen.findByText("Growth PM")).toBeInTheDocument();
    expect(screen.queryByText("Backend Engineer")).not.toBeInTheDocument();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });
});
