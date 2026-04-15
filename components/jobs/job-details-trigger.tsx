"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import type { JobDetailsDto } from "@/packages/contracts/src";
import {
  fetchJobDetails,
  getCachedJobDetails,
} from "./job-details-client";
import {
  createFallbackJobDetails,
  JobDetailsModal,
} from "./job-details-modal";
import type { JobDetailsPreview } from "./job-details-types";

type JobDetailsTriggerProps = {
  applyAction: ReactNode;
  buttonClassName?: string;
  buttonLabel?: string;
  preview: JobDetailsPreview;
};

export function JobDetailsTrigger({
  applyAction,
  buttonClassName,
  buttonLabel = "View details",
  preview,
}: JobDetailsTriggerProps) {
  const requestSequence = useRef(0);
  const activeController = useRef<AbortController | null>(null);
  const [details, setDetails] = useState<JobDetailsDto>(
    () => getCachedJobDetails(preview),
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    return () => {
      activeController.current?.abort();
    };
  }, []);

  useEffect(() => {
    setDetails(getCachedJobDetails(preview));
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
    preview.workplaceType,
  ]);

  async function loadDetails(forceRefresh = false) {
    const controller = new AbortController();
    const sequence = requestSequence.current + 1;

    requestSequence.current = sequence;
    activeController.current?.abort();
    activeController.current = controller;
    setIsLoading(true);

    try {
      const nextDetails = await fetchJobDetails(preview, {
        forceRefresh,
        signal: controller.signal,
      });

      if (requestSequence.current === sequence) {
        setDetails(nextDetails);
      }
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
