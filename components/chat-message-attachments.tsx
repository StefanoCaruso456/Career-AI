"use client";

import type { ChatAttachment } from "@/packages/contracts/src";
import { AttachmentPreviewList } from "./attachment-preview-list";

type ChatMessageAttachmentsProps = {
  attachments: ChatAttachment[];
};

export function ChatMessageAttachments({ attachments }: ChatMessageAttachmentsProps) {
  return (
    <AttachmentPreviewList
      attachments={attachments}
      readOnly
      variant="message"
    />
  );
}
