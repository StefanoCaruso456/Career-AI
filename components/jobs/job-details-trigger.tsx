"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import {
  jobDetailsResponseSchema,
  type JobDetailsDto,
} from "@/packages/contracts/src";
import {
  createFallbackJobDetails,
  JobDetailsModal,
  type JobDetailsPreview,
} from "./job-details-modal";

type JobDetailsTriggerProps = {
  applyAction: ReactNode;
  buttonClassName?: string;
  buttonLabel?: string;
  preview: JobDetailsPreview;
};

const jobDetailsCache = new Map<string, JobDetailsDto>();

export function JobDetailsTrigger({
  applyAction,
  buttonClassName,
  buttonLabel = "View details",
  preview,
}: JobDetailsTriggerProps) {
  const requestSequence = useRef(0);
  const activeController = useRef<AbortController | null>(null);
  const [details, setDetails] = useState<JobDetailsDto>(
    () => jobDetailsCache.get(preview.id) ?? createFallbackJobDetails(preview),
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    return () => {
      activeController.current?.abort();
    };
  }, []);

  useEffect(() => {
    setDetails(jobDetailsCache.get(preview.id) ?? createFallbackJobDetails(preview));
    setIsLoading(false);
    requestSequence.current += 1;
    activeController.current?.abort();
  }, [
    preview.company,
    preview.descriptionSnippet,
    preview.employmentType,
    preview.externalJobId,
    preview.id,
    preview.location,
    preview.postedAt,
    preview.sourceLabel,
    preview.sourceUrl,
    preview.title,
  ]);

  async function loadDetails(forceRefresh = false) {
    if (!forceRefresh) {
      const cached = jobDetailsCache.get(preview.id);

      if (cached) {
        setDetails(cached);
        return;
      }
    }

    const controller = new AbortController();
    const sequence = requestSequence.current + 1;

    requestSequence.current = sequence;
    activeController.current?.abort();
    activeController.current = controller;
    setIsLoading(true);

    try {
      const response = await fetch(`/api/v1/jobs/${encodeURIComponent(preview.id)}/details`, {
        cache: "no-store",
        method: "GET",
        signal: controller.signal,
      });
      const payload = (await response.json()) as unknown;
      const parsed = jobDetailsResponseSchema.parse(payload);

      if (!response.ok || !parsed.success || !parsed.data) {
        throw new Error(parsed.error?.message ?? "Job details could not be loaded right now.");
      }

      if (requestSequence.current !== sequence) {
        return;
      }

      jobDetailsCache.set(preview.id, parsed.data);
      setDetails(parsed.data);
    } catch (error) {
      if (controller.signal.aborted || requestSequence.current !== sequence) {
        return;
      }

      const message =
        error instanceof Error ? error.message : "Job details could not be loaded right now.";

      setDetails(createFallbackJobDetails(preview, message));
    } finally {
      if (requestSequence.current === sequence) {
        setIsLoading(false);
      }
    }
  }

  function handleOpen() {
    setIsOpen(true);
    void loadDetails();
  }

  return (
    <>
      <button
        aria-haspopup="dialog"
        className={buttonClassName}
        onClick={handleOpen}
        type="button"
      >
        {buttonLabel}
      </button>

      <JobDetailsModal
        applyAction={applyAction}
        details={details}
        isLoading={isLoading}
        isOpen={isOpen}
        onClose={() => {
          setIsOpen(false);
        }}
        onRetry={() => {
          void loadDetails(true);
        }}
      />
    </>
  );
}
