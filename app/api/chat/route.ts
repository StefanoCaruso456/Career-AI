import { z } from "zod";
import {
  requiresCurrentExternalSearch,
  runJobSeekerAgent,
} from "@/packages/job-seeker-agent/src";
import { searchJobsPanel } from "@/packages/jobs-domain/src";
import { searchEmployerCandidates } from "@/packages/recruiter-read-model/src";
import { generateHomepageAssistantReply } from "@/packages/homepage-assistant/src";
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
  traceSpan,
  updateRequestTraceContext,
  withTracedRoute,
} from "./route-helpers";

export const runtime = "nodejs";

async function handleChatPost(request: Request) {
  const routeContext = await traceSpan(
    {
      input: {
        has_cookie_header: Boolean(request.headers.get("cookie")),
      },
      name: "auth.session.lookup",
      output: (context: Awaited<ReturnType<typeof resolveChatRouteContext>>) => ({
        actor_type: context.actor.actorType,
        owner_id: context.ownerId,
        session_id: context.sessionId,
        user_id: context.userId,
      }),
      tags: ["stage:auth"],
      type: "function",
    },
    () => resolveChatRouteContext(request),
  );
  const { actor, ownerId } = routeContext;

  updateRequestTraceContext({
    actorType: actor.actorType,
    ownerId,
    sessionId: routeContext.sessionId,
    userId: routeContext.userId,
  });

  try {
    const payload = await traceSpan(
      {
        input: {
          content_length: request.headers.get("content-length"),
          content_type: request.headers.get("content-type"),
        },
        name: "http.parse.json",
        output: (parsedPayload: z.infer<typeof sendChatMessageInputSchema>) => ({
          attachment_count: parsedPayload.attachmentIds.length,
          client_request_id: parsedPayload.clientRequestId ?? null,
          conversation_id: parsedPayload.conversationId ?? null,
          message_length: parsedPayload.message.length,
          persona: parsedPayload.persona,
          project_id: parsedPayload.projectId,
        }),
        tags: ["stage:parse"],
        type: "function",
      },
      async () => sendChatMessageInputSchema.parse(await request.json()),
    );
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
    const requiresFreshExternalInfo =
      payload.persona !== "employer" && requiresCurrentExternalSearch(payload.message);
    const shouldUseJobSeekerAgent =
      payload.persona !== "employer" &&
      (isJobIntent(payload.message) || requiresFreshExternalInfo);
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
    } else if (!shouldUseJobSeekerAgent) {
      assistantReply = await generateHomepageAssistantReply(
        payload.message,
        attachmentSummaries,
      );
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

        if (requiresFreshExternalInfo) {
          assistantReply =
            "I couldn’t complete a grounded live web search right now. Please try again in a moment.";
          assistantReplyError = true;
        } else if (isJobIntent(payload.message)) {
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
          assistantReply = await generateHomepageAssistantReply(
            payload.message,
            attachmentSummaries,
          );
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

export const POST = withTracedRoute(
  {
    name: "http.route.chat.post",
    tags: ["route:chat"],
    type: "task",
  },
  handleChatPost,
);
