import { z } from "zod";
import { DEFAULT_LATEST_JOBS_PROMPT } from "@/packages/contracts/src";
import {
  createAssistantChatMessage,
  createUserChatMessage,
} from "@/packages/chat-domain/src";
import { browseLatestJobsPanel } from "@/packages/jobs-domain/src";
import {
  jsonChatErrorResponse,
  jsonChatResponse,
  resolveChatRouteContext,
} from "../route-helpers";

export const runtime = "nodejs";

const browseLatestJobsChatRequestSchema = z.object({
  clientRequestId: z.string().trim().min(1).optional(),
  conversationId: z.string().trim().min(1).nullable().optional(),
  limit: z.number().int().positive().max(24).optional(),
  projectId: z.string().trim().min(1),
});

export async function POST(request: Request) {
  const { actor, ownerId } = await resolveChatRouteContext(request);

  try {
    const payload = browseLatestJobsChatRequestSchema.parse(await request.json());
    const userMessageResult = await createUserChatMessage({
      attachmentIds: [],
      clientRequestId: payload.clientRequestId,
      conversationId: payload.conversationId ?? null,
      message: DEFAULT_LATEST_JOBS_PROMPT,
      ownerId,
      projectId: payload.projectId,
    });

    const jobsPanel = await browseLatestJobsPanel({
      conversationId: userMessageResult.conversation.id,
      limit: payload.limit,
      ownerId,
      refresh: true,
    });

    if (userMessageResult.assistantMessage) {
      return jsonChatResponse(
        {
          assistantMessage: userMessageResult.assistantMessage,
          conversation: userMessageResult.conversation,
          jobsPanel,
          userMessage: userMessageResult.userMessage,
          workspace: userMessageResult.workspace,
        },
        actor,
      );
    }

    const assistantMessageResult = await createAssistantChatMessage({
      content: jobsPanel.assistantMessage,
      conversationId: userMessageResult.conversation.id,
      ownerId,
      replyToMessageId: userMessageResult.userMessage.id,
    });

    return jsonChatResponse(
      {
        assistantMessage: assistantMessageResult.assistantMessage,
        conversation: assistantMessageResult.conversation,
        jobsPanel,
        userMessage: userMessageResult.userMessage,
        workspace: assistantMessageResult.workspace ?? userMessageResult.workspace,
      },
      actor,
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return jsonChatResponse(
        { error: error.issues[0]?.message ?? "Latest jobs request is invalid." },
        actor,
        { status: 400 },
      );
    }

    return jsonChatErrorResponse({
      actor,
      error,
      fallbackMessage: "Latest jobs could not be loaded right now.",
    });
  }
}
