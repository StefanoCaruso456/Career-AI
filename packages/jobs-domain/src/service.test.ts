import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getJobsEnvironmentGuide, getJobsFeedSnapshot } from "@/packages/jobs-domain/src";

function createJsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "content-type": "application/json",
    },
  });
}

describe("jobs feed service", () => {
  const originalGreenhouseBoards = process.env.GREENHOUSE_BOARD_TOKENS;
  const originalLeverSites = process.env.LEVER_SITE_NAMES;
  const originalAggregatorFeedUrl = process.env.JOBS_AGGREGATOR_FEED_URL;
  const originalAggregatorApiKey = process.env.JOBS_AGGREGATOR_API_KEY;
  const originalAggregatorLabel = process.env.JOBS_AGGREGATOR_LABEL;

  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.GREENHOUSE_BOARD_TOKENS;
    delete process.env.LEVER_SITE_NAMES;
    delete process.env.JOBS_AGGREGATOR_FEED_URL;
    delete process.env.JOBS_AGGREGATOR_API_KEY;
    delete process.env.JOBS_AGGREGATOR_LABEL;
  });

  afterAll(() => {
    if (originalGreenhouseBoards === undefined) {
      delete process.env.GREENHOUSE_BOARD_TOKENS;
    } else {
      process.env.GREENHOUSE_BOARD_TOKENS = originalGreenhouseBoards;
    }

    if (originalLeverSites === undefined) {
      delete process.env.LEVER_SITE_NAMES;
    } else {
      process.env.LEVER_SITE_NAMES = originalLeverSites;
    }

    if (originalAggregatorFeedUrl === undefined) {
      delete process.env.JOBS_AGGREGATOR_FEED_URL;
    } else {
      process.env.JOBS_AGGREGATOR_FEED_URL = originalAggregatorFeedUrl;
    }

    if (originalAggregatorApiKey === undefined) {
      delete process.env.JOBS_AGGREGATOR_API_KEY;
    } else {
      process.env.JOBS_AGGREGATOR_API_KEY = originalAggregatorApiKey;
    }

    if (originalAggregatorLabel === undefined) {
      delete process.env.JOBS_AGGREGATOR_LABEL;
    } else {
      process.env.JOBS_AGGREGATOR_LABEL = originalAggregatorLabel;
    }
  });

  it("reports unconfigured ATS and aggregator sources when no feeds are connected", async () => {
    const snapshot = await getJobsFeedSnapshot();

    expect(snapshot.jobs).toHaveLength(0);
    expect(snapshot.summary.connectedSourceCount).toBe(0);
    expect(snapshot.sources.map((source) => source.status)).toEqual([
      "not_configured",
      "not_configured",
      "not_configured",
    ]);
    expect(getJobsEnvironmentGuide().map((item) => item.key)).toEqual([
      "GREENHOUSE_BOARD_TOKENS",
      "LEVER_SITE_NAMES",
      "JOBS_AGGREGATOR_FEED_URL",
      "JOBS_AGGREGATOR_API_KEY",
    ]);
  });

  it("merges ATS direct feeds with an aggregator feed and prefers the ATS copy on duplicates", async () => {
    process.env.GREENHOUSE_BOARD_TOKENS = "Acme=acme";
    process.env.LEVER_SITE_NAMES = "Orbit=orbit";
    process.env.JOBS_AGGREGATOR_FEED_URL = "https://coverage.example.com/jobs";
    process.env.JOBS_AGGREGATOR_API_KEY = "coverage-secret";
    process.env.JOBS_AGGREGATOR_LABEL = "Coverage API";

    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

      if (url === "https://boards-api.greenhouse.io/v1/boards/acme/jobs") {
        return createJsonResponse({
          jobs: [
            {
              id: 101,
              title: "Senior Product Designer",
              absolute_url: "https://jobs.acme.com/designer",
              location: { name: "San Francisco, CA" },
              departments: [{ name: "Design" }],
              updated_at: "2026-04-09T18:00:00.000Z",
            },
          ],
        });
      }

      if (url === "https://api.lever.co/v0/postings/orbit?mode=json&limit=12") {
        return createJsonResponse([
          {
            id: "lever-1",
            text: "Staff Product Manager",
            categories: {
              location: "Remote",
              commitment: "Full-time",
              team: "Product",
            },
            hostedUrl: "https://jobs.orbit.com/product-manager",
            descriptionPlain: "Lead the product roadmap for the hiring platform.",
            createdAt: Date.parse("2026-04-08T12:00:00.000Z"),
            updatedAt: Date.parse("2026-04-09T10:00:00.000Z"),
          },
        ]);
      }

      if (url === "https://coverage.example.com/jobs") {
        return createJsonResponse({
          jobs: [
            {
              id: "agg-1",
              title: "Senior Product Designer",
              companyName: "Acme",
              location: "San Francisco, CA",
              applyUrl: "https://jobs.acme.com/designer",
              postedAt: "2026-04-07T08:30:00.000Z",
            },
            {
              id: "agg-2",
              title: "Lifecycle Marketing Lead",
              companyName: "Nova",
              location: "New York, NY",
              applyUrl: "https://jobs.nova.com/lifecycle",
              postedAt: "2026-04-09T14:15:00.000Z",
            },
          ],
        });
      }

      throw new Error(`Unexpected URL ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    const snapshot = await getJobsFeedSnapshot({ limit: 10 });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(snapshot.summary.totalJobs).toBe(3);
    expect(snapshot.summary.directAtsJobs).toBe(2);
    expect(snapshot.summary.aggregatorJobs).toBe(1);
    expect(snapshot.summary.connectedSourceCount).toBe(3);
    expect(snapshot.jobs.map((job) => job.title)).toEqual([
      "Senior Product Designer",
      "Staff Product Manager",
      "Lifecycle Marketing Lead",
    ]);
    expect(snapshot.jobs[0].sourceLane).toBe("ats_direct");
    expect(snapshot.jobs[2].sourceLane).toBe("aggregator");
    expect(snapshot.sources.map((source) => source.status)).toEqual([
      "connected",
      "connected",
      "connected",
    ]);
  });
});
