import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mergeProfileWithDefaults } from "@/lib/application-profiles/defaults";
import type { AnyApplicationProfile } from "@/lib/application-profiles/types";
import { ApplicationProfileWizard } from "./application-profile-wizard";

const onPersistProfile = vi.fn();
const onSubmitProfile = vi.fn();
const onUploadResume = vi.fn();
const scrollIntoView = vi.fn();

function createRequiredBasicWorkdayProfile(
  overrides: Partial<AnyApplicationProfile> = {},
): AnyApplicationProfile {
  return mergeProfileWithDefaults("workday", {
    address_line_1: "204 University Lands Dr",
    application_source: "Career AI",
    city: "Liberty Hill",
    country_phone_code: "1",
    country_territory: "United States",
    email: "stefano@example.com",
    first_name: "Stefano",
    last_name: "Caruso",
    password: "Secret123!",
    phone_device_type: "mobile",
    phone_number: "7372678445",
    postal_code: "78642",
    state_region: "Texas",
    verify_password: "Secret123!",
    ...overrides,
  });
}

function WizardHarness(props: {
  initialProfile: AnyApplicationProfile;
  onPersistProfile?: (profile: AnyApplicationProfile) => Promise<void>;
}) {
  const [profile, setProfile] = useState(props.initialProfile);

  return (
    <ApplicationProfileWizard
      isSaving={false}
      isUploadingResume={false}
      mode="complete-profile"
      onCancel={vi.fn()}
      onChangeProfile={setProfile}
      onPersistProfile={props.onPersistProfile}
      onSubmitProfile={onSubmitProfile}
      onUploadResume={onUploadResume}
      persisted={true}
      profile={profile}
      saveError={null}
      schemaFamily="workday"
    />
  );
}

describe("ApplicationProfileWizard", () => {
  beforeEach(() => {
    onPersistProfile.mockReset();
    onSubmitProfile.mockReset();
    onUploadResume.mockReset();
    scrollIntoView.mockReset();
    Element.prototype.scrollIntoView = scrollIntoView;
  });

  it("surfaces a clear validation message and scrolls to the first invalid field", async () => {
    render(
      <ApplicationProfileWizard
        isSaving={false}
        isUploadingResume={false}
        mode="complete-profile"
        onCancel={vi.fn()}
        onChangeProfile={vi.fn()}
        onPersistProfile={onPersistProfile}
        onSubmitProfile={onSubmitProfile}
        onUploadResume={onUploadResume}
        persisted={true}
        profile={createRequiredBasicWorkdayProfile({
          first_name: "",
        })}
        saveError={null}
        schemaFamily="workday"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(
      await screen.findByText("Complete the required fields above before continuing."),
    ).toBeInTheDocument();
    expect(onPersistProfile).not.toHaveBeenCalled();
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it("persists the current draft before advancing to the next step", async () => {
    onPersistProfile.mockResolvedValue(undefined);

    render(
      <WizardHarness
        initialProfile={createRequiredBasicWorkdayProfile({
          first_name: "",
        })}
        onPersistProfile={onPersistProfile}
      />,
    );

    fireEvent.change(screen.getByLabelText("First name"), {
      target: { value: "Stefano" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => {
      expect(onPersistProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          first_name: "Stefano",
        }),
      );
    });

    expect(await screen.findByRole("heading", { name: "Resume" })).toBeInTheDocument();
  });
});
