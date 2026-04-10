import { z } from "zod";
import { getFallbackHomepageReply } from "@/packages/homepage-assistant/src";
import { generateHomepageAssistantReply } from "@/packages/homepage-assistant/src";
import { sendChatMessageInputSchema } from "@/packages/contracts/src";
import {
  createAssistantChatMessage,
  createUserChatMessage,
  summarizeChatAttachmentsForAssistant,
} from "@/packages/chat-domain/src";
import {
  jsonChatErrorResponse,
  jsonChatResponse,
  resolveChatRouteContext,
} from "./route-helpers";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const { actor, ownerId } = await resolveChatRouteContext(request);

  try {
    const payload = sendChatMessageInputSchema.parse(await request.json());
    const userMessageResult = await createUserChatMessage({
      attachmentIds: payload.attachmentIds,
      clientRequestId: payload.clientRequestId,
      conversationId: payload.conversationId ?? null,
      message: payload.message,
      ownerId,
      projectId: payload.projectId,
    });

    if (userMessageResult.assistantMessage) {
      return jsonChatResponse(
        {
          assistantMessage: userMessageResult.assistantMessage,
          conversation: userMessageResult.conversation,
          userMessage: userMessageResult.userMessage,
          workspace: userMessageResult.workspace,
        },
        actor,
      );
    }

    const attachmentSummaries = summarizeChatAttachmentsForAssistant(
      userMessageResult.userMessage.attachments,
    );
    let assistantReply: string;
    let assistantReplyError = false;

    try {
      assistantReply = await generateHomepageAssistantReply(payload.message, attachmentSummaries);
    } catch (error) {
      console.error("Chat reply generation fell back to the deterministic assistant reply", error);
      assistantReply = getFallbackHomepageReply(payload.message, attachmentSummaries);
      assistantReplyError = true;
    }

    const assistantMessageResult = await createAssistantChatMessage({
      content: assistantReply,
      conversationId: userMessageResult.conversation.id,
      error: assistantReplyError,
      ownerId,
      replyToMessageId: userMessageResult.userMessage.id,
    });

    return jsonChatResponse(
      {
        assistantMessage: assistantMessageResult.assistantMessage,
        conversation: assistantMessageResult.conversation,
        userMessage: userMessageResult.userMessage,
        workspace: assistantMessageResult.workspace ?? userMessageResult.workspace,
      },
      actor,
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonChatResponse(
        { error: error.issues[0]?.message ?? "Please enter a message before sending." },
        actor,
        { status: 400 },
      );
    }

    return jsonChatErrorResponse({
      actor,
      error,
      fallbackMessage: "The assistant could not generate a reply right now.",
    });
  }
}
