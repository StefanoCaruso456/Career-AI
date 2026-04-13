import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  authMock: vi.fn(),
  getTalentIdentity: vi.fn(),
  toTalentIdentityDetailsDto: vi.fn(),
}));

vi.mock("@/auth", () => ({
  auth: mocks.authMock,
}));

vi.mock("@/packages/identity-domain/src", () => ({
  getTalentIdentity: mocks.getTalentIdentity,
  toTalentIdentityDetailsDto: mocks.toTalentIdentityDetailsDto,
}));

import { GET } from "./route";

describe("GET /api/v1/talent-identities/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authMock.mockResolvedValue({
      user: {
        appUserId: "user_123",
        email: "person@example.com",
        roleType: "candidate",
        talentIdentityId: "tal_123",
      },
    });
    mocks.getTalentIdentity.mockResolvedValue({
      talentIdentity: {
        id: "tal_123",
      },
    });
    mocks.toTalentIdentityDetailsDto.mockReturnValue({
      id: "tal_123",
      verified: true,
    });
  });

  it("resolves the verified session actor and returns the requested identity", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/v1/talent-identities/tal_123"),
      {
        params: Promise.resolve({
          id: "tal_123",
        }),
      },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      id: "tal_123",
      verified: true,
    });
    expect(mocks.getTalentIdentity).toHaveBeenCalledWith({
      correlationId: expect.any(String),
      talentIdentityId: "tal_123",
    });
  });
});
