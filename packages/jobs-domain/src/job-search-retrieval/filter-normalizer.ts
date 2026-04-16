import { normalizeLocationPhrase } from "./location-normalizer";
import { normalizeSkillPhrase } from "./skill-taxonomy";
import { expandTitleTerms } from "./title-taxonomy";
import type { JobSearchRequestV2 } from "./types";
import { uniqueStrings } from "./utils";

export function normalizeJobSearchRequest(request: JobSearchRequestV2): JobSearchRequestV2 {
  const normalizedTitle = expandTitleTerms(request.filters.title?.include ?? []);
  const cityValues = uniqueStrings(
    (request.filters.location?.city ?? [])
      .map((value) => normalizeLocationPhrase(value)?.city ?? value)
      .filter(Boolean),
  );
  const stateValues = uniqueStrings(
    (request.filters.location?.state ?? [])
      .map((value) => normalizeLocationPhrase(value)?.state ?? value)
      .filter(Boolean),
  );
  const stateCodeValues = uniqueStrings(
    (request.filters.location?.state_code ?? [])
      .map((value) => normalizeLocationPhrase(value)?.state_code ?? value)
      .filter(Boolean),
  );
  const metroValues = uniqueStrings(
    (request.filters.location?.metro ?? [])
      .map((value) => normalizeLocationPhrase(value)?.metro ?? value)
      .filter(Boolean),
  );
  const countryValues = uniqueStrings(
    (request.filters.location?.country ?? [])
      .map((value) => normalizeLocationPhrase(value)?.country ?? value)
      .filter(Boolean),
  );
  const countryCodeValues = uniqueStrings(
    (request.filters.location?.country_code ?? [])
      .map((value) => normalizeLocationPhrase(value)?.country_code ?? value)
      .filter(Boolean),
  );
  const normalizedSkills = uniqueStrings(
    (request.filters.skills?.include ?? [])
      .map((skill) => normalizeSkillPhrase(skill))
      .filter((skill): skill is string => Boolean(skill)),
  );
  const normalizedCompanies = uniqueStrings(request.filters.company?.include ?? []).map((company) =>
    company.trim().toLowerCase(),
  );

  return {
    ...request,
    filters: {
      ...request.filters,
      company:
        normalizedCompanies.length > 0
          ? {
              ...request.filters.company,
              include: normalizedCompanies,
            }
          : request.filters.company,
      location:
        cityValues.length > 0 ||
        stateValues.length > 0 ||
        metroValues.length > 0 ||
        countryValues.length > 0
          ? {
              ...request.filters.location,
              city: cityValues,
              country: countryValues,
              country_code: countryCodeValues,
              metro: metroValues,
              state: stateValues,
              state_code: stateCodeValues,
            }
          : request.filters.location,
      skills:
        normalizedSkills.length > 0
          ? {
              include: normalizedSkills,
              preferred: uniqueStrings(
                (request.filters.skills?.preferred ?? [])
                  .map((skill) => normalizeSkillPhrase(skill))
                  .filter((skill): skill is string => Boolean(skill)),
              ),
              required: uniqueStrings(
                (request.filters.skills?.required ?? [])
                  .map((skill) => normalizeSkillPhrase(skill))
                  .filter((skill): skill is string => Boolean(skill)),
              ),
            }
          : request.filters.skills,
      title:
        normalizedTitle.titles.length > 0 || normalizedTitle.families.length > 0 || normalizedTitle.clusters.length > 0
          ? {
              ...request.filters.title,
              clusters: normalizedTitle.clusters,
              family: normalizedTitle.families,
              include: normalizedTitle.titles,
            }
          : request.filters.title,
    },
    keywords: uniqueStrings(request.keywords),
  };
}
