import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAdminOpsMetrics: vi.fn(),
  getArtifactServiceMetrics: vi.fn(),
  getCredentialServiceMetrics: vi.fn(),
  getIdentityServiceMetrics: vi.fn(),
  getRecruiterReadModelMetrics: vi.fn(),
  getVerificationServiceMetrics: vi.fn(),
  getAuditEventCount: vi.fn(),
  isDatabaseConfigured: vi.fn(),
}));

vi.mock("@/packages/admin-ops/src", () => ({
  getAdminOpsMetrics: mocks.getAdminOpsMetrics,
}));

vi.mock("@/packages/audit-security/src", () => ({
  getAuditEventCount: mocks.getAuditEventCount,
}));

vi.mock("@/packages/artifact-domain/src", () => ({
  getArtifactServiceMetrics: mocks.getArtifactServiceMetrics,
}));

vi.mock("@/packages/credential-domain/src", () => ({
  getCredentialServiceMetrics: mocks.getCredentialServiceMetrics,
}));

vi.mock("@/packages/identity-domain/src", () => ({
  getIdentityServiceMetrics: mocks.getIdentityServiceMetrics,
}));

vi.mock("@/packages/persistence/src", () => ({
  isDatabaseConfigured: mocks.isDatabaseConfigured,
}));

vi.mock("@/packages/recruiter-read-model/src", () => ({
  getRecruiterReadModelMetrics: mocks.getRecruiterReadModelMetrics,
}));

vi.mock("@/packages/verification-domain/src", () => ({
  getVerificationServiceMetrics: mocks.getVerificationServiceMetrics,
}));

import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();

  mocks.getArtifactServiceMetrics.mockReturnValue({ artifacts: 0 });
  mocks.getCredentialServiceMetrics.mockReturnValue({ claims: 0 });
  mocks.getAuditEventCount.mockResolvedValue(0);
  mocks.getRecruiterReadModelMetrics.mockReturnValue({ recruiterProfiles: 0 });
  mocks.getVerificationServiceMetrics.mockReturnValue({ records: 0 });
});

describe("GET /api/v1/health", () => {
  it("returns a degraded but healthy response when DATABASE_URL is missing", async () => {
    mocks.isDatabaseConfigured.mockReturnValue(false);

    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.status).toBe("degraded");
    expect(payload.services.database).toBe("degraded");
    expect(payload.services.identity).toBe("degraded");
    expect(payload.services.adminOps).toBe("degraded");
    expect(payload.metrics.identity).toBeNull();
    expect(payload.metrics.adminOps).toBeNull();
    expect(payload.warnings).toEqual(["DATABASE_URL is not configured."]);
  });

  it("returns degraded status when database-backed metrics throw", async () => {
    mocks.isDatabaseConfigured.mockReturnValue(true);
    mocks.getIdentityServiceMetrics.mockRejectedValue(new Error("connect ECONNREFUSED"));
    mocks.getAdminOpsMetrics.mockResolvedValue({ pendingReviewItems: 0 });

    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.status).toBe("degraded");
    expect(payload.services.database).toBe("degraded");
    expect(payload.warnings).toEqual(["connect ECONNREFUSED"]);
  });

  it("returns ok when database-backed metrics are available", async () => {
    mocks.isDatabaseConfigured.mockReturnValue(true);
    mocks.getIdentityServiceMetrics.mockResolvedValue({
      talentIdentities: 2,
      soulRecords: 2,
      privacySettings: 2,
      nextTalentSequence: 3,
    });
    mocks.getAdminOpsMetrics.mockResolvedValue({ pendingReviewItems: 1 });

    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.status).toBe("ok");
    expect(payload.services.database).toBe("up");
    expect(payload.metrics.identity).toEqual({
      talentIdentities: 2,
      soulRecords: 2,
      privacySettings: 2,
      nextTalentSequence: 3,
    });
    expect(payload.metrics.adminOps).toEqual({ pendingReviewItems: 1 });
    expect(payload.warnings).toEqual([]);
  });
});
