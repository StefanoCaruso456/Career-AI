import { z } from "zod";
import { runJobSeekerAgent } from "@/packages/job-seeker-agent/src";
import { searchJobsPanel } from "@/packages/jobs-domain/src";
import { searchEmployerCandidates } from "@/packages/recruiter-read-model/src";
import { getFallbackHomepageReply } from "@/packages/homepage-assistant/src/fallback";
import { sendChatMessageInputSchema } from "@/packages/contracts/src";
import {
  createAssistantChatMessage,
  createUserChatMessage,
  summarizeChatAttachmentsForAssistant,
} from "@/packages/chat-domain/src";
import { isEmployerCandidateSearchIntent } from "@/lib/employer/is-candidate-search-intent";
import { isJobIntent } from "@/lib/jobs/is-job-intent";
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
      try {
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
      } catch (error) {
        console.error("Job seeker agent failed; using deterministic fallback.", error);

        if (isJobIntent(payload.message)) {
          try {
            jobsPanel = await searchJobsPanel({
              conversationId: userMessageResult.conversation.id,
              limit: 8,
              origin: "chat_prompt",
              ownerId,
              prompt: payload.message,
              refresh: true,
            });
            assistantReply = jobsPanel.assistantMessage;
          } catch (fallbackError) {
            console.error("Deterministic job-search fallback failed.", fallbackError);
            assistantReply = "I couldn’t complete the live job search right now. Please try again in a moment.";
            assistantReplyError = true;
          }
        } else {
          assistantReply = getFallbackHomepageReply(payload.message, attachmentSummaries);
        }
      }
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
