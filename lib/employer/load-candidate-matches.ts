import { employerCandidateSearchResponseSchema, type EmployerCandidateSearchFiltersDto } from "@/packages/contracts/src";

type LoadEmployerCandidateMatchesOptions = {
  conversationId?: string | null;
  filters?: EmployerCandidateSearchFiltersDto;
  limit?: number;
  prompt: string;
  refresh?: boolean;
  signal?: AbortSignal;
};

const defaultEmployerCandidateLimit = 6;

export async function loadEmployerCandidateMatches(
  options: LoadEmployerCandidateMatchesOptions,
) {
  const response = await fetch("/api/v1/employer/candidates/search", {
    body: JSON.stringify({
      conversationId: options.conversationId ?? null,
      filters: options.filters,
      limit: options.limit ?? defaultEmployerCandidateLimit,
      prompt: options.prompt,
      refresh: options.refresh ?? false,
    }),
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
    signal: options.signal,
  });
  const payload = (await response.json()) as {
    error?: string;
    message?: string;
  };

  if (!response.ok) {
    throw new Error(
      payload.error || payload.message || "Unable to load recruiter candidate results.",
    );
  }

  return employerCandidateSearchResponseSchema.parse(payload);
}
