import { normalizeText, uniqueStrings } from "./utils";

export type TitleTaxonomyEntry = {
  aliases: string[];
  broaderRoles: string[];
  canonical: string;
  cluster: string;
  family: string;
};

export const TITLE_TAXONOMY: TitleTaxonomyEntry[] = [
  {
    aliases: ["pm", "product owner", "product lead", "product management", "product manager"],
    broaderRoles: ["product role", "product"],
    canonical: "product manager",
    cluster: "product",
    family: "product manager",
  },
  {
    aliases: ["swe", "software developer", "developer", "software engineer"],
    broaderRoles: ["engineering role", "engineer", "engineering"],
    canonical: "software engineer",
    cluster: "engineering",
    family: "software engineer",
  },
  {
    aliases: ["mle", "machine learning", "machine learning engineer", "ml engineer"],
    broaderRoles: ["ai engineer", "ml role", "machine learning role"],
    canonical: "machine learning engineer",
    cluster: "ai_ml",
    family: "machine learning engineer",
  },
  {
    aliases: ["ai engineer", "applied ai engineer", "genai engineer", "llm engineer"],
    broaderRoles: ["ai role", "applied ai", "artificial intelligence engineer"],
    canonical: "ai engineer",
    cluster: "ai_ml",
    family: "ai engineer",
  },
  {
    aliases: ["data analyst", "analytics analyst", "bi analyst", "business intelligence analyst"],
    broaderRoles: ["analytics role", "data role"],
    canonical: "data analyst",
    cluster: "data",
    family: "data analyst",
  },
  {
    aliases: ["data scientist", "applied scientist", "research scientist"],
    broaderRoles: ["data role", "scientist role"],
    canonical: "data scientist",
    cluster: "data",
    family: "data scientist",
  },
  {
    aliases: ["recruiter", "technical recruiter", "sourcer", "talent acquisition"],
    broaderRoles: ["talent role", "people role", "recruiting"],
    canonical: "recruiter",
    cluster: "talent",
    family: "recruiter",
  },
  {
    aliases: ["product designer", "ux designer", "ui designer"],
    broaderRoles: ["design role", "designer"],
    canonical: "product designer",
    cluster: "design",
    family: "product designer",
  },
  {
    aliases: ["backend engineer", "backend developer", "api engineer"],
    broaderRoles: ["engineering role", "engineer", "backend"],
    canonical: "backend engineer",
    cluster: "engineering",
    family: "backend engineer",
  },
  {
    aliases: ["platform engineer", "devops engineer", "site reliability engineer", "sre"],
    broaderRoles: ["engineering role", "platform role", "infrastructure"],
    canonical: "platform engineer",
    cluster: "engineering",
    family: "platform engineer",
  },
];

export function normalizeTitlePhrase(value: string | null | undefined) {
  const normalized = normalizeText(value);

  if (!normalized) {
    return null;
  }

  for (const entry of TITLE_TAXONOMY) {
    if (entry.aliases.some((alias) => normalizeText(alias) === normalized)) {
      return entry;
    }
  }

  for (const entry of TITLE_TAXONOMY) {
    if (
      entry.aliases.some((alias) => normalized.includes(normalizeText(alias))) ||
      entry.broaderRoles.some((alias) => normalized.includes(normalizeText(alias)))
    ) {
      return entry;
    }
  }

  return null;
}

export function expandTitleTerms(values: string[]) {
  const exactTitles: string[] = [];
  const families: string[] = [];
  const clusters: string[] = [];

  for (const value of values) {
    const entry = normalizeTitlePhrase(value);

    if (entry) {
      exactTitles.push(entry.canonical);
      families.push(entry.family);
      clusters.push(entry.cluster);
      continue;
    }

    exactTitles.push(normalizeText(value));
  }

  return {
    clusters: uniqueStrings(clusters),
    families: uniqueStrings(families),
    titles: uniqueStrings(exactTitles),
  };
}
