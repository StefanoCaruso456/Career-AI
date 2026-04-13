import { render, screen } from "@testing-library/react";
import type { AnchorHTMLAttributes } from "react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  listCandidateAccessRequests: vi.fn(),
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
}));

vi.mock("@/auth", () => ({
  auth: mocks.auth,
}));

vi.mock("@/packages/audit-security/src", () => ({
  resolveSessionAuthenticatedActor: mocks.resolveSessionAuthenticatedActor,
}));

vi.mock("@/packages/access-request-domain/src", () => ({
  listCandidateAccessRequests: mocks.listCandidateAccessRequests,
}));

describe("AccountAccessRequestsPage", () => {
  it("renders pending access requests for the candidate inbox", async () => {
    mocks.auth.mockResolvedValue({
      user: {
        email: "candidate@example.com",
      },
    });
    mocks.resolveSessionAuthenticatedActor.mockReturnValue({
      actorId: "tal_123",
      actorType: "talent_user",
    });
    mocks.listCandidateAccessRequests.mockResolvedValue({
      items: [
        {
          createdAt: "2026-04-13T00:00:00.000Z",
          grantedAt: null,
          id: "access_req_123",
          justification: "Need final-stage verification review.",
          rejectedAt: null,
          requestedDurationDaysOptional: 30,
          reviewPath: "/access-requests/access_req_123",
          requester: {
            organizationId: "org_123",
            organizationName: "Northstar Hiring",
            requesterName: "Riley Recruiter",
            requesterUserId: "user_123",
          },
          scope: "candidate_private_profile",
          status: "pending",
          subject: {
            displayName: "Casey Candidate",
            talentIdentityId: "tal_123",
          },
          updatedAt: "2026-04-13T00:00:00.000Z",
        },
      ],
    });

    const Page = (await import("@/app/account/access-requests/page")).default;

    render(await Page());

    expect(screen.getByText("Career ID access requests")).toBeInTheDocument();
    expect(screen.getByText("Northstar Hiring")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /review securely/i })).toHaveAttribute(
      "href",
      "/access-requests/access_req_123",
    );
  });
});
