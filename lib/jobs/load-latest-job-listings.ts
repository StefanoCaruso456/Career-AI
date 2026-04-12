import { jobsPanelResponseSchema } from "@/packages/contracts/src";
import { mapJobsPanelToListings } from "@/lib/jobs/map-jobs-to-listings";

type LoadLatestJobListingsOptions = {
  conversationId?: string | null;
  limit?: number;
  refresh?: boolean;
  signal?: AbortSignal;
};

const defaultLatestJobsLimit = 6;

export async function loadLatestJobListings(options: LoadLatestJobListingsOptions) {
  const response = await fetch("/api/v1/jobs/latest", {
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
    signal: options.signal,
    body: JSON.stringify({
      conversationId: options.conversationId ?? null,
      limit: options.limit ?? defaultLatestJobsLimit,
      refresh: options.refresh ?? false,
    }),
  });
  const payload = (await response.json()) as {
    error?: string;
    message?: string;
  };

  if (!response.ok) {
    throw new Error(payload.error || payload.message || "Latest jobs could not be loaded right now.");
  }

  const snapshot = jobsPanelResponseSchema.parse(payload);

  return {
    ...snapshot,
    listings: mapJobsPanelToListings(snapshot),
  };
}
