import { render, screen } from "@testing-library/react";
import type { AnchorHTMLAttributes } from "react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  getAccessRequestReview: vi.fn(),
  redirect: vi.fn(),
  resolveSessionAuthenticatedActor: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
  useRouter: () => ({
    refresh: vi.fn(),
  }),
}));

vi.mock("@/auth", () => ({
  auth: mocks.auth,
}));

vi.mock("@/packages/audit-security/src", () => ({
  resolveSessionAuthenticatedActor: mocks.resolveSessionAuthenticatedActor,
}));

vi.mock("@/packages/access-request-domain/src", () => ({
  getAccessRequestReview: mocks.getAccessRequestReview,
}));

describe("AccessRequestReviewPage", () => {
  it("renders the secure request review details from the shared page", async () => {
    mocks.auth.mockResolvedValue({
      user: {
        email: "candidate@example.com",
      },
    });
    mocks.resolveSessionAuthenticatedActor.mockReturnValue({
      actorId: "tal_123",
      actorType: "talent_user",
    });
    mocks.getAccessRequestReview.mockResolvedValue({
      grantedExpiresAtOptional: null,
      id: "access_req_123",
      justification: "Need final-stage verification review.",
      requestedDurationDaysOptional: 30,
      requester: {
        organizationId: "org_123",
        organizationName: "Northstar Hiring",
        requesterName: "Riley Recruiter",
        requesterUserId: "user_123",
      },
      reviewAccess: {
        channel: "session_owner",
        tokenValidated: false,
      },
      scope: "candidate_private_profile",
      status: "pending",
      subject: {
        displayName: "Casey Candidate",
        talentIdentityId: "tal_123",
      },
    });

    const Page = (await import("@/app/access-requests/[requestId]/page")).default;

    render(
      await Page({
        params: Promise.resolve({
          requestId: "access_req_123",
        }),
        searchParams: Promise.resolve({}),
      }),
    );

    expect(screen.getByText("Review Career ID access request")).toBeInTheDocument();
    expect(screen.getByText("Northstar Hiring")).toBeInTheDocument();
    expect(screen.getByText("Need final-stage verification review.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /approve request/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reject request/i })).toBeInTheDocument();
  });
});
