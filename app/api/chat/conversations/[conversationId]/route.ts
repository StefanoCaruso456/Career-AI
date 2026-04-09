import { z } from "zod";
import { deleteChatConversation, renameChatConversation } from "@/packages/chat-domain/src";
import { renameChatConversationInputSchema } from "@/packages/contracts/src";
import {
  jsonChatErrorResponse,
  jsonChatResponse,
  resolveChatRouteContext,
} from "../../route-helpers";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    conversationId: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const { actor, ownerId } = await resolveChatRouteContext(request);
  const { conversationId } = await context.params;

  try {
    const payload = renameChatConversationInputSchema.parse(await request.json());
    const snapshot = await renameChatConversation({
      conversationId,
      label: payload.label,
      ownerId,
    });

    return jsonChatResponse(snapshot, actor);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonChatResponse(
        { error: error.issues[0]?.message ?? "Conversation label is invalid." },
        actor,
        { status: 400 },
      );
    }

    return jsonChatErrorResponse({
      actor,
      error,
      fallbackMessage: "Conversation could not be updated right now.",
    });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const { actor, ownerId } = await resolveChatRouteContext(request);
  const { conversationId } = await context.params;

  try {
    const snapshot = await deleteChatConversation({
      conversationId,
      ownerId,
    });

    return jsonChatResponse(snapshot, actor);
  } catch (error) {
    return jsonChatErrorResponse({
      actor,
      error,
      fallbackMessage: "Conversation could not be deleted right now.",
    });
  }
}
