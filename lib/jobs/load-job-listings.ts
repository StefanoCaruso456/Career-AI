import { jobsPanelResponseSchema } from "@/packages/contracts/src";
import { mapJobsToListings } from "@/lib/jobs/map-jobs-to-listings";

type LoadJobListingsOptions = {
  conversationId?: string | null;
  limit?: number;
  prompt: string;
  refresh?: boolean;
  signal?: AbortSignal;
};

const defaultJobAssistLimit = 6;

export async function loadJobListings(options: LoadJobListingsOptions) {
  const response = await fetch("/api/v1/jobs/search", {
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
    signal: options.signal,
    body: JSON.stringify({
      conversationId: options.conversationId ?? null,
      limit: options.limit ?? defaultJobAssistLimit,
      origin: options.refresh ? "panel_refresh" : "api",
      prompt: options.prompt,
      refresh: options.refresh ?? false,
    }),
  });
  const payload = (await response.json()) as {
    error?: string;
    message?: string;
  };

  if (!response.ok) {
    throw new Error(payload.error || payload.message || "Jobs could not be loaded right now.");
  }

  const snapshot = jobsPanelResponseSchema.parse(payload);

  return {
    ...snapshot,
    listings: mapJobsToListings(snapshot.jobs),
  };
}
