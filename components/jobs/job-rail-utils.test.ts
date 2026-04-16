import { describe, expect, it } from "vitest";
import type { JobListing } from "@/lib/jobs/map-jobs-to-listings";
import {
  DEFAULT_JOB_RAIL_FILTERS,
  filterAndSortJobsForRail,
  getJobRailOptions,
  type JobRailEmploymentFilter,
  type JobRailPostedDateFilter,
  type JobRailSourceFilter,
  type JobRailSort,
  type JobRailWorkplaceFilter,
} from "./job-rail-utils";

const NOW = Date.parse("2026-04-15T12:00:00.000Z");

function createJob(id: string, overrides: Partial<JobListing> = {}): JobListing {
  return {
    applyUrl: `https://jobs.example.com/${id}`,
    canonicalApplyUrl: `https://jobs.example.com/${id}`,
    company: "Example",
    employmentType: "Full-time",
    externalJobId: `${id}-req`,
    id,
    isOrchestrationReady: true,
    location: "New York, NY",
    matchReason: "Strong alignment with product design experience.",
    postedAt: "2026-04-12T12:00:00.000Z",
    railKey: `job:${id}`,
    relevanceScore: 0.5,
    salaryText: null,
    sourceKey: "greenhouse:example",
    sourceLabel: "Example",
    sourceType: "greenhouse",
    sourceUrl: `https://boards.greenhouse.io/example/jobs/${id}`,
    summary: null,
    title: `Role ${id}`,
    validationStatus: undefined,
    workplaceType: "remote",
    ...overrides,
  };
}

const jobs: JobListing[] = [
  createJob("workday-contract", {
    company: "Acme",
    employmentType: "Contract",
    location: "Austin, TX",
    postedAt: "2026-04-15T09:00:00.000Z",
    relevanceScore: 0.42,
    sourceKey: "workday:acme",
    sourceLabel: "Acme",
    sourceType: "workday",
    sourceUrl: "https://acme.wd1.myworkdayjobs.com/job/1",
    title: "Contract Platform Engineer",
    workplaceType: "remote",
  }),
  createJob("greenhouse-full-time", {
    company: "Beta",
    employmentType: "Full-time",
    location: "London, United Kingdom",
    postedAt: "2026-04-13T12:00:00.000Z",
    relevanceScore: 0.97,
    sourceKey: "greenhouse:beta",
    sourceLabel: "Beta",
    sourceType: "greenhouse",
    sourceUrl: "https://boards.greenhouse.io/beta/jobs/1",
    title: "Senior Product Designer",
    workplaceType: "hybrid",
  }),
  createJob("lever-internship", {
    company: "Cipher",
    employmentType: "Internship",
    location: "Chicago, IL",
    postedAt: "2026-04-10T12:00:00.000Z",
    relevanceScore: 0.74,
    sourceKey: "lever:cipher",
    sourceLabel: "Cipher",
    sourceType: "lever",
    sourceUrl: "https://jobs.lever.co/cipher/1",
    title: "ML Research Intern",
    workplaceType: "onsite",
  }),
  createJob("ashby-part-time", {
    company: "Delta",
    employmentType: "Part-time",
    location: "Denver, CO",
    postedAt: "2026-04-05T12:00:00.000Z",
    relevanceScore: 0.33,
    sourceKey: "ashby:delta",
    sourceLabel: "Delta",
    sourceType: "ashby",
    sourceUrl: "https://jobs.ashbyhq.com/delta/1",
    title: "Part-time UX Researcher",
    workplaceType: null,
  }),
  createJob("workable-temporary", {
    company: "Echo",
    employmentType: "Temporary",
    location: "Seattle, WA",
    postedAt: "2026-04-02T12:00:00.000Z",
    relevanceScore: 0.25,
    sourceKey: "workable:echo",
    sourceLabel: "Echo",
    sourceType: "workable",
    sourceUrl: "https://apply.workable.com/echo/j/1",
    title: "Temporary Recruiting Coordinator",
    workplaceType: "remote",
  }),
  createJob("linkedin-unknown", {
    company: "Foxtrot",
    employmentType: null,
    location: "Phoenix, AZ",
    postedAt: "2026-03-25T12:00:00.000Z",
    relevanceScore: 0.63,
    sourceKey: "linkedin:foxtrot",
    sourceLabel: "Foxtrot",
    sourceType: "linkedin",
    sourceUrl: "https://linkedin.com/jobs/view/1",
    title: "Principal Security Analyst",
    workplaceType: "hybrid",
  }),
  createJob("other-full-time", {
    company: "Gamma",
    employmentType: "Full-time",
    location: "Miami, FL",
    postedAt: "2026-04-14T12:00:00.000Z",
    relevanceScore: 0.12,
    sourceKey: "custom:gamma",
    sourceLabel: "Gamma",
    sourceType: "other",
    sourceUrl: "https://jobs.gamma.example/1",
    title: "Solutions Architect",
    workplaceType: "remote",
  }),
];

function getTitles(filters: Partial<typeof DEFAULT_JOB_RAIL_FILTERS> = {}) {
  return filterAndSortJobsForRail(
    jobs,
    {
      ...DEFAULT_JOB_RAIL_FILTERS,
      ...filters,
    },
    NOW,
  ).map((job) => job.title);
}

describe("filterAndSortJobsForRail", () => {
  it("filters company and location dropdowns against the visible jobs", () => {
    expect(getTitles({ company: "Beta" })).toEqual(["Senior Product Designer"]);
    expect(getTitles({ location: "United Kingdom" })).toEqual(["Senior Product Designer"]);
  });

  it("builds country-level location options and drops noisy raw values", () => {
    const locationJobs = [
      createJob("brazil-city", {
        location: "Nova Lima, Shopping Alta Vila",
      }),
      createJob("uk-country", {
        location: "London, United Kingdom",
      }),
      createJob("us-state", {
        location: "Austin, TX",
      }),
      createJob("junk-id", {
        location: "ATCI-5305360-S1946317",
      }),
      createJob("negotiable", {
        location: "Location Negotiable",
      }),
    ];

    expect(getJobRailOptions(locationJobs).locations).toEqual([
      "Brazil",
      "United Kingdom",
      "United States",
    ]);
  });

  it("supports every employment dropdown enum", () => {
    const expectations: Record<Exclude<JobRailEmploymentFilter, "all">, string[]> = {
      contract: ["Contract Platform Engineer"],
      full_time: ["Senior Product Designer", "Solutions Architect"],
      internship: ["ML Research Intern"],
      part_time: ["Part-time UX Researcher"],
      temporary: ["Temporary Recruiting Coordinator"],
      unknown: ["Principal Security Analyst"],
    };

    for (const [value, expectedTitles] of Object.entries(expectations)) {
      expect(
        getTitles({
          employmentType: value as Exclude<JobRailEmploymentFilter, "all">,
        }),
      ).toEqual(expectedTitles);
    }
  });

  it("supports every source dropdown enum", () => {
    const expectations: Record<Exclude<JobRailSourceFilter, "all">, string[]> = {
      ashby: ["Part-time UX Researcher"],
      greenhouse: ["Senior Product Designer"],
      lever: ["ML Research Intern"],
      linkedin: ["Principal Security Analyst"],
      other: ["Solutions Architect"],
      workable: ["Temporary Recruiting Coordinator"],
      workday: ["Contract Platform Engineer"],
    };

    for (const [value, expectedTitles] of Object.entries(expectations)) {
      expect(
        getTitles({
          source: value as Exclude<JobRailSourceFilter, "all">,
        }),
      ).toEqual(expectedTitles);
    }
  });

  it("supports posted-date and workplace filters across their enum values", () => {
    const postedExpectations: Record<Exclude<JobRailPostedDateFilter, "any">, string[]> = {
      "1d": ["Contract Platform Engineer", "Solutions Architect"],
      "3d": [
        "Senior Product Designer",
        "Contract Platform Engineer",
        "Solutions Architect",
      ],
      "7d": [
        "Senior Product Designer",
        "ML Research Intern",
        "Contract Platform Engineer",
        "Solutions Architect",
      ],
      "14d": [
        "Senior Product Designer",
        "ML Research Intern",
        "Contract Platform Engineer",
        "Part-time UX Researcher",
        "Temporary Recruiting Coordinator",
        "Solutions Architect",
      ],
    };
    const workplaceExpectations: Record<Exclude<JobRailWorkplaceFilter, "all">, string[]> = {
      hybrid: ["Senior Product Designer", "Principal Security Analyst"],
      onsite: ["ML Research Intern"],
      remote: [
        "Contract Platform Engineer",
        "Temporary Recruiting Coordinator",
        "Solutions Architect",
      ],
      unknown: ["Part-time UX Researcher"],
    };

    for (const [value, expectedTitles] of Object.entries(postedExpectations)) {
      expect(
        [...getTitles({ postedDate: value as Exclude<JobRailPostedDateFilter, "any"> })].sort(),
      ).toEqual([...expectedTitles].sort());
    }

    for (const [value, expectedTitles] of Object.entries(workplaceExpectations)) {
      expect(
        getTitles({
          workplaceType: value as Exclude<JobRailWorkplaceFilter, "all">,
        }),
      ).toEqual(expectedTitles);
    }
  });

  it("supports every sort enum", () => {
    const expectations: Record<JobRailSort, string[]> = {
      company: [
        "Contract Platform Engineer",
        "Senior Product Designer",
        "ML Research Intern",
        "Part-time UX Researcher",
        "Temporary Recruiting Coordinator",
        "Principal Security Analyst",
        "Solutions Architect",
      ],
      recent: [
        "Contract Platform Engineer",
        "Solutions Architect",
        "Senior Product Designer",
        "ML Research Intern",
        "Part-time UX Researcher",
        "Temporary Recruiting Coordinator",
        "Principal Security Analyst",
      ],
      relevance: [
        "Senior Product Designer",
        "ML Research Intern",
        "Principal Security Analyst",
        "Contract Platform Engineer",
        "Part-time UX Researcher",
        "Temporary Recruiting Coordinator",
        "Solutions Architect",
      ],
    };

    for (const [value, expectedTitles] of Object.entries(expectations)) {
      expect(
        getTitles({
          sort: value as JobRailSort,
        }),
      ).toEqual(expectedTitles);
    }
  });
});
