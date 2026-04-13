import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  authMock: vi.fn(),
  getRecruiterTrustProfileByToken: vi.fn(),
}));

vi.mock("@/auth", () => ({
  auth: mocks.authMock,
}));

vi.mock("@/packages/recruiter-read-model/src", () => ({
  getRecruiterTrustProfileByToken: mocks.getRecruiterTrustProfileByToken,
}));

import { GET } from "./route";

describe("GET /api/v1/share-profiles/[shareProfileKey]", () => {
  const originalInternalServiceAuthTokens = process.env.INTERNAL_SERVICE_AUTH_TOKENS;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authMock.mockResolvedValue(null);
    mocks.getRecruiterTrustProfileByToken.mockResolvedValue({
      profileId: "share_public_123",
    });
    delete process.env.INTERNAL_SERVICE_AUTH_TOKENS;
  });

  afterEach(() => {
    if (originalInternalServiceAuthTokens === undefined) {
      delete process.env.INTERNAL_SERVICE_AUTH_TOKENS;
      return;
    }

    process.env.INTERNAL_SERVICE_AUTH_TOKENS = originalInternalServiceAuthTokens;
  });

  it("keeps the share profile route explicitly public without trusting actor headers", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/v1/share-profiles/share_public_123"),
      {
        params: Promise.resolve({
          shareProfileKey: "share_public_123",
        }),
      },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      profileId: "share_public_123",
    });
    expect(mocks.getRecruiterTrustProfileByToken).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "public_request",
        actorType: "system_service",
        token: "share_public_123",
      }),
    );
  });
});
