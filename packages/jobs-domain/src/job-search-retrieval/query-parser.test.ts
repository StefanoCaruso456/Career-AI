import { describe, expect, it } from "vitest";
import { normalizeJobSearchRequest } from "./filter-normalizer";
import { parseJobSearchRequest } from "./query-parser";

const NOW = new Date("2026-04-16T18:00:00.000Z");

function parse(query: string) {
  return normalizeJobSearchRequest(
    parseJobSearchRequest(query, {
      now: NOW,
      timeZone: "America/Chicago",
    }),
  );
}

describe("job search request parser", () => {
  it("parses the required regression query set", () => {
    const cases = [
      {
        query: "find me new jobs in austin texas",
        assert(result: ReturnType<typeof parse>) {
          expect(result.filters.location?.city).toEqual(["Austin"]);
          expect(result.filters.location?.state).toEqual(["Texas"]);
          expect(result.filters.recency?.label).toBe("last_7_days");
        },
      },
      {
        query: "show me remote ai engineer roles posted in the last 24 hours",
        assert(result: ReturnType<typeof parse>) {
          expect(result.filters.workplace_type?.include).toEqual(["remote"]);
          expect(result.filters.title?.include).toContain("ai engineer");
          expect(result.filters.recency?.label).toBe("last_24_hours");
        },
      },
      {
        query: "find product roles over 180k at apple or nvidia",
        assert(result: ReturnType<typeof parse>) {
          expect(result.filters.company?.include).toEqual(["apple", "nvidia"]);
          expect(result.filters.compensation?.min).toBe(180000);
          expect(result.filters.compensation?.strict_minimum).toBe(true);
        },
      },
      {
        query: "show me hybrid jobs in austin with sql and python on data teams",
        assert(result: ReturnType<typeof parse>) {
          expect(result.filters.workplace_type?.include).toEqual(["hybrid"]);
          expect(result.filters.skills?.include).toEqual(expect.arrayContaining(["SQL", "Python"]));
          expect(result.filters.team?.include).toEqual(["data"]);
        },
      },
      {
        query: "show me onsite recruiter jobs in dallas",
        assert(result: ReturnType<typeof parse>) {
          expect(result.filters.workplace_type?.include).toEqual(["onsite"]);
          expect(result.filters.title?.include).toContain("recruiter");
        },
      },
      {
        query: "find senior software engineer jobs with kubernetes",
        assert(result: ReturnType<typeof parse>) {
          expect(result.filters.seniority?.include).toEqual(["senior"]);
          expect(result.filters.title?.include).toContain("software engineer");
          expect(result.filters.skills?.include).toContain("Kubernetes");
        },
      },
      {
        query: "show me highest paying remote product manager roles",
        assert(result: ReturnType<typeof parse>) {
          expect(result.sort.primary).toBe("compensation");
          expect(result.filters.compensation?.highest_paying).toBe(true);
          expect(result.filters.workplace_type?.include).toEqual(["remote"]);
        },
      },
      {
        query: "find jobs at google with sponsorship",
        assert(result: ReturnType<typeof parse>) {
          expect(result.filters.company?.include).toEqual(["google"]);
          expect(result.filters.eligibility?.sponsorship_available).toBe(true);
        },
      },
      {
        query: "show me principal roles posted today",
        assert(result: ReturnType<typeof parse>) {
          expect(result.filters.seniority?.include).toEqual(["principal"]);
          expect(result.filters.recency?.label).toBe("today");
          expect(result.filters.recency?.posted_since).toBeTruthy();
        },
      },
      {
        query: "find healthcare data jobs in texas",
        assert(result: ReturnType<typeof parse>) {
          expect(result.filters.location?.state).toEqual(["Texas"]);
          expect(result.keywords).toContain("healthcare");
        },
      },
    ];

    for (const testCase of cases) {
      testCase.assert(parse(testCase.query));
    }
  });
});
