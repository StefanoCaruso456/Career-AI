import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createManualChatCheckpoint,
  createPersistentAssistantChatMessage,
  createPersistentChatAttachmentRecord,
  createPersistentUserChatMessage,
  getPersistentChatProjectActivity,
  getPersistentChatWorkspaceSnapshot,
  restorePersistentChatCheckpoint,
} from "@/packages/persistence/src";
import { installTestDatabase, resetTestDatabase } from "./test-helpers";

describe("chat repository", () => {
  beforeEach(async () => {
    await resetTestDatabase();
    await installTestDatabase();
  });

  afterEach(async () => {
    await resetTestDatabase();
  });

  it("persists workspace state, extracted memory, checkpoints, and audit events", async () => {
    const ownerId = "user:persistence-owner";
    const initialWorkspace = await getPersistentChatWorkspaceSnapshot({ ownerId });
    const projectId = initialWorkspace.projects[0]?.id;

    expect(initialWorkspace.projects.map((project) => project.label)).toEqual([
      "Verified profile",
      "Career story",
      "Hiring signals",
    ]);
    expect(projectId).toBeTruthy();

    const attachment = await createPersistentChatAttachmentRecord({
      extension: "pdf",
      mimeType: "application/pdf",
      originalName: "career-proof.pdf",
      ownerId,
      previewKind: "pdf",
      sizeBytes: 2048,
      storageKey: "checksum/attachment.pdf",
    });

    const userResult = await createPersistentUserChatMessage({
      attachmentIds: [attachment.attachment.id],
      clientRequestId: "req-chat-1",
      message: "Help me build trust with recruiters using my Career ID.",
      ownerId,
      projectId: projectId!,
    });
    const assistantResult = await createPersistentAssistantChatMessage({
      content:
        "Your Career ID gives recruiters a verified view of your identity, work history, and proof.",
      conversationId: userResult.conversation.id,
      ownerId,
      replyToMessageId: userResult.userMessage.id,
    });

    expect(assistantResult.workspace.projectPersistence[projectId!]?.lastSavedAt).toBeTruthy();
    expect(assistantResult.workspace.persistence.checkpointCount).toBeGreaterThan(0);

    const activity = await getPersistentChatProjectActivity({
      ownerId,
      projectId: projectId!,
    });

    expect(activity.events.some((event) => event.eventType === "message.created")).toBe(true);
    expect(activity.events.some((event) => event.eventType === "message.completed")).toBe(true);
    expect(activity.events.some((event) => event.eventType === "checkpoint.created")).toBe(true);
    expect(activity.memoryRecords.some((memory) => memory.memoryType === "summary")).toBe(true);
  });

  it("restores a project from a saved checkpoint", async () => {
    const ownerId = "user:restore-owner";
    const initialWorkspace = await getPersistentChatWorkspaceSnapshot({ ownerId });
    const projectId = initialWorkspace.projects[0]?.id;

    const firstTurn = await createPersistentUserChatMessage({
      attachmentIds: [],
      clientRequestId: "req-restore-1",
      message: "Document my verified profile.",
      ownerId,
      projectId: projectId!,
    });

    await createPersistentAssistantChatMessage({
      content: "I will treat your verified profile as the baseline for recruiter trust.",
      conversationId: firstTurn.conversation.id,
      ownerId,
      replyToMessageId: firstTurn.userMessage.id,
    });

    const checkpointResult = await createManualChatCheckpoint({
      conversationId: firstTurn.conversation.id,
      ownerId,
      projectId: projectId!,
      title: "Before extra changes",
    });

    await createPersistentUserChatMessage({
      attachmentIds: [],
      clientRequestId: "req-restore-2",
      conversationId: firstTurn.conversation.id,
      message: "This new request should disappear after restore.",
      ownerId,
      projectId: projectId!,
    });

    const restored = await restorePersistentChatCheckpoint({
      checkpointId: checkpointResult.checkpoint.id,
      ownerId,
    });

    const restoredConversation = restored.workspace.conversations.find(
      (conversation) => conversation.id === firstTurn.conversation.id,
    );

    expect(
      restoredConversation?.messages.some((message) =>
        message.content.includes("should disappear after restore"),
      ),
    ).toBe(false);
    expect(restored.workspace.persistence.checkpointCount).toBeGreaterThan(0);
  });
});
