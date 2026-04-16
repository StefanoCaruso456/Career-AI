import { normalizeText, uniqueStrings } from "./utils";

export type SkillTaxonomyEntry = {
  aliases: string[];
  canonical: string;
};

export const SKILL_TAXONOMY: SkillTaxonomyEntry[] = [
  {
    aliases: ["python", "py"],
    canonical: "Python",
  },
  {
    aliases: ["sql", "postgres", "postgresql"],
    canonical: "SQL",
  },
  {
    aliases: ["llm evals", "llm evaluation", "model evaluation", "genai evaluation", "prompt evaluation"],
    canonical: "LLM Evaluation",
  },
  {
    aliases: ["js", "javascript", "node"],
    canonical: "JavaScript",
  },
  {
    aliases: ["ts", "typescript"],
    canonical: "TypeScript",
  },
  {
    aliases: ["k8s", "kubernetes"],
    canonical: "Kubernetes",
  },
  {
    aliases: ["snowflake"],
    canonical: "Snowflake",
  },
  {
    aliases: ["fhir"],
    canonical: "FHIR",
  },
  {
    aliases: ["machine learning", "ml"],
    canonical: "Machine Learning",
  },
  {
    aliases: ["genai", "generative ai"],
    canonical: "Generative AI",
  },
];

export function normalizeSkillPhrase(value: string | null | undefined) {
  const normalized = normalizeText(value);

  if (!normalized) {
    return null;
  }

  for (const entry of SKILL_TAXONOMY) {
    if (entry.aliases.some((alias) => normalizeText(alias) === normalized)) {
      return entry.canonical;
    }
  }

  for (const entry of SKILL_TAXONOMY) {
    if (entry.aliases.some((alias) => normalized.includes(normalizeText(alias)))) {
      return entry.canonical;
    }
  }

  return value?.trim() || null;
}

export function extractCanonicalSkills(text: string) {
  const normalized = normalizeText(text);
  const matched = SKILL_TAXONOMY.filter((entry) =>
    entry.aliases.some((alias) => normalized.includes(normalizeText(alias))),
  ).map((entry) => entry.canonical);

  return uniqueStrings(matched);
}
