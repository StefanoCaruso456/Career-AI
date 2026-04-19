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

  it("keeps a beta entrypoint visible for signed-out visitors", () => {
    mockUsePathname.mockReturnValue("/");
    mockUseSession.mockReturnValue({
      data: null,
      status: "unauthenticated",
    });

    render(<HeaderAuthControls />);

    expect(screen.getByRole("button", { name: "Beta" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Getting Started" })).toBeInTheDocument();
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

    expect(screen.getByRole("link", { name: "Beta" })).toHaveAttribute("href", "/employer");
    expect(screen.getByText("Alex Rivera")).toBeInTheDocument();
    expect(screen.getByText("Employer")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /alex rivera/i }));

    expect(screen.queryByRole("menuitem", { name: /profile & account/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /access requests/i })).not.toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /hiring workspace/i })).toHaveAttribute(
      "href",
      "/employer",
    );
    expect(screen.getAllByText("Employer").length).toBeGreaterThan(0);
    expect(screen.queryByText(/finish setup to unlock/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/google currently manages/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/review name, email, password guidance/i)).not.toBeInTheDocument();
  });

  it("keeps the trigger identity-focused while showing onboarding shortcut", () => {
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
    expect(screen.queryByRole("menuitem", { name: /profile & account/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /access requests/i })).not.toBeInTheDocument();
  });

  it("removes duplicate workspace shortcuts while inside the candidate workspace", () => {
    window.localStorage.setItem("career-ai.preferred-persona", "job_seeker");
    mockUsePathname.mockReturnValue("/account");
    mockUseSession.mockReturnValue({
      data: {
        user: {
          currentStep: 4,
          email: "casey@example.com",
          name: "Casey Candidate",
          onboardingStatus: "completed",
          roleType: "candidate",
        },
      },
      status: "authenticated",
    });

    render(<HeaderAuthControls />);

    fireEvent.click(screen.getByRole("button", { name: /casey candidate/i }));

    expect(screen.queryByRole("menuitem", { name: /career workspace/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /profile & account/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /access requests/i })).not.toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /sign out/i })).toBeInTheDocument();
  });

  it("keeps only candidate workspace shortcut available outside the workspace shell", () => {
    window.localStorage.setItem("career-ai.preferred-persona", "job_seeker");
    mockUsePathname.mockReturnValue("/jobs");
    mockUseSession.mockReturnValue({
      data: {
        user: {
          currentStep: 4,
          email: "casey@example.com",
          name: "Casey Candidate",
          onboardingStatus: "completed",
          roleType: "candidate",
        },
      },
      status: "authenticated",
    });

    render(<HeaderAuthControls />);

    fireEvent.click(screen.getByRole("button", { name: /casey candidate/i }));

    expect(screen.getByRole("menuitem", { name: /career workspace/i })).toHaveAttribute(
      "href",
      "/account",
    );
    expect(screen.queryByRole("menuitem", { name: /profile & account/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /access requests/i })).not.toBeInTheDocument();
  });
});
