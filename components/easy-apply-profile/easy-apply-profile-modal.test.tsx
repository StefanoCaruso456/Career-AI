import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mergeProfileWithDefaults } from "@/lib/application-profiles/defaults";
import { EasyApplyProfileModal } from "./easy-apply-profile-modal";

function createWorkdayProfile() {
  return mergeProfileWithDefaults("workday", {
    application_source: "Career AI",
    country_phone_code: "1",
    country_territory: "United States",
    email: "stefano@example.com",
    first_name: "Stefano",
    last_name: "Caruso",
    password: "Secret123!",
    phone_device_type: "mobile",
    phone_number: "7372678445",
    verify_password: "Secret123!",
  });
}

describe("EasyApplyProfileModal", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("renders reusable profile context for the current job", async () => {
    render(
      <EasyApplyProfileModal
        companyName="Career AI"
        initialProfile={createWorkdayProfile()}
        isOpen={true}
        isSaving={false}
        jobTitle="Senior Product Designer"
        onClose={vi.fn()}
        onSaveProfile={vi.fn().mockResolvedValue(undefined)}
        onUploadResume={vi.fn()}
        persisted={true}
        schemaFamily="workday"
        userKey="user_test"
      />,
    );

    expect(
      await screen.findByRole("dialog", { name: "Fill this out once" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Career AI")).toBeInTheDocument();
    expect(screen.getByText("Senior Product Designer")).toBeInTheDocument();
    expect(screen.getByText(/Workday profile/i)).toBeInTheDocument();
  });

  it("closes when escape is pressed", async () => {
    const onClose = vi.fn();

    render(
      <EasyApplyProfileModal
        companyName="Career AI"
        initialProfile={createWorkdayProfile()}
        isOpen={true}
        isSaving={false}
        jobTitle="Senior Product Designer"
        onClose={onClose}
        onSaveProfile={vi.fn().mockResolvedValue(undefined)}
        onUploadResume={vi.fn()}
        persisted={true}
        schemaFamily="workday"
        userKey="user_test"
      />,
    );

    await screen.findByRole("dialog", { name: "Fill this out once" });

    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});
