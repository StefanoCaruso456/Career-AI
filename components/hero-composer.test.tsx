import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { AnchorHTMLAttributes, PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HeroComposer } from "@/components/hero-composer";
import type { ChatConversation, ChatMessage, ChatProject, ChatWorkspaceSnapshot } from "@/packages/contracts/src";

const useChatAttachmentDraftsMock = vi.fn();

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/components/attachment-button", () => ({
  AttachmentButton: ({ className, onClick }: { className?: string; onClick?: () => void }) => (
    <button className={className} onClick={onClick} type="button">
      Attach
    </button>
  ),
}));

vi.mock("@/components/chat-message-attachments", () => ({
  ChatMessageAttachments: () => null,
}));

vi.mock("@/components/file-upload-dropzone", () => ({
  FileUploadDropzone: ({ children }: PropsWithChildren) => <>{children}</>,
}));

vi.mock("@/components/prompt-composer-attachments", () => ({
  PromptComposerAttachments: () => null,
}));

vi.mock("@/components/use-chat-attachment-drafts", () => ({
  useChatAttachmentDrafts: () => useChatAttachmentDraftsMock(),
}));

function createWorkspaceSnapshot(projects: ChatProject[], conversations: ChatConversation[] = []): ChatWorkspaceSnapshot {
  return {
    conversations,
    projects,
  };
}

function createProject(id: string, label: string): ChatProject {
  return {
    createdAt: "2026-04-10T00:00:00.000Z",
    id,
    label,
    updatedAt: "2026-04-10T00:00:00.000Z",
  };
}

function createMessage(id: string, role: ChatMessage["role"], content: string): ChatMessage {
  return {
    attachments: [],
    content,
    createdAt: "2026-04-10T00:00:00.000Z",
    id,
    role,
  };
}

function createConversation(id: string, projectId: string, messages: ChatMessage[]): ChatConversation {
  return {
    createdAt: "2026-04-10T00:00:00.000Z",
    id,
    label: "New conversation",
    labelSource: "auto",
    messages,
    projectId,
    updatedAt: "2026-04-10T00:00:00.000Z",
  };
}

function createJsonResponse(body: unknown, init?: { ok?: boolean; status?: number }) {
  return {
    json: async () => body,
    ok: init?.ok ?? true,
    status: init?.status ?? 200,
  };
}

function createDeferredValue<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });

  return { promise, resolve };
}

describe("HeroComposer", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useChatAttachmentDraftsMock.mockReturnValue({
      addFiles: vi.fn(),
      attachments: [],
      clearAttachments: vi.fn(),
      clearSelectionError: vi.fn(),
      detachAttachments: vi.fn(() => []),
      removeAttachment: vi.fn(),
      releaseDetachedAttachments: vi.fn(),
      restoreAttachments: vi.fn(),
      retryAttachment: vi.fn(),
      selectionError: null,
    });

    Object.defineProperty(window, "requestAnimationFrame", {
      configurable: true,
      value: (callback: FrameRequestCallback) => window.setTimeout(() => callback(0), 0),
    });
    Object.defineProperty(window, "cancelAnimationFrame", {
      configurable: true,
      value: (handle: number) => window.clearTimeout(handle),
    });
    Object.defineProperty(HTMLElement.prototype, "scrollTo", {
      configurable: true,
      value: vi.fn(),
    });

    class ResizeObserverMock {
      disconnect() {}
      observe() {}
      unobserve() {}
    }

    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
  });

  it("refreshes the workspace and retries when the server rejects a stale project id", async () => {
    const staleProject = createProject("project_stale", "Verified profile");
    const freshProject = createProject("project_fresh", "Verified profile");
    const successfulConversation = createConversation("conversation_123", freshProject.id, [
      createMessage("message_user_123", "user", "How long does it take?"),
      createMessage("message_assistant_123", "assistant", "Most candidates finish the first pass in a few minutes."),
    ]);

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createJsonResponse(createWorkspaceSnapshot([staleProject])))
      .mockResolvedValueOnce(
        createJsonResponse(
          { error: "Project was not found.", errorCode: "NOT_FOUND" },
          { ok: false, status: 404 },
        ),
      )
      .mockResolvedValueOnce(createJsonResponse(createWorkspaceSnapshot([freshProject])))
      .mockResolvedValueOnce(
        createJsonResponse({
          assistantMessage: successfulConversation.messages[1],
          conversation: successfulConversation,
          userMessage: successfulConversation.messages[0],
        }),
      );

    vi.stubGlobal("fetch", fetchMock);

    render(<HeroComposer />);

    const composer = await screen.findByRole("textbox", { name: "Message composer" });

    await waitFor(() => {
      expect(composer).not.toBeDisabled();
    });

    fireEvent.change(composer, {
      target: {
        value: "How long does it take?",
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(4);
    });

    const firstSendBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body ?? "{}")) as {
      projectId?: string;
    };
    const secondSendBody = JSON.parse(String(fetchMock.mock.calls[3]?.[1]?.body ?? "{}")) as {
      projectId?: string;
    };

    expect(firstSendBody.projectId).toBe("project_stale");
    expect(secondSendBody.projectId).toBe("project_fresh");
    expect(await screen.findByText("Most candidates finish the first pass in a few minutes.")).toBeInTheDocument();
    expect(screen.queryByText("Project was not found.")).not.toBeInTheDocument();
  });

  it("keeps the composer editable while a reply is pending without allowing a second send", async () => {
    const project = createProject("project_verified_profile", "Verified profile");
    const firstConversation = createConversation("conversation_123", project.id, [
      createMessage("message_user_123", "user", "How does the agent help me get hired faster?"),
      createMessage(
        "message_assistant_123",
        "assistant",
        "You can keep drafting while I finish this answer.",
      ),
    ]);
    const pendingReply = createDeferredValue<
      ReturnType<typeof createJsonResponse>
    >();

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createJsonResponse(createWorkspaceSnapshot([project])))
      .mockImplementationOnce(() => pendingReply.promise);

    vi.stubGlobal("fetch", fetchMock);

    render(<HeroComposer />);

    const composer = await screen.findByRole("textbox", { name: "Message composer" });

    await waitFor(() => {
      expect(composer).not.toBeDisabled();
    });

    fireEvent.change(composer, {
      target: {
        value: "How does the agent help me get hired faster?",
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    expect(await screen.findByRole("button", { name: "Generating reply" })).toBeDisabled();
    expect(composer).not.toBeDisabled();
    expect(composer).toHaveValue("");

    fireEvent.change(composer, {
      target: {
        value: "Can it help me prioritize what to verify next?",
      },
    });

    expect(composer).toHaveValue("Can it help me prioritize what to verify next?");

    fireEvent.keyDown(composer, { key: "Enter" });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    pendingReply.resolve(
      createJsonResponse({
        assistantMessage: firstConversation.messages[1],
        conversation: firstConversation,
        userMessage: firstConversation.messages[0],
      }),
    );

    expect(
      await screen.findByText("You can keep drafting while I finish this answer."),
    ).toBeInTheDocument();
    expect(composer).toHaveValue("Can it help me prioritize what to verify next?");
    expect(await screen.findByRole("button", { name: "Send message" })).not.toBeDisabled();
  });
});
