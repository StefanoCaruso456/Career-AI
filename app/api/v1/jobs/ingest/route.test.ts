import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getJobsFeedSnapshot: vi.fn(),
}));

vi.mock("@/packages/jobs-domain/src", () => ({
  getJobsFeedSnapshot: mocks.getJobsFeedSnapshot,
}));

import { POST } from "./route";

describe("POST /api/v1/jobs/ingest", () => {
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

  it("forces a refresh so scheduled ingests roll the daily snapshot forward", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/v1/jobs/ingest", {
        method: "POST",
        body: JSON.stringify({
          limit: 250,
        }),
        headers: {
          "content-type": "application/json",
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.getJobsFeedSnapshot).toHaveBeenCalledWith({
      forceRefresh: true,
      limit: 250,
      windowDays: undefined,
    });
  });
});
