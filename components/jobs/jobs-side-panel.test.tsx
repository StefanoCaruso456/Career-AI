import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

    fireEvent.click(trigger);
    expect(screen.queryByRole("dialog", { name: "Jobs rail filters" })).not.toBeInTheDocument();
    expect(screen.getByText("Product Designer")).toBeInTheDocument();
    expect(screen.getByText("Backend Engineer")).toBeInTheDocument();
  });
});
