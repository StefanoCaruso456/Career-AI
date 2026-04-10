import { z } from "zod";
import { createChatCheckpoint } from "@/packages/chat-domain/src";
import {
  jsonChatErrorResponse,
  jsonChatResponse,
  resolveChatRouteContext,
} from "../../../route-helpers";

export const runtime = "nodejs";

const checkpointRequestSchema = z.object({
  conversationId: z.string().trim().min(1).nullable().optional(),
  title: z.string().trim().max(120).optional(),
});

type RouteContext = {
  params: Promise<{
    projectId: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { actor, ownerId } = await resolveChatRouteContext(request);
  const { projectId } = await context.params;

  try {
    const payload = checkpointRequestSchema.parse(await request.json().catch(() => ({})));
    const result = await createChatCheckpoint({
      conversationId: payload.conversationId ?? null,
      ownerId,
      projectId,
      title: payload.title,
    });

    return jsonChatResponse(result, actor);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonChatResponse(
        {
          error: error.issues[0]?.message ?? "Checkpoint details are invalid.",
        },
        actor,
        { status: 400 },
      );
    }

    return jsonChatErrorResponse({
      actor,
      error,
      fallbackMessage: "Checkpoint could not be saved right now.",
    });
  }
}
