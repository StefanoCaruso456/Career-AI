import type { CanonicalJobRecord, JobSearchRequestV2, LocationMatchLevel } from "./types";
import { buildLocationLabel } from "./location-normalizer";
import { normalizeText } from "./utils";

export type HardFilterMatch = {
  compensationKnown: boolean;
  locationLevel: LocationMatchLevel | null;
  job: CanonicalJobRecord;
};

function matchesCompany(job: CanonicalJobRecord, request: JobSearchRequestV2) {
  const companies = request.filters.company?.include ?? [];

  if (companies.length === 0) {
    return true;
  }

  return companies.includes(job.company.normalized_name);
}

function matchesWorkplace(job: CanonicalJobRecord, request: JobSearchRequestV2) {
  const requested = request.filters.workplace_type?.include ?? [];

  if (requested.length === 0) {
    return true;
  }

  return requested.includes(job.workplace_type.value);
}

function matchesEmploymentType(job: CanonicalJobRecord, request: JobSearchRequestV2) {
  const requested = request.filters.employment_type?.include ?? [];

  if (requested.length === 0) {
    return true;
  }

  return requested.includes(job.employment_type.value);
}

function matchesSeniority(job: CanonicalJobRecord, request: JobSearchRequestV2) {
  const requested = request.filters.seniority?.include ?? request.filters.title?.seniority ?? [];

  if (requested.length === 0) {
    return true;
  }

  return requested.includes(job.seniority.value);
}

function matchesRecency(job: CanonicalJobRecord, request: JobSearchRequestV2) {
  const recency = request.filters.recency;

  if (!recency) {
    return true;
  }

  const timestamp = Date.parse(job.posted_at ?? job.updated_at ?? "");

  if (Number.isNaN(timestamp)) {
    return false;
  }

  if (recency.posted_since) {
    return timestamp >= Date.parse(recency.posted_since);
  }

  if (recency.posted_within_hours) {
    return Date.now() - timestamp <= recency.posted_within_hours * 60 * 60 * 1_000;
  }

  return true;
}

function matchesLocation(job: CanonicalJobRecord, request: JobSearchRequestV2) {
  const location = request.filters.location;

  if (!location) {
    return {
      level: null,
      matched: true,
    };
  }

  const requestedCity = location.city?.[0] ?? null;
  const requestedMetro = location.metro?.[0] ?? null;
  const requestedState = location.state?.[0] ?? null;
  const requestedCountry = location.country?.[0] ?? null;
  const remoteFallbackAllowed = Boolean(location.allow_remote_fallback);

  if (
    requestedCity &&
    requestedState &&
    job.location.city &&
    job.location.state &&
    normalizeText(job.location.city) === normalizeText(requestedCity) &&
    normalizeText(job.location.state) === normalizeText(requestedState)
  ) {
    return {
      level: "city_state" as const,
      matched: true,
    };
  }

  if (requestedMetro && job.location.metro && normalizeText(job.location.metro) === normalizeText(requestedMetro)) {
    return {
      level: "metro" as const,
      matched: true,
    };
  }

  if (requestedState && job.location.state && normalizeText(job.location.state) === normalizeText(requestedState)) {
    return {
      level: "state" as const,
      matched: true,
    };
  }

  if (
    requestedCountry &&
    job.location.country &&
    normalizeText(job.location.country) === normalizeText(requestedCountry)
  ) {
    return {
      level: "country" as const,
      matched: true,
    };
  }

  if (remoteFallbackAllowed && job.location.remote_allowed) {
    return {
      level: "remote" as const,
      matched: true,
    };
  }

  return {
    level: null,
    matched: false,
  };
}

function matchesCompensation(
  job: CanonicalJobRecord,
  request: JobSearchRequestV2,
  options?: {
    allowUnknownCompensation?: boolean;
    relaxedMinimumPercentage?: number;
  },
) {
  const compensation = request.filters.compensation;

  if (!compensation || (!compensation.min && !compensation.max && !compensation.salary_transparency_only)) {
    return {
      known: job.compensation.salary_min !== null || job.compensation.salary_max !== null,
      matched: true,
    };
  }

  const known = job.compensation.salary_min !== null || job.compensation.salary_max !== null;

  if (!known) {
    return {
      known: false,
      matched: Boolean(options?.allowUnknownCompensation),
    };
  }

  const relaxedMinimum =
    compensation.min && options?.relaxedMinimumPercentage
      ? compensation.min * options.relaxedMinimumPercentage
      : compensation.min ?? null;
  const candidateMin = job.compensation.salary_min ?? job.compensation.salary_max;
  const candidateMax = job.compensation.salary_max ?? job.compensation.salary_min;

  if ((compensation.salary_transparency_only ?? false) && !known) {
    return {
      known,
      matched: false,
    };
  }

  if (relaxedMinimum && candidateMax !== null && candidateMax < relaxedMinimum) {
    return {
      known,
      matched: false,
    };
  }

  if (compensation.max && candidateMin !== null && candidateMin > compensation.max) {
    return {
      known,
      matched: false,
    };
  }

  return {
    known,
    matched: true,
  };
}

function matchesEligibility(job: CanonicalJobRecord, request: JobSearchRequestV2) {
  const eligibility = request.filters.eligibility;

  if (!eligibility) {
    return true;
  }

  if (
    eligibility.sponsorship_available === true &&
    job.eligibility.sponsorship_available === false
  ) {
    return false;
  }

  if (
    eligibility.clearance_required === true &&
    job.eligibility.clearance_required !== true
  ) {
    return false;
  }

  return true;
}

export function applyHardFilters(
  jobs: CanonicalJobRecord[],
  request: JobSearchRequestV2,
  options?: {
    allowUnknownCompensation?: boolean;
    relaxedMinimumPercentage?: number;
  },
): Array<{
  compensationKnown: boolean;
  job: CanonicalJobRecord;
  locationLevel: LocationMatchLevel | null;
}> {
  return jobs
    .filter((job) => job.status === "active")
    .map((job) => {
      const location = matchesLocation(job, request);
      const compensation = matchesCompensation(job, request, options);

      return {
        compensationKnown: compensation.known,
        job,
        locationLevel: location.level,
        matched:
          matchesCompany(job, request) &&
          matchesWorkplace(job, request) &&
          matchesEmploymentType(job, request) &&
          matchesSeniority(job, request) &&
          matchesRecency(job, request) &&
          location.matched &&
          compensation.matched &&
          matchesEligibility(job, request),
      };
    })
    .filter((entry) => entry.matched)
    .map(({ compensationKnown, job, locationLevel }) => ({
      compensationKnown,
      job,
      locationLevel,
    }));
}

export function buildLocationMatchLabel(job: CanonicalJobRecord, level: LocationMatchLevel | null) {
  if (!level) {
    return null;
  }

  return buildLocationLabel({
    city: job.location.city,
    metro: job.location.metro,
    state: job.location.state,
    stateCode: job.location.state_code,
  });
}
