import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RecruiterMarketplacePanel } from "./recruiter-marketplace-panel";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: {
      "content-type": "application/json",
    },
    status,
  });
}

describe("RecruiterMarketplacePanel", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders recruiter discovery with initial access state", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

      if (url.endsWith("/api/v1/employer-partners")) {
        return jsonResponse({
          items: [
            {
              id: "emp_stripe",
              slug: "stripe",
              displayName: "Stripe",
              legalNameOptional: null,
              websiteUrlOptional: "https://www.stripe.com",
              logoUrlOptional: null,
              status: "active",
              createdAt: "2026-04-19T00:00:00.000Z",
              updatedAt: "2026-04-19T00:00:00.000Z",
            },
          ],
        });
      }

      if (url.endsWith("/api/v1/employer-partners/emp_stripe/recruiters")) {
        return jsonResponse({
          employerPartnerId: "emp_stripe",
          items: [
            {
              id: "rec_stripe_primary",
              agentId: "careerai.agent.recruiter.rec_stripe_primary",
              employerPartnerId: "emp_stripe",
              displayName: "Avery Patel",
              recruiterRoleTitle: "Principal Technical Recruiter",
              bio: "Leads hiring for platform and product engineering teams.",
              companyName: "Stripe",
              status: "active",
              visibility: "public_directory",
              isSynthetic: true,
              avatarUrlOptional: null,
              ownershipScopeJson: {},
              createdAt: "2026-04-19T00:00:00.000Z",
              updatedAt: "2026-04-19T00:00:00.000Z",
            },
          ],
        });
      }

      if (url.endsWith("/api/v1/recruiters/rec_stripe_primary/access-status")) {
        return jsonResponse({
          recruiterCareerIdentityId: "rec_stripe_primary",
          employerPartnerId: "emp_stripe",
          jobSeekerCareerIdentityId: "cid_1",
          hasAccess: false,
          grant: null,
        });
      }

      if (url.endsWith("/api/v1/recruiters/rec_stripe_primary")) {
        return jsonResponse({
          recruiter: {
            id: "rec_stripe_primary",
            agentId: "careerai.agent.recruiter.rec_stripe_primary",
            employerPartnerId: "emp_stripe",
            displayName: "Avery Patel",
            recruiterRoleTitle: "Principal Technical Recruiter",
            bio: "Leads hiring for platform and product engineering teams.",
            companyName: "Stripe",
            status: "active",
            visibility: "public_directory",
            isSynthetic: true,
            avatarUrlOptional: null,
            ownershipScopeJson: {},
            createdAt: "2026-04-19T00:00:00.000Z",
            updatedAt: "2026-04-19T00:00:00.000Z",
          },
        });
      }

      return jsonResponse({
        message: `Unexpected request: ${init?.method ?? "GET"} ${url}`,
      }, 500);
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<RecruiterMarketplacePanel />);

    expect(await screen.findByText("Recruiter Marketplace")).toBeInTheDocument();
    expect(await screen.findByText("Avery Patel")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Request recruiter access" })).toBeInTheDocument();
  });

  it("requests access and unlocks recruiter-scoped jobs and chat", async () => {
    let accessApproved = false;

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const method = init?.method ?? "GET";

      if (url.endsWith("/api/v1/employer-partners")) {
        return jsonResponse({
          items: [
            {
              id: "emp_stripe",
              slug: "stripe",
              displayName: "Stripe",
              legalNameOptional: null,
              websiteUrlOptional: "https://www.stripe.com",
              logoUrlOptional: null,
              status: "active",
              createdAt: "2026-04-19T00:00:00.000Z",
              updatedAt: "2026-04-19T00:00:00.000Z",
            },
          ],
        });
      }

      if (url.endsWith("/api/v1/employer-partners/emp_stripe/recruiters")) {
        return jsonResponse({
          employerPartnerId: "emp_stripe",
          items: [
            {
              id: "rec_stripe_primary",
              agentId: "careerai.agent.recruiter.rec_stripe_primary",
              employerPartnerId: "emp_stripe",
              displayName: "Avery Patel",
              recruiterRoleTitle: "Principal Technical Recruiter",
              bio: "Leads hiring for platform and product engineering teams.",
              companyName: "Stripe",
              status: "active",
              visibility: "public_directory",
              isSynthetic: true,
              avatarUrlOptional: null,
              ownershipScopeJson: {},
              createdAt: "2026-04-19T00:00:00.000Z",
              updatedAt: "2026-04-19T00:00:00.000Z",
            },
          ],
        });
      }

      if (url.endsWith("/api/v1/recruiters/rec_stripe_primary/access-requests") && method === "POST") {
        accessApproved = true;
        return jsonResponse({
          grant: {
            status: "approved",
          },
        }, 201);
      }

      if (url.endsWith("/api/v1/recruiters/rec_stripe_primary/access-status")) {
        return jsonResponse({
          recruiterCareerIdentityId: "rec_stripe_primary",
          employerPartnerId: "emp_stripe",
          jobSeekerCareerIdentityId: "cid_1",
          hasAccess: accessApproved,
          grant: accessApproved
            ? {
                status: "approved",
              }
            : null,
        });
      }

      if (url.endsWith("/api/v1/recruiters/rec_stripe_primary/jobs")) {
        return jsonResponse({
          recruiterCareerIdentityId: "rec_stripe_primary",
          jobs: [
            {
              id: "rjob_stripe_1",
              recruiterCareerIdentityId: "rec_stripe_primary",
              employerPartnerId: "emp_stripe",
              title: "Senior Machine Learning Platform Engineer",
              location: "Remote - United States",
              department: "AI Platform Engineering",
              employmentType: "Full-time",
              seniority: "Senior",
              compensationMin: 185000,
              compensationMax: 250000,
              compensationCurrency: "USD",
              description: "Build production ML infrastructure.",
              responsibilities: [],
              qualifications: [],
              preferredQualifications: [],
              status: "open",
              visibility: "discoverable",
              searchableText: "ml platform engineer",
              retrievalMetadataJson: {},
              isSynthetic: true,
              createdAt: "2026-04-19T00:00:00.000Z",
              updatedAt: "2026-04-19T00:00:00.000Z",
            },
          ],
        });
      }

      if (url.endsWith("/api/v1/recruiters/rec_stripe_primary")) {
        return jsonResponse({
          recruiter: {
            id: "rec_stripe_primary",
            agentId: "careerai.agent.recruiter.rec_stripe_primary",
            employerPartnerId: "emp_stripe",
            displayName: "Avery Patel",
            recruiterRoleTitle: "Principal Technical Recruiter",
            bio: "Leads hiring for platform and product engineering teams.",
            companyName: "Stripe",
            status: "active",
            visibility: "public_directory",
            isSynthetic: true,
            avatarUrlOptional: null,
            ownershipScopeJson: {},
            createdAt: "2026-04-19T00:00:00.000Z",
            updatedAt: "2026-04-19T00:00:00.000Z",
          },
        });
      }

      return jsonResponse({
        message: `Unexpected request: ${method} ${url}`,
      }, 500);
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<RecruiterMarketplacePanel />);

    const requestButton = await screen.findByRole("button", {
      name: "Request recruiter access",
    });
    fireEvent.click(requestButton);

    await waitFor(() => {
      expect(accessApproved).toBe(true);
    });

    expect(await screen.findByText("Recruiter-scoped chat")).toBeInTheDocument();
    expect(await screen.findByText("Senior Machine Learning Platform Engineer")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send" })).toBeInTheDocument();
  });
});
