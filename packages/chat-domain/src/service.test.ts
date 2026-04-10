import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ApiError } from "@/packages/contracts/src";
import {
  createAssistantChatMessage,
  createChatAttachment,
  createUserChatMessage,
  deleteChatConversation,
  deletePendingChatAttachment,
  getChatAttachmentContent,
  getChatWorkspaceSnapshot,
} from "@/packages/chat-domain/src";

describe("chat attachment service", () => {
  let baseDir = "";

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), "career-ai-chat-domain-"));
    (
      globalThis as {
        __careerAiChatUploadRateLimit?: Map<string, { count: number; resetAt: number }>;
      }
    ).__careerAiChatUploadRateLimit = new Map();
  });

  afterEach(async () => {
    if (baseDir) {
      await rm(baseDir, { force: true, recursive: true });
    }
  });

  it("seeds a new workspace with default projects", async () => {
    const snapshot = await getChatWorkspaceSnapshot({
      baseDir,
      ownerId: "guest:seeded-owner",
    });

    expect(snapshot.projects.map((project) => project.label)).toEqual([
      "Verified profile",
      "Career story",
      "Hiring signals",
    ]);
    expect(snapshot.conversations).toHaveLength(0);
  });

  it("uploads an attachment, persists it with the message, and reloads it from storage", async () => {
    const ownerId = "guest:owner-1";
    const workspace = await getChatWorkspaceSnapshot({ baseDir, ownerId });
    const attachment = await createChatAttachment({
      baseDir,
      file: new File(["offer letter"], "offer-letter.pdf", {
        type: "application/pdf",
      }),
      ownerId,
    });

    const userResult = await createUserChatMessage({
      attachmentIds: [attachment.id],
      baseDir,
      message: "Review my offer letter.",
      ownerId,
      projectId: workspace.projects[0].id,
    });

    await createAssistantChatMessage({
      baseDir,
      content: "I can help summarize what is in the attached PDF.",
      conversationId: userResult.conversation.id,
      ownerId,
    });

    const reloadedWorkspace = await getChatWorkspaceSnapshot({ baseDir, ownerId });
    const reloadedConversation = reloadedWorkspace.conversations.find(
      (conversation) => conversation.id === userResult.conversation.id,
    );

    expect(reloadedConversation?.messages).toHaveLength(2);
    expect(reloadedConversation?.messages[0]?.attachments).toHaveLength(1);
    expect(reloadedConversation?.messages[0]?.attachments[0]).toMatchObject({
      id: attachment.id,
      messageId: userResult.userMessage.id,
      originalName: "offer-letter.pdf",
      previewKind: "pdf",
      status: "attached",
    });

    const content = await getChatAttachmentContent({
      attachmentId: attachment.id,
      baseDir,
      ownerId,
    });

    expect(content.buffer.toString("utf8")).toBe("offer letter");
  });

  it("deletes a pending attachment before it is sent", async () => {
    const ownerId = "guest:owner-2";
    const attachment = await createChatAttachment({
      baseDir,
      file: new File(["notes"], "notes.txt", {
        type: "text/plain",
      }),
      ownerId,
    });

    await deletePendingChatAttachment({
      attachmentId: attachment.id,
      baseDir,
      ownerId,
    });

    await expect(
      getChatAttachmentContent({
        attachmentId: attachment.id,
        baseDir,
        ownerId,
      }),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it("does not expose attachments across owners and cascades deletes when a conversation is removed", async () => {
    const ownerId = "guest:owner-3";
    const workspace = await getChatWorkspaceSnapshot({ baseDir, ownerId });
    const attachment = await createChatAttachment({
      baseDir,
      file: new File(["binary"], "image.png", {
        type: "image/png",
      }),
      ownerId,
    });
    const userResult = await createUserChatMessage({
      attachmentIds: [attachment.id],
      baseDir,
      message: "Use this image.",
      ownerId,
      projectId: workspace.projects[0].id,
    });

    await expect(
      getChatAttachmentContent({
        attachmentId: attachment.id,
        baseDir,
        ownerId: "guest:owner-4",
      }),
    ).rejects.toBeInstanceOf(ApiError);

    await deleteChatConversation({
      baseDir,
      conversationId: userResult.conversation.id,
      ownerId,
    });

    await expect(
      getChatAttachmentContent({
        attachmentId: attachment.id,
        baseDir,
        ownerId,
      }),
    ).rejects.toBeInstanceOf(ApiError);
  });
});
