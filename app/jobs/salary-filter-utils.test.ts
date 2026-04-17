import { describe, expect, it } from "vitest";
import type { JobPostingDto } from "@/packages/contracts/src";
import { evaluateSalaryFilter, normalizeJobSalary } from "./salary-filter-utils";

function createJob(overrides?: Partial<JobPostingDto>): JobPostingDto {
  return {
    applyUrl: "https://jobs.example.com/1",
    companyName: "Example",
    externalId: "external-1",
    id: "job-1",
    sourceKey: "greenhouse:example",
    sourceLabel: "Example",
    sourceLane: "ats_direct",
    sourceQuality: "high_signal",
    title: "Example Role",
    ...overrides,
  };
}

describe("salary filter utils", () => {
  it("normalizes raw salary text into annualized comparable values", () => {
    const normalized = normalizeJobSalary(
      createJob({
        salaryText: "$78/hour",
      }),
    );

    expect(normalized).toMatchObject({
      annualMax: 162240,
      annualMin: 162240,
      currency: "USD",
      max: 78,
      min: 78,
      period: "hourly",
      rawText: "$78/hour",
    });
  });

  it("matches overlapping salary ranges instead of requiring full containment", () => {
    const evaluation = evaluateSalaryFilter(
      createJob({
        salaryText: "$120,000 - $180,000",
      }),
      "100k-150k",
    );

    expect(evaluation.matches).toBe(true);
    expect(evaluation.reason).toBe("matched");
  });

  it("matches single-sided minimum salaries when they overlap the selected band", () => {
    const evaluation = evaluateSalaryFilter(
      createJob({
        salaryText: "$120,000+",
      }),
      "100k-150k",
    );

    expect(evaluation.matches).toBe(true);
    expect(evaluation.reason).toBe("matched");
  });

  it("matches single-sided maximum salaries when they overlap the selected band", () => {
    const evaluation = evaluateSalaryFilter(
      createJob({
        salaryText: "Up to $140,000",
      }),
      "100k-150k",
    );

    expect(evaluation.matches).toBe(true);
    expect(evaluation.reason).toBe("matched");
  });

  it("excludes non-USD salaries from USD salary band filtering", () => {
    const evaluation = evaluateSalaryFilter(
      createJob({
        salaryRange: {
          currency: "EUR",
          max: 140000,
          min: 120000,
          rawText: "€120,000 - €140,000 yearly",
        },
        salaryText: null,
      }),
      "100k-150k",
    );

    expect(evaluation.matches).toBe(false);
    expect(evaluation.reason).toBe("non-usd-currency");
  });

  it("excludes jobs with missing salary data only when a salary filter is active", () => {
    const filteredEvaluation = evaluateSalaryFilter(
      createJob({
        salaryText: null,
      }),
      "100k-150k",
    );
    const unfilteredEvaluation = evaluateSalaryFilter(
      createJob({
        salaryText: null,
      }),
      "all",
    );

    expect(filteredEvaluation.matches).toBe(false);
    expect(filteredEvaluation.reason).toBe("missing-salary");
    expect(unfilteredEvaluation.matches).toBe(true);
    expect(unfilteredEvaluation.reason).toBe("no-filter");
  });

  it("treats non-numeric salary text as unparseable when a salary filter is active", () => {
    const evaluation = evaluateSalaryFilter(
      createJob({
        salaryText: "Compensation depends on level and location.",
      }),
      "100k-150k",
    );

    expect(evaluation.matches).toBe(false);
    expect(evaluation.reason).toBe("unparseable-salary");
  });

  it("uses structured salary ranges from the API when they are available", () => {
    const evaluation = evaluateSalaryFilter(
      createJob({
        salaryRange: {
          currency: "USD",
          max: 155000,
          min: 145000,
          rawText: "$145,000 - $155,000",
        },
        salaryText: null,
      }),
      "100k-150k",
    );

    expect(evaluation.matches).toBe(true);
    expect(evaluation.normalizedSalary).toMatchObject({
      annualMax: 155000,
      annualMin: 145000,
    });
  });
});
