const jobIntentPhrases = [
  "find jobs",
  "search jobs",
  "open roles",
  "open positions",
  "job openings",
  "career opportunities",
] as const;

const jobIntentTerms = [
  "job",
  "jobs",
  "role",
  "roles",
  "position",
  "positions",
  "apply",
  "applying",
  "hiring",
  "recruiter",
  "recruiters",
  "opportunity",
  "opportunities",
  "career",
  "employment",
  "openings",
] as const;

const jobSearchVerbs = [
  "find",
  "show",
  "search",
  "look",
  "surface",
  "pull",
  "browse",
  "see",
] as const;

const jobTitleTerms = [
  "engineer",
  "engineers",
  "developer",
  "developers",
  "designer",
  "designers",
  "manager",
  "managers",
  "analyst",
  "analysts",
  "scientist",
  "scientists",
  "researcher",
  "researchers",
  "recruiter",
  "recruiters",
  "marketer",
  "marketers",
  "specialist",
  "specialists",
  "consultant",
  "consultants",
  "architect",
  "architects",
  "administrator",
  "administrators",
  "operator",
  "operators",
  "strategist",
  "strategists",
  "writer",
  "writers",
  "product",
  "sales",
  "marketing",
  "support",
  "operations",
  "qa",
  "sre",
  "devops",
] as const;

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function isJobIntent(prompt: string) {
  const normalizedPrompt = prompt.trim().toLowerCase();

  if (!normalizedPrompt) {
    return false;
  }

  if (jobIntentPhrases.some((phrase) => normalizedPrompt.includes(phrase))) {
    return true;
  }

  if (
    jobIntentTerms.some((term) =>
      new RegExp(`\\b${escapeRegExp(term)}\\b`, "i").test(normalizedPrompt),
    )
  ) {
    return true;
  }

  const startsWithSearchVerb = jobSearchVerbs.some((verb) =>
    new RegExp(`^\\b${escapeRegExp(verb)}\\b`, "i").test(normalizedPrompt),
  );

  if (!startsWithSearchVerb) {
    return false;
  }

  return jobTitleTerms.some((term) =>
    new RegExp(`\\b${escapeRegExp(term)}\\b`, "i").test(normalizedPrompt),
  );
}
