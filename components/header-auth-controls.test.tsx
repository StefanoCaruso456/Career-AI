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

  it("shows the account holder in the trigger and opens the workspace menu", () => {
    window.localStorage.setItem("career-ai.preferred-persona", "employer");
    mockUsePathname.mockReturnValue("/employer");
    mockUseSession.mockReturnValue({
      data: {
        user: {
          email: "alex@company.com",
          name: "Alex Rivera",
          onboardingStatus: "completed",
          roleType: "recruiter",
        },
      },
      status: "authenticated",
    });

    render(<HeaderAuthControls />);

    expect(screen.getByText("Alex Rivera")).toBeInTheDocument();
    expect(screen.getByText("Employer")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /alex rivera/i }));

    expect(screen.getByRole("menuitem", { name: /profile & account/i })).toHaveAttribute(
      "href",
      "/employer/settings",
    );
    expect(screen.getByRole("menuitem", { name: /^workspace$/i })).toHaveAttribute("href", "/employer");
    expect(screen.getAllByText("Employer").length).toBeGreaterThan(0);
    expect(screen.queryByText(/finish setup to unlock/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/google currently manages/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/review name, email, password guidance/i)).not.toBeInTheDocument();
  });

  it("keeps the trigger identity-focused while keeping employer settings sticky", () => {
    window.localStorage.setItem("career-ai.preferred-persona", "job_seeker");
    mockUsePathname.mockReturnValue("/settings");
    mockUseSession.mockReturnValue({
      data: {
        user: {
          currentStep: 1,
          email: "alex@company.com",
          name: "Alex Rivera",
          onboardingStatus: "in_progress",
          roleType: "recruiter",
        },
      },
      status: "authenticated",
    });

    render(<HeaderAuthControls />);

    expect(screen.getByText("Alex Rivera")).toBeInTheDocument();
    expect(screen.getByText("Employer")).toBeInTheDocument();
    expect(screen.queryByText(/step 1 of 4/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /alex rivera/i }));

    expect(screen.getByRole("menuitem", { name: /finish onboarding/i })).toHaveAttribute(
      "href",
      "/onboarding",
    );
    expect(screen.getByRole("menuitem", { name: /profile & account/i })).toHaveAttribute(
      "href",
      "/employer/settings",
    );
  });
});
