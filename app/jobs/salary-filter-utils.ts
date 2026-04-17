import type { JobPostingDto } from "@/packages/contracts/src";
import {
  annualizeSalaryRange,
  parseSalaryText,
} from "@/packages/jobs-domain/src/job-search-retrieval/utils";

export const SALARY_RANGE_OPTIONS = [
  "under-100k",
  "100k-150k",
  "150k-200k",
  "200k-250k",
  "250k-plus",
] as const;

export type SalaryRangeFilter = "all" | (typeof SALARY_RANGE_OPTIONS)[number];

export type NormalizedJobSalary = {
  annualMax: number | null;
  annualMin: number | null;
  currency: string | null;
  max: number | null;
  min: number | null;
  period: "hourly" | "monthly" | "unknown" | "yearly";
  rawText: string | null;
};

export type SalaryFilterReason =
  | "above-band"
  | "below-band"
  | "matched"
  | "missing-salary"
  | "non-usd-currency"
  | "no-filter"
  | "unparseable-salary";

export type SalaryFilterEvaluation = {
  band:
    | {
        max: number | null;
        min: number | null;
      }
    | null;
  matches: boolean;
  normalizedSalary: NormalizedJobSalary | null;
  reason: SalaryFilterReason;
};

function getSalaryFilterBand(filter: Exclude<SalaryRangeFilter, "all">) {
  if (filter === "under-100k") {
    return { min: null, max: 100_000 };
  }

  if (filter === "100k-150k") {
    return { min: 100_000, max: 150_000 };
  }

  if (filter === "150k-200k") {
    return { min: 150_000, max: 200_000 };
  }

  if (filter === "200k-250k") {
    return { min: 200_000, max: 250_000 };
  }

  return { min: 250_000, max: null };
}

export function normalizeJobSalary(
  job: Pick<JobPostingDto, "salaryRange" | "salaryText">,
): NormalizedJobSalary | null {
  const parsedRawSalary = parseSalaryText(job.salaryText ?? job.salaryRange?.rawText ?? null);
  const min = job.salaryRange?.min ?? parsedRawSalary.min;
  const max = job.salaryRange?.max ?? parsedRawSalary.max;
  const rawText = job.salaryText ?? job.salaryRange?.rawText ?? parsedRawSalary.rawText;
  const currency = job.salaryRange?.currency ?? parsedRawSalary.currency;

  if (!rawText && min === null && max === null) {
    return null;
  }

  const annualizedSalary = annualizeSalaryRange({
    max,
    min,
    period: parsedRawSalary.period,
  });

  return {
    annualMax: annualizedSalary.max,
    annualMin: annualizedSalary.min,
    currency,
    max,
    min,
    period: parsedRawSalary.period,
    rawText,
  };
}

export function evaluateSalaryFilter(
  job: Pick<JobPostingDto, "salaryRange" | "salaryText">,
  salaryRangeFilter: SalaryRangeFilter,
): SalaryFilterEvaluation {
  if (salaryRangeFilter === "all") {
    return {
      band: null,
      matches: true,
      normalizedSalary: normalizeJobSalary(job),
      reason: "no-filter",
    };
  }

  const normalizedSalary = normalizeJobSalary(job);
  const band = getSalaryFilterBand(salaryRangeFilter);

  if (!normalizedSalary) {
    return {
      band,
      matches: false,
      normalizedSalary: null,
      reason: "missing-salary",
    };
  }

  const candidateMin = normalizedSalary.annualMin ?? normalizedSalary.annualMax ?? null;
  const candidateMax = normalizedSalary.annualMax ?? normalizedSalary.annualMin ?? null;

  if (candidateMin === null && candidateMax === null) {
    return {
      band,
      matches: false,
      normalizedSalary,
      reason: normalizedSalary.rawText ? "unparseable-salary" : "missing-salary",
    };
  }

  if (normalizedSalary.currency && normalizedSalary.currency !== "USD") {
    return {
      band,
      matches: false,
      normalizedSalary,
      reason: "non-usd-currency",
    };
  }

  if (band.min !== null && candidateMax !== null && candidateMax < band.min) {
    return {
      band,
      matches: false,
      normalizedSalary,
      reason: "below-band",
    };
  }

  if (band.max !== null && candidateMin !== null && candidateMin > band.max) {
    return {
      band,
      matches: false,
      normalizedSalary,
      reason: "above-band",
    };
  }

  return {
    band,
    matches: true,
    normalizedSalary,
    reason: "matched",
  };
}
