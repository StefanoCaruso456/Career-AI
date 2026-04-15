import {
  jobDetailsResponseSchema,
  type JobDetailsDto,
} from "@/packages/contracts/src";
import { createFallbackJobDetails } from "./job-details-modal";
import type { JobDetailsPreview } from "./job-details-types";

const jobDetailsCache = new Map<string, JobDetailsDto>();

export function clearJobDetailsCache() {
  jobDetailsCache.clear();
}

export function getCachedJobDetails(preview: JobDetailsPreview) {
  return jobDetailsCache.get(preview.id) ?? createFallbackJobDetails(preview);
}

export async function fetchJobDetails(
  preview: JobDetailsPreview,
  options?: {
    forceRefresh?: boolean;
    signal?: AbortSignal;
  },
) {
  if (!options?.forceRefresh) {
    const cached = jobDetailsCache.get(preview.id);

    if (cached) {
      return cached;
    }
  }

  const response = await fetch(`/api/v1/jobs/${encodeURIComponent(preview.id)}/details`, {
    cache: "no-store",
    method: "GET",
    signal: options?.signal,
  });
  const payload = (await response.json()) as unknown;
  const parsed = jobDetailsResponseSchema.parse(payload);

  if (!response.ok || !parsed.success || !parsed.data) {
    throw new Error(parsed.error?.message ?? "Job details could not be loaded right now.");
  }

  jobDetailsCache.set(preview.id, parsed.data);

  return parsed.data;
}
