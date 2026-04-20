import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AUTONOMOUS_APPLY_QUEUED_MESSAGE } from "@/lib/jobs/apply-run-messages";
import { ProfileCompletionGuard } from "./profile-completion-guard";

const mockUseApplicationProfiles = vi.fn();
const mockGetMissingRequiredFieldKeys = vi.fn();
const mockSaveProfile = vi.fn();

vi.mock("./use-application-profiles", () => ({
  useApplicationProfiles: () => mockUseApplicationProfiles(),
}));

vi.mock("./easy-apply-profile-modal", () => ({
  EasyApplyProfileModal: ({
    isOpen,
    onSaveProfile,
  }: {
    isOpen: boolean;
    onSaveProfile: (profile: Record<string, unknown>) => Promise<void>;
  }) =>
    isOpen ? (
      <div>
        <p>Fill this out once</p>
        <button
          onClick={() => {
            void onSaveProfile({
              email: "stefano@example.com",
            });
          }}
          type="button"
        >
          Save base profile
        </button>
      </div>
    ) : null,
}));

vi.mock("./missing-fields-modal", () => ({
  MissingFieldsModal: ({
    isOpen,
    onSaveProfile,
  }: {
    isOpen: boolean;
    onSaveProfile: (profile: Record<string, unknown>) => Promise<void>;
  }) =>
    isOpen ? (
      <div>
        <p>Complete missing fields</p>
        <button
          onClick={() => {
            void onSaveProfile({
              custom_question: "Yes",
              email: "stefano@example.com",
            });
          }}
          type="button"
        >
          Save missing fields
        </button>
      </div>
    ) : null,
}));

vi.mock("@/lib/application-profiles/validation", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/application-profiles/validation")>();

  return {
    ...actual,
    getMissingRequiredFieldKeys: (...args: unknown[]) => mockGetMissingRequiredFieldKeys(...args),
  };
});

describe("ProfileCompletionGuard", () => {
  beforeEach(() => {
    mockSaveProfile.mockImplementation(async ({ profile }: { profile: Record<string, unknown> }) => profile);
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
      saveProfile: mockSaveProfile,
      uploadResume: vi.fn(),
      userKey: "user-1",
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    mockGetMissingRequiredFieldKeys.mockReset();
    mockSaveProfile.mockReset();
    mockUseApplicationProfiles.mockReset();
  });

  it("opens the employer missing-fields modal when extra employer data is still required", () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    mockGetMissingRequiredFieldKeys.mockImplementation(
      ({ fieldKeys }: { fieldKeys?: string[] }) =>
        Array.isArray(fieldKeys) && fieldKeys.length > 0 ? ["custom_question"] : [],
    );

    render(
      <ProfileCompletionGuard
        applyUrl="https://boards.greenhouse.io/example/jobs/123"
        companyName="Example"
        employerMissingFieldKeys={["custom_question"]}
        jobTitle="Product Designer"
        schemaFamily="greenhouse"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /apply/i }));

    expect(openSpy).not.toHaveBeenCalled();
    expect(screen.getByText("Complete missing fields")).toBeInTheDocument();
  });

  it("keeps the apply URL blocked until employer-required fields are completed after base profile setup", async () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    mockGetMissingRequiredFieldKeys.mockImplementation(
      ({
        fieldKeys,
        profile,
      }: {
        fieldKeys?: string[];
        profile: Record<string, unknown>;
      }) => {
        if (Array.isArray(fieldKeys) && fieldKeys.length > 0) {
          return profile.custom_question ? [] : ["custom_question"];
        }

        return profile.email ? [] : ["email"];
      },
    );

    render(
      <ProfileCompletionGuard
        applyUrl="https://boards.greenhouse.io/example/jobs/123"
        companyName="Example"
        employerMissingFieldKeys={["custom_question"]}
        jobTitle="Product Designer"
        schemaFamily="greenhouse"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /apply/i }));
    expect(screen.getByText("Fill this out once")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save base profile" }));

    await waitFor(() => {
      expect(openSpy).not.toHaveBeenCalled();
      expect(screen.getByText("Complete missing fields")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Save missing fields" }));

    await waitFor(() => {
      expect(openSpy).toHaveBeenCalledWith(
        "https://boards.greenhouse.io/example/jobs/123",
        "_blank",
        "noopener,noreferrer",
      );
    });
  });

  it("shows an inline success notice when autonomous apply is queued", async () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    mockGetMissingRequiredFieldKeys.mockReturnValue([]);

    render(
      <ProfileCompletionGuard
        applyUrl="https://boards.greenhouse.io/example/jobs/123"
        companyName="Example"
        jobTitle="Product Designer"
        resolveApplyUrl={async () => ({
          action: "queued",
          applyRunId: "apply_run_123",
          message: "Your application was queued in the background.",
        })}
        schemaFamily="greenhouse"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /apply/i }));

    await waitFor(() => {
      expect(screen.getByText("Your application was queued in the background.")).toBeInTheDocument();
    });
    expect(screen.getByRole("link", { name: "View application status" })).toHaveAttribute(
      "href",
      "/account/apply-runs/apply_run_123",
    );
    expect(openSpy).not.toHaveBeenCalled();
  });

  it("uses the shared queued notice when the queued response has no message", async () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    mockGetMissingRequiredFieldKeys.mockReturnValue([]);

    render(
      <ProfileCompletionGuard
        applyUrl="https://boards.greenhouse.io/example/jobs/123"
        companyName="Example"
        jobTitle="Product Designer"
        resolveApplyUrl={async () => ({
          action: "queued",
          applyRunId: "apply_run_456",
          message: "",
        })}
        schemaFamily="greenhouse"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /apply/i }));

    await waitFor(() => {
      expect(screen.getByText(AUTONOMOUS_APPLY_QUEUED_MESSAGE)).toBeInTheDocument();
    });
    expect(screen.getByRole("link", { name: "View application status" })).toHaveAttribute(
      "href",
      "/account/apply-runs/apply_run_456",
    );
    expect(openSpy).not.toHaveBeenCalled();
  });

  it("keeps the job-card apply button and inline error in the same layout stack", async () => {
    mockGetMissingRequiredFieldKeys.mockReturnValue([]);

    render(
      <ProfileCompletionGuard
        applyUrl="https://boards.greenhouse.io/example/jobs/123"
        buttonLabel="One-Click Apply"
        buttonVariant="jobs-card"
        companyName="Example"
        jobTitle="Product Designer"
        resolveApplyUrl={async () => {
          throw new Error("One-Click Apply is currently disabled in this environment.");
        }}
        schemaFamily="greenhouse"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "One-Click Apply" }));

    await waitFor(() => {
      expect(
        screen.getByText("One-Click Apply is currently disabled in this environment."),
      ).toBeInTheDocument();
    });

    const actionStack = screen.getByTestId("apply-action-stack");

    expect(
      within(actionStack).getByRole("button", { name: "One-Click Apply" }),
    ).toBeInTheDocument();
    expect(
      within(actionStack).getByText("One-Click Apply is currently disabled in this environment."),
    ).toBeInTheDocument();
  });

  it("bypasses auth and profile gating when the caller explicitly skips the profile gate", async () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    mockUseApplicationProfiles.mockReturnValue({
      error: null,
      isAuthenticated: false,
      isLoading: false,
      isSaving: false,
      persisted: false,
      profiles: {
        greenhouse_profile: {},
        stripe_profile: {},
        workday_profile: {},
      },
      saveProfile: mockSaveProfile,
      uploadResume: vi.fn(),
      userKey: null,
    });
    mockGetMissingRequiredFieldKeys.mockReturnValue(["email"]);

    render(
      <ProfileCompletionGuard
        applyUrl="https://boards.greenhouse.io/example/jobs/123"
        companyName="Example"
        jobTitle="Product Designer"
        resolveApplyUrl={async () => "https://boards.greenhouse.io/example/jobs/123"}
        schemaFamily="greenhouse"
        skipProfileGate
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /apply/i }));

    await waitFor(() => {
      expect(openSpy).toHaveBeenCalledWith(
        "https://boards.greenhouse.io/example/jobs/123",
        "_blank",
        "noopener,noreferrer",
      );
    });

    expect(screen.queryByText("Fill this out once")).not.toBeInTheDocument();
  });
});
