import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RecruiterAccessRequestPanel } from "./recruiter-access-request-panel";

describe("RecruiterAccessRequestPanel", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("posts a new access request and refreshes recruiter status", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          items: [],
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 403 }))
      .mockResolvedValueOnce(Response.json({ id: "access_req_123" }, { status: 201 }))
      .mockResolvedValueOnce(
        Response.json({
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
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 403 }));

    vi.stubGlobal("fetch", fetchMock);

    render(<RecruiterAccessRequestPanel candidateId="tal_123" candidateName="Casey Candidate" />);

    await screen.findByText(/no private access request has been sent/i);

    fireEvent.change(screen.getByLabelText(/why are you requesting access/i), {
      target: {
        value: "Need final-stage verification review.",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: /request career id access/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/v1/access-requests",
        expect.objectContaining({
          method: "POST",
        }),
      );
    });
    expect(await screen.findByText(/access request sent/i)).toBeInTheDocument();
    expect(await screen.findByText("Northstar Hiring")).toBeInTheDocument();
  });
});
