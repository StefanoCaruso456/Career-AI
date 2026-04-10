import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useChatAttachmentDrafts } from "./use-chat-attachment-drafts";

function createUploadedAttachmentResponse() {
  return {
    attachment: {
      createdAt: "2026-04-09T00:00:00.000Z",
      downloadUrl: "https://example.com/download/test.png",
      extension: "png",
      id: "att_uploaded_123",
      messageId: null,
      mimeType: "image/png",
      openUrl: "https://example.com/open/test.png",
      originalName: "test-image.png",
      previewKind: "image" as const,
      sizeBytes: 2048,
      status: "uploaded" as const,
      thumbnailUrl: "https://example.com/thumb/test.png",
      updatedAt: "2026-04-09T00:00:00.000Z",
    },
  };
}

describe("useChatAttachmentDrafts", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => createUploadedAttachmentResponse(),
      }),
    );

    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:preview-test-image"),
    });

    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
  });

  it("detaches uploaded attachments immediately without disposing previews, then restores them", async () => {
    const { result } = renderHook(() => useChatAttachmentDrafts());

    await act(async () => {
      result.current.addFiles([
        new File(["image"], "test-image.png", {
          lastModified: 1712620800000,
          type: "image/png",
        }),
      ]);
    });

    await waitFor(() => {
      expect(result.current.attachments[0]?.uploadStatus).toBe("uploaded");
    });

    let detached = [] as ReturnType<typeof useChatAttachmentDrafts>["attachments"];

    act(() => {
      detached = result.current.detachAttachments();
    });

    expect(detached).toHaveLength(1);
    expect(result.current.attachments).toHaveLength(0);
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();

    act(() => {
      result.current.restoreAttachments(detached);
    });

    expect(result.current.attachments).toHaveLength(1);
    expect(result.current.attachments[0]?.uploadStatus).toBe("uploaded");
  });

  it("releases detached attachment previews after a successful send path", async () => {
    const { result } = renderHook(() => useChatAttachmentDrafts());

    await act(async () => {
      result.current.addFiles([
        new File(["image"], "test-image.png", {
          lastModified: 1712620800000,
          type: "image/png",
        }),
      ]);
    });

    await waitFor(() => {
      expect(result.current.attachments[0]?.uploadStatus).toBe("uploaded");
    });

    let detached = [] as ReturnType<typeof useChatAttachmentDrafts>["attachments"];

    act(() => {
      detached = result.current.detachAttachments();
      result.current.releaseDetachedAttachments(detached);
    });

    expect(result.current.attachments).toHaveLength(0);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview-test-image");
  });
});
