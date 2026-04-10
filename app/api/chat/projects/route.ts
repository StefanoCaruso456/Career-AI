import { z } from "zod";
import { createChatProject } from "@/packages/chat-domain/src";
import { createChatProjectInputSchema } from "@/packages/contracts/src";
import {
  jsonChatErrorResponse,
  jsonChatResponse,
  resolveChatRouteContext,
} from "../route-helpers";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const { actor, ownerId } = await resolveChatRouteContext(request);

  try {
    const payload = createChatProjectInputSchema.parse(await request.json().catch(() => ({})));
    const snapshot = await createChatProject({
      label: payload.label,
      ownerId,
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
      fallbackMessage: "Project could not be created right now.",
    });
  }
}
