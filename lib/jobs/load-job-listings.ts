import { jobsFeedResponseSchema } from "@/packages/contracts/src";
import { mapJobsToListings } from "@/lib/jobs/map-jobs-to-listings";

type LoadJobListingsOptions = {
  limit?: number;
  signal?: AbortSignal;
};

const defaultJobAssistLimit = 6;

export async function loadJobListings(options: LoadJobListingsOptions = {}) {
  const params = new URLSearchParams({
    limit: String(options.limit ?? defaultJobAssistLimit),
  });
  const response = await fetch(`/api/v1/jobs?${params.toString()}`, {
    cache: "no-store",
    method: "GET",
    signal: options.signal,
  });
  const payload = (await response.json()) as {
    error?: string;
    message?: string;
  };

  if (!response.ok) {
    throw new Error(payload.error || payload.message || "Jobs could not be loaded right now.");
  }

  const snapshot = jobsFeedResponseSchema.parse(payload);

  return mapJobsToListings(snapshot.jobs);
}
