import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JobPostingDto } from "@/packages/contracts/src";

const getPersistedJobPostingByIdMock = vi.fn();
const getLiveJobPostingByIdMock = vi.fn();
const isDatabaseConfiguredMock = vi.fn();

vi.mock("@/packages/persistence/src", () => ({
  getPersistedJobPostingById: (...args: unknown[]) => getPersistedJobPostingByIdMock(...args),
  isDatabaseConfigured: (...args: unknown[]) => isDatabaseConfiguredMock(...args),
}));

vi.mock("./service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./service")>();

  return {
    ...actual,
    getLiveJobPostingById: (...args: unknown[]) => getLiveJobPostingByIdMock(...args),
  };
});

import { getJobDetails } from "./details";

function createJob(overrides: Partial<JobPostingDto> = {}): JobPostingDto {
  return {
    applyUrl: "https://boards.greenhouse.io/figma/jobs/5426468004",
    commitment: "Full-time",
    companyName: "Figma",
    department: "Design",
    descriptionSnippet: "Shape the future of collaborative design.",
    externalId: "5426468004",
    externalSourceJobId: "5426468004",
    id: "greenhouse:figma:5426468004",
    location: "San Francisco, CA",
    postedAt: "2026-04-10T12:00:00.000Z",
    sourceKey: "greenhouse:figma",
    sourceLabel: "Figma",
    sourceLane: "ats_direct",
    sourceQuality: "high_signal",
    title: "Product Designer",
    updatedAt: "2026-04-11T12:00:00.000Z",
    ...overrides,
  };
}

describe("job details service", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    getPersistedJobPostingByIdMock.mockReset();
    getLiveJobPostingByIdMock.mockReset();
    isDatabaseConfiguredMock.mockReturnValue(true);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("normalizes and sanitizes rich Greenhouse descriptions from persisted raw payloads", async () => {
    getPersistedJobPostingByIdMock.mockResolvedValue(
      createJob({
        rawPayload: {
          content:
            "<p>Design the next generation of product experiences.</p><h2>Responsibilities</h2><ul><li>Lead the roadmap</li></ul><script>alert('xss')</script><h2>Qualifications</h2><ul><li>10+ years in product design</li></ul>",
          id: 5426468004,
        },
      }),
    );

    const details = await getJobDetails({
      jobId: "greenhouse:figma:5426468004",
    });

    expect(details.source).toBe("greenhouse");
    expect(details.contentStatus).toBe("full");
    expect(details.descriptionHtml).toContain("Responsibilities");
    expect(details.descriptionHtml).not.toContain("script");
    expect(details.responsibilities).toContain("Lead the roadmap");
    expect(details.qualifications).toContain("10+ years in product design");
    expect(details.fallbackMessage).toBeNull();
  });

  it("hydrates missing Workday descriptions from the live source page JSON-LD", async () => {
    getPersistedJobPostingByIdMock.mockResolvedValue(
      createJob({
        applyUrl:
          "https://accenture.wd103.myworkdayjobs.com/en-US/AccentureCareers/job/Sales-Capture-Lead---SAP_R00311379",
        canonicalJobUrl:
          "https://accenture.wd103.myworkdayjobs.com/en-US/AccentureCareers/job/Sales-Capture-Lead---SAP_R00311379",
        companyName: "Accenture",
        descriptionSnippet: null,
        externalId: "R00311379",
        externalSourceJobId: "R00311379",
        id: "workday:accenture:R00311379",
        location: "Paris, France",
        rawPayload: {
          bulletFields: ["R00311379"],
          externalPath: "/job/Paris/Sales-Capture-Lead---SAP_R00311379",
          title: "Sales Lead — SAP",
        },
        sourceKey: "workday:accenture",
        sourceLabel: "Accenture",
        title: "Sales Lead — SAP",
      }),
    );

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(
          `
            <html>
              <head>
                <script type="application/ld+json">
                  {
                    "@context": "http://schema.org",
                    "@type": "JobPosting",
                    "title": "Sales Lead — SAP",
                    "employmentType": "FULL_TIME",
                    "datePosted": "2026-04-14",
                    "identifier": { "value": "R00311379" },
                    "jobLocationType": "TELECOMMUTE",
                    "description": "Overview for the role. Vos principales missions: Drive large SAP programs; Close enterprise deals. Le métier est fait pour vous si vous avez: 10+ years in SAP consulting; Commercial leadership."
                  }
                </script>
              </head>
              <body></body>
            </html>
          `,
          {
            headers: {
              "content-type": "text/html",
            },
            status: 200,
          },
        );
      }),
    );

    const details = await getJobDetails({
      jobId: "workday:accenture:R00311379",
    });

    expect(details.source).toBe("workday");
    expect(details.contentStatus).toBe("full");
    expect(details.externalJobId).toBe("R00311379");
    expect(details.employmentType).toBe("Full Time");
    expect(details.location).toBe("Remote");
    expect(details.descriptionText).toContain("Overview for the role.");
    expect(details.responsibilities).toContain("Drive large SAP programs");
    expect(details.qualifications).toContain("10+ years in SAP consulting");
    expect(details.fallbackMessage).toBeNull();
  });
});
