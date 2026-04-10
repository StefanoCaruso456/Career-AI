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

  it("shows the current account label in the trigger and opens the workspace menu", () => {
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
    expect(screen.getByText("Employer workspace")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /alex rivera/i }));

    expect(screen.getByRole("menuitem", { name: /profile & account/i })).toHaveAttribute("href", "/settings");
    expect(screen.getByRole("menuitem", { name: /open workspace/i })).toHaveAttribute("href", "/employer");
    expect(screen.getByText("Employer")).toBeInTheDocument();
  });
});
