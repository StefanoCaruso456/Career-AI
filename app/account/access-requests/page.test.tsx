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
          grantIdOptional: null,
          grantLifecycleStatusOptional: null,
          grantRevokedAtOptional: null,
          grantedAt: null,
          grantedExpiresAtOptional: null,
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
    expect(screen.getByLabelText("0 active grants")).toBeInTheDocument();
    expect(screen.getByLabelText("1 pending request")).toBeInTheDocument();
    expect(screen.getByText("Northstar Hiring")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /review securely/i })).toHaveAttribute(
      "href",
      "/access-requests/access_req_123",
    );
  });

  it("renders active grant management links for already-approved access", async () => {
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
          grantIdOptional: "access_grant_123",
          grantLifecycleStatusOptional: "active",
          grantRevokedAtOptional: null,
          grantedAt: "2026-04-13T00:01:00.000Z",
          grantedExpiresAtOptional: "2026-05-13T00:01:00.000Z",
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
          status: "granted",
          subject: {
            displayName: "Casey Candidate",
            talentIdentityId: "tal_123",
          },
          updatedAt: "2026-04-13T00:01:00.000Z",
        },
      ],
    });

    const Page = (await import("@/app/account/access-requests/page")).default;

    render(await Page());

    expect(screen.getByText("Active grants")).toBeInTheDocument();
    expect(screen.getByLabelText("1 active grant")).toBeInTheDocument();
    expect(screen.getByLabelText("0 pending requests")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /manage grant/i })).toHaveAttribute(
      "href",
      "/access-requests/access_req_123",
    );
  });

  it("keeps the metric pills aligned to current live counts instead of revoked history", async () => {
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
          grantIdOptional: "access_grant_active",
          grantLifecycleStatusOptional: "active",
          grantRevokedAtOptional: null,
          grantedAt: "2026-04-13T00:01:00.000Z",
          grantedExpiresAtOptional: "2026-05-13T00:01:00.000Z",
          id: "access_req_active",
          justification: "Need final-stage verification review.",
          rejectedAt: null,
          requestedDurationDaysOptional: 30,
          reviewPath: "/access-requests/access_req_active",
          requester: {
            organizationId: "org_active",
            organizationName: "Northstar Hiring",
            requesterName: "Riley Recruiter",
            requesterUserId: "user_active",
          },
          scope: "candidate_private_profile",
          status: "granted",
          subject: {
            displayName: "Casey Candidate",
            talentIdentityId: "tal_123",
          },
          updatedAt: "2026-04-13T00:01:00.000Z",
        },
        {
          createdAt: "2026-04-14T00:00:00.000Z",
          grantIdOptional: null,
          grantLifecycleStatusOptional: null,
          grantRevokedAtOptional: null,
          grantedAt: null,
          grantedExpiresAtOptional: null,
          id: "access_req_pending",
          justification: "Need portfolio review access.",
          rejectedAt: null,
          requestedDurationDaysOptional: 14,
          reviewPath: "/access-requests/access_req_pending",
          requester: {
            organizationId: "org_pending",
            organizationName: "South Ridge",
            requesterName: "Morgan Recruiter",
            requesterUserId: "user_pending",
          },
          scope: "candidate_private_profile",
          status: "pending",
          subject: {
            displayName: "Casey Candidate",
            talentIdentityId: "tal_123",
          },
          updatedAt: "2026-04-14T00:00:00.000Z",
        },
        {
          createdAt: "2026-04-12T00:00:00.000Z",
          grantIdOptional: "access_grant_revoked",
          grantLifecycleStatusOptional: "revoked",
          grantRevokedAtOptional: "2026-04-15T00:00:00.000Z",
          grantedAt: "2026-04-12T00:01:00.000Z",
          grantedExpiresAtOptional: "2026-05-12T00:01:00.000Z",
          id: "access_req_revoked",
          justification: "Previously approved access.",
          rejectedAt: null,
          requestedDurationDaysOptional: 30,
          reviewPath: "/access-requests/access_req_revoked",
          requester: {
            organizationId: "org_revoked",
            organizationName: "Legacy Search",
            requesterName: "Jamie Recruiter",
            requesterUserId: "user_revoked",
          },
          scope: "candidate_private_profile",
          status: "granted",
          subject: {
            displayName: "Casey Candidate",
            talentIdentityId: "tal_123",
          },
          updatedAt: "2026-04-15T00:00:00.000Z",
        },
      ],
    });

    const Page = (await import("@/app/account/access-requests/page")).default;

    render(await Page());

    expect(screen.getByLabelText("1 active grant")).toBeInTheDocument();
    expect(screen.getByLabelText("1 pending request")).toBeInTheDocument();
    expect(screen.getByText("Recent decisions")).toBeInTheDocument();
    expect(screen.getByText("Legacy Search")).toBeInTheDocument();
  });
});
