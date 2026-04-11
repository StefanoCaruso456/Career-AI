import { z } from "zod";
import { runJobSeekerAgent } from "@/packages/job-seeker-agent/src";
import { searchEmployerCandidates } from "@/packages/recruiter-read-model/src";
import { sendChatMessageInputSchema } from "@/packages/contracts/src";
import {
  createAssistantChatMessage,
  createUserChatMessage,
  summarizeChatAttachmentsForAssistant,
} from "@/packages/chat-domain/src";
import { isEmployerCandidateSearchIntent } from "@/lib/employer/is-candidate-search-intent";
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
    let candidatePanel: Awaited<ReturnType<typeof searchEmployerCandidates>> | null = null;
    let jobsPanel = null;

    if (
      payload.persona === "employer" &&
      isEmployerCandidateSearchIntent(payload.message)
    ) {
      candidatePanel = await searchEmployerCandidates({
        filters: payload.candidateSearchFilters,
        limit: 8,
        prompt: payload.message,
      });
      assistantReply = candidatePanel.assistantMessage;
    } else if (payload.persona !== "employer") {
      const agentResult = await runJobSeekerAgent({
        attachments: attachmentSummaries,
        conversationId: userMessageResult.conversation.id,
        limit: 8,
        messages: userMessageResult.conversation.messages.map((message) => ({
          content: message.content,
          role: message.role,
        })),
        ownerId,
        userQuery: payload.message,
      });
      assistantReply = agentResult.assistantMessage;
      jobsPanel = agentResult.jobsPanel;
    } else {
      assistantReply =
        "Employer mode can help with candidate sourcing requests. Switch back to job seeker mode if you want me to search live jobs.";
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
          candidatePanel,
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
