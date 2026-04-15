import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
});
