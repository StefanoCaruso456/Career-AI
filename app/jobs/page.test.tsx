import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { JobPostingDto, JobsFeedResponseDto } from "@/packages/contracts/src";

const jobsDomainMocks = vi.hoisted(() => ({
  getJobsEnvironmentGuide: vi.fn(() => []),
  getJobsFeedSnapshot: vi.fn(),
}));

vi.mock("@/packages/jobs-domain/src", () => jobsDomainMocks);

function createJob(): JobPostingDto {
  return {
    id: "job-1",
    externalId: "external-1",
    title: "Applied AI Engineer",
    companyName: "OpenAI",
    location: "Remote",
    department: "Engineering",
    commitment: "Full-time",
    sourceKey: "greenhouse:connected-feed",
    sourceLabel: "Connected Feed",
    sourceLane: "ats_direct",
    sourceQuality: "high_signal",
    applyUrl: "https://careers.example.ai/jobs/1",
    postedAt: "2026-04-10T12:00:00.000Z",
    updatedAt: "2026-04-10T12:30:00.000Z",
    descriptionSnippet: "Ship reliable AI-native hiring infrastructure.",
  };
}

function createSnapshot(): JobsFeedResponseDto {
  return {
    generatedAt: "2026-04-10T12:45:00.000Z",
    jobs: [createJob()],
    sources: [
      {
        key: "greenhouse:connected-feed",
        label: "Connected Feed",
        lane: "ats_direct",
        quality: "high_signal",
        status: "connected",
        jobCount: 1,
        endpointLabel: "boards-api.greenhouse.io/connected-feed",
        lastSyncedAt: "2026-04-10T12:45:00.000Z",
        message: "Greenhouse public jobs synced and ready to persist.",
      },
      {
        key: "lever:broken-feed",
        label: "Broken Feed",
        lane: "ats_direct",
        quality: "high_signal",
        status: "degraded",
        jobCount: 0,
        endpointLabel: "api.lever.co/broken-feed",
        lastSyncedAt: "2026-04-10T12:45:00.000Z",
        message: "Lever feed could not be loaded: Feed returned 404",
      },
    ],
    summary: {
      totalJobs: 1,
      directAtsJobs: 1,
      aggregatorJobs: 0,
      sourceCount: 2,
      connectedSourceCount: 1,
      highSignalSourceCount: 2,
      coverageSourceCount: 0,
    },
    storage: {
      mode: "ephemeral",
      persistedJobs: 0,
      persistedSources: 0,
      lastSyncAt: null,
    },
  };
}

describe("JobsPage", () => {
  beforeEach(() => {
    jobsDomainMocks.getJobsEnvironmentGuide.mockReturnValue([]);
    jobsDomainMocks.getJobsFeedSnapshot.mockResolvedValue(createSnapshot());
  });

  it("shows only connected sources in feed details", async () => {
    const JobsPage = (await import("@/app/jobs/page")).default;

    render(await JobsPage());

    expect(jobsDomainMocks.getJobsFeedSnapshot).toHaveBeenCalledWith({
      limit: 5000,
      windowDays: 7,
    });
    expect(screen.getByText("Feed details")).toBeInTheDocument();
    expect(screen.getByText("1 active source")).toBeInTheDocument();
    expect(screen.getByText("Connected Feed")).toBeInTheDocument();
    expect(screen.queryByText("Broken Feed")).not.toBeInTheDocument();
  });
});
