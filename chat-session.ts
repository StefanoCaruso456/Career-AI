import { createHmac, timingSafeEqual } from "node:crypto";
import { getAuthSecret } from "@/auth-config";
import { auth } from "@/auth";

const chatOwnerCookieName = "career_ai_chat_owner";
const fallbackChatSessionSecret = "career-ai-chat-dev-secret";

export type ChatActor = {
  actorType: "guest" | "session_user";
  cookieValue?: string;
  ownerId: string;
  sessionId?: string | null;
  userId?: string | null;
};

function getChatSessionSecret() {
  return getAuthSecret() || fallbackChatSessionSecret;
}

function signChatOwnerId(ownerId: string) {
  return createHmac("sha256", getChatSessionSecret()).update(ownerId).digest("base64url");
}

function serializeChatOwnerId(ownerId: string) {
  return `${ownerId}.${signChatOwnerId(ownerId)}`;
}

function parseChatOwnerCookie(cookieValue?: string | null) {
  if (!cookieValue) {
    return null;
  }

  let normalizedCookieValue = cookieValue;

  try {
    normalizedCookieValue = decodeURIComponent(cookieValue);
  } catch {
    normalizedCookieValue = cookieValue;
  }

  const separatorIndex = normalizedCookieValue.lastIndexOf(".");

  if (separatorIndex <= 0) {
    return null;
  }

  const ownerId = normalizedCookieValue.slice(0, separatorIndex);
  const signature = normalizedCookieValue.slice(separatorIndex + 1);
  const expectedSignature = signChatOwnerId(ownerId);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (signatureBuffer.length !== expectedBuffer.length) {
    return null;
  }

  if (!timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return null;
  }

  return ownerId;
}

export function getChatOwnerCookieName() {
  return chatOwnerCookieName;
}

export async function resolveChatActor(existingCookieValue?: string | null): Promise<ChatActor> {
  const session = await auth();
  const normalizedSessionEmail = session?.user?.email?.trim()?.toLowerCase() ?? null;
  const sessionUserId =
    session?.user?.appUserId?.trim() ||
    session?.user?.talentIdentityId?.trim() ||
    normalizedSessionEmail ||
    null;
  const sessionOwnerId =
    session?.user?.talentIdentityId?.trim() ||
    normalizedSessionEmail ||
    null;

  if (sessionOwnerId) {
    return {
      actorType: "session_user",
      ownerId: `user:${sessionOwnerId}`,
      sessionId: sessionUserId ?? `user:${sessionOwnerId}`,
      userId: sessionUserId,
    };
  }

  const existingOwnerId = parseChatOwnerCookie(existingCookieValue);

  if (existingOwnerId) {
    return {
      actorType: "guest",
      ownerId: existingOwnerId,
      sessionId: existingOwnerId,
      userId: null,
    };
  }

  const ownerId = `guest:${crypto.randomUUID()}`;

  return {
    actorType: "guest",
    cookieValue: serializeChatOwnerId(ownerId),
    ownerId,
    sessionId: ownerId,
    userId: null,
  };
}
