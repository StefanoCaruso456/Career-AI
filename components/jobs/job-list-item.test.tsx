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

function createJob(overrides?: Partial<Parameters<typeof JobListItem>[0]["job"]>) {
  return {
    applyUrl: "https://boards.greenhouse.io/example/jobs/123",
    applyTarget: {
      atsFamily: "greenhouse" as const,
      confidence: 0.95,
      matchedRule: "greenhouse_url_signature",
      routingMode: "queue_autonomous_apply" as const,
      supportReason: "supported_ats_family",
      supportStatus: "supported" as const,
    },
    canonicalApplyUrl: "https://boards.greenhouse.io/example/jobs/123",
    company: "Example",
    employmentType: "Full-time",
    externalJobId: "req-1",
    id: "job_1",
    isOrchestrationReady: true,
    location: "New York, NY",
    matchReason: "Strong alignment with product design experience.",
    postedAt: "2026-04-12T12:00:00.000Z",
    railKey: "greenhouse:example:job_1",
    relevanceScore: 0.92,
    salaryText: "$180k",
    sourceKey: "greenhouse:example",
    sourceLabel: "Example",
    sourceType: "greenhouse" as const,
    sourceUrl: "https://boards.greenhouse.io/example/jobs/123",
    summary: "Lead end-to-end product design for the hiring experience.",
    title: "Product Designer",
    validationStatus: undefined,
    workplaceType: "remote" as const,
    ...overrides,
  };
}

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

  it("opens the reusable profile modal instead of applying immediately when the profile is incomplete", () => {
    const onApply = vi.fn(async () => "https://wd1.myworkdaysite.com/recruiting/example/job");
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    mockGetMissingRequiredFieldKeys
      .mockReturnValueOnce(["email"])
      .mockReturnValueOnce([]);

    render(
      <JobListItem
        job={createJob({
          applyUrl: "https://wd1.myworkdaysite.com/recruiting/example/job",
          canonicalApplyUrl: "https://wd1.myworkdaysite.com/recruiting/example/job",
          company: "Accenture",
          sourceKey: "workday:accenture",
          sourceLabel: "Accenture",
          sourceType: "workday",
          sourceUrl: "https://wd1.myworkdaysite.com/recruiting/example/job",
          title: "Application Designer",
        })}
        onApply={onApply}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "One-Click Apply" }));

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

    render(<JobListItem job={createJob()} onApply={onApply} />);

    fireEvent.click(screen.getByRole("button", { name: "One-Click Apply" }));

    await waitFor(() => {
      expect(onApply).toHaveBeenCalledTimes(1);
    });
    expect(openSpy).toHaveBeenCalledWith(
      "https://redirected.example.com/apply/job_1",
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("surfaces the details affordance through both the card body and the secondary action", () => {
    const onOpenDetails = vi.fn();

    render(<JobListItem job={createJob()} onOpenDetails={onOpenDetails} />);

    fireEvent.click(screen.getByRole("button", { name: "Open details for Product Designer" }));
    fireEvent.click(screen.getByRole("button", { name: "View details" }));

    expect(onOpenDetails).toHaveBeenCalledTimes(2);
    expect(onOpenDetails).toHaveBeenNthCalledWith(1, expect.objectContaining({ id: "job_1" }));
    expect(onOpenDetails).toHaveBeenNthCalledWith(2, expect.objectContaining({ id: "job_1" }));
  });

  it("marks the active job card as selected while the details view is open", () => {
    const { container } = render(<JobListItem isSelected job={createJob()} />);
    const article = container.querySelector("article");

    expect(article).toHaveAttribute("data-selected", "true");
    expect(screen.getByRole("button", { name: "Open details for Product Designer" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("hides the trusted-listing helper copy from the card", () => {
    render(
      <JobListItem
        job={createJob({
          matchReason: "Verified live listing",
          summary: null,
        })}
      />,
    );

    expect(screen.queryByText("Verified live listing")).not.toBeInTheDocument();
    expect(screen.queryByText("Why it surfaced")).not.toBeInTheDocument();
  });

  it("compacts verbose compensation copy into a clean salary pill", () => {
    render(
      <JobListItem
        job={createJob({
          salaryText:
            "Compensation: The annual base salary range for this role is $180,000 - $220,000 annually, plus equity.",
        })}
      />,
    );

    expect(screen.getByText("$180,000 - $220,000 a year")).toBeInTheDocument();
    expect(screen.queryByText(/Compensation:/i)).not.toBeInTheDocument();
  });

  it("hides the employment pill when the source does not specify a job type", () => {
    render(
      <JobListItem
        job={createJob({
          employmentType: null,
        })}
      />,
    );

    expect(screen.queryByText("Type unknown")).not.toBeInTheDocument();
    expect(screen.getByText("New York, NY")).toBeInTheDocument();
  });

  it("uses an Open posting label and skips the profile gate for unsupported targets", async () => {
    const onApply = vi.fn(async () => "https://redirected.example.com/open/job_1");
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    mockGetMissingRequiredFieldKeys.mockReturnValue(["email"]);

    render(
      <JobListItem
        job={createJob({
          applyTarget: {
            atsFamily: "lever",
            confidence: 0.95,
            matchedRule: "lever_url_signature",
            routingMode: "open_external",
            supportReason: "unsupported_ats_family",
            supportStatus: "unsupported",
          },
        })}
        onApply={onApply}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open posting" }));

    await waitFor(() => {
      expect(onApply).toHaveBeenCalledTimes(1);
      expect(openSpy).toHaveBeenCalledWith(
        "https://redirected.example.com/open/job_1",
        "_blank",
        "noopener,noreferrer",
      );
    });

    expect(screen.queryByText("Fill this out once")).not.toBeInTheDocument();
  });

  it("uses an Open posting label and skips the profile gate when autonomous apply is disabled", async () => {
    const onApply = vi.fn(async () => "https://redirected.example.com/open/job_1");
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    mockGetMissingRequiredFieldKeys.mockReturnValue(["email"]);

    render(<JobListItem autonomousApplyEnabled={false} job={createJob()} onApply={onApply} />);

    fireEvent.click(screen.getByRole("button", { name: "Open posting" }));

    await waitFor(() => {
      expect(onApply).toHaveBeenCalledTimes(1);
      expect(openSpy).toHaveBeenCalledWith(
        "https://redirected.example.com/open/job_1",
        "_blank",
        "noopener,noreferrer",
      );
    });

    expect(screen.queryByText("Fill this out once")).not.toBeInTheDocument();
  });
});
