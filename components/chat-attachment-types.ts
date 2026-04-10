import type { ChatAttachment, ChatAttachmentPreviewKind } from "@/packages/contracts/src";

export type ComposerAttachmentUploadStatus = "failed" | "pending" | "uploaded" | "uploading";

export type ComposerAttachmentDraft = {
  attachmentId: string | null;
  downloadUrl: string | null;
  error: string | null;
  extension: string;
  file: File;
  fingerprint: string;
  localId: string;
  mimeType: string;
  openUrl: string | null;
  originalName: string;
  previewKind: ChatAttachmentPreviewKind;
  previewUrl: string | null;
  sizeBytes: number;
  statusLabel: string;
  thumbnailUrl: string | null;
  uploadStatus: ComposerAttachmentUploadStatus;
};

export type AttachmentListItem = ChatAttachment | ComposerAttachmentDraft;
