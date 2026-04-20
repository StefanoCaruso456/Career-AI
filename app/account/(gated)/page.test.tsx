import { render, screen } from "@testing-library/react";
import type { AnchorHTMLAttributes, ImgHTMLAttributes } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  ensurePersistentCareerIdentityForSessionUser: vi.fn(),
}));

vi.mock("@/auth", () => ({
  auth: mocks.auth,
}));

vi.mock("@/auth-identity", () => ({
  ensurePersistentCareerIdentityForSessionUser: mocks.ensurePersistentCareerIdentityForSessionUser,
  getDisplayNameForContext: (context: { user: { fullName: string } }) => context.user.fullName,
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    prefetch: _prefetch,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string;
    prefetch?: boolean;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next/image", () => ({
  default: (props: ImgHTMLAttributes<HTMLImageElement>) => <img alt="" {...props} />,
}));

describe("AccountPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders a recovery state instead of redirect looping when the session is missing", async () => {
    mocks.auth.mockResolvedValue(null);

    const Page = (await import("@/app/account/(gated)/page")).default;

    render(await Page());

    expect(screen.getByText("We need to re-check your account session")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /sign in again/i })).toHaveAttribute(
      "href",
      "/sign-in?callbackUrl=%2Faccount",
    );
  });

  it("renders the persistent account overview when identity hydration succeeds", async () => {
    mocks.auth.mockResolvedValue({
      user: {
        appUserId: "user_123",
        authProvider: "google",
        email: "casey@example.com",
        image: null,
        name: "Casey Candidate",
        providerUserId: "google_123",
      },
    });
    mocks.ensurePersistentCareerIdentityForSessionUser.mockResolvedValue({
      context: {
        user: {
          authProvider: "google",
          email: "casey@example.com",
          fullName: "Casey Candidate",
          imageUrl: null,
          lastLoginAt: "2026-04-20T19:00:00.000Z",
        },
        onboarding: {
          profile: {
            intent: "Find a senior product role",
          },
          profileCompletionPercent: 92,
          roleType: "candidate",
          status: "completed",
        },
        aggregate: {
          soulRecord: {
            id: "soul_123",
          },
          talentIdentity: {
            id: "tal_123",
            talent_agent_id: "TAID-000123",
          },
        },
      },
    });

    const Page = (await import("@/app/account/(gated)/page")).default;

    render(await Page());

    expect(
      screen.getByRole("heading", { level: 1, name: "Casey Candidate" }),
    ).toBeInTheDocument();
    expect(screen.getByText("TAID-000123")).toBeInTheDocument();
    expect(screen.getByText(/career intent:/i)).toHaveTextContent(
      "Career intent: Find a senior product role",
    );
  });

  it("renders a recovery state when identity hydration fails", async () => {
    mocks.auth.mockResolvedValue({
      user: {
        email: "casey@example.com",
      },
    });
    mocks.ensurePersistentCareerIdentityForSessionUser.mockRejectedValue(new Error("boom"));

    const Page = (await import("@/app/account/(gated)/page")).default;

    render(await Page());

    expect(
      screen.getByText("We could not load your account overview right now"),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /browse jobs/i })).toHaveAttribute("href", "/jobs");
  });
});
