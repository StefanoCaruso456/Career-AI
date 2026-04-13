import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  authMock: vi.fn(),
  listPendingReviewQueue: vi.fn(),
}));

vi.mock("@/auth", () => ({
  auth: mocks.authMock,
}));

vi.mock("@/packages/admin-ops/src", () => ({
  listPendingReviewQueue: mocks.listPendingReviewQueue,
}));

import { listAuditEvents, resetAuditStore } from "@/packages/audit-security/src";
import { GET } from "./route";

describe("GET /api/v1/admin/review-queue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authMock.mockResolvedValue(null);
    resetAuditStore();
    delete process.env.INTERNAL_SERVICE_AUTH_TOKENS;
  });

  it("returns unauthorized and writes a durable audit event when no verified actor exists", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/v1/admin/review-queue"),
    );
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.error_code).toBe("UNAUTHORIZED");
    expect(mocks.listPendingReviewQueue).not.toHaveBeenCalled();
    expect(listAuditEvents()).toContainEqual(
      expect.objectContaining({
        correlation_id: expect.any(String),
        event_type: "security.auth.denied",
        target_id: "/api/v1/admin/review-queue",
        target_type: "route",
      }),
    );
  });
});
