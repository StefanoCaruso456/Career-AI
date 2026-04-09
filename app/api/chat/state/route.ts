import { getChatWorkspaceSnapshot } from "@/packages/chat-domain/src";
import {
  jsonChatErrorResponse,
  jsonChatResponse,
  resolveChatRouteContext,
} from "../route-helpers";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { actor, ownerId } = await resolveChatRouteContext(request);

  try {
    const snapshot = await getChatWorkspaceSnapshot({ ownerId });

    return jsonChatResponse(snapshot, actor);
  } catch (error) {
    return jsonChatErrorResponse({
      actor,
      error,
      fallbackMessage: "Chat history could not be loaded right now.",
    });
  }
}
