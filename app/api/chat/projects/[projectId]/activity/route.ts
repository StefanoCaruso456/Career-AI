import { getChatProjectActivity } from "@/packages/chat-domain/src";
import {
  jsonChatErrorResponse,
  jsonChatResponse,
  resolveChatRouteContext,
} from "../../../route-helpers";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    projectId: string;
  }>;
};

export async function GET(request: Request, context: RouteContext) {
  const { actor, ownerId } = await resolveChatRouteContext(request);
  const { projectId } = await context.params;

  try {
    const activity = await getChatProjectActivity({
      ownerId,
      projectId,
    });

    return jsonChatResponse(activity, actor);
  } catch (error) {
    return jsonChatErrorResponse({
      actor,
      error,
      fallbackMessage: "Project activity could not be loaded right now.",
    });
  }
}
