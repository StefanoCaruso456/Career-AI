"use client";

import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  ExternalLink,
  FileText,
  MapPin,
  RefreshCcw,
  X,
} from "lucide-react";
import type { JobDetailsDto, JobDetailsSource } from "@/packages/contracts/src";
import styles from "./job-details-modal.module.css";

export type JobDetailsPreview = {
  applyUrl: string;
  company: string | null;
  descriptionSnippet?: string | null;
  employmentType: string | null;
  externalJobId: string | null;
  id: string;
  location: string | null;
  postedAt: string | null;
  sourceLabel: string;
  sourceUrl: string;
  title: string;
};

type JobDetailsModalProps = {
  applyAction: ReactNode;
  details: JobDetailsDto;
  isLoading: boolean;
  isOpen: boolean;
  onClose: () => void;
  onRetry?: (() => void) | undefined;
};

type PlainTextBlock =
  | {
      items: string[];
      type: "list";
    }
  | {
      text: string;
      type: "paragraph";
    };

function getFocusableElements(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.hasAttribute("disabled") && element.getAttribute("aria-hidden") !== "true");
}

function normalizeWhitespace(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const normalized = value.replace(/\s+/g, " ").trim();

  return normalized.length > 0 ? normalized : null;
}

function inferSourceFromPreview(preview: Pick<JobDetailsPreview, "sourceLabel" | "sourceUrl">) {
  const value = `${preview.sourceLabel} ${preview.sourceUrl}`.toLowerCase();

  if (value.includes("workday")) {
    return "workday" satisfies JobDetailsSource;
  }

  if (value.includes("greenhouse")) {
    return "greenhouse" satisfies JobDetailsSource;
  }

  if (value.includes("lever")) {
    return "lever" satisfies JobDetailsSource;
  }

  if (value.includes("ashby")) {
    return "ashby" satisfies JobDetailsSource;
  }

  if (value.includes("workable")) {
    return "workable" satisfies JobDetailsSource;
  }

  if (value.includes("linkedin")) {
    return "linkedin" satisfies JobDetailsSource;
  }

  return "other" satisfies JobDetailsSource;
}

function formatTimestamp(value: string | null) {
  if (!value) {
    return "Freshness unknown";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function buildPlainTextParagraphs(value: string | null) {
  if (!value) {
    return [] satisfies PlainTextBlock[];
  }

  const normalized = value
    .replace(/\u00a0/g, " ")
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((block) =>
      block
        .split("\n")
        .map((line) => line.replace(/[ \t]+/g, " ").trim())
        .filter(Boolean)
        .join("\n"),
    )
    .filter(Boolean);

  const blocks: PlainTextBlock[] = [];

  normalized.forEach((block) => {
    const lines = block
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length === 0) {
      return;
    }

    const bulletLines = lines.filter((line) => /^[•\u2022\u25CF-]\s+/.test(line));

    if (bulletLines.length === lines.length) {
      blocks.push({
        items: bulletLines.map((line) => line.replace(/^[•\u2022\u25CF-]\s+/, "").trim()),
        type: "list",
      });
      return;
    }

    if (lines.length > 1 && lines.slice(1).every((line) => /^[•\u2022\u25CF-]\s+/.test(line))) {
      blocks.push({
        text: lines[0],
        type: "paragraph",
      });
      blocks.push({
        items: lines.slice(1).map((line) => line.replace(/^[•\u2022\u25CF-]\s+/, "").trim()),
        type: "list",
      });
      return;
    }

    blocks.push({
      text: lines.map((line) => normalizeWhitespace(line) ?? line).join(" "),
      type: "paragraph",
    });
  });

  return blocks;
}

function createMetaRows(details: JobDetailsDto) {
  return [
    {
      icon: Building2,
      label: "Company",
      value: details.company,
    },
    {
      icon: MapPin,
      label: "Location",
      value: details.location,
    },
    {
      icon: BriefcaseBusiness,
      label: "Employment type",
      value: details.employmentType,
    },
    {
      icon: CalendarDays,
      label: "Posted",
      value: details.postedAt ? formatTimestamp(details.postedAt) : null,
    },
    {
      icon: FileText,
      label: "Requisition ID",
      value: details.externalJobId,
    },
  ].filter((row) => row.value);
}

export function createFallbackJobDetails(
  preview: JobDetailsPreview,
  fallbackMessage?: string | null,
) {
  const source = inferSourceFromPreview(preview);
  const description = normalizeWhitespace(preview.descriptionSnippet);

  return {
    company: preview.company,
    contentStatus: description ? "partial" : "unavailable",
    descriptionHtml: null,
    descriptionText: description,
    employmentType: preview.employmentType,
    externalJobId: preview.externalJobId,
    fallbackMessage:
      fallbackMessage ??
      (description
        ? "Career AI is still pulling the full normalized description for in-app reading."
        : "Full job details are unavailable right now. You can still open the original post or apply directly."),
    id: preview.id,
    location: preview.location,
    metadata: null,
    postedAt: preview.postedAt,
    preferredQualifications: [],
    qualifications: [],
    responsibilities: [],
    salaryText: null,
    source,
    sourceLabel: preview.sourceLabel,
    sourceUrl: preview.sourceUrl,
    summary: description,
    title: preview.title,
  } satisfies JobDetailsDto;
}

export function JobDetailsModal({
  applyAction,
  details,
  isLoading,
  isOpen,
  onClose,
  onRetry,
}: JobDetailsModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const [isMounted, setIsMounted] = useState(false);
  const titleId = useId();
  const descriptionId = useId();
  const metaRows = createMetaRows(details);
  const plainTextBlocks = buildPlainTextParagraphs(
    details.descriptionText && details.descriptionText !== details.summary
      ? details.descriptionText
      : details.descriptionText,
  );
  const hasStructuredSections =
    details.responsibilities.length > 0 ||
    details.qualifications.length > 0 ||
    details.preferredQualifications.length > 0 ||
    Boolean(details.salaryText);
  const shouldShowSummary = Boolean(details.summary) && (hasStructuredSections || details.descriptionHtml);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousActiveElement =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    function handleKeydown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab" || !modalRef.current) {
        return;
      }

      const focusable = getFocusableElements(modalRef.current);

      if (focusable.length === 0) {
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    const originalOverflow = document.body.style.overflow;
    const focusFrame = window.requestAnimationFrame(() => {
      const focusable = modalRef.current ? getFocusableElements(modalRef.current) : [];
      (focusable[0] ?? modalRef.current)?.focus();
    });

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeydown);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = originalOverflow;
      document.removeEventListener("keydown", handleKeydown);
      previousActiveElement?.focus();
    };
  }, [isOpen, onClose]);

  if (!isMounted || !isOpen) {
    return null;
  }

  return createPortal(
    <div className={styles.overlay} onClick={onClose} role="presentation">
      <div
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className={styles.modal}
        onClick={(event) => {
          event.stopPropagation();
        }}
        ref={modalRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className={styles.header}>
          <div className={styles.headerCopy}>
            <span className={styles.eyebrow}>In-app job details</span>
            <div className={styles.headerTopline}>
              <div>
                <h2 className={styles.title} id={titleId}>
                  {details.title}
                </h2>
                <p className={styles.subtitle} id={descriptionId}>
                  {[details.company, details.sourceLabel].filter(Boolean).join(" • ")}
                </p>
              </div>
              <span
                className={`${styles.statusBadge} ${
                  details.contentStatus === "full"
                    ? styles.statusBadgeFull
                    : details.contentStatus === "partial"
                      ? styles.statusBadgePartial
                      : styles.statusBadgeFallback
                }`}
              >
                {details.contentStatus === "full"
                  ? "Normalized"
                  : details.contentStatus === "partial"
                    ? "Partial"
                    : "Fallback"}
              </span>
            </div>

            {metaRows.length > 0 ? (
              <div className={styles.metaGrid}>
                {metaRows.map((row) => (
                  <div className={styles.metaCard} key={row.label}>
                    <row.icon aria-hidden="true" size={16} strokeWidth={2} />
                    <div>
                      <span>{row.label}</span>
                      <strong>{row.value}</strong>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <button
            aria-label="Close job details"
            className={styles.closeButton}
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" size={18} strokeWidth={2} />
          </button>
        </div>

        <div className={styles.body}>
          {details.fallbackMessage ? (
            <div className={styles.notice}>
              <p>{details.fallbackMessage}</p>
              {onRetry && !isLoading ? (
                <button
                  className={styles.retryButton}
                  onClick={onRetry}
                  type="button"
                >
                  <RefreshCcw aria-hidden="true" size={14} strokeWidth={2} />
                  Retry details
                </button>
              ) : null}
            </div>
          ) : null}

          {isLoading ? (
            <div className={styles.loadingState} aria-live="polite">
              <div className={styles.loadingCopy}>
                <span className={styles.loadingLine} />
                <span className={styles.loadingLine} />
                <span className={styles.loadingLineShort} />
              </div>
              <div className={styles.loadingCards}>
                <span className={styles.loadingCard} />
                <span className={styles.loadingCard} />
                <span className={styles.loadingCard} />
              </div>
            </div>
          ) : (
            <div className={styles.readingSurface}>
              {shouldShowSummary ? (
                <section className={styles.section}>
                  <h3>Overview</h3>
                  <p>{details.summary}</p>
                </section>
              ) : null}

              {details.responsibilities.length > 0 ? (
                <section className={styles.section}>
                  <h3>Responsibilities</h3>
                  <ul>
                    {details.responsibilities.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {details.qualifications.length > 0 ? (
                <section className={styles.section}>
                  <h3>Qualifications</h3>
                  <ul>
                    {details.qualifications.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {details.preferredQualifications.length > 0 ? (
                <section className={styles.section}>
                  <h3>Preferred qualifications</h3>
                  <ul>
                    {details.preferredQualifications.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {details.salaryText ? (
                <section className={styles.section}>
                  <h3>Compensation</h3>
                  <p>{details.salaryText}</p>
                </section>
              ) : null}

              {details.descriptionHtml ? (
                <section className={styles.section}>
                  <h3>Description</h3>
                  <div
                    className={styles.richText}
                    dangerouslySetInnerHTML={{ __html: details.descriptionHtml }}
                  />
                </section>
              ) : plainTextBlocks.length > 0 ? (
                <section className={styles.section}>
                  <h3>Description</h3>
                  <div className={styles.plainText}>
                    {plainTextBlocks.map((block, index) =>
                      block.type === "list" ? (
                        <ul className={styles.plainTextList} key={`list-${index}`}>
                          {block.items.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      ) : (
                        <p key={`paragraph-${index}`}>{block.text}</p>
                      ),
                    )}
                  </div>
                </section>
              ) : (
                <section className={styles.section}>
                  <h3>Description</h3>
                  <p>
                    The source did not provide a readable description for this role inside Career AI
                    yet. You can still open the original post for the full source copy.
                  </p>
                </section>
              )}
            </div>
          )}
        </div>

        <div className={styles.footer}>
          <div className={styles.footerActions}>
            <div className={styles.applySlot}>{applyAction}</div>
            <a
              className={styles.secondaryAction}
              href={details.sourceUrl}
              rel="noreferrer noopener"
              target="_blank"
            >
              Open original post
              <ExternalLink aria-hidden="true" size={15} strokeWidth={2} />
            </a>
            <button className={styles.ghostAction} onClick={onClose} type="button">
              Close
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
