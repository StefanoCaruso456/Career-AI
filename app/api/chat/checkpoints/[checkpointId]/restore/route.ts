import { restoreChatCheckpoint } from "@/packages/chat-domain/src";
import {
  jsonChatErrorResponse,
  jsonChatResponse,
  resolveChatRouteContext,
} from "../../../route-helpers";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    checkpointId: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { actor, ownerId } = await resolveChatRouteContext(request);
  const { checkpointId } = await context.params;

  try {
    const result = await restoreChatCheckpoint({
      checkpointId,
      ownerId,
    });

    return jsonChatResponse(result, actor);
  } catch (error) {
    return jsonChatErrorResponse({
      actor,
      error,
      fallbackMessage: "Checkpoint could not be restored right now.",
    });
  }
}
