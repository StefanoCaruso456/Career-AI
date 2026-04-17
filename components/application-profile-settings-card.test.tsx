import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mergeProfileWithDefaults } from "@/lib/application-profiles/defaults";
import type { ResumeAssetReference } from "@/lib/application-profiles/types";
import { ApplicationProfileSettingsCard } from "./application-profile-settings-card";

const mockUseApplicationProfiles = vi.fn();

vi.mock("@/components/easy-apply-profile/use-application-profiles", () => ({
  useApplicationProfiles: () => mockUseApplicationProfiles(),
}));

function createResumeReference(): ResumeAssetReference {
  return {
    artifactId: "artifact_resume_1",
    fileName: "resume.pdf",
    mimeType: "application/pdf",
    parsingStatus: "COMPLETED",
    uploadedAt: "2026-04-17T10:00:00.000Z",
  };
}

function createCompleteGreenhouseProfile() {
  return mergeProfileWithDefaults("greenhouse", {
    country: "United States",
    email: "casey@example.com",
    first_name: "Casey",
    intended_work_location: "Chicago, IL",
    last_name: "Rivera",
    legally_authorized_to_work: "yes",
    location_city: "Chicago",
    phone_number: "3125550188",
    resume_cv_file: createResumeReference(),
    why_do_you_want_to_join_company: "I want to build better hiring tools.",
    worked_for_employer_before: "no",
  });
}

describe("ApplicationProfileSettingsCard", () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockUseApplicationProfiles.mockReturnValue({
      error: null,
      isLoading: false,
      isSaving: false,
      persisted: true,
      profiles: {
        greenhouse_profile: createCompleteGreenhouseProfile(),
        stripe_profile: mergeProfileWithDefaults("stripe", {}),
        workday_profile: mergeProfileWithDefaults("workday", {}),
      },
      saveProfile: vi.fn().mockResolvedValue(undefined),
      uploadResume: vi.fn().mockResolvedValue(createResumeReference()),
      userKey: "user-1",
    });
  });

  it("reopens a completed saved schema in edit mode from settings", async () => {
    render(<ApplicationProfileSettingsCard />);

    expect(screen.getByText("Reusable apply schemas")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit Greenhouse profile" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Edit Greenhouse profile" }));

    expect(
      await screen.findByRole("dialog", { name: "Edit your saved profile" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Reusable settings")).toBeInTheDocument();
    expect(screen.getByText("Future applications")).toBeInTheDocument();
  });

  it("shows loading copy while the saved profiles hydrate", () => {
    mockUseApplicationProfiles.mockReturnValue({
      error: null,
      isLoading: true,
      isSaving: false,
      persisted: true,
      profiles: {
        greenhouse_profile: mergeProfileWithDefaults("greenhouse", {}),
        stripe_profile: mergeProfileWithDefaults("stripe", {}),
        workday_profile: mergeProfileWithDefaults("workday", {}),
      },
      saveProfile: vi.fn(),
      uploadResume: vi.fn(),
      userKey: "user-1",
    });

    render(<ApplicationProfileSettingsCard />);

    expect(screen.getByText("Loading your saved application profiles…")).toBeInTheDocument();
  });
});
