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

  return jobIntentTerms.some((term) =>
    new RegExp(`\\b${escapeRegExp(term)}\\b`, "i").test(normalizedPrompt),
  );
}
