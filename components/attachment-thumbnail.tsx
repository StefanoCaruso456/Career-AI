"use client";

import {
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  Presentation,
} from "lucide-react";
import type { ChatAttachmentPreviewKind } from "@/packages/contracts/src";
import styles from "./chat-attachments.module.css";

function getPreviewIcon(previewKind: ChatAttachmentPreviewKind) {
  switch (previewKind) {
    case "image":
      return <ImageIcon aria-hidden="true" size={18} strokeWidth={1.9} />;
    case "presentation":
      return <Presentation aria-hidden="true" size={18} strokeWidth={1.9} />;
    case "spreadsheet":
      return <FileSpreadsheet aria-hidden="true" size={18} strokeWidth={1.9} />;
    default:
      return <FileText aria-hidden="true" size={18} strokeWidth={1.9} />;
  }
}

type AttachmentThumbnailProps = {
  extension: string;
  name: string;
  previewKind: ChatAttachmentPreviewKind;
  src?: string | null;
};

export function AttachmentThumbnail({
  name,
  previewKind,
  src,
}: AttachmentThumbnailProps) {
  if (previewKind === "image" && src) {
    return (
      <span className={styles.attachmentThumbnail}>
        <img
          alt={name}
          className={styles.attachmentThumbnailImage}
          loading="lazy"
          src={src}
        />
      </span>
    );
  }

  return (
    <span className={styles.attachmentThumbnail}>
      {getPreviewIcon(previewKind)}
    </span>
  );
}
