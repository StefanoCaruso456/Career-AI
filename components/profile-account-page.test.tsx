import { render, screen } from "@testing-library/react";
import type { ImgHTMLAttributes } from "react";
import { describe, expect, it, vi } from "vitest";
import { ProfileAccountPage } from "@/components/profile-account-page";
import type { PersistentTalentIdentityContext } from "@/packages/persistence/src";

vi.mock("next/image", () => ({
  default: (props: ImgHTMLAttributes<HTMLImageElement>) => <img alt="" {...props} />,
}));

vi.mock("@/components/persona-preference-sync", () => ({
  PersonaPreferenceSync: ({ persona }: { persona: string }) => (
    <div data-testid="persona-sync">{persona}</div>
  ),
}));

vi.mock("@/components/profile-account-details-card", () => ({
  ProfileAccountDetailsCard: () => <div data-testid="profile-account-details-card" />,
}));

function createContext(roleType: string): PersistentTalentIdentityContext {
  return {
    aggregate: {
      talentIdentity: {
        country_code: "US",
        display_name: "Stefano Caruso",
        id: "talent_123",
        phone_optional: null,
        talent_agent_id: "TAID-000123",
      },
    },
    applicationProfiles: {},
    onboarding: {
      currentStep: 4,
      profile: {},
      profileCompletionPercent: 100,
      roleType,
      status: "completed",
    },
    user: {
      appUserId: "user_123",
      authProvider: "google",
      createdAt: "2026-04-20T12:00:00.000Z",
      email: "stefanocaruso333@gmail.com",
      emailVerified: true,
      firstName: "Stefano",
      fullName: "Stefano Caruso",
      id: "user_123",
      imageUrl: null,
      lastLoginAt: "2026-04-20T12:00:00.000Z",
      lastName: "Caruso",
      preferredPersona: "employer",
      providerUserId: "google_123",
      updatedAt: "2026-04-20T12:00:00.000Z",
    },
  } as PersistentTalentIdentityContext;
}

describe("ProfileAccountPage", () => {
  it("adds employer workspace and roles surfaces to employer settings", () => {
    render(<ProfileAccountPage context={createContext("recruiter")} preferredPersona="employer" />);

    expect(screen.getByText("Workspace and access settings")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open hiring workspace/i })).toHaveAttribute(
      "href",
      "/employer",
    );
    expect(screen.getByRole("link", { name: /open candidate pipeline/i })).toHaveAttribute(
      "href",
      "/employer/candidates",
    );
    expect(screen.getByRole("link", { name: /open roles & permissions/i })).toHaveAttribute(
      "href",
      "/employer/roles",
    );
    expect(screen.getByText("Role-based access controls")).toBeInTheDocument();
  });

  it("keeps employer-only controls out of the job seeker settings page", () => {
    render(<ProfileAccountPage context={createContext("candidate")} preferredPersona="job_seeker" />);

    expect(screen.queryByText("Workspace and access settings")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /open roles & permissions/i })).not.toBeInTheDocument();
  });
});
