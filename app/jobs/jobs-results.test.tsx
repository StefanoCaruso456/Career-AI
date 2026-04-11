import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JobsResults } from "@/app/jobs/jobs-results";
import type { JobPostingDto } from "@/packages/contracts/src";

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
    postedAt: "2026-04-09T12:00:00.000Z",
    updatedAt: "2026-04-10T12:00:00.000Z",
    salaryText: "$120,000 - $150,000",
    descriptionSnippet: null,
  };
}

describe("JobsResults", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
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
  });

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

    await waitFor(() => {
      expect(screen.getByText("Showing 24 of 53 matching roles from 53 loaded.")).toBeInTheDocument();
    });
    expect(screen.getByText("1,045 jobs available")).toBeInTheDocument();
    expect(screen.queryByText("Role 25")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Company")).toHaveTextContent("Cisco");
    expect(screen.getByLabelText("Company")).toHaveTextContent("Figma");
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
    ];

    render(<JobsResults jobs={jobs} />);

    fireEvent.change(screen.getByLabelText("Salary range"), {
      target: { value: "100k-150k" },
    });

    expect(screen.getByText("Showing 1 of 1 matching role from 3 loaded.")).toBeInTheDocument();
    expect(screen.getByText("Product Manager, AI Platform")).toBeInTheDocument();
    expect(screen.queryByText("Machine Learning Engineer")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Workplace"), {
      target: { value: "onsite" },
    });

    expect(screen.getByText("No roles match the current filters.")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Clear filters" })[0]);

    expect(screen.getByText("Showing 3 of 3 matching roles from 3 loaded.")).toBeInTheDocument();
    expect(screen.getByText("Machine Learning Engineer")).toBeInTheDocument();
    expect(screen.getByText("Frontend Engineer")).toBeInTheDocument();
    expect(screen.getByText("Product Manager, AI Platform")).toBeInTheDocument();
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
    expect(screen.queryByText("Security Engineer")).not.toBeInTheDocument();
    expect(screen.queryByText("Staff Platform Engineer")).not.toBeInTheDocument();
  });
});
