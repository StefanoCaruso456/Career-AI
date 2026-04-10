"use client";

import { useEffect, useRef, useState } from "react";
import {
  chatAttachmentLimits,
  getChatAttachmentExtension,
  type ChatAttachment,
  validateChatAttachmentCandidate,
} from "@/packages/contracts/src";
import type { ComposerAttachmentDraft } from "./chat-attachment-types";

function createLocalAttachmentId() {
  return `local_attachment_${crypto.randomUUID().replace(/-/g, "")}`;
}

function getAttachmentFingerprint(file: File) {
  return [file.name, file.size, file.lastModified, file.type].join(":");
}

function buildDraft(file: File) {
  const validation = validateChatAttachmentCandidate({
    mimeType: file.type,
    name: file.name,
    sizeBytes: file.size,
  });

  if (!validation.ok) {
    return validation;
  }

  const previewUrl = validation.descriptor.previewKind === "image" ? URL.createObjectURL(file) : null;

  return {
    ok: true,
    value: {
      attachmentId: null,
      downloadUrl: null,
      error: null,
      extension: validation.descriptor.extension || getChatAttachmentExtension(file.name) || "file",
      file,
      fingerprint: getAttachmentFingerprint(file),
      localId: createLocalAttachmentId(),
      mimeType: validation.descriptor.normalizedMimeType,
      openUrl: null,
      originalName: validation.sanitizedName,
      previewKind: validation.descriptor.previewKind,
      previewUrl,
      sizeBytes: file.size,
      statusLabel: "Uploading",
      thumbnailUrl: previewUrl,
      uploadStatus: "pending",
    } satisfies ComposerAttachmentDraft,
  } as const;
}

type UploadAttachmentResponse = {
  attachment?: ChatAttachment;
  error?: string;
};

export function useChatAttachmentDrafts() {
  const [attachments, setAttachments] = useState<ComposerAttachmentDraft[]>([]);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const uploadControllersRef = useRef(new Map<string, AbortController>());
  const attachmentStateRef = useRef<ComposerAttachmentDraft[]>([]);

  attachmentStateRef.current = attachments;

  useEffect(() => {
    return () => {
      for (const attachment of attachmentStateRef.current) {
        if (attachment.previewUrl) {
          URL.revokeObjectURL(attachment.previewUrl);
        }
      }

      uploadControllersRef.current.forEach((controller) => controller.abort());
      uploadControllersRef.current.clear();
    };
  }, []);

  function updateAttachment(localId: string, updater: (attachment: ComposerAttachmentDraft) => ComposerAttachmentDraft) {
    setAttachments((currentAttachments) =>
      currentAttachments.map((attachment) =>
        attachment.localId === localId ? updater(attachment) : attachment,
      ),
    );
  }

  async function uploadDraft(args: {
    attachment?: ComposerAttachmentDraft;
    localId: string;
  }) {
    const attachment =
      args.attachment ??
      attachmentStateRef.current.find((candidate) => candidate.localId === args.localId);

    if (!attachment) {
      return;
    }

    const controller = new AbortController();

    uploadControllersRef.current.set(args.localId, controller);
    updateAttachment(args.localId, (currentAttachment) => ({
      ...currentAttachment,
      error: null,
      statusLabel: "Uploading",
      uploadStatus: "uploading",
    }));

    try {
      const formData = new FormData();

      formData.set("file", attachment.file);

      const response = await fetch("/api/chat/attachments", {
        body: formData,
        method: "POST",
        signal: controller.signal,
      });
      const payload = (await response.json()) as UploadAttachmentResponse;

      if (!response.ok || !payload.attachment) {
        throw new Error(payload.error || "Attachment upload failed.");
      }

      updateAttachment(args.localId, (currentAttachment) => ({
        ...currentAttachment,
        attachmentId: payload.attachment?.id ?? null,
        downloadUrl: payload.attachment?.downloadUrl ?? null,
        error: null,
        mimeType: payload.attachment?.mimeType ?? currentAttachment.mimeType,
        openUrl: payload.attachment?.openUrl ?? null,
        originalName: payload.attachment?.originalName ?? currentAttachment.originalName,
        previewKind: payload.attachment?.previewKind ?? currentAttachment.previewKind,
        sizeBytes: payload.attachment?.sizeBytes ?? currentAttachment.sizeBytes,
        statusLabel: "Ready",
        thumbnailUrl: payload.attachment?.thumbnailUrl ?? currentAttachment.thumbnailUrl,
        uploadStatus: "uploaded",
      }));
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }

      updateAttachment(args.localId, (currentAttachment) => ({
        ...currentAttachment,
        error: error instanceof Error ? error.message : "Attachment upload failed.",
        statusLabel: "Upload failed",
        uploadStatus: "failed",
      }));
    } finally {
      uploadControllersRef.current.delete(args.localId);
    }
  }

  function addFiles(files: File[]) {
    if (files.length === 0) {
      return;
    }

    const remainingSlots = Math.max(chatAttachmentLimits.maxFilesPerMessage - attachments.length, 0);

    if (remainingSlots === 0) {
      setSelectionError(
        `You can attach up to ${chatAttachmentLimits.maxFilesPerMessage} files in one message.`,
      );
      return;
    }

    const nextDrafts: ComposerAttachmentDraft[] = [];
    const nextErrors: string[] = [];
    const existingFingerprints = new Set(attachments.map((attachment) => attachment.fingerprint));

    for (const file of files.slice(0, remainingSlots)) {
      const result = buildDraft(file);

      if (!result.ok) {
        nextErrors.push(result.message);
        continue;
      }

      if (existingFingerprints.has(result.value.fingerprint)) {
        nextErrors.push(`${result.value.originalName} is already attached.`);
        continue;
      }

      existingFingerprints.add(result.value.fingerprint);
      nextDrafts.push(result.value);
    }

    if (files.length > remainingSlots) {
      nextErrors.push(
        `Only ${chatAttachmentLimits.maxFilesPerMessage} attachments can be sent in one message.`,
      );
    }

    if (nextErrors.length > 0) {
      setSelectionError(nextErrors[0]);
    } else {
      setSelectionError(null);
    }

    if (nextDrafts.length === 0) {
      return;
    }

    setAttachments((currentAttachments) => [...currentAttachments, ...nextDrafts]);

    for (const draft of nextDrafts) {
      void uploadDraft({
        attachment: draft,
        localId: draft.localId,
      });
    }
  }

  async function removeAttachment(localId: string) {
    const attachment = attachmentStateRef.current.find((candidate) => candidate.localId === localId);

    if (!attachment) {
      return;
    }

    uploadControllersRef.current.get(localId)?.abort();
    uploadControllersRef.current.delete(localId);

    setAttachments((currentAttachments) =>
      currentAttachments.filter((currentAttachment) => currentAttachment.localId !== localId),
    );

    if (attachment.previewUrl) {
      URL.revokeObjectURL(attachment.previewUrl);
    }

    if (attachment.attachmentId) {
      try {
        await fetch(`/api/chat/attachments/${attachment.attachmentId}`, {
          method: "DELETE",
        });
      } catch {
        // Keep removal optimistic. Expired unattached files are cleaned up server-side as well.
      }
    }
  }

  function retryAttachment(localId: string) {
    void uploadDraft({ localId });
  }

  function detachAttachments() {
    const detachedAttachments = [...attachmentStateRef.current];

    setAttachments([]);
    setSelectionError(null);

    return detachedAttachments;
  }

  function restoreAttachments(nextAttachments: ComposerAttachmentDraft[]) {
    setAttachments(nextAttachments);
    setSelectionError(null);
  }

  function releaseDetachedAttachments(detachedAttachments: ComposerAttachmentDraft[]) {
    detachedAttachments.forEach((attachment) => {
      uploadControllersRef.current.get(attachment.localId)?.abort();
      uploadControllersRef.current.delete(attachment.localId);

      if (attachment.previewUrl) {
        URL.revokeObjectURL(attachment.previewUrl);
      }
    });
  }

  async function clearAttachments() {
    const attachmentsToClear = [...attachmentStateRef.current];

    setAttachments([]);
    setSelectionError(null);

    attachmentsToClear.forEach((attachment) => {
      uploadControllersRef.current.get(attachment.localId)?.abort();
      uploadControllersRef.current.delete(attachment.localId);

      if (attachment.previewUrl) {
        URL.revokeObjectURL(attachment.previewUrl);
      }
    });

    await Promise.allSettled(
      attachmentsToClear
        .filter((attachment) => attachment.attachmentId)
        .map((attachment) =>
          fetch(`/api/chat/attachments/${attachment.attachmentId}`, {
            method: "DELETE",
          }),
        ),
    );
  }

  function resetAttachments() {
    const attachmentsToReset = [...attachmentStateRef.current];

    setAttachments([]);
    setSelectionError(null);

    attachmentsToReset.forEach((attachment) => {
      uploadControllersRef.current.get(attachment.localId)?.abort();
      uploadControllersRef.current.delete(attachment.localId);

      if (attachment.previewUrl) {
        URL.revokeObjectURL(attachment.previewUrl);
      }
    });
  }

  function clearSelectionError() {
    setSelectionError(null);
  }

  return {
    addFiles,
    attachments,
    clearAttachments,
    clearSelectionError,
    detachAttachments,
    removeAttachment,
    releaseDetachedAttachments,
    resetAttachments,
    restoreAttachments,
    retryAttachment,
    selectionError,
  };
}
