import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JobsResults } from "@/app/jobs/jobs-results";
import { clearJobDetailsCache } from "@/components/jobs/job-details-client";
import type { JobPostingDto } from "@/packages/contracts/src";

vi.mock("@/components/easy-apply-profile/profile-completion-guard", () => ({
  ProfileCompletionGuard: ({
    applyUrl,
    buttonLabel,
    className,
  }: {
    applyUrl: string;
    buttonLabel: string;
    className?: string;
  }) => (
    <a className={className} href={applyUrl}>
      {buttonLabel}
    </a>
  ),
}));

function createJob(index: number): JobPostingDto {
  return {
    id: `job-${index}`,
    externalId: `external-${index}`,
    title: `Role ${index}`,
    companyName: "Figma",
    location: "San Francisco, CA",
    department: "Sales",
    commitment: "Full-time",
    sourceKey: "greenhouse:figma",
    sourceLabel: "Figma",
    sourceLane: "ats_direct",
    sourceQuality: "high_signal",
    applyUrl: `https://jobs.example.com/${index}`,
    applyTarget: {
      atsFamily: "greenhouse",
      confidence: 0.95,
      matchedRule: "greenhouse_url_signature",
      routingMode: "queue_autonomous_apply",
      supportReason: "supported_ats_family",
      supportStatus: "supported",
    },
    postedAt: "2026-04-09T12:00:00.000Z",
    updatedAt: "2026-04-10T12:00:00.000Z",
    salaryText: "$120,000 - $150,000",
    descriptionSnippet: null,
  };
}

function createJobDetailsResponse(index: number, salaryText: string | null) {
  return new Response(
    JSON.stringify({
      success: true,
      data: {
        id: `job-${index}`,
        title: `Role ${index}`,
        company: "Figma",
        location: "San Francisco, CA",
        employmentType: "Full-time",
        postedAt: "2026-04-10T12:00:00.000Z",
        externalJobId: `external-${index}`,
        source: "greenhouse",
        sourceLabel: "Figma",
        sourceUrl: `https://jobs.example.com/${index}`,
        descriptionHtml: "<p>Read the full role without leaving Career AI.</p>",
        descriptionText: "Read the full role without leaving Career AI.",
        summary: "Read the full role without leaving Career AI.",
        responsibilities: [],
        qualifications: [],
        preferredQualifications: [],
        salaryText,
        metadata: null,
        contentStatus: "full",
        fallbackMessage: null,
      },
    }),
    {
      status: 200,
      headers: { "content-type": "application/json" },
    },
  );
}

describe("JobsResults", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    clearJobDetailsCache();
    window.localStorage.clear();
  });

  it("shows 24 roles first and reveals 29 more when requested", () => {
    const jobs = Array.from({ length: 53 }, (_, index) => createJob(index + 1));

    render(<JobsResults initialTotalAvailableCount={1045} jobs={jobs} />);

    expect(screen.getByText("Showing 24 of 53 matching roles from 53 loaded.")).toBeInTheDocument();
    expect(screen.getByText("1,045 jobs available")).toBeInTheDocument();
    expect(screen.getByText("Role 24")).toBeInTheDocument();
    expect(screen.queryByText("Role 25")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "More..." }));

    expect(screen.getByText("Showing 53 of 53 matching roles from 53 loaded.")).toBeInTheDocument();
    expect(screen.getByText("Role 53")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "More..." })).not.toBeInTheDocument();
  }, 15_000);

  it("shows company options from the full available snapshot, not just the loaded window", () => {
    const jobs = Array.from({ length: 24 }, (_, index) => ({
      ...createJob(index + 1),
      companyName: "Cisco",
      sourceLabel: "Cisco",
    }));

    render(
      <JobsResults
        initialCompanyOptions={["Cisco", "Figma", "Stripe"]}
        initialTotalAvailableCount={1689}
        jobs={jobs}
      />,
    );

    const companySelect = screen.getByLabelText("Company");

    expect(companySelect).toHaveTextContent("All companies");
    expect(companySelect).toHaveTextContent("Cisco");
    expect(companySelect).toHaveTextContent("Figma");
    expect(companySelect).toHaveTextContent("Stripe");
  });

  it("defaults new visitors to USA-only jobs and lets them opt back into global roles", () => {
    const jobs: JobPostingDto[] = [
      {
        ...createJob(1),
        title: "Staff Platform Engineer",
        companyName: "OpenAI",
        sourceLabel: "OpenAI",
        location: "San Francisco, CA",
      },
      {
        ...createJob(2),
        title: "Applied AI Engineer",
        companyName: "Accenture",
        sourceLabel: "Accenture",
        location: "Buenos Aires",
      },
    ];

    render(<JobsResults jobs={jobs} />);

    const usaOnlyToggle = screen.getByRole("checkbox", { name: /usa only/i });

    expect(usaOnlyToggle).toBeChecked();
    expect(screen.getByText("Staff Platform Engineer")).toBeInTheDocument();
    expect(screen.queryByText("Applied AI Engineer")).not.toBeInTheDocument();

    fireEvent.click(usaOnlyToggle);

    expect(usaOnlyToggle).not.toBeChecked();
    expect(screen.getByText("Applied AI Engineer")).toBeInTheDocument();
    expect(window.localStorage.getItem("career-ai.jobs.filters.usa-only")).toBe("false");
  });

  it("restores a saved global-browsing preference for returning visitors", async () => {
    window.localStorage.setItem("career-ai.jobs.filters.usa-only", "false");

    render(
      <JobsResults
        jobs={[
          {
            ...createJob(1),
            title: "Applied AI Engineer",
            companyName: "Accenture",
            sourceLabel: "Accenture",
            location: "Buenos Aires",
          },
        ]}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("checkbox", { name: /usa only/i })).not.toBeChecked();
    });

    expect(screen.getByText("Applied AI Engineer")).toBeInTheDocument();
  });

  it("shows job locations on cards and never renders the source placeholder copy", () => {
    window.localStorage.setItem("career-ai.jobs.filters.usa-only", "false");

    const jobs: JobPostingDto[] = [
      {
        ...createJob(1),
        title: "Fraud Investigations Senior Analyst",
        companyName: "Accenture",
        sourceLabel: "Accenture",
        location: "Buenos Aires",
        department: null,
        commitment: null,
      },
      {
        ...createJob(2),
        title: "Mystery Role",
        companyName: "Accenture",
        sourceLabel: "Accenture",
        location: null,
        department: null,
        commitment: null,
      },
    ];

    render(<JobsResults jobs={jobs} />);

    expect(screen.getByText("Buenos Aires")).toBeInTheDocument();
    expect(screen.queryByText("Details are still coming in from the source.")).not.toBeInTheDocument();
  });

  it("shows a salary pill on listing cards and hides noisy requisition-style locations", () => {
    window.localStorage.setItem("career-ai.jobs.filters.usa-only", "false");

    const jobs: JobPostingDto[] = [
      {
        ...createJob(1),
        companyName: "Accenture",
        sourceLabel: "Accenture",
        title: "Application Support Engineer",
        location: "ATCI-5373735-S1970646",
        department: null,
        commitment: null,
        salaryText: "$120,000 - $150,000 a year",
      },
    ];

    render(<JobsResults jobs={jobs} />);

    expect(screen.getByText("$120,000 - $150,000 a year")).toBeInTheDocument();
    expect(screen.queryByText("ATCI-5373735-S1970646")).not.toBeInTheDocument();
  });

  it("uses truthful apply labels based on autonomous support status", () => {
    render(
      <JobsResults
        jobs={[
          createJob(1),
          {
            ...createJob(2),
            applyTarget: {
              atsFamily: "lever",
              confidence: 0.95,
              matchedRule: "lever_url_signature",
              routingMode: "open_external",
              supportReason: "unsupported_ats_family",
              supportStatus: "unsupported",
            },
          },
        ]}
      />,
    );

    expect(screen.getByText("One-Click Apply")).toBeInTheDocument();
    expect(screen.getByText("Open posting")).toBeInTheDocument();
  });

  it("hydrates missing salary text into the visible listing cards", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

      expect(url).toBe("/api/v1/jobs/job-1/details");

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            id: "job-1",
            title: "Role 1",
            company: "Figma",
            location: "San Francisco, CA",
            employmentType: "Full-time",
            postedAt: "2026-04-10T12:00:00.000Z",
            externalJobId: "external-1",
            source: "greenhouse",
            sourceLabel: "Figma",
            sourceUrl: "https://jobs.example.com/1",
            descriptionHtml: "<p>Read the full role without leaving Career AI.</p>",
            descriptionText: "Read the full role without leaving Career AI.",
            summary: "Read the full role without leaving Career AI.",
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
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    });

    vi.stubGlobal("fetch", fetchMock);

    render(
      <JobsResults
        jobs={[
          {
            ...createJob(1),
            salaryText: null,
          },
        ]}
      />,
    );

    expect(await screen.findByText("$180,000 - $220,000 a year")).toBeInTheDocument();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
  });

  it("hydrates salary details for salary-filtered jobs before ruling them out", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

      expect(url).toBe("/api/v1/jobs/job-1/details");

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            id: "job-1",
            title: "Role 1",
            company: "Figma",
            location: "San Francisco, CA",
            employmentType: "Full-time",
            postedAt: "2026-04-10T12:00:00.000Z",
            externalJobId: "external-1",
            source: "greenhouse",
            sourceLabel: "Figma",
            sourceUrl: "https://jobs.example.com/1",
            descriptionHtml: "<p>Read the full role without leaving Career AI.</p>",
            descriptionText: "Read the full role without leaving Career AI.",
            summary: "Read the full role without leaving Career AI.",
            responsibilities: [],
            qualifications: [],
            preferredQualifications: [],
            salaryText: "$220,000 - $240,000 a year",
            metadata: null,
            contentStatus: "full",
            fallbackMessage: null,
          },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    });

    vi.stubGlobal("fetch", fetchMock);

    render(
      <JobsResults
        jobs={[
          {
            ...createJob(1),
            salaryText: null,
          },
        ]}
      />,
    );

    fireEvent.change(screen.getByLabelText("Salary range"), {
      target: { value: "200k-250k" },
    });

    expect(await screen.findByText("Showing 1 of 1 matching role from 1 loaded.")).toBeInTheDocument();
    expect(screen.getByText("Role 1")).toBeInTheDocument();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
  });

  it("hydrates unparseable salary text before ruling jobs out", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

      expect(url).toBe("/api/v1/jobs/job-1/details");

      return createJobDetailsResponse(1, "$160,000 - $175,000 a year");
    });

    vi.stubGlobal("fetch", fetchMock);

    render(
      <JobsResults
        jobs={[
          {
            ...createJob(1),
            salaryText: "Compensation depends on level and location.",
          },
        ]}
      />,
    );

    fireEvent.change(screen.getByLabelText("Salary range"), {
      target: { value: "150k-200k" },
    });

    expect(await screen.findByText("Showing 1 of 1 matching role from 1 loaded.")).toBeInTheDocument();
    expect(screen.getByText("Role 1")).toBeInTheDocument();
    expect(screen.getByText("$160,000 - $175,000 a year")).toBeInTheDocument();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
  });

  it("keeps hydrating salary details until a later matching job is found", async () => {
    const jobs = Array.from({ length: 60 }, (_, index) => ({
      ...createJob(index + 1),
      salaryText: null,
    }));
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const jobId = Number.parseInt(url.match(/job-(\d+)/)?.[1] ?? "0", 10);

      return createJobDetailsResponse(
        jobId,
        jobId === 56 ? "$170,000 - $190,000 a year" : null,
      );
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<JobsResults initialCount={1} jobs={jobs} />);

    fireEvent.change(screen.getByLabelText("Salary range"), {
      target: { value: "150k-200k" },
    });

    expect(await screen.findByText("Role 56")).toBeInTheDocument();
    expect(screen.getByText("Showing 1 of 1 matching role from 60 loaded.")).toBeInTheDocument();

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([input]) => {
        const url =
          typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

        return url === "/api/v1/jobs/job-56/details";
      })).toBe(true);
    });
  });

  it("shows a salary hydration search state before declaring no matches", async () => {
    let resolveFetch: ((response: Response) => void) | null = null;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );

    vi.stubGlobal("fetch", fetchMock);

    render(
      <JobsResults
        jobs={[
          {
            ...createJob(1),
            salaryText: null,
          },
        ]}
      />,
    );

    fireEvent.change(screen.getByLabelText("Salary range"), {
      target: { value: "150k-200k" },
    });

    expect(await screen.findByText("Checking salary details for matching roles.")).toBeInTheDocument();
    expect(screen.queryByText("No roles match the current filters.")).not.toBeInTheDocument();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    resolveFetch?.(createJobDetailsResponse(1, null));

    expect(await screen.findByText("No roles match the current filters.")).toBeInTheDocument();
  });

  it("opens a reusable in-app details modal from the job cards", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

        expect(url).toBe("/api/v1/jobs/job-1/details");

        return new Response(
          JSON.stringify({
            success: true,
            data: {
              id: "job-1",
              title: "Role 1",
              company: "Figma",
              location: "San Francisco, CA",
              employmentType: "Full-time",
              postedAt: "2026-04-10T12:00:00.000Z",
              externalJobId: "external-1",
              source: "greenhouse",
              sourceLabel: "Figma",
              sourceUrl: "https://jobs.example.com/1",
              descriptionHtml: "<p>Read the full role without leaving Career AI.</p>",
              descriptionText: "Read the full role without leaving Career AI.",
              summary: "Read the full role without leaving Career AI.",
              responsibilities: ["Guide end-to-end product direction"],
              qualifications: [],
              preferredQualifications: [],
              salaryText: "$120,000 - $150,000",
              metadata: null,
              contentStatus: "full",
              fallbackMessage: null,
            },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }),
    );

    render(<JobsResults jobs={[createJob(1)]} />);

    fireEvent.click(screen.getByRole("button", { name: "View details" }));

    expect(await screen.findByRole("dialog", { name: "Role 1" })).toBeInTheDocument();
    expect(await screen.findByText("Guide end-to-end product direction")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open original post/i })).toBeInTheDocument();
  });

  it("loads company-filtered results directly instead of hydrating the full catalog", async () => {
    const initialJobs = Array.from({ length: 24 }, (_, index) => ({
      ...createJob(index + 1),
      companyName: "Cisco",
      sourceKey: "greenhouse:cisco",
      sourceLabel: "Cisco",
    }));
    const redHatJobs = Array.from({ length: 3 }, (_, index) => ({
      ...createJob(index + 1),
      companyName: "Red Hat",
      sourceKey: "workday:red-hat",
      sourceLabel: "Red Hat",
      title: `Red Hat Role ${index + 1}`,
    }));

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

        expect(url).toBe("/api/v1/jobs?limit=3&company=Red+Hat");

        return new Response(
          JSON.stringify({
            generatedAt: "2026-04-11T12:45:00.000Z",
            jobs: redHatJobs,
            sources: [
              {
                key: "workday:red-hat",
                label: "Red Hat",
                lane: "ats_direct",
                quality: "high_signal",
                status: "connected",
                jobCount: redHatJobs.length,
                endpointLabel: "redhat.wd1.myworkdayjobs.com/en-US/jobs",
                lastSyncedAt: "2026-04-11T12:45:00.000Z",
                message: "Red Hat public jobs synced and ready to persist.",
              },
            ],
            summary: {
              totalJobs: redHatJobs.length,
              directAtsJobs: redHatJobs.length,
              aggregatorJobs: 0,
              sourceCount: 1,
              connectedSourceCount: 1,
              highSignalSourceCount: 1,
              coverageSourceCount: 0,
            },
            storage: {
              mode: "database",
              persistedJobs: redHatJobs.length,
              persistedSources: 1,
              lastSyncAt: "2026-04-11T12:45:00.000Z",
            },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }),
    );

    render(
      <JobsResults
        initialCompanyOptions={["Cisco", "Red Hat"]}
        initialRequestLimit={24}
        initialSources={[
          {
            key: "greenhouse:cisco",
            label: "Cisco",
            lane: "ats_direct",
            quality: "high_signal",
            status: "connected",
            jobCount: 24,
            endpointLabel: "boards-api.greenhouse.io/cisco",
            lastSyncedAt: "2026-04-11T12:45:00.000Z",
            message: "Cisco public jobs synced and ready to persist.",
          },
          {
            key: "workday:red-hat",
            label: "Red Hat",
            lane: "ats_direct",
            quality: "high_signal",
            status: "connected",
            jobCount: redHatJobs.length,
            endpointLabel: "redhat.wd1.myworkdayjobs.com/en-US/jobs",
            lastSyncedAt: "2026-04-11T12:45:00.000Z",
            message: "Red Hat public jobs synced and ready to persist.",
          },
        ]}
        initialTotalAvailableCount={27}
        jobs={initialJobs}
      />,
    );

    fireEvent.change(screen.getByLabelText("Company"), {
      target: { value: "Red Hat" },
    });

    await waitFor(() => {
      expect(screen.getByText("Showing 3 of 3 matching roles from 3 loaded.")).toBeInTheDocument();
    });
    expect(screen.getByText("3 matching roles")).toBeInTheDocument();
    expect(screen.queryByText(/Checking all 27 available jobs for matches/i)).not.toBeInTheDocument();
  });

  it("keeps company filters working when switching back before the next company snapshot resolves", async () => {
    const initialJobs = Array.from({ length: 24 }, (_, index) => ({
      ...createJob(index + 1),
      companyName: "Cisco",
      sourceKey: "greenhouse:cisco",
      sourceLabel: "Cisco",
    }));
    const adobeJobs = Array.from({ length: 2 }, (_, index) => ({
      ...createJob(index + 1),
      companyName: "Adobe",
      sourceKey: "workday:adobe",
      sourceLabel: "Adobe",
      title: `Adobe Role ${index + 1}`,
    }));
    const figmaJobs = Array.from({ length: 3 }, (_, index) => ({
      ...createJob(index + 1),
      companyName: "Figma",
      sourceKey: "greenhouse:figma",
      sourceLabel: "Figma",
      title: `Figma Role ${index + 1}`,
    }));

    let resolveFigmaSnapshot: ((response: Response | PromiseLike<Response>) => void) | null = null;
    let adobeRequestCount = 0;

    vi.stubGlobal(
      "fetch",
      vi.fn((input: string | URL | Request) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

        if (url === "/api/v1/jobs?limit=2&company=Adobe") {
          adobeRequestCount += 1;

          return Promise.resolve(
            new Response(
              JSON.stringify({
                generatedAt: "2026-04-11T12:45:00.000Z",
                jobs: adobeJobs,
                sources: [
                  {
                    key: "workday:adobe",
                    label: "Adobe",
                    lane: "ats_direct",
                    quality: "high_signal",
                    status: "connected",
                    jobCount: adobeJobs.length,
                    endpointLabel: "adobe.wd1.myworkdayjobs.com",
                    lastSyncedAt: "2026-04-11T12:45:00.000Z",
                    message: "Adobe public jobs synced and ready to persist.",
                  },
                ],
                summary: {
                  totalJobs: adobeJobs.length,
                  directAtsJobs: adobeJobs.length,
                  aggregatorJobs: 0,
                  sourceCount: 1,
                  connectedSourceCount: 1,
                  highSignalSourceCount: 1,
                  coverageSourceCount: 0,
                },
                storage: {
                  mode: "database",
                  persistedJobs: adobeJobs.length,
                  persistedSources: 1,
                  lastSyncAt: "2026-04-11T12:45:00.000Z",
                },
              }),
              {
                status: 200,
                headers: { "content-type": "application/json" },
              },
            ),
          );
        }

        if (url === "/api/v1/jobs?limit=3&company=Figma") {
          return new Promise<Response>((resolve) => {
            resolveFigmaSnapshot = resolve;
          });
        }

        throw new Error(`Unexpected fetch request: ${url}`);
      }),
    );

    render(
      <JobsResults
        initialCompanyOptions={["Adobe", "Cisco", "Figma"]}
        initialRequestLimit={24}
        initialSources={[
          {
            key: "greenhouse:cisco",
            label: "Cisco",
            lane: "ats_direct",
            quality: "high_signal",
            status: "connected",
            jobCount: initialJobs.length,
            endpointLabel: "boards-api.greenhouse.io/cisco",
            lastSyncedAt: "2026-04-11T12:45:00.000Z",
            message: "Cisco public jobs synced and ready to persist.",
          },
          {
            key: "workday:adobe",
            label: "Adobe",
            lane: "ats_direct",
            quality: "high_signal",
            status: "connected",
            jobCount: adobeJobs.length,
            endpointLabel: "adobe.wd1.myworkdayjobs.com",
            lastSyncedAt: "2026-04-11T12:45:00.000Z",
            message: "Adobe public jobs synced and ready to persist.",
          },
          {
            key: "greenhouse:figma",
            label: "Figma",
            lane: "ats_direct",
            quality: "high_signal",
            status: "connected",
            jobCount: figmaJobs.length,
            endpointLabel: "boards-api.greenhouse.io/figma",
            lastSyncedAt: "2026-04-11T12:45:00.000Z",
            message: "Figma public jobs synced and ready to persist.",
          },
        ]}
        initialTotalAvailableCount={29}
        jobs={initialJobs}
      />,
    );

    fireEvent.change(screen.getByLabelText("Company"), {
      target: { value: "Adobe" },
    });

    await waitFor(() => {
      expect(screen.getByText("Adobe Role 1")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText("Company"), {
      target: { value: "Figma" },
    });
    fireEvent.change(screen.getByLabelText("Company"), {
      target: { value: "Adobe" },
    });

    await waitFor(() => {
      expect(screen.getByText("Showing 2 of 2 matching roles from 2 loaded.")).toBeInTheDocument();
    });
    expect(adobeRequestCount).toBe(2);
    expect(screen.queryByText(/Loading all Figma jobs from the snapshot/i)).not.toBeInTheDocument();

    const completeFigmaSnapshot = resolveFigmaSnapshot;

    if (typeof completeFigmaSnapshot === "function") {
      (completeFigmaSnapshot as (response: Response | PromiseLike<Response>) => void)(
        new Response(
          JSON.stringify({
            generatedAt: "2026-04-11T12:45:00.000Z",
            jobs: figmaJobs,
            sources: [
              {
                key: "greenhouse:figma",
                label: "Figma",
                lane: "ats_direct",
                quality: "high_signal",
                status: "connected",
                jobCount: figmaJobs.length,
                endpointLabel: "boards-api.greenhouse.io/figma",
                lastSyncedAt: "2026-04-11T12:45:00.000Z",
                message: "Figma public jobs synced and ready to persist.",
              },
            ],
            summary: {
              totalJobs: figmaJobs.length,
              directAtsJobs: figmaJobs.length,
              aggregatorJobs: 0,
              sourceCount: 1,
              connectedSourceCount: 1,
              highSignalSourceCount: 1,
              coverageSourceCount: 0,
            },
            storage: {
              mode: "database",
              persistedJobs: figmaJobs.length,
              persistedSources: 1,
              lastSyncAt: "2026-04-11T12:45:00.000Z",
            },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
      );
    }

    await waitFor(() => {
      expect(screen.getByText("Adobe Role 1")).toBeInTheDocument();
    });
    expect(screen.queryByText("Figma Role 1")).not.toBeInTheDocument();
  });

  it("hydrates the full jobs window in the background after the first page renders", async () => {
    const initialJobs = Array.from({ length: 24 }, (_, index) => ({
      ...createJob(index + 1),
      companyName: "Cisco",
      sourceLabel: "Cisco",
    }));
    const expandedJobs = Array.from({ length: 53 }, (_, index) => createJob(index + 1));

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

        expect(url).toBe("/api/v1/jobs?limit=53");

        return new Response(
          JSON.stringify({
            generatedAt: "2026-04-10T12:45:00.000Z",
            jobs: expandedJobs,
            sources: [
              {
                key: "greenhouse:cisco",
                label: "Cisco",
                lane: "ats_direct",
                quality: "high_signal",
                status: "connected",
                jobCount: 600,
                endpointLabel: "jobs.cisco.com",
                lastSyncedAt: "2026-04-10T12:45:00.000Z",
                message: "Cisco public jobs synced and ready to persist.",
              },
              {
                key: "greenhouse:figma",
                label: "Figma",
                lane: "ats_direct",
                quality: "high_signal",
                status: "connected",
                jobCount: 445,
                endpointLabel: "boards-api.greenhouse.io/figma",
                lastSyncedAt: "2026-04-10T12:45:00.000Z",
                message: "Greenhouse public jobs synced and ready to persist.",
              },
            ],
            summary: {
              totalJobs: expandedJobs.length,
              directAtsJobs: expandedJobs.length,
              aggregatorJobs: 0,
              sourceCount: 0,
              connectedSourceCount: 0,
              highSignalSourceCount: 0,
              coverageSourceCount: 0,
            },
            storage: {
              mode: "database",
              persistedJobs: expandedJobs.length,
              persistedSources: 0,
              lastSyncAt: "2026-04-10T12:45:00.000Z",
            },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }),
    );

    render(
      <JobsResults initialRequestLimit={24} initialTotalAvailableCount={53} jobs={initialJobs} />,
    );

    await waitFor(
      () => {
        expect(screen.getByText("Showing 24 of 53 matching roles from 53 loaded.")).toBeInTheDocument();
      },
      { timeout: 5_000 },
    );
    expect(screen.getByText("1,045 jobs available")).toBeInTheDocument();
    expect(screen.queryByText("Role 25")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Company")).toHaveTextContent("Cisco");
    expect(screen.getByLabelText("Company")).toHaveTextContent("Figma");
  }, 15_000);

  it("hydrates the larger jobs window from the saved snapshot without forcing a refresh", async () => {
    const initialJobs = Array.from({ length: 24 }, (_, index) => ({
      ...createJob(index + 1),
      companyName: "Cisco",
      sourceKey: "greenhouse:cisco",
      sourceLabel: "Cisco",
    }));
    const expandedJobs = Array.from({ length: 53 }, (_, index) => createJob(index + 1));

    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url !== "/api/v1/jobs?limit=53") {
        throw new Error(`Unexpected URL ${url}`);
      }

      return new Response(
        JSON.stringify({
          generatedAt: "2026-04-11T12:45:00.000Z",
          jobs: expandedJobs,
          sources: [
            {
              key: "greenhouse:cisco",
              label: "Cisco",
              lane: "ats_direct",
              quality: "high_signal",
              status: "connected",
              jobCount: 24,
              endpointLabel: "boards-api.greenhouse.io/cisco",
              lastSyncedAt: "2026-04-11T12:45:00.000Z",
              message: "Cisco public jobs synced and ready to persist.",
            },
            {
              key: "greenhouse:figma",
              label: "Figma",
              lane: "ats_direct",
              quality: "high_signal",
              status: "connected",
              jobCount: 29,
              endpointLabel: "boards-api.greenhouse.io/figma",
              lastSyncedAt: "2026-04-11T12:45:00.000Z",
              message: "Figma public jobs synced and ready to persist.",
            },
          ],
          summary: {
            totalJobs: 53,
            directAtsJobs: 53,
            aggregatorJobs: 0,
            sourceCount: 2,
            connectedSourceCount: 2,
            highSignalSourceCount: 2,
            coverageSourceCount: 0,
          },
          storage: {
            mode: "database",
            persistedJobs: expandedJobs.length,
            persistedSources: 2,
            lastSyncAt: "2026-04-11T12:45:00.000Z",
          },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    });

    vi.stubGlobal("fetch", fetchMock);

    render(
      <JobsResults
        initialRequestLimit={24}
        initialTotalAvailableCount={53}
        jobs={initialJobs}
      />,
    );

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([input]) => {
          const url =
            typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

          return url === "/api/v1/jobs?limit=53";
        }),
      ).toBe(true);
    });

    await waitFor(() => {
      expect(screen.getByText("Showing 24 of 53 matching roles from 53 loaded.")).toBeInTheDocument();
    });
    expect(screen.getByText("53 jobs available")).toBeInTheDocument();
  });

  it("keeps role filters working while the saved snapshot expands to the full jobs window", async () => {
    const initialJobs = Array.from({ length: 24 }, (_, index) => ({
      ...createJob(index + 1),
      title: `Account Executive ${index + 1}`,
      department: "Sales",
      companyName: "Cisco",
      sourceKey: "greenhouse:cisco",
      sourceLabel: "Cisco",
    }));
    const expandedJobs = [
      ...initialJobs,
      {
        ...createJob(25),
        title: "Content Designer Advisor",
        department: "Design",
        companyName: "Dell Technologies",
        sourceKey: "workday:dell",
        sourceLabel: "Dell Technologies",
      },
    ];

    vi.stubGlobal(
      "fetch",
      vi.fn((input: string | URL | Request) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

        if (url === "/api/v1/jobs?limit=25") {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                generatedAt: "2026-04-12T12:45:00.000Z",
                jobs: expandedJobs,
                sources: [
                  {
                    key: "greenhouse:cisco",
                    label: "Cisco",
                    lane: "ats_direct",
                    quality: "high_signal",
                    status: "connected",
                    jobCount: initialJobs.length,
                    endpointLabel: "boards-api.greenhouse.io/cisco",
                    lastSyncedAt: "2026-04-12T12:45:00.000Z",
                    message: "Cisco public jobs synced and ready to persist.",
                  },
                  {
                    key: "workday:dell",
                    label: "Dell Technologies",
                    lane: "ats_direct",
                    quality: "high_signal",
                    status: "connected",
                    jobCount: 1,
                    endpointLabel: "dell.wd1.myworkdayjobs.com",
                    lastSyncedAt: "2026-04-12T12:45:00.000Z",
                    message: "Dell public jobs synced and ready to persist.",
                  },
                ],
                summary: {
                  totalJobs: expandedJobs.length,
                  directAtsJobs: expandedJobs.length,
                  aggregatorJobs: 0,
                  sourceCount: 2,
                  connectedSourceCount: 2,
                  highSignalSourceCount: 2,
                  coverageSourceCount: 0,
                },
                storage: {
                  mode: "database",
                  persistedJobs: expandedJobs.length,
                  persistedSources: 2,
                  lastSyncAt: "2026-04-12T12:45:00.000Z",
                },
              }),
              {
                status: 200,
                headers: { "content-type": "application/json" },
              },
            ),
          );
        }

        throw new Error(`Unexpected fetch request: ${url}`);
      }),
    );

    render(
      <JobsResults
        initialRequestLimit={24}
        initialTotalAvailableCount={25}
        jobs={initialJobs}
      />,
    );

    fireEvent.change(screen.getByLabelText("Role type"), {
      target: { value: "product-design" },
    });

    await waitFor(() => {
      expect(screen.getByText("Content Designer Advisor")).toBeInTheDocument();
    });
    expect(screen.getByText("Showing 1 of 1 matching role from 25 loaded.")).toBeInTheDocument();
  });

  it("surfaces an expanded search error instead of staying stuck on the checking state forever", async () => {
    const initialJobs = Array.from({ length: 24 }, (_, index) => ({
      ...createJob(index + 1),
      title: `Account Executive ${index + 1}`,
      department: "Sales",
    }));

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("Expanded snapshot request failed.");
      }),
    );

    render(
      <JobsResults initialRequestLimit={24} initialTotalAvailableCount={25} jobs={initialJobs} />,
    );

    fireEvent.change(screen.getByLabelText("Role type"), {
      target: { value: "product-design" },
    });

    await waitFor(() => {
      expect(screen.getByText("The full jobs catalog could not be expanded right now.")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Retry search all jobs" })).toBeInTheDocument();
  });

  it("checks the full jobs window before declaring no matches for active filters", async () => {
    const initialJobs = Array.from({ length: 24 }, (_, index) => ({
      ...createJob(index + 1),
      title: `Account Executive ${index + 1}`,
      department: "Sales",
    }));
    const expandedJobs = [
      ...initialJobs,
      {
        ...createJob(25),
        title: "Frontend Engineer",
        department: "Engineering",
        companyName: "Stripe",
      },
    ];
    let resolveFetch: (value: Response) => void = () => {};

    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            resolveFetch = resolve;
          }),
      ),
    );

    render(
      <JobsResults initialRequestLimit={24} initialTotalAvailableCount={25} jobs={initialJobs} />,
    );

    fireEvent.change(screen.getByLabelText("Role type"), {
      target: { value: "frontend-engineering" },
    });

    expect(screen.getByText("Checking all 25 available jobs for matches...")).toBeInTheDocument();
    expect(screen.getByText("Searching all jobs")).toBeInTheDocument();
    expect(screen.queryByText("No roles match the current filters.")).not.toBeInTheDocument();

    resolveFetch(
      new Response(
        JSON.stringify({
          generatedAt: "2026-04-10T12:45:00.000Z",
          jobs: expandedJobs,
          sources: [
            {
              key: "greenhouse:figma",
              label: "Figma",
              lane: "ats_direct",
              quality: "high_signal",
              status: "connected",
              jobCount: expandedJobs.length,
              endpointLabel: "boards-api.greenhouse.io/figma",
              lastSyncedAt: "2026-04-10T12:45:00.000Z",
              message: "Greenhouse public jobs synced and ready to persist.",
            },
          ],
          summary: {
            totalJobs: expandedJobs.length,
            directAtsJobs: expandedJobs.length,
            aggregatorJobs: 0,
            sourceCount: 1,
            connectedSourceCount: 1,
            highSignalSourceCount: 1,
            coverageSourceCount: 0,
          },
          storage: {
            mode: "database",
            persistedJobs: expandedJobs.length,
            persistedSources: 1,
            lastSyncAt: "2026-04-10T12:45:00.000Z",
          },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );

    await waitFor(() => {
      expect(screen.getByText("Frontend Engineer")).toBeInTheDocument();
    });
    expect(screen.getByText("Showing 1 of 1 matching role from 25 loaded.")).toBeInTheDocument();
  });

  it("filters roles by keyword and manual facets, then clears back to the loaded window", () => {
    const jobs: JobPostingDto[] = [
      {
        ...createJob(1),
        title: "Machine Learning Engineer",
        companyName: "Figma",
        location: "Remote",
        salaryText: "$185,000 - $215,000",
        commitment: "Full-time",
        sourceLane: "ats_direct",
      },
      {
        ...createJob(2),
        title: "Frontend Engineer",
        companyName: "Stripe",
        location: "New York, NY",
        salaryText: "$92,000 - $98,000",
        commitment: "Contract",
        sourceLane: "aggregator",
      },
      {
        ...createJob(3),
        title: "Product Manager, AI Platform",
        companyName: "Anthropic",
        location: "Hybrid - Chicago, IL",
        salaryText: "$135,000 - $150,000",
        commitment: "Full-time",
        sourceLane: "ats_direct",
      },
      {
        ...createJob(4),
        title: "Security Engineer",
        companyName: "OpenAI",
        location: "Remote",
        salaryText: "$120,000 - $180,000",
        commitment: "Full-time",
        sourceLane: "ats_direct",
      },
    ];

    render(<JobsResults jobs={jobs} />);

    fireEvent.change(screen.getByLabelText("Salary range"), {
      target: { value: "100k-150k" },
    });

    expect(screen.getByText("Showing 2 of 2 matching roles from 4 loaded.")).toBeInTheDocument();
    expect(screen.getByText("2 matching roles")).toBeInTheDocument();
    expect(screen.getByText("Product Manager, AI Platform")).toBeInTheDocument();
    expect(screen.getByText("Security Engineer")).toBeInTheDocument();
    expect(screen.queryByText("Machine Learning Engineer")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Workplace"), {
      target: { value: "onsite" },
    });

    expect(screen.getByText("No roles match the current filters.")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Clear filters" })[0]);

    expect(screen.getByText("Showing 4 of 4 matching roles from 4 loaded.")).toBeInTheDocument();
    expect(screen.getByText("Machine Learning Engineer")).toBeInTheDocument();
    expect(screen.getByText("Frontend Engineer")).toBeInTheDocument();
    expect(screen.getByText("Product Manager, AI Platform")).toBeInTheDocument();
    expect(screen.getByText("Security Engineer")).toBeInTheDocument();
  });

  it("maps broader design titles into the product design role filter", () => {
    const jobs: JobPostingDto[] = [
      {
        ...createJob(1),
        title: "Content Designer Advisor",
        companyName: "Dell Technologies",
        department: "Design",
      },
      {
        ...createJob(2),
        title: "UX Researcher",
        companyName: "Adobe",
        department: "Design",
      },
      {
        ...createJob(3),
        title: "Software Engineer",
        companyName: "Cisco",
        department: "Engineering",
      },
    ];

    render(<JobsResults jobs={jobs} />);

    fireEvent.change(screen.getByLabelText("Role type"), {
      target: { value: "product-design" },
    });

    expect(screen.getByText("Content Designer Advisor")).toBeInTheDocument();
    expect(screen.getByText("UX Researcher")).toBeInTheDocument();
    expect(screen.queryByText("Software Engineer")).not.toBeInTheDocument();
    expect(screen.getByText("Showing 2 of 2 matching roles from 3 loaded.")).toBeInTheDocument();
  });

  it("filters salary text into annualized salary bands", () => {
    const jobs: JobPostingDto[] = [
      {
        ...createJob(1),
        title: "Applied AI Engineer",
        salaryText: "$78/hour",
      },
      {
        ...createJob(2),
        title: "Security Engineer",
        salaryText: "$130,000 - $160,000",
      },
      {
        ...createJob(3),
        title: "Staff Platform Engineer",
        salaryText: "$260,000+",
      },
    ];

    render(<JobsResults jobs={jobs} />);

    fireEvent.change(screen.getByLabelText("Salary range"), {
      target: { value: "150k-200k" },
    });

    expect(screen.getByText("Applied AI Engineer")).toBeInTheDocument();
    expect(screen.getByText("Security Engineer")).toBeInTheDocument();
    expect(screen.queryByText("Staff Platform Engineer")).not.toBeInTheDocument();
  });

  it("keeps the right-side counter aligned with salary-filtered matches instead of the full snapshot total", () => {
    const jobs: JobPostingDto[] = [
      {
        ...createJob(1),
        title: "Platform Engineer",
        salaryText: "$120,000 - $180,000",
      },
      {
        ...createJob(2),
        title: "Support Engineer",
        salaryText: "$92,000 - $98,000",
      },
      {
        ...createJob(3),
        title: "Product Manager",
        salaryText: "$145,000 - $155,000",
      },
    ];

    render(<JobsResults initialTotalAvailableCount={12959} jobs={jobs} />);

    expect(screen.getByText("12,959 jobs available")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Salary range"), {
      target: { value: "100k-150k" },
    });

    expect(screen.getByText("Showing 2 of 2 matching roles from 3 loaded.")).toBeInTheDocument();
    expect(screen.getByText("2 matching roles")).toBeInTheDocument();
    expect(screen.queryByText("12,959 jobs available")).not.toBeInTheDocument();
    expect(screen.getByText("Platform Engineer")).toBeInTheDocument();
    expect(screen.getByText("Product Manager")).toBeInTheDocument();
    expect(screen.queryByText("Support Engineer")).not.toBeInTheDocument();
  });

  it("switches to recruiter mode from the jobs counter row and returns to jobs", async () => {
    const jobs = Array.from({ length: 24 }, (_, index) => createJob(index + 1));

    render(<JobsResults initialTotalAvailableCount={12959} jobs={jobs} />);

    expect(screen.getByRole("button", { name: "Find Recruiters" })).toBeInTheDocument();
    expect(screen.getByText("12,959 jobs available")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Find Recruiters" }));

    expect(await screen.findByRole("heading", { name: "Find Recruiters" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back to Jobs" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Keyword")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back to Jobs" }));

    expect(screen.getByLabelText("Keyword")).toBeInTheDocument();
    expect(screen.getByText("Role 1")).toBeInTheDocument();
  });
});
