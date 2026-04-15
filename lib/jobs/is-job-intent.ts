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
  "software",
  "engineer",
  "engineers",
  "developer",
  "developers",
  "frontend",
  "backend",
  "fullstack",
  "platform",
  "ai",
  "ml",
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

function tokenizePrompt(prompt: string) {
  return prompt
    .split(/[^a-z0-9+#.-]+/i)
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);
}

function isSingleTranspositionAway(left: string, right: string) {
  if (left.length !== right.length || left.length < 2) {
    return false;
  }

  const differingIndices: number[] = [];

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      differingIndices.push(index);
    }
  }

  if (differingIndices.length !== 2) {
    return false;
  }

  const [first, second] = differingIndices;

  return left[first] === right[second] && left[second] === right[first];
}

function isSingleEditAway(left: string, right: string) {
  if (left === right) {
    return true;
  }

  if (Math.abs(left.length - right.length) > 1) {
    return false;
  }

  const shorter = left.length <= right.length ? left : right;
  const longer = left.length <= right.length ? right : left;
  let shorterIndex = 0;
  let longerIndex = 0;
  let editCount = 0;

  while (shorterIndex < shorter.length && longerIndex < longer.length) {
    if (shorter[shorterIndex] === longer[longerIndex]) {
      shorterIndex += 1;
      longerIndex += 1;
      continue;
    }

    editCount += 1;

    if (editCount > 1) {
      return false;
    }

    if (shorter.length === longer.length) {
      shorterIndex += 1;
    }

    longerIndex += 1;
  }

  if (shorterIndex < shorter.length || longerIndex < longer.length) {
    editCount += 1;
  }

  return editCount <= 1;
}

function matchesLooseTerm(token: string, terms: readonly string[]) {
  return terms.some((term) => {
    const normalizedTerm = term.toLowerCase();

    if (token === normalizedTerm) {
      return true;
    }

    if (token.length < 4 || normalizedTerm.length < 4) {
      return false;
    }

    return (
      isSingleTranspositionAway(token, normalizedTerm) ||
      isSingleEditAway(token, normalizedTerm)
    );
  });
}

export function isJobIntent(prompt: string) {
  const normalizedPrompt = prompt.trim().toLowerCase();

  if (!normalizedPrompt) {
    return false;
  }

  const tokens = tokenizePrompt(normalizedPrompt);

  if (jobIntentPhrases.some((phrase) => normalizedPrompt.includes(phrase))) {
    return true;
  }

  const containsExplicitJobTerm = jobIntentTerms.some((term) =>
    new RegExp(`\\b${escapeRegExp(term)}\\b`, "i").test(normalizedPrompt),
  );
  const containsLooseJobTerm = tokens.some((token) => matchesLooseTerm(token, jobIntentTerms));
  const hasJobTitleSignal = tokens.some((token) => matchesLooseTerm(token, jobTitleTerms));
  const hasScopedSearchSignal =
    /\b(?:at|from|near|around|remote|hybrid|onsite|on-site)\b/i.test(normalizedPrompt) ||
    /\bin\s+(?:the\s+)?(?:usa|us|u\\.s\\.|united states|united kingdom|uk|canada|australia)\b/i.test(
      normalizedPrompt,
    ) ||
    /\b[A-Z][a-z0-9&.-]+\b/.test(prompt);
  const startsWithSearchVerb = jobSearchVerbs.some((verb) =>
    new RegExp(`^\\b${escapeRegExp(verb)}\\b`, "i").test(normalizedPrompt),
  );

  if (
    (containsExplicitJobTerm || containsLooseJobTerm) &&
    (hasJobTitleSignal || hasScopedSearchSignal || startsWithSearchVerb)
  ) {
    return true;
  }

  if (!startsWithSearchVerb) {
    return false;
  }

  return hasJobTitleSignal;
}
