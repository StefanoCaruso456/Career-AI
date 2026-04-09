"use client";

import { LoaderCircle, RotateCcw, X } from "lucide-react";
import { formatChatAttachmentSize, type ChatAttachment } from "@/packages/contracts/src";
import type { ComposerAttachmentDraft } from "./chat-attachment-types";
import { AttachmentThumbnail } from "./attachment-thumbnail";
import styles from "./chat-attachments.module.css";

function isComposerAttachmentDraft(
  attachment: ChatAttachment | ComposerAttachmentDraft,
): attachment is ComposerAttachmentDraft {
  return "uploadStatus" in attachment;
}

function getStatusLabel(attachment: ChatAttachment | ComposerAttachmentDraft) {
  if (isComposerAttachmentDraft(attachment)) {
    return attachment.statusLabel;
  }

  return attachment.status === "attached" ? "Attached" : "Ready";
}

function getStatusClassName(attachment: ChatAttachment | ComposerAttachmentDraft) {
  if (!isComposerAttachmentDraft(attachment)) {
    return styles.attachmentStatusReady;
  }

  switch (attachment.uploadStatus) {
    case "failed":
      return styles.attachmentStatusFailed;
    case "pending":
    case "uploading":
      return styles.attachmentStatusUploading;
    default:
      return styles.attachmentStatusReady;
  }
}

type AttachmentChipProps = {
  attachment: ChatAttachment | ComposerAttachmentDraft;
  onRemove?: (localIdOrAttachmentId: string) => void;
  onRetry?: (localId: string) => void;
  readOnly?: boolean;
};

export function AttachmentChip({
  attachment,
  onRemove,
  onRetry,
  readOnly = false,
}: AttachmentChipProps) {
  const isDraft = isComposerAttachmentDraft(attachment);
  const openUrl = isDraft ? attachment.openUrl : attachment.openUrl;
  const thumbnailSrc = isDraft ? attachment.previewUrl || attachment.thumbnailUrl : attachment.thumbnailUrl;
  const attachmentCard = (
    <div
      className={[
        styles.attachmentCard,
        readOnly ? styles.attachmentCardReadOnly : "",
        isDraft && attachment.uploadStatus === "failed" ? styles.attachmentCardFailed : "",
        isDraft && (attachment.uploadStatus === "pending" || attachment.uploadStatus === "uploading")
          ? styles.attachmentCardUploading
          : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <AttachmentThumbnail
        extension={attachment.extension}
        name={attachment.originalName}
        previewKind={attachment.previewKind}
        src={thumbnailSrc}
      />

      <div className={styles.attachmentCopy}>
        <span className={styles.attachmentTitle} title={attachment.originalName}>
          {attachment.originalName}
        </span>
        <div className={styles.attachmentMeta}>
          <span>{attachment.extension.toUpperCase()}</span>
          <span>{formatChatAttachmentSize(attachment.sizeBytes)}</span>
        </div>
        <div className={styles.attachmentMeta}>
          <span
            className={[styles.attachmentStatus, getStatusClassName(attachment)]
              .filter(Boolean)
              .join(" ")}
          >
            {isDraft && (attachment.uploadStatus === "pending" || attachment.uploadStatus === "uploading") ? (
              <LoaderCircle aria-hidden="true" className={styles.spinner} size={12} strokeWidth={2} />
            ) : null}
            {getStatusLabel(attachment)}
          </span>
          {isDraft && attachment.error ? (
            <span className={styles.attachmentError}>{attachment.error}</span>
          ) : null}
        </div>
        {!readOnly ? (
          <div className={styles.attachmentActions}>
            {isDraft && attachment.uploadStatus === "failed" && onRetry ? (
              <button
                aria-label={`Retry ${attachment.originalName}`}
                className={styles.attachmentAction}
                onClick={() => onRetry(attachment.localId)}
                type="button"
              >
                <RotateCcw aria-hidden="true" size={14} strokeWidth={2} />
              </button>
            ) : null}
            {onRemove ? (
              <button
                aria-label={`Remove ${attachment.originalName}`}
                className={styles.attachmentAction}
                onClick={() => onRemove(isDraft ? attachment.localId : attachment.id)}
                type="button"
              >
                <X aria-hidden="true" size={14} strokeWidth={2} />
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );

  if (readOnly && openUrl) {
    return (
      <a
        className={styles.attachmentLink}
        href={openUrl}
        rel="noreferrer"
        target="_blank"
      >
        {attachmentCard}
      </a>
    );
  }

  return attachmentCard;
}
