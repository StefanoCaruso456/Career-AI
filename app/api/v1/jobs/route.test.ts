import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getJobsFeedSnapshot: vi.fn(),
}));

vi.mock("@/packages/jobs-domain/src", () => ({
  getJobsFeedSnapshot: mocks.getJobsFeedSnapshot,
}));

import { GET } from "./route";

describe("GET /api/v1/jobs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getJobsFeedSnapshot.mockResolvedValue({
      generatedAt: "2026-04-16T11:00:00.000Z",
      jobs: [],
      sources: [],
      storage: {
        mode: "database",
        persistedJobs: 0,
        persistedSources: 0,
        lastSyncAt: "2026-04-16T11:00:00.000Z",
      },
      summary: {
        totalJobs: 0,
        directAtsJobs: 0,
        aggregatorJobs: 0,
        sourceCount: 0,
        connectedSourceCount: 0,
        highSignalSourceCount: 0,
        coverageSourceCount: 0,
      },
    });
  });

  it("serves the saved snapshot without honoring public refresh requests", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/v1/jobs?company=Cisco&limit=12&windowDays=7&refresh=1"),
    );

    expect(response.status).toBe(200);
    expect(mocks.getJobsFeedSnapshot).toHaveBeenCalledWith({
      companies: ["Cisco"],
      limit: 12,
      windowDays: 7,
    });
  });
});
