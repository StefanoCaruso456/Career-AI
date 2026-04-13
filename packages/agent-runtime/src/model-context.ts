import type { AgentContext } from "./context";

export type AgentConversationMessage = {
  content: string;
  role: "assistant" | "user";
};

const DEFAULT_HISTORY_CHAR_BUDGET = 1_600;
const DEFAULT_HISTORY_MESSAGE_LIMIT = 6;

function normalizeText(value: string | null | undefined) {
  const normalized = value?.trim();

  return normalized ? normalized : null;
}

function trimToLength(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  if (maxLength <= 1) {
    return value.slice(0, maxLength);
  }

  return `${value.slice(0, maxLength - 1)}…`;
}

function buildIdentityLines(agentContext: AgentContext) {
  const organizationLines =
    agentContext.organizationContext?.primaryOrganization
      ? [
          `organization_id: ${agentContext.organizationContext.primaryOrganization.organizationId}`,
          `organization_name: ${agentContext.organizationContext.primaryOrganization.organizationName}`,
          `organization_role: ${agentContext.organizationContext.primaryOrganization.role}`,
          `organization_membership_count: ${agentContext.organizationContext.activeMembershipCount}`,
        ]
      : [];

  switch (agentContext.actor.kind) {
    case "authenticated_user":
      return [
        `actor_kind: ${agentContext.actor.kind}`,
        `actor_id: ${agentContext.actor.id}`,
        `name: ${agentContext.actor.name ?? "unknown"}`,
        `role_type: ${agentContext.roleType ?? "none"}`,
        `preferred_persona: ${agentContext.preferredPersona ?? "none"}`,
        ...organizationLines,
      ];
    case "guest_user":
      return [
        `actor_kind: ${agentContext.actor.kind}`,
        "identity: guest_session",
        `preferred_persona: ${agentContext.preferredPersona ?? "none"}`,
      ];
    case "internal_service":
      return [
        `actor_kind: ${agentContext.actor.kind}`,
        `service_name: ${agentContext.actor.serviceName}`,
        `service_actor_id: ${agentContext.actor.serviceActorId}`,
        `role_type: ${agentContext.roleType ?? "none"}`,
        `preferred_persona: ${agentContext.preferredPersona ?? "none"}`,
        ...organizationLines,
      ];
    default:
      return [];
  }
}

function buildRecentHistoryBlock(args: {
  currentMessage?: string | null;
  historyCharBudget: number;
  historyMessageLimit: number;
  messages?: AgentConversationMessage[] | null;
}) {
  const normalizedMessages = (args.messages ?? [])
    .map((message) => {
      const content = normalizeText(message.content);

      if (!content) {
        return null;
      }

      return {
        content,
        role: message.role,
      };
    })
    .filter((message): message is AgentConversationMessage => Boolean(message));

  const currentMessage = normalizeText(args.currentMessage);

  if (
    currentMessage &&
    normalizedMessages.length > 0 &&
    normalizedMessages[normalizedMessages.length - 1]?.role === "user" &&
    normalizedMessages[normalizedMessages.length - 1]?.content === currentMessage
  ) {
    normalizedMessages.pop();
  }

  if (normalizedMessages.length === 0) {
    return null;
  }

  const selectedMessages: AgentConversationMessage[] = [];
  let remainingBudget = Math.max(120, args.historyCharBudget);

  for (let index = normalizedMessages.length - 1; index >= 0; index -= 1) {
    if (selectedMessages.length >= args.historyMessageLimit) {
      break;
    }

    const candidate = normalizedMessages[index];

    if (!candidate) {
      continue;
    }

    const reservedPrefixLength = candidate.role.length + 8;
    const maxContentLength = Math.max(40, remainingBudget - reservedPrefixLength);
    const trimmedContent = trimToLength(candidate.content, maxContentLength);
    const candidateLength = trimmedContent.length + reservedPrefixLength;

    if (selectedMessages.length > 0 && candidateLength > remainingBudget) {
      continue;
    }

    selectedMessages.unshift({
      content: trimmedContent,
      role: candidate.role,
    });
    remainingBudget -= candidateLength;

    if (remainingBudget <= 0) {
      break;
    }
  }

  if (selectedMessages.length === 0) {
    return null;
  }

  return [
    "Recent chat history:",
    ...selectedMessages.map((message) => `- ${message.role}: ${message.content}`),
  ].join("\n");
}

export function buildAgentModelContext(args: {
  agentContext?: AgentContext | null;
  currentMessage?: string | null;
  historyCharBudget?: number;
  historyMessageLimit?: number;
  messages?: AgentConversationMessage[] | null;
}) {
  try {
    const sections: string[] = [];

    if (args.agentContext) {
      sections.push(["User context:", ...buildIdentityLines(args.agentContext)].join("\n"));
    }

    const recentHistory = buildRecentHistoryBlock({
      currentMessage: args.currentMessage ?? null,
      historyCharBudget: args.historyCharBudget ?? DEFAULT_HISTORY_CHAR_BUDGET,
      historyMessageLimit: args.historyMessageLimit ?? DEFAULT_HISTORY_MESSAGE_LIMIT,
      messages: args.messages,
    });

    if (recentHistory) {
      sections.push(recentHistory);
    }

    return sections.length > 0 ? sections.join("\n\n") : null;
  } catch {
    return null;
  }
}
