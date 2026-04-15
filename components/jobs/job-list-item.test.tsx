import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JobListItem } from "./job-list-item";

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

describe("JobListItem", () => {
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
  });

  afterEach(() => {
    vi.restoreAllMocks();
    mockGetMissingRequiredFieldKeys.mockReset();
    mockUseApplicationProfiles.mockReset();
  });

  it("opens the profile modal instead of applying immediately when the reusable profile is incomplete", () => {
    const onApply = vi.fn(async () => "https://wd1.myworkdaysite.com/recruiting/example/job");
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    mockGetMissingRequiredFieldKeys
      .mockReturnValueOnce(["email"])
      .mockReturnValueOnce([]);

    render(
      <JobListItem
        job={{
          applyUrl: "https://wd1.myworkdaysite.com/recruiting/example/job",
          canonicalApplyUrl: "https://wd1.myworkdaysite.com/recruiting/example/job",
          company: "Accenture",
          id: "job_1",
          isOrchestrationReady: false,
          location: "Remote",
          matchReason: "",
          relevanceScore: null,
          salaryText: null,
          sourceLabel: "Accenture",
          summary: null,
          title: "Application Designer",
          validationStatus: undefined,
          workplaceType: null,
        }}
        onApply={onApply}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "APPLY" }));

    expect(onApply).not.toHaveBeenCalled();
    expect(openSpy).not.toHaveBeenCalled();
    expect(screen.getByText("Fill this out once")).toBeInTheDocument();
  });

  it("records the click and opens the resolved apply URL when the reusable profile is complete", async () => {
    const onApply = vi.fn(async () => "https://redirected.example.com/apply/job_1");
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    mockGetMissingRequiredFieldKeys
      .mockReturnValueOnce([])
      .mockReturnValueOnce([]);

    render(
      <JobListItem
        job={{
          applyUrl: "https://boards.greenhouse.io/example/jobs/123",
          canonicalApplyUrl: "https://boards.greenhouse.io/example/jobs/123",
          company: "Example",
          id: "job_1",
          isOrchestrationReady: true,
          location: "New York, NY",
          matchReason: "",
          relevanceScore: null,
          salaryText: "$180k",
          sourceLabel: "Example",
          summary: null,
          title: "Product Designer",
          validationStatus: undefined,
          workplaceType: "remote",
        }}
        onApply={onApply}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "APPLY" }));

    await waitFor(() => {
      expect(onApply).toHaveBeenCalledTimes(1);
    });
    expect(openSpy).toHaveBeenCalledWith(
      "https://redirected.example.com/apply/job_1",
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("opens an in-app details modal without leaving the current page", async () => {
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
              preferredQualifications: [],
              salaryText: "$180k - $220k",
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

    render(
      <JobListItem
        job={{
          applyUrl: "https://boards.greenhouse.io/example/jobs/123",
          canonicalApplyUrl: "https://boards.greenhouse.io/example/jobs/123",
          company: "Example",
          id: "job_1",
          isOrchestrationReady: true,
          location: "New York, NY",
          matchReason: "",
          relevanceScore: null,
          salaryText: "$180k",
          sourceLabel: "Example",
          summary: "Lead end-to-end product design for the hiring experience.",
          title: "Product Designer",
          validationStatus: undefined,
          workplaceType: "remote",
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Read more" }));

    const dialog = await screen.findByRole("dialog", { name: "Product Designer" });

    expect(dialog).toBeInTheDocument();
    expect(
      within(dialog).getAllByText("Lead end-to-end product design for the hiring experience.")[0],
    ).toBeInTheDocument();
    expect(openSpy).not.toHaveBeenCalled();
  });
});
