import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDatabasePool, persistSourcedJobs } from "@/packages/persistence/src";
import { installTestDatabase, resetTestDatabase } from "@/packages/persistence/src/test-helpers";
import {
  getJobsEnvironmentGuide,
  getJobsFeedSnapshot,
  getSeededJobsCompanyOptions,
} from "@/packages/jobs-domain/src";

function createJsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "content-type": "application/json",
    },
  });
}

describe("jobs feed service", () => {
  const originalGreenhouseBoard = process.env.GREENHOUSE_BOARD;
  const originalGreenhouseBoards = process.env.GREENHOUSE_BOARD_TOKENS;
  const originalLeverSites = process.env.LEVER_SITE_NAMES;
  const originalAshbyBoards = process.env.ASHBY_JOB_BOARDS;
  const originalAggregatorFeeds = process.env.JOBS_AGGREGATOR_FEEDS;
  const originalAggregatorFeedUrl = process.env.JOBS_AGGREGATOR_FEED_URL;
  const originalAggregatorApiKey = process.env.JOBS_AGGREGATOR_API_KEY;
  const originalAggregatorLabel = process.env.JOBS_AGGREGATOR_LABEL;
  const originalWorkableXmlFeedUrl = process.env.WORKABLE_XML_FEED_URL;
  const originalWorkdayJobSources = process.env.WORKDAY_JOB_SOURCES;
  const originalDatabaseUrl = process.env.DATABASE_URL;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-04-14T12:00:00.000Z"));
    delete process.env.GREENHOUSE_BOARD;
    delete process.env.GREENHOUSE_BOARD_TOKENS;
    delete process.env.LEVER_SITE_NAMES;
    delete process.env.ASHBY_JOB_BOARDS;
    delete process.env.JOBS_AGGREGATOR_FEEDS;
    delete process.env.JOBS_AGGREGATOR_FEED_URL;
    delete process.env.JOBS_AGGREGATOR_API_KEY;
    delete process.env.JOBS_AGGREGATOR_LABEL;
    delete process.env.WORKABLE_XML_FEED_URL;
    delete process.env.WORKDAY_JOB_SOURCES;
    delete process.env.DATABASE_URL;
  });

  afterEach(async () => {
    await resetTestDatabase();
  });

  afterAll(() => {
    if (originalGreenhouseBoard === undefined) {
      delete process.env.GREENHOUSE_BOARD;
    } else {
      process.env.GREENHOUSE_BOARD = originalGreenhouseBoard;
    }

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

    if (originalAshbyBoards === undefined) {
      delete process.env.ASHBY_JOB_BOARDS;
    } else {
      process.env.ASHBY_JOB_BOARDS = originalAshbyBoards;
    }

    if (originalAggregatorFeeds === undefined) {
      delete process.env.JOBS_AGGREGATOR_FEEDS;
    } else {
      process.env.JOBS_AGGREGATOR_FEEDS = originalAggregatorFeeds;
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

    if (originalWorkableXmlFeedUrl === undefined) {
      delete process.env.WORKABLE_XML_FEED_URL;
    } else {
      process.env.WORKABLE_XML_FEED_URL = originalWorkableXmlFeedUrl;
    }

    if (originalWorkdayJobSources === undefined) {
      delete process.env.WORKDAY_JOB_SOURCES;
    } else {
      process.env.WORKDAY_JOB_SOURCES = originalWorkdayJobSources;
    }

    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
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
      "not_configured",
      "not_configured",
      "not_configured",
    ]);
    expect(getJobsEnvironmentGuide().map((item) => item.key)).toEqual([
      "GREENHOUSE_BOARD",
      "LEVER_SITE_NAMES",
      "ASHBY_JOB_BOARDS",
      "JOBS_AGGREGATOR_FEEDS",
      "JOBS_AGGREGATOR_FEED_URL",
      "JOBS_AGGREGATOR_API_KEY",
      "WORKABLE_XML_FEED_URL",
      "WORKDAY_JOB_SOURCES",
    ]);
  });

  it("exposes the built-in companies for UI filters", () => {
    expect(getSeededJobsCompanyOptions()).toEqual([
      "Accenture",
      "Adobe",
      "Autodesk",
      "Cisco",
      "CrowdStrike",
      "Dell Technologies",
      "Figma",
      "Hewlett Packard Enterprise (HPE)",
      "NVIDIA",
      "Red Hat",
      "Salesforce",
      "Samsung Electronics",
      "Stripe",
      "Workday",
    ]);
  });

  it("accepts GREENHOUSE_BOARD as the primary Greenhouse environment key", async () => {
    process.env.GREENHOUSE_BOARD = "Figma=figma";

    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

      if (url === "https://boards-api.greenhouse.io/v1/boards/figma/jobs?content=true") {
        return createJsonResponse({
          jobs: [
            {
              id: 5426468004,
              title: "Product Designer",
              absolute_url: "https://boards.greenhouse.io/figma/jobs/5426468004?gh_jid=5426468004",
              content: "<p>Shape the future of collaborative design.</p>",
              location: { name: "San Francisco, CA" },
              departments: [{ name: "Design" }],
              updated_at: "2026-04-09T18:00:00.000Z",
            },
          ],
        });
      }

      throw new Error(`Unexpected URL ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    const snapshot = await getJobsFeedSnapshot({ limit: 10 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(snapshot.summary.directAtsJobs).toBe(1);
    expect(snapshot.sources[0]?.key).toBe("greenhouse:figma");
    expect(snapshot.sources[0]?.status).toBe("connected");
    expect(snapshot.jobs[0]?.title).toBe("Product Designer");
  });

  it("extracts a clean preview from encoded Greenhouse rich text", async () => {
    process.env.GREENHOUSE_BOARD = "Stripe=stripe";

    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

      if (url === "https://boards-api.greenhouse.io/v1/boards/stripe/jobs?content=true") {
        return createJsonResponse({
          jobs: [
            {
              id: 4242,
              title: "Account Executive",
              absolute_url: "https://boards.greenhouse.io/stripe/jobs/4242",
              content:
                "&lt;h2&gt;Who we are&lt;/h2&gt;&lt;h3&gt;About Stripe&lt;/h3&gt;&lt;p&gt;Stripe is a financial infrastructure platform for businesses.&lt;/p&gt;",
              location: { name: "San Francisco, CA" },
              departments: [{ name: "Sales" }],
              updated_at: "2026-04-09T18:00:00.000Z",
            },
          ],
        });
      }

      throw new Error(`Unexpected URL ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    const snapshot = await getJobsFeedSnapshot({ limit: 10 });

    expect(snapshot.jobs[0]?.descriptionSnippet).toBe(
      "Stripe is a financial infrastructure platform for businesses.",
    );
  });

  it("keeps distinct Greenhouse jobs when the hosted URL differs only by gh_jid", async () => {
    process.env.GREENHOUSE_BOARD = "Stripe=stripe";

    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

      if (url === "https://boards-api.greenhouse.io/v1/boards/stripe/jobs?content=true") {
        return createJsonResponse({
          jobs: [
            {
              id: 7532733,
              title: "Account Executive, AI Sales",
              absolute_url: "https://stripe.com/jobs/search?gh_jid=7532733",
              content: "<p>Grow Stripe's AI revenue.</p>",
              location: { name: "San Francisco, CA" },
              departments: [{ name: "Sales" }],
              updated_at: "2026-04-10T18:00:00.000Z",
            },
            {
              id: 7746909,
              title: "Account Executive, AI Startups - Existing Business",
              absolute_url: "https://stripe.com/jobs/search?gh_jid=7746909",
              content: "<p>Support AI startup customers.</p>",
              location: { name: "New York, NY" },
              departments: [{ name: "Sales" }],
              updated_at: "2026-04-10T17:00:00.000Z",
            },
          ],
        });
      }

      throw new Error(`Unexpected URL ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    const snapshot = await getJobsFeedSnapshot({ limit: 10 });

    expect(snapshot.sources[0]?.jobCount).toBe(2);
    expect(snapshot.jobs).toHaveLength(2);
    expect(snapshot.jobs.map((job) => job.externalId)).toEqual(["7532733", "7746909"]);
  });

  it("ingests Ashby job boards as ATS-direct sources", async () => {
    process.env.ASHBY_JOB_BOARDS = "Linear=linear";

    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

      if (url === "https://api.ashbyhq.com/posting-api/job-board/linear") {
        return createJsonResponse({
          jobs: [
            {
              id: "ashby-1",
              title: "Machine Learning Engineer",
              jobUrl: "https://jobs.ashbyhq.com/linear/job/ashby-1",
              location: "Remote",
              team: "Engineering",
              employmentType: "FullTime",
              descriptionHtml: "<p>Build trustworthy AI systems.</p>",
              publishedAt: "2026-04-10T01:00:00.000Z",
              updatedAt: "2026-04-10T02:00:00.000Z",
            },
          ],
        });
      }

      throw new Error(`Unexpected URL ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    const snapshot = await getJobsFeedSnapshot({ limit: 10 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(snapshot.summary.directAtsJobs).toBe(1);
    expect(snapshot.sources[0]?.key).toBe("ashby:linear");
    expect(snapshot.sources[0]?.status).toBe("connected");
    expect(snapshot.jobs[0]?.title).toBe("Machine Learning Engineer");
    expect(snapshot.jobs[0]?.commitment).toBe("Full Time");
  });

  it("ingests the Workable XML network feed as coverage", async () => {
    process.env.WORKABLE_XML_FEED_URL = "https://www.workable.com/boards/workable.xml";

    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

      if (url === "https://www.workable.com/boards/workable.xml") {
        return new Response(
          `<?xml version="1.0" encoding="utf-8"?>
          <source>
            <job>
              <title><![CDATA[AI Product Designer]]></title>
              <date><![CDATA[Thu, 10 Apr 2026 04:02:25 UTC]]></date>
              <referencenumber><![CDATA[WB-1]]></referencenumber>
              <url><![CDATA[https://apply.workable.com/j/WB-1]]></url>
              <company><![CDATA[ProgressSoft]]></company>
              <city><![CDATA[Amman]]></city>
              <state><![CDATA[]]></state>
              <country><![CDATA[JO]]></country>
              <remote><![CDATA[false]]></remote>
              <description><![CDATA[<p>Create AI-native product experiences.</p>]]></description>
              <jobtype><![CDATA[Full-time]]></jobtype>
              <category><![CDATA[Product]]></category>
            </job>
            <job>
              <title><![CDATA[Remote LLM Engineer]]></title>
              <date><![CDATA[Thu, 10 Apr 2026 05:02:25 UTC]]></date>
              <referencenumber><![CDATA[WB-2]]></referencenumber>
              <url><![CDATA[https://apply.workable.com/j/WB-2]]></url>
              <company><![CDATA[Northstar]]></company>
              <city><![CDATA[]]></city>
              <state><![CDATA[]]></state>
              <country><![CDATA[US]]></country>
              <remote><![CDATA[true]]></remote>
              <description><![CDATA[<p>Ship applied LLM infrastructure.</p>]]></description>
              <jobtype><![CDATA[Contract]]></jobtype>
              <category><![CDATA[Engineering]]></category>
            </job>
          </source>`,
          {
            status: 200,
            headers: {
              "content-type": "application/xml",
            },
          },
        );
      }

      throw new Error(`Unexpected URL ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    const snapshot = await getJobsFeedSnapshot({ limit: 10 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(snapshot.summary.aggregatorJobs).toBe(2);
    expect(snapshot.sources[0]?.key).toBe("workable:network");
    expect(snapshot.sources[0]?.status).toBe("connected");
    expect(snapshot.jobs.map((job) => job.companyName)).toEqual(["Northstar", "ProgressSoft"]);
    expect(snapshot.jobs[0]?.location).toBe("Remote");
  });

  it("ingests Workday job feeds for directly sourced company roles", async () => {
    process.env.WORKDAY_JOB_SOURCES =
      "Adobe=https://adobe.wd5.myworkdayjobs.com/wday/cxs/adobe/external_experienced/jobs";

    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const body = init?.body ? JSON.parse(String(init.body)) : null;

      if (url === "https://adobe.wd5.myworkdayjobs.com/wday/cxs/adobe/external_experienced/jobs") {
        expect(body).toEqual({
          limit: 20,
          offset: 0,
          searchText: "",
          appliedFacets: {},
        });

        return createJsonResponse({
          total: 2,
          jobPostings: [
            {
              title: "Principal AI Technologist",
              externalPath: "/job/Remote-California/Principal-AI-Technologist_R162555",
              locationsText: "7 Locations",
              postedOn: "Posted Today",
              timeType: "Full time",
              bulletFields: ["R162555"],
            },
            {
              title: "Sourcing Manager",
              externalPath: "/job/San-Jose/Sourcing-Manager_R162000",
              locationsText: "San Jose, California",
              postedOn: "Posted 3 Days Ago",
              timeType: "Full time",
              bulletFields: ["R162000"],
            },
          ],
        });
      }

      throw new Error(`Unexpected URL ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    const snapshot = await getJobsFeedSnapshot({ limit: 10 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(snapshot.summary.directAtsJobs).toBe(2);
    expect(snapshot.sources[0]?.key).toBe("workday:adobe");
    expect(snapshot.sources[0]?.status).toBe("connected");
    expect(snapshot.jobs[0]?.companyName).toBe("Adobe");
    expect(snapshot.jobs[0]?.applyUrl).toBe(
      "https://adobe.wd5.myworkdayjobs.com/en-US/external_experienced/job/Remote-California/Principal-AI-Technologist_R162555",
    );
  });

  it("falls back to Workday bullet field locations when locationsText is missing", async () => {
    process.env.WORKDAY_JOB_SOURCES =
      "Accenture=https://accenture.wd103.myworkdayjobs.com/wday/cxs/accenture/AccentureCareers/jobs";

    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const body = init?.body ? JSON.parse(String(init.body)) : null;

      if (
        url === "https://accenture.wd103.myworkdayjobs.com/wday/cxs/accenture/AccentureCareers/jobs"
      ) {
        expect(body).toEqual({
          limit: 20,
          offset: 0,
          searchText: "",
          appliedFacets: {},
        });

        return createJsonResponse({
          total: 1,
          jobPostings: [
            {
              title: "Fraud Investigations Senior Analyst",
              externalPath: "/job/Buenos-Aires/Fraud-Investigations-Senior-Analyst_R00317420",
              locationsText: null,
              postedOn: "Posted Today",
              timeType: null,
              bulletFields: ["R00317420", "Buenos Aires"],
            },
          ],
        });
      }

      throw new Error(`Unexpected URL ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    const snapshot = await getJobsFeedSnapshot({ limit: 10 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(snapshot.jobs[0]?.companyName).toBe("Accenture");
    expect(snapshot.jobs[0]?.location).toBe("Buenos Aires");
    expect(snapshot.jobs[0]?.applyUrl).toBe(
      "https://accenture.wd103.myworkdayjobs.com/en-US/AccentureCareers/job/Buenos-Aires/Fraud-Investigations-Senior-Analyst_R00317420",
    );
  });

  it("does not treat Workday requisition ids as job locations", async () => {
    process.env.WORKDAY_JOB_SOURCES =
      "Accenture=https://accenture.wd103.myworkdayjobs.com/wday/cxs/accenture/AccentureCareers/jobs";

    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const body = init?.body ? JSON.parse(String(init.body)) : null;

      if (
        url === "https://accenture.wd103.myworkdayjobs.com/wday/cxs/accenture/AccentureCareers/jobs"
      ) {
        expect(body).toEqual({
          limit: 20,
          offset: 0,
          searchText: "",
          appliedFacets: {},
        });

        return createJsonResponse({
          total: 1,
          jobPostings: [
            {
              title: "Application Support Engineer",
              externalPath:
                "/job/ATCI-5373735-S1970646/Application-Support-Engineer_ATCI-5373735-S1970646",
              locationsText: "ATCI-5373735-S1970646",
              postedOn: "Posted Today",
              timeType: null,
              bulletFields: ["ATCI-5373735-S1970646"],
            },
          ],
        });
      }

      throw new Error(`Unexpected URL ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    const snapshot = await getJobsFeedSnapshot({ limit: 10 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(snapshot.jobs[0]?.title).toBe("Application Support Engineer");
    expect(snapshot.jobs[0]?.location).toBeNull();
  });

  it("continues paging Workday feeds when later pages incorrectly report total zero", async () => {
    process.env.WORKDAY_JOB_SOURCES =
      "Autodesk=https://autodesk.wd1.myworkdayjobs.com/wday/cxs/autodesk/Ext/jobs";

    const buildPage = (start: number, count: number) => ({
      total: start === 0 ? 60 : 0,
      jobPostings: Array.from({ length: count }, (_, index) => {
        const roleNumber = start + index + 1;

        return {
          title: `Role ${roleNumber}`,
          externalPath: `/job/Remote/Role-${roleNumber}_R${roleNumber}`,
          locationsText: "Remote",
          postedOn: "Posted Yesterday",
          timeType: "Full time",
          bulletFields: [`R${roleNumber}`],
        };
      }),
    });

    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

      if (url !== "https://autodesk.wd1.myworkdayjobs.com/wday/cxs/autodesk/Ext/jobs") {
        throw new Error(`Unexpected URL ${url}`);
      }

      const body = JSON.parse(String(init?.body ?? "{}")) as { offset?: number };

      if (body.offset === 0) {
        return createJsonResponse(buildPage(0, 20));
      }

      if (body.offset === 20) {
        return createJsonResponse(buildPage(20, 20));
      }

      if (body.offset === 40) {
        return createJsonResponse(buildPage(40, 20));
      }

      if (body.offset === 60) {
        return createJsonResponse({
          total: 0,
          jobPostings: [],
        });
      }

      throw new Error(`Unexpected Workday offset ${body.offset}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    const snapshot = await getJobsFeedSnapshot({ limit: 100, windowDays: undefined });

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(snapshot.sources[0]?.key).toBe("workday:autodesk");
    expect(snapshot.sources[0]?.jobCount).toBe(60);
    expect(snapshot.summary.totalJobs).toBe(60);
    expect(snapshot.summary.directAtsJobs).toBe(60);
    expect(snapshot.jobs).toHaveLength(60);
    expect(snapshot.jobs.some((job) => job.title === "Role 60")).toBe(true);
  });

  it("merges ATS direct feeds with an aggregator feed and prefers the ATS copy on duplicates", async () => {
    process.env.GREENHOUSE_BOARD_TOKENS = "Acme=acme";
    process.env.LEVER_SITE_NAMES = "Orbit=orbit";
    process.env.JOBS_AGGREGATOR_FEED_URL = "https://feeds.careerai.dev/jobs";
    process.env.JOBS_AGGREGATOR_API_KEY = "coverage-secret";
    process.env.JOBS_AGGREGATOR_LABEL = "Coverage API";

    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

      if (url === "https://boards-api.greenhouse.io/v1/boards/acme/jobs?content=true") {
        return createJsonResponse({
          jobs: [
            {
              id: 101,
              title: "Senior Product Designer",
              absolute_url: "https://jobs.acme.com/designer",
              content: "<p>Lead product design across the entire workflow.</p>",
              location: { name: "San Francisco, CA" },
              departments: [{ name: "Design" }],
              updated_at: "2026-04-09T18:00:00.000Z",
            },
          ],
        });
      }

      if (url === "https://api.lever.co/v0/postings/orbit?mode=json&limit=100&skip=0") {
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

      if (url === "https://feeds.careerai.dev/jobs") {
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
    expect(snapshot.summary.totalJobs).toBe(4);
    expect(snapshot.summary.directAtsJobs).toBe(2);
    expect(snapshot.summary.aggregatorJobs).toBe(2);
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
      "not_configured",
      "not_configured",
      "not_configured",
    ]);
    expect(snapshot.storage.mode).toBe("ephemeral");
  });

  it("reports source totals even when the returned jobs window is truncated", async () => {
    process.env.LEVER_SITE_NAMES = "Figma=figma";

    const recentPage = Array.from({ length: 100 }, (_, index) => ({
      id: `lever-${index + 1}`,
      text: `Recent role ${index + 1}`,
      categories: {
        location: "Remote",
        commitment: "Full-time",
        team: "Sales",
      },
      hostedUrl: `https://jobs.figma.com/recent-${index + 1}`,
      descriptionPlain: "Recent job from the first page.",
      createdAt: Date.parse("2026-04-09T12:00:00.000Z"),
      updatedAt: Date.parse("2026-04-10T12:00:00.000Z"),
    }));

    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

      if (url === "https://api.lever.co/v0/postings/figma?mode=json&limit=100&skip=0") {
        return createJsonResponse(recentPage);
      }

      if (url === "https://api.lever.co/v0/postings/figma?mode=json&limit=100&skip=100") {
        return createJsonResponse([
          {
            id: "lever-101",
            text: "Recent role 101",
            categories: {
              location: "Remote",
              commitment: "Full-time",
              team: "Sales",
            },
            hostedUrl: "https://jobs.figma.com/recent-101",
            descriptionPlain: "Recent job from the second page.",
            createdAt: Date.parse("2026-04-08T12:00:00.000Z"),
            updatedAt: Date.parse("2026-04-10T08:00:00.000Z"),
          },
        ]);
      }

      throw new Error(`Unexpected URL ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    const snapshot = await getJobsFeedSnapshot({ limit: 10, windowDays: 7 });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(snapshot.jobs).toHaveLength(10);
    expect(snapshot.summary.totalJobs).toBe(101);
    expect(snapshot.summary.directAtsJobs).toBe(101);
    expect(snapshot.sources[0]?.jobCount).toBe(101);
  });

  it("ingests multiple named aggregator feeds with one shared API key", async () => {
    process.env.JOBS_AGGREGATOR_FEEDS =
      "Google Careers=https://feeds.careerai.dev/google,Meta Careers=https://feeds.careerai.dev/meta";
    process.env.JOBS_AGGREGATOR_API_KEY = "coverage-secret";

    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const authorization = new Headers(init?.headers).get("Authorization");

      if (url === "https://feeds.careerai.dev/google") {
        expect(authorization).toBe("Bearer coverage-secret");

        return createJsonResponse({
          jobs: [
            {
              id: "google-1",
              title: "Applied AI Engineer",
              companyName: "Google",
              location: "Mountain View, CA",
              applyUrl: "https://careers.google.com/jobs/results/google-1",
              postedAt: "2026-04-10T01:00:00.000Z",
            },
          ],
        });
      }

      if (url === "https://feeds.careerai.dev/meta") {
        expect(authorization).toBe("Bearer coverage-secret");

        return createJsonResponse({
          jobs: [
            {
              id: "meta-1",
              title: "Research Engineer, AI",
              companyName: "Meta",
              location: "Menlo Park, CA",
              applyUrl: "https://www.metacareers.com/jobs/meta-1",
              postedAt: "2026-04-10T02:00:00.000Z",
            },
          ],
        });
      }

      throw new Error(`Unexpected URL ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    const snapshot = await getJobsFeedSnapshot({ limit: 10 });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(snapshot.summary.connectedSourceCount).toBe(2);
    expect(snapshot.summary.aggregatorJobs).toBe(2);
    expect(snapshot.sources.map((source) => source.key)).toEqual([
      "aggregator:google-careers",
      "aggregator:meta-careers",
      "greenhouse:unconfigured",
      "lever:unconfigured",
      "ashby:unconfigured",
      "workday:unconfigured",
      "workable:unconfigured",
    ]);
    expect(snapshot.jobs.map((job) => job.companyName)).toEqual(["Meta", "Google"]);
  });

  it("paginates Lever postings and keeps every job from the requested 7 day window", async () => {
    process.env.LEVER_SITE_NAMES = "Figma=figma";

    const recentPage = Array.from({ length: 100 }, (_, index) => ({
      id: `lever-${index + 1}`,
      text: `Recent role ${index + 1}`,
      categories: {
        location: "Remote",
        commitment: "Full-time",
        team: "Sales",
      },
      hostedUrl: `https://jobs.figma.com/recent-${index + 1}`,
      descriptionPlain: "Recent job from the first page.",
      createdAt: Date.parse("2026-04-09T12:00:00.000Z"),
      updatedAt: Date.parse("2026-04-10T12:00:00.000Z"),
    }));

    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

      if (url === "https://api.lever.co/v0/postings/figma?mode=json&limit=100&skip=0") {
        return createJsonResponse(recentPage);
      }

      if (url === "https://api.lever.co/v0/postings/figma?mode=json&limit=100&skip=100") {
        return createJsonResponse([
          {
            id: "lever-101",
            text: "Recent role 101",
            categories: {
              location: "Remote",
              commitment: "Full-time",
              team: "Sales",
            },
            hostedUrl: "https://jobs.figma.com/recent-101",
            descriptionPlain: "Recent job from the second page.",
            createdAt: Date.parse("2026-04-08T12:00:00.000Z"),
            updatedAt: Date.parse("2026-04-10T08:00:00.000Z"),
          },
        ]);
      }

      throw new Error(`Unexpected URL ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    const snapshot = await getJobsFeedSnapshot({ limit: 200, windowDays: 7 });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://api.lever.co/v0/postings/figma?mode=json&limit=100&skip=0",
    );
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      "https://api.lever.co/v0/postings/figma?mode=json&limit=100&skip=100",
    );
    expect(snapshot.summary.totalJobs).toBe(101);
    expect(snapshot.summary.directAtsJobs).toBe(101);
    expect(snapshot.sources[0]?.jobCount).toBe(101);
    expect(snapshot.jobs.some((job) => job.title === "Recent role 101")).toBe(true);
  });

  it("ignores reserved placeholder feed URLs in environment config", async () => {
    process.env.JOBS_AGGREGATOR_FEEDS =
      "Coverage Feed=https://jobs.example.com/google,Partner Feed=https://feeds.example.org/open-roles";
    process.env.JOBS_AGGREGATOR_FEED_URL = "https://jobs.example.net/api/v1/open-roles";
    process.env.WORKABLE_XML_FEED_URL = "https://boards.example.com/workable.xml";

    const fetchMock = vi.fn();

    vi.stubGlobal("fetch", fetchMock);

    const snapshot = await getJobsFeedSnapshot({ limit: 10 });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(snapshot.jobs).toHaveLength(0);
    expect(snapshot.summary.connectedSourceCount).toBe(0);
    expect(snapshot.sources.map((source) => source.key)).toEqual([
      "greenhouse:unconfigured",
      "lever:unconfigured",
      "ashby:unconfigured",
      "workday:unconfigured",
      "aggregator:unconfigured",
      "workable:unconfigured",
    ]);
  });

  it("returns only last week jobs in the snapshot while persisting the full active feed", async () => {
    await installTestDatabase();
    process.env.DATABASE_URL = "postgres://career-ai:test@localhost:5432/career_ai_test";
    process.env.GREENHOUSE_BOARD = "Figma=figma";

    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

      if (url === "https://boards-api.greenhouse.io/v1/boards/figma/jobs?content=true") {
        return createJsonResponse({
          jobs: [
            {
              id: 101,
              title: "Recent Product Designer",
              absolute_url: "https://boards.greenhouse.io/figma/jobs/101",
              content: "<p>Recent role.</p>",
              location: { name: "San Francisco, CA" },
              departments: [{ name: "Design" }],
              updated_at: "2026-04-09T18:00:00.000Z",
            },
            {
              id: 102,
              title: "Older Product Designer",
              absolute_url: "https://boards.greenhouse.io/figma/jobs/102",
              content: "<p>Older but still open role.</p>",
              location: { name: "San Francisco, CA" },
              departments: [{ name: "Design" }],
              updated_at: "2026-03-20T18:00:00.000Z",
            },
          ],
        });
      }

      throw new Error(`Unexpected URL ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    const snapshot = await getJobsFeedSnapshot({ limit: 50, windowDays: 7 });
    const pool = getDatabasePool();
    const counts = await pool.query<{ active_jobs: string }>(
      "SELECT COUNT(*)::text AS active_jobs FROM job_postings WHERE is_active = true",
    );

    expect(snapshot.jobs).toHaveLength(1);
    expect(snapshot.jobs[0]?.title).toBe("Recent Product Designer");
    expect(snapshot.sources[0]?.jobCount).toBe(1);
    expect(snapshot.storage.mode).toBe("database");
    expect(Number(counts.rows[0]?.active_jobs ?? 0)).toBe(2);
  });

  it("persists Greenhouse jobs to Postgres when the database is configured", async () => {
    await installTestDatabase();
    process.env.DATABASE_URL = "postgres://career-ai:test@localhost:5432/career_ai_test";
    process.env.GREENHOUSE_BOARD_TOKENS = "Acme=acme";

    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

      if (url === "https://boards-api.greenhouse.io/v1/boards/acme/jobs?content=true") {
        return createJsonResponse({
          jobs: [
            {
              id: 101,
              title: "Senior Product Designer",
              absolute_url: "https://jobs.acme.com/designer",
              content: "<p>Lead product design across the entire workflow.</p>",
              location: { name: "San Francisco, CA" },
              departments: [{ name: "Design" }],
              updated_at: "2026-04-09T18:00:00.000Z",
            },
          ],
        });
      }

      throw new Error(`Unexpected URL ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    const snapshot = await getJobsFeedSnapshot({ limit: 10 });
    const pool = getDatabasePool();
    const counts = await pool.query<{ job_count: string; source_count: string }>(`
      SELECT
        (SELECT COUNT(*)::text FROM job_postings) AS job_count,
        (SELECT COUNT(*)::text FROM job_sources) AS source_count
    `);

    expect(snapshot.storage.mode).toBe("database");
    expect(snapshot.storage.persistedJobs).toBe(1);
    expect(snapshot.jobs[0]?.descriptionSnippet).toContain("Lead product design");
    expect(snapshot.sources[0]?.status).toBe("connected");
    expect(Number(counts.rows[0]?.job_count ?? 0)).toBe(1);
    expect(Number(counts.rows[0]?.source_count ?? 0)).toBe(1);
  });

  it("serves the persisted snapshot without re-syncing after the saved snapshot has aged", async () => {
    await installTestDatabase();
    process.env.DATABASE_URL = "postgres://career-ai:test@localhost:5432/career_ai_test";
    const syncedAt = "2026-04-01T08:00:00.000Z";
    const fetchMock = vi.fn();

    vi.stubGlobal("fetch", fetchMock);

    await persistSourcedJobs({
      syncedAt,
      sources: [
        {
          key: "greenhouse:acme",
          label: "Acme",
          lane: "ats_direct",
          quality: "high_signal",
          status: "connected",
          jobCount: 1,
          endpointLabel: "boards-api.greenhouse.io/acme",
          lastSyncedAt: syncedAt,
          message: "Acme public jobs synced and ready to persist.",
        },
      ],
      jobs: [
        {
          id: "greenhouse:acme:101",
          externalId: "101",
          title: "Senior Product Designer",
          companyName: "Acme",
          location: "San Francisco, CA",
          department: "Design",
          commitment: null,
          sourceKey: "greenhouse:acme",
          sourceLabel: "Acme",
          sourceLane: "ats_direct",
          sourceQuality: "high_signal",
          applyUrl: "https://jobs.acme.com/designer",
          postedAt: null,
          updatedAt: "2026-04-01T07:55:00.000Z",
          descriptionSnippet: "Lead product design across the entire workflow.",
        },
      ],
    });

    const snapshot = await getJobsFeedSnapshot({ limit: 10 });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(snapshot.storage.mode).toBe("database");
    expect(snapshot.jobs).toHaveLength(1);
    expect(snapshot.sources[0]?.status).toBe("connected");
    expect(snapshot.storage.lastSyncAt).toBe(syncedAt);
  });

  it("enriches persisted jobs with parsed salary range metadata in the feed response", async () => {
    await installTestDatabase();
    process.env.DATABASE_URL = "postgres://career-ai:test@localhost:5432/career_ai_test";

    await persistSourcedJobs({
      syncedAt: "2026-04-01T08:00:00.000Z",
      sources: [
        {
          key: "greenhouse:acme",
          label: "Acme",
          lane: "ats_direct",
          quality: "high_signal",
          status: "connected",
          jobCount: 1,
          endpointLabel: "boards-api.greenhouse.io/acme",
          lastSyncedAt: "2026-04-01T08:00:00.000Z",
          message: "Acme public jobs synced and ready to persist.",
        },
      ],
      jobs: [
        {
          applyUrl: "https://jobs.acme.com/platform",
          companyName: "Acme",
          descriptionSnippet: "Own distributed platform systems.",
          externalId: "platform-1",
          id: "greenhouse:acme:platform-1",
          location: "Remote",
          salaryText: "$120,000 - $180,000 a year",
          sourceKey: "greenhouse:acme",
          sourceLabel: "Acme",
          sourceLane: "ats_direct",
          sourceQuality: "high_signal",
          title: "Platform Engineer",
          updatedAt: "2026-04-01T07:55:00.000Z",
        },
      ],
    });

    const snapshot = await getJobsFeedSnapshot({ limit: 10 });

    expect(snapshot.jobs[0]?.salaryText).toBe("$120,000 - $180,000 a year");
    expect(snapshot.jobs[0]?.salaryRange).toEqual({
      currency: "USD",
      max: 180000,
      min: 120000,
      rawText: "$120,000 - $180,000 a year",
    });
  });

  it("continues showing persisted jobs when a later Greenhouse sync degrades", async () => {
    await installTestDatabase();
    process.env.DATABASE_URL = "postgres://career-ai:test@localhost:5432/career_ai_test";
    process.env.GREENHOUSE_BOARD_TOKENS = "Acme=acme";

    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

      if (url !== "https://boards-api.greenhouse.io/v1/boards/acme/jobs?content=true") {
        throw new Error(`Unexpected URL ${url}`);
      }

      if (fetchMock.mock.calls.length === 1) {
        return createJsonResponse({
          jobs: [
            {
              id: 101,
              title: "Senior Product Designer",
              absolute_url: "https://jobs.acme.com/designer",
              content: "<p>Lead product design across the entire workflow.</p>",
              location: { name: "San Francisco, CA" },
              departments: [{ name: "Design" }],
              updated_at: "2026-04-09T18:00:00.000Z",
            },
          ],
        });
      }

      return new Response("upstream unavailable", { status: 503 });
    });

    vi.stubGlobal("fetch", fetchMock);

    await getJobsFeedSnapshot({ limit: 10 });
    const snapshot = await getJobsFeedSnapshot({ limit: 10, forceRefresh: true });

    expect(snapshot.storage.mode).toBe("database");
    expect(snapshot.jobs).toHaveLength(1);
    expect(snapshot.sources[0]?.status).toBe("degraded");
  });

  it("returns company-filtered persisted snapshots for the jobs page", async () => {
    const syncedAt = "2026-04-11T22:15:00.000Z";

    await installTestDatabase();
    process.env.DATABASE_URL = "postgres://career-ai:test@localhost:5432/career_ai_test";

    await persistSourcedJobs({
      syncedAt,
      sources: [
        {
          key: "greenhouse:cisco",
          label: "Cisco",
          lane: "ats_direct",
          quality: "high_signal",
          status: "connected",
          jobCount: 2,
          endpointLabel: "boards-api.greenhouse.io/cisco",
          lastSyncedAt: syncedAt,
          message: "Cisco public jobs synced and ready to persist.",
        },
        {
          key: "workday:red-hat",
          label: "Red Hat",
          lane: "ats_direct",
          quality: "high_signal",
          status: "connected",
          jobCount: 3,
          endpointLabel: "redhat.wd1.myworkdayjobs.com/en-US/jobs",
          lastSyncedAt: syncedAt,
          message: "Red Hat public jobs synced and ready to persist.",
        },
      ],
      jobs: [
        {
          id: "greenhouse:cisco:1",
          externalId: "1",
          title: "Cisco Role 1",
          companyName: "Cisco",
          location: "Remote",
          department: "Engineering",
          commitment: null,
          sourceKey: "greenhouse:cisco",
          sourceLabel: "Cisco",
          sourceLane: "ats_direct",
          sourceQuality: "high_signal",
          applyUrl: "https://cisco.example/jobs/1",
          postedAt: null,
          updatedAt: "2026-04-11T22:14:00.000Z",
          descriptionSnippet: null,
        },
        {
          id: "greenhouse:cisco:2",
          externalId: "2",
          title: "Cisco Role 2",
          companyName: "Cisco",
          location: "Remote",
          department: "Engineering",
          commitment: null,
          sourceKey: "greenhouse:cisco",
          sourceLabel: "Cisco",
          sourceLane: "ats_direct",
          sourceQuality: "high_signal",
          applyUrl: "https://cisco.example/jobs/2",
          postedAt: null,
          updatedAt: "2026-04-11T22:13:00.000Z",
          descriptionSnippet: null,
        },
        {
          id: "workday:red-hat:1",
          externalId: "redhat-1",
          title: "Red Hat Role 1",
          companyName: "Red Hat",
          location: "Remote",
          department: "Engineering",
          commitment: null,
          sourceKey: "workday:red-hat",
          sourceLabel: "Red Hat",
          sourceLane: "ats_direct",
          sourceQuality: "high_signal",
          applyUrl: "https://redhat.example/jobs/1",
          postedAt: null,
          updatedAt: "2026-04-11T22:12:00.000Z",
          descriptionSnippet: null,
        },
        {
          id: "workday:red-hat:2",
          externalId: "redhat-2",
          title: "Red Hat Role 2",
          companyName: "Red Hat",
          location: "Remote",
          department: "Engineering",
          commitment: null,
          sourceKey: "workday:red-hat",
          sourceLabel: "Red Hat",
          sourceLane: "ats_direct",
          sourceQuality: "high_signal",
          applyUrl: "https://redhat.example/jobs/2",
          postedAt: null,
          updatedAt: "2026-04-11T22:11:00.000Z",
          descriptionSnippet: null,
        },
        {
          id: "workday:red-hat:3",
          externalId: "redhat-3",
          title: "Red Hat Role 3",
          companyName: "Red Hat",
          location: "Remote",
          department: "Engineering",
          commitment: null,
          sourceKey: "workday:red-hat",
          sourceLabel: "Red Hat",
          sourceLane: "ats_direct",
          sourceQuality: "high_signal",
          applyUrl: "https://redhat.example/jobs/3",
          postedAt: null,
          updatedAt: "2026-04-11T22:10:00.000Z",
          descriptionSnippet: null,
        },
      ],
    });

    const snapshot = await getJobsFeedSnapshot({
      companies: ["Red Hat"],
      limit: 10,
    });

    expect(snapshot.jobs).toHaveLength(3);
    expect(snapshot.jobs.every((job) => job.companyName === "Red Hat")).toBe(true);
    expect(snapshot.summary.totalJobs).toBe(3);
    expect(snapshot.sources).toHaveLength(1);
    expect(snapshot.sources[0]?.label).toBe("Red Hat");
  });
});
