import { z } from "zod";
import { deleteChatProject, renameChatProject } from "@/packages/chat-domain/src";
import { renameChatProjectInputSchema } from "@/packages/contracts/src";
import {
  jsonChatErrorResponse,
  jsonChatResponse,
  resolveChatRouteContext,
} from "../../route-helpers";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    projectId: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const { actor, ownerId } = await resolveChatRouteContext(request);
  const { projectId } = await context.params;

  try {
    const payload = renameChatProjectInputSchema.parse(await request.json());
    const snapshot = await renameChatProject({
      label: payload.label,
      ownerId,
      projectId,
    });

    return jsonChatResponse(snapshot, actor);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonChatResponse(
        { error: error.issues[0]?.message ?? "Project label is invalid." },
        actor,
        { status: 400 },
      );
    }

    return jsonChatErrorResponse({
      actor,
      error,
      fallbackMessage: "Project could not be updated right now.",
    });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const { actor, ownerId } = await resolveChatRouteContext(request);
  const { projectId } = await context.params;

  try {
    const snapshot = await deleteChatProject({
      ownerId,
      projectId,
    });

    return jsonChatResponse(snapshot, actor);
  } catch (error) {
    return jsonChatErrorResponse({
      actor,
      error,
      fallbackMessage: "Project could not be deleted right now.",
    });
  }
}
