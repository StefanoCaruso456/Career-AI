"use client";

import type { ChatAttachment } from "@/packages/contracts/src";
import type { ComposerAttachmentDraft } from "./chat-attachment-types";
import { AttachmentChip } from "./attachment-chip";
import styles from "./chat-attachments.module.css";

type AttachmentPreviewListProps = {
  attachments: Array<ChatAttachment | ComposerAttachmentDraft>;
  onRemove?: (localIdOrAttachmentId: string) => void;
  onRetry?: (localId: string) => void;
  readOnly?: boolean;
  variant?: "composer" | "message";
};

export function AttachmentPreviewList({
  attachments,
  onRemove,
  onRetry,
  readOnly = false,
  variant = "composer",
}: AttachmentPreviewListProps) {
  if (attachments.length === 0) {
    return null;
  }

  return (
    <div
      className={[
        styles.attachmentList,
        variant === "composer" ? styles.attachmentListComposer : styles.attachmentListMessage,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {attachments.map((attachment) => (
        <AttachmentChip
          attachment={attachment}
          key={"localId" in attachment ? attachment.localId : attachment.id}
          onRemove={onRemove}
          onRetry={onRetry}
          readOnly={readOnly}
        />
      ))}
    </div>
  );
}
