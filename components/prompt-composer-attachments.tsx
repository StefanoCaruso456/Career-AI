"use client";

import type { ComposerAttachmentDraft } from "./chat-attachment-types";
import { AttachmentPreviewList } from "./attachment-preview-list";

type PromptComposerAttachmentsProps = {
  attachments: ComposerAttachmentDraft[];
  onRemove: (localId: string) => void;
  onRetry: (localId: string) => void;
};

export function PromptComposerAttachments({
  attachments,
  onRemove,
  onRetry,
}: PromptComposerAttachmentsProps) {
  return (
    <AttachmentPreviewList
      attachments={attachments}
      onRemove={onRemove}
      onRetry={onRetry}
      variant="composer"
    />
  );
}
