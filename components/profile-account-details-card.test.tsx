import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProfileAccountDetailsCard } from "@/components/profile-account-details-card";

const mockRefresh = vi.fn();
const mockUpdateSession = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: mockRefresh,
  }),
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    update: mockUpdateSession,
  }),
}));

describe("ProfileAccountDetailsCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it("saves editable profile fields and refreshes the session label", async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "tal_123",
        talentAgentId: "TAID-000123",
        email: "alex@example.com",
        phoneOptional: "555-2222",
        firstName: "Alex",
        lastName: "Morgan",
        displayName: "Alex Morgan",
        countryCode: "US",
        status: "ACTIVE",
        createdAt: "2026-04-10T00:00:00.000Z",
        updatedAt: "2026-04-10T00:00:00.000Z",
        soulRecord: {
          id: "soul_123",
          trustSummaryId: null,
          defaultShareProfileId: null,
          createdAt: "2026-04-10T00:00:00.000Z",
          updatedAt: "2026-04-10T00:00:00.000Z",
          version: 1,
        },
        privacySettings: {
          id: "privacy_123",
          showEmploymentRecords: false,
          showEducationRecords: false,
          showCertificationRecords: false,
          showEndorsements: false,
          showStatusLabels: false,
          showArtifactPreviews: false,
          allowPublicShareLink: false,
          allowQrShare: false,
          updatedAt: "2026-04-10T00:00:00.000Z",
        },
      }),
    } as Response);

    render(
      <ProfileAccountDetailsCard
        initialCountryCode="ZZ"
        initialDisplayName="Alex Rivera"
        initialEmail="alex@example.com"
        initialFirstName="Alex"
        initialLastName="Rivera"
        initialPhoneOptional={null}
        readOnlyRows={[{ label: "Account type", value: "Employer" }]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /edit profile/i }));
    fireEvent.change(screen.getByLabelText(/last name/i), {
      target: { value: "Morgan" },
    });
    fireEvent.change(screen.getByLabelText(/phone/i), {
      target: { value: "555-2222" },
    });
    fireEvent.change(screen.getByLabelText(/country code/i), {
      target: { value: "us" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith("/api/v1/me/talent-identity", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          lastName: "Morgan",
          phoneOptional: "555-2222",
          countryCode: "US",
        }),
      });
    });

    await waitFor(() => {
      expect(mockUpdateSession).toHaveBeenCalledWith({ name: "Alex Morgan" });
      expect(mockRefresh).toHaveBeenCalled();
    });

    expect(await screen.findByText("Profile updated.")).toBeInTheDocument();
    expect(screen.getByText("Alex Morgan")).toBeInTheDocument();
  });
});
