const NAME_LOOKUP_MIN_WORDS = 2;
const NAME_LOOKUP_MAX_WORDS = 4;
const NAME_LOOKUP_MAX_LENGTH = 80;
const NAME_LOOKUP_TOKEN_PATTERN = /^[a-z][a-z'.-]{1,29}$/i;
const NAME_LOOKUP_BLOCKLIST = new Set([
  "aligned",
  "analyst",
  "and",
  "any",
  "architect",
  "artificial",
  "backend",
  "candidate",
  "candidates",
  "career",
  "consultant",
  "coordinator",
  "customer",
  "data",
  "description",
  "designer",
  "developer",
  "director",
  "engineer",
  "find",
  "for",
  "frontend",
  "fullstack",
  "hiring",
  "hybrid",
  "in",
  "intelligence",
  "job",
  "jobs",
  "lead",
  "learning",
  "located",
  "machine",
  "manager",
  "marketing",
  "marketer",
  "match",
  "near",
  "onsite",
  "operations",
  "people",
  "pipeline",
  "platform",
  "product",
  "profile",
  "profiles",
  "pull",
  "qualifications",
  "rank",
  "recruiter",
  "remote",
  "requirements",
  "role",
  "roles",
  "sales",
  "scientist",
  "screen",
  "search",
  "security",
  "shortlist",
  "software",
  "source",
  "specialist",
  "success",
  "support",
  "talent",
  "the",
  "trust",
  "verified",
  "verify",
  "with",
  "work",
]);

function normalizePrompt(prompt: string) {
  return prompt.replace(/\s+/g, " ").trim();
}

export function getLikelyEmployerCandidateNameLookup(prompt: string) {
  const normalizedPrompt = normalizePrompt(prompt);

  if (
    !normalizedPrompt ||
    normalizedPrompt.length > NAME_LOOKUP_MAX_LENGTH ||
    /\n/.test(prompt) ||
    /[0-9@:/\\]/.test(normalizedPrompt) ||
    /[?!;,()[\]{}]/.test(normalizedPrompt)
  ) {
    return null;
  }

  const segments = normalizedPrompt.split(" ");

  if (segments.length < NAME_LOOKUP_MIN_WORDS || segments.length > NAME_LOOKUP_MAX_WORDS) {
    return null;
  }

  const loweredSegments = segments.map((segment) => segment.toLowerCase());

  if (
    loweredSegments.some(
      (segment) =>
        NAME_LOOKUP_BLOCKLIST.has(segment) || !NAME_LOOKUP_TOKEN_PATTERN.test(segment),
    )
  ) {
    return null;
  }

  return normalizedPrompt;
}

export function isLikelyEmployerCandidateNameLookup(prompt: string) {
  return getLikelyEmployerCandidateNameLookup(prompt) !== null;
}
