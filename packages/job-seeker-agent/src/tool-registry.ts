import { z } from "zod";

export const searchWebFreshnessSchema = z.enum(["any", "day", "week", "month"]);

export const searchWebToolInputSchema = z.object({
  domains: z.array(z.string().trim().min(1)).max(10).optional(),
  freshness: searchWebFreshnessSchema.default("any"),
  query: z.string().trim().min(1).max(500),
  top_k: z.number().int().min(1).max(10).default(6),
});

export const searchWebResultSchema = z.object({
  published_at: z.string().nullable().optional(),
  snippet: z.string().trim().min(1),
  source: z.string().trim().min(1),
  title: z.string().trim().min(1),
  url: z.string().url(),
});

export const searchWebToolOutputSchema = z.object({
  query_used: z.string().trim().min(1),
  results: z.array(searchWebResultSchema),
});

type JobSeekerToolDefinition = {
  description: string;
  doNotUse: string[];
  name: string;
  useCases: string[];
};

export const jobSeekerToolRegistry = {
  browseLatestJobs: {
    description:
      "Browse the newest jobs from Career AI's internal connected job inventory. Use this for platform-specific latest jobs, newest openings, or fresh internal listings.",
    doNotUse: [
      "Public market trends or current events outside Career AI",
      "Candidate or user profile lookups",
      "Static definitions or explanations",
    ],
    name: "browseLatestJobs",
    useCases: [
      "latest jobs on our platform",
      "newest roles in Career AI",
      "fresh openings in the internal inventory",
    ],
  },
  findSimilarJobs: {
    description:
      "Find jobs in Career AI's internal inventory that are similar to a known job posting already retrieved from the platform.",
    doNotUse: [
      "Current public-market trend questions",
      "General profile lookups",
      "Static knowledge questions",
    ],
    name: "findSimilarJobs",
    useCases: [
      "roles similar to this job",
      "more jobs like this posting",
      "adjacent opportunities based on an internal job id",
    ],
  },
  getJobById: {
    description:
      "Retrieve a single known job posting from Career AI's internal inventory when the request is anchored to a specific internal job id.",
    doNotUse: [
      "Broad search queries",
      "Current public-market questions",
      "Profile retrieval",
    ],
    name: "getJobById",
    useCases: [
      "look up a specific internal job",
      "load one known posting",
    ],
  },
  getUserCareerProfile: {
    description:
      "Retrieve the signed-in user's Career ID or profile context from internal platform data so job ranking or profile-specific answers stay grounded.",
    doNotUse: [
      "Public web questions",
      "General market trends",
      "Requests for platform-wide job inventory unless profile context is needed first",
    ],
    name: "getUserCareerProfile",
    useCases: [
      "my profile",
      "my Career ID",
      "jobs aligned with my background",
      "summarize my experience from the platform context",
    ],
  },
  searchJobs: {
    description:
      "Search Career AI's internal job inventory using structured filters such as role, skills, location, seniority, and workplace preference.",
    doNotUse: [
      "Current public hiring trends",
      "Latest layoffs or market news",
      "Questions that require fresh external information from the public web",
    ],
    name: "searchJobs",
    useCases: [
      "find jobs in our platform",
      "search internal roles by title or skills",
      "platform job retrieval for a candidate",
    ],
  },
  search_web: {
    description:
      "Search the public web for current, external, or changing information. Use this for live hiring trends, market demand, layoffs, recruiting trends, company hiring activity, and other public information that may have changed recently.",
    doNotUse: [
      "Static knowledge questions that do not need freshness",
      "Career AI internal jobs or database records",
      "User-specific profile or candidate data",
    ],
    name: "search_web",
    useCases: [
      "current job market trends",
      "hot roles right now",
      "in-demand skills this month",
      "latest layoffs in tech",
      "companies hiring the most currently",
    ],
  },
} as const satisfies Record<string, JobSeekerToolDefinition>;

export function buildJobSeekerToolPolicyText() {
  return Object.values(jobSeekerToolRegistry)
    .map((tool) => {
      const useCases = tool.useCases.map((example) => `- ${example}`).join("\n");
      const doNotUse = tool.doNotUse.map((rule) => `- ${rule}`).join("\n");

      return [
        `${tool.name}: ${tool.description}`,
        "Use cases:",
        useCases,
        "Do not use for:",
        doNotUse,
      ].join("\n");
    })
    .join("\n\n");
}

export function buildSearchWebQueryUsed(input: z.input<typeof searchWebToolInputSchema>) {
  const parsed = searchWebToolInputSchema.parse(input);
  const segments = [parsed.query];

  if (parsed.freshness !== "any") {
    segments.push(`Freshness: ${parsed.freshness}`);
  }

  if (parsed.domains?.length) {
    segments.push(
      `Domains: ${parsed.domains.map((domain) => `site:${domain}`).join(" OR ")}`,
    );
  }

  return segments.join(" | ");
}

export type SearchWebFreshness = z.infer<typeof searchWebFreshnessSchema>;
export type SearchWebToolInput = z.infer<typeof searchWebToolInputSchema>;
export type SearchWebToolOutput = z.infer<typeof searchWebToolOutputSchema>;
