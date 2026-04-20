import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HeaderAuthControls } from "@/components/header-auth-controls";

const mockUseSession = vi.fn();
const mockUsePathname = vi.fn();

vi.mock("next-auth/react", () => ({
  signOut: vi.fn(),
  useSession: () => mockUseSession(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
}));

vi.mock("@/components/auth-modal", () => ({
  AuthModalTrigger: ({ label }: { label: string }) => <button type="button">{label}</button>,
}));

describe("HeaderAuthControls", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  it("opens a settings menu with the current workspace and persona-aware profile link", () => {
    window.localStorage.setItem("career-ai.preferred-persona", "employer");
    mockUsePathname.mockReturnValue("/employer");
    mockUseSession.mockReturnValue({
      data: {
        user: {
          email: "alex@company.com",
          name: "Alex Rivera",
        },
      },
      status: "authenticated",
    });

    render(<HeaderAuthControls googleOAuthEnabled />);

    fireEvent.click(screen.getByRole("button", { name: /settings/i }));

    expect(screen.getByRole("menuitem", { name: /profile & account/i })).toHaveAttribute(
      "href",
      "/employer/settings",
    );
    expect(screen.getByRole("menuitem", { name: /open workspace/i })).toHaveAttribute("href", "/employer");
    expect(screen.getByText("Employer")).toBeInTheDocument();
  });

  it("sends candidates to account settings when the route is ambiguous", () => {
    window.localStorage.setItem("career-ai.preferred-persona", "employer");
    mockUsePathname.mockReturnValue("/settings");
    mockUseSession.mockReturnValue({
      data: {
        user: {
          email: "casey@example.com",
          name: "Casey Rivera",
          roleType: "candidate",
        },
      },
      status: "authenticated",
    });

    render(<HeaderAuthControls googleOAuthEnabled />);

    fireEvent.click(screen.getByRole("button", { name: /settings/i }));

    expect(screen.getByRole("menuitem", { name: /profile & account/i })).toHaveAttribute(
      "href",
      "/account/settings",
    );
  });

  it("routes incomplete employer onboarding back to the onboarding flow", () => {
    window.localStorage.setItem("career-ai.preferred-persona", "employer");
    mockUsePathname.mockReturnValue("/employer");
    mockUseSession.mockReturnValue({
      data: {
        user: {
          currentStep: 4,
          email: "alex@company.com",
          name: "Alex Rivera",
          onboardingStatus: "in_progress",
        },
      },
      status: "authenticated",
    });

    render(<HeaderAuthControls googleOAuthEnabled />);

    fireEvent.click(screen.getByRole("button", { name: /settings/i }));

    expect(screen.getByRole("menuitem", { name: /finish onboarding/i })).toHaveAttribute(
      "href",
      "/onboarding",
    );
    expect(
      screen.getByText("Finish step 4 of 4 to unlock the full employer workspace."),
    ).toBeInTheDocument();
  });
});
